import { CHECKSUM_NAME } from "./target.ts"
import { sameSortedNames, sortNames } from "./receipt.ts"

const CHECKSUM_ROW = /^([0-9a-fA-F]{64})  ([^\\/\r\n]+)$/

export class ChecksumContractError extends Error {
  readonly code: "checksum_format_invalid" | "checksum_coverage_mismatch"

  constructor(code: "checksum_format_invalid" | "checksum_coverage_mismatch") {
    super(code)
    this.code = code
  }
}

export function checksumFailureDetail(code: "checksum_format_invalid" | "checksum_coverage_mismatch"): string {
  return code === "checksum_format_invalid"
    ? "staged checksum manifest has invalid format"
    : "staged checksum manifest does not cover the canonical payload set"
}

export function parseChecksums(bytes: Uint8Array, expectedPayloads: readonly string[]): ReadonlyMap<string, string> {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new ChecksumContractError("checksum_format_invalid")
  }

  if (!text.endsWith("\n")) throw new ChecksumContractError("checksum_format_invalid")
  const body = text.slice(0, -1)
  if (body.length === 0) throw new ChecksumContractError("checksum_format_invalid")

  const checksums = new Map<string, string>()
  for (const row of body.split("\n")) {
    if (row.length === 0) throw new ChecksumContractError("checksum_format_invalid")
    const match = CHECKSUM_ROW.exec(row)
    if (!match) throw new ChecksumContractError("checksum_format_invalid")

    const [, rawDigest, name] = match
    if (name === CHECKSUM_NAME || name === "." || name === ".." || checksums.has(name)) {
      throw new ChecksumContractError("checksum_format_invalid")
    }
    checksums.set(name, rawDigest.toLowerCase())
  }

  const canonicalPayloads = sortNames(expectedPayloads)
  if (!sameSortedNames(sortNames([...checksums.keys()]), canonicalPayloads)) {
    throw new ChecksumContractError("checksum_coverage_mismatch")
  }

  const ordered = new Map<string, string>()
  for (const name of canonicalPayloads) {
    const digest = checksums.get(name)
    if (digest === undefined) throw new ChecksumContractError("checksum_coverage_mismatch")
    ordered.set(name, digest)
  }
  return ordered
}
