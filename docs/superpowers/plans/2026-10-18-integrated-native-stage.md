# DSMM 0.3.1：DSH rc.2 原生集成与交付

## 目标与范围

交付 **`@dsmm/dsmm@0.3.1`**，仅面向精确 DSH **`0.2.1-rc.2`**。以原生公开能力统一设计配置、角色、技能、模型、权限、执行、存储、客户端及发布资源，不限于替换执行 owner 的接线。Deployment、Profiles、CAS/sparse、drawers、lazy skills、generic model routing、权限和 children 已有实现；保留其有效用户需求，按本设计复用、简化或重构，不将其列为从零建设，也不将旧实现当作不可改变的设计。

已有行为以 rebase 前已知基线、已核对的迁移前 **index**、[旧 native parity 的有效功能要求](2026-10-07-dsmm-native-parity.md)与现有测试为依据；不重新挖掘历史或重复完整上游调研。未提交重写不是新的兼容契约，源码删除也不能降低验收。工作区原生 core 和 profile/model 修改是待整合实现，尚无完整行为证据；旧 `lib/` 的通过结果不能证明新源码。

本文件是本阶段范围与实施顺序的总入口：

- [原生 rc.2 技术设计](2026-10-18-dsmm-native-rc2.md)定义公开接口和安全边界，[路线图](../../../dsmm/docs/roadmap.md)保留能力缺口；本文件是完整体系的实施和验收入口。
- 仅处理 DSMM 及其直接交付入口：`dsmm/`、这两份计划、DSMM 专用 workflow、根目录 DSMM 专用发布支持，以及必要的 workspace 依赖声明。共享提示词和技能仅作为既有资源消费；不修改 OCMM/OpenCode/Codex 源码、指引、模型默认、配置信任、生成插件或安装。
- [旧 native parity 计划](2026-10-07-dsmm-native-parity.md)的适用功能目标由下表承接；其中旧 SDK、替换存储 owner、双 Runtime、旧恢复与后台协议不是本阶段的兼容要求。旧文件不作为另一条并行实施指令。
- 已发布 `0.3.0` 的包、标签、资产及 rc.1 身份不改写、不重发。`0.3.1` 使用新的版本契约和标签，不重做历史 rebase、安装或冲突清理。

当前授权为：先完成计划及由主执行者组织的计划审查，再实施、必要验证、清理本任务自有废物/失效产物，提交 DSMM 相关变更，push/tag 发布 `0.3.1`，最后安装系统 DSH Desktop 插件。开发与交付分阶段，不提前发布。本 planner 只更新三份计划文档，不实现、不派 agent、不执行 Git 写、发布或安装。执行者保留所有用户 dirty/staged/stash；不 reset/stash、整体覆盖或混入 OCMM。仅授权 Desktop **插件**安装，不升级宿主，不修改 credentials、真实 session 或无关系统配置。开发验证用任务自有 home/profile/session 与空浏览器上下文，不复用用户认证；付费外部调用另行授权。

## 既有功能保留边界

下表是最终功能契约，不代表每项要重写。内部结构、schema 表达和控制器可因原生能力而重构；现有数据隔离、CAS、显式值和不自动迁移要求不能被简化掉。变更公共协议、数据保护或权限边界须升级决策，不借“重构”扩大授权。

| 工作项 | 本阶段必须达到的结果 | 实现边界与主要区域 |
| --- | --- | --- |
| 单一 DSH 基线 | 依赖、引擎、开发载体及下一版本契约使用精确 `0.2.1-rc.2`；不增加旧 SDK 分支 | 包声明、锁文件、bundle、开发脚本；历史发布身份不改成新 SDK |
| Core 与可选 Deepwork | 无会话及 Deepwork 关闭时 Core 配置和原生权限可用；普通 off 会话不收到工作流/技能正文；显式 off 优先于 DW preset 默认 | `index.ts`、配置及模式整合；关闭不解除 persona 的只读限制或原生审批 |
| 角色与资源 | 保留适用的 11 个基础角色、11 个类别、14 个可配置懒加载技能及可选 cross-cutting；目录、根资格、模型可用性分别判定 | preset/provider、角色与技能资源、源生成器；数量是当前产品目录，不增加数量或文本锁测试 |
| 技能发现与加载 | Agent 作用域内 metadata discovery 与按需正文加载；保留非 DSMM 祖先资源赢家；中断观察不等于资源不存在 | 技能发现/读取入口与资源同步；不递归扫描、不回退到全量正文、不递送失效正文、不形成失效通知循环 |
| Deployment 编辑器 | 原生 Plugins → DSMM 为部署入口，Global 与当前 native profile 独立 Save/Refresh/Discard，模块抽屉和有限 Advanced JSON | 现有 Deployment UI、`deployment-config`、配置提交与 RPC；不再设计第二个配置中心 |
| 配置层与事务 | defaults → sparse Global → explicit native profile → admitted named overlay；对象合并、数组替换、显式 false/empty/same-default 保留、Unset 只改本层 | Global 保存保留并发与原子替换保护；profile 保存使用原生 form revision；不伪装跨层原子事务 |
| Profiles 与生效时机 | 命名文档与选择状态分离；选择/会话状态限定到准确 native profile 和 entry；草稿、保存、未来默认和当前实际值明确 | Profiles、配置快照及 status；旧数据保留但不自动导入或用同名 fallback；运行中任务不吸收后续配置 |
| 模型路由与参数 | 普通根 Agent 保留原生模型选择；Use profile model 为独立显式动作；角色 normal 与显式 low/high/max、通用参数及有序 fallback 可配置 | `model-routing`、路由/preset/provider；保留显式覆盖与新的手工意图，不恢复品牌专用默认表 |
| 委托与子任务控制 | 官方 activation 完成基本角色调用、结果、取消和支持的直接子代理控制；只读后代视图不授予控制权 | 角色工具、provider、preset 与原生服务；不新增队列/调度器，不以 child ID 或 accepted 回执宣称完成 |
| 调用与身份显示 | 收起行 `调用 Coding`；子代理 `Coding: 任务描述`；partial、失败、中断、当前格式重放和 PTC 保持身份语义 | 现有 RoleToolView 与原生 toolview slot；请求身份不冒充实际执行身份，原生安全拒绝展示优先 |
| 权限与审批 | 原生身份、工具过滤、只读、深度、sandbox、调用归属及明确拒绝规则仍有效；DSMM 不产生另一个审批队列或可重用授权 | 权限规则、工具执行入口、Gateway/Settings RPC；不根据标签、模型输出或日志 metadata 授权 |
| 生命周期与恢复 | 创建、投递、取消、插件卸载及资源释放使用原生 owner；配置不能跨调用借用一次审批 | 官方 Registry/Runtime/JSONL；高级 Apply、冷恢复、同次后台交接按下述边界提供或明确不可用 |
| 网络和辅助能力 | Fake-IP 仅例外 `198.18.0.0/16`；Search/Fetch 复用明确配置的原生 provider；LSP 能力按真实接口展示 | provider/runner 的真实网络边界，不能用工具 Allow 或关 sandbox 代替；不自动启用外部 LSP 或外发原始问题 |
| 可交付资源与 UI 品质 | 当前源码与生成资源一致；插件包不依赖私有路径/全局 checkout；配置和调用 UI 保持原生组件、键盘与无障碍语义 | 自有 generator、`lib/`、资源与许可证、原生客户端；无实际渲染证据时不声明视觉或 Electron 验收完成 |
| 发布完成与交付拆分 | `0.3.1` 的 npm publication、GitHub Release delivery、Desktop 插件安装分别报告，失败或未知不能互相冒充成功 | `.github/workflows/dsmm-release.yml`、DSMM release controls；开发验证完成后执行授权交付，保留不可覆盖、来源、包完整性及宿主边界 |

## 全体系职责与跨域接口

依赖主链为 **配置源/原生 form → 完整不可变候选 → Agent 准入 → 模型/工具执行 → 官方 activation 结果/目录 → 客户端投影 → 包与交付**。权限撤权和 lifetime 横跨整条链；UI、日志、provider 名称和序列化配置均不能反向生成执行权限。

