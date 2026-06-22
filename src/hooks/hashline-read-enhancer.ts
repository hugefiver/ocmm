import { readFile } from "node:fs/promises"

import type { OcmmConfig } from "../config/schema.ts"
import { formatHashLine } from "../hashline/index.ts"
import { isRecord } from "../shared/logger.ts"

const TRUNCATED_LINE_SUFFIX = "... (line truncated to 2000 chars)"
const SUCCESSFUL_WRITE_PREFIX = "File written successfully."

type ToolOutput = {
  output?: unknown
  metadata?: unknown
}

export function createHashlineReadEnhancer(args: {
  getConfig: () => OcmmConfig
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, rawOutput) => {
    if (!args.getConfig().hashline.enabled) return
    if (!isRecord(rawOutput)) return

    const name = toolName(rawInput)
    if (name === "read") {
      const output = rawOutput as ToolOutput
      if (typeof output.output !== "string") return
      output.output = transformReadOutput(output.output)
      return
    }

    if (name === "write") {
      const output = rawOutput as ToolOutput
      if (typeof output.output !== "string") return
      const summary = await summarizeWriteOutput(rawInput, output)
      if (summary) output.output = summary
    }
  }
}

export function transformReadOutput(text: string): string {
  let transformedTaggedBlock = false
  const tagged = text.replace(/<(content|file)>([\s\S]*?)<\/\1>/g, (match, tag: string, body: string) => {
    const transformed = transformLineNumberedBlock(body)
    if (transformed === null || transformed === body) return match
    transformedTaggedBlock = true
    return `<${tag}>${transformed}</${tag}>`
  })
  if (transformedTaggedBlock) return tagged

  return transformLineNumberedBlock(text) ?? text
}

function transformLineNumberedBlock(block: string): string | null {
  const newline = block.includes("\r\n") ? "\r\n" : "\n"
  const lines = block.split(/\r?\n/)
  let transformedAny = false
  const transformed: string[] = []

  for (const line of lines) {
    const next = transformLineNumber(line)
    if (next === null) return null
    if (next !== line) transformedAny = true
    transformed.push(next)
  }

  return transformedAny ? transformed.join(newline) : null
}

function transformLineNumber(line: string): string | null {
  if (line.length === 0 || line.trim().length === 0) return line
  if (/^\s*\d+#[A-Z]{2}\|/.test(line)) return line
  if (line.endsWith(TRUNCATED_LINE_SUFFIX)) return line

  const match = /^(\s*)(\d+)(?::|\|)\s?(.*)$/.exec(line)
  if (!match) return null

  const [, indent, lineNumberText, content] = match
  const lineNumber = Number(lineNumberText)
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 1) return null
  return `${indent}${formatHashLine(lineNumber, content ?? "")}`
}

async function summarizeWriteOutput(rawInput: unknown, rawOutput: ToolOutput): Promise<string | null> {
  if (typeof rawOutput.output !== "string") return null
  const current = rawOutput.output.trimStart()
  if (current.startsWith(SUCCESSFUL_WRITE_PREFIX)) return null
  if (/^(error|failed)\b/i.test(current)) return null

  const content = readOutputContent(rawOutput) ?? await readFileContent(readFilePath(rawInput, rawOutput))
  if (content === null) return null
  return `${SUCCESSFUL_WRITE_PREFIX} ${countContentLines(content)} lines written.`
}

function readOutputContent(rawOutput: ToolOutput): string | null {
  if (!isRecord(rawOutput.metadata)) return null
  if (typeof rawOutput.metadata.after === "string") return rawOutput.metadata.after
  if (isRecord(rawOutput.metadata.filediff) && typeof rawOutput.metadata.filediff.after === "string") {
    return rawOutput.metadata.filediff.after
  }
  return null
}

function readFilePath(rawInput: unknown, rawOutput: ToolOutput): string | null {
  if (isRecord(rawOutput.metadata)) {
    for (const key of ["filePath", "path", "file"]) {
      const value = rawOutput.metadata[key]
      if (typeof value === "string" && value.length > 0) return value
    }
  }

  if (isRecord(rawInput) && isRecord(rawInput.args)) {
    for (const key of ["filePath", "path", "file"]) {
      const value = rawInput.args[key]
      if (typeof value === "string" && value.length > 0) return value
    }
  }

  return null
}

async function readFileContent(filePath: string | null): Promise<string | null> {
  if (!filePath) return null
  try {
    return await readFile(filePath, "utf8")
  } catch {
    return null
  }
}

function countContentLines(content: string): number {
  if (content.length === 0) return 0
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()
  return lines.length
}

function toolName(rawInput: unknown): string | null {
  if (!isRecord(rawInput)) return null
  const tool = rawInput.tool
  if (typeof tool === "string") return tool.toLowerCase()
  if (isRecord(tool)) {
    for (const key of ["name", "id", "key"]) {
      const value = tool[key]
      if (typeof value === "string" && value.length > 0) return value.toLowerCase()
    }
  }
  return null
}
