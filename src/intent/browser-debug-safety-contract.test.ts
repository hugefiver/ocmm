import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { test } from "node:test"

const PERFECTION_GUIDE_PATH = join(process.cwd(), "skills", "frontend", "references", "perfection", "README.md")
const REACT_PERF_GUIDE_PATH = join(process.cwd(), "skills", "frontend", "references", "perfection", "react-perf-tooling.md")

function extractReadOwnedCdpPort(text: string): string {
  const start = text.indexOf("async function readOwnedCdpPort")
  const end = text.indexOf("\n\nasync function launchOwnedAuditBrowser", start)
  assert.ok(start >= 0 && end > start, "missing executable readOwnedCdpPort example")
  return text
    .slice(start, end)
    .replace("userDataDir: string, launchStartedAt: number): Promise<number>", "userDataDir, launchStartedAt)")
    .replace("let lastError: unknown;", "let lastError;")
    .replace("const version = (await response.json()) as { webSocketDebuggerUrl?: string };", "const version = await response.json();")
}

test("documented CDP readiness rejects an endpoint that never responds", async () => {
  const requestBudgetMs = 250
  for (const path of [PERFECTION_GUIDE_PATH, REACT_PERF_GUIDE_PATH]) {
    const source = extractReadOwnedCdpPort(readFileSync(path, "utf8"))
    const readOwnedCdpPort = new Function(
      "join", "readFile", "stat", "delay", "Date",
      `"use strict"; ${source}; return readOwnedCdpPort;`,
    )(join, readFile, stat, delay, {
      now: (() => {
        let call = 0
        return () => (call++ === 0 ? 0 : call < 4 ? 10_000 - requestBudgetMs : 10_001)
      })(),
    }) as (userDataDir: string, launchStartedAt: number) => Promise<number>

    const runRoot = await mkdtemp(join(tmpdir(), "ocmm-cdp-timeout-contract-"))
    const requests: Array<{ method: string | undefined; url: string | undefined }> = []
    const server = createServer((request) => {
      requests.push({ method: request.method, url: request.url })
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      const address = server.address()
      assert.ok(address && typeof address !== "string", "hanging endpoint must expose a local port")
      await writeFile(join(runRoot, "DevToolsActivePort"), `${address.port}\n/devtools/browser/run-owned`)

      const startedAt = performance.now()
      await assert.rejects(readOwnedCdpPort(runRoot, 0), `${path} must reject a CDP endpoint that accepts but never responds`)
      assert.deepEqual(requests, [{ method: "GET", url: "/json/version" }], `${path} must reach the run-owned endpoint`)
      assert.ok(performance.now() - startedAt < 1_000, `${path} must actively abort instead of hanging`)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
      await rm(runRoot, { recursive: true, force: false })
    }
  }
})
