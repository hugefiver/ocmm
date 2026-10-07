# DSMM：DSH 0.2.0-rc.2 原生 API 与完整 OCMM 行为 parity 实施计划

日期：2026-10-07。状态：计划及设置生命周期修订已通过 blocker-focused 审查；阶段 A 最终验收通过，随本阶段实现提交。B–E 尚未完成。

## 1. 已授权结果与边界

在 `dsmm/` 完成适配，不做 MVP/phase-1 范围缩减：

- 固定用户已选的 **npm latest 基线 `0.2.0-rc.2`**，不是 alpha/main，也不是实施时再浮动解析 latest。官方 tag 为 `dsh-v0.2.0-rc.2`，对应 `639ed015397290b3745d163aafe02ffee4aa3f84`。
- 消除旧宿主 API 假设；普通非 Deepwork preset 不被注入 DSMM skills 全文。启用 Deepwork 时，普通 preset 与 DW role preset 都经宿主 skill registry 发现 metadata、按需 load 正文及资源，不保留全文注入 fallback。
- 同步现有 OCMM **11 基础 roles + 11 categories**、workflow/common/model-family 文本和适用专项 skills 的完整行为与资源树，转换为 DSH 可执行的工具/runtime 契约。纯复制文字或只补角色名称不是 parity。
- 补齐 native subagent 实际启动、路由、续接、后台、取消、权限、深度、清理和 profile admission 行为；延续已有 runtime，不另建 scheduler/retry 状态机。
- 在宿主插件管理中选中 DSMM 后的原生 **Config 设置入口** 提供真实 feature controls；保存、effective state、scope、restart/idle/live 生命周期一致。保留现有 Profiles/header selector，不用它们冒充插件页。
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

区分 **role persona/固有权限**、**Deepwork common workflow**、**DSMM bundled skill visibility**：

| 场景 | Persona | Common workflow / DSMM registry |
| --- | --- | --- |
| 普通 preset，无 active mode | 宿主原有 | 不注入、不公布 DSMM skills；不影响宿主/project 自有 skills |
| 普通 preset，显式启用或有效默认启用 | 宿主原有 | common workflow + metadata catalog，正文只在 load 时读取 |
| DW role preset，无显式 mode 选择 | role persona/权限 | 为兼容 role 使用意图，默认 active；仍只 metadata/lazy load |
| 任意 preset，显式 off | role persona 若存在仍保留 | explicit off 优先，不再以 `isDsmmRoleId` 强制 common workflow/skills |

这把当前 role 的“锁定 enabled”UI 改为可表达显式关闭 common 的状态，不把关闭解释为卸掉 read-only/Git/host approval 边界。已有 `deepwork/mode` intent 持久化、跨 profile/reopen 优先级继续保留。mode/profile 改变只在现有 idle/CAS 边界接受；busy 时拒绝或清楚显示待应用，不能改写正在执行的 prompt/tool realm。

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

因此本接口以 **宿主实时写入 desired 值，DSMM 按捕获边界使用 effective 快照** 实现完整控制范围，而非要求 native form 保存非 volatile 字段或替 DSMM 排队重启。公开 `.volatile()`/`.get()` 和既有 immutable admission 提供可行机制；当前代码尚未完成此组合：`settings.ts:620-628` 只解析一次 baseline，`profile-runtime.ts:45-79` 深复制冻结、`:270-317` 绑定 parent/child，但 baseline/current 暂不随新部署 desired 为新 root 重算，C/D 必须补齐下述接口，不能声称标记 volatile 后自然成立。

这是 C/D 的有限消费接口修订，**不改 A 的 scope/lazy metadata/ancestor precedence/capability 合同、B 的完整 source 同步或 §3.4 delegation 矩阵**。正在执行的 A 继续按已有已解析 settings getter 工作；A 的 settings discovery 只需保留真实 entry/schema/revision 事实，不要求它实现 desired consumer 或自动 Config UI。本文旧称“原生表单/重载”的地方，以本节 volatile-only 边界为准；定制页面与 consumer 接线在 C/D 合入。

