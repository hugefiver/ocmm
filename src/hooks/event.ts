import {
  createRuntimeFallbackRuntime,
  type RuntimeFallbackDeps,
  type RuntimeFallbackRuntime,
} from "../runtime-fallback/index.ts"

export function createEventRuntime(args: RuntimeFallbackDeps): RuntimeFallbackRuntime {
  return createRuntimeFallbackRuntime(args)
}

export function createEventHandler(args: RuntimeFallbackDeps): (input: unknown) => Promise<void> {
  return createEventRuntime(args).event
}
