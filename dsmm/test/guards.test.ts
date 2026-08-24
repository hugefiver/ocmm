import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshPostToolDecision, DshPreToolDecision, DshToolExecution, DshToolExecutionResult } from "../lib/dsh-types.js";
import { DSMM_GUARD_PREFIX, decidePostToolExecution, decidePreToolExecution, isSafetyScopeActive, registerSafetyGuards, truncateTextMiddle } from "../lib/guards.js";
import { DEFAULT_DSMM_SETTINGS } from "../lib/settings.js";
import { DEEPWORK_MODE_EVENT, DeepworkModeController } from "../lib/state.js";

function controller(): DeepworkModeController {
  return new DeepworkModeController({});
}

function exec(name: string, args: unknown, active = true): DshToolExecution {
  return {
    name,
    arguments: args,
    agent: {
      session: {
        events: active ? [{ type: DEEPWORK_MODE_EVENT, data: { active: true } }] : [],
        append() {}
      }
    }
  };
}

test("safety scope is active for deepwork mode and dsmm preset sessions", () => {
  assert.equal(isSafetyScopeActive(exec("bash", { command: "pwd" }), DEFAULT_DSMM_SETTINGS, controller()), true);
  assert.equal(isSafetyScopeActive(exec("bash", { command: "pwd" }, false), DEFAULT_DSMM_SETTINGS, controller()), false);
  assert.equal(
    isSafetyScopeActive({
      name: "bash",
      arguments: { command: "pwd" },
      agent: {
        session: {
          events: [{ type: "agent-preset/selected", data: { agentPreset: "dsmm-reviewer" } }],
          append() {}
        }
      }
    }, DEFAULT_DSMM_SETTINGS, controller()),
    true
  );
  assert.equal(
    isSafetyScopeActive(exec("bash", { command: "pwd" }), {
      ...DEFAULT_DSMM_SETTINGS,
      guards: { ...DEFAULT_DSMM_SETTINGS.guards, scope: "off" }
    }, controller()),
    false
  );
});

test("pwsh shell safety denies clear POSIX-only syntax", () => {
  assert.deepEqual(decidePreToolExecution(exec("pwsh", { command: "export CI=true; pnpm test" }), DEFAULT_DSMM_SETTINGS, controller()), {
    kind: "deny",
    reason: `${DSMM_GUARD_PREFIX} PowerShell command appears to use POSIX shell syntax (\`export\`). Use \`$env:NAME = "value"; command\` instead.`
  });
});

test("pwsh shell safety denies POSIX null redirection and source", () => {
  const nullDecision = decidePreToolExecution(exec("powershell", { command: "pnpm test > /dev/null" }), DEFAULT_DSMM_SETTINGS, controller());
  const sourceDecision = decidePreToolExecution(exec("pwsh", { command: "source ./env" }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(nullDecision?.kind, "deny");
  assert.match(
    nullDecision.reason,
    /POSIX null redirection/
  );
  assert.equal(sourceDecision?.kind, "deny");
  assert.match(
    sourceDecision.reason,
    /POSIX `source`/
  );
});

test("bash shell safety denies clear PowerShell-only syntax", () => {
  const decision = decidePreToolExecution(exec("bash", { command: "$env:CI = \"true\"; pnpm test" }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /PowerShell syntax/);
});

test("git write guard asks for approval by default", () => {
  assert.deepEqual(decidePreToolExecution(exec("bash", { command: "git commit -m test" }), DEFAULT_DSMM_SETTINGS, controller()), {
    kind: "ask",
    reason: `${DSMM_GUARD_PREFIX} git write command requires explicit user approval before running: git commit`
  });
});

test("git write guard can be configured to deny", () => {
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, gitWriteGuard: "deny" as const } };
  const decision = decidePreToolExecution(exec("pwsh", { command: "git push origin master" }), settings, controller());

  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /git write command is disabled/);
});

