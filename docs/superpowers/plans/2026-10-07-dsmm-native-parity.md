# DSMM：DSH 0.2.0-rc.2 原生 API 与完整 OCMM 行为 parity 实施计划

日期：2026-10-07；D 增量修订：2026-10-08。状态：A `d8fbae7`、B `9a6768c`、C0 `9a87f07`、C `f97d0d4` 已提交。C 采用相关输入不变的组合验收，不称单次广泛组全绿；冷 LSP 在同字节 owned fixture 上通过，默认原入口环境限制未修复。D0 四项实现缺陷已由同 reviewer 有限复核闭合；最后相关组 142/142 与已核实未受影响广泛/独立检查组成必要验收，父已接受其适用范围，随本阶段实现提交，不称 post-fix 单次全绿。D/E 尚未实施。Desktop / Deepwork 模块增量已由新 plan-critic stage 复核，无新增计划 blocker。

## 1. 已授权结果与边界

在 `dsmm/` 完成适配，不做 MVP/phase-1 范围缩减：

- 固定用户已选的 **npm latest 基线 `0.2.0-rc.2`**，不是 alpha/main，也不是实施时再浮动解析 latest。官方 tag 为 `dsh-v0.2.0-rc.2`，对应 `639ed015397290b3745d163aafe02ffee4aa3f84`。
- 消除旧宿主 API 假设；普通非 Deepwork preset 不被注入 DSMM skills 全文。启用 Deepwork 时，普通 preset 与 DW role preset 都经宿主 skill registry 发现 metadata、按需 load 正文及资源，不保留全文注入 fallback。
- 同步现有 OCMM **11 基础 roles + 11 categories**、workflow/common/model-family 文本和适用专项 skills 的完整行为与资源树，转换为 DSH 可执行的工具/runtime 契约。纯复制文字或只补角色名称不是 parity。
- 补齐 native subagent 实际启动、路由、续接、后台、取消、权限、深度、清理和 profile admission 行为；延续已有 runtime，不另建 scheduler/retry 状态机。
- 在宿主插件管理中选中 DSMM 后的原生 **Config 设置入口** 提供真实 feature controls；保存、effective state、scope、restart/idle/live 生命周期一致。保留现有 Profiles/header selector，不用它们冒充插件页。
- 用户m0488/m0490追加：主配置集中到官方home resolver锚定的DSMM自有 `<DSH_HOME>/plugins/dsmm/config.json`，DSH profile只存显式覆盖并优先于global；named runtime profiles新默认也集中，legacy只读兼容，不实际迁移私人文件。`plugins/dsmm`是本插件约定，不能宣传为DSH官方规定目录。具体层级/安全合同见§3.3，C0是D前置。
- 用户 m0660 新增及随后官方证据澄清：**主目标是官方 DSH Desktop 与 Web 共享的原生 Plugins 页面**，其中 DSMM 页面可配置全局设置、启用/停用子插件；社区 Desktop 的 `settings.plugins.tab` 只是兼容参考，不能替代官方入口。Deepwork 是有独立身份、配置和真实 consumer gate 的模块，允许安装并加载 DSMM 核心而不启用 DW。未来子插件沿相同静态模块机制扩展，不要求现在实现未知模块。宿主管理 DSMM 整包的 installed/enabled/loaded 与 DSMM 内 Deepwork 开关是不同层，不能相互冒充。当前 rc.2 Web 原生 Config ledger 验收保留；官方最新 Desktop 源码兼容与实际 Desktop 运行证据分开记录，必要 UI 实现不因缺 Desktop binary 降为可选。
- role/category 更原生委派的研究结论按用户 fallback 执行：rc.2 现有公共工具配置不提供 role/category 参数；本次保留已接线的 per-role tools、native providers、continuable/policy/output 契约，不将自造聚合 dispatch、公开 tool ABI 重构或 worker bus 拉入 D。
- 对照 OCMM 的 routing/recovery/guards/LSP/profile 行为补齐 DSH 适用缺口；可记录原生等价或有证据的不适用项，不能用空开关、仅 prompt 声明或虚构 host 能力代替实现。
- 按用户追加要求清理 DSMM 项目代码，避免过度设计和无意义的冗余测试。清理随各阶段 ownership 合入，最终检查遗漏；不另造清理框架，不按行数机械拆模块，不为满足数量配额添加 helper、接口、测试或审查轮次。已证明的原生能力替代失效兼容层，行为保留的清理由现有通过的相关检查保护。
- 用户要求每个完成阶段 commit。**仅父执行流程负责 Git 写操作**；本 plan 随第一实现 commit，不能先提交纯 spec。未授权 push/tag/release、全局或私人插件安装、软件/依赖安装、真实用户 profile/auth 迁移。

本 planner 只写本文件，不改产品、测试、配置或其它文档，不派 workflow/实现/审查代理，不执行 Git 写。当前 callable 规划 profile 只有 normal planner，文件存在或生成 profile 不代表 callable；critic 的选择与 dispatch 属于 orchestrator。

实施环境为 Windows / PowerShell。使用已有 Node/pnpm/DSH/Playwright CLI/docker/uv，不触发 package-manager bootstrap、`npx` 下载、浏览器下载、Docker 内隐式安装或 `pnpm install`。需要新依赖/软件才能继续时报告具体缺口并请求授权，不能暗中降低验收。

## 2. 基线、证据与需保护的文件

### 2.1 源基线

调用方提供：HEAD `89ca14b`，OCMM `0.6.25` 已发布，tracked clean。本次精读确认根 `package.json` 为 `0.6.25`，`dsmm/package.json` 为 `0.1.9`，DSH peer/dev SDK 多数已精确固定 `0.2.0-rc.2`，无需升级到 alpha 或安装新 host。

规划时 `git status --short` 仅列出以下原有 untracked；不修改、删除、stage：

- `.debug-journal.md`（调用方所称原用户 debug journal）。
- `docs/superpowers/plans/2026-10-04-system-dsh-configuration.md`
- `docs/superpowers/plans/2026-10-05-dsmm012-global-rollout.md`
- `docs/superpowers/plans/2026-10-05-dsmm016-published-continuation.md`
- `docs/superpowers/plans/2026-10-05-dsmm017-menu-release.md`
- `docs/superpowers/plans/2026-10-05-ocmm-explicit-reasoning-only.md`
- `docs/superpowers/plans/2026-10-06-dsmm-session-mode-menu.md`

若实际出现另一个 `user.debug-journal.md`，同样视为用户资产，不能以名称差异为理由处理它。实施开始和每次 stage 前重新读取 status，只 stage 阶段白名单，不使用 `git add .`。

### 2.2 已有代码事实（复用第一轮 discovery，不重做全库探索）

| 边界 | 当前路径/事实 | 实施含义 |
| --- | --- | --- |
| 生命周期 | `dsmm/src/index.ts` 的 `applyRuntime` 连接 settings、prompt/commands、providers/presets、profiles RPC、recovery/routing/headless tools/guards | 在此统一接入，不增第二套启动器 |
| prompt/activation | `src/mode.ts:29-40` 读 structural `context.agent`，普通 active preset 调 `renderBundledSkillPrompt`；`!active && role` 仍注入 workflow | 真实 SDK callback/context 和关闭语义都要修；不是只删字符串 |
| skills | `src/skills.ts` 七 core + on-demand debugging；`registerBundledSkills` 逐个 `register` 且未管理 disposer；`preset-skills.ts` 仅 role 入口 | 所有 active scopes 走统一 lazy provider，普通 preset 也覆盖 |
| roles | `src/roles.ts` 12 个简短 persona；builder/orchestrator 都挂全部 aux tools；planner 当前全只读 | 扩充完整 catalog，并修 delegation graph 与 plan-artifact 能力，不给 planner 通用写权限 |
| native runtime | `role-providers.ts`、`role-subagents.ts`、`role-routing.ts`、`preset-registry.ts` 已有 native/provider/headless 接线 | 补缺口、验证实际执行，不重建 subagent 服务 |
| settings | `settings.ts`、`dsh-types.ts` 尚有旧 structural/`SettingsRegistry.register` contract；roles/skills 属 deployment 构造 | 不把旧测试 fake 当宿主支持；Config 与 runtime overlay 分层 |
| client | `src/client/index.ts` 注册 `settings.section` 和 `conversation.header.leading`；已有 ProfilesSection/SessionProfiles/StructuredEditor | 插件 Config 页是新增原生入口，不是新 SPA，不替换主模型 picker |
| profiles | `docs/settings-status.md` / `docs/profiles.md` 描述 immutable revision、admission、CAS/epoch；runtime overlay 有明确 allowlist | 必须保留既有数据与并发保证，不把 deployment 结构热塞给运行中 Agent |
| tests | `test/native-runtime-contract.test.ts` 有真实 Cordis/SystemPrompt/ToolRuntime，但部分 driverless Agent 和旧 context/role-off 断言 | 更新真实边界测试；不能只让相同错误假设的 fake 互相通过 |
| QA 脚本 | `scripts/live-dsh-smoke.mjs` 会 `plugin add`、可复制凭据，并硬编码旧包版本；`live-dsh-probe.mjs` 仍读旧 prompt context | 不直接跑这条旧 live 路径；提取无凭据探针并改成受控加载 |
| UI 脚本 | `profile-ui-acceptance.mjs` 有隔离 DSH_HOME/storage、owner cleanup；`profile-ui-harness-browser.mjs` 主要挂 Profiles section | 复用安全边界，但这不是完整插件管理 Config 入口证据 |

### 2.3 权威 DSH 契约

沿用已完成 external discovery；实施中只补读精确接口/导出。来源固定：

- `https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.0-rc.2/docs/subsystems` 下 `skills.md`、`settings.md`、`subagent.md`。
- 同 tag 的 `packages/skill/{skill,tool-skill,skill-filesystem}`、`packages/client/{ui-settings,ui-settings-plugins}`、`packages/subagent/{subagent,tool-subagent}` README 与 types。
- 本机已核验 skill 声明：`C:\Users\hugefiver\scoop\persist\pnpm\global\v11\5418-18dc2f2e031d0024-0\node_modules\.pnpm\@deepseek-ai+dsh-skill@0.2._6b20c032b48fd4a219cc83ccc4a6364a\node_modules\@deepseek-ai\dsh-skill\lib\types\index.d.ts`。允许精确 Read/由现有 package resolution 得到精确路径，不在项目外 Glob/Grep。

已证约束：skill `registerProvider(factory)` 的 controller 有 `signal`/`invalidate`；register 在 calling context scoped layer，`SkillViewOptions.scope` 是 `ScopeKey`，lookup 支持 `cwd/signal`；metadata catalog 与正文 `get` 分离，原生 project precedence 必须保持，disposer/fiber 卸载负责撤销。Settings 使用 entry ID/revision 的 `describe/update/replace/mutate`、完整 Config 校验、active profile Cordis patch 持久化和 Loader 应用。Client `configForms.get(entryId)` / `whileServed(namespaces, register)` 管理生命周期；`settings.plugins.tab` 属 Builtin plugins 设置区，不能据此声称插件管理页面已经接入。

Native subagent `StartRequest` 支持 prompt/parent/signal，以及 capability 约束下的 agentOptions/outputSchema/maxDepth/toolFilter/persona；未证明通用 timeout 字段，取消以 signal 为准。native 默认 maxDepth=1、maxActiveSubagents=8；不是 OCMM 深度数值直接搬运。toolFilter 既隐藏也阻执行，未知工具明确拒绝；同 scope 再注册工具不能绕过 inherited restriction。

## 3. 跨阶段接口与安全决策

阶段 A 先固定以下小型共享契约，再分配后续文件 ownership。名称可以按本地习惯调整；行为与权限不能漂移。

### 3.1 单一 role/category/skill inventory

- 来源：`src/data/agents.ts` 的 `BUILTIN_AGENTS`、`src/data/categories.ts` 的 `BUILTIN_CATEGORIES`，而非把 `src/config/schema.ts` 所有可配置枚举都当默认 roles。
- 11 基础 roles：`orchestrator`, `builder`, `reviewer`, `oracle`, `oracle-2nd`, `doc-search`, `code-search`, `planner`, `clarifier`, `plan-critic`, `media-reader`。
- 11 categories：`frontend`, `creative`, `hard-reasoning`, `research`, `quick`, `coding`, `normal-task`, `complex`, `deep`, `documenting`, `cross-cutting`；`cross-cutting` 保持 opt-in。保留已有 `dsmm-creative` 身份，不创建第二个重名 category。
- 对每项记录 canonical/source ID、稳定 DSMM ID、role/category 类型、prompt source/adapter、默认 enabled、root exposure、child dispatch policy、tool capabilities、routing policy。Schema、status、UI、preset YAML、native providers 与 tests 从同一 inventory 派生或有一致性检查。
- `primary/all/subagent` 的 root 可见性与 delegation 可用性分别表达；不能简单以 `primary` 禁止 builder 作为被授权 worker，也不能把所有 category 都放进 root picker。按当前 OCMM mode 映射并记录 DSH 等价，不改成一律开放。
- Oracle 后续 slot/逻辑 variants、planning/review tiers 按当前源配置规则适配：默认清单仍是上述 11+11，仅明确配置时增加 supported profile，保留 canonical prompt/权限/effort floor。文件、role label 或配置存在不构成 callable/model availability 证明；未配置异构模型不能称 external independent。
- skill inventory 明确 deployment enable、model/user invocation、resourceBase、source/adaptation/排除理由；所有可用专项 skills 同样有配置与 registry 覆盖，不能留一个永远绕过开关的 debugging 列表。

### 3.2 Deepwork activation / skill visibility

区分 **DSMM 核心 / Deepwork 模块可用上限**、**role persona/固有权限**、**Deepwork common workflow**、**DSMM bundled skill visibility**。以下既有 A 场景表适用于 Deepwork 模块在本 Agent admission 中有效可用；m0660 新增模块上限见表后合同，不改判 A 的历史验收。

| 场景 | Persona | Common workflow / DSMM registry |
| --- | --- | --- |
| 普通 preset，无 active mode | 宿主原有 | 不注入、不公布 DSMM skills；不影响宿主/project 自有 skills |
| 普通 preset，显式启用或有效默认启用 | 宿主原有 | common workflow + metadata catalog，正文只在 load 时读取 |
| DW role preset，无显式 mode 选择 | role persona/权限 | 为兼容 role 使用意图，默认 active；仍只 metadata/lazy load |
| 任意 preset，显式 off | role persona 若存在仍保留 | explicit off 优先，不再以 `isDsmmRoleId` 强制 common workflow/skills |

这把当前 role 的“锁定 enabled”UI 改为可表达显式关闭 common 的状态，不把关闭解释为卸掉 read-only/Git/host approval 边界。已有 `deepwork/mode` intent 持久化、跨 profile/reopen 优先级继续保留。mode/profile 改变只在现有 idle/CAS 边界接受；busy 时拒绝或清楚显示待应用，不能改写正在执行的 prompt/tool realm。

#### D0 新增：Deepwork 真模块与 global-only 上限

- **最小形态**：在现有 `applyRuntime` 中明确拆开 core 安装与静态 `deepwork` 模块安装分支；使用小型已知 module descriptor（稳定 ID、label、配置字段、安装/状态边界）即可，不要求新 Cordis row、动态 registry、worker bus、第三方安装/脚本接口。当前只有 `deepwork`；unknown module ID/字段拒绝而非执行或默默启用。安装包中的源码/资源仍可存在，off 不删除 preset 文件、session 数据或用户配置。
- **持久配置**：新增 `modules.deepwork.enabled`，只允许写 §3.3 的唯一 global `config.json`；缺省为 `true`，unset 恢复该默认，ordinary `defaultActive:false` 不变。这是兼容现有显式 DW preset 使用意图的 availability 默认，不是默认开启 ordinary session。全新 install-only fixture 显式配置 `false`，证明 DSMM core 仍可加载和设置。不能只改 `defaultActive`、label 或隐藏菜单来实现模块关闭。
- **层边界**：这个新增模块字段是 global-only 上限，不是把所有旧 global 业务字段改为不可覆盖 pin。native profile transport、旧 flat profile Config 和 named/session overlay 不得写此字段，精确拒绝其显式输入；旧字段仍按原 global → explicit profile → allowed immutable overlay 规则合并。global/raw transport/resolved settings 验证应区分输入层，不能让内部 captured 模块值反向变成可写 profile 字段。globalOn 内既有 role/skill、profile、mode、权限策略继续收窄；任一 profile override、session on、standing role preset 或 alias direct call 都不能提升 admitted moduleOff。
- **core 留存**：配置 read/save/status、C0 storage/capture/CAS、必要 native admission 与权限保护不依赖 DW 安装。`dsmmConfig` 服务当前随 `registerProfilesRpc` 接在 profile runtime 后，D0 必须使 DW-off/core-loaded 冷启动下仍能经原 authority 访问它，不复制第二后端；Profiles 资源管理与真实 module activation 分开，管理配置不偷偷启动 DW。既有显式 host sessionPersistence 绑定不是 DW 开关的新配置范围。
- **冷启动 off**：不注册 DSMM 的 DW persona/common/workflow skill provider、role providers/tools、standing presets/materialization，以及仅为 DW 安装的 routing/recovery/LSP 或 subagent control 活动；宿主自身的 skills/tools/LSP/subagent 服务不撤下。必要只读/Git/host 安全拒绝留在 core 或独立保护接点，不能通过 off 卸掉保护，也不把所有普通 host 行为新升级为 DW。只读 role identity/继承 filter 一旦已捕获仍不可丢弃，不能先清 role 再失去其限制。
- **捕获而非热卸载**：startup 捕获是否挂载 DW；新 ordinary root 捕获最新合法 global module desired，并与 startup 实际模块 substrate 取交集。startupOn 后保存 off：旧 root 及其未来 child 保持原 admission/mode/epoch，新的 off admission 不得执行 DW。standing picker 可保留 startup inventory，但 off-admitted root 选择旧 DW preset/alias 必须在有用模型/工具执行前明确拒绝，不得悄悄注入 persona/workflow 后假报关闭；不要求动态撤销全局 preset。startupOff 后保存 on：只保存 desired，缺 substrate 的新 root 仍 off 且显示 restart-required；用户独立显式 restart 后才能接纳。旧 root 的 mode/profile CAS 不吸收新的 module desired；恢复 on 也不自动重绑旧 root。
- **可观察状态**：分别投影 master desired（global/default 来源）、startup mounted、目标 root admitted、模块阻断原因和 pending。session 的 on intent 不等于 module effective，off admission 中的 on 请求明确拒绝/解释而非回报 active；已有 on-intent 数据不删除。保存不 cancel、reload、partial-dispose、启动进程或新增 queue；用户独立 host restart 的会话取消语义照实说明。DSMM 整包被 host disabled 时自身 UI/backend 可以消失，不承诺由已卸载插件自行保存或重新启用自己。

