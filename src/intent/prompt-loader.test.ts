import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  loadAllPrompts,
  getDeepworkPrompt,
  getAgentPrompt,
  getCategoryPrompt,
  pickDeepworkVariantForAgent,
  isGpt56Model,
} from "./prompt-loader.ts"

function makeTempRoot(workflow: "omo" | "v1"): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-prompts-"))
  mkdirSync(join(root, workflow, "deepwork"), { recursive: true })
  mkdirSync(join(root, workflow, "agents"), { recursive: true })
  mkdirSync(join(root, workflow, "category"), { recursive: true })
  return root
}

test("loadAllPrompts loads files from the workflow subdir", () => {
  const root = makeTempRoot("omo")
  try {
    writeFileSync(join(root, "omo", "deepwork", "default.md"), "default-content")
    writeFileSync(join(root, "omo", "category", "frontend.md"), "frontend-content")
    loadAllPrompts(root, "omo")
    assert.equal(getDeepworkPrompt("default"), "default-content")
    assert.equal(getCategoryPrompt("frontend"), "frontend-content")
    assert.equal(getCategoryPrompt("documenting"), "")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadAllPrompts defaults to v1 workflow", () => {
  const root = makeTempRoot("v1")
  try {
    writeFileSync(join(root, "v1", "deepwork", "planner.md"), "planner-content")
    loadAllPrompts(root)
    assert.equal(getDeepworkPrompt("planner"), "planner-content")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("reload clears stale cache so removed files disappear", () => {
  const rootA = makeTempRoot("omo")
  const rootB = makeTempRoot("v1")
  try {
    writeFileSync(join(rootA, "omo", "deepwork", "default.md"), "from-omo")
    loadAllPrompts(rootA, "omo")
    assert.equal(getDeepworkPrompt("default"), "from-omo")

    writeFileSync(join(rootB, "v1", "deepwork", "gpt.md"), "from-v1")
    loadAllPrompts(rootB, "v1")
    assert.equal(getDeepworkPrompt("default"), "", "stale default.md must be gone after reload")
    assert.equal(getDeepworkPrompt("gpt"), "from-v1")
  } finally {
    rmSync(rootA, { recursive: true, force: true })
    rmSync(rootB, { recursive: true, force: true })
  }
})

test("loadAllPrompts loads glm and codex deepwork variants", () => {
  const root = makeTempRoot("omo")
  try {
    writeFileSync(join(root, "omo", "deepwork", "glm.md"), "glm-content")
    writeFileSync(join(root, "omo", "deepwork", "codex.md"), "codex-content")
    writeFileSync(join(root, "omo", "deepwork", "gpt-5.6.md"), "gpt-5.6-content")
    loadAllPrompts(root, "omo")
    assert.equal(getDeepworkPrompt("glm"), "glm-content")
    assert.equal(getDeepworkPrompt("codex"), "codex-content")
    assert.equal(getDeepworkPrompt("gpt-5.6"), "gpt-5.6-content")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loadAllPrompts loads functional agent prompts", () => {
  const root = makeTempRoot("omo")
  try {
    writeFileSync(join(root, "omo", "agents", "reviewer.md"), "reviewer-role")
    writeFileSync(join(root, "omo", "agents", "plan-critic.md"), "plan-critic-role")
    loadAllPrompts(root, "omo")
    assert.equal(getAgentPrompt("reviewer"), "reviewer-role")
    assert.equal(getAgentPrompt("plan-critic"), "plan-critic-role")
    assert.equal(getAgentPrompt("builder"), "")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("real workflows include functional agents and wrapped v1 deepwork prompts", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of ["omo", "v1"] as const) {
    loadAllPrompts(root, workflow)
    for (const name of ["orchestrator", "reviewer", "planner", "clarifier", "plan-critic"]) {
      assert.match(getAgentPrompt(name), new RegExp(`Agent Role: ${name}`), `${workflow}/${name}`)
    }
    for (const variant of ["default", "gpt", "gpt-5.6", "gemini", "glm", "codex", "planner"] as const) {
      const prompt = getDeepworkPrompt(variant)
      assert.ok(prompt.length > 0, `${workflow}/${variant} prompt missing`)
      if (workflow === "v1") {
        assert.match(prompt, /^<deepwork-mode>/, `${workflow}/${variant} missing opening tag`)
        assert.match(prompt, /<\/deepwork-mode>\s*$/, `${workflow}/${variant} missing closing tag`)
      }
    }
    for (const category of [
      "frontend",
      "creative",
      "hard-reasoning",
      "research",
      "quick",
      "coding",
      "normal-task",
      "complex",
      "deep",
      "documenting",
    ]) {
      assert.ok(getCategoryPrompt(category).length > 0, `${workflow}/${category} category missing`)
    }
  }
})

test("real workflows include shell adaptation in every effective prompt path", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of ["omo", "v1", "codex"] as const) {
    loadAllPrompts(root, workflow)
    for (const variant of ["default", "gpt", "gpt-5.6", "gemini", "glm", "codex", "planner"] as const) {
      assert.match(getDeepworkPrompt(variant), /## Shell Adaptation/, `${workflow}/${variant} missing shell adaptation`)
    }
    for (const category of [
      "frontend",
      "creative",
      "hard-reasoning",
      "research",
      "quick",
      "coding",
      "normal-task",
      "complex",
      "deep",
      "documenting",
    ]) {
      assert.match(getCategoryPrompt(category), /## Shell Adaptation/, `${workflow}/${category} missing shell adaptation`)
    }
  }
})

test("real prompts do not retain hardcoded Bash or PowerShell command-selection wording", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of ["omo", "v1", "codex"] as const) {
    loadAllPrompts(root, workflow)
    const prompts = [
      ...["default", "gpt", "gpt-5.6", "gemini", "glm", "codex", "planner"].map((variant) => getDeepworkPrompt(variant as Parameters<typeof getDeepworkPrompt>[0])),
      ...[
        "frontend",
        "creative",
        "hard-reasoning",
        "research",
        "quick",
        "coding",
        "normal-task",
        "complex",
        "deep",
        "documenting",
      ].map((category) => getCategoryPrompt(category)),
    ]
    for (const prompt of prompts) {
      assert.doesNotMatch(prompt, /PowerShell syntax|Run it with Bash|Run the command with Bash|You have Bash|bash cat\b/)
    }
  }
})

test("real deepwork prompts do not retain obsolete planner or broad review triggers", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of ["omo", "v1", "codex"] as const) {
    loadAllPrompts(root, workflow)
    for (const variant of ["default", "gpt", "gpt-5.6", "gemini", "glm", "codex", "planner"] as const) {
      const prompt = getDeepworkPrompt(variant)
      assert.doesNotMatch(prompt, /5\+ steps|Task has 2\+ steps|Implementation required\s*\|\s*MUST call planner agent/i, `${workflow}/${variant} retains raw step-count planner trigger`)
      assert.doesNotMatch(prompt, /MUST ALWAYS INVOKE THE PLAN AGENT|FAILURE TO CALL PLAN AGENT = INCOMPLETE WORK/i, `${workflow}/${variant} retains unconditional planner requirement`)
      assert.doesNotMatch(prompt, /Use Plan agent with gathered context to create detailed work breakdown|ALWAYS run both tracks in parallel/i, `${workflow}/${variant} retains unconditional planner or background-agent flow`)
      assert.doesNotMatch(prompt, /DEFAULT BEHAVIOR:\s*DELEGATE\. DO NOT WORK YOURSELF|OTHERWISE:\s*DELEGATE\. ALWAYS|NEVER skip delegation/i, `${workflow}/${variant} retains unconditional delegation requirement`)
      assert.doesNotMatch(prompt, /touches 3\+ files|20\+ turns|30\+ min|30\+ minutes/i, `${workflow}/${variant} retains broad review gate trigger`)
    }
  }
})

test("agent-specific prompts enforce bounded leaf delegation", () => {
  for (const workflow of ["v1", "omo", "codex"] as const) {
    const root = join(process.cwd(), "prompts", workflow, "agents")
    const planner = readFileSync(join(root, "planner.md"), "utf8")
    assert.match(planner, /leaf.*code-search.*doc-search/is, `${workflow}/planner`)
    assert.match(planner, /unsuffixed.*reviewer.*at most once.*concrete blocking architecture, security, or performance decision/is, `${workflow}/planner`)
    assert.match(planner, /never.*plan-critic.*Oracle.*Reviewer tier.*implementation/is, `${workflow}/planner`)

    const reviewer = readFileSync(join(root, "reviewer.md"), "utf8")
    assert.match(reviewer, /leaf read-only.*lookup/i, `${workflow}/reviewer`)
    assert.match(reviewer, /never.*planner.*reviewer.*Oracle.*plan-critic.*implementation/is, `${workflow}/reviewer`)

    const clarifier = readFileSync(join(root, "clarifier.md"), "utf8")
    assert.match(clarifier, /read-only discovery.*resolve ambiguity/i, `${workflow}/clarifier`)
    assert.match(clarifier, /never.*planner.*reviewer.*Oracle.*plan-critic.*implementation/is, `${workflow}/clarifier`)

    const critic = readFileSync(join(root, "plan-critic.md"), "utf8")
    assert.match(critic, /read-only lookup.*verify.*plan claim/i, `${workflow}/plan-critic`)
    assert.match(critic, /never.*planner.*reviewer.*Oracle.*another plan-critic.*implementation/is, `${workflow}/plan-critic`)
  }
})

test("planner and GPT-5.6 prompts keep delegation and review ownership flat", () => {
  const root = join(process.cwd(), "prompts")
  try {
    for (const workflow of ["omo", "v1", "codex"] as const) {
      loadAllPrompts(root, workflow)
      const planner = getAgentPrompt("planner")
      assert.match(planner, /Use direct tools first/)
      assert.match(planner, /Return the completed plan to the orchestrator/)
      assert.match(planner, /exactly (?:the )?unsuffixed `reviewer` at most once.*concrete blocking architecture, security, or performance decision/i)
      assert.match(planner, /Do not dispatch `plan-critic`, any Reviewer tier \(`reviewer-low`, `reviewer-high`, `reviewer-max`\), or any Oracle profile \(`oracle`, `oracle-2nd`, configured `oracle-3rd`…`oracle-9th`, and their `low`\/`high`\/`max` tier variants\)/)
      assert.doesNotMatch(planner, /Do not use `quick`, implementation\/coordinator agents, or planning\/review agents\./)
      assert.doesNotMatch(planner, /Never dispatch an implementation worker or a reviewer from the planner role\./)

      const gpt56 = getDeepworkPrompt("gpt-5.6")
      assert.match(gpt56, /Multiple steps, routine confirmation, or wanting another opinion are not sufficient/)
      assert.match(gpt56, /Utility leaf agents never dispatch/)
      assert.match(gpt56, /Read-only workflow agents never call `quick`/)
      assert.match(gpt56, /Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review remain orchestrator-owned/)
      assert.doesNotMatch(gpt56, /Nested subagent calls require a distinct deliverable/)
    }
  } finally {
    loadAllPrompts(root, "omo")
  }
})

test("pickDeepworkVariantForAgent picks planner for planner agent", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "planner", preferenceModel: "claude-opus-4-7" }),
    "planner",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "plan", preferenceModel: "anything" }),
    "planner",
  )
})

