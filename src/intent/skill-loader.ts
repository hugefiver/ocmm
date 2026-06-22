/**
 * Loads v1 workflow skills from disk.
 *
 * Reads skills/v1/{brainstorming,writing-plans,subagent-driven-development,
 * requesting-code-review,receiving-code-review}/SKILL.md and concatenates
 * them into a single string for injection via the system.transform hook.
 *
 * Skills are NOT registered with OpenCode's skill loader — ocmm injects
 * the content directly into the system message.
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
    const meta = parseFrontmatter(content)
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

function parseFrontmatter(content: string): { name?: string; description?: string } {
  if (!content.startsWith("---")) return {}
  const end = content.indexOf("\n---", 3)
  if (end < 0) return {}
  const meta: { name?: string; description?: string } = {}
  const header = content.slice(3, end).trim()
  for (const line of header.split(/\r?\n/)) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())
    if (!match) continue
    const key = match[1]
    if (key !== "name" && key !== "description") continue
    meta[key] = unquoteYamlScalar(match[2] ?? "")
  }
  return meta
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
