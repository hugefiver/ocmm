import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { DshContext, DshSettingsRegistry, DshSystemPromptSection } from "../lib/dsh-types.js";
import { DSMM_STATUS_COMMAND } from "../lib/commands.js";
import { apply } from "../lib/index.js";
import { DEFAULT_DSMM_LSP_SETTINGS } from "../lib/lsp.js";
import { DSMM_ROLE_IDS } from "../lib/roles.js";
import { DSMM_SKILL_NAMES, DEFAULT_DSMM_SETTINGS, DSMM_SETTINGS_NAMESPACE, resolveConfig, registerSettings } from "../lib/settings.js";
import type { DsmmPluginConfig } from "../lib/settings.js";

const DEFAULT_ROLE_SETTINGS = Object.fromEntries(DSMM_ROLE_IDS.map((id) => [id, true]));
const DEFAULT_SKILL_SETTINGS = Object.fromEntries(DSMM_SKILL_NAMES.map((id) => [id, true]));
const DEFAULT_WORKFLOW_SETTINGS = {
  strictGates: true,
  reviewCap: 5,
  finalReviewPolicy: "simple-oracle-complex-reviewer"
};
const DEFAULT_GUARD_SETTINGS = {
  scope: "deepwork-or-dsmm-agent",
  shellCommandSafety: true,
  gitWriteGuard: "ask",
  toolOutputTruncation: {
    enabled: true,
    maxInlineBytes: 12000
  },
  planFormatValidation: true,
  questionLabelHelper: {
    enabled: true,
    maxLabelChars: 30
  },
  todoDisciplineHelper: true
};
const DEFAULT_RUNTIME_RECOVERY_SETTINGS = {
  enabled: false,
  retryOnStatusCodes: [429, 500, 502, 503, 504],
  retryOnCodes: [],
  fallbackRoutes: [],
  maxFallbackAttempts: 2,
  idleContinuation: {
    enabled: false,
    maxContinuations: 3,
    prompt: "Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work."
  }
};

type DshEffectCallback = Parameters<NonNullable<DshContext["effect"]>>[0];

test("default settings keep deepwork opt-in and calibration automatic", () => {
  assert.deepEqual(DEFAULT_DSMM_SETTINGS, {
    modeName: "deepwork",
    defaultActive: false,
    promptOrder: 50,
    deepseekV4ProCalibration: "auto",
    deepseekV4ProDefaultReasoningEffort: "high",
    deepseekV4ProMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"],
    skills: DEFAULT_SKILL_SETTINGS,
    roles: DEFAULT_ROLE_SETTINGS,
    presets: {
      materialize: false
    },
    workflow: DEFAULT_WORKFLOW_SETTINGS,
    guards: DEFAULT_GUARD_SETTINGS,
    runtimeRecovery: DEFAULT_RUNTIME_RECOVERY_SETTINGS,
    lsp: DEFAULT_DSMM_LSP_SETTINGS
  });
});

test("default settings enable scoped safety guards", () => {
  assert.deepEqual(DEFAULT_DSMM_SETTINGS.guards, DEFAULT_GUARD_SETTINGS);
});

test("resolveConfig overlays plugin config on defaults", () => {
  assert.deepEqual(resolveConfig({ modeName: "dw", promptOrder: 60, deepseekV4ProCalibration: "off" }), {
    modeName: "dw",
    defaultActive: false,
    promptOrder: 60,
    deepseekV4ProCalibration: "off",
    deepseekV4ProDefaultReasoningEffort: "high",
    deepseekV4ProMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"],
    skills: DEFAULT_SKILL_SETTINGS,
    roles: DEFAULT_ROLE_SETTINGS,
    presets: {
      materialize: false
    },
    workflow: DEFAULT_WORKFLOW_SETTINGS,
    guards: DEFAULT_GUARD_SETTINGS,
    runtimeRecovery: DEFAULT_RUNTIME_RECOVERY_SETTINGS,
    lsp: DEFAULT_DSMM_LSP_SETTINGS
  });
});

