import { spawn, spawnSync } from "node:child_process";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { deflateSync } from "node:zlib";
import { buildMigrationCandidate, convertProviderConfig, DSH_VERSION, DSMM_VERSION, KEY_REFS, MigrationError, readSourceConfigs, resolveSourceValue } from "./migrate-opencode-models.mjs";

export const name = "dsmm-role-routing-live-probe";
const parentRoute = Object.freeze({ provider: "hoo", model: "deepseek-v4.1-flash", reasoningEffort: "high" });
const childRoute = Object.freeze({ provider: "hoo", model: "glm-5.3", reasoningEffort: "max" });
const hash = (bytes, algorithm = "sha256") => createHash(algorithm).update(bytes).digest(algorithm === "sha256" ? "hex" : "base64");
const fail = (code) => { throw new MigrationError(code); };
const safeCode = (code) => typeof code === "string" && /^[A-Z][A-Z0-9_]{0,80}$/u.test(code) ? code : "NATIVE_ERROR";

// Native probe: retain only selected metadata, never prompt/reasoning/header/key bytes.
export function apply(ctx, config) {
  const profile = ctx.get("profileContext");
  const receipt = { requests: [], headers: [], assemblies: [], descriptors: [], tools: [], wires: [], errors: [], profile: { name: profile?.name, bundles: profile?.startedBundles } };
  const save = () => writeFileSync(config.receipt, JSON.stringify(receipt), { mode: 0o600 });
  const agents = new Map();
  const agentLabel = (id) => {
    if (id === undefined) return undefined;
    if (!agents.has(id)) agents.set(id, `agent-${agents.size + 1}`);
    return agents.get(id);
  };
  const observedRoute = (call) => {
    if (call.provider !== "hoo" || ![parentRoute.model, childRoute.model].includes(call.model)) fail("UNEXPECTED_LIVE_ROUTE");
    if (!["high", "max"].includes(call.reasoningEffort)) fail("UNEXPECTED_LIVE_EFFORT");
    return { provider: call.provider, model: call.model, effort: call.reasoningEffort };
  };
  ctx.on("system-prompt/assemble", async (assembly, context, next) => {
    const final = await next();
    receipt.assemblies.push({ agent: agentLabel(context.agent?.id),
      dsmm: final.sections.some((section) => section.name === "dsmm:deepwork" && section.text.includes("DEEPWORK MODE ENABLED")),
      reviewer: final.sections.some((section) => section.text.includes("You are DW Reviewer (role ID: dsmm-reviewer)")),
      tools: final.tools.map((tool) => tool.name), roleTools: final.tools.filter((tool) => tool.name.startsWith("dsmm_")).map((tool) => tool.name) });
    save();
    return final;
  }, { prepend: true });
  ctx.on("agent/request", async (frame, next) => {
    const call = await next();
    if (receipt.requests.length >= 24) fail("LIVE_REQUEST_BOUND_EXCEEDED");
    const llm = frame.agent.ctx?.get?.("llm") ?? ctx.get("llm");
    const model = await llm.resolveModelInfo(call.provider, call.model, frame.signal);
    const actual = observedRoute(call);
    receipt.requests.push({ agent: agentLabel(frame.agent.id), step: frame.step, ...actual, advertisedEfforts: model.reasoning?.efforts.map((entry) => entry.id) });
    save();
    if (config.probeOnly) { receipt.stoppedBeforeModel = true; save(); fail("ROLE_ROUTE_OFFLINE_PROBE_COMPLETE"); }
    return call;
  }, { prepend: true });
  ctx.on("tools/post-execute", async (execution, result, next) => {
    const decision = await next();
    receipt.tools.push({ name: execution.name, error: result.isError === true, decision: decision.kind });
    save();
    return decision;
  }, { prepend: true });
  ctx.on("agent/error", (frame) => { receipt.errors.push({ code: safeCode(frame.error?.code), ...(Number.isSafeInteger(frame.error?.failure?.status) ? { status: frame.error.failure.status } : {}) }); save(); });
  ctx.on("session/event", (session, event) => {
    if (event.type === "request/header") receipt.headers.push({ session: agentLabel(session.id), ...observedRoute(event.data.header.config) });
    if (event.type === "subagent/descriptor" && event.data.provider === "dsmm-role-reviewer") receipt.descriptors.push({ session: agentLabel(session.id), provider: event.data.provider, version: event.data.version, mode: event.data.mode });
    save();
  });
  // Observe the real native SDK request and forward it unchanged. This is process-local,
  // only in the disposable test host; no Authorization/header inspection is performed.
  const previousFetch = globalThis.fetch;
  const expectedPath = new URL(`${config.hooBaseURL.replace(/\/+$/u, "")}/v1/messages`);
  const observedFetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin === expectedPath.origin && url.pathname === expectedPath.pathname && typeof init?.body === "string") {
      let body;
      try { body = JSON.parse(init.body); } catch { fail("WIRE_BODY_INVALID"); }
      if ([parentRoute.model, childRoute.model].includes(body.model)) {
        receipt.wires.push({ protocol: "anthropic-messages", model: body.model, thinkingType: body.thinking?.type,
          effort: body.output_config?.effort, maxTokens: body.max_tokens, betaQuery: url.searchParams.get("beta") === "true", sourceEndpointPathEquivalent: true });
        save();
      }
    }
    return previousFetch(input, init);
  };
  globalThis.fetch = observedFetch;
  ctx.effect(() => () => { if (globalThis.fetch === observedFetch) globalThis.fetch = previousFetch; });
  save();
}

