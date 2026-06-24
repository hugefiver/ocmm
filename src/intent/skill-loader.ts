/**
 * Loads v1 workflow skills from disk.
 *
 * Reads skills/v1/{brainstorming,writing-plans,subagent-driven-development,
 * requesting-code-review,receiving-code-review}/SKILL.md and concatenates
 * them into a single string for injection via the system.transform hook.
 *
 * In v1 workflow, the config hook also registers skills/v1 as an OpenCode
 * skill path so these injected skills can be invoked with slash commands.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { log } from "../shared/logger.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_SKILLS_ROOT = join(HERE, "..", "..", "skills")

export type SharedSkillSource =
  | string
  | {
      path: string
      recursive?: boolean
      glob?: string
    }

export type SharedSkill = {
  name: string
  description: string
  path: string
}

export type SkillCommand = SharedSkill & {
  template: string
  agent?: string
  model?: string
  subtask?: boolean
}

type SkillMetadata = {
  name?: string
  description?: string
  agent?: string
  model?: string
  subtask?: boolean
}

export const V1_SKILL_DIRS = [
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "requesting-code-review",
  "receiving-code-review",
] as const

export function loadV1Skills(
  rootDir: string = DEFAULT_SKILLS_ROOT,
): string {
  const parts: string[] = []
  for (const dir of V1_SKILL_DIRS) {
    const skillPath = join(rootDir, "v1", dir, "SKILL.md")
    try {
      const content = readFileSync(skillPath, "utf8")
      parts.push(content)
    } catch {
      log.warn(`v1 skill missing: ${dir}/SKILL.md (root=${rootDir})`)
    }
  }
  return parts.join("\n\n---\n\n")
}

export function loadV1SkillCommands(args: {
  rootDir?: string
  disable?: readonly string[]
} = {}): SkillCommand[] {
  const rootDir = args.rootDir ?? DEFAULT_SKILLS_ROOT
  const disable = new Set(args.disable ?? [])
  const commands: SkillCommand[] = []
  for (const dir of V1_SKILL_DIRS) {
    const skillDir = join(rootDir, "v1", dir)
    const command = readSkillCommand(skillDir, "ocmm deepwork")
    if (!command) continue
    if (matchesName(disable, command, skillDir)) continue
    commands.push(command)
  }
  return commands.sort((a, b) => a.name.localeCompare(b.name))
}

export function loadSharedSkills(args: {
  rootDir?: string
  sources?: readonly SharedSkillSource[]
  enable?: readonly string[]
  disable?: readonly string[]
} = {}): SharedSkill[] {
  const skillDirs = new Map<string, string>()
  const defaultRoot = args.rootDir ?? DEFAULT_SKILLS_ROOT
  for (const dir of discoverSkillDirs(defaultRoot, {
    recursive: false,
    excludeNames: new Set(["v1"]),
  })) {
    skillDirs.set(dir, dir)
  }

  for (const source of args.sources ?? []) {
    const normalized = normalizeSource(source)
    for (const dir of discoverSkillDirs(normalized.path, {
      recursive: normalized.recursive,
      glob: normalized.glob,
    })) {
      skillDirs.set(dir, dir)
    }
  }

  const enable = new Set(args.enable ?? [])
  const disable = new Set(args.disable ?? [])
  const skills: SharedSkill[] = []
  for (const dir of skillDirs.keys()) {
    const skill = readSharedSkill(dir)
    if (!skill) continue
    if (enable.size > 0 && !matchesName(enable, skill, dir)) continue
    if (matchesName(disable, skill, dir)) continue
    skills.push(skill)
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

export function buildSkillCommand(skill: SharedSkill, scope = "ocmm"): SkillCommand | null {
  return readSkillCommand(skill.path, scope)
}

function normalizeSource(source: SharedSkillSource): {
  path: string
  recursive: boolean
  glob?: string
} {
  if (typeof source === "string") return { path: source, recursive: true }
  return {
    path: source.path,
    recursive: source.recursive ?? true,
    ...(source.glob ? { glob: source.glob } : {}),
  }
}

function discoverSkillDirs(
  rootDir: string,
  opts: { recursive: boolean; glob?: string; excludeNames?: Set<string> },
): string[] {
  const root = resolve(rootDir)
  if (!existsSync(root)) {
    log.warn(`skill source missing: ${root}`)
    return []
  }
  const rootStat = statSync(root)
  if (!rootStat.isDirectory()) return []

  const out: string[] = []
  if (existsSync(join(root, "SKILL.md")) && matchesGlob(root, root, opts.glob)) {
    out.push(root)
    return out
  }

  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!entry.isDirectory()) continue
      if (opts.excludeNames?.has(entry.name)) continue
      const child = join(dir, entry.name)
      if (existsSync(join(child, "SKILL.md"))) {
        if (matchesGlob(child, root, opts.glob)) out.push(child)
        continue
      }
      if (opts.recursive) visit(child)
    }
  }

  visit(root)
  return out
}

function readSharedSkill(dir: string): SharedSkill | null {
  const skillPath = join(dir, "SKILL.md")
  try {
    const content = readFileSync(skillPath, "utf8")
    const { meta } = parseSkillDocument(content)
    const name = meta.name ?? basename(dir)
    return {
      name,
      description: meta.description ?? "",
      path: dir,
    }
  } catch (err) {
    log.warn(`failed to read shared skill ${skillPath}: ${(err as Error).message}`)
    return null
  }
}

function readSkillCommand(dir: string, scope: string): SkillCommand | null {
  const skillPath = join(dir, "SKILL.md")
  try {
    const content = readFileSync(skillPath, "utf8")
    const { meta, body } = parseSkillDocument(content)
    const name = meta.name ?? basename(dir)
    const resolvedPath = resolve(dir).replace(/\\/g, "/")
    const trimmedBody = body.trim()
    const template = `<skill-instruction>\nBase directory for this skill: ${resolvedPath}/\nFile references (@path) in this skill are relative to this directory.\n\n${trimmedBody}\n</skill-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`

    return {
      name,
      description: meta.description ? `(${scope} - Skill) ${meta.description}` : `(${scope} - Skill)`,
      path: dir,
      template,
      ...(meta.agent ? { agent: meta.agent } : {}),
      ...(meta.model ? { model: meta.model } : {}),
      ...(meta.subtask !== undefined ? { subtask: meta.subtask } : {}),
    }
  } catch (err) {
    log.warn(`failed to build skill command ${skillPath}: ${(err as Error).message}`)
    return null
  }
}

function parseSkillDocument(content: string): { meta: SkillMetadata; body: string } {
  if (!content.startsWith("---")) return { meta: {}, body: content }
  const end = content.indexOf("\n---", 3)
  if (end < 0) return { meta: {}, body: content }
  const meta: SkillMetadata = {}
  const header = content.slice(3, end).trim()
  for (const line of header.split(/\r?\n/)) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())
    if (!match) continue
    const key = match[1]
    const value = unquoteYamlScalar(match[2] ?? "")
    switch (key) {
      case "name":
        meta.name = value
        break
      case "description":
        meta.description = value
        break
      case "agent":
        meta.agent = value
        break
      case "model":
        meta.model = value
        break
      case "subtask":
        {
          const parsed = parseYamlBoolean(value)
          if (parsed !== undefined) meta.subtask = parsed
        }
        break
    }
  }
  const bodyStart = content.indexOf("\n", end + 4)
  return { meta, body: bodyStart >= 0 ? content.slice(bodyStart + 1) : "" }
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function parseYamlBoolean(value: string): boolean | undefined {
  const v = value.trim().toLowerCase()
  if (v === "true") return true
  if (v === "false") return false
  return undefined
}

function matchesName(names: Set<string>, skill: SharedSkill, dir: string): boolean {
  return names.has(skill.name) || names.has(basename(dir))
}

function matchesGlob(dir: string, root: string, glob?: string): boolean {
  if (!glob) return true
  const rel = relative(root, dir).replace(/\\/g, "/") || basename(dir)
  const pattern = globToRegExp(glob)
  return pattern.test(rel) || pattern.test(basename(dir))
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*")
    .replace(/\?/g, "[^/]")
  return new RegExp(`^${escaped}$`)
}
