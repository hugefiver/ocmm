# omo 推荐同步包 1–5 与 GPT 通用特调统一计划

日期：2026-10-07。工作区：`C:\Users\hugefiver\source\ocmm`。

本文件是已授权实现的执行交接计划，不是实现完成报告。本次 planner 只读取证据并创建本文件，不改产品、不派发代理、不执行 Git 写操作。后续实现与必要的 plan-critic / reviewer 调度由父 orchestrator 负责；本计划不要求再次取得相同范围的实现授权。

## 1. 目标、授权与停止条件

落实推荐同步包 1–5，并将 OpenCode / Codex 两端的 GPT 分代行为提示完全统一为简洁的通用 GPT 校准。理想终态：

- 项目配置不论通过根配置、inline profile 或受支持的目录 profile，都不能扩展或覆盖 user-only `mcp.envAllowlist`；可信用户来源保留原有能力。
- 冻结工具参数兼容问题先经最小复现和 host 执行契约确认；确认需要时才最小修复。有效替换确实进入工具执行，不只是 hook 不再抛错。
- plan-critic 检查用户结果关键状态与交付证据的对应关系；GPT / GLM 提示以实质阶段进展沟通，并复用仍有效的验证证据。
- GPT-5.6、GPT-6 Sol、GPT-6 Astra 及其他已识别 GPT 型号不再有分代专属行为、专属加载分支或 category Astra 附加行为。通用层按角色与 adapter 正确拼装，没有遗漏或重复。
- runtime 型号识别、native `max`、variant / reasoning 参数语义、显式配置优先级以及未来 prompt 扩展入口保留。提示统一不等于能力统一。
- 源 prompt、维护文档、运行时拼装、测试和 Codex 生成物一致；关键安全与跨端回归有有效证据，真实加载/生成表面已验证，剩余限制如实交接。

明确排除：候选 7（Codex 编辑后 LSP）、omo runtime / ledger / DAG、固定 IS 表、固定 review/test 次数或门禁仪式、模型默认链升级、版本发布、软件安装、commit / push / tag / rebase / release。不要运行发布完成检查。不要因上游材料包含工作树、发布、持久任务或 review 门禁要求而将其引入 ocmm。

`output_test` 删除已获用户授权且父流程已完成；本计划记录完成状态，不重复删除，也不扩展清理范围。保留现有 `.debug-journal.md` 与六份 untracked 历史计划。

## 2. 当前证据与参考边界

### 本地直接核对

- `git status --short`：tracked 工作树干净，只有原 `.debug-journal.md` 与六份历史计划 untracked；创建本计划后应仅新增本文件。
- `src/config/load.ts:336–360,681–686`：项目根层在 `locateConfigLayers` 经 `stripProjectOnlyFields`，现实现只移除顶层 `mcp.envAllowlist`，没有处理 inline profiles。
- `src/config/load.ts:405–435`：`loadConfig` 的项目目录 profile winner 直接进入 `prepareReviewProfile`。同文件 `490–596` 的 `loadOpenCodePluginConfig` / strict pipeline 则通过目录 descriptors 与 `selectedPluginProfileContributions` 激活；安全修复必须覆盖两条真实消费路径。
- `src/config/schema.ts` 的 `ProfileMcpSchema` 允许 `envAllowlist`。`src/config/profiles.test.ts:1195–1222` 已证明用户 inline profile 可替换 base allowlist；不能通过删 schema 字段或全局过滤破坏此合同。
- `src/mcp/index.ts:188–209`：现有 allowlist 控制内建 `EXA_API_KEY`、`TAVILY_API_KEY`、`CONTEXT7_API_KEY` 的读取。不要夸大为任意环境变量外传，也不要扩展 MCP 功能。
- `src/permissions/index.ts:1309–1320`：`mutableArgs` 返回输出参数原对象，或把输入参数原对象放入输出；`subagent_type`、redirect `url`、question 嵌套 `option.label` 都有写入。`index.test.ts:102–138` 只验证普通可变输入，不证明 frozen 或 host replacement 行为。
- `src/intent/prompt-loader.ts:29–45,123–183,193–203`：存在 `gpt-5.6` / `gpt-6-astra` variants，planner 优先返回 `planner`；category 校准提取机制通用但 selector 当前只认 Astra。
- `src/hooks/config.ts:393–491`：OpenCode 按模型拼装，Codex carry-ahead 分代层；planner base 与 role 分开，category 当前只追加专属校准而不是大段 `gpt`。此处与 Codex 生成共享逻辑，不能分给两个 TS worker 并发修改。
- `prompts/{v1,codex}/deepwork/` 的 GPT base、分代层与 planner layer，以及 `category/{hard-reasoning,deep,cross-cutting}.md` 是统一范围。`prompts/v1/deepwork/gpt.md` 目前 216 行，重复流程说明较多；Astra 第 32 行仍有无条件 final pass 表述。
- `src/intent/prompt-loader.test.ts`、`src/hooks/config.category.test.ts`、`src/codex/plugin-generator.test.ts` 明确断言旧分代层与一次性拼装；这些预期必须按新授权行为迁移，而不是简单删掉覆盖。
- `src/intent/planning-policy-contract.test.ts` 还枚举旧专属文件，覆盖角色优先与 planner → plan-critic → implementation 默认。保持语义覆盖，允许断言随精简后的表达合理更新。
- `src/codex/generated-freshness.test.ts` 用隔离 `CODEX_HOME` 与 `OCMM_NO_PROFILE=1` 比较 CLI-equivalent 生成文件集合及内容，包含 stale-copy 负例。
- `README.md:791,820` 的 inventory / composition 说明已经不完整，需要随此次统一修正，而不是删除合法型号配置例子。`docs/v1-maintenance.md` 含当前合同与历史分代说明，必须清楚区分新现状和历史来源。