test("git write guard detects destructive operation forms and honors off policy", () => {
  const resetDecision = decidePreToolExecution(exec("bash", { command: "git reset --hard HEAD" }), DEFAULT_DSMM_SETTINGS, controller());
  const stashDecision = decidePreToolExecution(exec("bash", { command: "git stash clear" }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(resetDecision?.kind, "ask");
  assert.match(
    resetDecision.reason ?? "",
    /git reset --hard/
  );
  assert.equal(stashDecision?.kind, "ask");
  assert.match(
    stashDecision.reason ?? "",
    /git stash clear/
  );
  assert.equal(
    decidePreToolExecution(exec("bash", { command: "git clean -fd" }), {
      ...DEFAULT_DSMM_SETTINGS,
      guards: { ...DEFAULT_DSMM_SETTINGS.guards, gitWriteGuard: "off" }
    }, controller()),
    undefined
  );
});

test("git write guard detects staging and repository mutation commands", () => {
  for (const command of ["git add .", "git rm old.ts", "git mv old.ts new.ts", "git merge feature", "git stash"]) {
    const decision = decidePreToolExecution(exec("bash", { command }), DEFAULT_DSMM_SETTINGS, controller());

    assert.equal(decision?.kind, "ask", command);
    assert.match(decision.reason ?? "", /git write command requires explicit user approval/);
  }
});

test("git write guard detects write commands after git global options", () => {
  const commands = [
    "git -C repo commit -m test",
    "git --no-pager push origin main",
    "git -c user.name=test commit -m test",
    "git --git-dir=.git --work-tree=. tag v1.0.0"
  ];

  for (const command of commands) {
    const decision = decidePreToolExecution(exec("bash", { command }), DEFAULT_DSMM_SETTINGS, controller());

    assert.equal(decision?.kind, "ask", command);
    assert.match(decision.reason ?? "", /git write command requires explicit user approval/);
  }
});

test("git write guard detects commands separated by shell newlines", () => {
  const commands = [
    "git status\ngit commit -m test",
    "echo ok\ngit push origin main",
    "git status\r\ngit tag v1.0.0"
  ];

  for (const command of commands) {
    const decision = decidePreToolExecution(exec("bash", { command }), DEFAULT_DSMM_SETTINGS, controller());

    assert.equal(decision?.kind, "ask", command);
    assert.match(decision.reason ?? "", /git write command requires explicit user approval/);
  }
});

test("pwsh shell safety detects POSIX syntax after shell newlines", () => {
  const exportDecision = decidePreToolExecution(exec("pwsh", { command: "Write-Output ok\nexport CI=true" }), DEFAULT_DSMM_SETTINGS, controller());
  const sourceDecision = decidePreToolExecution(exec("pwsh", { command: "Write-Output ok\r\nsource ./env" }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(exportDecision?.kind, "deny");
  assert.match(exportDecision.reason ?? "", /POSIX shell syntax/);
  assert.equal(sourceDecision?.kind, "deny");
  assert.match(sourceDecision.reason ?? "", /POSIX `source`/);
});

test("plan format validation rejects malformed checklist entries", () => {
  const decision = decidePreToolExecution(exec("write", {
    file_path: "docs/superpowers/plans/example.md",
    content: "# Example Implementation Plan\n\n- [] Missing space\n"
  }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /malformed checklist/);
});

test("plan format validation also inspects fallback path and edit content keys", () => {
  const decision = decidePreToolExecution(exec("edit", {
    path: ".omo/plans/example.md",
    new_string: "- [todo] Missing checkbox status\n"
  }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /malformed checklist/);
});

test("question label helper rejects overlong option labels", () => {
  const decision = decidePreToolExecution(exec("ask_user_question", {
    questions: [{ id: "q1", question: "Choose?", options: [{ label: "this label is definitely longer than thirty characters" }] }]
  }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /question option label exceeds 30 characters/);
});

test("question label helper ignores non-dsh question tool names", () => {
  assert.equal(decidePreToolExecution(exec("question", {
    questions: [{ id: "q1", question: "Choose?", options: [{ label: "this label is definitely longer than thirty characters" }] }]
  }), DEFAULT_DSMM_SETTINGS, controller()), undefined);
});

test("todo discipline helper enforces structured content and one active todo while work remains", () => {
  const decision = decidePreToolExecution(exec("todo_write", {
    todos: [
      { content: "fix guards", status: "in_progress" },
      { content: "[docs] [write] to document guards - expect docs", status: "pending" }
    ]
  }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /todo content must use/);
});

test("todo discipline helper rejects missing active todo only for unfinished work", () => {
  const missingActive = decidePreToolExecution(exec("todo_write", {
    todos: [{ content: "[code] [edit] to implement guards - expect passing tests", status: "pending" }]
  }), DEFAULT_DSMM_SETTINGS, controller());
  const completed = decidePreToolExecution(exec("todo_write", {
    todos: [{ content: "[code] [edit] to implement guards - expect passing tests", status: "completed" }]
  }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(missingActive?.kind, "deny");
  assert.match(missingActive?.reason ?? "", /exactly one in_progress/);
  assert.equal(completed, undefined);
});

test("registerSafetyGuards wires tools/pre-execute and delegates when allowed", async () => {
  const listeners: Record<string, (...args: any[]) => unknown> = {};
  registerSafetyGuards({
    on(event, listener, options) {
      listeners[event] = listener;
      assert.deepEqual(options, { prepend: true });
    }
  }, controller(), () => DEFAULT_DSMM_SETTINGS);

  assert.equal(typeof listeners["tools/pre-execute"], "function");
  const preExecute = listeners["tools/pre-execute"] as (execution: DshToolExecution, next: () => Promise<DshPreToolDecision>) => Promise<DshPreToolDecision>;
  const allowed = await preExecute(exec("bash", { command: "pwd" }), async (): Promise<DshPreToolDecision> => ({ kind: "allow" }));

  assert.deepEqual(allowed, { kind: "allow" });
});

test("registerSafetyGuards returns pre-execute decisions before delegation", async () => {
  const listeners: Record<string, (...args: any[]) => unknown> = {};
  let delegated = false;
  registerSafetyGuards({
    on(event, listener) {
      listeners[event] = listener;
    }
  }, controller(), () => DEFAULT_DSMM_SETTINGS);

  const preExecute = listeners["tools/pre-execute"] as (execution: DshToolExecution, next: () => Promise<DshPreToolDecision>) => Promise<DshPreToolDecision>;
  const decision = await preExecute(exec("bash", { command: "git commit -m test" }), async (): Promise<DshPreToolDecision> => {
    delegated = true;
    return { kind: "allow" };
  });

  assert.equal(delegated, false);
  assert.equal(decision.kind, "ask");
});

test("truncateTextMiddle keeps head and tail with dsmm notice", () => {
  const text = "a".repeat(40) + "b".repeat(40) + "c".repeat(40);
  const truncated = truncateTextMiddle(text, 80, "bash");

  assert.ok(Buffer.byteLength(truncated, "utf8") <= 80);
  assert.match(truncated, /\[dsmm safety\] truncated/);
  assert.match(truncated, /^a+/);
  assert.match(truncated, /c+$/);
});

test("truncateTextMiddle respects UTF-8 byte caps when the notice barely fits", () => {
  const truncated = truncateTextMiddle("😀".repeat(50), 17, "bash");

  assert.equal(truncated, "[dsmm safety] tru");
  assert.ok(Buffer.byteLength(truncated, "utf8") <= 17);
});

test("post-execute truncates accepted plain-text content when scoped", () => {
  const activeExec = exec("bash", { command: "yes" });
  const result = { isError: false, content: [{ type: "text", text: "x".repeat(140) }] };
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, toolOutputTruncation: { enabled: true, maxInlineBytes: 90 } } };
  const decision = decidePostToolExecution(activeExec, result, { kind: "accept" }, settings, controller());

  assert.equal(decision.kind, "accept");
  assert.ok(!("value" in decision));
  assert.equal(decision.content?.length, 1);
  assert.ok(Buffer.byteLength(decision.content?.[0].text ?? "", "utf8") <= 90);
  assert.match(decision.content?.[0].text ?? "", /\[dsmm safety\] truncated/);
});

test("post-execute leaves value decisions and out-of-scope calls unchanged", () => {
  const inactiveExec = exec("bash", { command: "yes" }, false);
  const result = { isError: false, content: [{ type: "text", text: "x".repeat(140) }] };
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, toolOutputTruncation: { enabled: true, maxInlineBytes: 90 } } };
  const contentDecision = { kind: "accept" as const };
  const valueDecision = { kind: "accept" as const, value: { full: true } };

  assert.equal(decidePostToolExecution(inactiveExec, result, contentDecision, settings, controller()), contentDecision);
  assert.equal(decidePostToolExecution(exec("bash", { command: "yes" }), result, valueDecision, settings, controller()), valueDecision);
});

test("post-execute leaves mixed content and disabled truncation unchanged", () => {
  const mixed = { kind: "accept" as const, content: [{ type: "text", text: "x".repeat(140) }, { type: "image", source: "inline" }] };
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, toolOutputTruncation: { enabled: true, maxInlineBytes: 90 } } };
  const disabled = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, toolOutputTruncation: { enabled: false, maxInlineBytes: 90 } } };
  const result = { isError: false, content: [{ type: "text", text: "x".repeat(140) }] };
  const contentDecision = { kind: "accept" as const };

  assert.equal(decidePostToolExecution(exec("bash", { command: "yes" }), result, mixed, settings, controller()), mixed);
  assert.equal(decidePostToolExecution(exec("bash", { command: "yes" }), result, contentDecision, disabled, controller()), contentDecision);
});

test("registerSafetyGuards wires tools/post-execute and delegates before truncating", async () => {
  const listeners: Record<string, (...args: any[]) => unknown> = {};
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, toolOutputTruncation: { enabled: true, maxInlineBytes: 90 } } };
  let delegated = false;
  registerSafetyGuards({
    on(event, listener, options) {
      listeners[event] = listener;
      assert.deepEqual(options, { prepend: true });
    }
  }, controller(), () => settings);

  assert.equal(typeof listeners["tools/post-execute"], "function");
  const postExecute = listeners["tools/post-execute"] as (execution: DshToolExecution, result: DshToolExecutionResult, next: () => Promise<DshPostToolDecision>) => Promise<DshPostToolDecision>;
  const decision = await postExecute(
    exec("bash", { command: "yes" }),
    { isError: false, content: [{ type: "text", text: "x".repeat(140) }] },
    async () => {
      delegated = true;
      return { kind: "accept" };
    }
  );

  assert.equal(delegated, true);
  assert.equal(decision.kind, "accept");
  assert.match(decision.content?.[0].text ?? "", /\[dsmm safety\] truncated/);
});
