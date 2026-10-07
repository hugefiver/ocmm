export const SOURCE_BASELINE = "89ca14b";
export const BASE_ROLES = ["orchestrator", "builder", "reviewer", "oracle", "oracle-2nd", "doc-search", "code-search", "planner", "clarifier", "plan-critic", "media-reader"];
export const CATEGORIES = ["frontend", "creative", "hard-reasoning", "research", "quick", "coding", "normal-task", "complex", "deep", "documenting", "cross-cutting"];
export const WORKFLOW_VARIANTS = ["default", "gpt", "claude-opus-5", "gemini", "glm", "codex", "planner", "kimi-k27", "swe-2"];
export const SKILL_SOURCES = {
  brainstorming: "skills/v1/brainstorming",
  "writing-plans": "skills/v1/writing-plans",
  "requesting-code-review": "skills/v1/requesting-code-review",
  "receiving-code-review": "skills/v1/receiving-code-review",
  "subagent-driven-development": "skills/v1/subagent-driven-development",
  "dispatching-parallel-agents": "skills/v1/dispatching-parallel-agents",
  "remove-ai-slops": "skills/remove-ai-slops",
  debugging: "skills/debugging",
  frontend: "skills/frontend",
  "git-master": "skills/git-master",
  "ast-grep": "skills/ast-grep",
  "coding-agent-sessions": "skills/coding-agent-sessions",
  "init-deep": "skills/init-deep",
  "using-git-worktrees": "skills/using-git-worktrees"
};

export const EXCLUSIONS = [
  { source: "skills/publish", reason: "OCMM release authority and package/tag protocol; DSMM does not inherit release authorization." },
  { source: "skills/customize-opencode", reason: "Configures the OpenCode host, not DSH; no equivalent DSH configuration is fabricated." },
  { source: "prompts/codex/**", reason: "Separate Codex adapter; DSH adapts the v1 Codex-model compatibility variant without installing another host behavior layer." },
  { source: "**/{__pycache__,node_modules,.git}/** and **/*.pyc", reason: "Interpreter caches, dependencies and VCS state are not skill resources." },
  { source: "**/{.gitignore,.npmignore}", reason: "Source repository/package ignore rules are not runtime resources and would hide meaningful fixtures or materialized distribution resources in the DSH bundle." },
  { source: "skills/frontend/scripts/perfection/lighthouse-audit.py (execution only)", reason: "Retained in the resource tree, not executable browser QA: canonical source entry itself prohibits this legacy helper's implicit installation/endpoint behavior." }
];

export const DSH_RESOURCE_GUIDANCE = `## DSH resource and authority contract

This is a full OCMM source adaptation for DSH 0.2.0-rc.2, not an OpenCode or Codex runtime. Source product names in transcript formats, examples, paths and attribution remain descriptive; they are not a host switch.

- Load this skill through the native skill tool only when its trigger matches. Resolve every relative reference/script/asset from the directory resourceBase returned with this skill, not from the project cwd or an OCMM checkout. Use available read/glob/grep to inspect resources; use write/edit and the active bash or pwsh only within the actual role and host permissions.
- External documentation uses actual web_search/web_fetch or an available documentation service. Context7, GitHub MCP, browser, image and LSP tools are optional catalog capabilities, not bundled calls. Use a real available equivalent or report unavailable evidence; never invent an MCP, Task, todo or compression API.
- Source role names are logical assignments: code-search/explore maps to dsmm-code-search, and other canonical roles/categories map to dsmm-<name>. Dispatch only through the actual role-specific native subagent tool in the current catalog, within the caller's effective policy, depth and authority. No generated file, metadata row or template proves callability. A missing permitted role is a blocker for a required formal stage, not permission to invent it or bypass planning.
- Templates describe assignment content, not a callable argument schema. Native continuation, background, message/interrupt and result handling are used only when actually exposed and supported; do not send task_id, subagent_type or guessed timeout fields. Otherwise perform permitted direct work or return the dependency to the stage owner.
- Use a concise response or an authorized project plan for tracking when no native tracking tool is exposed. Compression is unavailable unless a real tool is exposed; do not simulate it. Role responsibilities, explicit-off common/skill visibility, and the terminal delegation contract override broader examples in a resource.
- Installation, package-manager bootstrap, downloads, authentication/login, credential/profile access, Git writes and destructive actions require explicit authorization for the exact action. Reference commands are not automatic operations. Worktree consent does not authorize dependency installation or later branch deletion. Read before changing an existing file; preserve unrelated user work. Never silently restore/reset a working tree to repair a failed cleanup.
- Browser/debug QA uses run-owned isolated state, no imported credentials or browser profile, and only already available software unless separately authorized. Keep commands in the active shell dialect. Report unverified surfaces honestly.
`;

export const DSH_TOOL_CONTRACT = `<dsmm-host-contract>
Use the current DSH 0.2.0-rc.2 catalog: read/glob/grep for files, web_search/web_fetch for external facts, write/edit and the actual bash/pwsh for authorized edits and execution, and native skill invocation for triggered skills. Ask a material question in conversation if no question tool is exposed. Use LSP/browser/image tools only when present; fall back to direct evidence or report the capability unavailable. No Task/todowrite/compress/Context7 MCP API is assumed.
Logical source role names map to dsmm-<name> (explore is only the code-search alias). Use only actually callable role-specific native subagent tools. Static presets do not prove callability, continuation, background, plan-artifact writes or depth. A planner may write only an authorized Markdown plan through an actual path-restricted capability; absence is a reported limitation, never permission for general shell/write access.
The native main model picker, explicit user route and catalog are authoritative. Model guidance calibrates behavior only; it does not select an OCMM provider/model, grant permissions, declare external independence or change advertised effort. Oracle independence requires a different model was explicitly selected and verified in the actual route. Default inventory has no synthetic tiers or additional Oracle slots.
Role persona and access remain when Deepwork is explicitly off; common workflow and DSMM skills do not. Git/install/login/destructive actions need exact authorization regardless of mode. All delegation guidance is intersected with enabled roles, mounted capabilities, inherited permissions and native depth; Stage C owns enforcement, not these static texts.
</dsmm-host-contract>`;