| 领域及落地文件（相对 `dsmm/`） | rc.2 原生责任／公开接口 | DSMM 最终责任及处理方向 |
| --- | --- | --- |
| 配置层：`settings.ts`、`deployment-config.ts`、`config-file-store.ts`、`modules.ts`、`status.ts` | Loader entry/profile、volatile Config 解析、`SettingsForms.describe/mutate` 与原生配置编辑器 | 复用 sparse 合并和 Global 原子 CAS；重新按 desired/mounted/admitted 分类字段。删除仅选择旧 owner 的字段，不能借此删功能开关。状态由真实来源产生，不保存第二份有效配置。 |
| 原生事务：`managed-settings.ts`、`deployment-permission-rules.ts`、`client/deployment-controller.ts`、`deployment-workspace.ts` | `ConfigForms.get(ns)`、`ConfigForm.mutate(ops, revision)`、`SettingsForms.mutate`、公开 `ConfigEditor.edit(entry, change)` | 复用原生 form owner，DSMM 只提供 sparse 校验与权限变更协调。已存在的 caller-scoped editor façade 限于 DSMM entry，不能变成另一配置服务或全局 patch；原生事务不足处见下文。 |
| Profiles：`profiles.ts`、`profile-store.ts`、`profile-runtime.ts`、`profile-rpc.ts`、`profile-types.ts` | 原生提供 entry/profile/session 身份，不提供 DSMM 命名 overlay 事务 | 复用命名文档、pointer 和 CAS 存储；重构 runtime 为候选构造、提交结果和只读投影，移除执行 owner 职责。磁盘观察与 live admission 分离。 |
| 模式和模型：`state.ts`、`mode.ts`、`model-routing.ts`、`role-routing.ts`、`role-invocation.ts`、`runtime-recovery.ts` | 原生 `selectModel`、`system-prompt/assemble`、`agent/request`、`agent/request-error`、`agent/assistant-stream`；LLM registry/catalog/`prepareCall` | 复用角色解析和参数验证，重构 route 的时序/来源绑定。普通根由原生选择主导；按动作拆分模式切换、Use profile model 与 overlay Apply，不共用一个禁用开关。 |
| 原始模型参数：`host-llm.ts`、`llm-runtime.ts`、`role-llm-runtime.ts`、`live-pi-ai-owner.ts`、`native-pi-ai-wire.ts` | `LlmCallConfig` 只含 provider/model 和 effort/temperature/maxTokens/stop；`LlmRuntime.prepareCall`、`LlmAdapter.prepareCall`、`llm/stream` | 不默认保留整套 LLM owner，也不将 arbitrary 参数静默丢弃。标准路径委托原生，raw 参数仅保留有明确缺口的最小公开适配；具体边界见模型段落。 |
| 技能/资源：`skills.ts`、`preset-skills.ts`、`prompt-content.ts`、`prompts.ts`、`roles.ts`、`preset-materializer.ts` | Agent scoped skills `registerProvider/snapshot`、`agentPresets.serviceFor`、原生资源定位及失效 | 复用 metadata/list/get 懒加载与祖先赢家逻辑；收敛安装到一次准入所有的 scope，避免每个 Agent 再注册全局生命周期协调器。角色资源表达 persona/可用技能，不携带每次调用可变路由。 |
| Presets/执行：`preset-registry.ts`、`native-admission.ts`、`role-policy.ts`、`role-providers.ts`、`role-subagents.ts` | `agentPresets.register/composeFrom/composedPreset/serviceFor`、官方 Registry/Runtime/spawn | 重构为 immutable pending → awaited created → live admission；官方 activation 是唯一运行/结果 owner。目录、root 资格和模型可用性独立。 |
| 权限：`core-permissions.ts`、`core-permission-authority.ts`、`permission-control.ts`、`permission-*.ts` | 原生工具注册/过滤/执行、审批、sandbox、operator/Gateway 身份 | 保留 DSMM 显式规则和只读收窄，重构证明到 exact Agent/ToolExecution/definition/realm/lifetime。移除旧 ticket/job，而非移除调用级检查；不复制原生审批队列。 |
| 生命周期/持久化：`index.ts`、`runtime-integration.ts`、`lifetime.ts`、`session-scope.ts` | 官方 `AgentRegistry`、`SubagentRuntime`、JSONL namespace、activation `dispose`/drain | 集中组合顺序、scope 退役和配置关联；不保留 custom Registry/Runtime/companion。展示 metadata 不恢复权限；unsupported 冷恢复明确拒绝。 |
| Children/客户端：`role-control-{rpc,remote,types}.ts`、`client/{children-controller,ChildrenPanel,controller,SessionProfiles,RoleToolView,RoleToolView-data}.ts*`、`role-identity.ts` | 官方 catalog、`prompt/sendMessage/interrupt`、原生 session/model 投影、`tool.call.toolview` | 重构 DTO 为必要投影而非第二状态机；复用 drawer/controller 交互与身份解析。保留 operator/connection、严格解码、真实 capabilities 和错误分类。 |
| 包/发布资源：`cordis.patch.yml`、`patches/`、`scripts/generate-role-assets.mjs`、`scripts/sync-source-assets.mjs`、`package.json`、release controls | 原生 bundle、Plugin Manager、npm/GitHub 发布接口 | 自包含官方组合、实际 public exports 和许可证；新建精确 `0.3.1` 发布契约，不继承旧 owner 清单。生成 DSMM 资源而非修改共享源或 Codex 包。 |

### 配置输入、原生 form 和生效契约

1. **层与存储。** defaults → sparse Global → 原生 entry 的 explicit profile 配置 → admitted named overlay。对象递归合并、数组整体替换；`false`、空值和显式等于默认值都保留，Unset 仅移除当前层。Global、原生 profile、命名文档、选择 pointer 各自 CAS，不伪造跨层原子性。旧路径/同名文档不能自动导入或代替当前 `hostProfileKey + entryId`。
2. **原生 form。** rc.2 `SettingsForms` 只投影 volatile 路径，`ConfigForm.mutate` 走原生 revision 与持久化。`settings.ts` 已将 deployment 输入做成无业务默认的 sparse volatile 节点，这一方向可复用：volatile 表示 desired 值可更新，不表示活动 Agent 策略已变。普通冷字段（例如现有 `sessionPersistence`）不送入 mutate；若只是旧 owner 配置则退出新 schema，若仍是官方挂载输入则留在原生冷配置入口并显示 restart-required，不改成 live 以迎合 UI。
3. **编辑数据流。** `DeploymentWorkspace` 按准确 entry/profile/namespace 绑定 form，使用原生 `base/user` 保留继承；controller 只提交 path set/unset，不能以 redacted snapshot 整体 replace，不能写到错误 entry 或退写 Global。保存、Refresh、Discard 和 dirty 导航独立。原生 Plugins 页面和 DSMM RPC 的旁路入口都要进入同一权限变更边界，不只防自定义按钮。
4. **提交与撤权。** DSMM Global 和 Profile store 保留 prepare → CAS/原子写 → committed → observation。原生层使用 `ConfigEditor.edit` 的原事务；必要 façade 在 change 中校验 DSMM 候选，写前开始相关权限撤权，写后同步实际源。仅权限有效输入变化才撤权，不因无关 locale/显示或模型字段变化否决已批准调用。写失败不安装候选；已写成功但观察/通知失败报告 committed + refresh-required/unsynced，不把它报成未保存而诱发重复写。原生 API 的失败若无法区分 commit 与通知，则返回明确 unconfirmed，重新观察，绝不盲目重试。
5. **候选与挂载。** `prepareRoot` 产出完整 baseline、selection/source revisions、epoch、warnings、startup capture 与 mounted ceiling。`native-admission` 消费候选并绑定 Agent，不重新合并配置；running root/child 不吸收后续 desired。Core 配置/权限即使 DW-off 或没有 session 也可用，无会话的实际 admission 为 unknown。
6. **动作能力。** editor Save/未来默认选择、`canSelectModel`、`canToggleMode`、`canApplyOverlay` 分别计算能力和原因，名称可沿用现有 DTO 风格。Use profile model 只调用原生 `selectModel`，验证 session/配置及 manual-intent watermark，不写 overlay pointer；同值重选也算新意图。DW off/on 受 master/mounted ceiling、角色只读及当前安全边界约束；unsafe live Apply 不可用不等于所有模式/模型动作不可用。若开关需要改活动权限而无法安全绑定，仅该动作要求新会话。

## DSH rc.2 的架构决策