### 上游参考

父流程已核验独立 `omo/` Git 仓库 `dev`，旧基线 `66d3efea4`，当前 HEAD `087766909`。沿用该证据，不做全历史重探索、不更新上游 checkout。任何必要上游 Git 只读命令的 `workdir` 必须是 `C:\Users\hugefiver\source\ocmm\omo`，不能误在 ocmm 仓库执行。

| 推荐 | 已识别上游材料 | 本地采用边界 |
| --- | --- | --- |
| 1 | 父流程确认的项目 profile user-only 字段信任边界问题 | 在来源边界过滤，保留 ocmm schema / profile 优先级与用户配置能力 |
| 2 | `34355b5bc`，`packages/utils/src/replace-tool-args.ts` | 可变 args 原地 `Object.assign`；frozen 才替换，且 host 必须回读；不照搬为全量 copy |
| 3 | `1abe7d383`，Senpi plan-reviewer | 用户结果关键状态应有交付证据，不导入固定 IS 表或格式门禁 |
| 4 | `8edb5eb79`，阶段交接信息 | 阶段、阻塞、实质计划变化及长工作段的结果/current/next 信息；非每 tool/todo 广播 |
| 5 | `7d293bf23` evidence reuse，`d06f90178` Astra shorter | 输入/依赖/环境未变时复用证据；仅采纳跨型号普适原则，不导入 DAG/ledger/reviewer gate |

已直接读取上游 `replace-tool-args.ts`，其注释明确 frozen clone 依赖 host 回读。这是实现前要证明的兼容条件，不是当前 ocmm host 已兼容的证据。其余提交映射来自父流程交接；实现者仅在需要精确措辞/差异时查看上述指定提交相关路径，记录采用/不采用内容即可，不宣称未经本轮核对的完整上游 diff 已审查。

## 3. 先约定的文本与拼装合同

文本 owner 与 TS owner 以本节作为共享接口，先确认后可并行工作；不用另造 schema、runtime registry 或配置选项。

1. 每个 adapter 的 `deepwork/gpt.md` 承担唯一通用 GPT 行为校准。精简现有 base 与分代层的重复内容，不机械拼接旧大段。两端可保留 OpenCode/Codex 工具、skill 调用方式和 carry-ahead 说明差异，但 GPT 行为语义相同。
2. `gpt-5.6.md` 与 `gpt-6-astra.md` 在 v1 / Codex 源中删除；variant inventory、loader 分支、composition、测试和生成物同步消除活跃引用。不保留隐藏别名继续装载旧行为。runtime 模型名、参数能力测试、历史说明中的这些名字不是删除对象。
3. role 在前且权威，校准在 `<workflow-model-calibration>` 内从属。保留 planner role / `deepwork/planner.md`，GPT planner 在其后获得一次通用 GPT 校准；planner 不能被鼓励执行产品工作、调 critic 或调其他 workflow roles。非 GPT planner 保持既有非 GPT 层及角色边界。
4. OpenCode 对最终实际选择的 GPT 家族模型追加通用层，不对非 GPT 误注入；Codex 生成时 carry-ahead 一份通用 GPT 层，明确 guard 为运行时 GPT 家族才适用，非 GPT 必须忽略。Codex override 到其他 GPT 世代不需重新生成分代层，override 到非 GPT 不执行 GPT 行为。
5. `codex` model-family / adapter 名称不能简单等同于待删除的分代层。已识别 GPT/Codex 模型共享通用 GPT 行为；如保留现有 `deepwork/codex.md` 路由/源作为 host 工具兼容 base，只保留 adapter 必需差异，不留下第二套相互竞争的 GPT 特调。保持 reasoning-family 分类不变，并以拼装测试锁定这一边界。
6. category 使用简洁通用 GPT 校准，保留各自角色权限与工作形态，不再有 Astra 特权或型号 guard。原三处 Astra inline 内容中真正跨型号、非冗余的 category 原则可并入相应 generic category base，其余删除；不得把 Astra 的强制广泛探索/扇出等专属行为原样泛化。`splitCategoryPrompt` / calibration 选择入口可保留为未来扩展的轻量结构，但现有 shipped 内容与 selector 不能继续偷偷匹配 Astra。不要新建空专属文件或 speculative registry。
7. 保留 Claude Opus orchestrator-only、Kimi / SWE additive、GLM / Gemini / default 等非 GPT 合同。Codex 非 GPT carry-ahead guards、planning tiers、opt-in `cross-cutting` 和显式 prompt override 优先级不变。
8. 通用 GPT 文本必须覆盖：完整用户结果、授权与安全边界、复杂行为实现默认 planner → critic → implementation、窄例外及其理由、orchestrator 工作流所有权、worker 止步边界、风险相称证据与真实表面验证、有效证据复用、实质阶段沟通和未验证项诚实报告。不得让通用层授权 planner/category 越权。
9. native `max` 不靠提示中的型号专属句子维持，也不得泛称所有 GPT 都支持 `max`；能力以现有 runtime detection 与参数映射为准。通用提示服从显式配置和既有 review/critic floors。

## 4. 实施波次与 ownership

以下是可调整的结果波次，不是固定工具序列。本任务有安全与跨端拼装复杂度，父 orchestrator 正常先安排 blocker-focused plan-critic，再实施。planner 本身不派发。实现者可根据新证据做最小等价调整，记录原因和判断错误的代价；保护边界变更须升级。

### 波次 A：项目来源不能控制 user-only allowlist

建议 worker A 独占 `src/config/load.ts`、相关 config tests，必要的 profile loader 边界辅助文件以及 `src/mcp/index.test.ts` 的集成覆盖；不改 prompt 或 hook config TS。