#### 唯一持久来源与三种消费边界

- **Desired deployment Config**：只在需要插件 Config 页控制的既有字段/必要子树声明 `.volatile()`，尽量保留现有 serialized path、defaults 和 JSON/YAML 兼容形状；不把整个 Config、未知字段、账户/权限/storage path 一并开放，不添加第二份持久 `desired` 库。运行时 parsed Config 对应部分成为 native Volatile references，serialized Config 与内部 `DsmmSettings` 仍是普通数据。建立窄 adapter：用公开 `.get()` 抽取普通值，再交原 resolver/完整校验及深复制冻结；不能把 ref/proxy 传给 `structuredClone`、profile store 或 runtime consumer，也不能重复把 parsed ref 当 raw Config 再解析。UI 用 native entry ID/revision 和 path `mutate` 保存 active profile Cordis patch，保留 redacted/未编辑普通字段。
- **Startup effective**：plugin `apply` 初期、任何异步 mount 前捕获完整已解析快照；所有持久 native consumer 的 register/mount/dispose、standing preset composition、role provider 可用集合、LSP/process/materialization，以及 sessionPersistence 的绑定，只读这个 startup snapshot。各 late inject/install 也读同一快照，不重新读取 desired。保存只改 refs，不调用这些 disposer、reconcile、重新 apply 或重启动作。LSP/materialization 和其它尚无安全原位构造能力的项，把 desired 与 startup effective 的差异显示为“等待用户显式重启”，不是宿主 pending queue。未纳入 volatile 页的 sessionPersistence/root 等仍是原生启动配置，只读说明，不借 Config 页扩充存储变更授权。
- **Admission effective**：role/skill enable、workflow/routing/guards/recovery 等已可由 Agent getter 消费的策略，默认在**新 ordinary root 的首次 live admission**同步读取一次最新 desired 普通值，并与 startup-only 字段、该次已选 immutable profile overlay 合成并冻结。异步 sidecar/route validation 前捕获版本/值，整次 admission 使用同一份，不在 await 后混入另一 revision；取消/失败不发布半份 admission。旧 root 即使 idle/blank 也不因为 desired 保存自动重绑。old parent 的未来 child仍继承 **parent 已绑定的完整 effective/admission/epoch**，不得读最新 desired；old child亦保持原值。角色/skills 仍不加入 runtime profile overlay allowlist。
- **真正 live**：只有逐字段证明现有 consumer 可安全在原位使用新值、无需重建或扩大权限时才标记 DSMM effective 为 live；native `applies:'live'` **只证明 desired reference 实时更新**。没有证据时按 admission/startup 分类，不增加自动 idle apply/retry/restart 队列。mode 与已有显式 session profile切换继续使用原维护/CAS机制，并不因 Config 保存触发它们。

**角色/skills 的结构边界**：next-new-root-admission 只对本次 startup 已有 substrate/capability 能安全构造的 Agent 层 catalog/filter/provider 生效。Agent-specific skill provider与role tool exposure在各自创建/admission时从冻结配置建立；settings保存不重组现有scope。实际静态 standing root preset的登记/撤销、启动时未挂载的role provider/工具依赖，仍按startup effective保留到用户显式重启，不能为实现on/off中途重挂。C 必须区分“新 admission 内的启用策略”与“启动实际可用集合”：有效可派集合为 admitted策略 ∩ 已挂载能力 ∩ 原权限；desired要求尚未挂载的能力时报告restart-required，不能假称新session已可用。root picker的startup inventory与新Agent实际tool catalog分别展示；仅在目标scope实际effective关闭后，才断言其catalog/dispatch均拒绝。它们不是同一个开关保存后的同步全局移除动作。这样保留完整功能而不伪造host可安全热挂载能力。

#### Profile / 状态投影消费接口（供 C/D 共用）

