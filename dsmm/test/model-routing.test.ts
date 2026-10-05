import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AgentRequestErrorFrame,
  AgentRequestFrame,
  DshAgent,
  DshContext,
  DshEpochHeader,
  DshLlmCallConfig,
  DshLlmRuntime,
  DshModelReasoningInfo,
  DshRequestErrorAction,
  DshSessionEvent
} from "../lib/dsh-types.js";
import {
  desiredDeepseekEffort,
  isDeepseekV4ProRoute,
  registerModelRouting,
  selectAdvertisedEffort
} from "../lib/model-routing.js";
import { registerRuntimeRecovery } from "../lib/runtime-recovery.js";
import { DEFAULT_DSMM_SETTINGS } from "../lib/settings.js";
import type { DsmmSettings } from "../lib/settings.js";
import { DeepworkModeController } from "../lib/state.js";

function reasoning(ids: readonly string[], defaultEffort?: string): DshModelReasoningInfo {
  return {
    efforts: ids.map((id) => ({ id, name: id })),
    defaultEffort
  };
}

type AgentRequestListener = (frame: AgentRequestFrame, next: () => Promise<DshLlmCallConfig>) => Promise<DshLlmCallConfig>;
type AgentRequestErrorListener = (frame: AgentRequestErrorFrame, next: () => Promise<DshRequestErrorAction>) => Promise<DshRequestErrorAction>;

interface RoutingHarness {
  readonly dependencies: string[][];
  readonly resolverCalls: Array<{ provider: string; model: string; signal: AbortSignal | undefined }>;
  readonly warnings: string[];
  readonly child: DshContext;
  get listener(): AgentRequestListener | undefined;
  createChild(): DshContext;
  install(child?: DshContext): void;
  dispose(): void;
}

function activeFrame(preset?: string): AgentRequestFrame {
  const events = [
    { type: "deepwork/mode", data: { active: true } },
    ...(preset === undefined ? [] : [{ type: "agent-preset/selected", data: { agentPreset: preset } }])
  ];
  return {
    agent: {
      session: {
        events,
        append() {}
      }
    },
    turn: 1,
    step: 1,
    signal: new AbortController().signal
  };
}

function inactiveFrame(preset?: string): AgentRequestFrame {
  return {
    ...activeFrame(preset),
    agent: {
      session: {
        events: preset === undefined ? [] : [{ type: "agent-preset/selected", data: { agentPreset: preset } }],
        append() {}
      }
    }
  };
}

function officialConfig(overrides: Partial<DshLlmCallConfig> = {}): DshLlmCallConfig {
  return {
    provider: "deepseek-official",
    model: "deepseek-v4-pro",
    ...overrides
  };
}

function routingHarness(options: {
  settings?: DsmmSettings;
  getSettings?: () => DsmmSettings;
  resolve?: DshLlmRuntime["resolveModelInfo"];
  withInject?: boolean;
  childLogger?: DshContext["logger"] | null;
  rootLogger?: DshContext["logger"] | null;
} = {}): RoutingHarness {
  const dependencies: string[][] = [];
  const resolverCalls: Array<{ provider: string; model: string; signal: AbortSignal | undefined }> = [];
  const warnings: string[] = [];
  const effects: Array<() => void | (() => void)> = [];
  let listener: AgentRequestListener | undefined;
  let installer: ((readyCtx: DshContext) => unknown) | undefined;
  const resolve = options.resolve ?? (async (provider, model, signal) => {
    resolverCalls.push({ provider, model, signal });
    return { provider, id: model, name: model, reasoning: reasoning(["high"], "high") };
  });
  const recordingLogger: NonNullable<DshContext["logger"]> = {
    warn(message) {
      warnings.push(message);
    }
  };
  const childLogger = options.childLogger === undefined ? recordingLogger : options.childLogger;
  const rootLogger = options.rootLogger === undefined ? childLogger : options.rootLogger;
  const createChild = (): DshContext => ({
    llm: {
      async resolveModelInfo(provider, model, signal) {
        if (options.resolve !== undefined) resolverCalls.push({ provider, model, signal });
        return resolve(provider, model, signal);
      }
    },
    on(event, candidate) {
      if (event === "agent/request") listener = candidate as AgentRequestListener;
      return () => {
        if (listener === candidate) listener = undefined;
      };
    },
    effect(callback) {
      effects.push(callback);
    },
    ...(childLogger === null ? {} : { logger: childLogger })
  });
  const child = createChild();
  const root: DshContext = {
    ...(rootLogger === null ? {} : { logger: rootLogger }),
    ...(options.withInject === false
      ? { llm: child.llm, on: child.on, effect: child.effect }
      : {
          inject(deps, candidate) {
            dependencies.push([...deps]);
            installer = candidate;
          }
        })
  };
  const controller = new DeepworkModeController({});
  registerModelRouting(root, controller, options.getSettings ?? (() => options.settings ?? DEFAULT_DSMM_SETTINGS));

  return {
    dependencies,
    resolverCalls,
    warnings,
    child,
    get listener() {
      return listener;
    },
    createChild,
    install(readyCtx = child) {
      if (options.withInject === false) return;
      assert.ok(installer);
      installer(readyCtx);
    },
    dispose() {
      for (const effect of effects.splice(0)) {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanup();
      }
    }
  };
}

