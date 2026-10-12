import { symbols } from "@deepseek-ai/cordis";
import { SessionId } from "@deepseek-ai/dsh-session";
import { foldSubagentDescriptor, SubagentError } from "@deepseek-ai/dsh-subagent";
import { parseLegacyChildEvidence } from "./child-capture.js";
import { freezeSettings } from "./settings.js";
import { isDsmmRoleId } from "./roles.js";
function unauthorized() { throw new SubagentError("Child history does not prove its direct native identity", "UNAUTHORIZED"); }
/** Exact public catalog and replay-validated physical cuts; never resumes an Agent. */
export class NativeChildEvidenceReader {
    ctx;
    assertTicket;
    history;
    constructor(ctx, assertTicket, history) {
        this.ctx = ctx;
        this.assertTicket = assertTicket;
        this.history = history;
    }
    async read(ticket, childId, callerSignal) {
        const signal = AbortSignal.any([ticket.signal, callerSignal]);
        const check = () => {
            signal.throwIfAborted();
            this.assertTicket(ticket);
            const current = this.ctx.get("sessionQuery");
            if (current === undefined || (Reflect.get(current, symbols.original) ?? current) !== (Reflect.get(this.history, symbols.original) ?? this.history))
                unauthorized();
        };
        check();
        if (this.ctx.agents.get(ticket.parent.id) !== ticket.parent || childId === ticket.parent.id)
            unauthorized();
        const rows = await this.ctx.subagents.listChildren(ticket.parent.id, signal);
        check();
        const matches = rows.filter(row => row.id === childId);
        if (matches.length !== 1 || matches[0].mode !== "continuable")
            unauthorized();
        const observation = await this.history.observeSession(SessionId(childId), { signal, projectionMode: "none" });
        try {
            check();
            const facts = readFacts(ticket.parent, childId, observation);
            const catalog = matches[0];
            if (catalog.createdAt !== observation.header.createdAt || catalog.mode !== facts.descriptor.mode || catalog.label !== facts.descriptor.label)
                unauthorized();
            check();
            return facts;
        }
        finally {
            observation[Symbol.dispose]();
        }
    }
    async legacy(ticket, childId, signal) {
        return legacyEvidenceFromNativeFacts(await this.read(ticket, childId, signal));
    }
}
function readFacts(parent, childId, observation) {
    const header = observation.header;
    if (header.version !== 4 || header.id !== childId || header.parentSession !== parent.id || header.origin !== "subagent"
        || !Number.isSafeInteger(header.delegationDepth) || header.delegationDepth <= (parent.session.header.delegationDepth ?? 0)
        || typeof header.cwd !== "string")
        unauthorized();
    const inherited = observation.inheritedEventCount;
    if (!Number.isSafeInteger(inherited) || inherited < 0 || inherited > observation.events.length)
        unauthorized();
    const own = observation.events.slice(inherited);
    // The catalog projection is display data; a second descriptor cannot replace the establishing composition.
    if (own.filter(event => event.type === "subagent/descriptor").length !== 1)
        unauthorized();
    const descriptor = foldSubagentDescriptor(own);
    if (descriptor?.mode !== "continuable" || !descriptor.provider.startsWith("dsmm-role-"))
        unauthorized();
    const role = `dsmm-${descriptor.provider.slice("dsmm-role-".length)}`;
    if (!isDsmmRoleId(role) || role === "dsmm-orchestrator" || descriptor.agentProvider === undefined || descriptor.agentModel === undefined)
        unauthorized();
    let active;
    for (const event of own) {
        if (event.type === "dsmm/role-policy") {
            const data = event.data;
            if (data === null || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 3
                || data.version !== 1 || data.role !== role || data.policy !== null && (typeof data.policy !== "string" || !/^[a-f0-9]{64}$/u.test(data.policy)))
                unauthorized();
        }
        else if (event.type === "deepwork/mode") {
            const data = event.data;
            if (data === null || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 1 || typeof data.active !== "boolean")
                unauthorized();
            active = data.active;
        }
    }
    return freezeSettings({ childSessionId: childId, parentSessionId: parent.id, depth: header.delegationDepth, role, descriptor,
        ...(active === undefined ? {} : { active }), requestBudgetObserved: own.some(hasRequestBudget) });
}
function hasRequestBudget(event) {
    if (event.type !== "request/header")
        return false;
    return event.data.header.config.maxTokens !== undefined;
}
export function legacyEvidenceFromNativeFacts(facts) {
    const provenFields = ["lineage", "role", "route"];
    if (facts.descriptor.toolFilter !== undefined)
        provenFields.push("tool-filter");
    if (facts.active !== undefined)
        provenFields.push("active-intent");
    if (facts.requestBudgetObserved)
        provenFields.push("max-tokens");
    const limitations = [
        ...["profile-pin", "admission-epoch", "invocation-level", "locale", "tool-topology"].map(field => ({ field, code: "missing-evidence", effect: "display-only" })),
        ...["runtime-policy", "modules", "roles", "read-only", "route-override", "max-depth", "guards", "git-write", "shell", "delegation"].map(field => ({ field, code: "missing-evidence", effect: "capability-denied" })),
        { field: "max-tokens", code: "not-persisted", effect: "native-default" },
        { field: "output-schema", code: "unverified", effect: "capability-denied" },
    ];
    if (facts.descriptor.toolFilter === undefined)
        limitations.push({ field: "tool-filter", code: "missing-evidence", effect: "capability-denied" });
    if (facts.active === undefined)
        limitations.push({ field: "active-intent", code: "missing-evidence", effect: "display-only" });
    return parseLegacyChildEvidence({ version: 1, mode: "legacy-conservative", childSessionId: facts.childSessionId,
        parentSessionId: facts.parentSessionId, role: facts.role, depth: facts.depth,
        route: { provider: facts.descriptor.agentProvider, model: facts.descriptor.agentModel,
            ...(facts.descriptor.agentReasoningEffort === undefined ? {} : { reasoningEffort: facts.descriptor.agentReasoningEffort }) },
        ...(facts.descriptor.toolFilter === undefined ? {} : { toolFilter: facts.descriptor.toolFilter }),
        ...(facts.active === undefined ? {} : { active: facts.active }), provenFields, limitations });
}
/** Capture evidence must agree with the child's establishing descriptor, not current parent routing. */
export function assertNativeChildCapture(capture, facts) {
    const route = capture.invocation.initialRoute, descriptor = facts.descriptor;
    if (capture.childSessionId !== facts.childSessionId || capture.parentSessionId !== facts.parentSessionId || capture.role !== facts.role
        || facts.depth > capture.authorityCeiling.maxDepth || descriptor.agentProvider !== route.provider || descriptor.agentModel !== route.model
        || descriptor.agentReasoningEffort !== route.reasoningEffort)
        unauthorized();
    const ceiling = capture.authorityCeiling.toolFilter, native = descriptor.toolFilter;
    if (native?.allow !== undefined && (ceiling?.allow === undefined || ceiling.allow.some(name => !native.allow.includes(name))))
        unauthorized();
    if (native?.deny?.some(name => ceiling?.allow?.includes(name) || ceiling?.allow === undefined && !ceiling?.deny?.includes(name)))
        unauthorized();
}
//# sourceMappingURL=native-child-evidence.js.map