1. 延续 `getSettings(agent)` / `.admission(agent)` 为所有已有Agent消费者的权威；为startup消费者提供冻结的 startup getter，为新root admission提供单独的 desired snapshot reader。不得把无参数 `getSettings()` 随意改成raw desired，以免原先依赖“已验证global defaults”的消费者读到未admit数据。C明确迁移每个调用者，不建第二个profile runtime。
2. 现有 profile draft → immutable revision → admission/epoch、CAS、session sidecar保持。global selection须保留所选**已应用 immutable overlay**供新root与其捕获的deployment快照合成；不得重读后来改过的draft或从全量effective设置反推overlay。现有Agent显式idle profile切换仅替换获准runtime overlay，沿用它捕获的deployment/结构基线，不借机吸收后来roles/skills的desired值；mode选择仍只改显式mode。新parent在既有CAS后产生的future child继承它的新epoch，但deployment保存本身不改变parent epoch。cold resume按现有sidecar/global选择规则创建新的live admission，使用本次startup与当次desired基线，不承诺已退出进程的旧memory snapshot永久保存。
3. DSMM只读effective投影与native `configForms` desired镜像并列：至少包含entry identity、native desired revision（已观察才报告）、startup实例/generation及其实际能力、new-root可采用值/条件、可选当前session的effective/admission epoch/profile revision；每字段给出capture boundary、source和差异原因（next-new-root / explicit-restart / profile-override / unavailable）。这些是DSMM状态字段，**不是新增host SDK applies/queue字段**；只读投影可复用现有status/RPC路径，但不能成为另一个配置写入口或持久数据库。
4. desired descriptor与effective投影不是原子RPC：未观察到同一revision/generation时显示“已保存，运行状态待刷新/未知”，保留最后已证effective并标来源，不把form回包视作effective acknowledgment。pending是比较结果，不存任务、定时器或自动重启计划；用户将desired改回effective时差异自然消失。status必须脱敏，不暴露Config secrets/真实私有路径。
5. `settings/document-updated`用于刷新desired UI；`loader/volatile-update`若消费只用于更新desired观察/本地只读差异，不触发mount/dispose或自动profile apply。启动构造参数不可通过 `!!js` 等表达式间接绑定desired，导致其它row普通配置变化；真实Loader验收须证明仅选定volatile路径变化，DSMM及依赖没有partial-dispose/reapply。外部管理员手动改普通配置、禁用plugin或restart仍是host authority，DSMM不承诺保护这类操作中的busy sessions。
6. 关闭子功能不增加Git/文件/网络/模型授权。**desired关闭不是立即撤销**：只有在该consumer所属scope真正有效关闭、显式取消或scope销毁时，才失效其pending retry generation并清理工作；旧session仍运行其原admission时不得谎称recovery/LSP已停。不得为“立即关闭”偷重启；需即时中止则由用户走已有明确cancel/host操作，不新增自动机制。

### 3.4 Subagent / delegation

- 沿用 native subagent service + spawn-in-process + tool 的一套生命周期，role provider 只做身份、能力、route/admission 适配。
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
- planner 允许计划 artifact，而不是通用产品写权限。优先 DSH 可表达的路径受限写入；若通用 toolFilter 只能按工具名而不能按路径，使用窄 plan-artifact 能力且在实际执行路径限制项目内获准 Markdown plan 路径，不能开放 shell/write 作为替代。其余 read-only 角色保持拒绝副作用。
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

**依赖**：A 的 scoped contract + B 的 canonical inventory/权限语义，以及 §3.3 的 desired/startup/admission 消费合同。C 可先用纯数据 desired-reader fixture建立捕获边界；D 再接 native volatile refs，不要求 A worker扩展工作范围。

**结果**：所有启用 roles/categories 在各自允许入口可用，native dispatch/continuation/取消/限制真实生效，已有 routing/recovery/guards/LSP/profile 缺口有对应实现或原生等价证据。