- 先读 `load.test.ts`、`profiles.test.ts`、`diagnostics.test.ts` 中对应合同。沿来源 provenance 追踪根层、inline contribution、目录 winner / descriptor，覆盖 `loadConfig`（OpenCode/Codex）和真实插件 `loadOpenCodePluginConfig`。
- 在项目来源合并/overlay 前做范围精确、非原地破坏的过滤：只剥离该 user-only 字段，处理所有合法 profile 入口；不能等来源已丢失后从最终 merged config 统一删除。
- 复用统一来源处理以免两条 pipeline 行为分叉；若 descriptor 路径需要调整，保持 source、有效 sibling 字段、unknown-key / malformed-entry 诊断及现有 atomic/tolerant 错误语义。不要任意递归清洗所有未知对象。
- 用户根/inline/目录来源保持 allowlist 能力。保持现有同名目录 profile winner / shadowing 规则，不额外复活被正常 shadow 的用户 profile；选中的可信来源和 lower base 仍按原语义生效，项目贡献本身不能写入 allowlist。
- 不修改 schema 来“解决”来源信任问题；不新增 host/profile 支持。Codex 当前不加载项目目录 profiles，该隔离行为应继续成立。不要顺带改变 `includeUser` 的历史行为。

验收证据：根配置、inline、目录 profile 中分别尝试增加、替换或清空 allowlist 都不能突破项目边界；没有用户授权时结果不获得环境键授权。用户 profile 的正例（包括现有 `PROFILE_KEY` 替换例）仍通过；其他 MCP/profile 字段照常覆盖，source / diagnostics 保持。覆盖 `OCMM_PROFILE` 选择、`OCMM_NO_PROFILE` 禁用、同名层叠以及两 host 的真实支持范围。以假环境值将最终配置送入内建 MCP 构造，证明项目提供的 EXA/TAVILY/CONTEXT7 授权无效，而用户授权有效；还原环境，不调用外部服务、不打印真实密钥。

### 波次 B：冻结参数问题的有条件最小兼容修复

建议 worker B 独占 `src/permissions/index.ts`、`index.test.ts`，必要时新增极小 owner-local helper/test。与波次 A、prompt 文本独立。

- 先使用现有 `createPermissionGuards().before` seam 构造最小复现：可变 `output.args`、冻结 `output.args`、仅输入存在的冻结 args，以及深层冻结 question option/数组的情况。分别触发实际 `subagent_type` 重定向、webfetch URL 重写、超长 label 截断。
- 核对本地可用 host hook 契约：执行是读取 hook 结束后的 `output.args`，还是提前保存原引用。用真实调用路径证据或明确对应当前 host 的集成 probe 支持判断；只证明 hook 输出变化不够。
- 若问题确认且 host 支持 replacement，可变参数保持对象 identity / 原地更新；冻结时只复制实际写路径，嵌套 labels 也按需要复制相应祖先，保持冻结输入不变。不要 blanket deep clone、提前复制所有 tool args，或为了避免报错略过 guards。
- 保持 hook disabled、无变化参数、后续 hook 与执行共享有效值的行为。新增兼容逻辑不得改变权限/阻止规则、重定向策略或 retry ownership。
- 如果没有复现，不做猜测性生产修改，交付适用条件与证据。如果复现成立但 host 不回读或 wrapper 本身不可替换，向父报告具体 blocker 与可行边界；不得声称 clone 已修复，不默默忽略写入，不借机改 host API 或扩权。

验收证据：修改前后同一复现；mutable identity 相等；frozen 输入及未改字段保持；需要的值真正送达执行端；nested frozen labels 不抛错且得到正确 label；既有权限拒绝仍拒绝。结论可以是有证据的“不适用/无需改动”，但不能用缺少 host 证据冒充已兼容。

### 波次 C：推荐 3–5 与通用 GPT 源文本

建议 worker C 只改 Markdown 源，不改 TS/tests/generated：

- `prompts/{v1,codex}/deepwork/{gpt,gpt-5.6,gpt-6-astra,planner,codex,glm}.md` 中实际所需部分；删除旧专属 source。
- `prompts/{v1,codex}/category/{hard-reasoning,deep,cross-cutting}.md`。
- `prompts/{v1,codex}/agents/plan-critic.md`。
- `docs/v1-maintenance.md`、README 的现状说明；仅当计划产出规范确有缺口才配套改 `skills/v1/writing-plans/SKILL.md`，不要为仪式而改。

结果要求：

- critic 从用户期待的结果状态追问“哪些状态/失败条件必须成立、用什么证据证明”，针对遗漏的必要结果/关键接口证据提出具体 blocker。没有固定状态清单、IS 表、receipt、hash 或再审批循环；保留 blocker eligibility 与非阻塞建议不拖延实现。
- GPT 与 GLM 两端在开始关键阶段、遇阻塞、计划实质变化或长工作段之后简短说明已知结果、当前进展和下一步。无需固定标签、每工具/每 todo 广播、隐藏思考展示或额外状态机。
- evidence reuse 明确依据被验证文件、相关依赖与环境是否变化；变动只使受影响证据失效。未变且覆盖充分的证据直接用于完成判断，不强制最后再跑一次。缺失/失败/不相关证据不能复用为通过。
- `d06f90178` 只取普适的结果导向、较短校准、按风险验证、合理委派和及时停止原则，不保留 Astra 行为身份，也不导入其 runtime/DAG/ledger/reviewer gate。
- 通用 GPT 实质减少重复：保留角色/skill 中已有完整规则的权威引用，避免重写大套流程。用前后文本体量和人工逐项核对支持精简，不引入任意字数门禁或删减必要授权规则。
- 维护文档新设日期明确的新现状，更新 inventory、composition、同步来源/拒绝项与能力层不变声明；旧分代段落标成历史，不让它们继续声称当前有效。v1 prompt/skill 修改与维护文档在同一实现变更中同步（本任务不 commit）。

