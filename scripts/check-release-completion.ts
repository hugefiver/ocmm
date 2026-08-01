import { pathToFileURL } from "node:url"

import { main } from "./release-completion/cli.ts"

export type {
  CheckReleaseCompletionOptions,
  Clock,
  CompletionOutcome,
  HttpClient,
  HttpDisposition,
  HttpRequest,
  HttpResponse,
  HttpService,
  ReleaseCompletionReceipt,
  ReleaseLane,
  ReleaseTarget,
  SurfaceReceipt,
  SurfaceStatus,
} from "./release-completion/contracts.ts"
export type { CliRuntime } from "./release-completion/cli.ts"

export { createProductionClock, createProductionRuntime, main } from "./release-completion/cli.ts"
export {
  classifyHttp,
  createProductionHttpClient,
  normalizeResponseHeaders,
} from "./release-completion/http.ts"
export { checkReleaseCompletion } from "./release-completion/remote.ts"
export { validateStagedReleaseAssets } from "./release-completion/staged.ts"
export { expectedReleaseAssets, parseReleaseTarget } from "./release-completion/target.ts"

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main()
