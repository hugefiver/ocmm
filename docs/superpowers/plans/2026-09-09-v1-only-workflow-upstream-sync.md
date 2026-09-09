# V1-Only Workflow and Upstream Sync Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to organize implementation where useful. Checkboxes track intended work, not a mandatory execution transcript. 可以依据实际证据调整顺序、拆分和实现细节，只要目标、约束、权限和最终验收不变。本计划不授权 Git 写，也没有提交步骤。

**Goal:** 直接删除 OMO workflow，不提供旧值兼容；交付可靠的配置/插件解析、以功能与接口为中心的 deepwork 协作、同步文档及可验证生成物。

**Architecture:** OpenCode 使用默认 `v1`，Codex 保留独立 `codex` 作者源和生成适配。配置继续沿用通用非法字段容忍和安全 merge，不为旧 workflow 加分支。计划调整、review、任务状态只修改现有 prompts/skills，不新增协调 runtime。全部作者源稳定后一次生成 Codex artifacts。

**Tech Stack:** TypeScript strict、Node 原生 `node:test`、现有 Zod 4、pnpm、Rust/Cargo LSP、Markdown prompts/skills、GitHub Actions。开发命令使用 PowerShell；无新依赖或本地软件安装。

**Spec:** `docs/superpowers/specs/2026-09-09-v1-only-workflow-upstream-sync-design.md`（当前完整修订是唯一设计源；之前的迁移方案和硬流程要求已被替代）。

**Global Constraints:** 以下逐项原文来自当前 Spec：

- Keep ocmm a thin OpenCode plugin; do not add a task manager, ledger, daemon, team runtime, memory runtime, or polling service.
- Remove `workflow: "omo"` directly from the public schema, loaders, prompts, tests, and current documentation. Do not add an alias, migration helper, compatibility warning, or legacy normalization path.
- Preserve `.omo/rules`, `.omo/plans`, `.omo/notepads`, the ignored `./omo` upstream checkout, and `--keep-omo`; these are compatibility surfaces, not the removed workflow.
- Git writes require user authorization. Authorization may be implicit only when the requested outcome necessarily entails the specific Git operation. Implementation does not imply commit, and specs/plans are not committed separately unless requested.
- Do not compute hashes for routine plans, tasks, files, evidence, checkpoints, or reviews. Keep checksums only where an external integrity or release protocol requires them, including release assets and existing commit IDs.
- Modify authoring sources, then regenerate schema and Codex artifacts. Do not hand-edit generated files.
- Remove tests that only pin deleted behavior, duplicate generated text, or implementation details such as an exact hash/prose shape. A failing test that still represents a valid product contract must be fixed, not deleted. When an obsolete test is removed, retain or add an outcome-focused test for the new contract where regression risk remains.
- Do not require a failing-first RED gate. Tests and reviews prove observable behavior, interface clarity, and meaningful regression protection; they do not exist to enforce prose fragments, implementation order, or workflow ceremony.

补充边界：不改版本，不 stage/commit/tag/push/rebase/release，不单独提交 spec/plan；不改用户全局配置或全局 `AGENTS.md`。保留发布 checksum、外部完整性协议、现有 commit IDs、hashline 编辑协议及原型安全防护。skill-description slimming、LSP URI aliases、npm propagation retries、browser-render research、allowed-tools 不在本次范围。

---

## 1. 当前事实、计划选择与 IDEAL END STATE

### 直接证据

- 本次修订时工作树只有未跟踪的指定 spec 和本计划；首次规划时 HEAD 为 `756917a`。执行者应重新查看当前 diff，不计算工作树 identity。
- `src/config/schema.ts::OcmmConfigSchema.workflow` 已默认 `v1`，enum 尚含待删除值；`ProfileEntrySchema` 当前没有 `workflow` 字段。本次不因删除 workflow 而扩展 profile 功能。
- `src/config/load.ts` 有 `loadConfig()` 和 `loadOpenCodePluginConfig()`，以及 directory descriptors、`rawDirectoryProfileValues`、qualified aliases；都继续使用已有通用解析行为，不加入 workflow 归一化。
- `src/config/review-agent-migration.ts` 处理的是既有 **review-agent 名称**，与删除 workflow 无关；保留其 alias/conflict 功能和测试，不按文件名误删。
- CLI `profiles.ts::cmdAdd()` 验证后复制原 JSONC，再读回验证；保持注释/BOM 和原始文件，不以本任务为由重写用户配置。
- `tolerant-parse.ts` 既遇到 object 静默剥离，也遇到 strict object 的 `unrecognized_keys`；诊断须保留有效层和兄弟字段。`log.warn` 受 `OCMM_DEBUG` 控制，沿用此可见性。
- `prompts/v1/**` 与 `prompts/codex/**` 是独立作者源。`src/codex/plugin-generator.ts` 除复制它们及 skills，还自行渲染 review/plan 指令，不能只修 Markdown。
- `prompts/{v1,codex}/agents/{planner,plan-critic,reviewer,orchestrator}.md`、`skills/v1/writing-plans/SKILL.md` 和 SDD 模板承载旧的固定 receipt/批准要求；GPT/Gemini/GLM/Codex 专用层还有执行顺序与强制 review 要求。
- `planning-executor-contract.test.ts`、`proportional-scenario-contract.test.ts`、`research-provenance-contract.test.ts` 是 prose regex 测试；`plan-review-contract.test.ts` 另包含待删除的 review hash 算法 fixtures。有效 loader、runtime 权限、路由与生成接口测试在其他文件，不能一起删。
- `.github/workflows/` 只有 `nix.yml` 和 `release.yml`；release verify 已检查 Codex freshness，缺 schema freshness。

### 执行选择

1. 删除旧 workflow，而非迁移：不新增 helper、special warning、alias、profile normalization、旧值专用测试或 live QA。任何非法 enum 值仅走现有一般容忍/默认回落；通用非法值测试使用 `unsupported`，不维护旧值专例。
2. `Workflow = "v1" | "codex"`；base 默认 `v1`。`ProfileEntrySchema` 保持当前字段集合，不加入上版仅为兼容而建议的 `workflow` 字段；profile 未声明的字段继续通用剥离/诊断。
3. 一个共享纯函数只剥离文本首字符 U+FEFF，不 trim 普通内容。tuple plugin 仅提取名字作比较，原 options 不变。
4. unknown-key collector 只处理字段名，不承担 workflow 兼容。一次 load 去重；最多输出 20 条路径，来源/路径各最多 240 字符，附总量/省略量，不输出配置值或密钥。上限是可调整的局部实现选择。
5. plan review 默认提供建议；实现验收默认看功能完成、接口清晰可用、关键回归和真实 surface。只有用户明确要求，或具体安全、数据损失、外部协议、不可逆风险，才对相应风险采用更严格过程；“跨模块”“复杂”“已有 reviewer”本身不是严格模式开关。
6. 不把严格模式解释成自动恢复 transcript/固定 receipt/hash。严格措施与具体风险对应，例如加强原型污染回归、验证外部校验协议、在不可逆操作前取得决定；不制造全任务审查仪式。

