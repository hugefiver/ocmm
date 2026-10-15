import { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { parseChildAdmissionCapture, parseChildAdmissionEvidenceView, parseLegacyChildEvidence } from "./child-capture.js";
import { NativeChildEvidenceReader, assertNativeChildCapture, legacyEvidenceFromNativeFacts } from "./native-child-evidence.js";
import { createConservativeLegacyAdmission, installLegacyChildToolPolicy } from "./legacy-child-policy.js";
function unauthorized() { throw new SubagentError("Child admission requires an issued ticket and exact native Agent owner", "UNAUTHORIZED"); }
/** Connects A's structural contract to C1's opaque ticket provenance without manufacturing Agents. */
export function createChildAdmissionBinding(options) {
    const { ctx, owner, deliveryAuthority: delivery, collaborators } = options;
    const nativeTickets = new WeakMap();
    const profileTickets = new WeakMap();
    const registeredParents = new WeakMap();
    const exact = (parent) => {
        if (parent.id === undefined)
            unauthorized();
        const actual = ctx.agents.get(SessionId(parent.id));
        if (actual === undefined || actual !== parent)
            unauthorized();
        return actual;
    };
    const assertNative = (ticket) => {
        delivery.assertTicket(ticket);
        if (ticket.owner !== owner || exact(ticket.parent) !== ticket.parent)
            unauthorized();
    };
    const profileTicket = (ticket) => {
        assertNative(ticket);
        let borrowed = profileTickets.get(ticket);
        if (borrowed === undefined) {
            borrowed = Object.freeze({ parent: ticket.parent, owner: ticket.owner, admission: ticket.admission,
                parentEpoch: ticket.parentEpoch, signal: ticket.signal });
            profileTickets.set(ticket, borrowed);
            nativeTickets.set(borrowed, ticket);
        }
        return borrowed;
    };
    const nativeTicket = (ticket) => {
        const actual = nativeTickets.get(ticket);
        if (actual === undefined)
            unauthorized();
        assertNative(actual);
        return actual;
    };
    const reader = new NativeChildEvidenceReader(ctx, assertNative, options.nativeHistory);
    const readLegacy = (ticket, id, signal) => reader.legacy(nativeTicket(ticket), id, signal);
    const resolve = async (ticket, id, callerSignal) => {
        assertNative(ticket);
        const signal = AbortSignal.any([ticket.signal, callerSignal]);
        signal.throwIfAborted();
        const evidence = await collaborators.resolveOriginalChildEvidence(profileTicket(ticket), id, signal, readLegacy);
        signal.throwIfAborted();
        assertNative(ticket);
        const parsed = "mode" in evidence ? parseLegacyChildEvidence(evidence) : parseChildAdmissionCapture(evidence);
        const facts = await reader.read(ticket, id, signal);
        signal.throwIfAborted();
        assertNative(ticket);
        if ("mode" in parsed) {
            const physical = legacyEvidenceFromNativeFacts(facts);
            if (!sameLegacyEvidence(parsed, physical))
                unauthorized();
        }
        else
            assertNativeChildCapture(parsed, facts);
        return evidence;
    };
    const authority = {
        view: () => delivery.view(),
        registerParent: (parent, admission, requestedOwner) => {
            if (requestedOwner !== owner)
                unauthorized();
            const actual = exact(parent);
            delivery.registerParent(actual, admission, owner);
            registeredParents.set(parent, actual);
        },
        acquireParentTicket: parent => profileTicket(delivery.acquireParentTicket(exact(parent))),
        resolveChildEvidence: async (ticket, id, signal) => resolve(nativeTicket(ticket), id, signal),
        prepareParentAdmission: (parent, epoch, next) => delivery.prepareParentAdmission(exact(parent), epoch, next),
        assertCoreParentAdmission: (parent, requestedOwner, expected) => {
            if (requestedOwner !== owner)
                unauthorized();
            delivery.assertCoreParentAdmission(exact(parent), owner, expected);
        },
        prepareCoreParentAdmission: (parent, requestedOwner, expected, next) => {
            if (requestedOwner !== owner)
                unauthorized();
            delivery.prepareCoreParentAdmission(exact(parent), owner, expected, next);
        },
        publishParentAdmission: (parent, epoch, next, install) => delivery.publishParentAdmission(exact(parent), epoch, next, install),
        // Revocation may run during registry removal: use the exact object, never look up a replacement by ID.
        revokeParent: (parent, reason) => {
            const actual = registeredParents.get(parent);
            if (actual !== undefined) {
                delivery.revokeParent(actual, reason);
                registeredParents.delete(parent);
            }
        },
    };
    const policy = {
        classifyParent: collaborators.classifyParent,
        resolveChildEvidence: resolve,
        assertDelivery(ticket, id, evidence) { assertNative(ticket); collaborators.assertDelivery(profileTicket(ticket), id, evidence); assertNative(ticket); },
    };
    const childAdmission = {
        async prepare(agent, parent, ticket, signal) {
            const issued = nativeTicket(ticket);
            if (exact(parent) !== issued.parent || ctx.agents.get(SessionId(agent.id)) !== agent || !ctx.agents.isOwnedBy(SessionId(agent.id), issued.parent))
                unauthorized();
            const merged = AbortSignal.any([signal, issued.signal]);
            merged.throwIfAborted();
            const prepared = await collaborators.childAdmission.prepare(agent, parent, ticket, merged);
            merged.throwIfAborted();
            assertNative(issued);
            return "mode" in prepared.evidence ? { ...prepared,
                admission: createConservativeLegacyAdmission(prepared.evidence, ticket.admission, options.nativeSubstrate) } : prepared;
        },
        validateRole(agent, parent, candidate) {
            collaborators.childAdmission.validateRole(agent, parent, candidate);
            if ("mode" in candidate.evidence && !candidate.retained) {
                installLegacyChildToolPolicy(candidate.evidence, exact(parent), exact(agent), options.legacyCapabilities);
            }
        },
    };
    return { authority, policy, childAdmission, readLegacy,
        resolveOriginalEvidence: (ticket, id, signal) => resolve(nativeTicket(ticket), id, signal),
        bind(scope) { return delivery.bindPolicy(scope, owner, policy); },
        onAdmissionGuardsInstalled() { delivery.enablePolicy(owner); },
        /** Holder owner calls this before native disposal/drain; no replacement residency is revoked. */
        async revokeBeforeDispose(parent, dispose) {
            authority.revokeParent(parent, "holder-disposed");
            await dispose();
        },
    };
}
function sameLegacyEvidence(left, right) {
    return left.childSessionId === right.childSessionId && left.parentSessionId === right.parentSessionId && left.role === right.role
        && left.depth === right.depth && JSON.stringify(left.route) === JSON.stringify(right.route)
        && JSON.stringify(left.toolFilter) === JSON.stringify(right.toolFilter)
        && left.provenFields.every(field => right.provenFields.includes(field));
}
/** DTO consumers supply the CURRENT direct-parent epoch; original epochs are not an authorization equality test. */
export function projectChildAdmissionEvidence(evidence, parentAdmissionEpoch, parentDenied = []) {
    let view;
    if ("mode" in evidence) {
        const legacy = parseLegacyChildEvidence(evidence);
        view = parseChildAdmissionEvidenceView({ mode: "legacy-conservative", parentAdmissionEpoch, provenFields: legacy.provenFields, limitations: legacy.limitations });
    }
    else {
        const capture = parseChildAdmissionCapture(evidence);
        const provenFields = ["lineage", "role", "route", "profile-pin", "admission-epoch", "invocation-level", "runtime-policy", "modules", "roles",
            "read-only", "route-override", "max-depth", "locale", "tool-topology", "guards", "git-write", "shell", "delegation"];
        if (capture.authorityCeiling.toolFilter !== undefined)
            provenFields.push("tool-filter");
        view = parseChildAdmissionEvidenceView({ mode: "captured", parentAdmissionEpoch, originalAdmissionEpoch: capture.originalAdmissionEpoch, provenFields,
            limitations: [{ field: "active-intent", code: "missing-evidence", effect: "display-only" }, { field: "max-tokens", code: "not-persisted", effect: "native-default" },
                { field: "output-schema", code: "unverified", effect: "capability-denied" }] });
    }
    const limitations = new Map(view.limitations.map(item => [item.field, item]));
    for (const field of parentDenied)
        limitations.set(field, { field, code: "parent-denied", effect: "capability-denied" });
    return parseChildAdmissionEvidenceView({ ...view, limitations: [...limitations.values()] });
}
//# sourceMappingURL=child-admission.js.map