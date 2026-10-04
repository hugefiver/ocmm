var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { TYPERT_HOST } from "./profile-remote.js";
import { profileErrorInfo } from "./profiles.js";
/** Business service addressed only by native Typert Gateway invocations. */
let DsmmProfilesHost = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describe_decorators;
    let _read_decorators;
    let _save_decorators;
    let _select_decorators;
    return class DsmmProfilesHost extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describe_decorators = [Remote];
            _read_decorators = [Remote];
            _save_decorators = [Remote];
            _select_decorators = [Remote];
            __esDecorate(this, null, _describe_decorators, { kind: "method", name: "describe", static: false, private: false, access: { has: obj => "describe" in obj, get: obj => obj.describe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _read_decorators, { kind: "method", name: "read", static: false, private: false, access: { has: obj => "read" in obj, get: obj => obj.read }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _save_decorators, { kind: "method", name: "save", static: false, private: false, access: { has: obj => "save" in obj, get: obj => obj.save }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _select_decorators, { kind: "method", name: "select", static: false, private: false, access: { has: obj => "select" in obj, get: obj => obj.select }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        backend = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, backend) {
            super(ctx, "dsmmProfiles");
            this.backend = backend;
        }
        async invoke(operation) {
            const invocation = this.ctx.invocation;
            if (invocation === undefined || invocation.peer === undefined) {
                throw new RemoteError("dsmm-profiles/peer-required", "Use DSMM Profiles through the native Host connection.", {});
            }
            invocation.signal.throwIfAborted();
            try {
                return await operation();
            }
            catch (error) {
                throw new RemoteError("dsmm-profiles/refused", "The Host refused the profile operation.", profileErrorInfo(error));
            }
        }
        describe() { return this.invoke(() => this.backend.describe()); }
        read(id) { return this.invoke(() => this.backend.read(id)); }
        save(request) { return this.invoke(() => this.backend.save(request)); }
        select(request) { return this.invoke(() => this.backend.select(request)); }
    };
})();
export { DsmmProfilesHost };
/** The caller supplies the owned injection fiber; withdrawal stays native. */
export function registerProfilesRpc(ctx, backend) {
    const service = new DsmmProfilesHost(ctx, backend);
    ctx.typert.register(TYPERT_HOST);
    return service;
}
//# sourceMappingURL=profile-rpc.js.map