DSMM provider 注册在每个 **Agent 的 scoped layer**，不能把 session 私有 enable/mode 放进共享 preset/global provider。rc.2 的 precedence 是 **layer-before-rank**：最近 scope 的同名 candidate 直接覆盖祖先；`BUNDLED_SKILL_RANK = 600` 只参与同层排序，不能保证 ancestor preset/global 的 project skill 胜过 Agent 层 DSMM。保留项目覆盖必须显式避让，不能仅配置 rank。

采用以下有公开 API 依据的 metadata-only 避让方案：

1. 在实际 Agent-scoped context 注册并取得 `scopeOf(ctx)` 的 `ScopeKey`，确认它是此次 Agent 的注册身份而非共享 standing-preset key；未取得正确 scope 时拒绝注册，不退回 global。每次 discovery 通过 `scopeParentOf(agentScope)` 取祖先 view，调用同一 registry 的 `snapshot({ scope: ancestorScope, cwd, signal })`；无 parent 时省略 scope，只读 global。不猜 `parentScope` 字段，不自行 rebind 宿主 ancestry。rc.2 `dsh-scope/lib/types/index.d.ts:43-55,78-84` 明确导出这些 API，`lib/index.js:268-279` 实现 parent/chain 查询；`dsh-skill/lib/types/index.d.ts:214-221,266-284` 与 `lib/index.js:298-305` 证明祖先 view 排除当前层且按层覆盖。真实 Loader 中 Agent context 身份及 blank-preset rebind 由阶段 A fixture 断言，不能仅凭 fake ctx。
2. provider `list` 仅查询祖先 **snapshot metadata**，不能在自己的 Agent view 调 `list/snapshot/get`，不能读正文；scope 严格向祖先移动，因此不递归自身。使用本次 lookup 的 cwd/caller signal，并联动 registration signal。祖先完整 snapshot 中已有的非 DSMM winning name，Agent DSMM 不提供同名 candidate，让原生原有 winner 及其 invocation policy/resourceBase 保持不变。这不仅保留 project winner，也保留原本可见的其它非 DSMM winner：公开 `SkillSummary` 没有 rank，不能从 source 名或猜测 rank 再造跨层排序。其余 bundled candidates 仍用 rank 600 参与 Agent 同层排序；不复制祖先条目或正文到 Agent 层。
3. 祖先 `complete:false`/provider异常造成的不完整 observation **不等于同名不存在**：本次 DSMM 返回 `{ candidates: [], complete: false }`，不缓存、不发布可能遮住暂时缺席项目 skill 的 bundled candidate；下一请求边界重查，不能永久负缓存。caller/registration abort 立即停止，不用旧 snapshot 当成功。rc.2 `snapshot` 有 `complete`、provider list 接受 `SkillProviderObservation`，因此不需臆造查询接口。
4. 不另缓存祖先结果。原生 `skills/change`/registry revision 已清理全部 collection cache（`dsh-skill/lib/index.js:265-310,376-408`），祖先 provider add/remove/invalidate 后下次 discovery 自然重算。若订阅 `skills/change` 以使本地 in-flight generation 失效，只丢弃本地观察，不反射调用 `control.invalidate()` 造成通知循环；本地 mode/settings 改变才调用自己的 invalidate。每次 lookup 重读 parent，切 preset/blank-session rebind 撤销旧 scope/provider，不保留旧祖先视图。DSMM `get` 读取正文前再次核验祖先完整 snapshot、当前 generation/signal；若新祖先 winner 已出现或观察不完整，拒绝交付旧 bundled body，并使自身旧候选失效、由后续 native lookup 重新选胜者，不在 provider 内递归 `get`。正文读取完成后也做 generation/abort 检查。

有效 mode/settings 改变 invalidate，scope dispose/切 preset 撤销旧 provider；loader 缺失/不可用应明确诊断或按能力拒绝，不能静默全文 fallback。关闭 DSMM 只撤下 DSMM provider，不移除原生 project provider。需要保留的项目覆盖是上述避让逻辑加原生查询的效果，不是 rank 的跨层能力。

### 3.3 Settings / effective state

#### 已证 rc.2 边界与本次修订范围

固定 SHA `639ed015397290b3745d163aafe02ffee4aa3f84` 的 `packages/settings/settings/src/schema.ts` 中 `volatileForm` 只投影 volatile nodes，`isVolatilePath` 限制写路径；`src/index.ts:303-409` 的 descriptor 为 `applies: 'live'`，write 校验完整 Config 后持久化。`docs/subsystems/settings.md` 明确业务消费者读 Config reference 的 `.get()`；`packages/settings/settings/README.md` 明确 `autoGenerate` 不等于已提供自动页面。`vendor/loader/src/config/entry.ts:115-190` 只有 active fiber、上下文不变、仅 config 的 volatile 差异才原位更新 refs；否则可 partial-dispose/reapply，**无 busy Agent 安全保证、无 requiresRestart/queued-idle 设置协议**。

因此本接口以 **分层保存 desired，DSMM 按捕获边界使用 effective 快照** 实现完整控制范围，而非要求 native form 保存非 volatile 字段或替 DSMM 排队重启。用户 m0488/m0490 新增集中配置要求：中央global base与DSH profile override分开，覆盖本计划此前“所有desired只持久于nativeConfig、不得新增配置文件”的裁定。global base是下述唯一中央文件，不是复制一份native完整Config；nativeConfig只承担显式profile override。公开 `.volatile()`/`.get()` 和既有 immutable admission仍用于profile transport与消费边界；`profile-runtime.ts` 当前固定baseline必须在C0/C补齐，不能声称改目录或标volatile后自然成立。

这是C0/C/D的有限存储与消费接口修订，**不改已提交A（`d8fbae7`）、B的22-role/14-skill完整source范围或 §3.4 delegation矩阵**。B现有158 source/47 preset/118 vendor结果及四项review闭合、跨host验收限制按§8原记录保留，不由此次规划改判。普通实施选择由父按证据裁定，不重复问用户；禁止Root OCMM写、软件安装、私人文件实际迁移、push/release不变。下面新增C0是实施阶段，不单独提交spec；定制页面依赖该真实存储接口，不能推迟到E收尾。

#### 集中目录、层合并与可信写入口（新增授权的最小合同）

**路径与SDK事实。** 官方rc.2 `@deepseek-ai/dsh-home-paths` 的公开 `resolveDshHome(configured?, env?)` 顺序为显式host配置 > `DSH_HOME` > `~/.dsh`；`dshHomePath(...segments)`可供插件组成数据路径，但**没有官方plugin-keyed global store或官方规定的插件子目录**。本任务采用父已裁定的DSMM约定 `<resolvedDshHome>/plugins/dsmm/`，文档不得称它是官方强制/推荐的精确目录；官方依据只到home resolver。home `cordis.patch.yml`优先级高于profile，legacy `settings.yaml`会被宿主迁入profile，不把二者、installed profile/package目录或`node_modules`当global base。

- 解析home使用公开SDK，不手拼`os.homedir()`替代优先级。已在本次只读probe确认：从 `dsmm/package.json` 直接resolve `@deepseek-ai/dsh-home-paths`为`MODULE_NOT_FOUND`，从已装 `dsh-agent-preset-registry` / `dsh-skill-filesystem` 均可解析；但manifest进一步证明 **`dsh-skill-filesystem@0.2.0-rc.2`明确peer依赖 `dsh-home-paths@0.2.0-rc.2`，preset-registry没有这项直接声明**。因此选已由DSMM声明的filesystem peer为锚，复用 `src/native-scope.ts:11-15` 的resolver模式而非其具体anchor：`createRequire(import.meta.url)` → `require.resolve('@deepseek-ai/dsh-skill-filesystem')` → peer-rooted `createRequire` → **公开**home-paths导出。home-paths manifest也确认rc.2及公开根导出；窄adapter核验函数，缺失明确失败，不回退开发机全局SDK路径。分发态继续验证同一peer解析，不能把preset-registry偶然可resolve当依赖契约；此路径不需新安装。若后续改直接runtime import，须同步正确peer/dependency声明并证明无安装环境可解析，不能仅靠devDependency或类型通过。
- 有可信host显式home时交 `resolveDshHome`；仅支持当前可证的host/env来源，不新增LLM/RPC任意root参数。普通profile.dir只用于识别DSH profile，不反推home。测试注入的home必须是trusted fixture seam；所有测试同时隔离 `DSH_HOME`/`DSH_AGENTS_HOME`，不触碰真实用户home。

| 存储/身份 | 新默认位置与用途 | 非用途/边界 |
| --- | --- | --- |
| global deployment base | `<root>/config.json`，一个UTF-8 JSON对象，采用稀疏DSMM配置字段，缺文件视为空覆盖 | 不含defaults展开副本、DSH profile overrides、named-profile选择/session状态，不是nativeSettings全局库 |
| DSH profile overrides | native active-profile Cordis patch中**actual DSMM entry ID**对应的稀疏Config | 只存显式覆盖；不同DSH profiles互不改写，不能保存合并后的全量global值 |
| DSMM named runtime profiles | 新默认 `<root>/profiles/` 下原格式 `.jsonc` drafts与immutable revisions | 是现有ProfileStore的集中默认根，不是DSH host profiles；不是第二份deployment DB |
| named-profile选择/session sidecars | 集中在 `<root>/profiles/.state/<host-profile-entry-key>/`，沿用 `.selection.json` / `.sessions`记录格式及CAS语义 | 按可信canonical host profile identity + actual entry ID命名空间隔离；profileA的选择不得变成profileB的全局选择，不能只按sessionId混放 |
| 宿主会话日志/credentials | 现有native sessionPersistence/auth目录 | 不移动进插件配置根、不并入config.json、不借集中配置修改其权限 |

`<root>`即上述DSMM plugin root。host-profile-entry-key由后端可信profile identity（现有精确profile.dir经原安全路径验证）与actualentry身份生成不泄露路径的稳定键；不接受客户端/模型指定，不使用易碰撞display name。集中的是物理位置与named配置内容，**不是把不同DSH profile的selection/admission作用域合并**。现有 `global-default` admission标签仍指该runtime的named-profile默认选择，UI与代码注释不得混淆它和`globalDeployment`。

**合并与explicit来源。** 顺序固定为 `built-in defaults → globalDeployment(config.json) → explicit DSH entry/profile override → 已选择的immutable DSMM named-profile/session overlay`；最后一层仍只允许既有runtime字段，roles/skills不借此进入profile allowlist。实现本地小型纯数据merge，不import官方私有 `mergeLayers`：plain objects逐键递归；arrays整项替换；missing保留下层；`false/0/""/[]`按字段校验后是明确值，不用truthiness；`null`只在字段schema明确允许时有效。空object不清除继承子键；unset删除**当前层**的键而不是写`undefined/null`或删除下层；profile unset恢复global，global unset恢复defaults，profile显式值等于default也必须覆盖global。拒绝unknown keys、危险prototype键、非JSON值/循环/原始Volatile refs，数组内容依原schema验证；full merged desired在发布/admission前再次验证。

- **禁止用已填defaults的Config作为explicit override。** 首选保持旧flat字段ABI，但把host transport schema与最终resolved schema分开：transport受控字段及嵌套节点为真正稀疏optional，不填业务defaults；仅必要volatile容器允许空对象默认，最终业务defaults只在merge底层应用。旧flat raw调用方Config继续当legacy profile overlay，显式字段不会因等于默认值丢失。`dsmm/cordis.patch.yml`自带row改为不重复写业务默认，以免包内示例值永久盖住global；已有用户明确写的flat值保留为覆盖，不自动unset。
- rc.2 Loader公开 `Entry.options.config` 是schema解析前的row配置，`Entry.id`是实际身份；已读 `vendor/loader/src/config/entry.ts` 的导出类与 `ctx.fiber.entry`使用。通过owning fiber的公开entry取得**只读**raw presence并与nativeparsed `.get()`普通值关联，可辅助legacy adapter；不写 `_config`、不读私有layer/diff实现、不扫描磁盘profiles。nativeSettings descriptor的`base/user/value`可辅助UI来源区分，不能把`value`或schema默认都称为显式profile输入。native拼装row可能含bundle/home/CLI覆盖：移除本包新默认的冗余值；剩余host更高层显式pin按host真实边界标明，不能谎称profile unset能消除它。没有可证raw provenance或遇整段`!!js`而不能证明字段presence时，拒绝该编辑/标明host-owned配置，不能从值反推显式性，也不能eval自己复制的表达式。
- 若某字段无法维持上述稀疏transport，可用同一entry内显式稀疏`overrides`子树作为有证等价接口；必须保留legacy flatadapter并明确同一键双输入冲突拒绝，不能把旧值悄悄丢弃或叠两套defaults。这不是默认再造格式/迁移工程；首选flat稀疏方案，C0用真实Loader证明遗漏字段不遮盖global后定案。

**Global file最小写合同。** 仅可信插件后端管理固定`config.json`，提供read/describe与受控path set/unset、expected global revision的CAS；revision由实际文件bytes计算（缺文件有独立absent值），不在文件中另存一套revision DB。沿用ProfileStore已有bounded-read、no-follow/regular-file/root-identity检查、exclusive lock、同目录temp+atomic rename、rename前重读revision的安全方法，按职责复用必要文件原语，不建通用存储框架。读取不创建目录/锁/config，只有明确save才创建本插件所需路径；写前合并本次exact edits与最新文件，保留未触碰字段，拒绝stale revision，不保存runtime/defaults展开值。两插件host进程的合作写者由同一global锁串行；任意外部编辑须在读/save/new-admission边界重新读取，不能只靠watch通知；watch若存在仅失效内存观察。invalid JSON/schema/unknownkeys/unsafe路径不能当空文件覆盖，保留旧Agent有效快照，但拒绝新admission/写入直至恢复合法，UI明确错误。

Global save不触碰任何DSH profile patch，不调用nativeLoader reload/apply/dispose；profile override save只走nativeConfig transport且不写global。两层没有跨文件原子事务，不同时“一键保存”二者后假称原子成功；状态带global revision与native entry revision两项，采集过程中变化则重新采集或报stale，不混成伪快照。非合作外部编辑在最终recheck到rename间仍有文件系统竞态，不宣称跨所有编辑器线性化CAS；保留现有拒绝/无删除兜底与如实风险说明。

Global写入口使用已有authenticated/authorized native client/backend通道和与设置相同的trusted-host权限约束，不暴露为model tool、skill调用或任意文件编辑RPC；客户端不能提交root、目标路径、entry他人身份或store选择。固定字段grammar/schema与服务端权限检查是硬边界，不靠UI隐藏；只有nativeFS工具已有policy能允许的文件访问仍由host判断，本功能不为模型授予global配置目录的read/write豁免。globalConfig不储存凭据，状态/错误脱敏；非可信remote/无写权限会话不因能读UI就能写global。

#### D 新增：官方 Desktop / Web 共享 Plugins 主目标与 authority

