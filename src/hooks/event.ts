import { createRuntimeFallbackEventHandler, type OcmmClient } from "../runtime-fallback/index.ts"
import type { OcmmConfig } from "../config/schema.ts"

export function createEventHandler(args: {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
}): (input: unknown) => Promise<void> {
  return createRuntimeFallbackEventHandler({
    getConfig: args.getConfig,
    ...(args.client !== undefined ? { client: args.client } : {}),
    ...(args.directory !== undefined ? { directory: args.directory } : {}),
  })
}
