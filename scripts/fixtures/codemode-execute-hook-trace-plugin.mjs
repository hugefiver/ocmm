import { appendFileSync } from "node:fs"
import { createHash, timingSafeEqual } from "node:crypto"

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toolID(input) {
  if (!isRecord(input)) return null
  for (const key of ["toolID", "toolId", "toolName", "name"]) {
    if (typeof input[key] === "string" && input[key]) return input[key].toLowerCase()
  }
  if (typeof input.tool === "string") return input.tool.toLowerCase()
  if (isRecord(input.tool)) {
    for (const key of ["name", "id", "key"]) {
      if (typeof input.tool[key] === "string" && input.tool[key]) return input.tool[key].toLowerCase()
    }
  }
  return null
}

function argsFor(phase, input, output) {
  const secondParameterArgs = isRecord(output) ? output.args : undefined
  const firstParameterArgs = isRecord(input) ? input.args : undefined
  const candidate = isRecord(secondParameterArgs) ? secondParameterArgs : firstParameterArgs
  return isRecord(candidate) ? candidate : {}
}

function nestedStatuses(output) {
  if (!isRecord(output) || !isRecord(output.metadata) || !Array.isArray(output.metadata.toolCalls)) return []
  return output.metadata.toolCalls.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.tool !== "string" || typeof entry.status !== "string") return []
    if (!["running", "completed", "error"].includes(entry.status)) return []
    return [{ tool: entry.tool.toLowerCase(), status: entry.status }]
  })
}

function exactCode(args) {
  const expected = process.env.OCMM_CODEMODE_EXPECTED_CODE_SHA256
  if (!/^[a-f0-9]{64}$/i.test(expected ?? "") || typeof args.code !== "string") return false
  const actualHash = createHash("sha256").update(args.code).digest()
  const expectedHash = Buffer.from(expected, "hex")
  return expectedHash.length === actualHash.length && timingSafeEqual(actualHash, expectedHash)
}

function safeMarkers(output, exactCodeMatch) {
  const text = isRecord(output) && typeof output.output === "string" ? output.output : ""
  return {
    exactCode: exactCodeMatch,
    executeProbe: text.includes("OCMM_CODEMODE_EXECUTE_PROBE"),
    deniedHidden: /["']?deniedVisible["']?\s*:\s*false/i.test(text),
    lspOk: /["']?lspOk["']?\s*:\s*true/i.test(text),
    identityOk: /["']?identityOk["']?\s*:\s*true/i.test(text),
    hookPayloadOk: /["']?hookPayloadOk["']?\s*:\s*true/i.test(text),
  }
}

function write(phase, input, output) {
  const target = process.env.OCMM_CODEMODE_TRACE_PATH
  if (!target) return
  const args = argsFor(phase, input, output)
  const tool = toolID(input)
  appendFileSync(target, `${JSON.stringify({
    phase,
    tool,
    hasSessionID: Boolean(input?.sessionID ?? input?.sessionId ?? input?.session_id),
    hasCallID: Boolean(input?.callID ?? input?.callId ?? input?.call_id),
    argumentKeys: Object.keys(args).sort(),
    nestedStatuses: nestedStatuses(output),
    safeMarkers: safeMarkers(output, phase === "before" && tool === "execute" && exactCode(args)),
  })}\n`)
}

export default {
  id: "ocmm-codemode-hook-trace",
  server() {
    return {
      "tool.execute.before": async (input, output) => write("before", input, output),
      "tool.execute.after": async (input, output) => write("after", input, output),
    }
  },
}