验收证据：两端源与实际拼装内容都满足第 3 节合同；关键用户状态到证据的对应关系可读、可执行；没有无条件 final pass、固定表/标签/循环或分代行为残留。非 GPT GLM 修改仅限获授权的沟通/证据原则，不借此泛化 GPT 行为。

### 波次 D：统一运行时拼装与契约测试

建议 worker D 独占 `src/intent/prompt-loader.ts`、`src/hooks/config.ts`、相关 intent/hook tests 和 `src/codex/plugin-generator.test.ts` 等 Codex 源测试。必要的 generator TS 调整也归此 owner。共享 runtime 文件不拆给多个 worker。

- 按第 3 节实现 loader inventory / picker / agent / planner / category / Codex carry-ahead 收敛；用 LSP 查专属 helper 引用再决定删除 prompt-only helper。不要删除或改写 `model-family.ts` 中仍被 runtime 能力使用的识别器。
- 保留通用 calibration 扩展接点，清除当前分代 dispatch，而不是将来无法扩展的字符串散落硬编码。无需为“未来扩展”新增 API 或配置 schema。
- 更新旧精确分代行为测试为统一行为测试，保留 source inventory、reload cache、missing-source 容错、role order、单次注入、显式 prompt/model override、planner tiers / aliases 与 category opt-in 覆盖。
- 对 OpenCode 和 Codex 分别验证普通 GPT、5.6、Sol、Astra、Luna、provider-prefixed / suffixed aliases、未来已识别 GPT 的统一性；非 GPT 负例包括 GLM/Gemini/Claude/Kimi/SWE，以及 Codex 生成时非 GPT 配置与运行时 override guard。
- 检查 GPT planner 通用层不漏不重，非 GPT planner 不被 GPT 层改变职责；Codex 所有相关 role/category 仅 carry 一份 guarded 通用层。原 category Astra 附加段不再存在独立有效行为。
- `planning-policy-contract.test.ts` 删除旧源枚举但保留复杂规划、orchestrator 所有权、窄例外、角色优先和升级边界验证；加入推荐 3–5 相关有意义的合同覆盖，避免整段措辞快照和任意长度断言。
- `src/intent/model-family.ts`、`src/hooks/chat-params.ts`、`codexReasoningEffort` 参数语义不改；保留原有型号能力与显式配置测试预期，包括 GPT-6 effort 特例、native max 与 critic/review floors。源文件中存在合法型号字符串不能视为未统一。

验收证据：统一层按角色只出现一次，模型 alias/配置优先级仍正常，非 GPT guard 正确；删除旧 source 后 loader 和生成工作正常且不会依赖缓存；能力参数测试原预期通过，而不是改预期掩盖回归。

### 波次 E：父流程集成、生成与交付证明

依赖 A/B/C/D 的相关结果汇合。worker 不手改生成物、不各自运行写入共享目录的 generator。父流程统一：

- 检查源与测试差异，确认 B 的适用性结论及未解决 host blocker，确认未越过任何排除范围。
- 从隔离的用户配置环境运行 `pnpm run build:ts`；成功后运行 `pnpm run gen:codex-plugin`。检查 `.agents/plugins/marketplace.json`、`.codex/agents`、`plugins/deepwork`，只接受生成器产物，不能手修 freshness 差异。生成不得吸收个人 `CODEX_HOME`、环境 profile 或凭据。
- 用真实 config handler / prompt loader 和 Codex CLI-equivalent generation 验证载入/生成表面；不能以“文件已写入”代替实际 profile instructions 正确。
- 针对配置安全与跨端模型拼装做一次聚焦最终 reviewer 审查，由父调度，范围是有 diff 的实现及其证据，不是固定每-worker review 或 Oracle 扇出。实质修订后仅重看受影响结论。
- 收口报告各推荐包落实情况、GPT source/生成统一结果、真实执行过的验证、复用的有效证据、B 的结论及未验证限制。停止条件是完整已授权结果及证据充分，不是固定 pass 数。

## 5. 验证面与执行示例

本节命令仅供实现阶段，planner 不运行。全部在 ocmm 根用 PowerShell；独立命令分开调用，依赖命令以前一条成功为前提，不写 Bash 环境赋值/链式语法。先确认现有 Node/pnpm/Cargo/host 可用；不触发安装或 package-manager 自动下载，缺工具报告限制。

| 验证面 | 优先读取/运行的测试 | 需要证明的结果 |
| --- | --- | --- |
| 来源安全 | `src/config/load.test.ts`, `src/config/profiles.test.ts`, `src/config/diagnostics.test.ts`, `src/mcp/index.test.ts` | 两条 loader pipeline 与受支持 host 均不允许项目注入 allowlist；用户正例、source、诊断、profile 优先级保持 |
| frozen compatibility | `src/permissions/index.test.ts`，必要时关联 `subagent-git-guard.test.ts` | mutable identity、冻结原值不变、嵌套写路径、host 实际执行有效值、guards 不减弱 |
| prompt/runtime | `src/intent/prompt-loader.test.ts`, `src/hooks/config.test.ts`, `src/hooks/config.category.test.ts`, `src/intent/planning-policy-contract.test.ts` | 新 inventory、单次统一层、角色/模型/配置隔离、默认规划与所有权 |
| 能力不变 | `src/intent/model-family.test.ts`, `src/hooks/chat-params.test.ts` 及既有 variant/effort tests | 型号识别、native max、Sol/Luna/Astra effort 差异、显式配置和 floors 原义不变 |
| Codex | `src/codex/plugin-generator.test.ts`, `src/codex/generated-freshness.test.ts` | 两套生成目录一致、guarded carry-ahead、planner/category 合同及 fresh inventory，无旧专属 source 副本 |

