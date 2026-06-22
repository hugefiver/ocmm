import { existsSync } from "node:fs"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { z } from "zod"

import {
  applyHashlineEditsWithReport,
  canonicalizeFileText,
  countLineDiffs,
  generateUnifiedDiff,
  HashlineMismatchError,
  normalizeHashlineEdits,
  restoreFileText,
  type HashlineEdit,
  type RawHashlineEdit,
} from "../hashline/index.ts"

export interface HashlineEditArgs {
  filePath: string
  edits: RawHashlineEdit[]
  delete?: boolean
  rename?: string
}

export type HashlineToolContext = {
  directory?: string
  metadata?: (value: { title?: string; metadata?: Record<string, unknown> }) => void | Promise<void>
}

export type HashlineToolDefinition = {
  description: string
  args: Record<string, z.ZodTypeAny>
  execute: (args: HashlineEditArgs, context: HashlineToolContext) => Promise<string>
}

export const HASHLINE_EDIT_DESCRIPTION = `Edit files using LINE#ID format for precise, safe modifications.

WORKFLOW:
1. Read target file/range and copy exact LINE#ID tags.
2. Pick the smallest operation per logical mutation site.
3. Submit one edit call per file with all related operations.
4. If the same file needs another call, re-read first.
5. Use anchors as "LINE#ID" only; do not include trailing "|content".

Rules:
- All edits in one call reference the ORIGINAL file state. Do not adjust line numbers for prior edits in the same call.
- replace removes lines pos..end inclusive and inserts only the provided lines.
- append/prepend with an anchor insert after/before that anchor; without anchors they write EOF/BOF and can create missing files.
- lines must contain plain replacement text only. Hashline prefixes and diff plus markers are stripped automatically.
- delete=true requires edits=[] and no rename.
- rename moves the final file after applying edits.`

const RawEditSchema = z.object({
  op: z.union([z.literal("replace"), z.literal("append"), z.literal("prepend")]).optional(),
  pos: z.string().optional(),
  end: z.string().optional(),
  lines: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
})

function canCreateFromMissingFile(edits: HashlineEdit[]): boolean {
  if (edits.length === 0) return false
  return edits.every((edit) => (edit.op === "append" || edit.op === "prepend") && !edit.pos)
}

function firstChangedLine(beforeContent: string, afterContent: string): number | undefined {
  const beforeLines = beforeContent.split("\n")
  const afterLines = afterContent.split("\n")
  const maxLength = Math.max(beforeLines.length, afterLines.length)
  for (let index = 0; index < maxLength; index += 1) {
    if ((beforeLines[index] ?? "") !== (afterLines[index] ?? "")) {
      return index + 1
    }
  }
  return undefined
}

function successMetadata(
  effectivePath: string,
  beforeContent: string,
  afterContent: string,
  noopEdits: number,
  deduplicatedEdits: number,
): { title: string; metadata: Record<string, unknown> } {
  const { additions, deletions } = countLineDiffs(beforeContent, afterContent)
  return {
    title: effectivePath,
    metadata: {
      filePath: effectivePath,
      path: effectivePath,
      file: effectivePath,
      diff: generateUnifiedDiff(beforeContent, afterContent, effectivePath),
      noopEdits,
      deduplicatedEdits,
      firstChangedLine: firstChangedLine(beforeContent, afterContent),
      filediff: {
        file: effectivePath,
        path: effectivePath,
        filePath: effectivePath,
        before: beforeContent,
        after: afterContent,
        additions,
        deletions,
      },
    },
  }
}

async function publishMetadata(context: HashlineToolContext, meta: { title: string; metadata: Record<string, unknown> }): Promise<void> {
  if (typeof context.metadata !== "function") return
  await context.metadata(meta)
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf8")
}

export async function executeHashlineEditTool(
  args: HashlineEditArgs,
  context: HashlineToolContext = {},
): Promise<string> {
  try {
    const filePath = args.filePath
    const deleteMode = args.delete === true
    const targetPath = args.rename

    if (deleteMode && targetPath) {
      return "Error: delete and rename cannot be used together"
    }
    if (deleteMode && args.edits.length > 0) {
      return "Error: delete mode requires edits to be an empty array"
    }
    if (!deleteMode && (!Array.isArray(args.edits) || args.edits.length === 0)) {
      return "Error: edits parameter must be a non-empty array"
    }

    const edits = deleteMode ? [] : normalizeHashlineEdits(args.edits)
    const exists = existsSync(filePath)

    if (deleteMode) {
      if (!exists) return `Error: File not found: ${filePath}`
      await rm(filePath)
      return `Successfully deleted ${filePath}`
    }

    if (!exists && !canCreateFromMissingFile(edits)) {
      return `Error: File not found: ${filePath}`
    }

    const rawOldContent = exists ? await readFile(filePath, "utf8") : ""
    const oldEnvelope = canonicalizeFileText(rawOldContent)
    const applyResult = applyHashlineEditsWithReport(oldEnvelope.content, edits)
    const canonicalNewContent = applyResult.content

    if (canonicalNewContent === oldEnvelope.content && !targetPath) {
      let diagnostic = `No changes made to ${filePath}. The edits produced identical content.`
      if (applyResult.noopEdits > 0) {
        diagnostic += ` No-op edits: ${applyResult.noopEdits}. Re-read the file and provide content that differs from current lines.`
      }
      return `Error: ${diagnostic}`
    }

    const writeContent = restoreFileText(canonicalNewContent, oldEnvelope)
    await writeTextFile(filePath, writeContent)

    const effectivePath = targetPath && targetPath !== filePath ? targetPath : filePath
    if (targetPath && targetPath !== filePath) {
      await mkdir(dirname(targetPath), { recursive: true })
      await rename(filePath, targetPath)
    }

    await publishMetadata(
      context,
      successMetadata(
        effectivePath,
        oldEnvelope.content,
        canonicalNewContent,
        applyResult.noopEdits,
        applyResult.deduplicatedEdits,
      ),
    )

    if (targetPath && targetPath !== filePath) {
      return `Moved ${filePath} to ${targetPath}`
    }
    return `Updated ${effectivePath}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof HashlineMismatchError) {
      return `Error: hash mismatch - ${message}\nTip: reuse LINE#ID entries from the latest read/edit output, or batch related edits in one call.`
    }
    return `Error: ${message}`
  }
}

export function createHashlineEditTool(): HashlineToolDefinition {
  return {
    description: HASHLINE_EDIT_DESCRIPTION,
    args: {
      filePath: z.string().describe("Absolute path to the file to edit"),
      delete: z.boolean().optional().describe("Delete file instead of editing"),
      rename: z.string().optional().describe("Rename output file path after edits"),
      edits: z.array(RawEditSchema).describe("Array of edit operations to apply; empty when delete=true"),
    },
    execute: executeHashlineEditTool,
  }
}
