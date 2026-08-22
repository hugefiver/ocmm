import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshContext, DshSettingsRegistry } from "../lib/dsh-types.js";
import { apply } from "../lib/index.js";
import { DSMM_ROLE_IDS } from "../lib/roles.js";
import { DSMM_SKILL_NAMES, DEFAULT_DSMM_SETTINGS, DSMM_SETTINGS_NAMESPACE, resolveConfig, registerSettings } from "../lib/settings.js";

const DEFAULT_ROLE_SETTINGS = Object.fromEntries(DSMM_ROLE_IDS.map((id) => [id, true]));
const DEFAULT_SKILL_SETTINGS = Object.fromEntries(DSMM_SKILL_NAMES.map((id) => [id, true]));
const DEFAULT_WORKFLOW_SETTINGS = {
  strictGates: true,
  reviewCap: 5,
  finalReviewPolicy: "simple-oracle-complex-reviewer"
};

test("default settings keep deepwork opt-in and calibration automatic", () => {
  assert.deepEqual(DEFAULT_DSMM_SETTINGS, {
    modeName: "deepwork",
    defaultActive: false,
    promptOrder: 50,
    deepseekV4ProCalibration: "auto",
    skills: DEFAULT_SKILL_SETTINGS,
    roles: DEFAULT_ROLE_SETTINGS,
    presets: {
      materialize: false
    },
    workflow: DEFAULT_WORKFLOW_SETTINGS
  });
});

test("resolveConfig overlays plugin config on defaults", () => {
  assert.deepEqual(resolveConfig({ modeName: "dw", promptOrder: 60, deepseekV4ProCalibration: "off" }), {
    modeName: "dw",
    defaultActive: false,
    promptOrder: 60,
    deepseekV4ProCalibration: "off",
    skills: DEFAULT_SKILL_SETTINGS,
    roles: DEFAULT_ROLE_SETTINGS,
    presets: {
      materialize: false
    },
    workflow: DEFAULT_WORKFLOW_SETTINGS
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
    skills: DEFAULT_SKILL_SETTINGS,
    roles: DEFAULT_ROLE_SETTINGS,
    presets: {
      materialize: false
    },
    workflow: DEFAULT_WORKFLOW_SETTINGS
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
    }
  });

  assert.deepEqual(registrationOptions, { base: { ...DEFAULT_DSMM_SETTINGS, modeName: "base" }, applies: "restart" });
  assert.equal(getSettings().modeName, "attached");
  assert.deepEqual(observed, ["attached"]);
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
  let deferredInstaller: ((services: { settings?: DshSettingsRegistry }) => unknown) | undefined;

  registerSettings({
    inject(dependencies, installer) {
      if (dependencies[0] !== "settings") return;
      deferredInstaller = installer as typeof deferredInstaller;
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
      if (dependencies[0] !== "settings") return;
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