test("pickDeepworkVariantForAgent picks gpt variant for gpt model", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "gpt-5.5" }),
    "gpt",
  )
})

test("pickDeepworkVariantForAgent isolates GPT-5.6 from other GPT families", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "gpt-5.6-sol" }),
    "gpt-5.6",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "gpt-5.7-sol" }),
    "gpt",
  )
  assert.equal(isGpt56Model("vercel/openai/gpt-5.6-terra"), true)
  assert.equal(isGpt56Model("gpt-5.7-sol"), false)
})

test("pickDeepworkVariantForAgent picks gemini variant for gemini model", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "reviewer", preferenceModel: "gemini-3.1-pro" }),
    "gemini",
  )
})

test("pickDeepworkVariantForAgent picks glm variant for GLM models", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: "glm-5.1" }),
    "glm",
  )
})

test("pickDeepworkVariantForAgent picks codex variant for Codex models", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "builder", preferenceModel: "codex-mini-latest" }),
    "codex",
  )
})

test("pickDeepworkVariantForAgent defaults for unknown families", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: "claude-opus-4-7" }),
    "default",
  )
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: "unknown-model" }),
    "default",
  )
})

test("real deepwork prompts contain ocmm-native workflow semantics per variant", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of ["omo", "v1", "codex"] as const) {
    loadAllPrompts(root, workflow)
    for (const variant of ["default", "gpt", "gpt-5.6", "gemini", "glm", "codex", "planner"] as const) {
      const prompt = getDeepworkPrompt(variant)
      const label = `${workflow}/${variant}`

      assert.match(
        prompt,
        /discovery.{0,120}(before|precede).{0,80}decomposition|first discovery wave/i,
        `${label} missing discovery-before-planning semantics`,
      )
      assert.match(
        prompt,
        /relatively complex|clear purpose|unclear boundaries|lightweight contextual plan/i,
        `${label} missing planner-trigger semantics`,
      )
      if (variant !== "planner") {
        assert.match(
          prompt,
          /answer[- ]when[- ]answerable|answer when you have enough evidence|stop and answer/i,
          `${label} missing answer-when-answerable semantics`,
        )
        assert.match(
          prompt,
          /\[product\]/i,
          `${label} missing [product] review label`,
        )
        assert.match(
          prompt,
          /\[evidence\]/i,
          `${label} missing [evidence] review label`,
        )
      }
      assert.match(
        prompt,
        /full requested outcome|deliver exactly what was asked|requested outcome/i,
        `${label} missing full-request scope semantics`,
      )
      assert.doesNotMatch(
        prompt,
        /(?<!not\s)default\s+(?:to\s+)?(?:a\s+)?(?:minimum viable|MVP|phase-1)/i,
        `${label} contains default scope reduction language`,
      )
      assert.ok(prompt.includes("## Shell Adaptation"), `${label} missing shell adaptation`)

      if (variant === "gpt-5.6") {
        assert.match(
          prompt,
          /GPT-5\.6|speculative nested|subagent depth/i,
          `${label} missing GPT-5.6 subagent restraint`,
        )
      } else {
        assert.doesNotMatch(
          prompt,
          /GPT-5\.6-only|speculative nested delegation|subagent depth limit/i,
          `${label} incorrectly contains GPT-5.6-only restraint`,
        )
      }
    }
  }
})