async function request(harness: RoutingHarness, frame: AgentRequestFrame, downstream: DshLlmCallConfig): Promise<DshLlmCallConfig> {
  const listener = harness.listener;
  assert.ok(listener);
  return listener(frame, async () => downstream);
}

test("isDeepseekV4ProRoute matches only the official DeepSeek V4 Pro route", () => {
  const cases = [
    [{ provider: "deepseek-official", model: "deepseek-v4-pro" }, true],
    [{ provider: "DEEPSEEK-OFFICIAL", model: "DEEPSEEK-V4-PRO" }, true],
    [{ provider: "deepseek", model: "deepseek-v4-pro" }, false],
    [{ provider: "openrouter", model: "deepseek-v4-pro" }, false],
    [{ provider: "deepseek-official", model: "deepseek-v4" }, false],
    [{ provider: "deepseek-official", model: "deepseek-v4-pro-preview" }, false],
    [{ provider: "deepseek-official-lookalike", model: "deepseek-v4-pro" }, false]
  ] as const;

  for (const [config, expected] of cases) {
    assert.equal(isDeepseekV4ProRoute(config), expected, JSON.stringify(config));
  }
});

test("desiredDeepseekEffort uses max only for configured DSMM presets", () => {
  const settings = {
    ...DEFAULT_DSMM_SETTINGS,
    deepseekV4ProDefaultReasoningEffort: "low" as const,
    deepseekV4ProMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"]
  } satisfies DsmmSettings;

  assert.equal(desiredDeepseekEffort(settings), "low");
  assert.equal(desiredDeepseekEffort(settings, "standard"), "low");
  assert.equal(desiredDeepseekEffort(settings, "dsmm-plan-critic"), "max");
  assert.equal(desiredDeepseekEffort(settings, "dsmm-reviewer"), "max");
  assert.equal(desiredDeepseekEffort(settings, "arbitrary-preset"), "low");

  const reviewerRemoved: DsmmSettings = {
    ...settings,
    deepseekV4ProMaxReasoningPresets: ["dsmm-plan-critic"]
  };
  assert.equal(desiredDeepseekEffort(reviewerRemoved, "dsmm-reviewer"), "low");
});

test("selectAdvertisedEffort chooses only advertised capabilities or a valid default", () => {
  const cases = [
    ["max", reasoning(["off", "high", "max"], "off"), "max"],
    ["max", reasoning(["off", "high"], "off"), "high"],
    ["max", reasoning(["off"], "off"), "off"],
    ["max", reasoning(["off"], "high"), undefined],
    ["high", reasoning(["off", "high"], "off"), "high"],
    ["high", reasoning(["off"], "off"), "off"],
    ["low", reasoning(["high"], "low"), undefined],
    ["off", reasoning(["off", "high"], "high"), "off"],
    ["high", undefined, undefined]
  ] as const;

  for (const [desired, advertised, expected] of cases) {
    assert.equal(selectAdvertisedEffort(desired, advertised), expected);
  }
});

