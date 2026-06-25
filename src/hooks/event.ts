import { createRuntimeFallbackEventHandler, type OcmmClient } from "../runtime-fallback/index.ts"
import type { OcmmConfig } from "../config/schema.ts"
import type { IdleContinuationState } from "../runtime-fallback/idle-state.ts"

export function createEventHandler(args: {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
  idleState?: IdleContinuationState
}): (input: unknown) => Promise<void> {
  return createRuntimeFallbackEventHandler({
    getConfig: args.getConfig,
    ...(args.client !== undefined ? { client: args.client } : {}),
    ...(args.directory !== undefined ? { directory: args.directory } : {}),
    ...(args.idleState !== undefined ? { idleState: args.idleState } : {}),
  })
}