### 原生 owner 与创建边界

官方 `AgentRegistry`、`SubagentRuntime` 与 JSONL namespace 插件拥有执行和持久化。DSMM 的必要状态限于配置、角色路由、不可变的当前准入及展示关联，不复制 activation、队列和资源回收。

`agent/created({ agent, source, signal })` 监听器串行等待完成，AgentLoop 在此期间不释放排队输入，可以用于执行前初始化与校验；它发生在 Registry publication 之后，不是 unpublished setup，也不是所有消息投递或恢复路径的通用授权钩子。监听失败由 factory 回滚，早先观察者可能已经看到 created，必须容忍配对 disposed。监听器不得等待 `agent.whenIdle()` 或自己的 owner disposal。`subagent/start` 是发布后通知，不能承担创建前准入。实施分别覆盖根创建、角色 spawn、原生消息工具、Gateway、resume、空白会话 preset 切换和 owner disposal。

rc.2 preset 定义没有 child-only/root-eligibility 字段。注册 Coding 等辅助角色 preset 前，必须在有效创建路径保留根资格限制及工具/只读策略；可发现不等于可执行。`prepareContinuable` 只返回创建数据，不接管生命周期，也不能假定其可返回动态 preset 或路由句柄。角色创建使用公开的 preset 请求与 provider 能力；按调用选择的配置必须在输入释放前正确绑定，不能通过共享可变 provider 默认值串扰并发任务。

移除的是 `DsmmAgentRegistry`、自定义 Runtime、delivery authority、RoleRun/job 和 companion 的执行/存储 owner 责任，不是其间耦合的配置事务、调用身份、权限收窄或展示责任。已删除模块不为找回业务功能整套恢复；从 index 按职责提取必要逻辑接入官方服务。自动组合改为**自动接入官方服务与 DSMM 功能**，旧 `runtime.enabled`/cold selector 只在确实用于选择被撤销 owner 时退出；原有 desired/mounted/restart-required 的真实状态语义保留。

### 每次调用配置的具体绑定

实施集中在 `dsmm/src/role-invocation.ts`、`role-providers.ts`、`role-policy.ts`、`role-subagents.ts`、`preset-registry.ts`、`profile-runtime.ts`、`index.ts`；`native-admission.ts` 仅承载以下创建记录和 live admission，`lifetime.ts` 仅承载作用域退役，不承载执行队列、配置事务或结果状态机。

Core 配置/RPC/权限不以 `subagents` 存在或 Deepwork 激活为安装前提；DW 接线单独依赖官方服务。启动顺序为 Core/config 服务及受控执行 guard → awaited creation 监听 → preset/provider 注册完成 → 暴露角色工具。配置读取失败或安装未完成不得放行 DSMM 执行；已经运行但没有本进程可信绑定的 Agent 不自动收编。创建准备中的组件使用候选快照的私有 getter，不能因 live WeakMap 尚未提交而回退 deployment defaults；完成安装才发布 live admission。

1. **工具入口捕获。** 从 `exec.agent`、`exec.callId`、`exec.signal` 和当前精确 ToolDefinition 取得调用归属；校验 live Registry 对象、父角色可委托集合、工具过滤、深度及模块状态。用父 Agent 已绑定的不可变配置调用 `resolveRoleInvocation()`，保留 normal／显式 tier／显式 route、模型参数来源及候选顺序，不读取刚保存的 desired 配置替换父配置。
2. **预留与注册。** 生成本次唯一 `SessionId`，创建短生命周期 pending 记录：childId、精确 parent 对象、父 admission 引用、callId、target、独立冻结的 invocation/settings、权限上限、期望 preset/provider 对象和初始化 signal。记录由本次调用持有，不能由 args、日志或浏览器传入。以 childId 索引并核对全部关联，不以 childId 本身授权；同父、同角色并发仍是两份记录。注册后才调用公开 `subagents.startActivation({ childId, provider, label, request: { parent, agentPreset, agentOptions, prompt, maxDepth }, signal, delivery })`。
3. **provider 只供 seed。** 保留角色 provider 仅作为无状态的公开适配：`capabilities.agentPreset/agentOptions/depthLimit` 与实际 spawn 能力一致，`inheritsParentContext: false`。其 `prepareContinuable({ sessionId, parent, signal, cwd })` 必须匹配 pending 及当前 provider 身份，然后调用原生 spawn 的 `prepareContinuable` 并仅返回无父历史的 seed 数据；移除 `currentManagedCreation()` 依赖。请求中的 preset 和路由在步骤 2 已选好；prepare 的参数没有 route/preset，返回值也没有这些字段。不得修改共享 `agentRouteDefaults`、provider config 或 standing preset 来实现一次调用覆盖。
4. **awaited 绑定。** 全局创建监听在普通消息释放前读取 Registry 的 live Agent 与 ownership、session header 的 origin/parent/depth，以及 `agentPresets.composedPreset(agent.ctx)`。DSMM 子代理必须命中未消费的 pending，且精确父对象、父 admission、childId、preset、provider、signal/lifetime 均有效。不要依赖此时一定已有 subagent descriptor。完成角色/模型/只读/过滤交集检查，在 `agent.ctx` 安装策略、请求路由、角色工具与技能，再把冻结 admission 绑定到精确 Agent 的 WeakMap；所有异步准备结束后再校验父仍 live、调用未取消、owner 未退役，然后一次性消费记录。初始化期间不得产生模型请求或工具执行。
5. **失败与清理。** 创建拒绝、prepare 抛错、调用取消和 owner teardown 都释放各自 pending；没有创建成功也不能泄漏下一次可消费的记录。以 `try/finally` 释放本调用关联，避免只依赖 abort 清理。`agent/disposed` 释放 live 关联；初始化抛错依赖原生 factory 回滚，不自行调用私有 manager 或在监听器内等待自己的 teardown。`subagent/start/end` 仅更新显示关联，不授予资格。

身份校验消费真正的 Registry/provider 身份和 mounted composition，不把 `resolve()` 返回的展示对象引用等同于 preset generation。父配置复制必须深度冻结，但根 admission 发布不得重造 `baseline`、selection revision 或 source capture；新创建关联与既有配置身份是不同职责。

原生通用 spawn/fork 或直接调用 DSMM provider 不带可信 pending 时，不得为 DSMM 受控父创建一个无策略子代理。明确拒绝该入口并引导使用已准入角色工具；这不阻止受控 live 子代理的官方消息/中断接口。普通 Deepwork-off 的非 DSMM 原生父子路径不被此门禁接管。

### 根资格、后续消息和生命周期边界

| 入口 | 必须执行的策略及公开接口 |
| --- | --- |
| 普通新根、DW 根 preset | `agent/created` 读取当前 entry/profile 的 desired 快照，解析命名 overlay，冻结根 admission；Core 始终安装，显式 off 不安装工作流/技能正文。普通根不写模型选择。使用 `isRootRoleEnabled()` 与目录 `mode` 校验所有角色，不能只特判 Planner。 |
| Coding 等辅助 preset 被选作根 | preset registry 需要注册可用于 spawn 的辅助 preset，但 rc.2 没有 child-only 字段；不得把全部注册项当作合法根。首次创建拒绝辅助角色根；目录可见时 UI 必须解释其用途而不声称原生 picker 可隐藏。 |
| 空白根在 created 后切换 preset | `agent-preset/selected` 是观察通知，不是 veto。重新计算作用域工具限制；通过公开 `agent/pre-step`、`agent/request` 和工具执行拦截在模型/副作用前拒绝不合法根或不匹配 admission 的 composition。拒绝状态不得标成已应用。对合法空白根的选择，只有在新的执行前绑定完成且无已准入调用时才允许执行；否则明确要求新会话，不借 live Apply 自动重绑。 |
| 原生 `sendMessage`、`prompt`、Gateway 投递 | 官方 Runtime 检查真实邻接、父子身份和 inbox 接收。后续执行只消费该精确 live Agent 已冻结的 admission，不因保存、消息 metadata、label 或日志改变权限。DSMM 的前置 step/request/工具检查是执行边界，不谎称拦截了 inbox 接收；receipt 仅表示已接收。 |
| 冷 `resume`、直接 Registry resume、Gateway 自动唤醒 | 无可信 live admission 的 DSMM 角色／受控子代理在 awaited created 拒绝执行，保留原日志及只读查询。`source: 'startup'` 也可能是 seeded create，不能单凭 source 或 preset 名授予资格。普通非 DSMM 历史不自动升级成受控会话。clear/compact 只有保留精确对象及既有 admission 时延续；新对象没有可信绑定就明确不支持，不重新解释展示记录。 |
| 插件卸载、重挂、父对象替换 | 先关 pending 准入并撤销 DSMM lifetime，取消本次等待调用；使用官方 activation `dispose()`、必要的 `drainChildren`／`drainDescendants` 等待任务自有后代释放。Agent 作用域策略必须在活对象整个生命周期有效，owner 退役后仍应拒绝执行，不能先卸 guard 留下无约束根。若公开作用域不能保证这一点，活 Agent 的卸载/热重挂保持不支持，要求原生关闭会话后重启；这是实施阻塞而不是忽略 teardown 的许可。 |