export function evaluateRoleSmoke(evidence, events, result, nonce, { probeOnly = false } = {}) {
  const parent = evidence.requests[0]?.agent;
  const rootRequests = evidence.requests.filter((entry) => entry.agent === parent);
  const children = evidence.requests.filter((entry) => entry.agent !== parent);
  const childAgents = new Set(children.map((entry) => entry.agent));
  const childAssemblies = evidence.assemblies.filter((entry) => childAgents.has(entry.agent));
  const routeMatches = (entry, route) => entry.provider === route.provider && entry.model === route.model && entry.effort === route.reasoningEffort;
  const checks = {
    parentRoute: rootRequests.length > 0 && rootRequests.every((entry) => routeMatches(entry, parentRoute)),
    advertisedEffort: evidence.requests.length > 0 && evidence.requests.every((entry) => entry.advertisedEfforts?.includes(entry.effort)),
    dsmmPrompt: evidence.assemblies.some((entry) => entry.agent === parent && entry.dsmm),
    reviewerTool: evidence.assemblies.some((entry) => entry.agent === parent && entry.roleTools.includes("dsmm_reviewer")),
    builderDisabled: evidence.assemblies.every((entry) => !entry.roleTools.includes("dsmm_builder"))
  };
  if (probeOnly) {
    Object.assign(checks, { stoppedBeforeModel: evidence.stoppedBeforeModel === true, noWire: evidence.wires.length === 0, noToolExecution: evidence.tools.length === 0 });
    return { checks, outcome: Object.values(checks).every(Boolean) ? "COMPLETED" : "FAILED", kind: "NO_MODEL_PARENT_ROUTE_PROBE", childProof: "NOT_EXERCISED" };
  }
  const final = events.findLast((entry) => entry.type === "final");
  const usage = events.filter((entry) => entry.type === "status" && entry.phase === "step_end" && entry.usage).reduce((total, entry) => ({
    inputTokens: total.inputTokens + Number(entry.usage.inputTokens ?? 0), outputTokens: total.outputTokens + Number(entry.usage.outputTokens ?? 0)
  }), { inputTokens: 0, outputTokens: 0 });
  Object.assign(checks, {
    answer: typeof final?.text === "string" && final.text.includes("DSMM_ROLE_ROUTING_OK"), fixture: result?.nonce === nonce && result?.sum === 42,
    nonzeroUsage: usage.inputTokens > 0 && usage.outputTokens > 0,
    childRoute: children.length > 0 && children.every((entry) => routeMatches(entry, childRoute)),
    readOnlyChild: childAssemblies.length > 0 && childAssemblies.every((entry) => entry.tools.includes("read") && entry.tools.every((tool) => ["read", "glob", "grep"].includes(tool))),
    childPersona: childAssemblies.some((entry) => entry.reviewer),
    trustedChildDescriptor: evidence.descriptors.some((entry) => entry.provider === "dsmm-role-reviewer" && entry.version === 3 && entry.mode === "one-shot"),
    parentPersistedHeaders: evidence.headers.some((entry) => routeMatches(entry, parentRoute)),
    childPersistedHeaders: evidence.headers.some((entry) => routeMatches(entry, childRoute)),
    allPersistedHeaders: evidence.headers.length > 0 && evidence.headers.every((entry) => routeMatches(entry, parentRoute) || routeMatches(entry, childRoute)),
    nativeHighWire: evidence.wires.some((entry) => entry.model === parentRoute.model && entry.thinkingType === "adaptive" && entry.effort === "high"),
    nativeMaxWire: evidence.wires.some((entry) => entry.model === childRoute.model && entry.thinkingType === "adaptive" && entry.effort === "max"),
    read: evidence.tools.some((entry) => entry.name === "read" && !entry.error),
    write: evidence.tools.some((entry) => entry.name === "write" && !entry.error),
    delegatedTool: evidence.tools.some((entry) => entry.name === "dsmm_reviewer" && !entry.error),
    toolRoundtrip: rootRequests.length >= 2 && children.length >= 2, noErrors: evidence.errors.length === 0
  });
  return { outcome: Object.values(checks).every(Boolean) ? "COMPLETED" : "FAILED", kind: "REAL_GATEWAY_ROLE_ROUTING", checks, usage, agentCount: 1 + childAgents.size,
    childTools: [...new Set(childAssemblies.flatMap((entry) => entry.tools))].sort() };
}