test("model routing awaits downstream first and preserves its rejection without resolving", async () => {
  for (const loggerPlacement of ["child", "root"] as const) {
    const events: string[] = [];
    const sentinel = new Error("downstream sentinel");
    const logger: NonNullable<DshContext["logger"]> = {
      warn() {
        events.push("warn");
        throw new Error("logger sentinel");
      }
    };
    const harness = routingHarness({
      getSettings() {
        events.push("settings");
        return DEFAULT_DSMM_SETTINGS;
      },
      ...(loggerPlacement === "child"
        ? { childLogger: logger, rootLogger: null }
        : { childLogger: null, rootLogger: logger })
    });
    harness.install();
    const listener = harness.listener;
    assert.ok(listener);

    await assert.rejects(
      listener(activeFrame(), async () => {
        events.push("next");
        throw sentinel;
      }),
      (error) => error === sentinel,
      loggerPlacement
    );
    assert.deepEqual(events, ["next"], loggerPlacement);
    assert.equal(harness.resolverCalls.length, 0, loggerPlacement);
  }
});

test("model routing leaves calibration-off downstream config untouched", async () => {
  const harness = routingHarness({ settings: { ...DEFAULT_DSMM_SETTINGS, deepseekV4ProCalibration: "off" } });
  harness.install();
  const downstream = officialConfig({ reasoningEffort: "low" });

  assert.equal(await request(harness, activeFrame(), downstream), downstream);
  assert.equal(harness.resolverCalls.length, 0);
});

test("automatic calibration adds an advertised high effort only when downstream omits effort", async () => {
  const harness = routingHarness();
  harness.install();
  const downstream = officialConfig();
  const frame = activeFrame();

  const result = await request(harness, frame, downstream);
  assert.notEqual(result, downstream);
  assert.equal(result.reasoningEffort, "high");
  assert.deepEqual(harness.resolverCalls, [{ provider: "deepseek-official", model: "deepseek-v4-pro", signal: frame.signal }]);
});

test("automatic calibration preserves explicit downstream low, off, and max efforts", async () => {
  for (const reasoningEffort of ["low", "off", "max"] as const) {
    const harness = routingHarness();
    harness.install();
    const downstream = officialConfig({ reasoningEffort });

    assert.equal(await request(harness, activeFrame(), downstream), downstream, reasoningEffort);
    assert.equal(harness.resolverCalls.length, 0, reasoningEffort);
  }
});

test("strict calibration replaces an explicit downstream effort with an advertised effort", async () => {
  const harness = routingHarness({ settings: { ...DEFAULT_DSMM_SETTINGS, deepseekV4ProCalibration: "strict" } });
  harness.install();
  const downstream = officialConfig({ reasoningEffort: "off" });

  const result = await request(harness, activeFrame(), downstream);
  assert.notEqual(result, downstream);
  assert.equal(result.reasoningEffort, "high");
});

test("configured reviewer and plan-critic presets request max, falling back to high", async () => {
  for (const preset of ["dsmm-reviewer", "dsmm-plan-critic"] as const) {
    const maxHarness = routingHarness({
      settings: { ...DEFAULT_DSMM_SETTINGS, deepseekV4ProCalibration: "strict" },
      resolve: async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning(["high", "max"], "high") })
    });
    maxHarness.install();
    assert.equal((await request(maxHarness, inactiveFrame(preset), officialConfig())).reasoningEffort, "max", preset);

    const highHarness = routingHarness({
      settings: { ...DEFAULT_DSMM_SETTINGS, deepseekV4ProCalibration: "strict" },
      resolve: async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning(["high"], "high") })
    });
    highHarness.install();
    assert.equal((await request(highHarness, inactiveFrame(preset), officialConfig())).reasoningEffort, "high", preset);
  }
});

