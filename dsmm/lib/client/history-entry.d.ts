import type { Context } from "@deepseek-ai/cordis";
import type { LocaleRuntime } from "@deepseek-ai/dsh-client-locale/client";
import { HistoryContinuationController } from "./history-controller.js";
export declare function HistoryContinuationEntry({ controller, locale, sessionId }: {
    controller: HistoryContinuationController;
    locale: LocaleRuntime;
    sessionId: string;
}): import("react").JSX.Element | null;
/** Read-only native binding observer; Host admission owns all history activation. */
export declare function registerHistoryContinuation(ctx: Context): void;
//# sourceMappingURL=history-entry.d.ts.map