test("resolveConfig reserves only the exact dsmm-status mode name", () => {
  const cases: Array<readonly [string | undefined, string]> = [
    [undefined, DEFAULT_DSMM_SETTINGS.modeName],
    [DSMM_STATUS_COMMAND, DEFAULT_DSMM_SETTINGS.modeName],
    ["custom", "custom"],
    ["", ""],
    ["DSMM-STATUS", "DSMM-STATUS"],
    ["dsmm-status ", "dsmm-status "]
  ];

  for (const [modeName, expected] of cases) {
    assert.equal(resolveConfig({ modeName }).modeName, expected);
  }
});

test("resolveConfig supports every DeepSeek V4 Pro default reasoning effort", () => {
  for (const effort of ["off", "low", "high"] as const) {
    assert.equal(resolveConfig({ deepseekV4ProDefaultReasoningEffort: effort }).deepseekV4ProDefaultReasoningEffort, effort);
  }
});

test("resolveConfig canonicalizes DeepSeek V4 Pro max reasoning presets", () => {
  const normalized = resolveConfig({
    deepseekV4ProDefaultReasoningEffort: "low",
    deepseekV4ProMaxReasoningPresets: [
      "dsmm-reviewer",
      "invalid-role",
      "dsmm-plan-critic",
      "dsmm-reviewer"
    ]
  } as unknown as DsmmPluginConfig);

  assert.equal(normalized.deepseekV4ProDefaultReasoningEffort, "low");
  assert.deepEqual(normalized.deepseekV4ProMaxReasoningPresets, ["dsmm-plan-critic", "dsmm-reviewer"]);
  assert.deepEqual(resolveConfig({ deepseekV4ProMaxReasoningPresets: [] }).deepseekV4ProMaxReasoningPresets, []);
});

test("resolveConfig supports partial lsp setting overlays", () => {
  const settings = resolveConfig({
    lsp: {
      enabled: true,
      serverName: "custom_lsp",
      args: ["mcp", "--trace"],
      env: { DSMM_LSP_LOG: "1" },
      toolCallTimeoutMs: 4500.8
    }
  });

  assert.deepEqual(settings.lsp, {
    ...DEFAULT_DSMM_LSP_SETTINGS,
    enabled: true,
    serverName: "custom_lsp",
    args: ["mcp", "--trace"],
    env: { DSMM_LSP_LOG: "1" },
    toolCallTimeoutMs: 4500
  });
});

test("resolveConfig falls back for invalid lsp timeouts", () => {
  assert.equal(resolveConfig({ lsp: { toolCallTimeoutMs: 0 } }).lsp.toolCallTimeoutMs, DEFAULT_DSMM_LSP_SETTINGS.toolCallTimeoutMs);
  assert.equal(resolveConfig({ lsp: { toolCallTimeoutMs: Number.NaN } }).lsp.toolCallTimeoutMs, DEFAULT_DSMM_LSP_SETTINGS.toolCallTimeoutMs);
});

test("resolveConfig supports partial guard setting overlays", () => {
  const settings = resolveConfig({
    guards: {
      scope: "always",
      gitWriteGuard: "deny",
      toolOutputTruncation: { maxInlineBytes: 80 },
      questionLabelHelper: { enabled: false }
    }
  });

  assert.deepEqual(settings.guards, {
    ...DEFAULT_GUARD_SETTINGS,
    scope: "always",
    gitWriteGuard: "deny",
    toolOutputTruncation: {
      enabled: true,
      maxInlineBytes: 80
    },
    questionLabelHelper: {
      enabled: false,
      maxLabelChars: 30
    }
  });
});

test("resolveConfig normalizes guard positive integer limits", () => {
  assert.equal(resolveConfig({ guards: { toolOutputTruncation: { maxInlineBytes: 0 } } }).guards.toolOutputTruncation.maxInlineBytes, 12000);
  assert.equal(resolveConfig({ guards: { questionLabelHelper: { maxLabelChars: Number.NaN } } }).guards.questionLabelHelper.maxLabelChars, 30);
  assert.equal(resolveConfig({ guards: { toolOutputTruncation: { maxInlineBytes: 80.9 } } }).guards.toolOutputTruncation.maxInlineBytes, 80);
});

