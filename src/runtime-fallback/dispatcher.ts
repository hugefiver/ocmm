/**
 * Dispatches a fallback retry: aborts the failed session prompt, fetches
 * the last user parts, and re-prompts with the new model.
 *
 * Minimal — no prompt-async-gate, no reservation/backoff. Dedup via
 * `inFlightRetries` Set. Errors are logged + swallowed (never rethrown).
 */
import { isRecord, log } from "../shared/logger.ts"
import type { FallbackEntry } from "../shared/types.ts"

/** Subset of OpenCode's client surface we touch. */
export type OcmmClient = {
  session: {
    abort(args: { path: { id: string } }): Promise<unknown>
    messages(args: {
      path: { id: string }
      query?: { directory?: string }
    }): Promise<unknown>
    prompt(args: {
      path: { id: string }
      body: Record<string, unknown>
      query?: { directory?: string }
    }): Promise<unknown>
  }
}

export type DispatchArgs = {
  client: OcmmClient
  sessionID: string
  directory?: string
  agent?: string
  newEntry: FallbackEntry
  reason: string
}

const inFlight = new Set<string>()

export function isDispatchInFlight(sessionID: string): boolean {
  return inFlight.has(sessionID)
}

/**
 * Extract the latest contiguous block of user messages from a session.
 *
 * Scans backward from the end, collecting adjacent user-role messages,
 * stops at the first non-user message after at least one user is collected,
 * then reverses to chronological order and concatenates their parts/content.
 */
function extractLastUserParts(messagesResp: unknown): unknown[] {
  if (!isRecord(messagesResp)) return []
  const msgs = messagesResp.messages ?? messagesResp.data ?? messagesResp
  if (!Array.isArray(msgs)) return []
  const collected: unknown[] = []
  let seenUserBlock = false
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (!isRecord(m)) continue
    const role = m.role ?? m.type
    if (role === "user") {
      seenUserBlock = true
      const parts = m.parts ?? m.content
      if (Array.isArray(parts)) collected.unshift(...parts)
      else if (typeof parts === "string") collected.unshift({ type: "text", text: parts })
    } else {
      // Stop at first non-user after reaching the latest user block, even if
      // that block had no retryable parts. Do not cross into an older turn.
      if (seenUserBlock) break
    }
  }
  return collected
}

export async function dispatchFallbackRetry(args: DispatchArgs): Promise<boolean> {
  const { client, sessionID, directory, agent, newEntry, reason } = args
  if (inFlight.has(sessionID)) {
    log.debug(`dispatch: already in flight for session ${sessionID.slice(0, 16)}…`)
    return false
  }
  inFlight.add(sessionID)
  try {
    try {
      await client.session.abort({ path: { id: sessionID } })
    } catch (err) {
      log.debug(`abort failed (best-effort): ${(err as Error).message}`)
    }

    let parts: unknown[] = []
    try {
      const resp = await client.session.messages({
        path: { id: sessionID },
        ...(directory !== undefined ? { query: { directory } } : {}),
      })
      parts = extractLastUserParts(resp)
    } catch (err) {
      log.warn(`failed to fetch messages for retry: ${(err as Error).message}`)
      return false
    }
    if (parts.length === 0) {
      log.warn(`no user parts to retry; skipping dispatch`)
      return false
    }

    const providerID = newEntry.providers[0] ?? ""
    const body: Record<string, unknown> = {
      providerID,
      modelID: newEntry.model,
      parts,
    }
    if (agent) body.agent = agent
    if (newEntry.variant) body.variant = newEntry.variant
    if (newEntry.reasoningEffort) body.reasoningEffort = newEntry.reasoningEffort

    try {
      await client.session.prompt({
        path: { id: sessionID },
        body,
        ...(directory !== undefined ? { query: { directory } } : {}),
      })
      log.info(
        `fallback dispatched: session=${sessionID.slice(0, 16)}… ` +
          `model=${providerID}/${newEntry.model} reason=${reason}`,
      )
      return true
    } catch (err) {
      log.warn(
        `prompt dispatch failed: ${(err as Error).message} ` +
          `(will rely on next session.error for further retries)`,
      )
      return false
    }
  } finally {
    inFlight.delete(sessionID)
  }
}
