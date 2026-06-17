/**
 * `event` hook handler.
 *
 * Phase 1 only handles session lifecycle bookkeeping (clear latched intents on
 * session deletion). Reactive runtime fallback (retry on session.error with an
 * alternate model) is Phase 2 because chat.params can't change models — we'd
 * need to inject a new prompt or tool-level retry instead.
 */

import { clearSessionIntent } from "./chat-message.ts"
import { isRecord, log } from "../shared/logger.ts"

export function createEventHandler(): (input: unknown) => Promise<void> {
  return async (raw) => {
    if (!isRecord(raw)) return
    const eventType = typeof raw.type === "string" ? raw.type : ""
    if (!eventType) return

    if (eventType === "session.deleted" || eventType === "session.idle") {
      const sessionID = typeof raw.sessionID === "string"
        ? raw.sessionID
        : isRecord(raw.session) && typeof raw.session.id === "string"
          ? raw.session.id
          : ""
      if (sessionID) clearSessionIntent(sessionID)
    } else if (eventType === "session.error") {
      log.debug("session.error received (phase 1: no-op)", raw)
    }
  }
}