### IDEAL END STATE

- 公开 workflow enum、runtime 类型、prompt loading 和当前文档只描述 `v1`/`codex`；没有任何代码识别或转换旧 workflow literal。
- 默认 OpenCode 能注册代理/技能并使用 deepwork；Codex 适配保持可用，`.omo/*`、`--keep-omo`、ignored `./omo` 不受影响。
- tuple options 完整保留；规定边界上的 BOM 正常解析；未知字段可定位且有效 siblings/lower layers、alias 和安全约束保持。
- 查找和异步委派使用实际 callable schema；无 CodeGraph-first、虚构 polling 或常规 hash 协议。
- deep/worker 可在保持目标、约束、权限、最终验收时调整计划；安全/数据/API/不可逆或无证据选择得到恰当升级，非必要提问不阻断交付。
- 状态标签仅帮助沟通；ack 不构成证明，但 optional/redundant child 不能阻塞已经通过真实接口证明的结果。
- 默认不要求失败先行、执行顺序日志、prose regex、固定 receipt 字段或 unconditional reviewer approval。GPT-5.6 及之后特别强调 outcome/interface，避免重复 review、hash 和测试仪式。
- schema/Codex artifacts、文档与作者源一致；typecheck、TS/Rust tests、build、freshness 和隔离 config-load 有可复核证据。

## 2. 建议波次、接口依赖与调整权限

| 波次 | 任务/owner | 实际依赖 | 目标与有用验收证据 |
|---|---|---|---|
| W0 | T0 integrator | 无 | 已知起点、工具可用性和用户改动保护范围 |
| W1 | T1 parsing；T2 shim，可并行 | T0 | BOM/tuple 各自公开接口的结果与相关回归 |
| W2 | T3 workflow removal | T1/T2 的稳定接口 | 仅两 workflow；无旧分支；schema 和实际加载正确 |
| W3 | T4 diagnostics；T5 discovery/background，可并行 | T3 | 有界诊断不损失配置；工具示例匹配 host 能力 |
| W4 | T6 flexible workflow → T7 model/review/Git，建议串行 | T4/T5 | 自主调整、建议性 review 和功能验收在作者层一致 |
| W5 | T8 docs/CI | 作者源政策稳定 | 当前文档一致、schema drift 能被 CI 发现 |
| W6 | T9 generated integration | 所有作者源、build 输入稳定 | 一次根目录生成，文件集与内容 fresh |
| W7 | T10 final integration | 实际功能可运行 | 完整验证、隔离 surface、场景观察和清理说明 |

这些波次描述依赖，不是机械硬门禁。worker 可合并任务、换实现方式或重排独立工作，说明重要偏离及依据即可；不得借此改变用户可见范围、删除有效产品契约或省掉最终必需证据。共享文件仍要避免同时写：`load.ts` 由 T1/T4 协调，prompt/skill 作者变更由 T5→T6→T7 协调，maintenance 由 T8 汇总，生成物由 T9 统一写。

`completed/failed/blocked/inconclusive` 可以描述工作状况，但不要求字面标签、固定字段或每个 child 交 receipt。父任务判断证据本身：若确有依赖结果未得到，则不能假设它已经正确；若同一结果已通过实际接口验证，重复或可选 child 的迟到/超时不阻塞交付。处理仍可能写共享文件的 child 是并发安全问题，可停止或隔离其写入，不是等待形式状态齐全。

## 3. 文件地图

### 新增建议

- `src/shared/text.ts`、`src/shared/text.test.ts`：BOM 纯函数与边界测试。
- `src/config/tolerant-parse.test.ts`：保留有效配置的直接结果测试。
- `src/config/diagnostics.ts`、`src/config/diagnostics.test.ts`：有界 unknown-field 日志。
- `src/schema-freshness.test.ts`、`.github/workflows/schema.yml`：schema 内容一致性与 CI。
- `src/codex/generated-freshness.test.ts`：临时生成的文件集/字节比较。

不新增 workflow 兼容文件、prose-policy 测试框架、模拟 deep 决策函数或固定状态/receipt schema。行为场景直接写在 T6/T10，供真实代理观察，不新建只为了跑字符串灯的 JSON fixtures。

### 删除作者源（精确清单）

```text
prompts/omo/agents/clarifier.md
prompts/omo/agents/orchestrator.md
prompts/omo/agents/plan-critic.md
prompts/omo/agents/planner.md
prompts/omo/agents/reviewer.md
prompts/omo/category/coding.md
prompts/omo/category/complex.md
prompts/omo/category/creative.md
prompts/omo/category/cross-cutting.md
prompts/omo/category/deep.md
prompts/omo/category/documenting.md
prompts/omo/category/frontend.md
prompts/omo/category/hard-reasoning.md
prompts/omo/category/normal-task.md
prompts/omo/category/quick.md
prompts/omo/category/research.md
prompts/omo/deepwork/claude-opus-5.md
prompts/omo/deepwork/codex.md
prompts/omo/deepwork/default.md
prompts/omo/deepwork/gemini.md
prompts/omo/deepwork/glm.md
prompts/omo/deepwork/gpt-5.6.md
prompts/omo/deepwork/gpt-6-astra.md
prompts/omo/deepwork/gpt.md
prompts/omo/deepwork/planner.md
docs/prompt-sync.md
```

按确切路径删除，不递归删除名字含 omo 的目录。旧历史 specs/plans/evidence、`docs/kb/omo-features/`、ignored upstream、兼容规则路径保持。

### 删除/裁减测试

- 删除 `src/intent/planning-executor-contract.test.ts`：其测试锁标题、段落位置、固定推荐值和文案。
- 删除 `src/intent/proportional-scenario-contract.test.ts`：其测试锁固定场景数量/语句，不证明功能。
- 删除 `src/intent/research-provenance-contract.test.ts`：其测试只有三 workflow 的 prose regex；保留两个现行 research prompt 的有效 provenance 指令，来源诚信不因删字符串测试而改变。
- 删除 `src/intent/plan-review-contract.test.ts` 中的 hash fixtures、receipt/prose 断言及无用 helpers；按当前文件全由这些测试组成，清理后删除该文件。若执行时出现新增的真正功能 case，先保留或移动到对应现有功能测试，不能用本清单删除仍有效功能。
- 裁减 `src/intent/prompt-loader.test.ts`、`src/hooks/config.test.ts`、`src/hooks/config.category.test.ts`、`src/codex/plugin-generator.test.ts` 内旧 workflow、exact prose、固定 receipt 和重复段落断言；保留 loading/cache、role/model 选择、权限、注册、实际生成/安装接口等功能测试。

