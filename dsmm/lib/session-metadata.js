import { isDsmmRoleId } from "./roles.js";
export const DSMM_PERSISTENCE_COMPATIBILITY = Symbol.for("dsmm.sessionPersistence.ignorable.v1");
/** An ephemeral Host without persistence is safe; a durable Host must use the compatible provider. */
export function assertDsmmMetadataPersistence(ctx) {
    const persistence = ctx?.get?.("sessionPersistence");
    if (persistence !== undefined && (typeof persistence !== "object" || persistence === null
        || persistence[DSMM_PERSISTENCE_COMPATIBILITY] !== true)) {
        throw new Error("Deepwork requires @dsmm/dsmm/session-persistence for durable session metadata; no unsafe event was appended");
    }
}
/** Only these audited, model-hidden records are safe for a stock reader to skip. */
export function annotateDsmmEvent(event) {
    if (event.type !== "deepwork/mode" && event.type !== "dsmm/role-policy")
        return event;
    const envelope = event;
    const allowedKeys = ["type", "seq", "time", "data", "ignorable"];
    const validEnvelope = Reflect.ownKeys(event).every((key) => typeof key === "string" && allowedKeys.includes(key))
        && ["type", "seq", "time", "data"].every((key) => Object.hasOwn(event, key))
        && Number.isSafeInteger(envelope.seq) && envelope.seq >= 0 && !Object.is(envelope.seq, -0)
        && Number.isSafeInteger(envelope.time);
    const data = event.data;
    const record = typeof data === "object" && data !== null && !Array.isArray(data)
        && (Object.getPrototypeOf(data) === Object.prototype || Object.getPrototypeOf(data) === null)
        ? data : undefined;
    const valid = record !== undefined && (event.type === "deepwork/mode"
        ? Reflect.ownKeys(record).length === 1 && typeof record.active === "boolean"
        : Reflect.ownKeys(record).length === 3 && record.version === 1 && isDsmmRoleId(record.role)
            && (record.policy === null || typeof record.policy === "string" && /^[a-f0-9]{64}$/u.test(record.policy)));
    if (!validEnvelope || !valid || event.ignorable !== undefined && event.ignorable !== true) {
        throw new TypeError("invalid Deepwork session metadata; refusing to mark it ignorable");
    }
    return event.ignorable === true ? event : { ...event, ignorable: true };
}
//# sourceMappingURL=session-metadata.js.map