import type { LookupAddress } from "node:dns";
import type { HttpFetchResolver } from "@deepseek-ai/dsh-web-fetch-http";
export type AddressLookup = (hostname: string, options: {
    all: true;
    order: "verbatim";
}) => Promise<LookupAddress[]>;
export interface AddressPolicyOptions {
    /** Additional local denies; never additional allows. */
    readonly denyCidrs?: readonly string[];
}
export declare function stripIpv6Brackets(hostname: string): string;
export declare function isFakeIpAddress(input: string): boolean;
/** Local policy for literals and the complete DNS answer set. */
export declare class FakeIpAddressPolicy {
    private readonly denied;
    constructor(options?: AddressPolicyOptions);
    get requiresLocalDeny(): boolean;
    allows(input: string): boolean;
    /** Native transition/NAT64 destinations do not inherit the Fake-IP exception. */
    allowsTranslatedIpv4(input: string): boolean;
}
/** Resolve once; the native provider pins exactly this validated, nonempty set. */
export declare function createFakeIpResolver(policy?: FakeIpAddressPolicy, lookup?: AddressLookup): HttpFetchResolver;
//# sourceMappingURL=web-fetch-address-policy.d.ts.map