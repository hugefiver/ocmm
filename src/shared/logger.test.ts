import { test } from "node:test"
import assert from "node:assert/strict"

import { log } from "./logger.ts"

type CapturedCall = {
  level: "debug" | "log" | "warn" | "error"
  args: unknown[]
}

function captureConsole() {
  const calls: CapturedCall[] = []
  const originalDebug = console.debug
  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error

  console.debug = ((...args: unknown[]) => {
    calls.push({ level: "debug", args })
  }) as typeof console.debug
  console.log = ((...args: unknown[]) => {
    calls.push({ level: "log", args })
  }) as typeof console.log
  console.warn = ((...args: unknown[]) => {
    calls.push({ level: "warn", args })
  }) as typeof console.warn
  console.error = ((...args: unknown[]) => {
    calls.push({ level: "error", args })
  }) as typeof console.error

  return {
    calls,
    restore() {
      console.debug = originalDebug
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
    },
  }
}

function withOcmmDebug(value: string | undefined, fn: () => void): void {
  const original = process.env.OCMM_DEBUG
  try {
    if (value === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = value
    fn()
  } finally {
    if (original === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = original
  }
}

test("logger does not print unless OCMM_DEBUG is enabled", () => {
  const capture = captureConsole()
  try {
    withOcmmDebug(undefined, () => {
      log.debug("debug")
      log.info("info")
      log.warn("warn")
      log.error("error")
    })
    assert.deepEqual(capture.calls, [])
  } finally {
    capture.restore()
  }
})

test("logger prints with prefix when OCMM_DEBUG is enabled", () => {
  const capture = captureConsole()
  try {
    withOcmmDebug("1", () => {
      log.debug("debug")
      log.info("info")
      log.warn("warn")
      log.error("error")
    })
    assert.deepEqual(capture.calls.map((call) => call.level), [
      "debug",
      "log",
      "warn",
      "error",
    ])
    assert.deepEqual(
      capture.calls.map((call) => call.args[0]),
      ["[ocmm]", "[ocmm]", "[ocmm]", "[ocmm]"],
    )
  } finally {
    capture.restore()
  }
})