test("off-only metadata selects off only for requested off or an advertised default", async () => {
  const requestedOff = routingHarness({
    settings: { ...DEFAULT_DSMM_SETTINGS, deepseekV4ProDefaultReasoningEffort: "off" },
    resolve: async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning(["off"]) })
  });
  requestedOff.install();
  assert.equal((await request(requestedOff, activeFrame(), officialConfig())).reasoningEffort, "off");

  const advertisedDefault = routingHarness({
    resolve: async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning(["off"], "off") })
  });
  advertisedDefault.install();
  assert.equal((await request(advertisedDefault, activeFrame(), officialConfig())).reasoningEffort, "off");

  const unavailable = routingHarness({
    resolve: async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning(["off"]) })
  });
  unavailable.install();
  const downstream = officialConfig();
  assert.equal(await request(unavailable, activeFrame(), downstream), downstream);
  assert.equal(unavailable.warnings.length, 1);
});

test("model routing ignores non-official, lookalike, and inactive routes without resolving", async () => {
  const cases: Array<{ frame: AgentRequestFrame; config: DshLlmCallConfig }> = [
    { frame: activeFrame(), config: { provider: "openai", model: "gpt-5.6" } },
    { frame: activeFrame(), config: { provider: "anthropic", model: "claude-sonnet" } },
    { frame: activeFrame(), config: { provider: "deepseek", model: "deepseek-v4-pro" } },
    { frame: activeFrame(), config: { provider: "deepseek-official-lookalike", model: "deepseek-v4-pro" } },
    { frame: activeFrame(), config: { provider: "deepseek-official", model: "deepseek-v4-pro-preview" } },
    { frame: inactiveFrame(), config: officialConfig() }
  ];

  for (const { frame, config } of cases) {
    const harness = routingHarness();
    harness.install();
    assert.equal(await request(harness, frame, config), config);
    assert.equal(harness.resolverCalls.length, 0);
  }
});

test("model routing changes only reasoningEffort and preserves downstream values by identity", async () => {
  const messages = [{ role: "user", content: "secret request body: do-not-log" }];
  const tools = [{ name: "tool" }];
  const signalMetadata = { credential: "credential-do-not-log" };
  const stop = { marker: "stop" };
  const unknownNestedOption = { nested: true };
  const downstream = officialConfig({
    reasoningEffort: "off",
    messages,
    tools,
    signalMetadata,
    stop,
    unknownNestedOption
  });
  const harness = routingHarness({ settings: { ...DEFAULT_DSMM_SETTINGS, deepseekV4ProCalibration: "strict" } });
  harness.install();

  const result = await request(harness, activeFrame(), downstream);
  assert.equal(result.provider, downstream.provider);
  assert.equal(result.model, downstream.model);
  assert.equal(result.messages, messages);
  assert.equal(result.tools, tools);
  assert.equal(result.signalMetadata, signalMetadata);
  assert.equal(result.stop, stop);
  assert.equal(result.unknownNestedOption, unknownNestedOption);
  assert.equal(result.reasoningEffort, "high");
});

test("resolver failures and unusable reasoning metadata warn once and preserve downstream", async () => {
  const cases: Array<DshLlmRuntime["resolveModelInfo"]> = [
    async () => {
      throw new Error("resolver credential and request secret");
    },
    async (provider, model) => ({ provider, id: model, name: model }),
    async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning([]) }),
    async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning(["off"], "invalid") })
  ];

  for (const resolve of cases) {
    const harness = routingHarness({ resolve });
    harness.install();
    const downstream = officialConfig();
    assert.equal(await request(harness, activeFrame(), downstream), downstream);
    assert.equal(harness.warnings.length, 1);
  }
});

test("model routing contains throwing warning loggers and preserves downstream identity", async () => {
  const cases: Array<DshLlmRuntime["resolveModelInfo"]> = [
    async () => {
      throw new Error("resolver failure");
    },
    async (provider, model) => ({ provider, id: model, name: model }),
    async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning([]) }),
    async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning(["off"], "invalid") })
  ];

  for (const loggerPlacement of ["child", "root"] as const) {
    for (const resolve of cases) {
      const logger: NonNullable<DshContext["logger"]> = {
        warn() {
          throw new Error("logger sentinel");
        }
      };
      const harness = routingHarness({
        resolve,
        ...(loggerPlacement === "child"
          ? { childLogger: logger, rootLogger: null }
          : { childLogger: null, rootLogger: logger })
      });
      harness.install();
      const downstream = officialConfig();

      assert.equal(await request(harness, activeFrame(), downstream), downstream, loggerPlacement);
    }
  }
});

