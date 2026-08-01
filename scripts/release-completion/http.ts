import type {
  Clock,
  HttpClient,
  HttpDisposition,
  HttpRequest,
  HttpResponse,
  HttpService,
} from "./contracts.ts"

const SHA = /^[0-9a-f]{40}$/
const POSITIVE_DECIMAL = /^[1-9]\d*$/
const REPOSITORY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const GITHUB_API_ORIGIN = "https://api.github.com"

export class HttpContractError extends Error {}

export type JsonResult =
  | { kind: "success"; value: unknown }
  | { kind: "retry" }
  | { kind: "failed" }

export type BytesResult =
  | { kind: "success"; bytes: Uint8Array }
  | { kind: "retry" }
  | { kind: "failed" }

export function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime())
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

export function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return Object.fromEntries(Object.entries(value))
}

export function objectField(value: Record<string, unknown>, name: string): Record<string, unknown> | null {
  return asObject(value[name])
}

export function stringField(value: Record<string, unknown>, name: string): string | null {
  const candidate = value[name]
  return typeof candidate === "string" ? candidate : null
}

export function normalizedSha(value: unknown): string | null {
  return typeof value === "string" && SHA.test(value) ? value : null
}

export function parsePositiveSafeInteger(value: string | undefined): number | null {
  if (value === undefined || !POSITIVE_DECIMAL.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function validRepository(repository: string): boolean {
  const segments = repository.split("/")
  return segments.length === 2 && segments.every((segment) => REPOSITORY_SEGMENT.test(segment))
}

export function normalizeResponseHeaders(entries: Iterable<readonly [string, string]>): Readonly<Record<string, string>> {
  const normalized: Record<string, string> = {}
  for (const entry of entries) {
    const [rawName, rawValue] = entry
    if (typeof rawName !== "string" || typeof rawValue !== "string") {
      throw new HttpContractError("invalid normalized HTTP headers")
    }
    const name = rawName.toLowerCase()
    const value = rawValue.replace(/^[ \t]+|[ \t]+$/g, "")
    if (!/^[a-z0-9-]+$/.test(name) || /[\u0000-\u001f\u007f]/.test(value) || Object.hasOwn(normalized, name)) {
      throw new HttpContractError("invalid normalized HTTP headers")
    }
    normalized[name] = value
  }
  return normalized
}

export function createProductionHttpClient(): HttpClient {
  return async ({ url, headers }) => {
    const response = await fetch(url, {
      headers: Object.fromEntries(Object.entries(headers)),
      redirect: "follow",
    })
    return {
      status: response.status,
      headers: normalizeResponseHeaders(response.headers.entries()),
      body: new Uint8Array(await response.arrayBuffer()),
    }
  }
}

function hasCredibleGitHubRateLimit(headers: Readonly<Record<string, string>>, now: Date): boolean {
  if (!isValidDate(now)) return false
  if (parsePositiveSafeInteger(headers["retry-after"]) !== null) return true
  if (headers["x-ratelimit-remaining"] !== "0") return false
  const resetSeconds = parsePositiveSafeInteger(headers["x-ratelimit-reset"])
  if (resetSeconds === null || !Number.isSafeInteger(resetSeconds * 1000)) return false
  return resetSeconds * 1000 > now.getTime()
}

export function classifyHttp(
  response: Pick<HttpResponse, "status" | "headers">,
  context: { service: HttpService; now: Date },
): HttpDisposition {
  if (!Number.isInteger(response.status)) return "failed"
  if (response.status === 200) return "success"
  if (response.status === 429 || response.status === 404 || (response.status >= 500 && response.status <= 599)) {
    return "retry"
  }
  if (response.status === 403 && context.service === "github-api" && hasCredibleGitHubRateLimit(response.headers, context.now)) {
    return "retry"
  }
  return "failed"
}

export function decodeJson(body: Uint8Array): unknown {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body)
  } catch {
    throw new HttpContractError("invalid JSON response")
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpContractError("invalid JSON response")
  }
}

export async function requestJson(
  http: HttpClient,
  request: HttpRequest,
  service: HttpService,
  clock: Clock,
): Promise<JsonResult> {
  let response: HttpResponse
  try {
    response = await http(request)
  } catch (error: unknown) {
    return error instanceof HttpContractError ? { kind: "failed" } : { kind: "retry" }
  }

  let headers: Readonly<Record<string, string>>
  try {
    headers = normalizeResponseHeaders(Object.entries(response.headers))
  } catch {
    return { kind: "failed" }
  }

  const disposition = classifyHttp({ status: response.status, headers }, { service, now: clock.now() })
  if (disposition === "retry") return { kind: "retry" }
  if (disposition !== "success") return { kind: "failed" }

  try {
    return { kind: "success", value: decodeJson(response.body) }
  } catch {
    return { kind: "failed" }
  }
}

export async function requestBytes(
  http: HttpClient,
  request: HttpRequest,
  service: HttpService,
  clock: Clock,
): Promise<BytesResult> {
  let response: HttpResponse
  try {
    response = await http(request)
  } catch (error: unknown) {
    return error instanceof HttpContractError ? { kind: "failed" } : { kind: "retry" }
  }

  let headers: Readonly<Record<string, string>>
  try {
    headers = normalizeResponseHeaders(Object.entries(response.headers))
  } catch {
    return { kind: "failed" }
  }

  const disposition = classifyHttp({ status: response.status, headers }, { service, now: clock.now() })
  if (disposition === "retry") return { kind: "retry" }
  if (disposition !== "success") return { kind: "failed" }
  return { kind: "success", bytes: response.body }
}