冷恢复拒绝保证的是不释放 DSMM 执行，不承诺 `agents.resume()` 尚未打开原生日志：官方 factory 在 created 前可能已进行 load/repair。DSMM 自己的只读历史接口不得调用 resume；不做额外迁移/重写。此边界仅在任务自有临时历史验证，不以真实用户日志作实验。

只读是执行限制，不只是 schema 隐藏：保留 `tools.restrict()`、`tools/pre-execute` 和实际执行点的精确调用检查，覆盖 own-layer 工具、别名、重新注册与 PTC；使用角色过滤与父上限交集。权限允许不是工作流角色扩权。Core 的 `core-permissions.ts`、`core-permission-authority.ts`、`permission-controller.ts`、`deployment-permission-rules.ts` 保留原生审批和 operator 身份；移除对 custom delivery fence 的依赖时不得同时移除这些安全责任。

### 官方 activation 的结果和控制

`role-subagents.ts` 直接持有 `SubagentActivation`，不经 `RoleRunRegistry.start()` 或 jobs 搬运结果。等待模式选择 `delivery: 'caller'`，检查 `result.stopReason`，仅 `completed` 可作为正常完成；保留真实 output/structured/diagnostic 的不同语义。取消启动 signal 只控制 publication 前，接受后通过 receipt 的 `dispose()` 取消并等待清理；处理 signal 在 receipt 返回前后触发的竞态，已中断不能继续返回成功。

后台模式在开始前选择 `delivery: 'parent'`，返回 child/message 的 accepted 信息，由官方 activation 通知父；不再创建 DSMM RoleRun job，不因原工具返回就取消已经转给原生 owner 的任务。正在运行的等待任务不提供“转后台”按钮。对 live child 复用 `listChildren/listDescendants`、`prompt`（Queue/Steer）、`sendMessage`、`interrupt`／`interruptByParent`；中断回执不等于 idle 或完成。

`role-control-rpc.ts`、`role-control-types.ts`、`role-control-remote.ts` 与客户端控制同步改为官方目录和 live admission 投影。保留必要的 DSMM 身份展示/受限能力字段及 authenticated operator 校验，不保留复制执行状态机；只读后代查看使用目录/历史查询，不借 `resolveAgent` 唤醒对象。直接子代理控制与只读后代展示分开，过期 parent 对象/跨会话请求拒绝；原生工具/Gateway 直接入口也必须通过上述执行策略。

### 模型执行与失败处理

通过原生 preset/provider、请求 waterfall 和 prepared call 实现路由，不构造第二套请求调度。Profile 保存不自动切换普通根模型。明确的 Use profile model 必须针对正确会话和配置版本，不覆盖后续用户手工选择。

- **标准调用。** 使用原生 `listProviders/listModels/resolveModelInfo` 得到实际目录和能力，`agent/request` 返回 `LlmCallConfig`，由原生 `prepareCall(config, signal, configure?)` 绑定 adapter generation、默认值、验证与单次 dispatch。`configure` 是同步纯函数，不能更换已捕获 route；`resolveCallConfig` 单独查询不是后续执行的 generation 凭据。普通 root 的 downstream/native choice 保持权威。
- **通用参数。** `role-routing.ts`、`role-invocation.ts`、`model-parameter-policy.ts` 和 `route-json.ts` 保留 normal、显式 tier/override、候选顺序与 native-defaults/passthrough 的用户语义。减少同一信息在 header、capture、lock 中的重复存储；只保留区分初始路由、后续手工意图和安全 fallback 必需的 generation。child 初始 route 不能变成每步覆盖；省略 effort 清理上次显式 effort，不能沿用错误值。
- **参数适配的具体限度。** 按已准入参数策略与实际 adapter 消费能力分流，原生能够完整表达并消费的请求直接使用 prepared call。通用类型包含字段不代表 adapter 支持；rc.2 Pi-AI 原生 stream 不接受 `stop`，已有 passthrough 的 stop-only 请求与 arbitrary raw 参数均可使用同一最小公开适配。`LlmCallConfig/ConfigureCall` 没有 arbitrary provider 参数，`llm/stream` 收到的 loop request 已冻结且不能改写；不能强塞 unknown JSON 或静默删字段。将 `host-llm.ts`/`llm-runtime.ts` 收敛成单个原生 LLM registry 的最小公开 `prepareCall`/adapter-registration 适配，确需适配的请求进入现有 `native-pi-ai-wire.ts` 的 public adapter/payload hook。不绕过手工选择的能力校验，不保留独立队列、模型目录或通用 owner 状态机。使用现有本地 provider seam 验证无 arbitrary 字段的 stop-only 请求体实际包含 stop。
- **raw 安全身份。** 适配必须从当前已注册 adapter 的真实 fiber/配置与 credential reference 捕获 generation，使用原生 `LlmAdapter.prepareCall` 的 model/capability 与单次 dispatch；不从序列化 header 获取权限，不复制或改写用户凭据。await 后及发出前复核 Agent admission、取消、provider/credential owner 代际；拒绝与 provider/model、messages/tools、signal、认证或执行控制相冲突的 raw 覆盖，保留 attribution、附件/系统提示/工具更新协议和输出错误分类。无受支持 raw adapter 时拒绝该路由且 UI 说明，不妨碍标准 Coding 路径，不伪称 raw 已透传。
- **请求恢复。** `agent/request-error` 与 `agent/assistant-stream` 的正面无输出证据驱动有限候选切换；原生 adapter 自有 retry 与 DSMM 候选策略不能叠加成无界循环。同值重选、新手工选择、owner 退役或取消使旧 retry 失效。验证以实际本地 provider 请求 body/dispatch 次数和 generation 取消为准，不锁代码结构或品牌表。

fallback 只在原生提供足够的失败/输出证据且可保持取消和权限语义时自动进行；部分输出后不得自动重放。没有可靠“未输出”边界时，保留已配置候选的可见性并报告自动 fallback 不可用，由用户明确重试，不能猜测安全后重复调用。

### 配置、权限与增强功能

保留现有独立配置层、CAS、dirty draft、operator 身份和写入 lifetime 约束。无会话时当前 admission 必须为未知。Scope/entry/form 身份缺失时该编辑器不可用，不退写 Global。保存成功、运行时同步成功、功能已挂载和当前会话已应用是不同状态。

DSMM 规则在原生审批流程内收窄调用，不建立独立批准结果。真实原生同次调用批准不能被旧 DSMM epoch 当作第二次审批否决，也不能扩展到下一调用。通过固定活动任务配置、限制热 Apply 及正确取消处理审批和配置的竞态；不以弱化原生权限绕过已知风险。

| 增强能力 | 首选实现 | 公开接口不足时的可用边界 |
| --- | --- | --- |
| 当前会话 Apply | 精确空闲/未决调用/审批和配置绑定后应用 | 保存供新会话使用；明确禁用 live Apply，不排队隐式切换 |
| 同次前台转后台 | 原生同一 activation 的 ownership/delivery 交接 | 启动前选择等待或后台；不能重启任务模拟交接 |
| 冷恢复和持续子代理 | 原生身份、可信配置与权限绑定恢复 | 支持新会话和安全的当前进程控制，保留只读历史；不凭 best-effort PluginRecord 恢复权限 |
| HMR/更新 | 原生插件管理与真实状态 | 如实显示需重启或失败，不保证活 owner 无损替换，不自动重启 |
| 完整 LSP | 原生实际公开导航及独立配置能力 | 不把 definition/references/implementation/hover 声称为 diagnostics/rename/format，不自动恢复外部挂载 |

