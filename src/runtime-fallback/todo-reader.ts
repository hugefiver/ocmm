import type { OcmmClient } from "./dispatcher.ts"

const UNFINISHED_STATUSES = new Set(["pending", "in_progress"])

type TodoItem = { status?: string }

function extractTodosFromPart(part: unknown): TodoItem[] | null {
  if (typeof part !== "object" || part === null) return null
  const p = part as Record<string, unknown>
  // Check if this is a todowrite tool call/result
  const tool = p.tool ?? p.name
  if (tool !== "todowrite") return null
  // State may be under .state.todos or .output.todos or .result.todos
  const state = p.state ?? p.output ?? p.result
  if (typeof state !== "object" || state === null) return null
  const todos = (state as Record<string, unknown>).todos
  if (!Array.isArray(todos)) return null
  return todos as TodoItem[]
}

export async function hasUnfinishedTodos(client: OcmmClient, sessionID: string): Promise<boolean> {
  try {
    const resp = await client.session.messages({ path: { id: sessionID } })
    const data = (resp as Record<string, unknown>).data ?? resp
    if (!Array.isArray(data)) return false
    // Scan from the end — find the last todowrite call
    for (let i = data.length - 1; i >= 0; i--) {
      const msg = data[i]
      if (typeof msg !== "object" || msg === null) continue
      const parts = (msg as Record<string, unknown>).parts ?? (msg as Record<string, unknown>).content
      if (!Array.isArray(parts)) continue
      for (const part of parts) {
        const todos = extractTodosFromPart(part)
        if (todos !== null) {
          return todos.some((t) => typeof t.status === "string" && UNFINISHED_STATUSES.has(t.status))
        }
      }
    }
    return false
  } catch {
    return false
  }
}