**ownership**：`dsmm/src/{roles,role-providers,role-subagents,role-routing,preset-registry,preset-materializer,model-routing,routing-policy,runtime-recovery,recovery-policy,guards,lsp,profile-runtime,profile-types,profile-rpc,profile-remote,settings,status,index}.ts` 的相关部分；对应 native/role/security/routing/recovery/guard/LSP/profile 测试；必要 preset assets；`docs/{agent-presets,model-routing,runtime-recovery,safety-guards,lsp,profiles,settings-status}.md`。

工作：

1. 从 B 清单生成 preset/provider/tool exposure；保留稳定 ID、existing profile route keys 和默认 root 模型权威。新增 category defaults 正确，未知 ID 拒绝；existing twelve role settings 文件不应因新增默认条目损坏。按 §3.3 分离 startup capability/mount snapshot、new-root desired reader 与 admitted getter：startup原生注册不因desired保存重挂，Agent层skill/role catalog在新有效admission捕获，尚未挂载能力显示待显式重启；所有native/headless消费者读相同有效集合，不能一条路径读desired另一条读admission。
2. 按 §3.4 的 source 分组与 root/stage-owner/bounded-child 身份矩阵落实 delegation graph，而非 worker一律leaf：`research`不派任何children，`deep/complex/cross-cutting`保留合法 utility/specialist 委派，root builder保留primary coordinator，native child builder执行bounded-worker合同。统一 prompt/catalog/native/headless 的策略消费者，并落实 read-only 执行拒绝、受限 plan 写入；审计父 preset join 后的 child 同 scope 注册与身份伪造。不要单凭提示词或工具列表声称安全。
3. 完成 one-shot、background opt-in、continuable message/interrupt、结果/typed error/取消/父 dispose、并发容量和 maxDepth。仅映射已证 capabilities，不能给所有 provider 承诺同一组选项。无默认自定义 timeout；需要取消的上层 action 传 signal。
4. 对照现有 OCMM 行为，形成 adapter parity 表并逐个补适用差距：显式选择优先、effort capability translation/floor、role fallback chain 的 omitted vs empty、429 与 generic owner 分离、finite retry、idle continuation generation fencing、child/parent error 关联、取消与删除后无幽灵续跑。DSH 已负责的部分记录 native 等价，不造并行 retry 状态机或假 OCMM task event。
5. guards 只迁移适用行为而非导入全部 OpenCode hooks 名单：shell safety、Git approval、file/write/read-guard 等实际工具 seam、output bounded rendering、plan/question/todo 辅助、depth、interruption。逐项说明 DSH 原生覆盖、DSMM 需补或不适用；例如 canonical tool value 不因显示截断改变。安全层不因 role/common/feature toggle 变成权限授予。
6. LSP 保留现有 opt-in/native MCP/runtime 接入，对照当前 OCMM 可用 LSP 能力（含 symbol-related）补适用缺口、tool availability/只读角色、取消、process teardown；不安装 server，不下载二进制。LSP/materialization及实际native挂载只消费startup snapshot，desired保存不启停进程/重建MCP；真正scope卸载/用户显式重启按原生命周期清理。无法提供的语言 server 如实显示 unavailable，不能登记假工具成功。
7. profile/CAS 与 routing/recovery 联动：将当前构造时固定baseline扩为 §3.3 明确的capture接口，但保留已选immutable overlay、sidecar与权限合同；只在新root admission捕获当次desired，旧root显式profile切换保留其部署基线，parent admission创建future child（包括desired改变后才创建的child），旧child不随全局desired/apply/session epoch改变。只有consumer实际有效关闭/取消/卸载才取消其pending工作并隔离stale events，不能把desired关闭当已关闭。old JSONC/默认结构、route声明与actual route、root native picker语义保持。

