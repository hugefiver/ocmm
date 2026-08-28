export type DsmmModelFamily = "gpt" | "codex" | "claude" | "gemini" | "glm" | "kimi" | "deepseek" | "unknown";
export declare function classifyModelFamily(input: {
    providerID?: string;
    modelID?: string;
}): DsmmModelFamily;
//# sourceMappingURL=model-family.d.ts.map