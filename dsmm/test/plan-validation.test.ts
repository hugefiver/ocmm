import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import type { DshToolExecution } from "../lib/dsh-types.js";
import { validatePlanMutation } from "../lib/plan-validation.js";

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "dsmm-plan-validation-"));
}

function planExec(root: string, name: string, arguments_: unknown): DshToolExecution {
  return {
    name,
    arguments: arguments_,
    agent: {
      session: {
        events: [],
        header: { cwd: root },
        append() {}
      }
    }
  };
}

function writePlan(root: string, relativePath: string, content: string): string {
  const file = join(root, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
  return file;
}

function reason(root: string, name: string, arguments_: unknown): string | undefined {
  const decision = validatePlanMutation(planExec(root, name, arguments_));
  assert.ok(decision === undefined || decision.kind === "deny");
  return decision?.kind === "deny" ? decision.reason : undefined;
}

test("plan validation recognizes normalized and case-insensitive plan writes", () => {
  const root = fixtureRoot();
  try {
    assert.equal(reason(root, "write", {
      file_path: "docs/superpowers/plans/good.MD",
      content: "- [ ] valid\n"
    }), undefined);
    assert.equal(reason(root, "WRITE", {
      file_path: "docs/superpowers/plans/uppercase.md",
      content: "- [x] valid\n"
    }), undefined);
    assert.equal(reason(root, "read", {
      file_path: "docs/superpowers/plans/ignored.md",
      content: "- [] ignored\n"
    }), undefined);
    assert.equal(reason(root, "write", {
      file_path: "docs/superpowers/notes/good.md",
      content: "- [] ignored\n"
    }), undefined);
    assert.match(reason(root, "write", {
      file_path: ".omo/plans/../plans/bad.md",
      content: "- [] bad\n"
    }) ?? "", /malformed checklist/);
    assert.match(reason(root, "write", {
      file_path: join(root, "DOCS", "SUPERPOWERS", "PLANS", "bad.md"),
      content: "- [todo] bad\n"
    }) ?? "", /malformed checklist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan validation denies recognized plan paths outside the session cwd", () => {
  const root = fixtureRoot();
  try {
    assert.match(reason(root, "write", {
      file_path: "../outside/docs/superpowers/plans/bad.md",
      content: "- [ ] valid\n"
    }) ?? "", /outside session cwd/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan validation requires complete write content", () => {
  const root = fixtureRoot();
  try {
    for (const content of [undefined, 3]) {
      assert.equal(reason(root, "write", {
        file_path: "docs/superpowers/plans/bad.md",
        content
      }), "[dsmm safety] cannot validate plan write: content must be a string");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan validation reconstructs edits before validating checklists", () => {
  const root = fixtureRoot();
  try {
    writePlan(root, "docs/superpowers/plans/edit.md", "- [ ] valid\n");
    assert.match(reason(root, "edit", {
      file_path: "docs/superpowers/plans/edit.md",
      old_string: "[ ]",
      new_string: "[]"
    }) ?? "", /malformed checklist/);

    assert.equal(reason(root, "edit", {
      file_path: "docs/superpowers/plans/edit.md",
      old_string: "valid",
      new_string: "updated"
    }), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan validation enforces DSH edit match semantics", () => {
  const root = fixtureRoot();
  try {
    writePlan(root, ".omo/plans/edit.md", "- [ ] first\n- [ ] second\n");
    assert.equal(reason(root, "edit", {
      file_path: ".omo/plans/edit.md",
      old_string: "[ ]",
      new_string: "[x]"
    }), "[dsmm safety] cannot reconstruct plan edit for .omo/plans/edit.md: expected exactly one old_string match, found 2");
    assert.equal(reason(root, "edit", {
      file_path: ".omo/plans/edit.md",
      old_string: "[ ]",
      new_string: "[x]",
      replace_all: false
    }), "[dsmm safety] cannot reconstruct plan edit for .omo/plans/edit.md: expected exactly one old_string match, found 2");
    assert.equal(reason(root, "edit", {
      file_path: ".omo/plans/edit.md",
      old_string: "[ ]",
      new_string: "[x]",
      replace_all: true
    }), undefined);
    assert.equal(reason(root, "edit", {
      file_path: ".omo/plans/edit.md",
      old_string: "missing",
      new_string: "[x]"
    }), "[dsmm safety] cannot reconstruct plan edit for .omo/plans/edit.md: expected exactly one old_string match, found 0");
    assert.equal(reason(root, "edit", {
      file_path: ".omo/plans/edit.md",
      old_string: "missing",
      new_string: "[x]",
      replace_all: true
    }), "[dsmm safety] cannot reconstruct plan edit for .omo/plans/edit.md: old_string was not found");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan validation rejects unreadable and malformed edit contracts", () => {
  const root = fixtureRoot();
  try {
    assert.match(reason(root, "edit", {
      file_path: "docs/superpowers/plans/missing.md",
      old_string: "[ ]",
      new_string: "[x]"
    }) ?? "", /^\[dsmm safety\] cannot read plan edit target docs\/superpowers\/plans\/missing\.md:/);

    writePlan(root, "docs/superpowers/plans/edit.md", "- [ ] valid\n");
    assert.equal(reason(root, "edit", {
      file_path: "docs/superpowers/plans/edit.md",
      old_string: "",
      new_string: "[x]"
    }), "[dsmm safety] cannot validate plan edit for docs/superpowers/plans/edit.md: old_string must be non-empty");
    assert.equal(reason(root, "edit", {
      file_path: "docs/superpowers/plans/edit.md",
      old_string: "[ ]",
      new_string: 3
    }), "[dsmm safety] cannot validate plan edit for docs/superpowers/plans/edit.md: new_string must be a string");
    assert.equal(reason(root, "edit", {
      file_path: "docs/superpowers/plans/edit.md",
      old_string: "[ ]",
      new_string: "[x]",
      replace_all: "yes"
    }), "[dsmm safety] cannot validate plan edit for docs/superpowers/plans/edit.md: replace_all must be boolean");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