test("resolveConfig normalizes runtime recovery settings", () => {
  const settings = resolveConfig({
    runtimeRecovery: {
      retryOnStatusCodes: [429, 429, 99, 600, 500.5, 503],
      retryOnCodes: [" ETIMEDOUT ", "etimedout", "", "ECONNRESET"],
      fallbackRoutes: [
        { provider: " primary ", model: " primary-model " },
        { provider: "primary", model: "primary-model" },
        { provider: " ", model: "discard" },
        { provider: "discard", model: " " },
        { provider: " secondary ", model: " fallback-model " }
      ],
      maxFallbackAttempts: 99,
      idleContinuation: { maxContinuations: -4 }
    }
  });

  assert.deepEqual(settings.runtimeRecovery, {
    ...DEFAULT_RUNTIME_RECOVERY_SETTINGS,
    retryOnStatusCodes: [429, 503],
    retryOnCodes: ["etimedout", "econnreset"],
    fallbackRoutes: [
      { provider: "primary", model: "primary-model" },
      { provider: "secondary", model: "fallback-model" }
    ],
    maxFallbackAttempts: 10,
    idleContinuation: {
      ...DEFAULT_RUNTIME_RECOVERY_SETTINGS.idleContinuation,
      maxContinuations: 0
    }
  });
});

test("resolveConfig keeps explicit empty recovery lists and non-finite limits defaulted", () => {
  const empty = resolveConfig({
    runtimeRecovery: {
      retryOnStatusCodes: [],
      retryOnCodes: [],
      fallbackRoutes: []
    }
  });
  const nonFinite = resolveConfig({
    runtimeRecovery: {
      maxFallbackAttempts: Number.POSITIVE_INFINITY,
      idleContinuation: { maxContinuations: Number.NaN }
    }
  });

  assert.deepEqual(empty.runtimeRecovery.retryOnStatusCodes, []);
  assert.deepEqual(empty.runtimeRecovery.retryOnCodes, []);
  assert.deepEqual(empty.runtimeRecovery.fallbackRoutes, []);
  assert.equal(nonFinite.runtimeRecovery.maxFallbackAttempts, 2);
  assert.equal(nonFinite.runtimeRecovery.idleContinuation.maxContinuations, 3);
});

test("resolveConfig defensively copies normalized recovery settings", () => {
  const input = {
    runtimeRecovery: {
      retryOnStatusCodes: [429],
      retryOnCodes: ["ETIMEDOUT"],
      fallbackRoutes: [{ provider: "primary", model: "primary-model" }],
      idleContinuation: { prompt: "Keep going." }
    }
  } satisfies DsmmPluginConfig;
  const first = resolveConfig(input);
  const second = resolveConfig(input);

  assert.notEqual(first.runtimeRecovery, second.runtimeRecovery);
  assert.notEqual(first.runtimeRecovery.retryOnStatusCodes, second.runtimeRecovery.retryOnStatusCodes);
  assert.notEqual(first.runtimeRecovery.retryOnCodes, second.runtimeRecovery.retryOnCodes);
  assert.notEqual(first.runtimeRecovery.fallbackRoutes, second.runtimeRecovery.fallbackRoutes);
  assert.notEqual(first.runtimeRecovery.fallbackRoutes[0], second.runtimeRecovery.fallbackRoutes[0]);
  assert.notEqual(first.runtimeRecovery.idleContinuation, second.runtimeRecovery.idleContinuation);
  assert.notEqual(first.runtimeRecovery.retryOnStatusCodes, DEFAULT_DSMM_SETTINGS.runtimeRecovery.retryOnStatusCodes);
  assert.notEqual(first.runtimeRecovery.retryOnCodes, DEFAULT_DSMM_SETTINGS.runtimeRecovery.retryOnCodes);
  assert.notEqual(first.runtimeRecovery.fallbackRoutes, DEFAULT_DSMM_SETTINGS.runtimeRecovery.fallbackRoutes);
  assert.notEqual(first.runtimeRecovery.fallbackRoutes[0], input.runtimeRecovery.fallbackRoutes?.[0]);

  first.runtimeRecovery.retryOnStatusCodes.push(503);
  first.runtimeRecovery.retryOnCodes.push("econnreset");
  first.runtimeRecovery.fallbackRoutes[0].provider = "changed";
  first.runtimeRecovery.idleContinuation.prompt = "Changed.";

  assert.deepEqual(second.runtimeRecovery, {
    ...DEFAULT_RUNTIME_RECOVERY_SETTINGS,
    retryOnStatusCodes: [429],
    retryOnCodes: ["etimedout"],
    fallbackRoutes: [{ provider: "primary", model: "primary-model" }],
    idleContinuation: {
      ...DEFAULT_RUNTIME_RECOVERY_SETTINGS.idleContinuation,
      prompt: "Keep going."
    }
  });
});