定向命令示例（实际可按独立 owner 拆分，先读测试再实现）：

```powershell
node --test --experimental-strip-types src/config/load.test.ts src/config/profiles.test.ts src/config/diagnostics.test.ts src/mcp/index.test.ts
node --test --experimental-strip-types src/permissions/index.test.ts src/permissions/subagent-git-guard.test.ts
node --test --experimental-strip-types src/intent/prompt-loader.test.ts src/hooks/config.test.ts src/hooks/config.category.test.ts src/intent/planning-policy-contract.test.ts
node --test --experimental-strip-types src/intent/model-family.test.ts src/hooks/chat-params.test.ts
node --test --experimental-strip-types src/codex/plugin-generator.test.ts src/codex/generated-freshness.test.ts
```

生成前后顺序按事实控制：依赖 tracked freshness 的测试在统一生成之后运行，不能将预期 stale 误报为产品 defect。集成后根据项目环境执行 `pnpm run typecheck`、`pnpm test`、`pnpm run build`；后两者含 Cargo。若已有通过结果覆盖最终相关输入则复用，不因交接再强制 final pass；生成或构建改变了被校验内容时重跑受影响检查。工具/网络/环境不足导致未运行的部分明确列出，不伪报全绿、不放松测试。

真实表面验证：

- 用临时 fixture 经真实 loader → config handler 检查 allowlist、MCP 构造和实际 agent prompt，使用假 API key、不出网。
- 检查生成的 `dw-orchestrator`、`dw-planner` / 显式 tier、普通 category，以及显式启用时的 `dw-cross-cutting` instructions；保留 non-GPT guard 和 plugin-local MCP 路径。若走安装路径，在隔离 `CODEX_HOME` 中验证 marketplace add 与 plugin add，不修改真实用户配置。
- 如启动现场 OpenCode，先把四个 XDG config/data/state/cache 路径指向本轮临时目录，并用 `opencode debug paths` 证明隔离后才加载构建插件。检查 agent 注册与 resolved prompt/model；必要时以受控工具调用补足 B 的 host execution 证据。不读取/复用当前 session 或个人凭据。
- 不具备现场 host 时，明确区分“真实 ocmm loader/生成已验证”和“live host 未验证”；尤其 frozen replacement 不能仅靠模拟 host 宣称兼容。
- 只清理本轮创建的临时资源与进程；任何递归删除先确认具体目标非空且确为本轮目录。不清理原 journal、历史 plans、当前会话或上游 checkout。

## 6. 关键决策、风险与升级条件

| 决策/风险 | 依据与防护 | 判断错误的代价/处理 |
| --- | --- | --- |
| 完全统一，不保留 5.6/Sol/Astra 行为 | 用户已明确选择；删除源分代层并覆盖 category/carry-ahead | 漏残留会造成两端不同策略；以最终拼装和生成证明，不能只看文件名 |
| 安全在来源边界修复 | 最终 merge 后 provenance 丢失；用户 profile 正例必须保留 | 只修根层仍可绕过，全局过滤则破坏用户能力；两 pipeline/source matrix 防漏 |
| 不改变 profile winner / host 支持 | 现有 loader 有不同目录支持和选择规则 | 擅改会变公共配置语义；出现必须改变的设计需求升级，而非顺手修 |
| frozen 修复有条件 | 上游明确依赖 host 回读；嵌套 label 不能由浅 clone 自动解决 | 假绿可能执行旧 URL/agent；若 host 不支持则报告 blocker，不弱化 guard |
| 通用提示服从角色 | planner 与 category 权限并不相同 | 统一大段可能诱导越权或漏校准；role-first、只注入一次及 worker stop 合同验证 |
| runtime 能力不统一 | native max / effort 由型号识别和映射控制 | blanket 删除 GPT 型号检测会改变行为；保留能力源与原测试预期 |
| 保留未来 prompt 扩展口但不留现役专属逻辑 | 现有 variant / calibration 分层已足够 | 过度框架化增加维护成本；只保留轻量结构，不新 schema/API |
| 证据可复用但不能滥用 | 文件、依赖、环境变化决定有效性 | 变更后沿用 stale 证据会虚报完成；说明覆盖输入和未验证项即可，无 ledger/hash |
| 文本精简不是政策删减 | 重复内容可由 role/skill 权威层承载 | planner 默认、安全或所有权丢失即回归；对实际组合而非孤立句子验收 |
| 生成环境污染 | freshness 测试已有隔离模式 | 个人配置泄漏或生成 inventory 漂移；临时 CODEX_HOME、profile 控制、差异检查 |

等价实现与顺序调整可由执行者据证决定；改变范围/验收、安全或数据保证、公共 API/协议、权限、不可逆行为，或 host 契约只能猜测时，返回父 orchestrator 决策。无须为无实质影响的措辞修改反复审批。

## 7. 交接摘要

建议四个独立 owner：A 配置安全，B permissions 兼容验证/有条件修复，C 源 prompt 与维护说明，D GPT 拼装 TS 与 tests。C/D 先约定第 3 节接口再并行；生成物和共享 runtime 集成归父流程。

计划准备阶段未执行产品测试、host QA 或生成命令，因此不宣称任何实现验收已通过。已完成的是定向证据核对与本计划。下一步由父流程处理 plan-critic 并进入授权实现；此 planner 不派发任何代理。

## 8. 实施期间的有条件项裁定