test("model-routing warnings identify route and desired effort without request or resolver details", async () => {
  const secretRequest = "secret prompt text";
  const secretCredential = "credential-token";
  const secretError = "resolver-error-details";
  const harness = routingHarness({
    resolve: async () => {
      throw new Error(`${secretError} ${secretCredential}`);
    }
  });
  harness.install();
  await request(harness, activeFrame(), officialConfig({ messages: [{ content: secretRequest }], credentials: secretCredential }));

  assert.equal(harness.warnings.length, 1);
  const [warning] = harness.warnings;
  assert.match(warning, /deepseek-official\/deepseek-v4-pro/u);
  assert.match(warning, /high/u);
  for (const secret of [secretRequest, secretCredential, secretError, "messages"]) assert.equal(warning.includes(secret), false);
});

test("injected listener is child-owned, disposes cleanly, and replacement has no duplicate resolver", async () => {
  const harness = routingHarness();
  assert.deepEqual(harness.dependencies, [["llm"]]);
  harness.install();
  harness.install();
  const first = await request(harness, activeFrame(), officialConfig());
  assert.equal(first.reasoningEffort, "high");
  assert.equal(harness.resolverCalls.length, 1);

  harness.dispose();
  assert.equal(harness.listener, undefined);

  harness.install(harness.createChild());
  await request(harness, activeFrame(), officialConfig());
  assert.equal(harness.resolverCalls.length, 2);
});

test("direct installation is used only when the root owns llm and on", async () => {
  const harness = routingHarness({ withInject: false });
  assert.deepEqual(harness.dependencies, []);
  assert.ok(harness.listener);
  assert.equal((await request(harness, activeFrame(), officialConfig())).reasoningEffort, "high");
});

interface ComposedRegistration {
  event: string;
  listener: (...args: any[]) => unknown;
  options: unknown;
}

interface ComposedRoutingHarness {
  readonly order: string[];
  readonly resolverCalls: Array<{ provider: string; model: string }>;
  readonly registrations: ComposedRegistration[];
  error(frame: AgentRequestErrorFrame): Promise<DshRequestErrorAction>;
  request(frame: AgentRequestFrame, downstream: DshLlmCallConfig): Promise<DshLlmCallConfig>;
}

function composedRoutingHarness(settings: DsmmSettings): ComposedRoutingHarness {
  const order: string[] = [];
  const resolverCalls: Array<{ provider: string; model: string }> = [];
  const registrations: ComposedRegistration[] = [];
  const context: DshContext = {
    llm: {
      async resolveCallConfig(config) { return config; },
      async resolveModelInfo(provider, model) {
        resolverCalls.push({ provider, model });
        return { provider, id: model, name: model, reasoning: reasoning(["high"], "high") };
      }
    },
    on(event: string, listener: (...args: any[]) => unknown, options?: unknown) {
      const registration: ComposedRegistration = { event, listener, options };
      registrations.push(registration);
      return () => {
        const index = registrations.indexOf(registration);
        if (index >= 0) registrations.splice(index, 1);
      };
    },
    effect() {}
  };
  const controller = new DeepworkModeController({});
  registerRuntimeRecovery(context, controller, () => settings);
  const recoveryRequest = registrations.find((registration) => registration.event === "agent/request");
  registerModelRouting(context, controller, () => settings);

  const ordered = (event: string): ComposedRegistration[] => {
    const matching = registrations.filter((registration) => registration.event === event);
    return [
      ...matching.filter((registration) => isPrepend(registration.options)).reverse(),
      ...matching.filter((registration) => !isPrepend(registration.options))
    ];
  };

  return {
    order,
    resolverCalls,
    registrations,
    async error(frame) {
      const listeners = ordered("agent/request-error").map((registration) => registration.listener as AgentRequestErrorListener);
      const invoke = async (index: number): Promise<DshRequestErrorAction> => index >= listeners.length
        ? undefined
        : listeners[index](frame, () => invoke(index + 1));
      return invoke(0);
    },
    async request(frame, downstream) {
      const listeners = ordered("agent/request");
      const invoke = async (index: number): Promise<DshLlmCallConfig> => {
        if (index >= listeners.length) {
          order.push("base");
          return downstream;
        }
        const registration = listeners[index];
        const label = registration === recoveryRequest ? "recovery" : "model-routing";
        order.push(`${label}:before-next`);
        const result = await (registration.listener as AgentRequestListener)(frame, () => invoke(index + 1));
        order.push(`${label}:after-next`);
        return result;
      };
      return invoke(0);
    }
  };
}