test("v1 brainstorming skill enforces discovery-before-planning before decomposition", () => {
  const skill = readFileSync(join(process.cwd(), "skills", "v1", "brainstorming", "SKILL.md"), "utf8")
  assert.ok(skill.length > 0, "v1 brainstorming skill missing")
  assert.match(
    skill,
    /first discovery wave/i,
    "v1 brainstorming missing first discovery wave",
  )
  assert.match(
    skill,
    /before decomposition|precede.{0,80}decomposition|before.{0,80}planner/i,
    "v1 brainstorming missing discovery-before-decomposition/planner wording",
  )
})

test("writing-plans skill describes contextual plan vs file-backed plan trigger", () => {
  const skill = readFileSync(join(process.cwd(), "skills", "v1", "writing-plans", "SKILL.md"), "utf8")
  assert.ok(skill.length > 0, "v1 writing-plans skill missing")
  assert.match(
    skill,
    /file-backed plan/i,
    "writing-plans missing file-backed plan wording",
  )
  assert.match(
    skill,
    /lightweight contextual plan/i,
    "writing-plans missing lightweight contextual plan wording",
  )
  assert.match(
    skill,
    /relatively complex.*clear purpose|unclear boundaries|dependencies|success criteria/i,
    "writing-plans missing planner-trigger criteria",
  )
})