基本 Coding 委托、有效结果与取消不能降级为仅有配置界面。增强能力的受限方案必须可见且不可误操作；没有行为证据时只能称实现待验证，不称已交付安全闭环。

### Fake-IP 与隐私

网络需求仍是默认允许 `198.18.0.0/16`，不是 `198.18.0.0/15` 或所有私网。保留 DNS 答案全量校验、连接地址绑定、hostname/Host/SNI、mapped IPv6、重定向、凭据、大小和取消限制；其他显式拒绝继续生效。

rc.2 HTTP provider 没有公开 CIDR 配置，原生 sandbox 的文件效果策略也不提供 IP allowlist。fetch 与 shell 分别定位真实限制层；shell 缺少实际拒绝命令/错误时保持阻塞，不用猜测实现。优先公开网络策略；若必须增加最小 provider 适配，先确定接口、安装可达性和等价安全边界，不修改 SDK 私有实现或系统配置。不能以未被消费的设置、关闭 sandbox 或仅工具许可完成该项。

原生 Search/Fetch 选择仍由用户配置；不因升级自动打开新直连 API、变更凭据或发送最近原始问题。精确网络例外不会替代工具审批。

**网络模块沿用现有实现、13+2 定向测试及 P1 已关闭的独立 review，不重开网络设计。** `src/web-fetch-fakeip.ts`、`src/web-fetch-address-policy.ts` 使用公开 `HttpFetchProvider(limits, resolveAddresses)` 与 `ctx.web.registerFetchProvider()`，不替换 `WebRuntime` 或抢占 `http` ID。以下为保留边界及证据范围；集成者只衔接实际依赖/export/插件选择，相关输入未变则复用证据。

- 直接声明精确 rc.2 的 `@deepseek-ai/dsh-web`、`@deepseek-ai/dsh-web-fetch-http` 依赖关系：Host 的 web seam 用 peer 加开发依赖，实际实例化的 HTTP provider 用包运行依赖；resolver 直接使用 `ipaddr.js` 时声明直接依赖，不借 pnpm hoist。保留 DSH host peer 单实例。`HttpFetchProvider` 自己携带传输依赖，不给 DSMM 再造一套 Undici transport。所需依赖通过现有项目安装授权处理；本阶段不安装全局软件。
- `HttpFetchResolver(hostname, signal)` 返回经验证的 `{ address, family: 4 | 6 }[]`。使用系统 DNS 的 `all: true, order: 'verbatim'`，域名的所有结果必须有效且符合公网或精确 Fake-IP 规则，任何拒绝地址使整个请求拒绝。mapped IPv6 按实际 IPv4 判断；保留 rc.2 的 IPv6 transition／NAT64 防护及 RFC7050 前缀识别，未知/失败不放宽。输入 `198.18.0.1/16` 只可规范化为固定 `/16`，不新增任意 CIDR 编辑器。显式 deny 优先。
- 上游公开 resolver seam 不导出完整地址分类器；需要的最小分类/NAT64 逻辑可在 DSMM 维护并保留 MIT 来源说明，不导入 `src/network.ts`／私有包路径或修改 `node_modules`。继续由原生 provider 做 pinned lookup、HTTP Host/TLS SNI、同 origin redirect、URL credentials/scheme 校验、响应编码/大小、deadline 和 body/dispatcher 释放；不能用伪造公网 DNS 答案绕过原生拒绝。
- 适配入口通过公开 `@deepseek-ai/dsh-http-proxy` 的 `proxyRouteFor()` 确定原生路由，并直接声明该依赖。若 Fake-IP 或 mapped Fake-IP literal 应走代理，必须在调用 provider 前拒绝并报告该路径不支持：原生固定分类器会使这种 literal 跳过代理，而自定义 resolver 不能让其变成意外直连。域名走代理时不会调用自定义 resolver，此适配不声称校验代理远端 DNS；需本地地址 deny 而无法控制远端解析时拒绝请求，不隐式改直连。其他禁止 literal 仍被拒绝。
- 安装/选择必须可达且显式：通过 DSMM 包 export 和文档提供该插件，在用户选择此 fetch provider 时才挂载，并由原生 `fetchProvider` 指定唯一 ID。仅升级 DSMM 不自动挂载一个始终 available 的新 provider，避免无 provider 的 Host 自动外联或多 provider 歧义；已有 Search/provider/credentials 不动。该已选适配的默认地址策略包含 `/16`，但未选择它的原生 `http` 不声称已修复。bundle/生成资源必须实际包含该 export 和插件入口。
- 沿用现有 13+2 定向测试的 resolver/地址和代理安全证据；仅受集成变化影响时重跑相关项。**真实 Fake-IP wire 验证明确不是本次 gate，不另建网段/TLS 测试环境。** resolver seam、loopback 或代理可达不能宣称真实 Fake-IP/TLS 已验证；实际路由、TLS、代理远端 DNS 保证的未覆盖范围在交付时注明，不据此重开已关闭网络 review。

shell 项独立：需实际命令、脱敏错误、runner/provider 名和拒绝来源；无这些输入不改 `permission-bash.ts`、`permission-pwsh.ts` 或 sandbox 来猜修复。它阻塞 shell Fake-IP 完成，不阻塞 Coding、配置或 HTTP 适配实施。

## DSMM 发布流程设计

使用现有 `split-publication-v1` 分离 npm publication 与 GitHub delivery，不建立第三套完成检查器。准备/发布只选一个有效通道，未选通道必须跳过；bootstrap、普通 source 与受限历史 recovery 的身份不能混用。当前六个 job 的名称和选择关系是发布协议，不是随意删除的文件清单锁。

`terminal-publication` 只证明其明确绑定的 npm publication：实际包、不可变源/tag、可信控制提交、固定 run/attempt、成功的所选 publisher 与真实 provenance。没有 registry readback 或 fresh reinstall 时如实声明，不恢复已撤销的发布测试或伪称功能已验证。GitHub job 结论和资产交付另行报告；不能将 npm 完成写成整个发布完成。

GitHub transport 只能创建本次拥有的 draft 与资产，finalize 消费该次 transport 输出并核对原 tarball、receipt、checksums、tag 和运行身份。不能采纳他人的 draft、覆盖资产、改 tag 或原地修补部分发布。来源与包完整性校验保留，不新增源码/文案/机器环境锁。

原生架构收敛后，为 **`0.3.1`** 增加精确版本契约：包 `@dsmm/dsmm@0.3.1`、标签 `dsmm-scoped-v0.3.1`、tarball `dsmm-dsmm-0.3.1.tgz`、DSH `0.2.1-rc.2`、实际 exports/官方组合及资源闭包。同步 `release-contract.mjs`、prepare/freeze/readiness/checker 与 workflow 消费路径，不把 `isSource030` 改为开放版本范围，不让 rc.2 源码通过旧 `0.3.0` policy。新契约无需继承 custom Runtime/delivery fence 的产物或测试字段；必要来源、原 tarball 完整性和 provenance 保留。历史五/七 job、`0.3.0` rc.1 及原生验收/完整性回执继续按原身份解释。

开发阶段完成本地行为与发布协议验证；发布阶段只消费验证后的 DSMM 提交和一次 pack/freeze 的确切产物，不在部分发布后修代码、重打标签或替换资产。`0.3.1` 使用普通 tag-push 通道，不 dispatch 空 recovery 输入进入 frozen bootstrap，不使用历史 `unpublished-0.2.2` 通道。npm 发布后不新增 registry readback/fresh reinstall gate；安装系统插件仍是独立的已授权交付动作。

## 实施顺序与产出

### 1. 固定跨域契约，按原生职责收敛设计

先将上文配置候选、pending/live admission、动作能力、原生 activation 和必要客户端投影接口对齐，再按下表分域实施。使用已经核对的 index/测试语义，不重复全面比对或机械恢复原代码。配置、技能、模型参数和客户端均可重新设计；“暂时编译通过”或现有 worker 边界不决定验收。官方基础服务、Core 与可选 DW 的组合必须支持无会话配置和独立新会话 Coding 两条路径。