test("resolveConfig supports per-skill toggles", () => {
  const settings = resolveConfig({ skills: { "writing-plans": false, "remove-ai-slops": false } });
  assert.equal(settings.skills["writing-plans"], false);
  assert.equal(settings.skills["remove-ai-slops"], false);
  assert.equal(settings.skills.brainstorming, true);
});

test("resolveConfig supports workflow setting overlays", () => {
  const settings = resolveConfig({ workflow: { reviewCap: 2, finalReviewPolicy: "reviewer-only" } });

  assert.deepEqual(settings.workflow, {
    strictGates: true,
    reviewCap: 2,
    finalReviewPolicy: "reviewer-only"
  });
});

test("resolveConfig supports per-role toggles", () => {
  const settings = resolveConfig({ roles: { "dsmm-reviewer": false } });

  assert.equal(settings.roles["dsmm-reviewer"], false);
  assert.equal(settings.roles["dsmm-orchestrator"], true);
});

test("resolveConfig supports preset materialization settings", () => {
  const settings = resolveConfig({ presets: { materialize: true, root: "/tmp/dsmm-presets" } });

  assert.deepEqual(settings.presets, {
    materialize: true,
    root: "/tmp/dsmm-presets"
  });
  assert.deepEqual(resolveConfig({ presets: { materialize: true } }).presets, { materialize: true });
});

test("registerSettings registers direct namespace dsmm with a callable schema and base settings", () => {
  const calls: Array<{ namespace: string; schema: unknown; options: unknown }> = [];
  const ctx: DshContext = {
    settings: {
      register<T>(namespace: string, schema: unknown, options: { base: Partial<T>; applies?: "live" | "restart" }) {
        calls.push({ namespace, schema, options });
        return { get: () => options.base as T };
      }
    }
  };

  const getSettings = registerSettings(ctx, { defaultActive: true });

  assert.equal(calls[0]?.namespace, DSMM_SETTINGS_NAMESPACE);
  assert.equal(typeof calls[0]?.schema, "function");
  assert.equal(typeof (calls[0]?.schema as { toJSON?: unknown }).toJSON, "function");
  assert.deepEqual(getSettings(), {
    modeName: "deepwork",
    defaultActive: true,
    promptOrder: 50,
    deepseekV4ProCalibration: "auto",
    deepseekV4ProDefaultReasoningEffort: "high",
    deepseekV4ProMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"],
    skills: DEFAULT_SKILL_SETTINGS,
    roles: DEFAULT_ROLE_SETTINGS,
    presets: {
      materialize: false
    },
    workflow: DEFAULT_WORKFLOW_SETTINGS,
    guards: DEFAULT_GUARD_SETTINGS,
    runtimeRecovery: DEFAULT_RUNTIME_RECOVERY_SETTINGS,
    lsp: DEFAULT_DSMM_LSP_SETTINGS
  });
});

