import type { DshContext } from "./dsh-types.js";
export declare const DSMM_PERSISTENCE_COMPATIBILITY: unique symbol;
/** An ephemeral Host without persistence is safe; a durable Host must use the compatible provider. */
export declare function assertDsmmMetadataPersistence(ctx: DshContext | undefined): void;
/** Only these audited, model-hidden records are safe for a stock reader to skip. */
export declare function annotateDsmmEvent<T extends {
    type: string;
    data?: unknown;
    ignorable?: unknown;
}>(event: T): T & {
    ignorable?: true;
};
//# sourceMappingURL=session-metadata.d.ts.map