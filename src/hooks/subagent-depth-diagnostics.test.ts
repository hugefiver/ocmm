import { test } from "node:test"
import assert from "node:assert/strict"

import { defaultConfig, type OcmmConfig } from "../config/schema.ts"
import {
  createSubagentDepthDiagnosticReporter,
  resolveSubagentDepthDiagnostic,
} from "./subagent-depth-diagnostics.ts"

function configWithDepth(maxDepth: number, disabledHooks: string[] = []): OcmmConfig {
  return {
    ...defaultConfig(),
    disabledHooks,
    subagent: { maxDepth },
  }
}

test("resolves the observable host and ocmm subagent depth compatibility matrix", () => {
  const cases = [
    {
      name: "host zero is stricter",
      hostDepth: 0,
      config: configWithDepth(3),
      expected: {
        key: "host:0|ocmm:3",
        level: "warn",
        message: "subagent depth compatibility: OpenCode subagent_depth=0, ocmm subagent.maxDepth=3, effective=0 (host is stricter; task dispatches only)",
      },
    },
    {
      name: "host one is stricter",
      hostDepth: 1,
      config: configWithDepth(3),
      expected: {
        key: "host:1|ocmm:3",
        level: "warn",
        message: "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent.maxDepth=3, effective=1 (host is stricter; task dispatches only)",
      },
    },
    {
      name: "limits agree",
      hostDepth: 3,
      config: configWithDepth(3),
      expected: {
        key: "host:3|ocmm:3",
        level: "info",
        message: "subagent depth compatibility: OpenCode subagent_depth=3, ocmm subagent.maxDepth=3, effective=3 (limits agree; task dispatches only)",
      },
    },
    {
      name: "ocmm is stricter",
      hostDepth: 5,
      config: configWithDepth(3),
      expected: {
        key: "host:5|ocmm:3",
        level: "warn",
        message: "subagent depth compatibility: OpenCode subagent_depth=5, ocmm subagent.maxDepth=3, effective=3 (ocmm is stricter; task dispatches only)",
      },
    },
    {
      name: "canonical guard disablement leaves host only",
      hostDepth: 1,
      config: configWithDepth(3, ["subagent-depth-guard"]),
      expected: {
        key: "host:1|ocmm:disabled",
        level: "info",
        message: "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent-depth-guard=disabled, effective=1 (host only; task dispatches only)",
      },
    },
    {
      name: "compatibility alias disablement leaves host only",
      hostDepth: 1,
      config: configWithDepth(3, ["subagentDepthGuard"]),
      expected: {
        key: "host:1|ocmm:disabled",
        level: "info",
        message: "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent-depth-guard=disabled, effective=1 (host only; task dispatches only)",
      },
    },
  ] as const

  for (const item of cases) {
    assert.deepEqual(
      resolveSubagentDepthDiagnostic({ subagent_depth: item.hostDepth }, item.config),
      item.expected,
      item.name,
    )
  }
})

test("returns no diagnostic when the host depth field is not safely observable", () => {
  const config = configWithDepth(3)
  const inputs: unknown[] = [
    null,
    [],
    {},
    Object.create({ subagent_depth: 1 }),
    { subagent_depth: undefined },
    { subagent_depth: "1" },
    { subagent_depth: -1 },
    { subagent_depth: 1.5 },
    { subagent_depth: Number.NaN },
    { subagent_depth: Number.POSITIVE_INFINITY },
  ]

  for (const input of inputs) {
    assert.equal(resolveSubagentDepthDiagnostic(input, config), null)
  }
})

test("reads without mutation and never includes unrelated host config or secrets", () => {
  const hostConfig = {
    subagent_depth: 1,
    provider: { private: { apiKey: "DEPTH_DIAGNOSTIC_SECRET_SENTINEL" } },
  }
  const before = structuredClone(hostConfig)

  const diagnostic = resolveSubagentDepthDiagnostic(hostConfig, configWithDepth(3))

  assert.ok(diagnostic)
  assert.deepEqual(hostConfig, before)
  assert.doesNotMatch(`${diagnostic.key}\n${diagnostic.message}`, /DEPTH_DIAGNOSTIC_SECRET_SENTINEL/)
})

test("reports each diagnostic key once per reporter instance", () => {
  const calls: Array<{ level: "info" | "warn"; message: string }> = []
  const reporter = createSubagentDepthDiagnosticReporter({
    info(...args: unknown[]) {
      calls.push({ level: "info", message: String(args[0]) })
    },
    warn(...args: unknown[]) {
      calls.push({ level: "warn", message: String(args[0]) })
    },
  })
  const config = configWithDepth(3)

  reporter({ subagent_depth: 1 }, config)
  reporter({ subagent_depth: 1 }, config)
  reporter({ subagent_depth: 3 }, config)
  reporter({ subagent_depth: 1 }, config)
  reporter({}, config)

  assert.deepEqual(calls, [
    {
      level: "warn",
      message: "subagent depth compatibility: OpenCode subagent_depth=1, ocmm subagent.maxDepth=3, effective=1 (host is stricter; task dispatches only)",
    },
    {
      level: "info",
      message: "subagent depth compatibility: OpenCode subagent_depth=3, ocmm subagent.maxDepth=3, effective=3 (limits agree; task dispatches only)",
    },
  ])
})