export function mediaImageFixture(colorIndex = randomInt(4)) {
  const palette = [{ answer: "red", rgb: [255, 0, 0] }, { answer: "blue", rgb: [0, 0, 255] }, { answer: "green", rgb: [0, 180, 0] }, { answer: "yellow", rgb: [255, 255, 0] }];
  const color = palette[colorIndex];
  if (!color) fail("FIXTURE_COLOR_INVALID");
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (tag, data) => {
    const kind = Buffer.from(tag);
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length); kind.copy(result, 4); data.copy(result, 8);
    result.writeUInt32BE(crc32(Buffer.concat([kind, data])), data.length + 8);
    return result;
  };
  const width = 128; const height = 128;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raster = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let channel = 0; channel < 3; channel++) raster[y * (width * 3 + 1) + 1 + x * 3 + channel] = color.rgb[channel];
  const data = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raster)), chunk("IEND", Buffer.alloc(0))]);
  return { data, answer: color.answer, mediaType: "image/png", width, height, sha256: hash(data) };
}

export async function runMediaProbe(runtime, source, { probeOnly = false, timeout = 120000 } = {}) {
  const req = createRequire(join(resolve(runtime), "package.json"));
  const load = (specifier) => import(pathToFileURL(req.resolve(specifier)).href);
  const [cordis, llm, pi, attachments, environment] = await Promise.all(["@deepseek-ai/cordis", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@deepseek-ai/dsh-attachment-local", "@deepseek-ai/dsh-launch-environment"].map(load));
  const media = "doubao-seed-2.1-turbo";
  const baseProfile = convertProviderConfig("hoo", source.opencode.provider.hoo, { modelIds: ["glm-5.3", "deepseek-v4-pro", "deepseek-v4.1-flash"] });
  const key = resolveSourceValue(source.opencode.provider.hoo.options?.apiKey);
  const fixture = mediaImageFixture();
  const owned = mkdtempSync(join(tmpdir(), "dsmm-media-probe-"));
  const ctx = new cordis.Context();
  const previousFetch = globalThis.fetch;
  const expected = new URL(`${baseProfile.baseURL}/v1/messages`);
  let discoveredInput;
  let discoveryRequests = 0;
  let stage = "ENVIRONMENT";
  const wires = [];
  let report = { outcome: "FAILED", kind: probeOnly ? "NO_MODEL_MEDIA_FIXTURE_PROBE" : "REAL_GATEWAY_MEDIA_IMAGE", dshVersion: DSH_VERSION,
    provider: "hoo", model: media, protocol: "anthropic-messages", sourceHashes: source.hashes, fixtureSha256: fixture.sha256, fixtureBytes: fixture.data.length, outputTokenLimit: 128, retries: 0 };
  const observedFetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin === expected.origin && url.pathname === expected.pathname && typeof init?.body === "string") {
      const body = JSON.parse(init.body);
      if (body.model !== media || wires.length >= 1) fail("MEDIA_REQUEST_BOUND_EXCEEDED");
      wires.push({ protocol: "anthropic-messages", model: media, maxTokens: body.max_tokens, namedEffort: body.output_config?.effort !== undefined,
        imageBlocks: body.messages.flatMap((message) => Array.isArray(message.content) ? message.content : []).filter((block) => block.type === "image").length });
      if (probeOnly) fail("OFFLINE_MEDIA_NETWORK_FORBIDDEN");
    }
    const response = await previousFetch(input, init);
    if (url.origin === expected.origin && url.pathname === expected.pathname.replace(/\/messages$/u, "/models")) {
      discoveryRequests++;
      if (response.ok) {
        try {
          const listing = await response.clone().json();
          const entry = Array.isArray(listing.data) ? listing.data.find((item) => item.id === media) : listing.models?.[media];
          const declared = entry?.input ?? entry?.input_modalities ?? entry?.modalities?.input;
          if (Array.isArray(declared) && declared.length && declared.every((mode) => ["text", "image"].includes(mode))) discoveredInput = [...new Set(declared)];
        } catch { /* Native discovery owns its own parse/failure result. */ }
      }
    }
    return response;
  };
  try {
    // The native credential reference resolves in memory; neither a credential file
    // nor the process environment is copied, restored, or changed.
    ctx.provide("launchEnvironment", environment.createLaunchEnvironmentSnapshot([{ source: "process", values: { [KEY_REFS.hoo]: key } }]));
    stage = "LLM_MOUNT";
    await ctx.plugin(llm.LlmRuntime, {}).await();
    stage = "ATTACHMENT_MOUNT";
    await ctx.plugin(attachments.LocalAttachmentStore, { dshHome: owned, maxImageBytes: 65536, maxImagesPerMessage: 1, maxMessageImageBytes: 65536, maxImagePixels: 65536, maxImageDimension: 256 }).await();
    const ephemeralModel = { id: media, input: ["text", "image"] };
    stage = "PI_AI_MOUNT";
    await ctx.plugin(pi, { providers: { hoo: { ...baseProfile, models: [ephemeralModel], retryPolicy: { mode: "normal", maxRetries: 0 } } } }).await();
    stage = "FIXTURE_VALIDATION";
    await ctx.attachments.validateImage({ data: fixture.data, mediaType: fixture.mediaType });
    if (probeOnly) {
      report = { ...report, outcome: "COMPLETED", fixtureValid: true, paidCalls: 0, discoveryRequests: 0, imageAccepted: false, modelEvidence: {} };
    } else {
      globalThis.fetch = observedFetch;
      const signal = AbortSignal.timeout(timeout);
      stage = "NATIVE_DISCOVERY";
      const rows = await ctx.llm.discoverModels("llm-pi-ai", { provider: "hoo", api: "anthropic-messages", baseURL: baseProfile.baseURL }, signal);
      const metadata = rows.find((row) => row.id === media);
      if (!metadata) fail("MEDIA_MODEL_NOT_DISCOVERED");
      stage = "ATTACHMENT_SAVE";
      const image = await ctx.attachments.saveImage({ data: fixture.data, mediaType: fixture.mediaType, name: "fixture.png" });
      let answer = ""; let usage; let finish;
      const outputLimit = Math.min(128, metadata.maxTokens ?? 128);
      stage = "IMAGE_REQUEST";
      for await (const event of ctx.llm.stream({ provider: "hoo", model: media, maxTokens: outputLimit, signal,
        messages: [{ role: "user", content: [{ type: "text", text: "What is the dominant color in the attached image? Answer one color word in English and nothing else." }, { type: "image", attachment: image }] }] })) {
        if (event.type === "text-delta") { answer += event.text; if (answer.length > 1024) fail("MEDIA_TEXT_BOUND_EXCEEDED"); }
        if (event.type === "usage") usage = { inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens };
        if (event.type === "finish") finish = event.reason.kind;
      }
      const answerMatches = answer.trim().toLowerCase().replace(/[.!]$/u, "") === fixture.answer;
      const accepted = finish === "stop" && answerMatches && usage?.inputTokens > 0 && usage?.outputTokens > 0 && wires.length === 1 && wires[0].imageBlocks === 1 && wires[0].maxTokens <= 128 && !wires[0].namedEffort;
      const declaration = { input: ["text", "image"], imageAccepted: true,
        ...(metadata.contextWindow === undefined ? {} : { contextWindow: metadata.contextWindow }), ...(metadata.maxTokens === undefined ? {} : { maxTokens: metadata.maxTokens }) };
      report = { ...report, outcome: accepted ? "COMPLETED" : "FAILED", imageAccepted: accepted, answerMatches, usage, finish, discoveryRequests, paidCalls: wires.length, wires,
        discoveredMetadata: { contextWindow: metadata.contextWindow, maxTokens: metadata.maxTokens, input: discoveredInput },
        modelEvidence: accepted ? { [`hoo/${media}`]: declaration } : {} };
    }
  } catch (error) { report = { ...report, outcome: "FAILED", stage, code: error instanceof MigrationError ? error.code : safeCode(error?.code), imageAccepted: false, discoveryRequests, paidCalls: wires.length, wires, modelEvidence: {} }; }
  finally {
    if (globalThis.fetch === observedFetch) globalThis.fetch = previousFetch;
    await ctx.fiber.dispose();
    rmSync(owned, { recursive: true, force: true });
    report.temporaryHomeRemoved = !existsSync(owned);
    report.credentialStoreCopiedOrWritten = false;
  }
  return report;
}