test("registerSettings notifies only attached effective restart-scoped settings when service exists", () => {
  const observed: string[] = [];
  const attached = { ...DEFAULT_DSMM_SETTINGS, modeName: "attached" };
  let registrationOptions: unknown;

  const getSettings = registerSettings({
    settings: {
      register<T>(_namespace: string, _schema: unknown, options: unknown) {
        registrationOptions = options;
        return {
          get: () => attached as T
        };
      }
    }
  }, { modeName: "base" }, {
    onChange(settings) {
      observed.push(settings.modeName);
    },
    install(_readyCtx, getReadySettings) {
      observed.push(`install:${getReadySettings().modeName}`);
    }
  });

  assert.deepEqual(registrationOptions, { base: { ...DEFAULT_DSMM_SETTINGS, modeName: "base" }, applies: "restart" });
  assert.equal(getSettings().modeName, "attached");
  assert.deepEqual(observed, ["attached", "install:attached"]);
});

test("registerSettings reserves attached dsmm-status mode names for getters and installs", () => {
  const installed: string[] = [];
  const getSettings = registerSettings({
    settings: {
      register<T>() {
        return { get: () => ({ ...DEFAULT_DSMM_SETTINGS, modeName: DSMM_STATUS_COMMAND }) as T };
      }
    }
  }, {}, {
    install(_readyCtx, getReadySettings) {
      installed.push(getReadySettings().modeName);
    }
  });

  assert.equal(getSettings().modeName, DEFAULT_DSMM_SETTINGS.modeName);
  assert.deepEqual(installed, [DEFAULT_DSMM_SETTINGS.modeName]);
});

test("registerSettings normalizes attached DeepSeek V4 Pro max reasoning presets for getters and installs", () => {
  const installedPresets: string[][] = [];
  const attached = {
    ...DEFAULT_DSMM_SETTINGS,
    deepseekV4ProMaxReasoningPresets: ["dsmm-reviewer", "invalid-role", "dsmm-plan-critic", "dsmm-reviewer"]
  };

  const getSettings = registerSettings({
    settings: {
      register<T>() {
        return { get: () => attached as T };
      }
    }
  }, {}, {
    install(_readyCtx, getReadySettings) {
      installedPresets.push(getReadySettings().deepseekV4ProMaxReasoningPresets);
    }
  });

  assert.deepEqual(getSettings().deepseekV4ProMaxReasoningPresets, ["dsmm-plan-critic", "dsmm-reviewer"]);
  assert.deepEqual(installedPresets, [["dsmm-plan-critic", "dsmm-reviewer"]]);
});

test("registerSettings normalizes attached runtime recovery settings for getters and installs", () => {
  const installed: Array<ReturnType<typeof resolveConfig>["runtimeRecovery"]> = [];
  const attached = {
    ...DEFAULT_DSMM_SETTINGS,
    runtimeRecovery: {
      ...DEFAULT_DSMM_SETTINGS.runtimeRecovery,
      retryOnStatusCodes: [429, 429, 99, 503],
      retryOnCodes: [" RATE_LIMIT ", "rate_limit", ""],
      fallbackRoutes: [
        { provider: " fallback ", model: " model " },
        { provider: "fallback", model: "model" },
        { provider: "", model: "discard" }
      ],
      maxFallbackAttempts: 99,
      idleContinuation: {
        ...DEFAULT_DSMM_SETTINGS.runtimeRecovery.idleContinuation,
        maxContinuations: -4
      }
    }
  };

  const getSettings = registerSettings({
    settings: {
      register<T>() {
        return { get: () => attached as T };
      }
    }
  }, {}, {
    install(_readyCtx, getReadySettings) {
      installed.push(getReadySettings().runtimeRecovery);
    }
  });

  const expected = {
    ...DEFAULT_RUNTIME_RECOVERY_SETTINGS,
    retryOnStatusCodes: [429, 503],
    retryOnCodes: ["rate_limit"],
    fallbackRoutes: [{ provider: "fallback", model: "model" }],
    maxFallbackAttempts: 10,
    idleContinuation: {
      ...DEFAULT_RUNTIME_RECOVERY_SETTINGS.idleContinuation,
      maxContinuations: 0
    }
  };
  assert.deepEqual(getSettings().runtimeRecovery, expected);
  assert.deepEqual(installed, [expected]);
});

