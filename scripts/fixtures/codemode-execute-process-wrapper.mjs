import { spawn } from "node:child_process"
import { appendFileSync, existsSync } from "node:fs"

const [pidFile, command, ...args] = process.argv.slice(2)
if (!pidFile || !command) {
  process.stderr.write("usage: node codemode-execute-process-wrapper.mjs <pid-file> <command> [args...]\n")
  process.exit(64)
}

const child = spawn(command, args, { stdio: "inherit", windowsHide: true })

let stopping = false
let requestedStop = false
let ownershipWriteFailed = false
let forceTimer
let stopTimer
const stopPath = process.env.OCMM_CODEMODE_STOP_PATH

function stop(signal, requested = true) {
  if (stopping) return
  stopping = true
  requestedStop = requested
  if (stopTimer) clearInterval(stopTimer)
  if (child.exitCode === null) {
    try { child.kill(signal) } catch { /* child already exited */ }
    forceTimer = setTimeout(() => {
      if (child.exitCode === null) {
        try { child.kill("SIGKILL") } catch { /* child already exited */ }
      }
    }, 750)
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal, true))
}
process.on("exit", () => {
  if (child.exitCode === null) {
    try { child.kill("SIGTERM") } catch { /* child already exited */ }
  }
})

child.once("error", (error) => {
  if (stopTimer) clearInterval(stopTimer)
  if (forceTimer) clearTimeout(forceTimer)
  stopping = true
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
child.once("exit", (code, signal) => {
  if (stopTimer) clearInterval(stopTimer)
  if (forceTimer) clearTimeout(forceTimer)
  stopping = true
  process.exitCode = ownershipWriteFailed ? 1 : requestedStop ? 0 : typeof code === "number" ? code : signal ? 1 : 0
})

try {
  appendFileSync(pidFile, `${JSON.stringify({ wrapperPid: process.pid, nativePid: child.pid ?? null })}\n`)
} catch (error) {
  ownershipWriteFailed = true
  process.stderr.write(`failed to record process ownership: ${error instanceof Error ? error.message : String(error)}\n`)
  stop("SIGTERM", false)
}

if (!stopping && stopPath) {
  stopTimer = setInterval(() => {
    if (existsSync(stopPath)) stop("SIGTERM", true)
  }, 25)
}