async function resolveInstall(values, owned) {
  if (values.package && values.registry) fail("CHOOSE_ONE_PACKAGE_IDENTITY");
  if (values.package) {
    if (!/^[a-f0-9]{64}$/u.test(values["expected-sha256"] ?? "")) fail("FROZEN_ARTIFACT_SHA256_REQUIRED");
    const artifact = resolve(values.package);
    const bytes = readFileSync(artifact);
    const packedSha256 = hash(bytes);
    if (packedSha256 !== values["expected-sha256"]) fail("FROZEN_ARTIFACT_CHANGED");
    return { spec: artifact, artifact, packedSha256, integrity: `sha512-${hash(bytes, "sha512")}`, provenance: "FROZEN_LOCAL_TARBALL" };
  }
  if (values.registry !== `@dsmm/dsmm@${DSMM_VERSION}` || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(values["expected-integrity"] ?? "")) fail("EXACT_REGISTRY_IDENTITY_REQUIRED");
  const response = await fetch(`https://registry.npmjs.org/@dsmm%2fdsmm/${DSMM_VERSION}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) fail("REGISTRY_MANIFEST_UNAVAILABLE");
  const manifest = await response.json();
  if (manifest.name !== "@dsmm/dsmm" || manifest.version !== DSMM_VERSION || manifest.dist?.integrity !== values["expected-integrity"]) fail("REGISTRY_INTEGRITY_MISMATCH");
  const url = new URL(manifest.dist.tarball);
  if (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org" || url.username || url.password) fail("REGISTRY_TARBALL_URL_INVALID");
  const download = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!download.ok) fail("REGISTRY_TARBALL_UNAVAILABLE");
  const bytes = Buffer.from(await download.arrayBuffer());
  if (`sha512-${hash(bytes, "sha512")}` !== values["expected-integrity"]) fail("REGISTRY_BYTES_INTEGRITY_MISMATCH");
  const artifact = join(owned, `dsmm-dsmm-${DSMM_VERSION}.tgz`);
  writeFileSync(artifact, bytes, { mode: 0o600, flag: "wx" });
  return { spec: values.registry, artifact, packedSha256: hash(bytes), integrity: values["expected-integrity"], provenance: "EXACT_REGISTRY_VERSION" };
}

export async function main(args = process.argv.slice(2)) {
  let values = {};
  let owned;
  let source;
  let probeReceipt;
  let report = { outcome: "FAILED", dshVersion: DSH_VERSION, package: { name: "@dsmm/dsmm", version: DSMM_VERSION }, parentRoute, childRoute, media: "UNRESOLVED_NOT_TESTED" };
  try {
    ({ values } = parseArgs({ args, options: { runtime: { type: "string" }, package: { type: "string" }, registry: { type: "string" }, "expected-sha256": { type: "string" }, "expected-integrity": { type: "string" },
      live: { type: "boolean", default: false }, "probe-only": { type: "boolean", default: false }, "media-probe": { type: "boolean", default: false }, receipt: { type: "string" }, timeout: { type: "string", default: "240000" } } }));
    if (values.live && values["probe-only"]) fail("CHOOSE_LIVE_OR_PROBE_ONLY");
    if (!values.live && !values["probe-only"]) {
      report = { ...report, outcome: "DRY_RUN", required: values["media-probe"] ? ["--runtime", "--media-probe", "--live OR --probe-only"] : ["--runtime", "--package plus --expected-sha256 OR --registry plus --expected-integrity", "--live OR --probe-only"], paidCalls: 0 };
      process.stdout.write(`${JSON.stringify(report)}\n`);
      return report;
    }
    if (!values.runtime) fail("PINNED_RUNTIME_REQUIRED");
    const timeout = Number(values.timeout);
    if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 600000) fail("TIMEOUT_INVALID");
    const runtime = resolve(values.runtime);
    const req = createRequire(join(runtime, "package.json"));
    const manifestPath = req.resolve("@deepseek-ai/dsh/package.json");
    if (JSON.parse(readFileSync(manifestPath, "utf8")).version !== DSH_VERSION) fail("DSH_VERSION_MISMATCH");
    const cli = join(dirname(manifestPath), "lib", "bin.js");
    source = await readSourceConfigs();
    if (values["media-probe"]) {
      report = await runMediaProbe(runtime, source, { probeOnly: values["probe-only"], timeout });
    } else {
    const candidate = buildMigrationCandidate(source.opencode, source.ocmm);
    owned = mkdtempSync(join(tmpdir(), "dsmm-role-routing-"));
    const home = join(owned, "home");
    const workspace = join(owned, "workspace");
    mkdirSync(home, { mode: 0o700 }); mkdirSync(workspace, { mode: 0o700 });
    const installation = await resolveInstall(values, owned);
    report = { ...report, packedSha256: installation.packedSha256, integrity: installation.integrity, artifactProvenance: installation.provenance, sourceHashes: source.hashes };
    const profile = "dsmm-role-routing-smoke";
    const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_MODE: "DISABLED", DSH_TELEMETRY_DISABLED: "1", DSH_PERMISSION_MODE: "workspace-write" };
    for (const [ref, value] of Object.entries(candidate.secrets)) env[ref] = value;
    const run = (args, stage, allowNonzero = false) => new Promise((fulfill, reject) => {
      const child = spawn(process.execPath, [cli, ...args], { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
      let timedOut = false; let overflow = false; let length = 0; let stopped = false; const chunks = [];
      const stopOwnedChild = () => {
        if (stopped || child.pid === undefined) return;
        stopped = true;
        if (process.platform === "win32") spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
      };
      const timer = setTimeout(() => { timedOut = true; stopOwnedChild(); }, timeout);
      child.stdout.on("data", (chunk) => { length += chunk.length; if (length <= 8 * 1024 * 1024) chunks.push(chunk); else { overflow = true; stopOwnedChild(); } });
      child.stderr.on("data", () => {});
      child.once("error", () => { clearTimeout(timer); reject(new MigrationError(`${stage}_SPAWN_FAILED`)); });
      child.once("close", (code) => { clearTimeout(timer); if (timedOut || overflow || code !== 0 && !allowNonzero) reject(new MigrationError(`${stage}_${timedOut ? "TIMEOUT" : overflow ? "OUTPUT_BOUND" : "FAILED"}`)); else fulfill(Buffer.concat(chunks).toString("utf8")); });
    });
    await run(["--profile", profile, "--from-default-profile", "headless", "--dump-config"], "INITIALIZE");
    await run(["plugin", "--profile", profile, "add", installation.spec], "INSTALL");
    const profileRequire = createRequire(join(home, "profiles", profile, "package.json"));
    const installed = JSON.parse(readFileSync(profileRequire.resolve("@dsmm/dsmm/package.json"), "utf8"));
    if (installed.name !== "@dsmm/dsmm" || installed.version !== DSMM_VERSION) fail("INSTALLED_DSMM_IDENTITY_MISMATCH");
    profileRequire.resolve("@dsmm/dsmm/preset-skills");
    if (hash(readFileSync(installation.artifact)) !== installation.packedSha256) fail("FROZEN_ARTIFACT_CHANGED");
    probeReceipt = join(owned, "native-route-metadata.json");
    const patch = join(owned, "live-routing.patch.yml");
    const provider = copySmokeProvider(candidate.providers.hoo);
    const yaml = req("yaml");
    writeFileSync(patch, yaml.stringify([
      { id: "dsmm", config: { defaultActive: true, workflow: { policy: "risk-based" }, roles: { "dsmm-builder": false },
        roleRouting: { "dsmm-orchestrator": { primary: parentRoute, fallbackRoutes: [] }, "dsmm-reviewer": { primary: childRoute, fallbackRoutes: [] } }, runtimeRecovery: { enabled: false } } },
      { id: "agent-default-model", config: { provider: "hoo", model: parentRoute.model, reasoningEffort: "high" } },
      { id: "llm-pi-ai", config: { providers: { hoo: provider } } },
      { insert: [{ id: "dsmm-role-live-probe", name: pathToFileURL(fileURLToPath(import.meta.url)).href, config: { receipt: probeReceipt, hooBaseURL: provider.baseURL, probeOnly: values["probe-only"] } }] }
    ]), { mode: 0o600, flag: "wx" });
    const common = ["--profile", profile, "--patch", patch];
    const dump = await run([...common, "--dump-config"], "COMPOSITION");
    if (!dump.includes("id: dsmm") || !dump.includes("roleRouting:") || !dump.includes("forceAdaptiveThinking: true")) fail("NATIVE_COMPOSITION_MISSING");
    const nonce = randomUUID();
    writeFileSync(join(workspace, "input.json"), JSON.stringify({ nonce, left: 19, right: 23 }), { mode: 0o600, flag: "wx" });
    const prompt = "This is an explicitly authorized, small bounded role-routing integration smoke. Use read to inspect input.json. Call dsmm_reviewer exactly once, asking that read-only child to read input.json, report its nonce, and sum left plus right. It must not write, execute shell, or delegate. After its real response use write to create result.json containing only JSON with the original nonce and sum. Finally reply DSMM_ROLE_ROUTING_OK. Use only read, dsmm_reviewer, and write; do not modify other files. This smoke is already planned and approved: no other role, review, design document, goal tool, or approval is needed. The configured parent Flash-high and reviewer GLM-max routes must remain unchanged.";
    const output = await run([...common, "--json", prompt], "REAL_MODEL", values["probe-only"]);
    if (!existsSync(probeReceipt)) fail("NATIVE_PROBE_RECEIPT_MISSING");
    const evidence = JSON.parse(readFileSync(probeReceipt, "utf8"));
    const events = output.split(/\r?\n/u).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
    const resultPath = join(workspace, "result.json");
    const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")) : undefined;
    Object.assign(report, evaluateRoleSmoke(evidence, events, result, nonce, { probeOnly: values["probe-only"] }), { requests: evidence.requests, headers: evidence.headers, wires: evidence.wires, descriptors: evidence.descriptors, tools: evidence.tools, errors: evidence.errors });
    report.sourceCredentialStoreCopied = false;
    report.keysWrittenToIsolatedFiles = existsSync(join(home, ".credentials.yaml"));
    if (report.keysWrittenToIsolatedFiles) { report.outcome = "FAILED"; report.code = "UNEXPECTED_ISOLATED_CREDENTIAL_FILE"; }
    }
  } catch (error) {
    report = { ...report, outcome: "FAILED", code: error instanceof MigrationError ? error.code : "LIVE_SMOKE_OPERATION_FAILED" };
    if (probeReceipt && existsSync(probeReceipt)) {
      try {
        const evidence = JSON.parse(readFileSync(probeReceipt, "utf8"));
        Object.assign(report, { requests: evidence.requests, headers: evidence.headers, wires: evidence.wires, descriptors: evidence.descriptors, tools: evidence.tools, errors: evidence.errors });
      } catch { report.probeEvidenceUnreadable = true; }
    }
  }
  finally {
    if (source) {
      try { const current = await readSourceConfigs(); report.sourceConfigsAndKeysUntouched = current.hashes.opencode === source.hashes.opencode && current.hashes.ocmm === source.hashes.ocmm; }
      catch { report.sourceConfigsAndKeysUntouched = false; }
      if (!report.sourceConfigsAndKeysUntouched) report.outcome = "FAILED";
    }
    if (owned) { rmSync(owned, { recursive: true, force: true }); report.temporaryHomeRemoved = !existsSync(owned); }
  }
  if (values.receipt) writeFileSync(resolve(values.receipt), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.outcome !== "COMPLETED") process.exitCode = 1;
  return report;
}

function copySmokeProvider(profile) {
  return { ...structuredClone(profile), retryPolicy: { mode: "normal", maxRetries: 0 },
    models: profile.models.filter((model) => [parentRoute.model, childRoute.model].includes(model.id)).map((model) => ({ ...structuredClone(model), maxTokens: 4096 })) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
