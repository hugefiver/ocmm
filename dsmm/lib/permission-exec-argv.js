import { isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { realpath } from "node:fs/promises";
import { LocalSubprocessRuntime } from "@deepseek-ai/dsh-subprocess-local";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { permissionOriginal } from "./permission-control.js";
// Resolve the public seam through the installed local provider, not private provider files.
const subprocessModule = createRequire(createRequire(import.meta.url).resolve("@deepseek-ai/dsh-subprocess-local"))("@deepseek-ai/dsh-subprocess");
export function effectiveArgvEnvironment(overrides, parent = subprocessModule.scrubbedParentEnv()) {
    const entries = new Map();
    const ambiguous = new Set();
    const keyOf = (key) => process.platform === "win32" ? key.toUpperCase() : key;
    for (const [key, value] of Object.entries(parent)) {
        const normalized = keyOf(key);
        if (entries.has(normalized) && entries.get(normalized) !== value)
            ambiguous.add(normalized);
        entries.set(normalized, value);
    }
    for (const [key, value] of Object.entries(overrides)) {
        ambiguous.delete(keyOf(key));
        if (value === undefined)
            entries.delete(keyOf(key));
        else
            entries.set(keyOf(key), value);
    }
    if (ambiguous.size)
        throw new Error("Ambiguous case-insensitive target environment.");
    return JSON.stringify([...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
function parseInput(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError("Expected structured argv.");
    const row = value;
    if (Object.keys(row).some(key => !["executable", "args", "cwd"].includes(key)) || typeof row.executable !== "string"
        || !isAbsolute(row.executable) || typeof row.cwd !== "string" || !isAbsolute(row.cwd)
        || !Array.isArray(row.args) || row.args.some(arg => typeof arg !== "string" || arg.includes("\0"))
        || row.executable.includes("\0") || row.cwd.includes("\0"))
        throw new TypeError("Absolute executable/cwd and a complete string argv are required.");
    return Object.freeze({ executable: row.executable, cwd: row.cwd, args: Object.freeze([...row.args]) });
}
async function assertCanonical(input) {
    const [executable, cwd] = await Promise.all([realpath(input.executable), realpath(input.cwd)]);
    if (executable !== input.executable || cwd !== input.cwd)
        throw new Error("Use canonical absolute executable and working-directory paths.");
}
/** Explicit argv only. Native shell tools keep their own semantics and approvals. */
export function installPermissionExecArgv(ctx, options) {
    const subprocess = ctx.get("subprocess"), sandbox = ctx.get("sandbox"), policyService = ctx.get("sandboxPolicy");
    if (!subprocess || !policyService)
        throw new Error("Native subprocess and sandbox policy services required.");
    const original = permissionOriginal(subprocess);
    const policyOwner = permissionOriginal(policyService), sandboxOwner = sandbox && permissionOriginal(sandbox);
    const spawnMethod = Reflect.get(original, "spawn"), resolveMethod = Reflect.get(original, "resolveExecutable");
    const policyMethod = Reflect.get(policyOwner, "resolve"), confineMethod = sandboxOwner && Reflect.get(sandboxOwner, "confine");
    if (Object.getPrototypeOf(original) !== LocalSubprocessRuntime.prototype
        || Reflect.get(original, "spawn") !== LocalSubprocessRuntime.prototype.spawn
        || Reflect.get(original, "resolveExecutable") !== LocalSubprocessRuntime.prototype.resolveExecutable)
        throw new Error("Only the verified local subprocess provider is supported.");
    const overrides = Object.freeze({ ...options.environment }), lifetime = new AbortController();
    if (Object.keys(overrides).some(key => overrides[key] !== undefined && (subprocessModule.SENSITIVE_ENV_PATTERN.test(key) || /^DSH_/iu.test(key))))
        throw new Error("Credential and Host identity overrides are not supported by this tool.");
    const prepared = new Map();
    const definition = defineTool({
        name: "dsmm_exec_argv",
        description: "Run an absolute executable with complete literal argv and cwd under the current sandbox. No shell, env input, escalation, stdin or PTY. Approval does not pin binary contents or make subprocesses/hook effects read-only.",
        parameters: {
            executable: { type: "string", required: true },
            args: { type: "array", items: { type: "string" }, required: true },
            cwd: { type: "string", required: true },
        },
        output: { schema: { type: "object", additionalProperties: false, properties: {
                    exitCode: { oneOf: [{ type: "number" }, { type: "null" }], required: true }, stdout: { type: "string", required: true }, stderr: { type: "string", required: true },
                    truncated: { type: "boolean", required: true }, enforcement: { type: "string", required: true },
                } }, render(_args, value) { return [{ type: "text", text: JSON.stringify(value) }]; } },
        async execute(args, exec) {
            const item = prepared.get(exec.token);
            if (!item)
                throw new Error("Native approval preparation is unavailable.");
            const { input, execution, lease, policy } = item;
            const signal = AbortSignal.any([exec.signal, execution.signal, AbortSignal.timeout(options.timeoutMs ?? 30_000)]);
            try {
                if (JSON.stringify(parseInput(args)) !== JSON.stringify(input))
                    throw new Error("Execution arguments changed.");
                let argv = [input.executable, ...input.args], enforcement = "standing-full-access";
                if (policy.mode !== "danger-full-access") {
                    if (!sandbox)
                        throw new Error("Sandbox backend unavailable; no unconfined fallback.");
                    const confined = await sandbox.confine(argv, { ...policy, mode: policy.mode, sessionId: exec.agent?.id }, signal);
                    if (confined.enforcement !== "full" && confined.enforcement !== "partial")
                        throw new Error("Sandbox enforcement unavailable.");
                    argv = confined.argv;
                    enforcement = confined.enforcement;
                }
                await assertCanonical(input);
                const spec = { argv, cwd: input.cwd, env: overrides, signal, graceMs: 200,
                    stdio: { stdin: "ignore", stdout: { maxBytes: options.maxOutputBytes ?? 16_384 }, stderr: { maxBytes: options.maxOutputBytes ?? 16_384 } } };
                // The complete effective environment is checked after all asynchronous preparation.
                signal.throwIfAborted();
                execution.assertIntegrity();
                lease.consume();
                const handle = subprocess.spawn(spec);
                const outcome = await handle.done;
                const stdout = handle.collected.stdout.readFrom(0), stderr = handle.collected.stderr.readFrom(0);
                return { exitCode: outcome.exitCode, stdout: stdout.text, stderr: stderr.text,
                    truncated: stdout.lossy || stderr.lossy, enforcement };
            }
            finally {
                lease.finish();
                prepared.delete(exec.token);
            }
        },
    });
    const unregister = ctx.tools.register(definition);
    const registeredBody = definition.execute;
    const pre = ctx.on("tools/pre-execute", async (exec, next) => {
        if (ctx.tools.get(exec.name, exec.agent) !== definition)
            return next();
        const downstream = await next();
        if (downstream.kind === "deny" || downstream.kind === "cancel")
            return downstream;
        if (!exec.agent)
            return { kind: "deny", reason: "A live owned session is required." };
        const input = parseInput(exec.arguments), authority = options.capture(exec, input);
        authority.assertIntegrity();
        authority.assertProgramAllowed();
        const capturedPolicy = policyService.resolve({ session: exec.agent.session });
        const policy = Object.freeze({ ...capturedPolicy }), environment = effectiveArgvEnvironment(overrides);
        const signal = AbortSignal.any([exec.signal, authority.sessionSignal, lifetime.signal]);
        const target = JSON.stringify({ input, environment, policy });
        const check = () => {
            signal.throwIfAborted();
            authority.assertIntegrity();
            if (ctx.tools.get(exec.name, exec.agent) !== definition || definition.execute !== registeredBody || permissionOriginal(ctx.subprocess) !== original
                || Reflect.get(original, "spawn") !== spawnMethod || Reflect.get(original, "resolveExecutable") !== resolveMethod
                || Reflect.get(policyOwner, "resolve") !== policyMethod || (sandboxOwner && Reflect.get(sandboxOwner, "confine")) !== confineMethod
                || (ctx.get("sandbox") && permissionOriginal(ctx.sandbox)) !== sandboxOwner
                || !ctx.get("sandboxPolicy") || permissionOriginal(ctx.sandboxPolicy) !== policyOwner
                || JSON.stringify(policyService.resolve({ session: exec.agent.session })) !== JSON.stringify(policy)
                || effectiveArgvEnvironment(overrides) !== environment)
                throw new Error("Execution provider, policy or environment changed.");
        };
        const resolved = await subprocess.resolveExecutable(input.executable, undefined, signal);
        await assertCanonical(input);
        check();
        if (resolved !== input.executable)
            throw new Error("Executable identity changed; request its canonical absolute path.");
        const execution = { token: exec.token, agent: exec.agent, owner: authority.owner,
            generation: authority.generation, registration: definition, provider: original, sessionId: exec.agent.id,
            tool: exec.name, project: exec.agent.session.header.cwd ?? "", target,
            summary: `${input.executable} ${JSON.stringify(input.args)}\n${input.cwd}\n${policy.mode}; exact effective environment (values hidden). Program/config/hooks may change.`,
            reusable: options.programKind(input.executable) === "native", signal, sessionSignal: authority.sessionSignal,
            assertIntegrity: check, assertReusable() {
                check();
                authority.assertProgramAllowed();
                authority.assertRetentionAllowed?.();
                if (options.programKind(input.executable) !== "native")
                    throw new Error("Reusable program classification is no longer current.");
                const approval = ctx.approval;
                if ((approval.overrideOf(exec.agent.session) ?? approval.config.policy ?? "ask") !== "ask")
                    throw new Error("Current native policy does not allow automatic approval.");
            } };
        const lease = await options.grants.approve({ agent: exec.agent, toolName: exec.name, callId: exec.callId, signal,
            reason: [downstream.kind === "ask" ? downstream.reason : undefined, execution.summary].filter(Boolean).join("\n") }, execution);
        prepared.set(exec.token, { input, execution, policy, lease });
        return { kind: "allow" };
    }, { prepend: true, global: true });
    const result = ctx.on("tools/result", exec => { const item = prepared.get(exec.token); item?.lease.finish(); prepared.delete(exec.token); }, { global: true });
    return ctx.effect(() => () => { lifetime.abort(); pre(); result(); unregister(); for (const item of prepared.values())
        item.lease.finish(); prepared.clear(); });
}
//# sourceMappingURL=permission-exec-argv.js.map