test("requesting-code-review and subagent-driven-development skills include [product]/[evidence] semantics", () => {
  const req = readFileSync(join(process.cwd(), "skills", "v1", "requesting-code-review", "SKILL.md"), "utf8")
  const sub = readFileSync(join(process.cwd(), "skills", "v1", "subagent-driven-development", "SKILL.md"), "utf8")
  assert.match(req, /\[product\]/i, "requesting-code-review missing [product] label")
  assert.match(req, /\[evidence\]/i, "requesting-code-review missing [evidence] label")
  assert.match(req, /missing evidence|insufficient proof|add the missing evidence/i, "requesting-code-review missing evidence-only blocker guidance")
  assert.match(sub, /\[product\]/i, "subagent-driven-development missing [product] label")
  assert.match(sub, /\[evidence\]/i, "subagent-driven-development missing [evidence] label")
  assert.match(sub, /supply the missing evidence|do not change product behavior/i, "subagent-driven-development missing evidence-only guidance")
})

test("v1 implementer template and maintenance docs record flat workflow ownership", () => {
  const skill = readFileSync(
    join(process.cwd(), "skills", "v1", "subagent-driven-development", "SKILL.md"),
    "utf8",
  )
  assert.match(skill, /Subagents do not commit, stage, push, or run any Git write command/)
  assert.match(skill, /return changed files and a suggested commit message to the orchestrator/i)
  assert.match(skill, /working-tree\/staged diff/i)
  assert.match(skill, /Do not require implementation subagents to commit/i)
  assert.match(skill, /review input, the diff, and the task description/i)
  assert.doesNotMatch(skill, /c\. Implementer implements, tests, commits, self-reviews/)
  assert.doesNotMatch(skill, /Pass the full change range:\s*- `BASE_SHA`/s)
  assert.doesNotMatch(skill, /Structure the dispatch with the commit range, the diff, and the task description/)

  const implementer = readFileSync(
    join(process.cwd(), "skills", "v1", "subagent-driven-development", "implementer-prompt.md"),
    "utf8",
  )
  assert.match(implementer, /## Delegation Boundary/)
  assert.match(implementer, /`quick`, `code-search`, `explore`, `doc-search`, `research`, and `media-reader`/)
  assert.match(implementer, /Do not launch `planner`, `plan-critic`, any Reviewer profile \(`reviewer`, `reviewer-low`, `reviewer-high`, `reviewer-max`\), or any Oracle profile \(`oracle`, `oracle-2nd`, configured `oracle-3rd`…`oracle-9th`, and their `low`\/`high`\/`max` tier variants\)/)
  assert.match(implementer, /orchestrator owns formal plan review and final acceptance review/i)
  assert.doesNotMatch(implementer, /Commit your work/)

  const requestingReview = readFileSync(
    join(process.cwd(), "skills", "v1", "requesting-code-review", "SKILL.md"),
    "utf8",
  )
  const reviewerTemplate = readFileSync(
    join(process.cwd(), "skills", "v1", "requesting-code-review", "code-reviewer.md"),
    "utf8",
  )
  assert.match(requestingReview, /Working-tree diff review/i)
  assert.match(requestingReview, /git diff --stat\s+git diff/s)
  assert.match(requestingReview, /Do not require implementation subagents to commit/i)
  assert.match(reviewerTemplate, /Git Range or Working-Tree Diff to Review/)
  assert.match(reviewerTemplate, /git diff --stat\s+git diff/s)

  const v1Maintenance = readFileSync(join(process.cwd(), "docs", "v1-maintenance.md"), "utf8")
  const promptSync = readFileSync(join(process.cwd(), "docs", "prompt-sync.md"), "utf8")
  for (const source of [v1Maintenance, promptSync]) {
    assert.match(source, /Flat Workflow Subagent Policy \(2026-07-17\)/)
    assert.match(source, /read-only workflow agents exclude `quick`/i)
    assert.match(source, /formal plan review and final acceptance review remain orchestrator-owned/)
  }
})

test("orchestrator prompts describe code review as review-input based", () => {
  for (const workflow of ["v1", "codex"] as const) {
    const prompt = readFileSync(
      join(process.cwd(), "prompts", workflow, "agents", "orchestrator.md"),
      "utf8",
    )
    assert.match(prompt, /committed range or working-tree\/staged diff/i, `${workflow} orchestrator missing review-input wording`)
    assert.doesNotMatch(prompt, /work SHAs/i, `${workflow} orchestrator still assumes SHA-only review input`)
  }
})

test("GPT-5.6 prompts proceed under clear facts and ask only deliverable-changing questions", () => {
  for (const workflow of ["v1", "omo", "codex"] as const) {
    const text = readFileSync(join(process.cwd(), "prompts", workflow, "deepwork", "gpt-5.6.md"), "utf8")
    assert.match(text, /When facts are clear, answer or proceed directly/i, workflow)
    assert.match(text, /safe default.*state the assumption.*continue/i, workflow)
    assert.match(text, /changes the deliverable shape/i, workflow)
    assert.match(text, /cannot be found with available tools/i, workflow)
    assert.match(text, /material rework/i, workflow)
    assert.match(text, /Do not ask for confirmation after routine discovery, planning, integration, or verification milestones/i, workflow)
  }
})

test("orchestrator alone owns workflow-role composition in all prompt sets", () => {
  for (const workflow of ["v1", "omo", "codex"] as const) {
    const text = readFileSync(join(process.cwd(), "prompts", workflow, "agents", "orchestrator.md"), "utf8")
    assert.match(text, /exclusive owner.*workflow-agent composition/i, workflow)
    assert.match(text, /ordered Oracle/i, workflow)
    assert.match(text, /configuring multiple.*does not.*fan-out/i, workflow)
    assert.match(text, /complex.*configured high.*otherwise.*normal/is, workflow)
    assert.match(text, /runtime-safety.*configured max.*configured high.*normal/is, workflow)
  }
})