test("registerSettings notifies base settings only when no settings service attaches", () => {
  const observed: string[] = [];

  const getSettings = registerSettings({}, { modeName: "base-only" }, {
    onChange(settings) {
      observed.push(settings.modeName);
    }
  });

  assert.equal(getSettings().modeName, "base-only");
  assert.deepEqual(observed, ["base-only"]);
});

test("registerSettings does not notify a base root before an injected settings root attaches", () => {
  const observedRoots: Array<string | undefined> = [];
  let deferredInstaller: ((readyCtx: DshContext) => unknown) | undefined;

  registerSettings({
    inject(dependencies, installer) {
      if (dependencies[0] !== "settings") return;
      deferredInstaller = installer;
    }
  }, { presets: { materialize: true, root: "base-root" } }, {
    onChange(settings) {
      observedRoots.push(settings.presets.root);
    }
  });

  assert.deepEqual(observedRoots, []);
  deferredInstaller?.({
    settings: {
      register<T>() {
        return { get: () => ({ ...DEFAULT_DSMM_SETTINGS, presets: { materialize: true, root: "attached-root" } }) as T };
      }
    }
  });

  assert.deepEqual(observedRoots, ["attached-root"]);
});

test("registerSettings can wait for an injected settings service", () => {
  const calls: string[] = [];
  const getSettings = registerSettings({
    inject(dependencies, installer) {
      assert.deepEqual(dependencies, ["settings", "systemPrompt"]);
      installer({
        settings: {
          register<T>(namespace: string) {
            calls.push(namespace);
            return { get: () => ({ ...DEFAULT_DSMM_SETTINGS, modeName: "injected" }) as T };
          }
        }
      });
    },
    systemPrompt: { section() {} }
  });

  assert.deepEqual(calls, ["dsmm"]);
  assert.equal(getSettings().modeName, "injected");
});

test("registerSettings installs once per settings registry on the same injected child and replaces the live getter", () => {
  let installer: ((readyCtx: DshContext) => unknown) | undefined;
  const changes: string[] = [];
  const installs: string[] = [];
  const effectCallbacks: DshEffectCallback[] = [];
  const settingsA: DshSettingsRegistry = {
    register<T>() {
      return { get: () => ({ ...DEFAULT_DSMM_SETTINGS, modeName: "attached-a" }) as T };
    }
  };
  const settingsB: DshSettingsRegistry = {
    register<T>() {
      return { get: () => ({ ...DEFAULT_DSMM_SETTINGS, modeName: "attached-b" }) as T };
    }
  };
  const child: DshContext = {
    settings: settingsA,
    effect(callback) {
      effectCallbacks.push(callback);
    }
  };

  const getSettings = registerSettings({
    inject(dependencies, candidate) {
      if (dependencies[0] === "settings") installer = candidate;
    }
  }, {}, {
    onChange(settings) {
      changes.push(settings.modeName);
    },
    install(_readyCtx, getReadySettings) {
      installs.push(getReadySettings().modeName);
    }
  });

  const ready = installer;
  assert.ok(ready);
  ready(child);
  ready(child);
  child.settings = settingsB;
  ready(child);
  const firstEffect = effectCallbacks[0];
  assert.ok(firstEffect);
  const firstCleanup = firstEffect();
  if (typeof firstCleanup === "function") firstCleanup();
  ready(child);

  assert.deepEqual(changes, ["attached-a", "attached-b"]);
  assert.deepEqual(installs, ["attached-a", "attached-b"]);
  assert.equal(getSettings().modeName, "attached-b");
});

