import { computeLineHash } from "./hash-computation.ts"

const CONTEXT_LINES = 3

export function toHashlineContent(content: string): string {
  if (!content) return content
  const lines = content.split("\n")
  const lastLine = lines[lines.length - 1]
  const hasTrailingNewline = lastLine === ""
  const contentLines = hasTrailingNewline ? lines.slice(0, -1) : lines
  const hashlined = contentLines.map((line, i) => {
    const lineNum = i + 1
    const hash = computeLineHash(lineNum, line)
    return `${lineNum}#${hash}|${line}`
  })
  return hasTrailingNewline ? `${hashlined.join("\n")}\n` : hashlined.join("\n")
}

export function generateUnifiedDiff(oldContent: string, newContent: string, filePath: string): string {
  if (oldContent === newContent) {
    return `--- ${filePath}\n+++ ${filePath}\n`
  }

  const oldLines = contentLines(oldContent)
  const newLines = contentLines(newContent)
  const start = firstChangedLine(oldLines, newLines)
  const end = lastChangedLine(oldLines, newLines, start)
  const oldStart = Math.max(0, start - CONTEXT_LINES)
  const newStart = Math.max(0, start - CONTEXT_LINES)
  const oldEnd = Math.min(oldLines.length - 1, end.old + CONTEXT_LINES)
  const newEnd = Math.min(newLines.length - 1, end.new + CONTEXT_LINES)
  const hunk: string[] = []

  for (let index = oldStart; index < start; index += 1) {
    hunk.push(` ${oldLines[index] ?? ""}`)
  }
  for (let index = start; index <= end.old; index += 1) {
    hunk.push(`-${oldLines[index] ?? ""}`)
  }
  for (let index = start; index <= end.new; index += 1) {
    hunk.push(`+${newLines[index] ?? ""}`)
  }
  for (let index = end.old + 1; index <= oldEnd; index += 1) {
    hunk.push(` ${oldLines[index] ?? ""}`)
  }

  const oldCount = oldEnd >= oldStart ? oldEnd - oldStart + 1 : 0
  const newCount = newEnd >= newStart ? newEnd - newStart + 1 : 0
  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ -${oldStart + 1},${oldCount} +${newStart + 1},${newCount} @@`,
    ...hunk,
  ].join("\n")
}

function contentLines(content: string): string[] {
  const lines = content.split("\n")
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines
}

function firstChangedLine(oldLines: string[], newLines: string[]): number {
  const max = Math.max(oldLines.length, newLines.length)
  for (let index = 0; index < max; index += 1) {
    if (oldLines[index] !== newLines[index]) return index
  }
  return 0
}

function lastChangedLine(
  oldLines: string[],
  newLines: string[],
  start: number,
): { old: number; new: number } {
  let oldIndex = oldLines.length - 1
  let newIndex = newLines.length - 1
  while (oldIndex >= start && newIndex >= start && oldLines[oldIndex] === newLines[newIndex]) {
    oldIndex -= 1
    newIndex -= 1
  }
  return { old: oldIndex, new: newIndex }
}

export function countLineDiffs(oldContent: string, newContent: string): { additions: number; deletions: number } {
  const oldLines = contentLines(oldContent)
  const newLines = contentLines(newContent)

  const oldSet = new Map<string, number>()
  for (const line of oldLines) {
    oldSet.set(line, (oldSet.get(line) ?? 0) + 1)
  }

  const newSet = new Map<string, number>()
  for (const line of newLines) {
    newSet.set(line, (newSet.get(line) ?? 0) + 1)
  }

  let deletions = 0
  for (const [line, count] of oldSet) {
    const newCount = newSet.get(line) ?? 0
    if (count > newCount) {
      deletions += count - newCount
    }
  }

  let additions = 0
  for (const [line, count] of newSet) {
    const oldCount = oldSet.get(line) ?? 0
    if (count > oldCount) {
      additions += count - oldCount
    }
  }

  return { additions, deletions }
}