### 生成输出

- `schema.json` ← `src/config/schema.ts`、`scripts/gen-schema.ts`、`scripts/zod-to-json-schema.ts`。
- `.agents/plugins/marketplace.json`、`.codex/agents/*.toml`。
- `plugins/deepwork/.codex-plugin/plugin.json`、`package.json`、`.mcp.json`、`README.md`（均在 `plugins/deepwork/` 内）。
- `plugins/deepwork/agents/*.toml`、`plugins/deepwork/skills/**`、build 暂存 `plugins/deepwork/dist/**` ← `src/codex/plugin-generator.ts`，入口 `scripts/gen-codex-plugin.ts`。
- `dist/**` / native binary 是构建输出，不手改、不顺便纳入版本控制。

---

## W0 / T0 — 了解执行基线

**Files:** Read `package.json`、`AGENTS.md`、当前 Spec/plan；不改产品文件。

**Interfaces:** Consumes 当前 checkout；Produces 可用工具、已有失败/未验证项、run-owned 临时根。

**Recommended executor:** `normal-task`

- [ ] 查看 `git status --short`、`git diff --stat`、`node --version`、`pnpm --version`、`cargo --version`、`Get-Command opencode -ErrorAction SilentlyContinue`。逐项执行，不因缺工具自动安装。
- [ ] 有有效近期基线则复用；没有时运行 `pnpm run typecheck` 和与首批改动相关的现有测试了解起点。无需在每波前重复全套检查；最终完整检查仍见 T10。
- [ ] 先检查 `C:\Users\HUGEFI~1\AppData\Local\Temp\opencode` 父目录，再用专用文件工具建立唯一临时目录。config/data/state/cache/evidence 全在其内，不复制真实用户配置或凭据。

**Evidence:** 起点和用户改动范围明确，缺失工具如实列出；没有 Git 写。无需固定格式的基线 receipt。

## W1 / T1 — BOM 文本边界

**Files:** Create `src/shared/text.ts`、`src/shared/text.test.ts`；Modify `src/config/load.ts`、`src/rules/index.ts`、`src/mcp/index.ts`；仅在必要时修 `src/config/jsonc-patch.ts`。Test `src/config/load.test.ts`、`src/config/profiles.test.ts`、`src/cli/profiles.test.ts`、`src/config/jsonc-patch.test.ts`、`src/rules/index.test.ts`、`src/mcp/index.test.ts`。

**Interfaces:** `stripLeadingUtf8Bom(text: string): string`；`stripJsoncCommentsAndTrailingCommas(input: string): string` 签名不变，调用者自然得到 BOM 支持。

**Recommended executor:** `coding`

- [ ] 实现一个纯函数并接入 JSONC helper 起点、`parseRuleMarkdown` frontmatter 检测前、`parseSkillMcpFrontmatter` 检测前、`readJsonMcpConfig` 和同步 MCP JSON reader 的 `JSON.parse` 前。

```ts
export function stripLeadingUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
```

- [ ] 用已有成功夹具验证 BOM 与无 BOM 输出相同：base JSON/JSONC、inline/profile directory 两种 loader、CLI import/read-back、rule Markdown、skill MCP frontmatter、companion/user/project MCP JSON。普通文本、中间 BOM 和双 BOM 的边界由纯函数覆盖，不铺重复矩阵。

```ts
assert.equal(stripLeadingUtf8Bom("\uFEFF{}"), "{}")
assert.equal(stripLeadingUtf8Bom("a\uFEFFb"), "a\uFEFFb")
assert.equal(stripLeadingUtf8Bom("\uFEFF\uFEFFx"), "\uFEFFx")
```

- [ ] 执行 `node --test --experimental-strip-types src/shared/text.test.ts src/config/load.test.ts src/config/profiles.test.ts src/cli/profiles.test.ts src/config/jsonc-patch.test.ts src/rules/index.test.ts src/mcp/index.test.ts`。以输出和有效回归为准，不要求先运行失败版或保存实施前后 transcript。
- [ ] CLI 原始复制保留注释/BOM；如果 JSONC patch scanner 受 BOM 影响，只修头部识别与偏移，不全文件重新序列化。

**Evidence:** 规定解析边界读取成功且普通内容/注释不被破坏，纯函数接口可独立使用。

## W1 / T2 — tuple plugin entries

**Files:** Modify `src/cli/shim.ts::OpencodeConfig/buildIsolatedConfig/isStrippedPlugin`；Test `src/cli/shim.test.ts`。

**Interfaces:** `OpencodePluginEntry = string | [string, Record<string, unknown>]`；`plugin?: OpencodePluginEntry[]`；`buildIsolatedConfig` 既有参数/其他输出不变。

**Recommended executor:** `coding`

- [ ] 提取 entry 名称用于原 scoped/version 过滤和 ocmm 去重，不重建 options：

```ts
type OpencodePluginEntry = string | [string, Record<string, unknown>]
function pluginEntryName(entry: OpencodePluginEntry): string {
  return typeof entry === "string" ? entry : entry[0]
}
```

- [ ] 在真实 `buildIsolatedConfig` temporary-global-config 测试中覆盖 bare/scoped/version string 与 tuple、无关 tuple 的嵌套 options、`keepOmo:true`、已有 ocmm tuple、`mergePlugins:false`。比较完整返回 entry，不只比较长度。
- [ ] 执行 `node --test --experimental-strip-types src/cli/shim.test.ts`；保留 isolation mode、provider merge、CLI 透传回归。

**Evidence:** tuple 不崩溃且 options 原样保留；只过滤目标外部插件，`--keep-omo` 行为未变。

## W2 / T3 — 直接删除 OMO workflow

**Files:** Modify `src/config/schema.ts`、`src/intent/prompt-loader.ts`；清理 `src/config/load.ts`、`src/index.ts`、`src/hooks/config.ts`、`src/hooks/chat-message.ts` 中旧说明/不可达 workflow 分支（无残留则不制造 diff）。Delete §3 的 25 个 OMO prompt 作者文件。Generate `schema.json`。