**证据**：mock LLM 驱动真实 native工具 dispatch、child tool/useful result、同 child continuation、typed failure/abort；未知 toolFilter 和 unsupported capability 明确拒绝。共享 policy fixtures 同时检查 prompt/catalog 与 native/headless 实际执行：在深度/权限明确足够的 fixture 中 `deep → coding` 成功并返回有效结果，`research → code-search`及任何其它 child均拒绝；`deep → planner/reviewer/normal-task/complex`拒绝；root builder能发起获准正式阶段，bounded child builder能调用获准utility但不能派planner/peer coordinator，冒用root身份拒绝；planner/reviewer的read-only utility允许而quick拒绝。禁止项直接调用/重注册绕过同样失败，sentinel和permission pins不变，disabled role不可派。另测native默认maxDepth=1触顶可解释（不能让默认深度挡住上述合法policy测试而误判全部拒绝为正确），超并发按宿主拒绝/排队行为而非伪成功；手工 native model/effort 不被 profile 改写；429、fallback、dispose、旧 epoch 迟到结果不复活；enabled LSP 实际 round trip 与 disabled/dispose 无残留。

**配置消费补充证据**：旧parent开始运行后保存desired关闭role/skill/recovery；其当前scope及随后创建的child仍持原effective/epoch，新ordinary root才采用新admission，在该新scope验证disabled role catalog隐藏且dispatch拒绝。改回on在已有startup substrate内的新admission恢复；缺startup挂载则明确restart-required且不伪注册。旧root显式profile切换不顺带切roles/skills，新旧profile revision无draft串用。LSP/materialization desired差异不启动/停止进程、不reconcile、不处置busyAgent；startup getter与admission settings均无Volatile引用泄漏。

**commit**：`feat(dsmm): complete native role delegation and runtime parity`。

### 阶段 D — 原生插件 Config 页、真实 feature controls 与安全状态展示

**依赖**：A 的真实 settings metadata contract、B inventory、C 的 §3.3 capture/getter/effective投影接口完成；可提前只读确认 UI entry，但不要同时更改共享 schema。D负责native `.volatile()` refs与C纯数据接口桥接，不将此接口修订回派正在执行的A。

**结果**：从宿主插件管理选中 DSMM 进入 Config，用户能保存完整范围中可控制features的desired值，并分别看到startup/new-root/current-session的effective与差异。成功文案只承诺desired持久化，不声称已应用或host已安排重启；与Profiles/header/model picker无冲突。

**ownership**：`dsmm/src/client/**` 的新 Config contribution 与必要 controller/component/style；`src/{settings,status,index,profile-runtime,profile-rpc,profile-types,profile-remote}.ts` 的refs桥接/状态投影；`locale/{en,zh}.json` 与 client locales；**已有** `dsmm/DESIGN.md`、`docs/{design,settings-status,profiles,compatibility}.md`；相关 client/native settings 测试和隔离 browser harness。

工作：

