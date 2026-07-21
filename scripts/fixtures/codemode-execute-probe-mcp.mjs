import { appendFileSync, existsSync } from "node:fs"
import readline from "node:readline"

const eventsPath = process.env.OCMM_CODEMODE_PROBE_EVENTS
const pidPath = process.env.OCMM_CODEMODE_PROBE_PID_FILE
const stopPath = process.env.OCMM_CODEMODE_STOP_PATH

function event(name) {
  if (eventsPath) appendFileSync(eventsPath, `${JSON.stringify({ event: name })}\n`)
}

if (pidPath) appendFileSync(pidPath, `${JSON.stringify({ fixturePid: process.pid })}\n`)
event("started")

const tools = [
  {
    name: "identity",
    description: "Return the fixed CodeMode compatibility marker.",
    inputSchema: {
      type: "object",
      properties: { marker: { type: "string", const: "OCMM_CODEMODE_EXECUTE_PROBE" } },
      required: ["marker"],
      additionalProperties: false,
    },
  },
  {
    name: "json_error",
    description: "Return a fixed JSON parse error marker for hook-shape observation.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "denied",
    description: "This tool is hard denied and must not enter the CodeMode catalog.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
]

const toolEvents = {
  identity: "tools/call:identity",
  json_error: "tools/call:json_error",
  denied: "tools/call:denied",
}

function response(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`)
}

function error(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`)
}

function text(value) {
  return { content: [{ type: "text", text: value }] }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on("line", (line) => {
  if (!line.trim()) return
  let message
  try {
    message = JSON.parse(line)
  } catch {
    error(null, -32700, "Parse error")
    return
  }
  if (message.method === "initialize") {
    response(message.id, {
      protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "ocmm-codemode-probe", version: "1.0.0" },
    })
    return
  }
  if (message.method === "notifications/initialized") return
  if (message.method === "tools/list") {
    event("tools/list")
    response(message.id, { tools })
    return
  }
  if (message.method === "tools/call") {
    const name = String(message.params?.name ?? "")
    event(Object.hasOwn(toolEvents, name) ? toolEvents[name] : "tools/call:unknown")
    if (name === "identity") {
      if (message.params?.arguments?.marker !== "OCMM_CODEMODE_EXECUTE_PROBE") {
        error(message.id, -32602, "Invalid params")
        return
      }
      response(message.id, text("OCMM_CODEMODE_EXECUTE_PROBE"))
      return
    }
    if (name === "json_error") {
      response(message.id, text("JSON parse error: OCMM_CODEMODE_HOOK_SENTINEL"))
      return
    }
    if (name === "denied") {
      response(message.id, text("DENIED_TOOL_CALLED_UNEXPECTEDLY"))
      return
    }
    error(message.id, -32601, `Unknown tool: ${name}`)
    return
  }
  if (message.id !== undefined) error(message.id, -32601, `Unknown method: ${message.method}`)
})

let stopped = false
function stop(exitNow = false) {
  if (stopped) return
  stopped = true
  event("stopped")
  if (stopTimer) clearInterval(stopTimer)
  if (exitNow) process.exit(0)
}

const stopTimer = stopPath
  ? setInterval(() => {
      if (existsSync(stopPath)) stop(true)
    }, 25)
  : undefined

rl.on("close", () => stop(false))