波次 B 在当前 OpenCode `1.18.34` 上不落地 frozen args clone：对应官方 commit `aec0b9a6d8898f68f923aaf08b7306d931fd9d76` 的 `packages/opencode/src/session/tools.ts` 将 `{ args }` 交给 before hook，随后仍执行 `item.execute(args, ctx)`，不回读 replacement。复现确认冻结写入会失败，但只替换 `output.args` 无法保证实际工具参数改变；按原计划保留报错而不制造兼容假象。permissions 生产源码与基线测试均未修改，此项作为宿主阻塞报告，不宣称修复完成。

同轮复现发现 guard 读取 `rawInput.args` 与实际 before hook 参数入口存在缺口。它不是已交付的修复，也不因冻结项停下而隐去；本轮记录并在最终报告明确披露，不擅自扩大为新的 permissions/宿主协议改造。其余波次不依赖 frozen replacement，可继续汇合验证。

## 9. 追加波次 F：Codex 既有插件刷新与主 agent 配置（新增授权，已执行）

### 范围与前置状态

- 用户新增授权：安装本轮 Codex 插件时，将主 agent 提示词设为 ocmm 标准。本节仅就本插件安装/刷新及下述精确配置文件修改，覆盖第 1 节的安装排除和第 5 节“不修改真实用户配置”的限制；其他排除与安全约束仍有效。不改已完成产品源码，不新增产品安装器、配置抽象或其他工具，不执行 Git 写操作。
- 父流程交接：其他独立源码已完成，待合流验证；冻结 clone 仍按第 8 节 host gate 未落地，不因本波次安装而改称修复成功。
- 已有只读 worker 核对（本节沿用其证据，不重读敏感全文）：实际 `CODEX_HOME` 未设置；目标精确为 `C:\Users\hugefiver\.codex\config.toml`；顶层 `developer_instructions`、`model_instructions_file`、`instructions` 均不存在，且无 profiles。`deepwork-local` marketplace 已指向本仓库，`deepwork@deepwork-local` 已启用。执行前只对精确目标核验这些前提及是否发生并发修改；若不符，停止覆盖并交父流程裁定。
- 用户目录不得搜索、遍历或递归扫描；只允许对已知精确路径 Read。安装器明确返回的缓存/manifest 路径可作为定点核验入口，不能猜测路径后遍历。不要输出 config 全文、provider/认证值或将其复制进仓库、日志、证据报告。

### 依赖、同源指令与一次性写入

1. 父流程先完成 E 的合流、隔离配置下 `build:ts` / `gen:codex-plugin`、完整 typecheck/tests/build、隔离 OpenCode/Codex 真实 load 与聚焦 review；本节沿用仍覆盖最终输入的证据。真实用户安装只消费通过这些检查的 fresh 产物，不提前安装旧 bundle，不手改生成物。
2. 主入口仅新增**顶层 `developer_instructions` 字符串**，不设置/替换基础 `model_instructions_file`，不新增 `instructions` 或 profile，也不把主 agent 委托给一个只有“请读取 deepwork skill”的短引用。完整文本以同轮 `src/codex/plugin-generator.ts` 的 `buildCodexAgents()` 返回的 `sourceName === "orchestrator"` 的 `developerInstructions` 为标准；fresh `.codex/agents/dw-orchestrator.toml` 的 `developer_instructions` 是该文本的序列化载体（`tomlString` 使用换行归一化后的 `JSON.stringify`）。只提取这一字段，不搬入生成 profile 的 model、reasoning effort 等其他字段。
3. 使用现有可用 TOML 解析能力解析原配置、fresh agent TOML 与候选配置；不为此安装依赖。若从生成的单行字段提取 JSON 编码字符串，可按生成器编码合同解码，再用 TOML 解析/宿主校验验证最终文档，不拿字符串匹配冒充结构验证。文本与同源值比较时仅沿用生成器 CRLF→LF 归一化，不任意 trim/删段。
4. 优先在原文首个 table 之前插入该顶层字段，避免附在文件末尾而意外归属最后一个 table。保留原有正文、注释、字段层级与值；写前/写后均比较解析树，除新增顶层 `developer_instructions` 外必须结构相等。模型、provider、权限、认证、marketplace、启用状态和其他插件配置全部保持；已有插件无需另造配置项。若 CLI 意外改动这些设置，不作为“安装正常化”接受。
5. 在内存/受保护的临时材料中完成候选验证，写入前重读精确目标，若观测到其他写入则停止。用户配置更新使用专用文件编辑工具做上下文定位的字段插入，不用 shell 重定向或全文件重序列化覆盖；CLI 修改与主字段修改串行进行。告知用户执行期间不要同时编辑此配置。普通编辑工具不提供跨进程事务，因此这里只承诺检测已观测的冲突并保留备份，不宣称检查与写入原子化或所有并发竞态均能 fail-closed；若发现实际并发写者，停在真实修改前协调。不为理论竞态另造锁机制、产品安装器或长期维护脚本；后续源提示变化不会自动更新主指令，后续同步须另行授权。

### 既有安装刷新、备份与回滚

