/** Public effective native policy only; requested tool arguments are never authority. */
export function nativeStandingFullAccess(ctx, agent) {
    const sandbox = (agent?.ctx ?? ctx).get("sandboxPolicy");
    return sandbox?.resolve(agent === undefined ? {} : { session: agent.session }).mode === "danger-full-access";
}
//# sourceMappingURL=permission-native-access.js.map