| 模块 | 必须保留的责任 | 本次真正替换的部分 |
| --- | --- | --- |
| `profile-runtime.ts` | 配置候选、startup ceiling、不可变根/子快照、未来默认选择、CAS 观察和提交响应、来源/警告/能力投影 | 移出 custom child ticket、sidecar recovery 和 retained-owner 接管；以 `prepareRoot → publish` 连接 awaited created，不整文件改成简化配置仓库。 |
| `model-routing.ts`、`role-routing.ts`、`role-invocation.ts`、`runtime-recovery.ts` | 通用参数策略、normal/tier/显式 override、手工选择顺序、startup lock、有序且无输出安全的 fallback、真实 route 观察 | 用官方 Agent/activation 与精确 admission 替换 managed capture 依赖；不新增 scheduler，不把 initialRoute 变成每步强制覆盖。 |
| `index.ts`、`runtime-integration.ts` | Core 冷关闭/无会话可用、原生设置入口、现有命令与模块投影、按作用域安装技能/路由/权限 | 移除 Registry/Runtime/JSONL replacement 和 managed fencing 接线；连接 `native-admission.ts`、官方服务与独立 lifetime。 |
| `role-policy.ts`、`core-permission-authority.ts`、`permission-control.ts` | root eligibility、只读/过滤交集、精确 ToolExecution/definition/caller、批准与取消、实际权限变更撤权 | 将 ticket/RoleRun 证明改为精确 live Agent、admission、原生 lineage/activation 及 signal；不保留第二个授权 owner。 |
| `role-providers.ts`、`role-subagents.ts` | 目标校验、每次调用路由、结果/失败/取消、可选后台、真实身份 | pending→created 绑定与官方 `startActivation/result/dispose`；prepare 仅供 seed，RoleRun job 不再承担生命周期。 |
| `role-control-rpc.ts` 与既有 children DTO/UI | operator、请求解码、生命周期复核、目录/后代只读投影、Queue/Steer/Interrupt、错误分类和来源保真 | 数据源改官方目录/控制 API，不复制队列；仅真正缺公共契约的 handoff/冷恢复受限。 |
| Deployment/Profiles store/controller/drawers | sparse/CAS/原子提交、独立编辑层、dirty draft、来源和真实生效时机 | 复用原生 form 与有效 stores；重构 desired/mounted/admitted 和按动作能力。简化重复 DTO/观察逻辑，不因形式沿用而遗漏 direct Settings 写入口。 |
| `skills.ts`、`preset-skills.ts`、角色资源 | metadata 懒发现、正文按需读取、祖先赢家、scope 与资源闭包 | 复用 native skill provider，不引入另一 catalog。将 per-Agent 安装/失效/释放由准入 scope 统一管理，避免多套全局监听和 eager 正文挂载。 |
| `host-llm.ts` 等 LLM 适配 | arbitrary 参数、原生目录、实际 provider 代际和取消、请求 envelope 与 attribution | 标准调用下沉原生 prepared call；raw 只留必要公开 adapter seam，删与原生重复的状态，不默认保留整个 LLM replacement 设计。 |

### 2. 并行收敛配置/form、技能资源和模型调用

配置工作包覆盖 `settings.ts → deployment-config/config-file-store → profile-store/profile-runtime → RPC → Deployment/Profiles controller`，不是仅补 `profile-runtime.ts`。原生 form 的实际 volatile schema、entry 身份、独立保存和权限同步是同一条验证链；已有正常 sparse/CAS 实现不为新接口重写。`managed-settings` 的薄 façade 只有在公共 `ConfigEditor.edit` 确实需要 DSMM 权限协调时保留；若原生边界能完整承担，应直接复用而不保留双 owner。

**`profile-runtime.ts` 的最终接口：**

- `prepareRoot()` 使用既有完整候选构造/校验，保留 `baseline`、`selectionRevision`、`sourceRevision`、实际 admission epoch、warnings、startup source capture 与 mounted ceiling。`publish()` 保存该候选，不为根重写为 `baseline = settings` 或 `selectionRevision = 'absent'`。子调用需要的派生快照由明确 child 路径构造，不借用根发布时的统一字段覆盖。
- `describe()/getSession()` 区分磁盘 selection、当前已准入 selection 和 Agent 实际配置。外部修改时提供真实磁盘 CAS revision，但不把未验证的磁盘策略宣称已准入；外部 session pointer/epoch 不一致要显式报告。`hasAdmission()` 同时要求精确 live Registry 对象及未退役的 owner，不仅检查 WeakMap。
- `select()` 保留现有 `ProfileStore.select(validate, { prepare, committed })` 事务及返回值：commit 前准备响应与候选，commit 时只发布一次，最终响应合并 store 返回的真实 revision/`refreshRequired`。不要在提交成功后再依赖 `describe()` 才宣称成功；观察失败或并发外部替换不能将已经提交的结果改写成失败/他人的成功。未提交失败保持旧 pointer/配置不变。
- 保留 Global `expectedRevision`、native `ConfigForm.mutate` revision、命名文档 revision、selection revision 和 admission epoch 各自的边界。operator/lifetime 在 await 后及不可逆写入前复核；保留来源替换时的字段清理、runtime policy/editor defaults、警告与 restart-required 投影，不以删 UI 字段解决 owner 类型问题。无 session 的实际 admission 仍未知。
- live Apply/冷恢复的受限只关闭相应执行能力，不删除 Profile 编辑、未来默认选择、session 观察、独立 Use profile model 意图或普通 Deepwork on/off 契约。若某个动作确实改变权限且 rc.2 无可靠 idle/approval 边界，针对该动作报告能力不足；不能用一个恒 false callback 关闭所有模式/模型操作。纯模型选择应与 overlay Apply 解耦，复用原生 `selectModel` 和既有 session/config/manual-intent 校验。

**路由最终行为：** 以 `system-prompt/assemble`、`agent/request` 和原生 prepared call 保留手工选择意图、参数来源及候选策略，不要求保留旧 lock/capture 数据结构。普通根不隐式应用 profile primary；child invocation 提供初始路由，不覆盖之后被原生接受的新手工选择或已准入 fallback。省略 effort 清理旧 effort、同值重选使旧 retry 失效、部分输出禁止 replay、取消后不得发下一请求。`runtime-recovery.ts` 只负责必要候选决策；不能删掉仍有效的 generic routing，也不能再建重试调度器。

**技能最终行为：** `skills.ts` 的 `registerProvider` 使用原生 scoped `snapshot` 判断非 DSMM 祖先赢家，list 不读 `SKILL.md`，get 在读取前后复核取消、scope、模式和失效 generation；incomplete discovery 不当成缺失。`preset-skills.ts` 重构为准入时安装的 Agent-local handle，由调用 scope 释放，preset/mode 变化仅 invalidate/reconcile 实际受影响资源，不递归扫描、循环广播或逐 Agent 添加重复全局 owner。复用 `skills.test.ts`、`preset-skills.test.ts` 验证正文未提前读、祖先 winner、读中取消/失效和两 Agent 隔离；技能正文是输入资源，不赋予工具权限。

### 3. 完成原生执行、权限与 children 接线

以上候选/路由契约确定后，在既有 `native-config-fixture.ts`／`native-routing-fixture.ts` 上使用官方 Registry、Runtime、AgentLoop、spawn、JSONL 验证前文创建数据流。`native-admission.ts` 与 `lifetime.ts` 不复制配置事务；两会话/同父并发调用各有独立 snapshot，不能共享可变 defaults。

`role-policy.ts` 保留真实调用捕获及执行时复核，缺失受控调用证明不得静默放行；原生 tool guard、DSMM guard 与 scope 不得互相绕过。`core-permission-authority.ts` 可移除 RoleRun/ticket 字段，但精确 root/child ownership、realm/definition、权限 revision、owner 退役和 signal 的有效撤权必须继续成立。同次原生 once 批准不因无关 DSMM epoch 被二次否决，也不复用到下一调用。

children 控制沿用既有 DTO 的有效边界：严格解码、脱敏 domain error、Unicode/control label 清理、原 browser request ID/timezone/内容、catalog 模式与实际 provider/attachment 能力；不能固定返回 `prompt/interrupt/images: enabled`，或把所有失败压成 `unavailable`。直接 child 控制、readonly descendants、接受/终止状态保持可区分。用官方 API 替换旧底层，而不是从空数组和固定 capability 重建 children 功能。