**Test:** `src/config/schema.test.ts`、`src/config/load.test.ts`、`src/config/profiles.test.ts`、`src/config/profile-aliases.test.ts`、`src/intent/prompt-loader.test.ts`、`src/hooks/config.test.ts`、`src/hooks/config.category.test.ts`、`src/hooks/chat-message.test.ts`、`src/index.test.ts`、`src/codex/plugin-generator.test.ts`；保留 `src/config/review-agent-migration.test.ts`。§3 的纯 prose 文件可在本波移除，其他混合测试按功能清理。

**Interfaces:** `Workflow = "v1" | "codex"`；`OcmmConfig.workflow` 默认 `v1`。`ProfileEntrySchema`、`prepareConfigLayers`、`prepareReviewProfile`、CLI profiles 和目录 reader 不增加 workflow 专门参数/字段/normalization。

**Recommended executor:** `complex`

- [ ] 从 public enum 和 `Workflow` 删除维护停止的选项，保留 v1/codex 两套 prompt loading；按精确清单删除 OMO 作者源。不在 loader 末端或 schema preprocess 内加入兼容兜底。
- [ ] 删除加载旧 prompt 的测试和旧值 fixture；有效配置测试改用现行值。一般 invalid-override 测试继续使用 `unsupported`，验证下层合法值和兄弟字段保留，而不是维护旧值回落专例。

```ts
assert.equal(OcmmConfigSchema.parse({}).workflow, "v1")
assert.equal(OcmmConfigSchema.parse({ workflow: "codex" }).workflow, "codex")
assert.equal(OcmmConfigSchema.safeParse({ workflow: "unsupported" }).success, false)
```

- [ ] 保留缓存切换测试，用 v1→codex 证明旧缓存被清空；保留 model calibration 选择、missing-file 容忍、disabled hooks、skill/slash 注册、系统注入幂等、profile priority 和 qualified alias 行为。`cfg.workflow === "v1"` 仍区分 OpenCode skill 注入，不能把 Codex 误当 v1。
- [ ] 运行 `pnpm run gen-schema`；核对 artifact enum 只有两值。运行 `node --test --experimental-strip-types src/config/schema.test.ts src/config/load.test.ts src/config/profiles.test.ts src/config/profile-aliases.test.ts src/config/review-agent-migration.test.ts src/intent/prompt-loader.test.ts src/hooks/config.test.ts src/hooks/config.category.test.ts src/hooks/chat-message.test.ts src/index.test.ts src/codex/plugin-generator.test.ts`，以及 `pnpm run typecheck`。较长测试命令可分组运行；不调用根目录 Codex generator。

**Evidence:** 两个现行 workflow 功能正确；没有旧 workflow 专门识别/转换/诊断/test/QA 路径；原有通用非法配置语义保持。profile 字段集合不因本次删除被扩展。

## W3 / T4 — unknown-key diagnostics 保留有效配置

**Files:** Create `src/config/diagnostics.ts`、`src/config/diagnostics.test.ts`、`src/config/tolerant-parse.test.ts`；Modify `src/config/tolerant-parse.ts`、`src/config/load.ts`；Test `src/config/load.test.ts`、`src/config/profiles.test.ts`、`src/config/profile-aliases.test.ts`、`src/shared/logger.test.ts`。`merge.ts` 原型安全策略不改。

**Interfaces:** parser success/failure result 保留 `success/data/issues/layers`，增加 `unknownKeys: readonly RemovedUnknownKey[]`，无记录为空数组；类型在 `tolerant-parse.ts` 导出，collector 在 `diagnostics.ts` 导出，`load.ts` 接合两者。

```ts
export type RemovedUnknownKey = { path: readonly (string | number)[]; layer?: number }
export function createConfigDiagnostics(): {
  unknownKeys(source: string, paths: readonly (readonly (string | number)[])[]): void
  flush(): void
}
```

`layer` 只是本次数组索引。`flush` 沿用 `log.warn`，输出 code `OCMM_CONFIG_UNKNOWN_KEYS`、有限 entries、total/omitted；不持久化、不新建配置开关。

**Recommended executor:** `complex`

- [ ] 处理 strict `unrecognized_keys` 的 `keys`：定位到真实子字段，而非因父路径错误删掉整个有效 object。沿用 union retry 的有效分支选择，不能把失败 branch 的合法字段错误归类未知。
- [ ] 对成功解析前的修复后 candidate 与输出递归比较 own keys，收集 silent strips。数组比较现存元素；未知父键记录一次，不扫描其中可能很大的未知子树。已经因类型错误移除的字段不重复归为 unknown。layered 情况把路径映射回实际含该键的输入来源，不通过 raw 与最终 defaulted config 的差异臆测。
- [ ] 把 collector 接入两顶层 loader、`cleanAgentMap`、base/inline/directory descriptor sanitize 与 selected profile parse。使用实际来源与 prefix，重复阶段去重。`ProfileSelectionSchema` 是有意投影，不给未选中的合法字段报警。保留原 `OCMM_DEBUG` 可见性，所有正常/回落返回处都能 flush 已收集诊断。
- [ ] 加输入→配置结果→诊断的功能测试：silent object typo、strict fastModels typo、nested agents/profile、数组、合法 dynamic records、无效 higher layer 不覆盖有效 lower layer。不得输出值；未知值中放 fake-secret 后检查日志不含它；25 条路径只输出 20 条并报告省略量；双 flush 不重复。

```ts
const schema = z.object({ intent: z.object({ enabled: z.boolean() }) })
const result = tolerantParse(schema, { intent: { enabled: true, enabeld: false } })
assert.equal(result.success, true)
if (result.success) assert.deepEqual(result.data, { intent: { enabled: true } })
assert.deepEqual(result.unknownKeys.map(item => item.path), [["intent", "enabeld"]])
```

- [ ] 执行 `node --test --experimental-strip-types src/config/tolerant-parse.test.ts src/config/diagnostics.test.ts src/config/load.test.ts src/config/profiles.test.ts src/config/profile-aliases.test.ts src/shared/logger.test.ts`，再 typecheck。重点复用 prototype pollution 测试：unsafe own keys 不恢复、不继承、不降格为普通 tolerated unknown；允许自由配置的 records 不误报。

**Evidence:** 有界日志定位 unknown；合法配置/动态 options 和安全边界未损失。这里的结构化字段是实际诊断接口，不是工作流 receipt。

## W3 / T5 — discovery 与 schema-exact background

**Files:** Modify `prompts/v1/deepwork/{planner,gpt,gemini,glm,codex}.md`、`prompts/codex/deepwork/{planner,gpt,gemini,glm,codex}.md`、两个 workflow 的 `agents/orchestrator.md`、`skills/init-deep/SKILL.md`、`skills/v1/dispatching-parallel-agents/SKILL.md`、`skills/v1/subagent-driven-development/SKILL.md`。花括号是此处列明的精确文件集合，不含其他类别。