function isPrepend(options: unknown): boolean {
  return typeof options === "object" && options !== null && "prepend" in options && options.prepend === true;
}

function composedAgent(events: DshSessionEvent[], header: DshEpochHeader): DshAgent {
  return {
    session: {
      events,
      requestHeader() {
        return header;
      },
      append() {}
    }
  };
}

function composedErrorFrame(agent: DshAgent, provider: string): AgentRequestErrorFrame {
  return {
    agent,
    turn: 1,
    step: 1,
    provider,
    failure: { message: "provider body", code: "rate_limit", status: 429 },
    retryPolicy: {},
    signal: new AbortController().signal
  };
}

test("uncorrelated historical headers cannot admit a fallback before model routing", async () => {
  const settings: DsmmSettings = {
    ...DEFAULT_DSMM_SETTINGS,
    defaultActive: true,
    runtimeRecovery: {
      ...DEFAULT_DSMM_SETTINGS.runtimeRecovery,
      enabled: true,
      fallbackRoutes: [{ provider: "deepseek-official", model: "deepseek-v4-pro" }]
    }
  };
  const header = { config: { provider: "primary", model: "primary-model" } };
  const agent = composedAgent([
    { type: "request/header", data: { reason: "initial", header } },
    { type: "step/start", data: { turn: 1, step: 1 } }
  ], header);
  const harness = composedRoutingHarness(settings);
  const nested = { unknown: true };
  const downstream = { provider: "primary", model: "primary-model", reasoningEffort: "low", nested };

  assert.equal(await harness.error(composedErrorFrame(agent, "primary")), undefined);
  const result = await harness.request({ agent, turn: 1, step: 1, signal: new AbortController().signal }, downstream);

  assert.deepEqual(harness.order, [
    "model-routing:before-next",
    "recovery:before-next",
    "base",
    "recovery:after-next",
    "model-routing:after-next"
  ]);
  assert.deepEqual(harness.resolverCalls, []);
  assert.equal(result.provider, "primary");
  assert.equal(result.model, "primary-model");
  assert.equal(result.reasoningEffort, "low");
  assert.equal(result.nested, nested);
});

test("disabled recovery leaves an already-official route to existing model routing without a pending handoff", async () => {
  const settings: DsmmSettings = {
    ...DEFAULT_DSMM_SETTINGS,
    defaultActive: true,
    runtimeRecovery: {
      ...DEFAULT_DSMM_SETTINGS.runtimeRecovery,
      enabled: false,
      fallbackRoutes: [{ provider: "other", model: "other-model" }]
    }
  };
  const header = { config: { provider: "primary", model: "primary-model" } };
  const agent = composedAgent([], header);
  const harness = composedRoutingHarness(settings);
  const downstream = officialConfig();

  assert.equal(await harness.error(composedErrorFrame(agent, "primary")), undefined);
  const result = await harness.request({ agent, turn: 1, step: 1, signal: new AbortController().signal }, downstream);

  assert.equal(result.provider, "deepseek-official");
  assert.equal(result.model, "deepseek-v4-pro");
  assert.equal(result.reasoningEffort, "high");
  assert.deepEqual(harness.resolverCalls, [{ provider: "deepseek-official", model: "deepseek-v4-pro" }]);
});
