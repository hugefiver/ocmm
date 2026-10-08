export declare const DEPLOYMENT_NS = "plugins.dsmm";
export declare const deploymentEn: {
    title: string;
    summary: string;
    description: string;
    global: string;
    globalHint: string;
    profile: string;
    profileHint: string;
    unavailableForm: string;
    ceiling: string;
    hostUnknown: string;
    boundaries: string;
    saveGlobal: string;
    saveProfile: string;
    saving: string;
    refresh: string;
    discard: string;
    dirty: string;
    saved: string;
    inherit: string;
    explicit: string;
    defaultPin: string;
    hostPin: string;
    globalSource: string;
    profileSource: string;
    defaultsSource: string;
    namedSource: string;
    startupSource: string;
    deploymentCapture: string;
    desired: string;
    startup: string;
    next: string;
    session: string;
    noSession: string;
    sessionUnavailable: string;
    absent: string;
    mixedSource: string;
    inspectorStale: string;
    pending: string;
    unknown: string;
    on: string;
    off: string;
    state: string;
    module: string;
    advanced: string;
    advancedHint: string;
    invalid: string;
    conflict: string;
    unavailable: string;
    "not-owned": string;
    validation: string;
    transport: string;
    namedIndependent: string;
};
export type DeploymentLocaleKey = keyof typeof deploymentEn;
export declare const deploymentZh: Record<DeploymentLocaleKey, string>;
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface LocaleNamespaceMap {
        "plugins.dsmm": DeploymentLocaleKey;
    }
}
/** Stable public field names stay visible alongside localized context. */
export declare const deploymentFieldLabels: Record<string, [string, string]>;
//# sourceMappingURL=deployment-locales.d.ts.map