1. 沿rc.2 `PluginManagerPage` 的真实身份路径接入：entry页通过 `plugins.item.id` 与settings namespace匹配，传入form `state/mutate`；bundle页用 `plugins.bundle.config`（key=package），row页用 `plugins.row.config`（key=`package#row`），**bundle不会自动出现entry form**。DSMM是bundle，要显式注册适配其package/row的Config contribution，并将所选真实row entry ID绑定到 `configForms.get(entryId)`；不把package key误作namespace、不硬编码所有实例都是`dsmm`、不写错误row。复用 `whileServed` 的注册/withdraw生命周期；不靠 `autoGenerate`，不以 `settings.plugins.tab` 冒充页面。Settings Profiles section保持独立用途。
2. 先复用**已存在166行的 `dsmm/DESIGN.md`**：其nativeDSH tokens/primitives、布局、a11y与反馈约束是现有设计基线，不另建品牌/新app入口/CSS框架。增补Config页desired/effective/capture-boundary呈现和无queue的重启说明；将其中第112/116/124行附近standing DW locked-enabled描述同步为A已定的explicit-off/common/persona语义。第134行区分Profiles不用configForms持久模型的说明仍适用Profiles，但新部署Config页正应使用nativeconfigForms，不再一概禁止。无需安装react-grab/react-scan/react-doctor。
3. 对照inventory/schema列出每个feature的desired字段、完整验证、实际consumer及capture boundary；只将需要nativeform编辑的字段/必要子树标为volatile，并在runtime类型中正确接 `.get()`。覆盖Deepwork默认、每个适用skill/role/category、routing/effort、workflow、guards/helpers、recovery/idle continuation、LSP、preset/materialization以及C已证的subagent controls；不把所有结构都标为“effective live”。保留非editable startup storage/路径/账户/hostpolicy只读说明，不包装成假开关或扩权入口。普通serialized配置向后兼容，profileJSONC不纳入Volatile或roles/skills字段。
4. 以 §3.3 的DSMM状态投影展示desired、startup actual、next-new-root适用值/限制，以及明确session的admitted值；role/skill默认新root捕获，旧parent的future child仍继承旧parent，依赖未挂载或静态rootpreset变化则显示等待用户显式重启。LSP/materialization不承诺保存时启停；没有SDK `requiresRestart/queuedIdle` 字段，也不自行维护queue。只有证实的consumer支持原位live才显示立即生效。对保护相关控制说明desired off不等于当前session已解除保护，host授权始终必需。
5. 写入只走native form path `mutate`/entry revision与完整Config校验，优先精确set/unset，不用redacted全量replace丢失隐藏字段；处理stale/conflict/非法schema/服务断开/只读或非loopback不可写。nativeLoader仅更新选定volatile refs，必须证实保存不会触发DSMM及其依赖partial-dispose/reapply、`reconcileRolePresets`、LSP重建或busyAgent取消；不同row/ordinary字段/上下文变化不混在同次feature保存里。不能用ProfilesCRUD、手写patch或额外数据库代替此持久路径。Profiles的draft/save/apply/CAS继续独立。
6. 保存成功只报“desired已保存”；即使native descriptor `applies:'live'`也不能报告consumer已生效。revision/effective不同步时保留已证实际状态并提示刷新。pending只是DSMM内存比较，不persist任务、不自动重试、不idle后偷应用。EN/ZH与sanitized错误完整；withdraw/换entry/断线重连/卸载正确dispose，无旧entry写回；不泄露secrets或provider原始响应。
7. 同步session menu的explicit-off/persona/common区分、sessionless/busy状态；普通主模型仍仅原生picker/明确Use profile model action控制。对确需重启的设置提供清晰用户操作说明；**不将hostrestart连接到save、mount effect或后台监听**。若提供现有原生restart入口，必须标示其取消session的host语义、由用户独立明确操作，不能声称busy安全或queued restart；本任务无需新增restart按钮，说明原生操作即可。

**证据**：真实浏览器通过DSMM bundle/row Config入口操作正确entry，编辑→nativevolatile settings写入→active profile patch与descriptor revision→同fiber refs原位变化→DSMM desired/effective投影；不能只挂一个表单跳过PluginManagerPage身份路径。busy root持续运行时保存role/skill/recovery desired，无DSMM/依赖partial-dispose、sessioncancel、自动restart或scope重构；旧root及新生child保持旧epoch，新ordinary root采用新有效策略并通过off/on catalog/dispatch回归。LSP/materialization保持startup actual并显示显式restart-required，随后在run-owned fixture中独立、显式重启host，验证新startup接纳desired并正确清理旧资源（不把host取消session说成DSMM安全排队）。stale save/非法值/断连/只读namespace失败不篡改配置；desired回退使差异消失，无隐藏queue；profile apply不吸收新的deployment结构、native模型不变。键盘焦点、读屏名称/live announcement、窄窗/深浅主题/长中英文文本、desired保存与effective未知/待新root/待显式重启可区分；运行中允许安全desired保存不等于允许对当前sessionapply。

**commit**：`feat(dsmm): add native plugin feature settings`。

### 阶段 E — 集成闭环、分发完整性与最终可用证据

**依赖**：A–D。若只剩验收且没有文件变更，不创建 empty commit；集成所需 tests/harness/docs 收尾构成本阶段正常 commit。不能把前几阶段漏做的核心功能拖成可选 follow-up。