**Interfaces:** 当前 callable tool schema → 可执行调用选择；没有新增 TS tool/background API。

**Recommended executor:** `normal-task`

- [ ] 去除全部 active CodeGraph-first 说明和 init-deep 示例调用。LSP 负责符号/引用/诊断/rename；Grep/Read/Glob 负责文本和文件发现；ast-grep 仅用于 exact AST shape 或 deterministic codemod。保持 direct lookup 与有价值 delegation 的现有边界。
- [ ] OpenCode 参数示例不写死未暴露的 `load_skills/category/run_in_background`。只有当前 task schema 有 `background` 且 parent 有独立工作才传 `background:true`；即时依赖走前台，没有该字段就省略。host 通知完成，不虚构 polling；task_id 是 child 续接，不是轮询 job ID。
- [ ] Codex 使用当时可调用的 multi-agent surface，不混入 OpenCode 参数，不把某一个历史工具名写成所有 Codex 的必然 API。保留 generator 原有 V1/V2/native/generic 适配能力。
- [ ] 人工阅读改动和实际组合后的指令，确认这些示例能按真实 schema 使用；检索仅用于找遗漏，不新增以 prose regex 灯证明功能的测试。运行仍有效的 `src/intent/prompt-loader.test.ts`、`src/codex/plugin-generator.test.ts`，验证 loading/composition/生成接口没有损坏。

**Evidence:** 两种 host 的实际调用路径清晰；缺 background 能力仍有前台路径；无新 CodeGraph 依赖或轮询服务。

## W4 / T6 — 灵活计划、受控自主调整与建议性 review

**Files — 作者源：**

```text
skills/v1/brainstorming/SKILL.md
skills/v1/writing-plans/SKILL.md
skills/v1/writing-plans/plan-document-reviewer-prompt.md
skills/v1/subagent-driven-development/SKILL.md
skills/v1/subagent-driven-development/implementer-prompt.md
skills/v1/subagent-driven-development/spec-reviewer-prompt.md
skills/v1/subagent-driven-development/code-quality-reviewer-prompt.md
skills/v1/dispatching-parallel-agents/SKILL.md
skills/v1/requesting-code-review/SKILL.md
skills/v1/requesting-code-review/code-reviewer.md
skills/v1/receiving-code-review/SKILL.md
prompts/v1/agents/orchestrator.md
prompts/v1/agents/planner.md
prompts/v1/agents/plan-critic.md
prompts/v1/agents/reviewer.md
prompts/codex/agents/orchestrator.md
prompts/codex/agents/planner.md
prompts/codex/agents/plan-critic.md
prompts/codex/agents/reviewer.md
prompts/v1/category/deep.md
prompts/codex/category/deep.md
prompts/v1/deepwork/default.md
prompts/codex/deepwork/default.md
prompts/v1/deepwork/planner.md
prompts/codex/deepwork/planner.md
src/codex/plugin-generator.ts
```

只在本主题冲突处修改 receiving/spec-reviewer 等关联模板，不重构无关 skill。Test：裁减 §3 prose/hash/receipt 测试和 mixed `prompt-loader.test.ts`/`plugin-generator.test.ts`；保留 runtime permissions、model selection、config 注册与生成格式功能。

**Interfaces:** 消费 approved goal、constraints、permissions、final acceptance 与实际证据；输出可使用自然语言描述结果和有用状态，不新增 result schema/receipt validator。

**Recommended executor:** `complex`

- [ ] 改 writing-plans、planner、plan-critic：计划说明路线/依赖/接口/风险，review 默认建议性；去除 mandatory critic loop、固定首行 verdict、每次普通计划编辑必须重审、以 receipt 为开始实施条件的规则。保留读取当前输入、引用准确和不把旧评价冒称新评价；安全/数据损失/外部契约/不可逆风险必须解决或请用户决定。设计授权与 role 只读/实现权限不因此扩大。
- [ ] 改 SDD 与 implementer 模板：worker/deep 可以在目标/约束/权限/最终验收不变时选择最小有证据的调整，并说明重要决定、理由和错误代价。删除“任何不确定都问”“只能严格按文件结构”“计划外拆分一律停止”等与此冲突的要求。若改变目标/用户可见范围/验收、安全数据 API 契约、不可逆，或所有路径均无依据，则升级而不是猜测。
- [ ] 改 deep 普通块及其内联 Astra addendum，和 orchestrator/default/parallel skill：ideal end state 是可观察结果；每波注明目标与有用证据；后波可依据观察调整，不要求 child 标签齐全。ack 本身不证明结果；optional/redundant child 不阻塞已由真实接口证明的成果。必要依赖若证据仍缺失，只报告实际缺口，不用状态词代替分析。
- [ ] 默认验收统一为 functionality complete、interfaces clear/usable、meaningful regressions covered、evidence from actual surface。移除失败先行和固定执行 transcript、固定场景数量、每任务/每波 mandatory full review、所有 concern 必须消除后 unconditional approval 的要求。严格措施仅由用户明确请求或具体风险触发，且局限于所需范围。
- [ ] 删除 review 的 SHA-256 JS 算法、shell wrappers、identity echo/recompute/stamp 和格式验证。需要 review 时 packet 用五个内容域描述当前工作，不要求固定字段顺序、字面标签或机械 receipt：

```text
GOAL: Remove the maintained OMO workflow and deliver reliable v1/Codex interfaces.
ACCEPTANCE_CRITERIA: Two supported workflows; preserved valid config, tuple options, BOM parsing and bounded diagnostics.
REVIEW_INPUT: Current relevant diff/range and contents of new files.
VERIFICATION_EVIDENCE: Actual interface outputs, meaningful regression results and limits.
GLOBAL_CONSTRAINTS: Thin plugin; no Git writes; preserve compatibility paths and external integrity protocols.
```

  review 是检查目标/接口/证据的工具，不是默认交付授权人。采用过的 review 若实现输入改变，更新 packet、重跑受影响 lane；无变化不重复 review，不因没有可选 reviewer 回执拒绝已证明结果。缺少 diff/证据时 reviewer 说明不能评价的范围，不捏造 approval。