- 在任何可能修改真实用户状态的 plugin CLI 或 config 写入之前，为精确 `config.toml` 创建一次非覆盖、字节一致的私有备份，例如同目录 `config.toml.ocmm-before-2026-10-07.bak`；若名称已存在不得覆盖，选新的明确名称并记录路径。限制访问至少不弱于原文件，备份不进入仓库、普通临时日志或版本控制；仅报告备份位置与校验是否通过，不打印内容。备份不能安全创建/核验则停止写入，不把“已备份”当作未经证明的成功。
- 先在隔离 `CODEX_HOME` 重现“已登记 marketplace、已启用插件，再刷新”的路径。当前插件 CLI 支持 `add`、`list`、`marketplace upgrade`，**没有 `update` 子命令**。用现有 CLI 帮助及隔离实测确定 `marketplace upgrade` 是否只刷新索引、既有 `add` 是否真正刷新插件内容；不能把退出码 0、already installed 或 list 中存在名称视为已更新。不为绕过缓存擅自 remove/re-add、删除用户缓存、切换来源或安装其他工具；若支持的命令不能更新，报告阻塞并请求必要操作授权。
- 确认实际刷新会改动的本插件状态及可恢复方式后，再对真实用户安装执行一次经隔离证明有效的刷新路径，保留原 marketplace 指向与插件启用状态。若恢复需要旧插件实体/元数据，先对 CLI 给出的精确相关文件定点私有备份或证明既有版本可恢复；不得备份/遍历整个用户目录。无法限定副作用或不能恢复时停在安装前，不借配置备份声称插件也能回滚。
- 失败时区分配置与安装状态：恢复前重读精确配置，只有当前文件仍是本轮写入结果时才使用备份；观测到其他变化则停止覆盖并交用户处理。此检查也不是原子并发保证；实际存在并发写者时不自动恢复。插件仅用已验证的本插件恢复路径恢复，不删除其他插件/认证/用户目录。若只能恢复配置而不能恢复插件，明确报告部分回滚及残留，不宣称整体恢复。私有备份保留供用户回滚，不在交付时自动删除。
- 完成后要求关闭并重新启动 Codex/开启新会话，使插件与顶层主指令重新加载；现有会话不会因文件变化自动获得新 developer instructions。隔离探针用独立新进程，清理仅限本轮创建的进程与临时资源，不终止当前用户会话。

### 可验收证据与交付边界

| 结果 | 必要证据（仅保存脱敏结论） |
| --- | --- |
| 主指令完整且同源 | fresh 生成来源可追溯；解析后顶层值与同轮 orchestrator `developerInstructions` 归一化后一致；不是 skill 引用替代正文 |
| 配置结构与用户设置保留 | 写前候选、写后实际文件均成功解析；剔除新增字段后与备份解析树相等，原正文无非授权修改；三个旧入口前提及 profiles 状态不被偷偷改变 |
| 可回滚 | 私有非覆盖备份存在且字节一致；用隔离副本验证恢复后原配置可解析且内容相等；记录实际精确备份位置及插件恢复边界，不暴露敏感值 |
| 插件确实刷新 | 真实 `list` 仍显示目标启用及原 marketplace；由 CLI 确认的实际安装路径/实际 load 内容与 fresh bundle 对应（含通用 GPT 指令及 plugin-local MCP）；不能只核对仓库生成目录或版本号，不能只凭成功日志 |
| 主 agent 真实生效 | 隔离新 Codex 进程成功加载完整顶层指令及插件；真实用户配置由宿主接受，重启后的主 agent 加载证据能区分顶层指令与仅可调用的 `dw-orchestrator` 子 agent。使用宿主提供的有效配置/指令证据，不以模型自述“已遵循”作为唯一证明；未实际重启/无法观测时如实标记待验证 |

本节只追加安装与主配置交接，不重写旧波次或已完成源码。父流程最终报告分别列出生成/测试/live load/review、真实刷新、配置写入、重启生效的已证实结果和未验证项；安装配置不消除第 8 节的 host blocker，也不授权发布或 Git 操作。

## 10. 集成验收记录

后续追加授权：用户要求快速并入通用测试节奏与 GPT 默认迁移，然后发布并安装 `ocmm`。本次沿用已有方案，按明确快速请求跳过新的 planner/critic，开发只运行相关回归；提交与发布的最终验收仍满足仓库政策。新版本为 `0.6.25`，LSP pin 保持已发布的 `0.3.3`，不发布新的 LSP 版本。用户明确选择保留旧 5.5/5.4（含 mini）作为兼容后备；新首选采用 6/6.1，Terra 迁到 6.1 Sol 同思维级别，Sol 使用 high/xhigh，最高档采用 6 Astra。已有 Astra 不降级，未来仅依据实际 provider catalog 的较新 Astra 迁移，不合成未发布型号。显式用户覆盖语义保留，本仓库 Codex 构建配置按新增授权同步。

### 首轮通用特调与安装验收（0.6.24 构建）