**ownership**：`dsmm/test/**` 必要集成测试、`dsmm/scripts/**` 的 keyless acceptance/sync checks、`dsmm/package.json` 的测试/资源清单（不 bump/publish）、`README.md` 与 dsmm相关维护/兼容文档；不改 release workflow 作为本任务捷径。

工作与证据：

- 用一套 run-owned empty profile 完成“普通 preset off → on → metadata → load skill/reference → dispatch permitted role → native child continuation/result → Config保存desired → 旧parent/新child保持原admission、新ordinary root采用新effective → 必要时用户独立显式restart后startup生效 → dispose”用户路径；另一并行session保持其scope/admission。已有mode/profile idle CAS另行回归，不能把它当deployment保存后的自动queue。再走显式role preset与explicit-off的反向路径。
- 真实 Loader + native service + keyless mock LLM，不以 fake ctx 注册和固定成功日志替代；记录实际 assembled prompt/registry结果/工具执行与拒绝/settings持久化/epoch，在敏感信息不存在的 fixture上保留必要截图/状态。
- 同步 checker/资源完整性/生成 role assets/check:release（先确认它只读、不发布不安装）验证包结构。检查 npm `files` 与 client bundle 包含完整资源，不引用 source checkout、全局 host 或私人绝对路径；本地 pack 如需仅写 run-owned temp，不做插件安装。
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
| 资源只在repo可用 | 从临时分发树resolve全references/scripts/assets，无越界私人路径，无漏包 |
| 注入内容诱导越权 | 项目skill/文档/tool输出中的“忽略权限/派peer/做Git写”不能改变dispatch/approval/path guards；项目skill优先不等于权限提升 |

## 6. 风险、裁定、升级条件

1. **最新已定，不再询问 channel。** rc.2 类型/代码与tag不一致时先报告具体接口差异；不能跟随main/alpha“修好”。代价：若基线真缺必要能力，需要用户决定依赖/host变更，而非静默降级。
2. **role 默认 common on、explicit off获胜。** 理由是保留 DW role 选择的默认意图，同时纠正强制注入且支持用户明确关闭。代价是更新既有锁定label、模式测试和文档；若有不可兼容的旧数据语义，先列具体迁移影响，不删除用户配置。
3. **完整 parity不等于完整OpenCode hooks复制。** 每项源行为都必须落到native等价/适配实现/有据不适用；只有宿主不存在的接口可以说明不可用，不得把关键需求推为以后再做。
4. **权限安全优先于假同构。** DSH toolFilter按名称可能不足以支持planner plan-only写，必须用真实执行约束。缺少安全实现路径时返回blocker，不能给planner通用shell/写权限；背景/续接同样不能绕maxDepth/approval。
5. **volatile是desired transport，不是consumer live承诺。** rc.2公开refs原位更新与现有deep-frozen admission支持本方案，当前固定baseline需C显式分拆reader/capture，不能只把schema标volatile。仅选定volatile路径且active fiber/context不变才走Loader原位路径；若真实fixture出现普通字段间接diff、其它row重挂、raw-ref泄漏或busyAgent被取消，则停止该字段Config控制的接线并报告精确依赖，不能掩盖为成功/暗中排队重启。rootpreset/provider缺startup挂载时如实待用户显式重启；旧root与未来child保留旧admission是承诺，不是缺陷。用户自行hostrestart可取消session，保存不会自动触发；不新增host/API/数据权限、配置库或retry/queuedrestart状态机。DESIGN.md已有native基线仅按本界面合同更新，不新造品牌。
6. **不安装/不登录是硬边界。** 已有软件不代表所有browser binaries/module resolution都可用。缺依赖时列准确名称、已有替代与所阻验收；请求授权由orchestrator负责，不假装完成或降为MVP。
7. **同步维护会暴露源策略冲突。** 按用户已批准的DSH工具/安全语义改写OpenCode专用细节；如果两源对权限或公共行为冲突且证据不能裁定，升级给orchestrator，不随意挑更宽松文本。
8. **安全回退**只关闭/撤销本次feature scope并保持宿主原有普通preset、permissions和数据；不自动卸载用户插件、重写用户profile或用破坏性Git回滚。实现后的revert等Git动作需另有具体授权。