- [ ] 更新 `src/codex/plugin-generator.ts` 自行渲染的 “Ordered Oracle review”“Review dispatch guardrail”“Plan review” 与 receipt-focused 文案，防止源 prompt 修正后 generator 又把 simple→Oracle、complex→Oracle+Reviewer 变成默认强制路径。只在决定确需 review 后应用既有 profile availability、ordinal/tier/model 规则；保留 xhigh floor、显式配置优先和 explicit-only suffix inventory，不改路由数据。
- [ ] 删除 §3 的纯 prose/hash/固定 receipt 测试，不机械改 regex 来锁新文案；mixed 功能测试仍验证工具/代理注册、model 层选择、一次注入、真实加载及 bundle 可解析。人工用下表判读最终组合 prompt 与实际代理行为；测试/实现顺序由 worker 自定，不做顺序证明。

| 场景 | 实际输入与期待行为 |
|---|---|
| safe adjustment | plan 指向旧文件；入口 import 和文件证明新路径等价。deep/worker 用新路径继续，记录重要偏离，而非索取仅流程批准 |
| helper/order adjustment | 现有等价纯 helper 或独立步骤可重排。复用/重排且保持公开接口与最终验证 |
| optional child | 实际导出函数/CLI 结果及回归已证明目标；optional 重复分析 child 超时。报告已证明结果，不等待其固定状态 |
| missing necessary evidence | 只有 ack，无接口输出或其他证明。补真正缺失证据或说明限制，不从标签推断成功 |
| user-owned/safety choice | 方案改变响应 API、删真实数据、弱化有效安全测试或执行未授权 Git 写。停止该动作并说明需要何种决定 |
| obsolete tests | 删除算法/prose/重复测试，保留真实配置/接口契约测试；不因删旧测试本身停止工作 |
| ordinary plan review | 只有更佳命名/可选步骤顺序意见。可采纳或说明不采纳，不循环索取 unconditional approval |
| concrete strict risk | raw key 处理可能污染原型。用针对性安全回归与直接证据解决风险，而非给整项工程加通用仪式 |

**Evidence:** 作者/生成器层不互相重引入硬门禁；真实 worker 场景展现安全自主调整与适当升级。没有用 exact prose 测试或假决策函数替代行为证据。

## W4 / T7 — 模型校准与 Git 语义授权

**Files:** Modify 两独立作者 workflow 的下列精确集合：`prompts/v1/deepwork/{gpt,gpt-5.6,gpt-6-astra,gemini,glm,codex}.md`、`prompts/codex/deepwork/{gpt,gpt-5.6,gpt-6-astra,gemini,glm,codex}.md`；`src/hooks/chat-message.ts::COMMIT_GUARD_TEXT`；T6 已列 brainstorming/writing-plans/SDD/implementer/default 中相关 Git 文案。Test `src/hooks/chat-message.test.ts`、`src/intent/prompt-loader.test.ts`、`src/codex/plugin-generator.test.ts`；Regression-only `src/permissions/index.test.ts`、`src/permissions/subagent-git-guard.test.ts`。

**Interfaces:** GPT-5.6 及之后的校准强调 outcome/interface，不改变 model detector、配置优先级或 token/reasoning 参数；Git guard 是指令，不新增自然语言授权 runtime classifier。

**Recommended executor:** `normal-task`

- [ ] 六个 GPT/gpt-5.6/gpt-6-astra 作者文件明确禁止为 plans/tasks/files/coordination/evidence/review checkpoints 发明 hash；删除“stale/mixed-artifact risk”即可用自定义 hash 的宽泛例外。只留外部完整性/release/protocol 明确要求的 hash；输入变化用更新证据和受影响 review 处理。
- [ ] GPT-5.6 与 Astra 明确优先完整结果、清晰可用接口和真实证据；不因模型更强而增加流程。避免默认 TDD/重复 review、框架/类型已保证的重复测试；遇到等价实现/顺序调整可自主决定。保留原适用 model guard、ahead-of-runtime carriage、native reasoning 能力和上下文控制。
- [ ] 同步 GPT 基础层以及 Gemini/GLM/Codex 层中强制失败先行、执行阶段日志、固定场景数量、按 complexity 自动绑定审查、必须 unconditional approval 才结束的段落/示例/终态摘要。不能只改 Astra addendum，让它下面的 GPT 基础层继续强迫旧流程；文案相同不作为测试目标。
- [ ] 修改 `COMMIT_GUARD_TEXT`：用户请求语义必要涵盖该具体 Git 操作时可有授权，不重复索取已经明确含义的授权；implement 不含 commit，commit 不含 push/tag/rebase/release，显式禁止不被推翻。保留 disposable-temp-fixture 例外和 subagent Git guard，不修改用户全局政策。
- [ ] brainstorming/planning 删除保存文档后强制提交与“written and committed”交接；writing-plans 去掉 frequent commits/示例提交步骤；SDD/模型最终结果不要求 commit、commit footer 或 suggested commit message。spec/plan 不单独提交。已经明确授权的设计范围仍是实现边界。
- [ ] 执行 `node --test --experimental-strip-types src/hooks/chat-message.test.ts src/intent/prompt-loader.test.ts src/codex/plugin-generator.test.ts src/permissions/index.test.ts src/permissions/subagent-git-guard.test.ts`。保留 guard 开关、数组/字符串 system、幂等注入等接口断言；删除仅 exact prose 的 expected-fragment 检查。通过组合 prompt 阅读和 T10 场景判断语义，无新增字符串灯。

**Evidence:** 两 workflow 各模型层一致遵循结果导向默认值；GPT-5.6+ 不引入额外仪式；授权边界清晰且 runtime 现有安全防护无回归。

## W5 / T8 — 文档与 schema freshness CI

**Files:** Modify `README.md`、`AGENTS.md`、`docs/v1-maintenance.md`、`docs/kb/omo-features/config-schema-design.md`、`docs/kb/omo-features/config-and-registration.md`、`.github/workflows/release.yml`；Delete `docs/prompt-sync.md`；Create `.github/workflows/schema.yml`、`src/schema-freshness.test.ts`；Test `src/config/schema.test.ts`、`src/release-completion-workflow.test.ts`。

**Interfaces:** 作者源/生成 schema → 当前文档和 drift 检查；`scripts/gen-schema.ts` 输出到 cwd/schema.json 的现有接口不变。

**Recommended executor:** `normal-task`

- [ ] README workflow 段、默认配置、目录树、hook 说明只列 v1 默认/codex adapter；不增加旧值迁移指南或兼容承诺。AGENTS 的维护规则不再要求 OMO/prompt-sync 同步；按实际 `V1_INJECTED_SKILLS` 说明 brainstorming 注入，其余 skills 按需使用，不保留“默认 OMO”的 live 示例。
- [ ] maintenance 汇总 T5–T7：建议性 plan review、goal/interface 验收、deep/worker 自主调整、informative task status、严格措施的具体触发、GPT-5.6+ outcome、hash/Git 规则。旧日期 provenance 可保留但标清被替代的规则，不能继续作为现行硬契约。将 prompt-sync 有用来源/已有 commit IDs 并入后删除文件；两 KB 的本地 schema/default 示例对齐，历史研究材料不批量重写。
- [ ] `schema.yml` 使用 `pull_request`、`push.branches: ["**"]`、`workflow_dispatch` 与 `contents:read`；沿用 release 的 Node 24/pnpm 11.9.0、action major 和 frozen-lockfile 安装步骤，不在本地安装。核心步骤：