- `build:ts`、隔离配置下 `gen:codex-plugin`、`typecheck` 和完整 `build` 已通过。生成 inventory 为 22 个 agent、16 个 skill、4 个 MCP；两套共 44 个 agent 生成文件仅改变 `developer_instructions`，没有模型或 effort 漂移。完整 TS 测试为 1866 passed、0 failed、1 个既有 skip，含 freshness、安全来源隔离和型号/参数回归；使用已安装 Python 3.13 的命令级 PATH，不安装依赖。此处是首轮记录，后续 0.6.25 模型迁移会有预期的模型及 effort 变化，不沿用本条作为迁移验收。
- 初次 `pnpm test` 的 Rust 段在仓库旧缓存 executable 上有 10 个 fixture 目录创建 `PermissionDenied`，因此该命令不记为退出成功。随后只在本轮临时 `CARGO_TARGET_DIR` 离线重新编译，`cargo test -p ocmm-lsp --features test-hooks --offline` 为 28 个单元、21 个集成测试全部通过；未改 Rust 源码、测试、旧 target 或系统防护，不推断旧缓存错误的具体根因。
- 隔离 OpenCode 新进程成功加载 orchestrator / planner / reviewer，分别解析 GPT-6 Sol、GPT-6 Astra、GPT-5.6，每个实际拼装结果恰含一份完整通用 GPT 校准和相应角色 envelope；配置、数据、状态、缓存路径均在本轮临时根目录。
- Codex 0.156.1 隔离实测证实本地插件采用安装缓存，`plugin list` 不刷新内容，同版本重复 `plugin add deepwork@deepwork-local --json` 可刷新。五个定点安装文件与 fresh 源字节相同；新 app-server 的 `skills/list(forceReload=true)` 指向实际安装缓存且启用、无 errors。`plugin/read` 返回源路径，不能单独作为运行时直接加载源的证据。
- 聚焦独立实现审查未发现阻塞缺陷；复用仍覆盖当前产品输入的测试、构建和加载证据，无无条件 final rerun。第 8 节冻结参数宿主阻塞和既有 guard 入口风险仍未修复。
- 波次 F 实际刷新缓存为 `C:\Users\hugefiver\.codex\plugins\cache\deepwork-local\deepwork\0.6.24`；六个定点文件（包括 orchestrator profile）与 fresh 生成源字节一致，原 marketplace 与启用状态保留。CLI 后根配置与原备份字节一致，没有额外 metadata 改动。
- 真实 `C:\Users\hugefiver\.codex\config.toml` 仅新增顶层 `developer_instructions`，解析值为完整同源 39,783 字符；去字段后解析树相等，去精确插入文本后原正文逐字节相同。私有备份 `C:\Users\hugefiver\.codex\config.toml.ocmm-backup-20261007` 为原 4,068 字节，Owner/ACL 与原文件相等，内存恢复对照通过。配置备份不能恢复旧插件缓存；本次未保留旧缓存实体，因此不能宣称满足整套安装的精确回滚，后续回退插件须另行授权并核验。
- 新启动的真实用户 Codex app-server 成功读取与 fresh 完全相同的根主指令，并在 `skills/list(forceReload=true)` 中加载上述缓存的 deepwork skill，enabled、错误数 0、stderr 0 字节。未保存原始用户配置或协议响应，未登录、发模型请求或启动 MCP；现有会话仍需重启/开启新会话，子 agent callable 可用性未因此证明。
- 本轮临时根目录 `C:\Users\hugefiver\AppData\Local\Temp\opencode\ocmm-sync-gpt-20261007` 经精确路径、非 reparse 与 journal 标记核验后删除，`Test-Path` 为 False；包括隔离配置、安装 fixture、协议探针、fresh Cargo target 和调试 journal。授权删除的项目 `output_test` 仍为 False，用户私有配置备份仍为 True；原用户 journal、六份历史计划及仓库旧 target 保留，未 commit、push 或发布。

## 11. 0.6.25 追加迁移与发布准备

用户追加授权通用测试节奏、GPT 6/6.1 默认模型迁移、本地 Codex 构建配置更新、完成后发版并安装。按明确快速流程请求跳过新一轮 planner/critic，沿用本计划的授权与安全边界；发布前聚焦实现审查和必要验收不跳过。

- 两端 default/GPT 通用提示规定开发期优先定向检查，全量套件仅在最终验收且范围、风险或仓库政策需要时使用；小改动只测相关部分，不能削弱失败或跳过必要检查。
- 旧 Terra 首选映射为已存在的 6.1 Sol，保留思维级别；旧 Sol high/xhigh 映射为 6.1 Sol 对应档位，最高 max 使用 6 Astra，已有 Astra 不降级。用户选择保留 5.5/5.4（含 mini）为兼容后备。更新 tracked `.codex/ocmm.jsonc` 的本轮构建配置，但不全球重写其他用户显式模型覆盖。
- 未来 Astra 仅按实际同 provider catalog 中已存在的更高版本、同 lane 升级，不合成未发布型号。Codex 离线构建不提供发布监测或后台自动修改配置；未来构建需要实际可用型号和相应配置/重生成。
- 审查发现并修正非 GPT 前置模型被越过、6.1 Sol direct effort 绕过、以及前置 entry/provider identity 丢失。真实 config/registry/chat handler 回归保留原角色 promotion、fallback 顺序、controls、显式覆盖和 review/critic floors；后备 Claude 与 Vertex-only 渠道都保留命中的完整 identity。最终限定复核未发现剩余缺陷。
- 最终 `typecheck`、`pnpm test` 通过：TS 1897 passed、0 failed、1 个既有 skip；Rust 28 单元加 21 集成全部通过。完整 build 的 native 证据仍有效，最后纯 TS 修正后重做 `build:ts` 与 `gen:codex-plugin`，22 个 agent、16 个 skill、4 个 MCP 的 freshness 检查通过。22 对生成 profile 的完整 TOML 对照仅有预期 model、effort、developer-instructions 变化，均只有一份通用 GPT 校准。
- 隔离 OpenCode 新进程实测 Sol 6.1 主角色、Astra 6 最高角色，以及 coding/前置后备 category 的实际模型注册；GPT 角色携带一份通用层和新增测试政策，非 GPT category 不误加 GPT 层。不将 category role-only 文本当成 default 通用层，也不以该探针声称远端模型 API 已接收参数。
- 主包版本 0.6.25、LSP pin 0.3.3；只发布主包，不发布 LSP。Git 发布只能在上述最终输入上定点提交、推送 master 与新 tag，完整发布以 `check:release-completion` 的 `COMPLETED` 回执为准。不得移动已发布 tag 或在发布阶段修产品。
- 发布完成后的真实 Codex 安装沿用已验证 `plugin add` 路径，更新本插件及完整同源主指令；先为当前配置创建新的私有非覆盖备份，保留原用户设置，核对实际缓存和新 app-server 加载。配置备份与插件缓存回退边界分别报告，不承诺现有会话热重载，不宣称子 profiles 已可调用。最终只清理本轮精确临时根 `ocmm-release-0625-20261007`，保留用户 journal、历史计划和私有备份。
