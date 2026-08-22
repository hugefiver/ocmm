import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshContext, DshSettingsRegistry } from "../lib/dsh-types.js";
import { apply } from "../lib/index.js";
import { DEFAULT_DSMM_SETTINGS, DSMM_SETTINGS_NAMESPACE, resolveConfig, registerSettings } from "../lib/settings.js";

test("default settings keep deepwork opt-in and calibration automatic", () => {
  assert.deepEqual(DEFAULT_DSMM_SETTINGS, {
    modeName: "deepwork",
    defaultActive: false,
    promptOrder: 50,
    deepseekV4ProCalibration: "auto",
    skills: {
      brainstorming: true,
      "writing-plans": true,
      "requesting-code-review": true,
      "receiving-code-review": true
    }
  });
});

test("resolveConfig overlays plugin config on defaults", () => {
  assert.deepEqual(resolveConfig({ modeName: "dw", promptOrder: 60, deepseekV4ProCalibration: "off" }), {
    modeName: "dw",
    defaultActive: false,
    promptOrder: 60,
    deepseekV4ProCalibration: "off",
    skills: {
      brainstorming: true,
      "writing-plans": true,
      "requesting-code-review": true,
      "receiving-code-review": true
    }
  });
});

test("resolveConfig supports per-skill toggles", () => {
  const settings = resolveConfig({ skills: { "writing-plans": false } });
  assert.equal(settings.skills["writing-plans"], false);
  assert.equal(settings.skills.brainstorming, true);
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
    skills: {
      brainstorming: true,
      "writing-plans": true,
      "requesting-code-review": true,
      "receiving-code-review": true
    }
  });
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