```yaml
- name: Regenerate schema
  run: pnpm run gen-schema
- name: Check schema freshness
  run: git diff --exit-code -- schema.json
```

  release verify 也加这两步，位于发布前；不改 job IDs、lane、native matrix、checksum、鉴权/不可变 tag 规则。CI 默认 runner shell 仍按其平台配置。
- [ ] freshness test 在临时 cwd 运行现有 generator，比较其输出与仓库 artifact 的 bytes。负例对临时副本制造 enum/字段 drift，确认比较会拒绝；不改真实 schema 作为负例，不算 hash。测试 CI 的实际 regenerate/compare→publish 依赖，避免全 YAML 文案快照。

```ts
execFileSync(process.execPath, ["--experimental-strip-types", join(projectRoot, "scripts/gen-schema.ts")], { cwd: fixtureDir })
assert.deepEqual(readFileSync(join(fixtureDir, "schema.json")), readFileSync(join(projectRoot, "schema.json")))
```

- [ ] 执行 `node --test --experimental-strip-types src/schema-freshness.test.ts src/config/schema.test.ts src/release-completion-workflow.test.ts`。人工检查当前文档链接和规则，保留 `.omo` guard 表、`--keep-omo`、ignored upstream、release 完整性说明。作者源确认稳定后再进入 T9，不以 receipt 标签代替确认。

**Evidence:** 当前文档无旧 workflow 选项/硬流程冲突；schema drift 在普通 CI 和 release verify 能失败，fresh artifact 能通过。

## W6 / T9 — 一次生成 Codex artifacts

**Files:** Create `src/codex/generated-freshness.test.ts`；Modify `src/codex/plugin-generator.test.ts`（删除旧 prose/receipt 断言、保留功能）；Generate §3 输出。Read generator 的 `loadAdapterConfig/buildCodexAgents/writeCodexSkills/normalizeSkillForCodex`；若其规则还冲突，先回 T6 修作者逻辑，再生成。

**Interfaces:** 使用已有 `generateCodexPlugin({ projectRoot, pluginRoot, marketplacePath, projectAgentsRoot, config?, packageVersion? })`；根目录 generator 只在源稳定后执行一次。临时测试输出不重复写根目录。

**Recommended executor:** `coding`

- [ ] generator tests 保留实际可解析 TOML、role/model/calibration composition、explicit-only planning variants、xhigh floor、MCP plugin-local wrapper、版本与技能复制过滤。只证明 source→artifact 的正确组合与接口，不固定 reviewed prose 的字面内容/段落数。
- [ ] freshness test 把三个输出根都放进同一 run-owned 临时目录，`projectRoot` 仍为当前仓库，用与 CLI 相同的 `loadAdapterConfig`，不要注入不同 default config。比较临时与根目录 generated 文件集和 bytes，缺文件/额外旧 TOML/stale 内容都拒绝。只排除明确 build-only dist/native 暂存，不能排除 skills/agents/manifests。临时副本的 stale 负例验证比较有效。
- [ ] 执行 `pnpm run build`，随后 `pnpm run gen:codex-plugin` 一次。无版本 bump/手改产物；保留仓库显式配置，不带个人 overrides，不为减少差异改变生成输入。
- [ ] 执行 `node --test --experimental-strip-types src/codex/plugin-generator.test.ts src/codex/generated-freshness.test.ts src/schema-freshness.test.ts`；查看 `git diff --stat`、`git status --short`，确认产物只有预期变化且没有密钥/本机路径泄漏。

**Evidence:** 生成文件集与作者源一致，bundle 功能契约未损坏。byte freshness 验证的是生成来源，不是把 prose 固定为产品逻辑。若之后确需修改作者源，如实说明重生成原因，不为“一次”表面记录手修产物。

## W7 / T10 — 功能验收、真实 surface 与收尾

**Files:** 使用 `src/index.test.ts`、`src/cli/shim.test.ts`、现有 runtime/config/permissions 测试及 freshness tests；场景证据在临时目录，不新增字符串/receipt 验证器。

**Interfaces:** 已实现公开函数/CLI/plugin surface 与实际输出 → §1 IDEAL END STATE 结论、已知限制、必要风险决定和清理说明。

**Recommended executor:** `normal-task`

- [ ] 最终 `pnpm run typecheck`、`pnpm test`；full TS 已包含 freshness，不立即重复同一输入。T9 build 输入未变则复用其结果；有相关变化再重跑受影响验证。记录实际命令/结果，不要求实施前的失败 transcript。
- [ ] 做隔离 config-load：临时 `opencode.json` 指向仓库 `dist/index.js`；`.opencode/ocmm.jsonc` 使用 BOM、合法 `workflow:"v1"`、一个普通 typo、已知 agent model 与 selected directory profile 的合法覆盖。另一最小 config 省略 workflow，验证默认行为。绝不加入旧 workflow 输入、迁移 warning 或转换对照 QA。

```powershell
$env:XDG_CONFIG_HOME = "$testDir/xdg-config"
$env:XDG_DATA_HOME = "$testDir/xdg-data"
$env:XDG_STATE_HOME = "$testDir/xdg-state"
$env:XDG_CACHE_HOME = "$testDir/xdg-cache"
$env:OCMM_DEBUG = '1'
opencode debug paths
opencode debug config --print-logs --log-level DEBUG
opencode debug agent orchestrator --print-logs --log-level DEBUG
```

  `$testDir` 先赋为已确认的唯一临时目录，各调用使用该 workdir；home/tmp 固定行以外的 data/bin/log/repos/cache/config/state 均在隔离根。观察 v1 agents/skills、有效 model/profile、bounded unknown 路径和 BOM 成功加载。不继承真实用户凭据，不把日志 success 一行当作配置正确。保留简洁无敏感输出及判定。
