import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import type { DshAgent, DshSkillCandidate, DshSkillLookupOptions, DshSkillRegistration, DshSkillRegistry } from "./dsh-types.js";
import { scopeOf, scopeParentOf } from "./native-scope.js";
import type { DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";

export const DSMM_SKILL_NAMES = [
  "brainstorming",
  "writing-plans",
  "requesting-code-review",
  "receiving-code-review",
  "subagent-driven-development",
  "dispatching-parallel-agents",
  "remove-ai-slops"
] as const;
export const MVP_SKILL_NAMES = DSMM_SKILL_NAMES;
export type DsmmSkillName = (typeof DSMM_SKILL_NAMES)[number];
export const DSMM_ON_DEMAND_SKILL_NAMES = ["debugging"] as const;
export type DsmmAvailableSkillName = DsmmSkillName | (typeof DSMM_ON_DEMAND_SKILL_NAMES)[number];
export type MvpSkillName = DsmmSkillName;

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Packaged metadata only; discovery never reads SKILL.md. */
export const DSMM_SKILL_DESCRIPTIONS: Record<DsmmAvailableSkillName, string> = {
  brainstorming: "Use before creative or materially ambiguous work to clarify outcomes, constraints, risks, and an implementation direction.",
  "writing-plans": "Use for complex behavior work or a migration whose dependencies and risks require durable coordination before editing code.",
  "requesting-code-review": "Use when implementation risk, uncertainty, user requirement or integration complexity benefits from focused independent review.",
  "receiving-code-review": "Use when reviewer feedback arrives for dsmm work; verify findings before changing code.",
  "subagent-driven-development": "Use when executing an approved plan has independent bounded work that benefits from DSH subagent delegation.",
  "dispatching-parallel-agents": "Use in dsmm deepwork mode when two or more tasks can run independently without shared state or sequential dependencies.",
  "remove-ai-slops": "Use in dsmm deepwork mode to remove AI-generated code slop without changing behavior.",
  debugging: "Use on demand for real runtime failures, flaky tests and DAP-assisted investigation; this is not one of the seven automatically injected core workflow skills."
};
export const BUNDLED_SKILL_RANK = 600;

export function bundledSkillMetadata(name: DsmmAvailableSkillName): Omit<DshSkillRegistration, "content"> {
  const directory = join(packageRoot, "skills", name);
  return { name, description: DSMM_SKILL_DESCRIPTIONS[name], source: "bundled", provider: "dsmm",
    resourceBase: { kind: "directory", path: directory }, invocation: { modelInvocable: true, userInvocable: true } };
}

export function parseSkillMarkdown(markdown: string): { name: string; description: string; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(markdown);
  if (match === null) throw new Error("skill markdown must start with YAML frontmatter");

  const frontmatter = match[1];
  const name = /^name:\s*(.+)$/mu.exec(frontmatter)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  const description = /^description:\s*(.+)$/mu.exec(frontmatter)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  if (name === undefined || description === undefined) throw new Error("skill frontmatter needs name and description");

  return { name, description, content: match[2].replace(/^\r?\n/u, "") };
}

export function enabledSkillNames(settings: DsmmSettings): readonly DsmmSkillName[] {
  return DSMM_SKILL_NAMES.filter((name) => settings.skills[name]);
}

export async function readBundledSkill(name: DsmmAvailableSkillName, signal: AbortSignal): Promise<DshSkillRegistration> {
  const parsed = parseSkillMarkdown(await readFile(join(packageRoot, "skills", name, "SKILL.md"), { encoding: "utf8", signal }));
  if (parsed.name !== name) throw new Error(`dsmm bundled skill name mismatch: ${name}`);
  return { ...bundledSkillMetadata(name), content: parsed.content };
}

export interface BundledSkillProviderOptions {
  agent: DshAgent;
  controller: DeepworkModeController;
  getSettings: DsmmSettingsGetter;
  /** Body I/O seam for deterministic cancellation/race contract tests. */
  load?: typeof readBundledSkill;
}

/** Exact Agent layer, native revision cache, metadata-only ancestor avoidance. */
export function registerBundledSkills(ctx: Context, skills: DshSkillRegistry, options: BundledSkillProviderOptions): { dispose(): void; invalidate(): void } {
  const agentScope = scopeOf(ctx);
  if (agentScope !== options.agent) throw new Error("dsmm refuses skills outside the exact Agent scope");
  let generation = 0;
  let invalidate = (): void => {};
  // The broadcast spans registries; fence in-flight work, not cached locators.
  const stopChange = ctx.on("skills/change", () => { generation += 1; }, { global: true });
  const names = (): readonly DsmmAvailableSkillName[] => {
    const settings = options.getSettings(options.agent);
    return options.controller.active(options.agent, settings.defaultActive) ? [...enabledSkillNames(settings), ...DSMM_ON_DEMAND_SKILL_NAMES] : [];
  };
  let disposeProvider: () => void;
  try {
    disposeProvider = skills.registerProvider((control) => {
      invalidate = control.invalidate;
      const signalFor = (lookup: DshSkillLookupOptions): AbortSignal => lookup.signal === undefined ? control.signal : AbortSignal.any([lookup.signal, control.signal]);
      const ancestor = (lookup: DshSkillLookupOptions, signal: AbortSignal) => {
        signal.throwIfAborted();
        const parent = scopeParentOf(agentScope);
        return skills.snapshot({ ...(parent === undefined ? {} : { scope: parent }), cwd: lookup.cwd, signal });
      };
      const occupied = (snapshot: Awaited<ReturnType<DshSkillRegistry["snapshot"]>>, name: string): boolean =>
        snapshot.skills.some((skill) => skill.name === name && skill.provider !== "dsmm");
      return {
        name: "dsmm",
        async list(lookup) {
          const signal = signalFor(lookup), current = generation, parent = scopeParentOf(agentScope);
          signal.throwIfAborted();
          const enabled = names();
          if (enabled.length === 0) return [];
          const snapshot = await ancestor(lookup, signal);
          signal.throwIfAborted();
          if (!snapshot.complete || generation !== current || scopeParentOf(agentScope) !== parent) return { candidates: [], complete: false };
          return enabled.filter((name) => !occupied(snapshot, name)).map((name): DshSkillCandidate => ({
            ...bundledSkillMetadata(name), rank: BUNDLED_SKILL_RANK, locator: { name, parent }
          }));
        },
        async get(candidate, lookup) {
          const signal = signalFor(lookup), current = generation;
          signal.throwIfAborted();
          const name = names().find((name) => name === candidate.name);
          const locator = candidate.locator;
          if (name === undefined || typeof locator !== "object" || locator === null
            || !("parent" in locator) || locator.parent !== scopeParentOf(agentScope)) return undefined;
          const snapshot = await ancestor(lookup, signal);
          signal.throwIfAborted();
          if (!snapshot.complete || occupied(snapshot, name) || generation !== current || locator.parent !== scopeParentOf(agentScope)) return undefined;
          const body = await (options.load ?? readBundledSkill)(name, signal);
          signal.throwIfAborted();
          if (generation !== current || !names().includes(name) || locator.parent !== scopeParentOf(agentScope)) return undefined;
          const after = await ancestor(lookup, signal);
          signal.throwIfAborted();
          return after.complete && !occupied(after, name) && generation === current && locator.parent === scopeParentOf(agentScope) ? body : undefined;
        }
      };
    });
  } catch (error) {
    stopChange();
    throw error;
  }
  const dispose = (): void => {
    stopChange(); disposeProvider();
  };
  return { dispose, invalidate };
}