live Apply、同次 handoff、冷恢复确有公开契约缺口时按本计划表格显式限制；新会话 Coding 的有效结果、失败和取消必须可用。插件退役必须停止受控执行并由官方 owner 释放资源；不通过恢复 custom Registry/Runtime/companion 解决业务遗漏。已删除模块的残余 imports/exports/专属 fixtures 按替换后的职责清除，仍服务有效功能的测试迁移而非删除。

### 4. 完成客户端投影与包级集成

复用已有 `RoleToolView.tsx`、`RoleToolView-data.ts`、`role-identity.ts`、客户端 slot 和 label 实现，只将其接到官方请求/accepted/实际 result 上；补齐真实收起行、partial、失败/中断、当前格式 replay/PTC 的名称语义，不重做 UI 或恢复 job ID 协议。网络保持独立实现/review，仅合并真实依赖/export/显式 provider 选择，shell 未定位继续阻塞。

Profile/Deployment UI 消费按动作的能力与来源状态；保存成功不能显示成当前已应用，禁用 Apply 不能隐藏 Use profile model。Children UI 只用实际 native capabilities 开启操作；label 不是授权。配置、权限和 children 的 RPC 使用相同 operator/connection lifetime 原则，但各自复核其资源身份，不共用可复用 grant。

将 `package.json` 更新到 `0.3.1` 并生成对应 DSMM 资源；`cordis.patch.yml`/`patches` 消费官方 Agent/Runtime/JSONL，不加载失效 custom exports。同步 DSMM README、`docs/{design,compatibility,settings-status,profiles,model-routing,native-permissions,runtime-recovery,releasing,roadmap}.md` 及受影响使用说明的最终行为，不把既有 rc.1 说明当作 rc.2 实现契约。这里只列执行者的文档交付，本 planner 只编辑指定三份文档。

复用 `.github/workflows/dsmm-release.yml`、`dsmm/scripts/{dsmm-release,release-contract,release-source,check-release-readiness,check-dsmm-release-completion}.mjs` 及既有本地协议测试实现精确 `0.3.1`。标准包导入、native composition、lazy skill 资源可达和客户端入口要从实际打包内容验证，不以旧 exports 清单、custom-owner bootstrap 或 receipt 字段名代替行为。历史 release checker 的兼容解释可保留在 release controls，不能让旧 owner 回流运行时。

集成者在源码/类型闭合后生成必要 DSMM `lib/` 和资源，保持源码与实际被测试产物对应；无资源输入变化不重复 source sync。仅使用 DSMM 自有生成器，不刷新 Codex 或修改共享指引。实际编译不自动删除 orphan 输出；本次撤销模块留下的确切自有生成产物应清理，避免旧 JS 被宽泛 pack glob 带回包中。更新最终使用说明/roadmap，不保存执行日志。

### 5. 必要验证与任务自有清理

按下文风险运行定向测试，并复用已有相关通过证据。迁移现有 native fixtures 到官方组合；为核心路径运行确定性本地 LLM 的实际 activation 和隔离原生 Web。保留 raw provider body、配置 commit/observation、审批取消与退役的行为证据；真实 Fake-IP wire 不列入 gate。不要将原计划的高级 Apply/cold recovery 用例硬套到明确受限功能，改为对应的安全能力投影及拒绝行为。

清理仅限本次创建的临时 home/profile/session、测试进程和已失效自产生成物。删除前确认精确所有权和 resolved path；终止进程须核对 PID 与启动身份。不清理用户 dirty/staged/stash、历史包/receipt、credentials 或真实 session；无法判定所有权的产物保留并报告。无需生成清理 ledger 或先更新 disposable checklist。

### 6. 独立交付：提交、0.3.1 发布、Desktop 插件安装

仅在实现及必要验证完成后由主执行者进入本阶段，不由 planner 执行，也不要求对已授权动作重复确认。

1. **提交范围。** 只提交 DSMM 产品、DSMM workflow/support、必要 workspace 依赖 hunks 与这两份计划。先检查 status、工作区/暂存 diff 和最近提交，保护已有无关 staged 内容；不能裸提交整个 index 或 `git add .`。共享文件按 DSMM hunks 处理，无法安全分离则报告具体阻塞。提交前统一满足仓库 `pnpm run typecheck`、`pnpm test`、`pnpm run build` 三项门槛及必要 DSMM 检查；不得为修无关失败改 OCMM，已有覆盖当前输入的有效证据可复用。语义化简短提交，不单独提交计划、不改历史。
2. **发布源。** 核对目标分支/remote 和待推送范围，确保不会把无关未推送提交带入本次 push；无法隔离则升级决策，不 rebase 或 force push。从准确 DSMM 提交发布，标签 **`dsmm-scoped-v0.3.1`** 只创建一次并推送以触发普通六 job 通道。禁止移动 `0.3.0` 或已部分发布的新 tag；prepare/source guard 若要求干净源，使用该已提交源的任务自有 release checkout，不清空用户工作区。
3. **两个完成面。** 固定匹配的 run/attempt/control，使用 DSMM `check-dsmm-release-completion.mjs terminal-publication --run-id <run> --run-attempt <attempt> --control-sha <control> --receipt <new-path>` 取得 npm publication 结果。独立消费该次 GitHub transport/finalize 的 draft/asset ownership、tag、原 tarball、receipt、checksums 及 public 状态。workflow 总结绿灯不是任一面独立的完成证明，不调用根 OCMM checker。
4. **失败边界。** npm 已成功而 GitHub delivery 失败时分别报告，不覆盖、repack、采纳他人 draft 或原地修补。未知身份/partial publish 时停止后续安装；新的版本、重打标签或 same-identity rerun 不由本次普通发布授权推导。
5. **Desktop 安装。** 两个发布面满足后，用系统 Desktop 自己的安装 carrier/Plugin Manager 安装准确 `@dsmm/dsmm@0.3.1`。操作前只读取必要宿主版本、目标 profile/entry 和插件 inventory；确认精确 `0.2.1-rc.2`、匹配平台及支持的公开安装接口。宿主不匹配、现存配置要求数据迁移、同名 bundle 冲突或只能通过读写 credentials/session 才能安装时，报告安装阻塞，不升级宿主、不抄写旧 profile、不登录、不擅自拆除无关 Loader 行。该插件的必要安装记录可变更，其他 provider/account/模型/effort/roles/UI 配置不变。
6. **安装验收。** package inventory/解析版本和 Desktop 真实插件加载是不同证据。先用隔离新 profile/session 验证产物行为，再在实际 Desktop 确认插件版本、原生 Plugins 配置入口及加载状态，不向真实用户会话发 prompt 或改其历史。若安装要求退出/重启有活动工作的宿主，等待安全窗口，不强杀、不自动重启。Electron 不可观测或激活需额外操作时如实报告 installed/not-activated，不以 CLI/Web 结果冒称完成安装验收。

### 建议实施分工与合并接口

| 工作包 | 独占主要区域 | 输入/输出与依赖 |
| --- | --- | --- |
| 配置/form/Profiles | settings/deployment/stores/runtime、配置 RPC、Deployment/Profiles controller | 提供完整候选、提交结果、来源投影与按动作能力；协调权限工作包拥有 native editor façade 和规则撤权，不限于旧 worker 文件边界。 |
| 模型与恢复 | routing/invocation 参数、LLM public adapter seam、recovery | 消费候选/live admission；输出标准/raw route 执行与无输出安全 fallback。可与配置、技能并行，native generation 与权限接口必须一致。 |
| 技能/presets/资源 | skills/preset-skills、目录/静态 preset、资源 generator 输入 | 提供不带共享动态配置的角色定义和 Agent-local 安装 handle。可先独立收敛，最终 awaited install 由原生 core 组合；不重复网络任务或修改共享源。 |
| 原生执行/权限 | native-admission/lifetime、policy/providers/subagents、Core 权限、permission façade、index/runtime composition | 消费前三者契约，统一 created/root-switch/消息/退役安全边界；交付 Coding 实际结果和取消。不得靠削薄其他域接口完成迁移。 |
| children/客户端 | role-control DTO/RPC、children/RoleToolView、native view 注册 | native 控制/identity 接口确定后并行接入；与配置 UI 明确控制器所有权，保留真实 capability/operator/error。 |
| 集成与交付 | package/exports/bundle、DSMM 说明、release controls/生成物、最终 QA | 合并必要网络依赖/export，完成 0.3.1 契约、统一验证及自有清理；主执行者独占 Git、远端发布和 Desktop 安装，不在子任务中提前操作。 |