目前**没有需要用户再次选择的设计 blocker**：版本channel、完整范围、提交方式与环境禁止项均已明确；本次desired/effective方案有rc.2公开API和既有snapshot证据，不依赖未证的nativequeuedrestart。尚未执行的volatile-only真实Loader保活、bundle/row页面身份绑定、profile基线拆分回归、planner受限artifact工具和浏览器可用性仍是实施验证点，不是假定已通过。仅当这些具体验证证明安全路径不可行时携带事实升级，不重复问版本/范围审批；此次只交父同一critic session复核受影响settings/C/D/验收内容，A/B及delegation政策不重开。

## 7. Handoff 与完成定义

由 orchestrator 将本 plan 与既有 internal/external/clarifier evidence 交 `plan-critic-high`；planner不dispatch。material blocker需要修正、证据反驳或升级，non-blocking建议不阻实施；只在实质输入变化后复查相关部分，不设固定收据/hash/无限审查循环。

完成必须同时满足：rc.2真实API与scoped lazy registry可用；完整11+11及适用prompt/skill资源可追溯且能运行；subagent与已有runtime边界真实生效；原生插件Config页可保存并有安全effective state；所有必需验收和阶段commit完成；用户资产未改、无安装/私人profile/auth访问、无push/release。最终交付报告给出阶段commit IDs、实际测试/界面证据、native等价或N/A理由和任何未验证项。只完成plan、文本同步、注册日志或某次CI绿色都不等于产品parity完成。

## 8. 阶段验收记录

### A：原生 scope、惰性 skills 与等价清理

- 使用真实 rc.2 Cordis Loader、AgentLoop、SkillRegistry、skill tool 与本地 mock LLM，证明 scope-only prompt callback 正常；普通 preset 开启模式和 DW role 都只列 metadata、调用后读取正文；explicit-off 保留 persona/权限但撤销 common 与 bundled skills。祖先项目同名候选经 native invalidation 增删后正确避让/恢复，两 session、signal、rebind、卸载与读前后 fencing 均有实际结果断言。
- 独立审查发现并闭合跨 registry 广播与本 registry cache 的差异：去掉 cached locator 的永久 generation 绑定，保留每次 I/O 的 generation、parent、祖先完整性/winner、mode 与取消检查。真实双 registry 回归先复现缓存 get 永久失效，再证明 foreign change 后可恢复、in-flight stale 仍拒绝且无通知反射循环。
- 最终并行重验暴露测试 Host 共用 `DSH_HOME` fallback preset root。受控双 Host 对照确认 guard 拒绝是正确行为；fixture 改为每 Host 独立标记目录/default preset root，仍允许共享 profile store，尊重调用方显式 preset root。修正前后回归和共享根再次拒绝均已验证，产品 ownership guard 未修改。
- 删除失效 settings.register、同步 skill 正文 loader、闲置假类型/maintenance fallback 和重复生命周期簿记；保留真实权限、generation 与 native teardown，不机械拆模块或合并原生集成与独立单元边界。旧 preset-skills no-op 仅待 B 移除其生成消费者，不能将它描述为另一个有效 skill provider。
- 最终产品与测试 typecheck、实际 build 已通过；最后输入下完整 DSMM Node suite 为 **638 passed、0 failed、0 skipped**（143431.507 ms）。相关 135 项回归在默认文件并发下通过；`check:release` 只读 dry-run 为 `ready`，173 files、0 forbidden surfaces、0 errors，不表示发布或安装。
- 根 OCMM 相关输入未变，复用既有通过证据；DSMM 版本保持 0.1.9。未安装、调用收费模型、访问私人 profile/auth、push/tag/release。B 的完整 22-role/14-skill 同步、C 的实际 delegation/admission 和 D 的 Config 页仍待实施，不能用本阶段绿色冒充完整 parity。