test("registerSettings reinstalls a same-registry child after its effect cleanup", () => {
  let installer: ((readyCtx: DshContext) => unknown) | undefined;
  const installs: string[] = [];
  const effectCallbacks: DshEffectCallback[] = [];
  const settings: DshSettingsRegistry = {
    register<T>() {
      return { get: () => ({ ...DEFAULT_DSMM_SETTINGS, modeName: "attached-a" }) as T };
    }
  };
  const child: DshContext = {
    settings,
    effect(callback) {
      effectCallbacks.push(callback);
    }
  };

  const getSettings = registerSettings({
    inject(dependencies, candidate) {
      if (dependencies[0] === "settings") installer = candidate;
    }
  }, {}, {
    install(_readyCtx, getReadySettings) {
      installs.push(getReadySettings().modeName);
    }
  });

  const ready = installer;
  assert.ok(ready);
  ready(child);
  ready(child);
  const effect = effectCallbacks[0];
  assert.ok(effect);
  const cleanup = effect();
  assert.equal(typeof cleanup, "function");
  if (typeof cleanup === "function") cleanup();
  ready(child);

  assert.deepEqual(installs, ["attached-a", "attached-a"]);
  assert.equal(getSettings().modeName, "attached-a");
});

test("registerSettings returns base fallback when the settings service is absent", () => {
  const getSettings = registerSettings({ systemPrompt: { section() {} } }, { modeName: "fallback" });

  assert.equal(getSettings().modeName, "fallback");
});

test("registerSettings does not read missing Cordis services directly", () => {
  const ctx = new Proxy({} as DshContext, {
    get(_target, property) {
      if (property === "settings") throw new Error("settings was read directly");
      return undefined;
    },
    has() {
      return false;
    }
  });

  assert.doesNotThrow(() => registerSettings(ctx, { modeName: "proxy-safe" }));
});

test("registerSettings installs once on the root with base settings when the settings service is absent", () => {
  const ctx: DshContext = {};
  const installs: Array<{ context: DshContext; modeName: string }> = [];
  const getSettings = registerSettings(ctx, { modeName: "base-fallback" }, {
    install(readyCtx, getReadySettings) {
      installs.push({ context: readyCtx, modeName: getReadySettings().modeName });
    }
  });

  assert.equal(getSettings().modeName, "base-fallback");
  assert.deepEqual(installs, [{ context: ctx, modeName: "base-fallback" }]);
});

test("apply defers prompt, command, and preset materialization until the settings-ready child", () => {
  const baseRoot = mkdtempSync(join(tmpdir(), "dsmm-base-presets-"));
  const attachedRoot = mkdtempSync(join(tmpdir(), "dsmm-attached-presets-"));
  const rootSections: DshSystemPromptSection[] = [];
  const childSections: DshSystemPromptSection[] = [];
  const rootCommandNames: string[] = [];
  const childCommandNames: string[] = [];
  const attachedSettings = {
    ...DEFAULT_DSMM_SETTINGS,
    modeName: "attached-deepwork",
    promptOrder: 77,
    presets: { materialize: true, root: attachedRoot }
  };
  let settingsInstaller: ((readyCtx: DshContext) => unknown) | undefined;
  const child: DshContext = {
    settings: {
      register<T>() {
        return { get: () => attachedSettings as T };
      }
    },
    systemPrompt: { section(section) { childSections.push(section); } },
    commands: { register(command) { childCommandNames.push(command.name); } }
  };

  try {
    apply({
      systemPrompt: { section(section) { rootSections.push(section); } },
      commands: { register(command) { rootCommandNames.push(command.name); } },
      inject(dependencies, installer) {
        if (dependencies[0] === "settings") settingsInstaller = installer;
      }
    }, {
      modeName: "base-deepwork",
      promptOrder: 50,
      presets: { materialize: true, root: baseRoot }
    });

    assert.deepEqual(rootSections.map((section) => section.order), [], "no root prompt registration before settings attachment; current order must not leak as 50");
    assert.deepEqual(rootCommandNames, []);
    assert.equal(childSections.length, 0);
    assert.equal(childCommandNames.length, 0);
    assert.equal(existsSync(join(baseRoot, "dsmm-orchestrator")), false);

    const installer = settingsInstaller;
    assert.ok(installer);
    installer(child);
    installer(child);

    assert.deepEqual(rootSections, []);
    assert.deepEqual(rootCommandNames, []);
    assert.deepEqual(childSections.map((section) => ({ name: section.name, order: section.order })), [{ name: "dsmm:deepwork", order: 77 }]);
    assert.deepEqual(childCommandNames, ["attached-deepwork", "dsmm-status"]);
    assert.equal(existsSync(join(baseRoot, "dsmm-orchestrator")), false);
    assert.equal(existsSync(join(attachedRoot, "dsmm-orchestrator")), true);
  } finally {
    rmSync(baseRoot, { recursive: true, force: true });
    rmSync(attachedRoot, { recursive: true, force: true });
  }
});

