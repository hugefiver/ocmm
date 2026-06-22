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

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { log } from "../shared/logger.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SKILLS_ROOT = join(HERE, "..", "..", "skills")

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
