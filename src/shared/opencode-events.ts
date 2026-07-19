import { isRecord } from "./logger.ts"

export type SessionLineage = { sessionID: string; parentSessionID?: string }
export type TaskPartInterruptionEvidence = {
  childSessionID: string
  parentSessionID: string
  parentPartID?: string
  callID?: string
  agent?: string
  taskID?: string
  terminalTaskErrorObserved: true
  transportInterrupted: boolean
  errorText: string
}

function stringField(value: unknown, keys: readonly string[]): string | undefined {
  if (!isRecord(value)) return undefined
  for (const key of keys) {
    const found = value[key]
    if (typeof found === "string" && found.length > 0) return found
  }
  return undefined
}

export function eventEnvelope(raw: unknown): { type: string; properties: Record<string, unknown> } | null {
  if (!isRecord(raw)) return null
  const event = isRecord(raw.event) ? raw.event : raw
  const type = typeof event.type === "string" ? event.type : ""
  if (!type) return null
  const properties = isRecord(event.properties) ? event.properties : event
  return { type, properties }
}

export function resolveSessionLineageProperties(props: unknown): SessionLineage | null {
  if (!isRecord(props)) return null
  const info = isRecord(props.info) ? props.info : undefined
  const session = isRecord(props.session) ? props.session : undefined
  const sessionID = stringField(props, ["sessionID", "sessionId"])
    ?? (session ? stringField(session, ["id", "sessionID", "sessionId"]) : undefined)
    ?? (info ? stringField(info, ["id", "sessionID", "sessionId"]) : undefined)
  if (!sessionID) return null
  const parentSessionID = stringField(props, ["parentID", "parentId", "parentSessionID", "parentSessionId"])
    ?? (session ? stringField(session, ["parentID", "parentId", "parentSessionID", "parentSessionId"]) : undefined)
    ?? (info ? stringField(info, ["parentID", "parentId", "parentSessionID", "parentSessionId"]) : undefined)
  return { sessionID, ...(parentSessionID ? { parentSessionID } : {}) }
}

export function resolveSessionLineage(raw: unknown): SessionLineage | null {
  const envelope = eventEnvelope(raw)
  return envelope ? resolveSessionLineageProperties(envelope.properties) : null
}

export function resolveTaskPartInterruption(raw: unknown): TaskPartInterruptionEvidence | null {
  const envelope = eventEnvelope(raw)
  if (!envelope || envelope.type !== "message.part.updated") return null
  const part = isRecord(envelope.properties.part) ? envelope.properties.part : undefined
  if (!part || part.type !== "tool" || part.tool !== "task") return null
  const state = isRecord(part.state) ? part.state : undefined
  if (!state || state.status !== "error") return null
  const metadata = isRecord(state.metadata) ? state.metadata : undefined
  const input = isRecord(state.input) ? state.input : undefined
  const childSessionID = metadata ? stringField(metadata, ["sessionId", "sessionID"]) : undefined
  const parentSessionID = stringField(envelope.properties, ["sessionID", "sessionId"])
    ?? (part ? stringField(part, ["sessionID", "sessionId"]) : undefined)
  if (!childSessionID || !parentSessionID) return null
  const inputTaskID = input ? stringField(input, ["task_id", "taskID", "taskId"]) : undefined
  const errorText = typeof state.error === "string" ? state.error : ""
  const parentPartID = stringField(part, ["id"])
  const callID = stringField(part, ["callID", "callId"])
  const agent = input ? stringField(input, ["subagent_type", "agent"]) : undefined
  return {
    childSessionID,
    parentSessionID,
    ...(parentPartID ? { parentPartID } : {}),
    ...(callID ? { callID } : {}),
    ...(agent ? { agent } : {}),
    ...(inputTaskID ? { taskID: inputTaskID } : {}),
    terminalTaskErrorObserved: true,
    transportInterrupted: metadata?.interrupted === true,
    errorText,
  }
}