工作包是责任划分，不要求固定 agent 数量。现有两份中间实现仅是输入，不限制分工；主执行者在计划审查后决定合并/重拆。候选与 admission 类型先对齐；配置/模型/技能可独立推进，原生执行依赖其契约，children/UI 依赖 native 控制投影，发布依赖最终包和行为证据。共享 `package.json`、锁文件、`index.ts`、`lib/` 由一位集成者合并；生成物不要由并行 worker 相互覆盖。

## 验收及证据限制

实施阶段按实际改动运行定向行为测试、编译、构建及隔离真实接口验证。复用现有测试资源，只补充有效需求所需的最小回归覆盖，不扩建通用夹具。相关输入没有变化时复用已有通过证据；生成资源不是功能行为的替代证据。重型检查由集成阶段统一安排，不按子任务重复整套执行。

按实际改动补齐以下接口证据，不逐文件锁定或机械重复整套检查：

- 普通 off/on、DW preset 显式 off、作用域技能发现/加载、允许的角色执行与拒绝的根资格，以及两会话隔离。
- 真实 activation 的结果、失败、取消、直接消息与 dispose；没有输出证据时不自动 replay，后台不重复执行。
- 原生 Plugins 和 Profiles 的正确 operator/entry/form 身份、独立保存、CAS 冲突、草稿保留、原生根模型选择及未来配置生效。
- 只读/工具别名与重新注册、深度、审批和调用归属；支持的恢复与 owner 卸载不复用过期授权。
- 原生调用树收起标题、partial、PTC、失败和重放；键盘/焦点/可访问名称、窄屏/缩放、长文本、主题与减少动态效果不退化。Web 与官方 Electron 是不同证据。
- Fake-IP 沿用 13+2 定向测试与 P1-closed 网络 review，实际 raw wire/TLS 未验证不冒称；shell 未定位单独报告，不增加真实 wire gate。
- DSMM `0.3.1` 普通发布通道、publication 与 GitHub delivery 的独立结果、transport 所有权和部分失败不可覆盖语义；开发不操作远端，授权交付阶段取得固定运行证据及独立 Desktop 插件安装结果。
- 实际资源分发闭包与生命周期清理，不依赖开发机全局路径；包完整性/来源校验与运行时 CAS 保留，不替换成文案或文件内容锁。

最终报告分别说明已实现、已验证、受限可用与阻塞项。禁止把本阶段改动整体标为运行验收通过，禁止以旧版本候选包证据证明新执行架构。

### 最小安全证据与定向复核

已有依赖/UI/label build 与网络证据只覆盖未受本次修改影响的输入。计划文案不触发 build；实施阶段先解决源码类型/接口闭合、迁移对应 fixture 并生成受影响的 `lib/`，再运行下列已有测试中的相关行为，不用 stale lib、删除有效断言或全套重跑掩盖问题。

| 迁移风险 | 最小有用证据与现有资源 |
| --- | --- |
| 配置/form 边界 | `profile-runtime.test.ts` 的双 Host selection CAS、commit 后 observation 失败、activation/原子写失败；`configuration-commit.test.ts` 的已提交结果；`native-deployment-config.test.ts`、`deployment-permission-settings.test.ts` 的 sparse/volatile form、direct Settings 写及权限同步；原根/blank root/子保持旧快照而新根读新值。保留有效断言，按新接口迁移 fixture。 |
| 路由被锁死 | `native-model-selection.test.ts` 的 assembly 时序、同值重选/新选择取消旧 retry、child 手工选择后的合法 fallback；`native-root-model-authority.test.ts` 与 `native-role-routing.test.ts` 的根模型权威、参数/effort、部分输出/取消。 |
| raw 参数未真实消费 | 现有模型/LLM 适配测试中的本地 provider body 与取消 seam；标准请求交由 native prepared call，raw 路由保持显式参数、attribution 和 envelope 安全；provider/credential generation 退役不发旧请求，unsupported 明确拒绝，不以配置 JSON 可保存为证。 |
| 技能作用域/资源 | `skills.test.ts`、`preset-skills.test.ts` 的 metadata-only list、ancestor winner、incomplete discovery、读中取消/失效与并发 Agent；实际包内相对资源加载，不导入共享 checkout、不给 skill 内容执行权限。 |
| 原生 owner 未闭合 | `native-role-invocation.test.ts`、`native-preset-security.test.ts`、`native-role-lifecycle.test.ts` 中有效场景：Coding 有用结果/失败、publication 前后取消、并发配置隔离、created 暂停无副作用、根资格/只读/深度、卸载拒绝后续执行并释放自有资源。 |
| 权限/children 被削薄 | `permission-managed-tools.test.ts` 的批准/配置变化竞态、别名/注册退役；`role-control-rpc.test.ts` 的真实 Gateway 解码、operator 更替、Queue/Steer/request ID、能力与错误区分、readonly 后代。移除 handoff 专属 job 测试，不删同文件的调用归属和取消测试。 |
| 展示/交付脱节 | 既有 `client-role-tool-view` 两种测试及隔离 native Web 查看名称/partial/失败/replay/PTC；验证 Apply/模式/模型的独立可用性与 dirty/CAS。复用独立网络 review；`release-controls/source/readiness` 的实际协议检查覆盖 0.3.1 普通 lane 和历史解释，未覆盖的 shell/wire/Electron 不标通过。 |

工作包直接用现有 Node test 入口选择文件/用例；不要每包调用先 build 的全套 `pnpm test`。例如在 `dsmm/` 工作目录运行 `node --test --experimental-strip-types --import ./test/prompt-source-loader.mjs --test-concurrency=1 test/profile-runtime.test.ts test/configuration-commit.test.ts`，选取各自相关文件；先使其导入的 `lib/` 对应当前源码。最终集成统一安排 DSMM typecheck/build、必要 test typecheck 和缺失行为检查，提交前满足前述仓库门槛。官方 Runtime + 本地确定性 LLM adapter 是真实调度/工具证据，不是外部付费模型验收；开发 Host/browser 使用任务自有空 home/profile/session 与空认证上下文，不操作系统 Desktop。仅交付阶段安装系统插件，不读写真实 session/credentials，不新增通用夹具、journal、环境/文案/文件锁。

主执行者将完整设计交给 critic，重点是以下真实跨域阻塞，不重开已完成版本调查或网络 review：

1. **配置事务与原生 form：** volatile desired 与 live policy 未混淆；direct Settings/RPC 写同样受 operator/lifetime 和权限同步约束；commit 后 observation/notification 失败不反转提交结果，完整候选/磁盘 CAS/admitted 身份分离。
2. **模型消费链：** 标准路径真正复用 native prepared call；raw 参数有最小公开适配且不丢失、不扩权、不重复目录/调度；manual intent、参数缺省和无输出安全 retry 保留。Apply/模型/模式按动作能力区分。
3. **真实 native 安全闭合：** pending/awaited created/root-switch/后续消息/卸载覆盖实际执行入口；preset 无 child-only、prepare 仅 seed、source/start 不是授权；单次批准、精确调用、readonly 与取消有效。若 guard 不能跨卸载安全存续，活会话热卸载不可承诺。
4. **技能及 children：** scoped skill 安装不读取未发布 admission 或泄漏 scope，不完整发现不会抢占祖先资源；children 保留真实 capability、domain error、调用来源、只读后代及控制，不以固定 enabled/空数组冒充原生集成。
5. **交付身份和安装：** 新 `0.3.1` 普通通道从最终包定义，不复用 `0.3.0` rc.1/custom-owner 验收身份；未推送提交/dirty index 不混入 OCMM。Desktop 宿主版本和公开安装能力未取得证据前是安装阶段风险，不默认兼容、不擅自升级。

shell 拒绝来源未知只阻塞 shell Fake-IP 完成，不阻塞 HTTP/Coding 或授权发布；真实 Fake-IP wire 不作 gate。新版本与发布/插件安装已有授权，但源码集成、raw seam、权限退役和 actual Desktop 激活均需各自证据。无法取得时报告对应 unfinished/blocked，不用编译、旧 `lib/`、npm 完成或已安装包取代行为完成。
