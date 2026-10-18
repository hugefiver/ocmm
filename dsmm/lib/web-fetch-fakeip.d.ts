import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type { WebFetchProvider, WebFetchRequest, WebFetchResult } from "@deepseek-ai/dsh-web";
import type { HttpFetchLimits } from "@deepseek-ai/dsh-web-fetch-http";
import type { AddressLookup } from "./web-fetch-address-policy.js";
export declare const name = "dsmm-http-fakeip";
export declare const FETCH_PROVIDER_ID = "dsmm-http-fakeip";
export declare const inject: string[];
export interface Config extends Partial<HttpFetchLimits> {
    readonly denyCidrs?: string[];
}
export declare const Config: z<Config>;
/** Opt-in adapter; all HTTP transport and response handling remain native. */
export declare class FakeIpHttpFetchProvider implements WebFetchProvider {
    readonly id = "dsmm-http-fakeip";
    private readonly limits;
    private readonly policy;
    private readonly resolver;
    constructor(config?: Config, lookup?: AddressLookup);
    available(): boolean;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
/** Mount only when the operator has explicitly selected this adapter. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=web-fetch-fakeip.d.ts.map