- **三类证据分层**：父的官方 doc-search 已完成，确认 `deepseek-ai/deepseek-harness` 的 `dsh-v0.2.1-alpha.1` / SHA `5badb15009ae1756c3afe0ae0cef1faafc290ccc`（2026-10-03）包含官方 `apps/desktop`，其 package 与 root 版本相同；对应 release 无 assets，故这里只证明官方 latest Desktop **源码身份/版本**，不宣称存在该版本安装包或本机已安装。用户已选的当前 npm latest CLI/SDK 基线仍是 rc.2 / `639ed015397290b3745d163aafe02ffee4aa3f84`，不得为 Desktop 静默升 SDK/peer 或安装。验收分别标记 official-latest-Desktop source compatibility、current-rc.2 public UI actual-native、community Desktop v0.11.0 reference；源码兼容不能冒充任一未运行的载体。
- **官方 sharedWebHost 与 client**：固定 SHA 的 [host-process.ts](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/apps/desktop/src/host-process.ts) 与 [web-document.ts](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/apps/desktop/src/web-document.ts) 证明官方 Desktop owns `sharedWebHost`，使用 Host 303/auth-cookie 流程，仅为 `dsh-app://app` Origin 代转请求，核心插件页复用 Web。未发现独立 desktop client platform；沿实际 manifest/client discovery 核验既有 `dsh.client.platform: web` / `exports['./client']`，不臆造 `desktop` enum、不改 Electron shell。官方 `@deepseek-ai/dsh-sdk-client@0.2.1-alpha.1` 源码是启动 `dsh --profile sdk` 子进程的 stdio turn SDK，**不是 Desktop UI API**；本功能不依赖它，缺这个包不能推断 Desktop 没有 UI 扩展能力。
- **新增页面的主契约**：固定 SHA 的 [slot-contract.ts](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-plugin-manager/src/client/slot-contract.ts) 与 [index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-plugin-manager/src/client/index.ts) 公开 `plugins.item`（原生卡片、独立page、summary/page/order）、`plugins.bundle.config`、`plugins.row.config`（`package#rowId`）。`PluginConfigViewProps` 的 view/form 可选，`ConfigPageForm` 提供 Host snapshot + mutate；不能假设所有 bundle 页自动带 form。D 在这些官方 shared Plugins contracts 内提供 DSMM global/module controls 页面，复用当前 rc.2 已证 ledger/actual entry 映射，并精确比对新增源码契约与 rc.2 可用接口。不存在独立 Deepwork-toggle slot；子模块开关是 DSMM 页自己的 domain control，绝不凭空新增宿主槽或拿 community tab 代替。
- **宿主整包控制不是 module master**：官方 bundle/row 的整体开关由宿主写 `dsh.profile.bundles` 或 `cordis.patch.disabled`，非 HMR、待显式 restart；不镜像到 DSMM global、不由保存 DSMM 设置代写/自动重启。install 不等于 loaded，源码 package 存在也不是当前加载证据。Deepwork 子模块只写既定 DSMM global 字段，继续按 D0 startup/admission 边界消费，不能把 host bundle pending 与模块 pending 混同。
- **同一写 authority**：沿用 C0 `profile-rpc.ts:assertLocalSettingsOperator` 的 actual `invocation.peer === connection.operator`、`webServer.host === '127.0.0.1'`、`settings.writable === true`，并在 save 的 signal/lifetime、同 connection owner 和最终写边界复验。官方 Desktop local carrier、auth cookie、Origin 代转、Electron IPC sender 或窗口由本机启动都不是此 actual operator 的等价证据；必须沿真实连接验证，不用新 IPC/HTTP 代理绕过拒绝。profile form 的 `remote.settings` / native field source、actual entry/revision CAS 与 C0 global exact-save 是两个后端，不跨用 revision 或入口。只读/authority 未证时 UI 说明不可写及准确原因，只显示现有权限允许读取的状态；当前 global describe 也受 operator 检查，不另开未授权配置读取面或伪造有效状态。
- **复用而非第二实现**：官方 Desktop 与 Web 复用 shared Plugins contribution、D0/C0 config controller、组件、global CAS 和 native profile forms；分别验证实际 carrier/client发现与 host 身份。页面均有 global/profile/source/effective 区域与已知子模块开关；缺 form/actual entry 时该区标明 unavailable，不借 Profiles CRUD 或另一入口代写。无第二 global 文件、镜像 store、保存/重启 queue 或新 Electron patch。
- **社区仅兼容支线/reference**：独立 `dataelement/dsh-desktop@v0.11.0`（2026-10-03）README 固定 rc.2，证据为 [README](https://github.com/dataelement/dsh-desktop/blob/v0.11.0/README.md)、[architecture](https://github.com/dataelement/dsh-desktop/blob/v0.11.0/docs/architecture.md)、[patch-plugin-contract](https://github.com/dataelement/dsh-desktop/blob/v0.11.0/docs/patch-plugin-contract.md)。其随机 loopback webview、`packages/dsh-desktop-market-installer/client.js` 的 `settings.plugins.tab` / `desktop-host-plugins`、market 条件下 `desktop-market-management` 与对应测试不是官方 Plugins 契约；其 `profiles/web/.dsh-market/state.json#disabled` / `profileBundlePackageBackend` switched/removed 也不是官方整包存储格式。可以在已证兼容面复用同一组件 embedding，不为支线新建框架/后端，不写其 state/改宿主，也不以支线完成代替官方主目标。
- **验收条件**：当前精确 `Get-Command dsh-desktop` 未找到，本机尚无 installed Desktop 运行证据；它也不能据此证明官方 Desktop 没有其它 executable 名称。current rc.2 Web screenshot 不算 official Desktop 通过，alpha 源码对照不算 alpha runtime 通过。必需 shared Plugins 页面/module controls、打包与可执行现有测试仍属 D/E 交付，不能因缺 binary 变成可选。官方 Desktop 加载、入口导航及 operator 保存若不能用已存在且隔离的运行环境验证，就列具体未验证面；不自动下载/安装，不把源码/组件测试称为 Desktop 验收完成。后续确需软件授权由父另行处理，本次不询问或申请安装。

#### Named profiles集中默认与旧库兼容（无自动迁移）

- 复用现有ProfileStore的JSONC、immutable revisions、selection/session CAS及安全校验，不建另一profile DB。`profile-runtime.createProfileRuntime`目前硬编码`profile.dir/dsmm-profiles`；`ProfileStore` constructor仅接受basename `dsmm-profiles`，read/describe/load也走会创建锁的`locked`路径。C0必须显式改成可信factory选定的documents root与state root，适配中央`profiles`布局；不能仅把basename guard放宽为任何绝对目录。旧public构造调用/明确传入的旧合法root仍保持其原安全语义，不添加model/wire任意root参数。
- 新安装/当前可信profile没有旧库时直接采用中央默认；首次无配置读取不得在各DSH profile创建`dsmm-profiles`。启动只允许检查**当前已选profile的唯一已知旧路径**，不枚举`$DSH_HOME/profiles/*`、用户文件或其它profile配置。实际开发验证只用run-ownedfixtures；本任务不对真实私人路径执行兼容探测/复制/迁移。
- 若当前profile旧库存在，默认**严格只读兼容**保留其named selection、完整immutable引用与session cold-resume：该profile runtime明确绑定legacy store origin，不把同名中央draft自动替代它。实现真正read-only加载（不能直接调用当前会落锁/创建目录的read路径），使用bounded no-follow读取、选择指针/被引用revision一致性复核；碰到损坏/缺revision/并发不稳定即拒绝，不回退空选择、不改写metadata。UI标示legacy/read-only；依赖写sidecar的profile切换/保存拒绝并说明需显式导入，不能暗写旧库或双写新旧库。既有boundAgent与可验证的cold resume继续使用原pin；新的中央global deployment合并与legacy runtime overlay仍按上述层序。
- 如需集中现有旧库，提供**明确操作说明与fixture验证的copy/import边界**，不自动执行迁移，不把未迁移称为完成。只对用户随后明确授权的精确source做非破坏copy/import：保留draft字节、immutable revisions与源作用域selection/session记录，目标命名冲突/不同revision拒绝覆盖，完整校验后才允许显式切换该scope的store origin；原库和metadata不删除不改名。当前交付不需要批量扫描/迁移框架，origin/引用不能跨库猜。已经存在的可信explicit路径保持原选择，若需改到中央根仍须显式操作。
- 中央共享named draft的编辑不改变其它host profile已选immutable revision；selection/session状态按host-profile-entry-key隔离。任何新旧store切换都不得接管其它profile的选择、把已有session ID解释为别的scope，或把sessionPersistence日志移动进此目录。迁移前后证据用fixtures覆盖cold-resume、CAS冲突、路径guard与raw格式，不读取私人文件来“验证”。

#### 分层持久来源与三种消费边界

- **Desired deployment Config**：global read与稀疏nativeprofile input在可信后端merge为普通完整desired，保留两层revision/source；只有profile transport受控字段声明`.volatile()`，通过公开`.get()`取值。globalbase是唯一global文件，nativepatch是profile overrides，不向其写回合并值。抽取/验证/深冻结后才交consumer；不把ref/proxy传入structuredClone、profile store或wire，不重复将parsed ref当raw Config。native设置的完整校验针对transport Config，DSMM还须验证defaults/global/profile合并后的业务设置；global和profile写竞态导致组合失效时拒绝新的admission，不破坏原snapshot，不伪称native已校验其它文件。global与profile两种可信写入口均不得越过各自权限/CAS。
- **Startup effective**：在任何consumer mount前完成globalbase读取及稀疏profile合并/校验，捕获startup快照；允许这一步异步准备，但未完成时不能启动使用半默认设置的服务。所有持久native consumer的register/mount/dispose、standingpreset、roleprovider集合、LSP/process/materialization及sessionPersistence绑定只读该snapshot；late inject/install不重新读desired。global save只更新该文件及观察，profile save只改refs，均不触发disposer/reconcile/reapply。startup结构差异显示等待用户显式重启，无hostqueue。sessionPersistence/root仍属既有host启动配置，不写globalbase、不借集中目录扩充存储授权。
- **Admission effective**：role/skill enable、workflow/routing/guards/recovery等策略在**新ordinary root首次live admission**读取/校验最新global文件，捕获当次native显式profile普通值、两层revision和已选immutable overlay；得到一致candidate后冻结，startup-only/实际能力仍取本次启动snapshot交集。异步sidecar/route校验整次使用同一份，不在await后混入另一revision；取消/失败不发布半份。global外部改坏拒绝新admission，旧root即使idle/blank亦不自动重绑。old parent未来child仍继承其完整effective/deployment来源/admission/epoch，不读最新global或profile；old child不变。角色/skills仍不加入named runtime overlay allowlist。
- **真正 live**：只有逐字段证明现有 consumer 可安全在原位使用新值、无需重建或扩大权限时才标记 DSMM effective 为 live；native `applies:'live'` **只证明 desired reference 实时更新**。没有证据时按 admission/startup 分类，不增加自动 idle apply/retry/restart 队列。mode 与已有显式 session profile切换继续使用原维护/CAS机制，并不因 Config 保存触发它们。

**角色/skills 的结构边界**：next-new-root-admission 只对本次 startup 已有 substrate/capability 能安全构造的 Agent 层 catalog/filter/provider 生效。Agent-specific skill provider与role tool exposure在各自创建/admission时从冻结配置建立；settings保存不重组现有scope。实际静态 standing root preset的登记/撤销、启动时未挂载的role provider/工具依赖，仍按startup effective保留到用户显式重启，不能为实现on/off中途重挂。C 必须区分“新 admission 内的启用策略”与“启动实际可用集合”：有效可派集合为 admitted策略 ∩ 已挂载能力 ∩ 原权限；desired要求尚未挂载的能力时报告restart-required，不能假称新session已可用。root picker的startup inventory与新Agent实际tool catalog分别展示；仅在目标scope实际effective关闭后，才断言其catalog/dispatch均拒绝。它们不是同一个开关保存后的同步全局移除动作。这样保留完整功能而不伪造host可安全热挂载能力。

#### Profile / 状态投影消费接口（供 C/D 共用）

1. 延续 `getSettings(agent)` / `.admission(agent)` 为所有已有Agent消费者的权威；为startup消费者提供冻结的startup getter，新root admission提供支持文件I/O的desired snapshot reader。global读可以异步，但同步consumer只取已完成的admission，不在每次工具调用里临时读磁盘。不得把无参数 `getSettings()` 随意改成raw desired，以免依赖“已验证runtime默认”的调用者读未admit数据。C0/C迁移每个调用者，不建第二个profile runtime；direct trusted API调用有已知raw input时按legacyflat处理，不要求伪造nativeentry。
2. 现有named profile draft→immutable revision→admission/epoch、CAS、session sidecar保持，只按上面的central/legacy origin定位。runtime默认selection须保留所选**已应用immutable overlay**，不是globalDeployment；不得重读后改draft或从effective反推overlay。现有Agent显式idle profile切换只替换获准runtime overlay，沿用其捕获的global+hostprofile部署基线，不吸收新global/roles/skills；mode只改显式mode。新parent在原CAS后的future child继承新epoch，global/profile部署保存不改parent epoch。cold resume使用同scope正确store origin的sidecar/默认选择，创建新live admission并捕获当次合法desired，不承诺已退出进程的旧memory snapshot永久保存；缺少原immutable引用必须拒绝，不重选同名中央draft。
3. DSMM只读effective投影并列globalbase、native `configForms`的explicit profile镜像及merged desired：包含trusted entry/hostprofile身份、global revision、native revision、startup generation/能力、new-root条件、可选session admission epoch/named-profile revision和store origin。逐字段显示defaults/global/profile/named-session来源、覆盖/继承与capture boundary及差异原因；profile native descriptor的value不是global-aware的effective。global写RPC是新增授权的独立固定文件能力，status投影仍只读；这些均不是宿主自带globalstore或queue字段。
4. globalbase/native descriptor/effective投影不是跨存储原子RPC：revision组合不一致时显示“所选层已保存，合并/运行状态待刷新”，保留已证snapshot来源，不将任一回包视作所有层effective acknowledgment。pending仅比较结果，不存任务/自动重启；desired改回effective时自然消失。status脱敏，不暴露Config secrets/真实私有路径。
5. `settings/document-updated`用于刷新desired UI；`loader/volatile-update`若消费只用于更新desired观察/本地只读差异，不触发mount/dispose或自动profile apply。启动构造参数不可通过 `!!js` 等表达式间接绑定desired，导致其它row普通配置变化；真实Loader验收须证明仅选定volatile路径变化，DSMM及依赖没有partial-dispose/reapply。外部管理员手动改普通配置、禁用plugin或restart仍是host authority，DSMM不承诺保护这类操作中的busy sessions。
6. 关闭子功能不增加Git/文件/网络/模型授权。**desired关闭不是立即撤销**：只有在该consumer所属scope真正有效关闭、显式取消或scope销毁时，才失效其pending retry generation并清理工作；旧session仍运行其原admission时不得谎称recovery/LSP已停。不得为“立即关闭”偷重启；需即时中止则由用户走已有明确cancel/host操作，不新增自动机制。

### 3.4 Subagent / delegation

- 沿用 native subagent service + spawn-in-process + tool 的一套生命周期，role provider 只做身份、能力、route/admission 适配。
- m0660 的更 native role/category 委派调查已得到有界结论：rc.2 公共 role-subagent tool 配置 types `index.d.ts:17–73` 的 `provider` 是每实例固定 string，`toolName` 每实例必须 unique，无 role/category 参数。generic 聚合 dispatcher 需要自造公开 tool schema/ABI，不是现成 native 能力。因此 D0/D 仅为现有 per-role tool/provider 加模块 gate，保留 native continuation、typed/useful outputs、capability 和 §3.4 policy；不重开旧 ABI、planner Markdown handoff 或另造 worker bus。
- delegation 按 **source 角色分组 + root/stage-owner 或 bounded child 身份** 精确映射，不以“所有 worker 只能 leaf”抹平差别。依据 `src/hooks/config.ts:44-79` 的分组、`:331-377` 的 `delegationContractFor` 与 `:1063-1108` 的实际权限，使用下表作为 prompt、catalog、native/headless 执行共享策略：

  | source 分组/身份 | 允许的子任务目标 | 必须拒绝的目标/约束 |
  | --- | --- | --- |
  | primary coordinator：root/stage-owner `orchestrator`、`builder` | 源默认拥有协调 task 权限；在当前授权、enabled/capability/depth 和 host permissions 内调度所需角色，包括正式 planning/criticism/review | **root builder 不收缩为 bounded worker**；formal planning、criticism、final acceptance 仍由该顶层 stage-owner 掌握，不能由 child 自行接管 |
  | utility leaves：`quick`, `code-search`（兼容 alias `explore`）, `doc-search`, `research`, `media-reader` | 无 | 禁止派任何 children；`research` 虽能自主研究交付，仍是严格 leaf，不可转派 utility |
  | planning/read-only workflow：`planner`、`clarifier`、`plan-critic`、Reviewer/Oracle canonical 与已配置 tiers/slots | 仅 read-only utility：`code-search`/`explore`, `doc-search`, `research`, `media-reader`；direct tools 优先，有实际研究收益才派 | 禁 `quick`，禁 implementation/decision/coordinator/planning/review 子代理；formal阶段与最终验收返还 stage-owner |
  | standard workflow：`coding`, `normal-task`, `frontend`, `creative`, `hard-reasoning`, `documenting` | utility leaves（包括有写能力的 `quick`，但不得超出调用者实际授权） | 禁 workflow owners、implementation peers、local coordinators；不能用 utility 绕过调用者只读/副作用限制 |
  | local coordinators：`deep`, `complex`, `cross-cutting` | utility leaves，以及 specialists `coding`, `frontend`, `hard-reasoning`, `creative`, `documenting`；child 必须有独立 bounded deliverable | 禁 `orchestrator`, `builder`, `planner`, `clarifier`, `plan-critic`、任何 Reviewer/Oracle、`normal-task`、`deep`, `complex`, `cross-cutting`；只整合局部成果后返回，不拥有formal阶段 |
  | native child `builder` 的 bounded implementation assignment | 按 bounded-worker 契约仅 utility leaves；保留调用方更窄限制 | 不继承 root builder 的 primary-coordinator 权限；禁 workflow/peer/local-coordinator 调度，不能通过 persona/role ID 自升 stage-owner |

  `explore` 是 `code-search` 的兼容 alias，不因此新增 canonical role。表中 native child builder 是 DSH 身份适配，不宣称 OCMM 静态 name-based permissions 已区分 child：实际派发时由可信 parent/child admission 绑定 bounded 身份及 allowlist；缺失/冲突身份 fail closed。root/stage-owner 权限也不能仅凭 LLM 参数、自报 role 或 child 的 root preset 名获取。上述允许集还须与源配置、角色启用、宿主权限和 depth/capability 取交集；local coordinator 合法 specialist dispatch 不应被笼统 worker guard 拦掉。
- catalog 隐藏与真正执行拒绝同时成立，包括 native、headless、手工构造调用和 child 同 scope 重新注册。所有这些路径以及生成 prompt 消费同一身份/分组策略；正式 planning/criticism/final acceptance 由 root stage-owner 控制，不把 local coordinator 的合法局部委派误作 formal workflow ownership。
- planner 保持只读，既可作为独立主 preset，也可由编排流程调用。用户已确认采用原生计划提交：支持完整 Markdown 计划与宿主 plan review，不要求 planner 自行落盘；文件写入与实施由获准的 builder/orchestrator 承担。原生 `/plan` 只是当前 Agent 的协作状态，不自动更换角色、不提供权限沙箱，退出规划也不能提升 planner 的角色权限。其余 read-only 角色保持拒绝副作用。
- 一次性默认等待完成；后台必须明确启用、受 native capability/并发界限限制；continuable 返回 native 持久 child identity，并通过 native message/interrupt 继续/取消。不能把 OCMM `task_id` 或臆造 `timeout` 参数直接塞给 DSH。
- provider 明确拒绝 unsupported `agentOptions/outputSchema/toolFilter/persona` 等能力；不静默忽略。设置停用的 role 既不公布也不能 dispatch，未知 toolFilter fail closed；presets/provider 重新注册不绕过 child 限制。
- routing 与 profile admission 在启动时绑定 parent/child epoch；明确 native主模型选择、role显式 route/effort、fallback 与恢复的优先级。parent 后续改变不追溯重写旧 child，异构 reviewer/Oracle 的事实由实际 route 决定。

## 4. 分波次实施与 commit 边界

各阶段是可独立验证的结果边界，不是按分钟执行的脚本。可按证据合并不可分割的 A/B 或 C/D 变更，但不能合并到只剩最后一次 commit；合并原因由父执行者记录，验收不得丢失。每阶段都包含必要 tests/docs，不做“最后再补测试”。

### 阶段 A — 固定真实 SDK contract，修 activation 与 scoped lazy skills

**结果**：在 rc.2 的真实 Loader/Agent 上，普通/DW preset 的 common 启停一致，全文注入消失，registry 按 scope 惰性提供当前技能；服务取消/卸载无泄漏。

**ownership**：`dsmm/src/{index,dsh-types,dsh-events,mode,state,session-scope,skills,preset-skills,settings}.ts`；相应 `test/{mode,state,skills,preset-skills,settings,native-runtime-contract,preset-registry}.test.ts`；必要 native contract fixture；`docs/compatibility.md`、`docs/settings-status.md` 中对应语义。共享 inventory 接口此时确定，后续阶段不得并行改其 schema。

工作：

1. 先用已安装 rc.2 types/runtime 建立可证 contract；尽量直接 import 官方类型。仅为 DSMM adapter/测试 seam 保留窄结构，不让 `as unknown as` 或旧 fallback 隐藏错误。修真实 prompt section callback 的 Agent/scope/route 获取；同步 probe，防止测试工具也读错 API。
2. 加载 entry 识别与 settings revision/config reload contract，去掉 `settings.register` 的假宿主路径。此阶段可先保持标准原生 Config 表单，D 阶段完善定制 UI；不要因缺 UI 暂留无效 settings 写接口。
3. 先捕获旧行为回归：普通 preset active 会拼正文、DW explicit-off 被绕过、catalog/load scope 泄漏、真正 callback 与 fake 不一致；改成第 3 节合同。
4. metadata 与正文分离，注册 provider 返回 disposer，使用 invalidate/AbortSignal；resourceBase 保持 package-relative directory。严格按 §3.2 在 Agent 层注册、用 `scopeParentOf` + ancestor `snapshot` 避让非 DSMM 同名 winner；验证当前安装 rc.2 的 layer-before-rank，不靠 rank600 跨层覆盖。处理 incomplete/abort/invalidation/rebind，禁止 ancestor metadata 查询递归自己或加载正文。普通 preset 不依赖 role 的 preset-skills 才能发现技能；只有实际 host capability 可用时公布可用状态。
5. 建立本次 keyless native fixture：真实 Cordis Loader、真实 prompt/tools/skill/preset services，加本地 mock LLM；先覆盖本阶段，后续复用，不创建产品框架。

**证据**：真实 assembled prompt 中 core 正文哨兵不存在；metadata 可列举；native skill load 恰在调用后返回正文，普通/DW 都成功；off 后 list/get 不暴露 DSMM 内容。明确把 project provider 放在 **ancestor preset/global 层、DSMM 放在 Agent 层**：完整 snapshot 下项目同名获胜；项目同名新增后 bundled 退让，删除后 bundled 恢复，再新增仍正确（经原生 provider invalidation，不手工清测试缓存）；invocation 禁止不能因 bundled fallback 绕过。两并行 session 使用各自 cwd/mode/admission，只有相关项目候选改变相应结果，另一 session 不被错误关闭或继承私有状态。覆盖 ancestor incomplete/错误/abort、查询途中 invalidation、metadata阶段正文读取计数为零、get 前后竞争、无递归/通知风暴；重复 mount/dispose、blank preset rebind、cancel load 后旧结果不写回。断言实际 winner/provider/输出，不仅注册次数或同层 rank 单测。

**commit**：`fix(dsmm): align native contracts and lazy skill scopes`。随此 commit 纳入本 plan；不提升版本、不发布。

### 阶段 B — 完整源同步、DSH prompt/skill 适配与可重现维护

**依赖**：A 的 activation/registry/inventory 接口稳定。

**结果**：完整 role/category/workflow 与适用专项 skill 已有 DSH 可用的语义/资源映射，生成/检查可重现，不再以 12 个短 persona 代替源行为。

**ownership**：`dsmm/prompts/**`、`dsmm/skills/**`、`dsmm/src/{prompts,roles,skills}.ts` 的内容/catalog 层、`dsmm/scripts/{generate-role-assets,sync-debugging-assets}.mjs` 及必要小型 sync/check 工具、`dsmm/agent-presets/**`、`test/{assets,prompts,roles,agent-presets,package,skills}.test.ts`、`docs/{skill-sync,agent-presets,migration-from-ocmm,compatibility}.md`。A/C 的 runtime owner 与本阶段串行合入共享 `roles.ts/skills.ts`。

工作：

1. 以 OCMM `89ca14b` 源建立来源 manifest/维护表：11+11 清单、`prompts/v1/agents/**`、`prompts/v1/category/**`、`prompts/v1/deepwork/**`、`skills/v1/**`、适用 standalone skills，以及 runtime 拼装的角色/模型/工具政策。读取 source 组成关系，不只复制这几个目录里的可见 Markdown。
2. 同步完整 common、role/category 与适用模型 family calibration；配置明确的 effort/model 尊重 DSH catalog，不能照搬 OCMM provider 名称或硬编码不存在模型。默认/risk-based/legacy 兼容语义保持明确，删除短 persona 内“最多三个问题”等无源依据的硬限制。
3. 明确 DSH 工具映射：file/search/shell、question、计划写入、native skill load、subagent start/message/interrupt、background output、LSP、浏览器/调试。工具缺失时写真实 fallback/不可用理由；不能要求 `Task`/`todowrite`/`compress`/OpenCode MCP service 等未提供接口。shell 平台和权限依旧由 host 决定。
4. 核对整个适用 skills 集：`skills/v1` 内 workflow skills（包括授权才用的 worktree 路径）、`remove-ai-slops`、`debugging`、`frontend`、`git-master`、`ast-grep`、`coding-agent-sessions`、`init-deep`、`using-git-worktrees`。同名入口选定当前 canonical source，记录去重关系，不能重复两个不同版本。OCMM-only `publish`、`customize-opencode` 不直接带入；不得伪造 DSMM 发布流程来凑 parity。
5. 逐 skill 递归纳入引用的 references/scripts/assets/templates/data（包括 frontend design/perfection/resource 树、debugging DAP、session 检索工具）；相对链接/resourceBase 以分发目录为根仍成立。确有 OCMM-only 文件或生产不需 fixture 可逐项排除并注明原因；不能只拷 SKILL.md 或一层 references。技能中的安装/登录/破坏操作仍要求授权，不把建议变成自动执行。
6. 建立 manifest 驱动的确定性同步/检查命令：记录源路径/基线、输出、适配规则、license/attribution、排除项；显式 anchor 漂移即失败；check 模式不写文件。兼容人工 DSH entry 的边界明示。两次同步无意外 diff；检查丢文件、失效链接、残留宿主专用调用、生成 preset 与 catalog 漂移。
7. `docs/skill-sync.md` 撤下“七 core 全文自动注入”旧政策，记录完整维护程序。优先只改 DSMM adapter，根 OCMM 源只读；若确需改 `prompts/v1/**`/`skills/v1/**`，扩大文件 ownership 前交由 orchestrator 判断，并按仓库规则同步 `docs/v1-maintenance.md`，不能顺手改根产品。

**证据**：全清单逐行 traceability（source → adapted artifact → runtime consumer/test），22 canonical items 无遗漏/重复、cross-cutting 默认关闭；full tree 打包/资源 resolve 检查；代表性 native skill load 后相对 reference/script 可读取，未 load 不读取正文。明确 native-equivalent/N/A 条目附理由，不能将真实缺口标成 N/A。

**commit**：`feat(dsmm): sync complete deepwork roles and skill resources`。此阶段新增未完成 runtime 的条目不宣称 callable；C 完成所有对应机制后才可称完整 parity。

### 阶段 C — 完整 role/subagent 与已有行为的 native parity

**依赖与新增commit边界**：A已提交、B的canonical inventory/完整source验收完成后，按 **C0集中存储/合并 → C剩余native消费/委派 → D0模块gate/core解耦 → D官方共享Plugins设置页 → E集成** 顺序实施。§3.3中央存储与显式overlay是D前置，不放E或发布后补。C0、C、D0各是有运行结果的meaningful阶段，各自通过适用提交门槛后由父commit；不另spec commit、不回派A/B修范围。C 当前冷 LSP gate 不因新增 D0 改 criterion/归因，也不因 UI 工作转为可选；C 未通过前 D0/D 不覆盖其 pending diff，Root/OMO/native SDK 保持只读。

#### C0 — 中央部署base、稀疏profile继承与named-store集中默认

**结果**：两个run-owned DSH profiles在同一DSH home下读取同一个globalbase，并各自精确覆盖；不写回全量配置、不处置旧Agent；新默认named profiles集中，旧库只能安全只读兼容。

**ownership**：`dsmm/src/settings.ts`（分离sparse transport/final resolve）、`index.ts`、`profile-runtime.ts`、`profile-store.ts`、`profile-types.ts`、`profile-rpc.ts`、`profile-remote.ts`、`status.ts`；按职责新增小型home/global-config adapter及固定文件store；`dsmm/cordis.patch.yml`、仅确有必要的 `dsmm/package.json`声明；对应settings/profile-store/runtime/RPC/nativecontract测试及 `docs/{settings-status,profiles,compatibility}.md`/README。与后续C/D串行交接这些共享文件，不修改Root OCMM/lockfile以强迫安装，不手改B生成资源。

工作：

1. 从已声明peer解析公开home-paths并验证发行态可移植性，固定DSMMroot和无路径入参的global服务。读不存在文件不建库；真实后端global save采用revision/path edits、完整schema、现有文件安全原语和原子替换。写权限复用native client授权边界，错误可分类且脱敏；绝不把globalfile写能力注册给模型。
2. 建立纯merge/来源投影与sparse host Config schema：真实native默认不能当override，保留legacy raw flatABI、arrays替换、unset继承及unknown-key拒绝；nativeactualentry只读presence辅助，不访问私有merge。移除本包row中冗余业务默认，不动用户patch。只有必要profile fields volatile，global save不调用Loader，profile transport改变由native原位refs处理；独立验证两种入口的权限与无重挂。
3. 按§3.3三种capture接入profile runtime：startup先完整read/merge，new-root捕获一致global/profile revision+immutable named overlay，oldroot+futurechild与显式profile CAS保留旧deployment。全局文件外部编辑在读取/admission边界观察，非法新配置拒绝新admission、不覆盖旧数据或让旧会话失效；不另造scheduler/watch-service框架。
4. 用同一ProfileStore机制区分central documents root与host-profile-entry state root。共享draft/revisions的写者沿同一中央store锁串行、selection/session CAS还校验其scope状态；原格式/immutable bytes不改，不能让state命名空间切换绕过locks/pathguards。保持原明确constructor/root调用兼容，只在trusted factory新增准确允许的central布局。严格legacy只读reader不得调用会创建`.lock`的旧read路径；禁止自动初始化旧库、批量扫描、copy/delete/rename；docs解释显式非破坏导入与冲突拒绝，实际操作只用fixtures。
5. 建立D可消费的可信backend读写/只读投影：global path mutations与nativeprofile form两条身份分明，profiles RPC只处理namedruntime profiles；global edits不改profile patch/其它profile选择、profile unset不改global。一次UI动作只落一个持久层，返回该层revision和合并观察，不称跨层原子成功。

**验证证据**：复用settings/profile-store/nativeLoader/模版RPC稳定seams，证明home resolver优先级及package可解析；defaults不遮global、不同profile显式覆盖/同默认值pin/清除恢复global、嵌套对象与整数组替换；global exactsave保留未触碰字段且不触碰任一profile patch。并发host CAS、一写一外部编辑、invalid/unknownkeys、absent file、raw Volatile拒绝、unsafe links/root substitution均有针对性断言。central named草稿共享而selection/session scopes独立；旧immutable引用/coldresume从legacy源读取无任何写，中央同名不抢占，损坏旧库拒绝，fixture显式copy/import保留bytes并拒绝冲突。真实Loader中global save零reapply/dispose，profilevolatile save同fiber；不以仅纯merge单测冒充双profile行为。

**commit**：`feat(dsmm): centralize configuration and profile storage`。随实际实现提交本次plan修订，不独立spec commit。

#### C剩余 — 按集中配置合同完成native消费与delegation

**依赖**：C0验证的global/profile读取、可信身份、store origin与capture接口，B的canonical权限语义；C 完成后 D0 增加 m0660 模块门控，D 再做页面接线和必要投影，不重造数据层、不倒灌改变 C 验收。

**结果**：所有启用 roles/categories 在各自允许入口可用，native dispatch/continuation/取消/限制真实生效，已有 routing/recovery/guards/LSP/profile 缺口有对应实现或原生等价证据。

**ownership**：`dsmm/src/{roles,role-providers,role-subagents,role-routing,preset-registry,preset-materializer,model-routing,routing-policy,runtime-recovery,recovery-policy,guards,lsp,profile-runtime,profile-types,profile-rpc,profile-remote,settings,status,index}.ts` 的相关消费部分，沿用C0存储/merge而非并行改架构；对应 native/role/security/routing/recovery/guard/LSP/profile 测试；必要 preset assets；`docs/{agent-presets,model-routing,runtime-recovery,safety-guards,lsp,profiles,settings-status}.md`。

工作：

1. 从 B 清单生成 preset/provider/tool exposure；保留稳定 ID、existing profile route keys 和默认 root 模型权威。新增 category defaults 正确，未知 ID 拒绝；existing twelve role settings 文件不应因新增默认条目损坏。按 §3.3 分离 startup capability/mount snapshot、new-root desired reader 与 admitted getter：startup原生注册不因desired保存重挂，Agent层skill/role catalog在新有效admission捕获，尚未挂载能力显示待显式重启；所有native/headless消费者读相同有效集合，不能一条路径读desired另一条读admission。
2. 按 §3.4 的 source 分组与 root/stage-owner/bounded-child 身份矩阵落实 delegation graph，而非 worker一律leaf：`research`不派任何children，`deep/complex/cross-cutting`保留合法 utility/specialist 委派，root builder保留primary coordinator，native child builder执行bounded-worker合同。统一 prompt/catalog/native/headless 的策略消费者，落实 read-only 执行拒绝及已确认的 planner 原生计划提交/handoff，不增设 plan-only 写入工具；审计父 preset join 后的 child 同 scope 注册与身份伪造。不要单凭提示词或工具列表声称安全。
3. 完成 one-shot、background opt-in、continuable message/interrupt、结果/typed error/取消/父 dispose、并发容量和 maxDepth。仅映射已证 capabilities，不能给所有 provider 承诺同一组选项。无默认自定义 timeout；需要取消的上层 action 传 signal。
4. 对照现有 OCMM 行为，形成 adapter parity 表并逐个补适用差距：显式选择优先、effort capability translation/floor、role fallback chain 的 omitted vs empty、429 与 generic owner 分离、finite retry、idle continuation generation fencing、child/parent error 关联、取消与删除后无幽灵续跑。DSH 已负责的部分记录 native 等价，不造并行 retry 状态机或假 OCMM task event。
5. guards 只迁移适用行为而非导入全部 OpenCode hooks 名单：shell safety、Git approval、file/write/read-guard 等实际工具 seam、output bounded rendering、plan/question/todo 辅助、depth、interruption。逐项说明 DSH 原生覆盖、DSMM 需补或不适用；例如 canonical tool value 不因显示截断改变。安全层不因 role/common/feature toggle 变成权限授予。
6. LSP 保留现有 opt-in/native MCP/runtime 接入，对照当前 OCMM 可用 LSP 能力（含 symbol-related）补适用缺口、tool availability/只读角色、取消、process teardown；不安装 server，不下载二进制。LSP/materialization及实际native挂载只消费startup snapshot，desired保存不启停进程/重建MCP；真正scope卸载/用户显式重启按原生命周期清理。无法提供的语言 server 如实显示 unavailable，不能登记假工具成功。
7. profile/CAS 与 routing/recovery 联动：将当前构造时固定baseline扩为 §3.3 明确的capture接口，但保留已选immutable overlay、sidecar与权限合同；只在新root admission捕获当次desired，旧root显式profile切换保留其部署基线，parent admission创建future child（包括desired改变后才创建的child），旧child不随全局desired/apply/session epoch改变。只有consumer实际有效关闭/取消/卸载才取消其pending工作并隔离stale events，不能把desired关闭当已关闭。old JSONC/默认结构、route声明与actual route、root native picker语义保持。

**证据**：mock LLM 驱动真实 native工具 dispatch、child tool/useful result、同 child continuation、typed failure/abort；未知 toolFilter 和 unsupported capability 明确拒绝。共享 policy fixtures 同时检查 prompt/catalog 与 native/headless 实际执行：在深度/权限明确足够的 fixture 中 `deep → coding` 成功并返回有效结果，`research → code-search`及任何其它 child均拒绝；`deep → planner/reviewer/normal-task/complex`拒绝；root builder能发起获准正式阶段，bounded child builder能调用获准utility但不能派planner/peer coordinator，冒用root身份拒绝；planner/reviewer的read-only utility允许而quick拒绝。禁止项直接调用/重注册绕过同样失败，sentinel和permission pins不变，disabled role不可派。另测native默认maxDepth=1触顶可解释（不能让默认深度挡住上述合法policy测试而误判全部拒绝为正确），超并发按宿主拒绝/排队行为而非伪成功；手工 native model/effort 不被 profile 改写；429、fallback、dispose、旧 epoch 迟到结果不复活；enabled LSP 实际 round trip 与 disabled/dispose 无残留。

**配置消费补充证据**：旧parent开始运行后保存desired关闭role/skill/recovery；其当前scope及随后创建的child仍持原effective/epoch，新ordinary root才采用新admission，在该新scope验证disabled role catalog隐藏且dispatch拒绝。改回on在已有startup substrate内的新admission恢复；缺startup挂载则明确restart-required且不伪注册。旧root显式profile切换不顺带切roles/skills，新旧profile revision无draft串用。LSP/materialization desired差异不启动/停止进程、不reconcile、不处置busyAgent；startup getter与admission settings均无Volatile引用泄漏。

**commit**：`feat(dsmm): complete native role delegation and runtime parity`。

### 阶段 D0 — DSMM core 独立加载与 Deepwork 模块可用上限

**依赖/结果**：仅在 C 验收通过并由父提交后开始。复用 C0/C 的唯一存储、startup/admission capture 和权限政策，使 DSMM loaded + Deepwork cold-off 是真实可运行组合，core 设置仍可用；此结果可独立验收/提交，故不把后端权限改变混在 UI stage 中。

**ownership**：`dsmm/src/{settings,deployment-config,index,profile-runtime,profile-rpc,profile-remote,profile-types,status,state,mode,commands,preset-skills,skills,preset-registry,role-policy,role-providers,role-subagents,guards,model-routing,runtime-recovery,lsp}.ts` 仅涉及模块输入/安装/消费/投影的必要部分；可新增一个小型 static module descriptor 文件。相应既有 settings/native/profile/security 测试与 `dsmm/docs/{settings-status,compatibility,agent-presets,profiles}.md`。沿用而非改造 B 生成协议/资源；与 D 串行交接共享 schema/RPC。清单是影响面，不要求每文件都改。

工作与验收：

1. 在 global 输入校验/受控 path grammar 增加 §3.2 的已知 `modules.deepwork.enabled`；native sparse transport 与 named overlay 不接受该 global-only 字段，内部 resolved/captured 设置保留其来源。不复制 global store、不把旧业务字段强制 pin、不把 global merged snapshot 保存回 profile。复用 C0 CAS/拒绝非法输入测试 seam，证明 global false 无法被 profile 或 named/session 输入覆盖，unknown module 不落盘。
2. 拆分 `index.ts:applyRuntime` 的 core 和 DW 安装 ownership：当前 `registerDeepworkPrompt`、`registerAgentSkills`、providers/presets、materialization、headless controls 与 profile 初始化交织，config RPC 又随 profile runtime 挂载。按 startup module snapshot 跳过 DW 活动，但保证配置服务/必要 admission/安全 fence 仍 ready；profile runtime 的 standing-role readiness 校验须按**真实有效模块集合**处理，不能 blanket skip C 的 route/immutable/CAS/native 权限校验。late inject 仍读取同一 startup snapshot。默认 on 路径保持旧注册/行为。
3. 用同一 admitted 上限约束 prompt/skill、mode select、role policy、provider alias/continuable preflight 与 standing-preset root 使用；保留已捕获 read-only/filter 身份的更强拒绝。off 新 root 即使可见 startup standing preset 也不能在模型/工具执行前绕过 gate；真实 native 入口应证明零 DW 有用执行/注入，不能只断言菜单隐藏。若公开 lifecycle seam 不能安全拦住该使用，报告具体 blocker，不修改 SDK/静默放宽为仅 session off。旧 root/future child、idle mode/profile CAS 和 cold-resume 继续遵守 C0 捕获边界；既有 immutable 引用缺失仍拒绝。
4. 暴露 D 可共享的 module desired/startup/admitted/source/reason/pending，只是现有 snapshot 的投影，无新状态机。用现有 native Loader/mock LLM 稳定 fixture 证明：缺字段默认兼容；fresh explicit-off 时无 DW 活注册/进程但 core 配置可读写；startupOn 保存 off 后旧 parent/future child 不变而新 root off；profile/session on、standing preset 和 direct alias 不能绕过；startupOff 保存 on 不热挂，独立显式重启才可用。安全 sentinel、只读、原生 approval、filter 单调继承与输出/continuation 合同不退化。复用现有相关回归，只补能检测模块新风险的断言，不按场景配额增文件或重复跑全量。

**commit**：通过本阶段适用门槛后由父 `feat(dsmm): separate deepwork module activation from core settings`；不提升版本、不单独提交 plan。本阶段不声称 Desktop 实际运行已通过。

### 阶段 D — 官方 Desktop / Web 共享 Plugins 设置页、模块 controls 与安全状态展示

**依赖**：A真实settings metadata、B inventory、C0中央global/稀疏nativeprofile transport、C的capture/effective接口和D0模块gate完成；可提前只读确认UIentry，不同时更改共享schema。D沿用两条已实现的可信后端入口，不能仅做单层表单后把global继承或官方Desktop共享Plugins实现留为可选。§3.3新增官方alpha源码只界定兼容目标，当前实现/实测SDK仍固定rc.2；不能为源版本差异自动升级peer/install。

**结果**：在官方 Desktop / Web 共用的 native Plugins 中提供 DSMM 卡片/页面及正确 bundle/row Config 接点，页面包含 **DSMM Global config / 子模块开关** 与 **当前DSH profile overrides**，并呈现逐层来源、merged desired、startup/new-root/current-session effective。global编辑实际写中央config.json，profile覆盖实际写对应nativeentry；Deepwork master 是 DSMM 自有 domain control，只在global层编辑，profile区说明继承的模块上限而不出现可绕过的开关。成功只承诺所选层已保存，不称已应用或host已排重启。named Profiles为独立资源编辑器，非DSH profile层，也不冒充globalConfig；host整包安装/开关保留宿主管理。社区settings tab embedding仅可复用兼容，不能作为主结果。

**ownership**：`dsmm/src/client/**` 的官方 shared Plugins item/page、bundle/row ledger contribution、共享controller/component与必要style；C0/D0固定global服务和module状态的client契约及`src/{settings,status,index,profile-runtime,profile-rpc,profile-types,profile-remote}.ts`必要投影（不得另存配置/扩大authority）；仅在实际client发现契约要求时改 `dsmm/package.json` 的客户端声明；`locale/{en,zh}.json`与clientlocales；已有 `dsmm/DESIGN.md`、`docs/{design,settings-status,profiles,compatibility}.md`；相关client/native/browser测试。不改 Root、官方/社区 Desktop/Electron 源码或 SDK，不添加依赖或依赖 stdio `dsh-sdk-client` 作为UI桥。

工作：

1. 沿rc.2 `PluginManagerPage` 真实身份路径和 §3.3 官方公开 shared Plugins contracts 接入：`plugins.item` 提供 DSMM 卡片/summary/page/order，entry身份与settings namespace真实匹配；bundle用 `plugins.bundle.config`（key=package），row用 `plugins.row.config`（key=`package#rowId`）。`PluginConfigViewProps` 的 view/form 可选；存在 `ConfigPageForm` 时消费 Host snapshot/mutate，不假设 bundle 自动有entryform。globalEditor绑定C0固定globalbase服务，profileOverrides消费所选actualrow entry的 `configForms.get(entryId)` / `remote.settings` native field source与revision CAS；packagekey只选择UI，不是namespace或任意backend路径。独立page缺form时不伪造profile编辑权限；使用公开可证的entry关联，无法关联则明确该区不可用。官方Desktop复用这套contribution而不是另造settings tab；社区embedding若适配只复用组件、不替代主入口验收。多实例不能误写其它entry，global影响同home多个profiles须清楚标明。复用 `whileServed`/服务disposal，不靠autoGenerate。DW-off/core-loaded 的sessionless状态下页面仍可发现，不依赖DW provider/Conversation；Settings Profiles单独显示central/legacy store origin与写入能力，不提供假迁移成功。
2. 复用已有 `dsmm/DESIGN.md` 的nativeDSH tokens/primitives、现有React库、布局/a11y/反馈，只接上述原生入口，不另建品牌/独立SPA/框架。补充Global与DSH profile覆盖及子模块的作用范围、逐层来源、named-store origin/legacy只读及desired/effective/capture-boundary，无queue重启说明；旧standing DW locked-enabled描述如仍存在按A已定语义与D0模块上限更新，不重开历史政策。Profiles不用nativeconfigForms持久模型的区别保持；部署profile层使用nativeconfigForms，globalEditor使用C0固定文件服务，不能把两者文案都称“Host settings”。不安装React额外工具。
3. 对照C0 sparse transport/merge schema与inventory，global层可设值/恢复defaults，profile层可显式override或unset继承global，界面不能用native填充defaults的`value`冒充global-aware结果。覆盖完整feature字段范围及capture boundary；profile只将必要受控字段volatile，globalbackend使用相同业务字段校验而非Volatile。schema/source提示区分native更高层pin，不能承诺unset清除宿主上层强制值。legacyflat显式值保留可见、同default值仍是覆盖；无授权不批量清理。sessionPersistence/账户/hostpolicy等非editable项只读说明，不变更其存储。named profileJSONC仍只含runtime allowlist，不纳入roles/skills或rawrefs。
4. 以 §3.3 的DSMM状态投影展示desired、startup actual、next-new-root适用值/限制，以及明确session的admitted值；role/skill默认新root捕获，旧parent的future child仍继承旧parent，依赖未挂载或静态rootpreset变化则显示等待用户显式重启。LSP/materialization不承诺保存时启停；没有SDK `requiresRestart/queuedIdle` 字段，也不自行维护queue。只有证实的consumer支持原位live才显示立即生效。对保护相关控制说明desired off不等于当前session已解除保护，host授权始终必需。
5. **分开保存**：globalEditor走C0固定文件exact set/unset+expected global revision，保留未触碰字段、任何profile patch都不改；profileOverrides走native form `mutate`/actualentry revision，unset恢复下层而非保存全量合并值。二者各自完整验证、权限与stale/conflict/非法值/断连处理，不能构造同一按钮跨层事务或用ProfilesCRUD代写。globalsave不触发Loader，profile只volatile更新；均须证明无partial-dispose/reapply/reconcile/LSP重建/busyAgent取消。native只读/nonloopback不可写或globalbackend无trustedauthority时分别显示不可写，不借另一个入口绕过拒绝。
6. 成功精确说明“Global base已保存”或“本DSH profile覆盖已保存”；native `applies:'live'`不证明globalstore存在或consumer生效。逐字段展示global/profile/named-session来源与startup/admission差异，revision组合未对齐则提示待刷新。legacy库为只读兼容、未自动迁移；对中央同名draft/冲突只说明，不擅自copy/覆盖。pending只是内存比较，无任务/重启queue。EN/ZH和sanitized错误完整，换entry/断连/dispose无旧身份写回，不暴露路径/secrets。
7. 同步session menu的explicit-off/persona/common区分、sessionless/busy状态；普通主模型仍仅原生picker/明确Use profile model action控制。对确需重启的设置提供清晰用户操作说明；**不将hostrestart连接到save、mount effect或后台监听**。若提供现有原生restart入口，必须标示其取消session的host语义、由用户独立明确操作，不能声称busy安全或queued restart；本任务无需新增restart按钮，说明原生操作即可。
8. 在上述共享页面以静态 descriptor 展示已知子插件 `deepwork` 的 master switch 与模块内设置；global-off 时仍能查看/编辑允许保存的 desired 配置，但准确标明当前不可运行/待 restart，不伪造 live 开关。未来已知子插件可新增 descriptor/显式安装分支和自己的字段；本次不预建未知模块、插件市场、权限自授或任意 provider/script 入口。复用现有 React/native DSH tokens 和库，不加新品牌/依赖。安装 DSMM、host 包 enabled/loaded、Deepwork desired/有效值必须分开标示，无法观测的 host 状态写 unknown 而非由包存在推测。

**证据**：真实浏览器通过DSMM bundle/row Config入口操作正确entry，编辑→nativevolatile settings写入→active profile patch与descriptor revision→同fiber refs原位变化→DSMM desired/effective投影；不能只挂一个表单跳过PluginManagerPage身份路径。busy root持续运行时保存role/skill/recovery desired，无DSMM/依赖partial-dispose、sessioncancel、自动restart或scope重构；旧root及新生child保持旧epoch，新ordinary root采用新有效策略并通过off/on catalog/dispatch回归。LSP/materialization保持startup actual并显示显式restart-required，随后在run-owned fixture中独立、显式重启host，验证新startup接纳desired并正确清理旧资源（不把host取消session说成DSMM安全排队）。stale save/非法值/断连/只读namespace失败不篡改配置；desired回退使差异消失，无隐藏queue；profile apply不吸收新的deployment结构、native模型不变。键盘焦点、读屏名称/live announcement、窄窗/深浅主题/长中英文文本、desired保存与effective未知/待新root/待显式重启可区分；运行中允许安全desired保存不等于允许对当前sessionapply。

**集中配置browser补充**：用同home两个隔离host profiles，经真实Config页保存global而不改任一profilepatch；profileA写一个显式override后global变更只改变A未覆盖字段与B继承值，A清除override恢复global，UI来源与新root实际行为一致。另一编辑器/外部fixture更改global触发CAS拒绝而非丢未编辑字段；entry切换不把global保存变成profile保存。现有oldparent/futurechild和profile CAS不吸收新global；startup能力缺失明示restart。legacy named库显示只读与原pin/coldresume，不出现迁移成功或后台写入；无modeltool/任意路径调用可访问global写RPC。所有fixtures来自run-owned路径，不访问私人profile做演示。

**Desktop / 模块补充证据**：共享组件和官方 Plugins contribution 接线测试证明 DW-off/core-loaded 页面可见、global master 保存仍走C0 CAS，profile/unknown-module/跨入口尝试不能绕authority；on/off、来源、desired/startup/admitted和旧root提示真实。分开记录：①当前rc.2实际原生Plugins卡片/页面/bundle/row ledger及保存；②官方latest Desktop固定SHA的sharedWebHost/client discovery/public slots源码兼容；③实际官方Desktop运行条件具备时的目标版本、原生Plugins导航、DSMM loaded/entry、真实carrier operator/writable保存/拒绝及清理。无③就列未验证，①②或community tab测试均不能替代。官方host整体开关写自身bundles/disabled并待restart，DSMM不镜像或模拟；独立host操作与模块save的取消/卸载/pending语义分别报告。当前缺Desktop运行条件时仍完成必需shared page/module代码、契约/组件与Web实面检查，不标双平台完整通过、不静默删Desktop验收，也不自动安装以求绿。

**commit**：`feat(dsmm): add native plugin feature settings`。

### 阶段 E — 集成闭环、分发完整性与最终可用证据

**依赖**：A/B、C0中央存储、Cnative消费、D0真实模块gate、D官方Desktop/Web共享Plugins必要代码完成。若官方Desktop actual-surface尚无运行条件，E负责列明并补足可执行证据，而非默认已通过；无法补足时保留未验证结论。若只剩验收且没有文件变更，不创建empty commit；集成tests/harness/docs收尾构成本阶段正常commit。集中配置、模块gate与shared Plugins contribution不可拖到E才首次实现，也不能省略B的跨host证据限制。

**ownership**：`dsmm/test/**` 必要集成测试、`dsmm/scripts/**` 的 keyless acceptance/sync checks 和已有条件下的 Desktop 隔离验收接线、`dsmm/package.json` 的测试/资源清单（不 bump/publish）、`dsmm/README.md` 与 DSMM 相关维护/兼容文档；不改 Root README、release workflow、Desktop 宿主或 SDK 作为本任务捷径。

工作与证据：

- 用一套 run-owned empty profile 完成“普通 preset off → on → metadata → load skill/reference → dispatch permitted role → native child continuation/result → Config保存desired → 旧parent/新child保持原admission、新ordinary root采用新effective → 必要时用户独立显式restart后startup生效 → dispose”用户路径；另一并行session保持其scope/admission。已有mode/profile idle CAS另行回归，不能把它当deployment保存后的自动queue。再走显式role preset与explicit-off的反向路径。
- 复用 D0/D fixture 增加真实 install-only 状态：全新隔离 home 中 DSMM core loaded、global Deepwork master 明确 off，设置可访问而 DW persona/skills/roles/providers 不活跃；从原生设置页保存 on 仅产生 desired/pending，独立显式 restart 后首次新 root 才能使用，再保存 off 证明旧 parent/future child 留存与新 root 上限。保留默认 on compatibility 路径及原 session explicit-off 的 persona/权限语义，不能将两个 off 混写。
- 官方共享Plugins按证据层分别列结果：current rc.2 public UI actual-native、official latest Desktop source compatibility，以及有运行条件才可验证的installed official Desktop actual-surface；包括身份/版本、client graph metadata、原生入口/entry/服务authority、保存层及运行状态。不为同一backend复制整套测试，不把Web通过推定为Desktop/operator通过。community v0.11.0仅独立reference/兼容结果，不能替代官方page。所有shared Plugins代码、模块门控及打包仍是必需交付，缺binary不降为建议项；alpha源码核对不改变rc.2 SDK/peer pin。
- 复用C0/D证据补足双DSH profile的global→explicit override→immutable named/session overlay真实链路，集中named文档但隔离selection/session state；从全新临时home证明不再每profile新建主配置/named仓。只用fixture演示legacy只读/显式非破坏import边界，不自动实际迁移；package/runtime能从声明peer解析公开home路径SDK，不能依赖本机全局路径。
- 真实 Loader + native service + keyless mock LLM，不以 fake ctx 注册和固定成功日志替代；记录实际 assembled prompt/registry结果/工具执行与拒绝/settings持久化/epoch，在敏感信息不存在的 fixture上保留必要截图/状态。
- 同步 checker/资源完整性/生成 role assets/check:release（先确认它只读、不发布不安装）验证包结构。检查 npm `files` 与 client bundle 包含完整资源，不引用 source checkout、全局 host 或私人绝对路径；本地 pack 如需仅写 run-owned temp，不做插件安装。
- Cold checkout 必须显式执行固定 pin 的 `node dsmm/scripts/materialize-frontend.mjs --sync` 后再走离线 build/check；此步骤只取已声明资源并验证 blob/license，不安装或执行上游脚本。本机已有 gitignored 资源不是 cold CI 可用性证据。当前 `.github/workflows/dsmm-release.yml` 的 future-source 检查没有该准备步骤，默认 build 会按合同拒绝缺资源；不把现有发布 workflow、已发布版本或本任务 CI 状态宣称通过，也不改发布身份/认证/验收门槛来绕过此条件。E 记录可重现的冷源准备方式及 CI 尚未接线的准确边界。
- 完成 parity 维护表：每个 requirement 对应代码/测试/真实界面证据；native-equivalent 与 N/A 带理由；未完成的必需功能必须标未完成，不能以可选项掩盖。
- 检查 DSMM 手写代码中各阶段遗漏的死代码、过期宿主 fallback、重复逻辑、无必要的转发层和防御检查；只做行为等价、职责明确的简化，不能删掉真实边界校验、权限 pin、取消或 generation fencing。生成资源通过同步器修改，不手工清理。测试只合并或移除相同输入、同一契约、同一失败检测的重复覆盖；不能把实际宿主集成与单元 seam 当作重复，也不能删除或弱化失败检查来得到绿色结果。
- 检查 listener/fiber/provider/timer/process/background job/browser/server 清理，失败路径亦清理；测试临时目录只按准确 root 和 owner marker 删除。

**commit**：有实际集成变更时 `test(dsmm): verify native parity end to end`，父执行者通过门槛后提交。最终报告列阶段 commits、验收结果与未验证限制，不声称已发布/已安装用户环境。

## 5. 验证实施方式与真实证据

### 5.1 快速开发回归与提交门槛

使用工具的 `workdir`，不在命令内 cd，不拼 Bash env 语法。依赖已存在；命令若要求下载，停止而非确认安装。

开发中按改动选 targeted suites；优先复用现有测试，每项新增断言都应对应具体回归风险。纯措辞、固定场景数量、内部实现细节快照和已被更强检查覆盖的验证不另增测试。只有构建输入变化时才先在 `dsmm/` 执行 `pnpm run build`，再执行：

```powershell
node --test --experimental-strip-types test/mode.test.ts test/preset-skills.test.ts test/native-runtime-contract.test.ts
```

对应阶段 C 选 `native-preset-security`、`native-role-routing`、`native-route-strategies`、`runtime-recovery`、`session-profile-runtime` 等测试；D 选 client/settings/native UI测试。新增测试名由执行者确定，不假称当前已有 native feature-settings 验收命令。

每阶段提交前，在 `dsmm` 完成适用的验收门槛；下面的等价入口只构建一次，不叠加会重复 build 的 `test` / `typecheck:test` scripts：

```powershell
pnpm run typecheck
pnpm run build
pnpm exec tsc -p tsconfig.test.json --noEmit
node --test --experimental-strip-types test/*.test.ts
pnpm run check:release
```

根仓库 `AGENTS.md` 要求 commit 前 typecheck/test/build 通过（`workdir` 为 repo root）：

```powershell
pnpm run typecheck
pnpm test
pnpm run build
```

命令分别执行并检查 exit，不用 `;` 混接后续成功掩盖失败。以上直接 Node/tsc 入口执行现有完整测试与测试类型检查，不减少覆盖；已通过且相关输入未变的 build/check 结果可以复用。根全量含 Rust；已有 OCMM 0.6.25 最终验收可在 source/config/dependency/toolchain/相关生成输入未变时复用，记录适用范围和原因；输入改变才重验受影响门槛。不得以“只改 DSMM”为由忽略根门槛。全量只在阶段验收/提交政策必要点和最终验收运行，不每改一行重跑；小而独立的修正仅重验受影响部分，最终证据仍须覆盖所有最后更改输入。

提交前父执行者按仓库要求检查 status/diff/近期 log，仅 stage 白名单，semantic title + 简短 body，无 trailers；任何工具/全量失败不绕 hook，不 stage 用户文件，不自动 amend/rebase。

### 5.2 Native/UI harness 隔离规则

- 新建 run-owned temporary root，验证 parent，**同时显式设置 `DSH_HOME` 与 `DSH_AGENTS_HOME`** 到该root下各自空目录，独立 profile、workspace、browser context。filesystem skill provider 的 agents home 默认可落到 `~/.agents`，仅隔离 `DSH_HOME` 不够；启动前检查解析后的 skill roots/profile/auth来源均只指向本次fixtures，不读用户skills/profile/auth，也不继承指向私人目录的自定义搜索路径。清理 provider凭据环境变量/账户自动读取入口；不能只继承整个 `process.env` 后假设 keyless。host services/mock endpoints 只绑定 localhost。
- 从已有 SDK/host加载源码构建产物，通过受控 Loader patch/mount 使用本地 DSMM；不 `dsh plugin add`，不修改全局或私人 profile。若 rc.2 Loader 不能在现有依赖下无安装加载，返回具体 blocker，不能偷偷走安装路径。
- 复用 `profile-ui-acceptance.mjs` 的 native storage根校验、owner marker、child进程退出与token脱敏，但不要求原有 frozen release artifact/hash/严格 receipt格式，也不导入其 install/auth/固定场景数逻辑。已有 browser carrier 只有 Profiles section，不算 Config 页入口；需挂真实 plugin manager原生组件/导航并使用真实 settings/Loader后端。
- Playwright只用已存在 Chromium/executable；不 `playwright install`。fresh browser无 storageState 导入，不登录、不复制 cookies/localStorage/user data。开发 harness 需要 runtime自带临时连接token时只用于该run，内存处理、不写报告。
- frontend工作先读取适用 design/perfection参考，执行真实浏览器 interaction/layout/a11y 与适用性能审计；不能以 standalone app 的 Lighthouse/SEO仪式替代插件功能，不能为刷分改变宿主安全/UX。记录宿主不可控项和软件缺失项，不安装新 QA工具。
- Desktop 如已有可运行 executable，只从 run-owned profile/home/user-data 与本次受控加载入口启动；验证实际 webview target/client metadata、host/operator 归属，不连接私人 Electron 窗口或读取市场配置。无此条件不下载、安装或重写 Electron 宿主；保留 Desktop 验证缺口，不拿现有 Edge/Web harness 冒充。整包开关测试是独立明确 host 操作，不绑定 DSMM 保存 effect。
- 验收结束关闭本次启动的browser/context/server/host/children，取消pending requests，释放 fibers/providers/subscriptions/timers。递归删除仅本次 owner marker验证过的精确目录，失败时不能扫 temp 根或用户 home。

### 5.3 必须覆盖的反例

| 反例/风险 | 所需证据 |
| --- | --- |
| 普通 preset 暗中全文注入、role绕过off | 最终 assembled prompt 无 skill bodies；explicit-off 后common和DSMM catalog均无，persona仍有 |
| scope优先级/全局provider泄漏/缓存陈旧 | ancestor preset/global project与Agent DSMM同名，项目增删后正确退让/恢复；两session不同cwd/mode独立；incomplete/abort不等于项目不存在，metadata不读正文，无递归/通知风暴，取消load/切preset/dispose后旧结果不回流 |
| 文本有角色但实际不可调用 | enabled inventory 与真实 native/headless schema一致；dispatch到真实child/useful output，不止persona snapshot |
| 分组被抹平/只隐藏工具却可直接调用 | policy允许的deep→coding实际成功；research→任何child、local coordinator→workflow owner/peer、bounded builder冒用root均拒绝；root builder阶段权限保留；prompt/catalog/native/headless一致，read-only写入/unknown tool/disabled role拒绝，sentinel/permission pins不变 |
| parent/child权限或epoch漂移 | desired保存后旧parent的未来child仍继承该parent，只有新ordinary root捕获新deployment；旧root显式profile CAS不顺带吸收新roles/skills，scope重注册不绕restrict，冲突无半应用 |
| native route被配置覆盖 | 普通root手工model/effort优先，Use profile model须明确动作；fallback限额/empty chain/异构事实正确 |
| recovery重复调度/取消后复活 | 429/generic仅一个owner，abort/dispose/实际scope有效关闭后无幽灵续跑；desired关闭不谎报旧admission已停，迟到事件不写新epoch |
| desired保存被误报立即生效/隐式重启 | bundle/row正确entry的volatile写入持久化但无partial-dispose/reapply/sessioncancel；旧scope保持、新root生效、startup-only待用户独立restart，descriptor applies/live不是effective证据，revision不同步不假报成功，无queue |
| 错entry/stale Config全量覆写 | package/rowkey正确映射namespace；entry切换/断连/冲突/ordinary-path/unknown-key拒绝，精确mutate保留sessionPersistence、secrets与无关配置；非editable字段不为通过测试一并volatile |
| defaults伪装profile覆盖/继承失效 | 真Loader sparse Config遗漏字段继承global，显式false/同default值仍覆盖；profile unset回global、global unset回defaults；对象递归/数组整替换，无private merge导入、raw ref/prototype污染 |
| global写丢数据/影响其它profile | 两host共享唯一config.json、exact edits/CAS拒绝stale，未编辑字段和全部profilepatch不变；外部invalid/unknownkeys不被空配置覆盖；global save不调用Loader，source/revision不一致不伪报effective |
| 集中named仓导致跨scope状态串用或破坏旧库 | central文档共享、selection/session按hostprofile+entry隔离；legacy读无锁/目录写入，冷恢复pin完整且中央同名不替代；fixture显式import原bytes保留/冲突拒绝，不扫描或迁移私人profiles |
| plugin私有文件接口变成模型越权通道 | authenticated/trustedbackend授权、固定root与字段grammar；伪entry/任意path/modeltool调用拒绝，no-follow与rootidentity拒绝替换；不改变nativeFS sandbox/approval |
| Deepwork master 只是标签/defaultActive，或关闭顺带解除保护 | fresh masterOff 无 DW 活动而 core config 可用；默认字段缺省兼容；profile/session/standing-preset/direct-alias 绕过拒绝，未知 module 拒绝；既有只读/filter/Git/native权限与数据保持，关模块不清权限身份 |
| module desired 被冒充当前全局停用/启动 | startupOn→off 保留 oldroot/futurechild，新root采用off；startupOff→on 无模块热挂、显示restart-required，独立显式restart才接纳；idle profile/mode CAS不吸收新module desired，无自动cancel/reload/queue |
| Desktop local carrier/cookie/Origin代转被当作operator，或Web截图冒认Desktop | 精确actual peer/operator、writable、loopback及owner/signal复验；另一入口不绕deny，权限不允许的describe不补开读取面；区分rc.2 UI实测、官方alpha源码兼容与实际官方Desktop导航/loaded/entry/save；缺binary列未验证，community tab不能替代官方Plugins |
| 资源只在repo可用 | 从临时分发树resolve全references/scripts/assets，无越界私人路径，无漏包 |
| 注入内容诱导越权 | 项目skill/文档/tool输出中的“忽略权限/派peer/做Git写”不能改变dispatch/approval/path guards；项目skill优先不等于权限提升 |

## 6. 风险、裁定、升级条件

1. **最新已定，不再询问 channel。** rc.2 类型/代码与tag不一致时先报告具体接口差异；不能跟随main/alpha“修好”。代价：若基线真缺必要能力，需要用户决定依赖/host变更，而非静默降级。
2. **role 默认 common on、explicit off获胜。** 理由是保留 DW role 选择的默认意图，同时纠正强制注入且支持用户明确关闭。代价是更新既有锁定label、模式测试和文档；若有不可兼容的旧数据语义，先列具体迁移影响，不删除用户配置。
3. **完整 parity不等于完整OpenCode hooks复制。** 每项源行为都必须落到native等价/适配实现/有据不适用；只有宿主不存在的接口可以说明不可用，不得把关键需求推为以后再做。
4. **权限安全优先于假同构。** 已装 rc.2 的 FS intent 检查不能绑定 sandbox 最终重新 canonicalize 的写入 target，不能以它宣称 planner plan-only 写入安全。用户已选只读 planner 原生计划提交、由获准主执行角色落盘的适配，不再把该写入能力列为 C blocker；保留原 sandbox/approval/CAS 和更严格拒绝。背景/续接同样不能绕 maxDepth/approval。
5. **volatile只属于profile覆盖transport，不是globalstore或consumer live承诺。** C0单一global文件是用户新增授权，替代旧“不得新增配置文件”裁定；不允许第二套mirror/DB。C0/C分拆合并reader/capture，DSHprofile只受控volatile原位更新，globalsave完全不触发Loader；间接普通diff/其它row重挂/rawrefs/busy取消须停止有问题接线并报告事实。rootpreset/provider缺startup能力待显式重启；旧root及未来child不吸收新global是合同，用户自行hostrestart的取消语义不被DSMM冒称queued安全。无自动retry/restart状态机，DESIGN沿native基线。
6. **不安装/不登录是硬边界。** 已有软件不代表所有browser binaries/module resolution都可用。缺依赖时列准确名称、已有替代与所阻验收；请求授权由orchestrator负责，不假装完成或降为MVP。
7. **同步维护会暴露源策略冲突。** 按用户已批准的DSH工具/安全语义改写OpenCode专用细节；如果两源对权限或公共行为冲突且证据不能裁定，升级给orchestrator，不随意挑更宽松文本。
8. **安全回退**只关闭/撤销本次feature scope并保持宿主原有普通preset、permissions和数据；不自动卸载用户插件、重写用户profile或用破坏性Git回滚。实现后的revert等Git动作需另有具体授权。
9. **集中不等于自动迁移/跨profile共享状态。** 新默认主配置和named文档集中；当前旧库存在则read-only origin pin保护immutable引用与coldresume，相关写功能明确受限直至另有精确非破坏导入授权。保留旧explicit根、格式、元数据和权限，禁止自动搬/删/初始化；这一兼容限制必须交付报告，不称已迁移。stage验收用fixtures证明新默认和legacy读安全，不能为了全量绿访问用户实际文件。globalCAS只承诺合作写者锁+外部变更检测，不虚构文件系统跨编辑器事务；如布局/provenance无法验证，则拒绝该操作并报告具体边界，不猜路径或defaults。
10. **静态模块、global-only master、兼容默认。** 现 `settings.ts` 只有 `defaultActive:false` 和逐role/skill字段，`state.ts` 仍把 DW preset 视为默认 active，`index.ts:applyRuntime` 无 master 安装分支；故不能把旧模式开关改名交付。新增 `modules.deepwork.enabled` 默认 true 的依据是现有可用性与用户未要求 default-off；显式 false 满足 install-only。core + 静态安装分支是最小可执行解，不要求物理多 row。代价：需调整 schema层别、startup/admission与各consumer；若未来要求任意外部模块，须另授权设计，不提前建框架。本上限只影响新module字段，不重新解释既有global优先级。
11. **D0 独立于 C 与 UI。** core RPC 当前与 profile/DW 初始化耦合，standing presets 带静态 persona，role-policy 已承担只读与filter；D0须在实际使用前门控而保留身份保护，不能大范围条件return。独立阶段能先证明 cold-off、保存能力与无权限回退再接UI。代价是多一个用户要求的 meaningful stage commit，由父执行；C 的冷 MCP 查询、只读 Root 诊断及既有失败/归因原样保留，不趁机修 Root 或改验收。
12. **官方 Desktop 主目标已定，源码不等于运行。** 官方alpha固定SHA已证明 `apps/desktop` / sharedWebHost与公开Plugins契约，主目标由shared Plugins item/page及bundle/row Config完成；community v0.11.0 tab降为兼容reference，不再承担官方验收。保持当前rc.2 SDK/peer pin、复用web client/backend是最小方案；代价是必须精确核对跨源码版本契约，若有真实不兼容则报告窄缺口，不暗升SDK或新建Electron桥。release无assets不能推出安装包可用，实际Desktopbinary/operator仍未验证；local cookie/Origin代转不替代authority。缺运行条件只限制验收声明、不免除必需实现，不为验证自动安装，也不把stdio `dsh-sdk-client` 当UI依赖。
13. **更 native 委派采用用户允许的保留方案。** rc.2 固定provider/toolName契约无role/category参数，当前per-role代码已有native生命周期、continuable与权限证据；新增聚合tool会引入公开ABI变化而非现成native适配。本增量不做该重构，代价是暂保多role工具；将来SDK提供合适公开能力时另立范围，不删除现有有用输出/结构化结果或权限检查。

本增量**没有需要用户重复选择的普通设计问题**：静态模块/global-only上限/兼容默认不变，官方补证只在本轮plan内纠正D的shared Plugins主目标与证据来源，不新增stage或重开框架；C0已验收存储合同不重开，C尚未通过。仍需证据而非猜测的是rc.2实际UI与官方alpha源码兼容、实际Desktop client发现/operator及运行条件，以及D0在standing-preset实际使用前的gate与core脱耦结果；官方源码identity已明确，不再列为待查。父可裁定等价小实现；若必须扩大authority、改公开tool ABI/SDK或安装，返回具体缺口，不静默绕过。原journal与六份旧plans保护不变。此次只改本plan，不派workflow、不产品实现、不Git写；父随后派critic复核新增D0/D/E及受影响接口，不重审已闭合A/B/C0或planner Markdown政策。

## 7. Handoff 与完成定义

由 orchestrator 将本 plan 与既有 internal/external/clarifier evidence 交 `plan-critic-high`；planner不dispatch。material blocker需要修正、证据反驳或升级，non-blocking建议不阻实施；只在实质输入变化后复查相关部分，不设固定收据/hash/无限审查循环。

完成必须同时满足：rc.2真实API与scoped lazy registry可用；完整11+11及适用prompt/skill资源可追溯且能运行；subagent与已有runtime边界真实生效；主配置集中globalbase、DSHprofile显式覆盖与named/sessionoverlay正确继承，namedstore新默认集中且legacy保护无自动迁移；DSMM core在Deepwork冷off时独立可用，global-only模块上限在真实consumer执行而非改label，默认兼容且不放宽保护；官方Desktop/Web共享Plugins中的DSMM页面、bundle/row Config ledger及global/profile两种保存和source/effective/pending真实；包括C0、C、D0/D/E在内的必要阶段验收/commit由父完成；用户资产未改、无安装/私人profile/auth访问、无RootOCMM/OMO/nativeSDK写、无push/release。必需shared UI代码完成但缺官方Desktop executable/authority实证时可交付精确受限结果，必须将Desktop实际surface列为未验证，不能称双载体全验收或把必需实现列optional；明确分别报告当前rc.2 public UI实测、固定SHA官方latest Desktop源码兼容、未证安装包/实际运行，以及community v0.11仅reference/兼容的地位，不静默升SDK。最终报告列commit IDs、实际测试/界面证据、native等价/N/A、旧root保留/显式restart语义、legacy只读限制与未验证项，不能声称已迁移私人文件或已发布。C冷LSP尚失败时仍不能称整体parity完成；只完成plan、文本同步、注册日志或某次CI绿色都不等于产品parity完成。

## 8. 阶段验收记录

### A：原生 scope、惰性 skills 与等价清理

- 使用真实 rc.2 Cordis Loader、AgentLoop、SkillRegistry、skill tool 与本地 mock LLM，证明 scope-only prompt callback 正常；普通 preset 开启模式和 DW role 都只列 metadata、调用后读取正文；explicit-off 保留 persona/权限但撤销 common 与 bundled skills。祖先项目同名候选经 native invalidation 增删后正确避让/恢复，两 session、signal、rebind、卸载与读前后 fencing 均有实际结果断言。
- 独立审查发现并闭合跨 registry 广播与本 registry cache 的差异：去掉 cached locator 的永久 generation 绑定，保留每次 I/O 的 generation、parent、祖先完整性/winner、mode 与取消检查。真实双 registry 回归先复现缓存 get 永久失效，再证明 foreign change 后可恢复、in-flight stale 仍拒绝且无通知反射循环。
- 最终并行重验暴露测试 Host 共用 `DSH_HOME` fallback preset root。受控双 Host 对照确认 guard 拒绝是正确行为；fixture 改为每 Host 独立标记目录/default preset root，仍允许共享 profile store，尊重调用方显式 preset root。修正前后回归和共享根再次拒绝均已验证，产品 ownership guard 未修改。
- 删除失效 settings.register、同步 skill 正文 loader、闲置假类型/maintenance fallback 和重复生命周期簿记；保留真实权限、generation 与 native teardown，不机械拆模块或合并原生集成与独立单元边界。旧 preset-skills no-op 仅待 B 移除其生成消费者，不能将它描述为另一个有效 skill provider。
- 最终产品与测试 typecheck、实际 build 已通过；最后输入下完整 DSMM Node suite 为 **638 passed、0 failed、0 skipped**（143431.507 ms）。相关 135 项回归在默认文件并发下通过；`check:release` 只读 dry-run 为 `ready`，173 files、0 forbidden surfaces、0 errors，不表示发布或安装。
- 根 OCMM 相关输入未变，复用既有通过证据；DSMM 版本保持 0.1.9。未安装、调用收费模型、访问私人 profile/auth、push/tag/release。B 的完整 22-role/14-skill 同步、C 的实际 delegation/admission 和 D 的 Config 页仍待实施，不能用本阶段绿色冒充完整 parity。

### B：完整来源同步与资源恢复（分平台验收后提交）

- `skills/v1/` 实际只有六个 workflow skill；`remove-ai-slops` 的当前 authored source 是 `skills/remove-ai-slops/`。先前 worker brief 将它放在 v1 是来源判断错误，不是用户禁止 root source。采用实际 source 并记录 DSH/用户约束适配，不复制生成的 Codex 版本或现有短版。
- root frontend attribution 声明的第三方资源尚未 materialize；OMO 的 upstream 目录也为空，且其当前 taste pin 已不同，不能当成当前 OCMM source。GitHub 官方固定提交与 LICENSE 核验确认 root 声明的 Open Design `6afe7eae156bfa29251a51fd0636649c257f7444`（Apache-2.0）、taste-skill `06d6028b5c623016c59ce8536f578e5a1127b499`（MIT）、UI/UX Pro Max `f32d6a61cdf0bfd57404c45854583fd19ff95088`（MIT）可访问；这是来源与许可证文本证据，不是所有引用文件已存在或完整法律审查的结论。
- 保持 root OCMM、OMO 只读，在 DSMM 内提供小型固定 pin/path 材料化 recipe 与许可说明，沿用第三方正文不提交、分发包含材料化资源的模式。获取资源必须是显式同步操作；默认 check/build 离线且缺失时准确失败，不隐式安装工具或取最新 HEAD。逐项验证 source path、引用、许可、实际 package resolve；项目自有 `aside.md` 不被第三方覆盖，不引入额外 vendor。二次同步稳定、打包完整以及新 checkout 的明确操作步骤属于 B/E 验收，不能拿 recipe 存在替代资源可用。
- B 当前实现已同步完整 22-role/14-skill 来源与资源；source/preset 检查为 158/47 outputs 无缺失或漂移，118 项固定 pin frontend vendor bytes 保持不变，实际 package 检查 439 surfaces 无 forbidden/errors。构建和测试类型检查通过，最新受影响 source/frontend/roles/package 回归 42 项及 compatibility/migration 回归 2 项通过。这是 B 的当前定向证据，不表示 C 的 callable/权限接线或 D 页面已经实现。
- 定向独立审查发现并复核闭合四项问题：以 no-follow lstat 拒绝 dangling resource/inventory/parent symlink，受控 cause-toggle 后零 fetch、无外部 sentinel；authored frontend 正文取消默认安装、隐式 latest 和不存在的本地 skill 声明；实际 resourceBase/cwd/output-dir 规则通过现有 PowerShell 和自有 capture stub 验证；公开 role 新 metadata 保持 optional，canonical catalog 仍必填且旧 renderer 参数 ABI 保留。未执行 vendor Python CLI，未以它的静态 parser 检查冒称端到端运行。
- 本机 foreign Harness 使原 machine-global repair quiescence 正确拒绝，换临时目录不足以解除；没有终止用户进程或改 guard/expect。最后冻结 B 的 58 个测试文件采用预先指定的平台分组：Windows 执行除 `session-repair-verifier.test.ts` 外全部 57 文件，**644 passed、0 failed、0 skipped**；隔离 Linux 原样执行该文件，**7 passed、0 failed、3 个既有 Windows-only skips**。两组均保持 Node 默认并发，Windows 保留真实 PowerShell 与 npm pack；677 个公开产品输入在两组执行前后保持相同。不是单机 monolithic full-suite pass，也不宣称 Linux 全包依赖齐备。
- 最后输入的 source typecheck 已补跑通过，复用四项审查修正后的 build、测试类型检查、source/preset 检查及 `check:release` 439 surfaces/0 forbidden/0 errors。独立审查四项问题已闭合；B 来源、公共 ABI、资源恢复和发行范围达到本阶段完成条件，原生 callable/安全执行及 Config 页仍分别留 C/D，不冒充整体 parity。
- repair 的三个 Windows-only case 有此前真实成功记录，其直接 guard/lease/ACL 实现未由 B 修改；此次改变的 role/prompt/import/annotation 链已由当前两组覆盖。父据此复用该窄边界证据，接受 B 提交；**没有最后 B 整树快照下的新 Windows repair-file 通过记录**。历史 full-load 下 15 秒 lease timeout 仍未归因，不把 Linux 通过或旧 ACL 通过称作修复；后续相关输入变动须重验相应边界。已有退出 1 的历史 Windows 整文件结果仍是失败，不重解释为全绿。
- 提交前 `diff --check` 发现 persona YAML 空行被 renderer 补缩进而产生尾随空白；只修空行序列化并重新 build/生成，未改变 persona 内容或权限。受影响的 role、preset 与真实 native routing/runtime 四文件 **70/70** 通过，测试类型检查与发行 surface 检查再次通过；其余不受影响的分平台证据复用，不额外重跑全量。

### C0：集中配置（分平台验收后提交）

- 初审五项身份、隔离、启动顺序、来源与状态脱敏修正已有当前 195/195 相关回归及限定复核证据；该结论只覆盖其对应触发条件，不能替代阶段集成检查。构建、产品/测试类型检查和 445 项发行 surface dry-run 通过，不表示发布或安装。
- 修正前阶段 Windows 运行除 repair 静默组外全部 60/61 测试文件，结果为 **665 passed、6 failed、0 skipped**；同输入的隔离 Linux repair 组为 **7 passed、0 failed、3 个既有 Windows-only skips**。两组输入前后不变，明确不是 monolithic full green。四个原生路由准入失败以及两个公开 Loader 路由兼容/缺字段校验失败均保留为真实历史失败；不得因专项 195 项通过或历史 B 验收而改判。
- 同一 C0 实施任务已在原始六个用例、原断言上完成 **RED 6/6 fail → GREEN 6/6 pass**。原因分别为直接公开 Config 调用误返回 volatile refs，以及新 ordinary root capture 误扫 dormant role catalog。保留同一个公开 Config 对象，直接 callable 返回完整校验的 plain sparse flat，原生 StandardSchema 仍提供稀疏 volatile transport；普通创建保持 schema/文件/合并/standing capability 校验，模型权威由实际 native root request 和 alias/child preflight 执行。named Apply/session select 与 retained startup 的完整审核和 readiness guard 未放宽。
- 修正后四个相关路由文件 **86/86**、既有 C0 safety 集合 **195/195** 均通过；计数有重叠，不累加。完整 named primary 替换先清除该 role 的来源子树，复用现真实两-Loader case验证 effective effort 和两份来源映射均无残留，未改运行设置。当前 build、产品/测试类型检查与 445 项发行 surface 检查通过；同审查会话对这三个实质边界的受影响复核未发现新增阻塞或缺失证据。
- 当前代码冻结后，Windows 原样运行全部 60 个适用文件，**671 passed、0 failed、0 skipped、0 cancelled**（137323.0509 ms）；原六项失败本轮通过。1064 个公开输入（其中 DSMM 697 个）前后不变，旧失败 raw logs 与结果 metadata 也未覆盖。repair 的 13 modules、41 catalog artifacts 及依赖锚未变，复用既有 Linux **7 passed、0 failed、3 个原有 Windows-only skips**；它不导入此次变化的 settings/index/profile-runtime。不是单机 monolithic 或 Linux 全包通过，历史 full-load lease 问题仍未宣称修复。
- 当前 build 与 source typecheck 复用同输入通过记录；父补跑已安装 TypeScript 的直接 Node test-TS 检查，exit 0，以补齐缺失的 raw artifact。只读发行检查为 `ready`、445 files/required surfaces、0 forbidden/errors；父核验最新 raw Node 汇总、完整 Git 范围、当前 Config/native authority/source 清理接口及同审查会话结论，达到 C0 阶段提交条件。保护、私有旧库只读与外部 editor CAS 窗口边界不变，C/D/E 功能仍未完成。
- 父补查时 `pnpm exec` 触发 workspace 依赖协调并移除未声明的直接 home-paths 链接；Root manifest/lockfile 没有 diff，未添加软件。随后改用已安装 compiler 的直接 Node 入口，并实际证明产品仍能经声明的 filesystem peer 解析公开 home SDK。后续避免 `pnpm exec` 隐式协调；不以开发机额外链接充当可移植依赖证据。

### C/D：实际 rc.2 宿主接点（只读前置证据）

- 项目 resolver 缺少某个 SDK 包不等于实际宿主缺能力。通过已安装完整 rc.2 CLI 的 physical package resolver，核实 filesystem/sandbox/observation、approval、continuation driver、persistence/query 与 control consumer 均可解析；产品仍使用可移植的公开 SDK，不写入本机绝对 SDK 路径，不以本次读取宣称运行验收已完成。
- 用户已选择 planner 保持只读，通过原生完整 Markdown 计划提交/review/handoff，由获准 builder/orchestrator 落盘；不再实现或宣称 plan-only writer。普通 workspace-write 不等于逐次审批，plan-mode 也不提供目录专用权限；退出 plan-mode 不升级角色。C 的实际只读执行 fence 仍须基于可信 admission，保留 native sandbox、approval、observation/CAS 和更严格拒绝，不能仅靠 persona、字符串前缀或 Node fs 绕过宿主。
- 原生 Agent owner 会等待自有 scope unwind 后才 detach Agent。`agent.ctx.effect` 的 async disposer 可 await `subagents.drainContinuableDescendants([agent])`，无需私有 scheduler；注册必须在该 exact Agent 自有 scope，并验证清理时仍为 registry 中的同一 Agent、disposer 顺序和完成等待。`agent/disposed`、`session/disposed` 是事后 contained observer，不能代替这个接点。
- CLI 公开 profile-boot 与 Loader patch 支持本地可加载 ESM JS：patch 是顶层 YAML array，insert entry 含 id/name/config；本地路径转换为 file URL。隔离 profile 的 `--from-default-profile web`、`--patch` 与 `--no-open --host 127.0.0.1 --port …` 是可试入口，不是已运行的 UI 证据；双 home 与 XDG/TEMP 继续隔离，禁止自动安装或读取私人 patch。Config-only 页面不需要收费模型请求；确需目录时可通过公开 `llm.registerAdapter` 提供本地 fixture。真实 PluginManagerPage、Config 保存和忙态不重挂由 D/E 验证，不能用 Profiles carrier 冒充。
- 已核对 rc.2 `initializeProfileFromDefault` / `runProfile` 不自动安装或下载；SDK 可用公开 `createLaunchEnvironmentSnapshot([{ source: 'process', values: isolatedProcessEnv }])` 避免读取私人 `.env`。boot 后 `ctx.profileContext.home` 是可信的已解析 home，可交公开 home resolver，不由 profile dir 推导。新 profile 仍会写自己的 include root，因此只允许 run-owned 路径。这些是源码接点证据，不是实际 Host 启动通过。
- 本地 ESM row 的浏览器资产有真实发现路径：client-modules 从 Loader 解析的模块 URL 找最近 package manifest，验证 `dsh.client.platform: web` 与 `exports['./client']`，再把实际 bundle 纳入 client graph/asset route；B manifest 与构建 `lib/client.js` 满足相应声明条件。未证明 standalone row 自动成为 Plugin Manager 可导航的安装 bundle；D 必须在原生页面核实真实 inventory、entry ID 与 Config ledger，不能把 server import 或独立表单当作该结果。
- 浏览器连接预检已取得实际成功：Playwright 1.59 + 自建 fresh Edge 随机 loopback TCP-CDP，核验 marker、launcher/直接 child、进程时间和 listener 归属后建立新 context，读取 `about:blank` 并取得 1280×800 截图。连接/context/browser 均正常关闭，owned PID、listener 和 profile 均已清除；未登录或连接用户浏览器。原 CLI pipe 故障未宣称修复，修订 cold-start 路径未另行重跑；这只证明可用连接方式，不是 DSMM Config/UI 验收。
- 原生页面入口已另行实际验证：从已安装 rc.2 的默认 web 初始化独立 profile，仅启动官方 base/web bundles，未导入并行修改中的 DSMM。正常点击预览说明“继续”，再通过“全局面板 → 插件”进入真实页面，截图与 DOM 显示“插件”一级标题及 8 个官方插件。公开本地 operator handshake 保留 native authentication；没有账户登录、模型 stream 或观测到的外部请求。默认工作区集成探测在 QA 中拒绝，未执行工作区/job/FS 操作，因此这不是这些宿主能力的验收。
- 随后出现 API Key 引导，本次没有填写或继续进入详情/Config。父核验截图可见宿主原生“稍后配置”按钮：后续 D 可验证该正常延期配置流程，不把它当作账户登录绕过，也不通过改 DOM、关闭认证、假密钥或修改权限消除引导。若后续路径真正要求凭据或账户登录，仍停在该边界并报告限制。目前尚未证明延期后 Config 可操作、DSMM inventory/ledger 存在或保存成功。
- 前置任务两次 Host 均正常 shutdown，fresh Edge 正常关闭；父核验清理 JSON 中已记录主/子 PID 不存在、4 个 owned Host/CDP 端口无 listener、browser profile 已删除。脚本、独立 homes/profile 与证据仅保留在 run-owned `d-native-entry-preflight-20261008` 子目录，最后随本轮精确清理。原生 Config 的 bundle/row ledger 与 actual entry/form namespace 契约仍由 D 实际接线，不由页面入口或 metadata 推定完成。

### C：原生执行机制与分组回归收尾，已提交 `f97d0d4`

- 首批真实 mock LLM 已执行 root → deep → coding → read 并返回有用结果；当前身份、委派策略、实际 spawn capabilities 和 Agent-owned drain 接线仍在补齐，不能将该正例或构建/发行 dry-run 当作整个 C 完成。
- 新负例证实旧 `plan-validation.ts` 在宿主拒绝 read/edit 时仍通过 Node `readFileSync` 读取目标，并可能在格式错误回包中泄露未获准正文。该负例保持 RED，C 不提交；不得删除或降低检查、提前读取来刷新 native observation/CAS，或用截断行视图假装完整文档。
- 父裁定最小 fail-closed 适配：启用 plan-validation 时，rc.2 尚无已授权完整提交前 preview 的受保护 plan edit 明确拒绝并说明能力限制；校验 caller 提供的完整 write 文档仍可用，但不授予或绕过 native write/read/approval/CAS。非计划 edit 保留宿主原行为，关闭格式子功能不影响必须执行的只读与宿主权限。移除危险直接读文件和失效重建分支，原生匹配与 CAS 仍由宿主处理，不虚构已完成全文 edit 校验。
- rc.2 `restrict` 不过滤同层自身注册，当前重注册禁止目标/变更工具的执行拒绝已有证据；catalog 隐藏不能据此宣称成立。优先公开同层过滤接点，无安全路径则准确记录可见但执行必拒的限制，不修改私有 SDK 或复制调度器。完整 background/continuation/capacity/depth/error/abort、preset rebind、捕获边界和 LSP 进程回环仍待当前阶段实现验收。
- 后续实施已移除计划编辑的 Node 读取与重建分支；原泄露负例现为零目标读取、零 body dispatch、回包无 sentinel、文件不变，普通 native edit 匹配/CAS 和完整 write 的更强宿主拒绝仍有实际证明。身份/realm、formal readonly planner handoff、原生委派/continuation/background、取消/drain 和 capture 组已取得定向证据，但不据此提前宣告整个 C 完成。
- 当前真实 LSP `find_symbol_related` 正向仍失败：Windows 路径转换为 `file:////%3F/C:/...` 后 gopls 无 package metadata。实际 MCP status、工具注册与进程退出不代替这条有用查询；同一实施任务按受控普通路径/extended 路径对照定位 DSMM→MCP 边界，Root Rust 与 opaque identity 不改，保留原 RED 和 owned cleanup 证据。
- 稳定核心独立审查新增已验证 Important：root 以 `toolFilter:{deny:["write"]}` 派出 bounded Builder 时，Builder 自身拒绝 write，但其下一层合法 quick alias 未继承父 filter，write sentinel body 实际执行。共享准入必须继承父已生效限制、下一层只能继续收窄，涵盖角色工具、直接 alias 和 continuation/cold-resume；同时保留 native unknown-filter 拒绝、合法 utility 结果与 structured-output 语义。此缺陷及 LSP 正向查询均为 C 提交阻塞，修正后只重验受影响边界，不删除失败断言求绿。
- 按用户要求停止旧实施任务后由全新任务接替；旧任务确认无未完成操作或所属进程，保留 working diff，不回滚。新任务在共享 child admission 处采用 allow 交集、deny 并集，并复制冻结限制，原 native caller filter 保持。原 Builder → quick 场景由实际 write body 1 变为 0，sentinel 不变且合法 read/result 仍通过；直接 alias、第二消息及同 durable ID cold resume 保持限制。当前相关 139 项全部通过，同一核心审查会话已核验并关闭该权限缺陷；这不代表整个 C 已通过。
- 冷 LSP 正向 gate 已恢复为独立空缓存的一次真实请求，未靠 CLI 预热或重复查询过关，仍失败。绕过 DSMM/DSH 直接调用同一 MCP 的冷对照也失败，而六个独立 direct gopls 协议对照（含两种 URI、configuration 回复及 extended cwd）均得到 definition 1、references 2。最终 MCP `filePath` 逐字保留公开路径，opaque identity 仅比较相等；尚不能把 `%3F` URI 单独认定根因，也未证明 DSMM 路径 corruption。C 仍未提交，继续以只读 Root 启动/协议差异诊断缩小原因，不修改 Root/SDK、不将 status、构建或 447 项 artifact readiness 替代冷查询验收。
- 只读 Root 诊断进一步收敛到 executable 启动入口关联的环境限制：原 workspace 入口下的 managed child 能读取 owned marker，但创建 owned 公共日志明确返回 `EPERM`；同一 fixture 上的逐字节临时副本可执行公共写入和实际冷查询。原与副本 SHA-256 均为 `3942e35fa7960d26ff81fd8ab8e7cbcb59ec204f1e8761c68fa4c79c1502a45b`，没有重编译或改 Root/SDK/产品路径。
- 父接受上述合法临时 executable 作为隔离 QA fixture：实际运行未修改的 `test/native-lsp.test.ts`，首次独立空缓存取得 definition 1、references 2，2 pass、0 fail/skip/cancel；测试文件前后 hash 不变、公开 `filePath` 原样、opaque target 未解析，未预热、sleep、重试或改期待。observer 仅观察原样 spawn/exit，所属进程与 fixture 均已清理。该证明关闭 C 适配功能的冷正向证据缺口，不证明默认原 `dist/bin` 入口已修复，也不授权生产 relocation、持久复制、防护/权限例外；Defender/WDAC/ACL/Job 具体根因及 gopls 缓存写入失败仍未确认。默认入口 RED 与诊断记录保留，C 还须完成分组广泛回归后才能提交。
- 首次广泛 C 分组冻结 65 个测试文件，预先将 repair 与 native LSP 分出，Windows 其余 63 文件单次默认并发运行。观察到 `native-route-strategies` 一项、`package` 一项和 `preset-materializer` 三项失败；240000 ms 工具上限中断，Node 最终 exit/signal/count 未知，472 条部分 reporter 勾号不是通过总数。不得将这些文件移出范围或把旧定向结果当成广泛通过；接替实施任务先取得原 case 完整失败断言，保留 fallback/readonly authority、preset ownership/legacy/原子发布与清理合同后最小修正。
- repair 闭包由 13 增至 14 modules，旧 Linux 证据已失效并实际重跑：原修复工具测试在既有 immutable image、无网络、空 homes、只读 mount/cap-drop 下取得 7 pass、0 fail、3 原有 Windows-only skip，Node/Docker 均 exit 0。skips 不当通过；旧 foreign-carrier 拒绝与 15 秒 lease 问题不称修复。广泛 Windows 中断的所属可观察进程已无存活，残留 marked fixture/cache 仅保留在 run-owned 子目录，最终统一精确清理。
- 五项失败定向重放取得完整 65 tests、60 pass/5 fail、Node exit 1；三处原测试前提修正后同组 65/65、相关 native delegation/role routing/root authority 56/56 通过，Node 均 exit 0。父逐行核对：alias fallback fixture 明确 `defaultActive:true`，不再由未准入普通 root 测试合法委派；materializer 字节期望使用实际单-role enabled inventory，不要求未启用 utility rows；文档字段列表加入已存在 `subagents`。所有原 fallback/header/ownership、write 拒绝、精确文件字节、foreign/unsafe legacy、原子发布及注入失败清理断言保留；无产品、权限、catalog 或 build 输入变更。再次广泛组仍保留原 63 文件和默认并发，使用 600000 ms 工具上限及即时完整 TAP，不据上述局部正向批准整个 C。
- 完整广泛 Windows 组最终 685 tests、683 pass/2 fail、0 skip/cancel，Node exit 1、signal null；测试期间 inputs 无变化。两项失败均为旧 profile fixture 直接创建 generic subagent，被实际 role policy 正确拒绝。原文件取得 17 tests、15 pass/2 fail、exit 1 后，仅三处 setup 改为 exact-parent 的真实 `dsmm-role-reviewer` provider，并等待 completed、finally 释放 native handles；所有旧/新 child admission、epoch、profile switch、model/effort picker、metadata、锁/CAS/ownership、resume 断言保持。当前原文件 17/17 与相关 native 四文件 57/57、测试类型检查均 exit 0；generic spawn negative、deny-write body 0/sentinel unchanged 和合法 read/result 仍通过。
- 父核验该 fixture-only diff 与原始日志，按相关输入不变复用广泛组其余通过结果、当前 build/source/generated/frontend 与 repair/cold LSP 分组证据；不将历史 Node exit 1 改判，不重复无受影响理由的整套测试。这里是覆盖全部适用 case 的组合验收，不是单环境或单次 monolithic green。repair 的 3 个既有 Windows-only skip 与原 LSP 入口环境限制继续披露；artifact readiness 仍只证明分发契约，不是发布或功能通过。

### D0：Core / Deepwork 模块边界实施与修正中，尚未提交

- 初始实现提供 global-only `modules.deepwork.enabled`、静态模块 descriptor、startup/admitted/next-root 捕获与安全状态投影，Core global Remote 安装与 DW 分支分开。父核验相关源码和 native fixture；构建、artifact ready 或组合专项计数不代表模块边界已通过。
- 同一阶段独立审查实际复现三项 Important：module-off 在 `guards.scope:always` 的 Git deny/ask 之前返回，模拟 shell 工具体可执行；cold-off 未准入普通 native child identity，导致其原生 read 被 Core 拒绝；历史 mode-on 在 module gate 下被误判 effective-off，用户显式 mode-off 没有持久化。父读当前源码确认，交回唯一原实施任务做最小修正，保留已捕获只读/filter、native 更强权限与 idle/CAS，不能关闭整个 safety guard 或新造 role 身份换绿。
- 修正前广泛诊断已正常结束：Windows 默认并发 687 tests、686 pass/1 fail、Node exit 1；唯一现有失败是 package 文档拒绝段落定位前提不匹配。独立 repair 7 pass/3 既有 Windows-only skips、Node/Docker exit 0；独立冷 LSP 2 pass、Node exit 0；测试类型与 artifact 449 surfaces/0 forbidden/errors 通过。1243 inputs 前后无变化只证明此修正前窗口，不覆盖后续源修改，不称最终 D0 gate。
- 当前全部所属命令/进程/容器与 marked fixture 已收尾，父解除源码冻结后恢复原 D0 写者。文档检查须正确定位真实 global-only / deployment-only 拒绝段落，保留原字段限制，不移出失败用例或删断言。修正后同 reviewer 有限复核，并按受影响输入更新必要验收；D 页面尚未实现，不把 backend/modules 证据当作官方 Desktop 运行证明。
- 原写者完成最小修正后停止，父读当前源码与真实 native 日志核验：`scope:always` 的 shell/Git ordering 与 deny/ask 保留在 module gate 前；必要 exact-parent identity admission 安装在 Core，子级 epoch、readonly/filter 仍继承；mode no-op 比较最后持久显式 intent，不再拿 gated effective-off 替代用户关闭操作。原 package 八个 deployment-only 字段断言未改，只修准确文档拒绝段。相关中间 141 项组仍有两个 renderer fixture/parent 失败，不能报单次全绿；未变通过身份与最终 native 4/4、docs 14/14 是组合证据。native read 实际 body 1/isError false、模拟 Git push body 0/isError true、显式 off 新 revision 且独立 on-startup 恢复后仍 off，DW standing body/request 与 cold DW 注册/materialization/MCP 都为 0。
- 当前 build、源码和最终测试类型检查、离线 source 158/preset 47/vendor 118 与 artifact 449 surfaces 已通过；中间 test TypeScript exit 2 记录保留，不替代最终 exit 0。父已送同 reviewer 有限复核，并启动修正后冻结输入上的完整适用 Windows 分组与独立 repair/cold LSP 依赖核验；它们尚未返回结果，D0 不提交、不宣称阶段或双载体 UI 完成。当前操作未改 Root/SDK/依赖或 GUI、未安装、无真实 Shell/Git 副作用。
- 同 reviewer 直接确认前三项修正，但实证新 Important：parent mode-off 后再次安装 DSMM，Core existing-Agent 路径重复 `admit()` 将 retained reviewer child 的 role/readonly/deny-write 重新降为普通 child；相同模拟 write 工具原先拒绝，重新安装后 `isError:false`、body 计数从 0 到 1。没有真实文件写入或竞态。父读 `role-policy.ts` 确认旧身份会被 `parentIdentity.role === undefined` 分支覆盖，要求最小修正为复用原捕获身份与限制、校验 exact live child/owner/captured epoch，不匹配明确拒绝；不得重新按 parent 当前 mode 推导或清掉 filter。合法旧 child 与 parent 后续 profile/mode 更新的 frozen capture 保证也必须保留。
- 父已通知同阶段验收任务停止新命令，允许当前命令正常收尾和 finally 清理后交还 freeze。该窗口仅为第四项修正前诊断，即使通过也不批准当前 D0；收到实际无 pending tool/owned 进程后才恢复唯一原写者。修正完成后继续同 reviewer 受影响范围复核，不新建控制器、公共 API 或并行写者，不将 D0 缺陷改列为 UI 限制。
- 验收任务随后明确交还 freeze：无 in-flight 命令、待返回 tool 或所属进程，容器、15 个标记临时目录和 native 子进程已正常清理。该诊断窗口 Windows 690 pass、0 fail/skip/cancel、Node exit 0；独立 repair Linux 7 pass/3 原有 Windows-only skip、Node/Docker exit 0；独立 cold LSP 2 pass、Node exit 0。输入不变证明仅覆盖当时窗口，旧汇总文件及先期父计划差异记录不改写。父据此恢复原 D0 写者修 retained identity，而非据 passing counters 宣告安全；修后证据依相关源码与依赖变化重新判定适用范围。
- retained-child 修正仅改共享 role-policy、一个必要 native 回归及准确文档和自动生成输出：重复 admission 在重新推导父当前 role 前复用原 child frozen identity，并检查 exact live Agent、真实 owner/parent 与原 admitting policy 的 child epoch。父合法切换 profile 新 epoch 不否定旧 child；fresh/cold residency、realm 与继承 filter 交并未放宽。公共 module/status/RPC/identity API 不变。
- 父实际读取同顺序 RED/GREEN 与最终日志：RED 重装后模拟 write body 1/sentinel CHANGED、Node 1；GREEN 重装前后均拒绝 body 0/UNCHANGED、合法 native read 返回 `read`、旧 child identity/epoch 不变且 same-id 假对象拒绝，Node 0。单次 11 文件相关组 142/142、fail/skip/cancel 0、Node 0，standalone GREEN 已包含其中不再相加。当前 build/source/test TS、离线 158/47/118、artifact 449/0 forbidden/errors 均通过；同 reviewer 对当前增量及直接依赖复核无剩余 Important/Critical 或必须补齐的证明缺口。此前 690 诊断不是 post-fix 全绿，父仅比较相关输入及实际 consumer 分支判断可复用检查，不无限重跑不相关 suite。D0 尚未提交，D/UI/E 未开始。
- 最终只读适用比较确认：旧已知 manifest 中的产品差异仅 role-policy、必要 native 回归、profiles 文档及四个生成文件，55 个公开 peer/CLI/compiler anchors 未变；父计划另列。旧广泛窗口实际 690 pass、0 fail/skip、Node 0 保留为修正前执行记录，当前 142 项更新 affected admission/native/capture 权限证明，其余未变 seam 按输入与实际分支复用，计数不相加或冒称最新全量命令。
- repair 与 cold LSP closure 均间接包含已变化的 role-policy 字节，因此不宣称全依赖同 hash。repair 实际只使用静态 role ID 与 Session/persistence/lease，不实例化 live role policy；旧 Linux 7 pass/3 既有 Windows-only skip 可继续证明该范围。cold LSP 的普通 root/首次 reviewer、真实 transport/operand/cold 查询/取消退出均没有 retained-child reinstall 序列；fresh child wrapper/权限读取由当前 native 组覆盖，旧 2/2 续用于未变 seam，不证明重装后 MCP 新组合调用。父未要求虚构此组合契约或为覆盖 quota 添加用例。exact-owner/原 epoch mismatch 防护经源码与 reviewer 检查，没有单独动态负例，不以 same-id fake Agent 负例冒充；已通过实际核心缺陷的原序列 RED→GREEN，必要证明足以提交 D0。
- 父接受当前无写者、精确 diff、生成一致性与上述检查，四项 Important 均闭合，无剩余阶段阻塞；不新增全量重跑、软件安装、权限例外或 Root 修改。原 workspace LSP 入口 EPERM 限制仍未修复，独立检查不是发布、实际官方 Desktop 或新 Plugins 页面保存验收。D0 实现与本记录同阶段提交，下一步进入 D。