test("apply reserves dsmm-status for base and attached command registrations", () => {
  const baseCommandNames: string[] = [];
  apply({
    systemPrompt: { section() {} },
    commands: { register(command) { baseCommandNames.push(command.name); } }
  }, { modeName: DSMM_STATUS_COMMAND });
  assert.deepEqual(baseCommandNames, [DEFAULT_DSMM_SETTINGS.modeName, DSMM_STATUS_COMMAND]);

  const rootCommandNames: string[] = [];
  const childCommandNames: string[] = [];
  let settingsInstaller: ((readyCtx: DshContext) => unknown) | undefined;
  const child: DshContext = {
    settings: {
      register<T>() {
        return { get: () => ({ ...DEFAULT_DSMM_SETTINGS, modeName: DSMM_STATUS_COMMAND }) as T };
      }
    },
    systemPrompt: { section() {} },
    commands: { register(command) { childCommandNames.push(command.name); } }
  };

  apply({
    systemPrompt: { section() {} },
    commands: { register(command) { rootCommandNames.push(command.name); } },
    inject(dependencies, installer) {
      if (dependencies[0] === "settings") settingsInstaller = installer;
    }
  }, { modeName: DSMM_STATUS_COMMAND });

  assert.deepEqual(rootCommandNames, []);
  const installer = settingsInstaller;
  assert.ok(installer);
  installer(child);
  installer(child);
  assert.deepEqual(childCommandNames, [DEFAULT_DSMM_SETTINGS.modeName, DSMM_STATUS_COMMAND]);
});

test("apply registers settings through host context", () => {
  const namespaces: string[] = [];
  const settings: DshSettingsRegistry = {
    register<T>(namespace: string) {
      namespaces.push(namespace);
      return { get: () => DEFAULT_DSMM_SETTINGS as T };
    }
  };

  apply({
    settings,
    systemPrompt: { section() {} }
  });

  assert.deepEqual(namespaces, ["dsmm"]);
});

test("apply registers recovery request hooks before the existing llm model-routing injection", () => {
  const injections: string[][] = [];
  const registrations: Array<{ event: string; options: unknown }> = [];
  const timeline: string[] = [];

  apply({
    on(event, _listener, options) {
      registrations.push({ event, options });
      timeline.push(`on:${event}`);
      return () => {};
    },
    inject(dependencies) {
      injections.push([...dependencies]);
      timeline.push(`inject:${dependencies.join(",")}`);
    }
  });

  assert.deepEqual(injections.filter((dependencies) => dependencies.join(",") === "settings,systemPrompt"), [["settings", "systemPrompt"]]);
  assert.deepEqual(injections.filter((dependencies) => dependencies.join(",") === "llm"), [["llm"]]);
  assert.deepEqual(registrations.slice(1, 4), [
    { event: "agent/request", options: undefined },
    { event: "agent/request-error", options: { prepend: true } },
    { event: "agent/turn-stopping", options: undefined }
  ]);
  assert.ok(timeline.indexOf("on:agent/request") < timeline.indexOf("inject:llm"));
  assert.ok(timeline.indexOf("on:agent/request-error") < timeline.indexOf("inject:llm"));
  assert.ok(timeline.indexOf("on:agent/turn-stopping") < timeline.indexOf("inject:llm"));
});
