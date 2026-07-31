import type {
  CheckReleaseCompletionOptions,
  Clock,
  CompletionOutcome,
  ReleaseCompletionReceipt,
} from "./contracts.ts"
import { createProductionHttpClient, isPositiveSafeInteger, isValidDate, parsePositiveSafeInteger, validRepository } from "./http.ts"
import { addFailure, finalizeReceipt, makeReceipt } from "./receipt.ts"
import { checkReleaseCompletion } from "./remote.ts"
import { validateStagedReleaseAssets } from "./staged.ts"

export interface CliRuntime {
  clock: Clock
  check(options: Omit<CheckReleaseCompletionOptions, "http">): Promise<ReleaseCompletionReceipt>
  validateStaged(root: string, assetsDir: string, tag: string, checkedAt: Date): ReleaseCompletionReceipt
  writeStdout(value: string): void
}

type CliOptions =
  | {
    mode: "staged"
    tag: string
    assetsDir: string
  }
  | {
    mode: "remote"
    repository: string
    tag: string
    runId?: number
    deadlineMs: number
    pollIntervalMs: number
  }

const CLI_OPTION_NAMES = new Set([
  "--mode",
  "--repository",
  "--tag",
  "--run-id",
  "--deadline-ms",
  "--poll-ms",
  "--assets-dir",
])
const DEFAULT_DEADLINE_MS = 5_400_000
const DEFAULT_POLL_INTERVAL_MS = 15_000

function parseCliOptions(argv: readonly string[], checkedAt: Date): CliOptions | null {
  const values = new Map<string, string>()
  const optionArgv = argv[0] === "--" ? argv.slice(1) : argv
  for (let index = 0; index < optionArgv.length; index += 1) {
    const option = optionArgv[index]
    if (option === undefined || !CLI_OPTION_NAMES.has(option)) return null
    const value = optionArgv[index + 1]
    if (value === undefined || value.startsWith("--") || values.has(option)) return null
    values.set(option, value)
    index += 1
  }

  const mode = values.get("--mode")
  const tag = values.get("--tag")
  if ((mode !== "staged" && mode !== "remote") || tag === undefined || tag.length === 0) return null

  if (mode === "staged") {
    const assetsDir = values.get("--assets-dir")
    if (
      assetsDir === undefined
      || assetsDir.length === 0
      || values.has("--repository")
      || values.has("--run-id")
      || values.has("--deadline-ms")
      || values.has("--poll-ms")
    ) {
      return null
    }
    return { mode, tag, assetsDir }
  }

  const repository = values.get("--repository")
  if (repository === undefined || !validRepository(repository) || values.has("--assets-dir")) return null
  const runId = values.get("--run-id")
  const deadlineMs = values.has("--deadline-ms") ? parsePositiveSafeInteger(values.get("--deadline-ms")) : DEFAULT_DEADLINE_MS
  const pollIntervalMs = values.has("--poll-ms") ? parsePositiveSafeInteger(values.get("--poll-ms")) : DEFAULT_POLL_INTERVAL_MS
  const parsedRunId = runId === undefined ? undefined : parsePositiveSafeInteger(runId)
  if (
    deadlineMs === null
    || pollIntervalMs === null
    || (runId !== undefined && parsedRunId === null)
    || !isValidDate(checkedAt)
    || !isPositiveSafeInteger(checkedAt.getTime() + deadlineMs)
  ) {
    return null
  }
  return {
    mode,
    repository,
    tag,
    ...(typeof parsedRunId === "number" ? { runId: parsedRunId } : {}),
    deadlineMs,
    pollIntervalMs,
  }
}

function cliFailureReceipt(checkedAt: Date, code: "cli_arguments_invalid" | "cli_execution_failed"): ReleaseCompletionReceipt {
  const receipt = makeReceipt({}, checkedAt)
  addFailure(
    receipt,
    "identity",
    code,
    code === "cli_arguments_invalid"
      ? "release completion CLI arguments are invalid"
      : "release completion check did not complete",
  )
  return finalizeReceipt(receipt)
}

function exitCodeForOutcome(outcome: CompletionOutcome): 0 | 1 | 2 {
  if (outcome === "COMPLETED") return 0
  if (outcome === "UNRESOLVED") return 2
  return 1
}

export function createProductionClock(): Clock {
  return {
    now: () => new Date(),
    sleep: (ms) => new Promise<void>((resolve) => { setTimeout(resolve, ms) }),
  }
}

export function createProductionRuntime(clock: Clock): CliRuntime {
  const http = createProductionHttpClient()
  return {
    clock,
    check: (options) => checkReleaseCompletion({ ...options, http }),
    validateStaged: validateStagedReleaseAssets,
    writeStdout: (value) => { process.stdout.write(value) },
  }
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  runtime?: CliRuntime,
): Promise<0 | 1 | 2> {
  const effectiveRuntime = runtime ?? createProductionRuntime(createProductionClock())
  const checkedAt = effectiveRuntime.clock.now()
  const options = parseCliOptions(argv, checkedAt)
  let receipt: ReleaseCompletionReceipt

  if (options === null) {
    receipt = cliFailureReceipt(checkedAt, "cli_arguments_invalid")
  } else {
    try {
      receipt = options.mode === "staged"
        ? effectiveRuntime.validateStaged(process.cwd(), options.assetsDir, options.tag, checkedAt)
        : await effectiveRuntime.check({
          root: process.cwd(),
          repository: options.repository,
          tag: options.tag,
          deadlineMs: options.deadlineMs,
          pollIntervalMs: options.pollIntervalMs,
          checkedAt,
          clock: effectiveRuntime.clock,
          ...(options.runId === undefined ? {} : { runId: options.runId }),
          ...(env.GITHUB_TOKEN === undefined ? {} : { githubToken: env.GITHUB_TOKEN }),
        })
    } catch {
      receipt = cliFailureReceipt(checkedAt, "cli_execution_failed")
    }
  }

  effectiveRuntime.writeStdout(`${JSON.stringify(receipt, null, 2)}\n`)
  return exitCodeForOutcome(receipt.outcome)
}