- [ ] 使用已可用、获准使用的真实 agent surface，观察 T6 中代表性场景：safe path/helper 调整、user-owned/API/data 风险、optional child 已冗余、只有 ack 尚无必要证据；加入普通 plan review 只有建议但功能已证明的例子。通过实际输出/行动与接口结果判读，不检查必须含某个状态词。不要求每个模型跑同一全矩阵。

  probe 限定临时夹具和不执行真实 Git/数据破坏；可在隔离临时模块中提供实际导出函数及测试来证明 optional child 已冗余，不能仅宣称“接口已验证”。安全场景只作下一行动判断，不真的尝试危险动作。记录可用模型/输入/观察；若真实行为已在本次实施得到同等证据可复用。没有可用 host/凭据则说明该行为未验证，不拿 regex 补灯，也不把 optional probe 的缺席等同于已被其他 surface 证明的功能失败。
- [ ] 保留面从 full tests 和只读 diff 核实：rules/permissions/shim/hashline/release-integrity 回归、`.gitignore` `/omo/` 与 `.omo/` 仍在。检索 active 作者与 generated 内容只为找到残留；人工区分禁止的旧 workflow/虚构调用/硬流程与应保留的兼容路径、provenance、外部 hash。feature 阶段不运行 remote release completion。
- [ ] 默认按功能、接口、关键回归及实际证据完成集成判断，不无条件调 reviewer。若用户要求或有具体未解决安全/数据损失/外部协议/不可逆风险，用 T6 packet 做相应定向 review/升级；真正风险必须解决或由用户决定，不能用建议性 review 掩盖。已采用 review 的相关实现输入改变时更新 packet/受影响 lane，无变化不重复。optional review/child 未回固定字段不能阻塞证据充分的结果。
- [ ] 停止本次启动的进程、恢复环境变量；清理前复核 exact run-owned 路径及父目录，不能递归删共享 temp 根。留下无敏感结果与限制说明，最后查看 `git status --short`、`git diff --check`、`git diff --stat`，不做 Git 写。

**Evidence:** Spec 指定的全量检查与隔离 config-load 有真实结果；安全风险有针对性处理；模型行为观察和未验证项诚实报告。完成不取决于所有 child 状态齐全或 reviewer 固定 verdict；但缺少必需功能/检查证据时，不能声称那项已验证。

---

## 4. 测试策略与允许调整

测试/实现可按工作需要排序，不要求任何步骤先失败，不要求固定场景数或通过文案标签。

| 类别 | 处理 | 保留的有效证明 |
|---|---|---|
| OMO 加载/旧值兼容/三 workflow 一致性 | 删除，不补旧值专项测试 | v1/codex loading、缓存、默认值、通用非法字段行为 |
| review SHA algorithm/marker/wrapper/symlink fixture | 删除及无消费者 helper | review 实际使用的当前 diff/new files 和有效证据；不扩成新状态机 |
| 计划字段顺序、段落标题、prose regex、固定 receipt/场景数量 | 删除，不改成另一组字符串灯 | 真实 worker 决策、可用接口和针对性人工场景 |
| generated 内容重复快照 | 删除重复；保留一次 freshness | 同一作者源和实际生成文件集/内容一致、安装接口正确 |
| schema enum、tuple options、BOM、diagnostic path | 保留/新增结果测试 | 输入→公开输出/错误→有效兄弟字段仍在 |
| profile priority、review-agent alias conflict、prototype safety、权限及 release checksum | 保留功能测试并修实际回归 | 有效产品契约不能因 suite 失败而删除 |

删测试时在任务说明/最终报告简述旧测试、删除理由和仍需保护的契约；无需额外账本或固定字段。若执行时发现测试包含有效功能，不按旧清单盲删。最小实现和接口可按证据调整，最终仍需完成 Spec 的实际功能与检查。

## 5. 覆盖、自审与交接

| 当前 Spec | 计划覆盖 |
|---|---|
| 直接删除，无旧值专门逻辑 | T3、T8、T10；不新建兼容文件/测试/QA |
| 保留 `.omo/*`、`--keep-omo`、ignored upstream、外部 hash | §3、T2/T8/T10 |
| CodeGraph / host background schema | T5，两作者 workflow 与 init-deep |
| 灵活计划、deep/worker 自主调整、informative task outcomes | §2、T6/T10，含 optional child 例子 |
| 默认 outcome/interface，review advisory，风险才收紧 | §1、T6/T7/T10，含 planner/critic/reviewer 和 generator 内联文本 |
| GPT-5.6+ 抑制流程/hash/重复 review/测试仪式 | T7，GPT 基础层与其后校准一起处理 |
| 五内容域 review，删除 SHA identity/固定 receipt | T6，删除算法 fixtures，保留当前输入证据 |
| Git 语义授权，实施不含 commit，spec/plan 不单独提交 | T7/T8；本计划无 Git 写步骤 |
| tuple、BOM、bounded unknown diagnostics | T1/T2/T4 与定向功能回归 |
| 默认文档、prompt-sync 退役、schema CI、一次 Codex 生成 | T8/T9 |
| 删除失效/重复/prose 测试，保留有效功能 | §3/§4、T3/T6/T7/T9 |
| typecheck/TS+Rust/build/freshness/isolated config | T9/T10，不运行发布阶段动作 |

**本次修订自审：**

- 已完整重读当前 Spec 和旧计划，删除上版旧值 helper、diagnostic、test、profile 扩展与 live QA 建议；一般 unknown diagnostics 与 review-agent alias 功能保留且明确区分。
- 已移除要求失败先行的步骤、默认固定 receipt/所有 child 终态条件、默认 unconditional review 及 prose-policy 新测试建议；改为结果证据和具体风险处理。
- 已把变更落点扩到 planner/plan-critic/reviewer 作者源、SDD worker 模板及 Codex generator 的内联审查规则，防止旧硬流程从其他层重新出现。
- 接口一致：profile 不新加 workflow；tolerant result 添加的是配置诊断数据，不是流程协议；现有 generator 参数不变；可用性以实际 host 为准。
- 测试删除有明确理由与功能保护位置；生成 freshness 的 byte 比较用于源产物同步，不是 prose 行为测试；无占位的未决产品方案。
- 只修订本计划，没有执行产品测试/build、修改实现或进行 Git 写。下游需据实际验证结果报告，不能把计划自审当功能验收。

**关键风险：** 通用容忍 parser 可能误删 strict/union 的有效字段；多层 prompts/内联 generator 可能留下硬门禁；profile 当前不支持 workflow 的事实易被误扩；真实代理行为不能由静态字符串测试保证；生成输入必须一致。这些风险分别由 T4、T6/T7、T3、T10、T9 的结果与接口证据处理。

**Handoff status:** `waiting for receipt`（waiting-for-receipt）。本修订未取得针对当前内容的外部评阅结果；按本次 planner 会话的交接边界交回 orchestrator。该状态只是此次交接信息，不是对产品默认验收新增固定 receipt 门禁；不计算 digest、不调度审查、不执行实施。
