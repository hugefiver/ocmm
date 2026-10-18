# DSMM 0.3.1：DSH 0.2.1-rc.2 原生技术设计

本文件是[集成交付计划](2026-10-18-integrated-native-stage.md)的技术设计。以 DSH rc.2 公开能力统一组织 DSMM 配置/form、Profiles、模型、技能、presets、权限、执行/存储、children/UI 和发布资源，交付 `@dsmm/dsmm@0.3.1`。已有功能不是从零建设任务，旧实现也不是必须沿用的设计；允许在有效需求和安全边界内简化、重构，不包含 OCMM/OpenCode/Codex 调整。

## 目标与开发原则

DSMM 保留可配置的 Deepwork 角色与工作流、generic model routing、原生配置界面、权限及子任务控制。保留 Deployment/Profiles/sparse/CAS/lifetime、懒加载技能、手工模型意图、原生审批与 children 的有效需求，不保留重复的 class/状态机。每个领域都按原生职责重新确定数据流；配置字段可以重新分类，旧 owner 选择器可以退出，但不能改变数据保护或用新调用方的局限删除用户能力。

- 每个 DSMM 新版本只保证运行于该版本选定的、当时已发布的最新 DSH RC／正式版，不追踪 alpha、未发布 master 或自动漂移的 dist-tag。本计划目标为 **DSH `0.2.1-rc.2`**。
- 只支持选定 rc.2，不增加旧 SDK 分支。迁移前 index 的有效业务行为与现有测试是保留基线，旧 owner 架构不是约束；无需再次调查历史或做完整上游比较。
- 当前 DSH peers、开发依赖、`engines.dsh`、开发载体及下一版本发布目标统一指向该精确版本。不增加旧 SDK 分支、双实现、兼容 shim 或旧格式迁移链。
- 完整实现本阶段需求。高级 Apply、冷恢复、同次后台交接与 HMR 仅在下表明确允许的边界采用受限方案；基本 Coding 委托、结果与取消不可降为配置空壳。其他缺口或无法取得的验证条件必须报告，不把拒绝、空结果或未验证行为称为完成。
- 受限方案不得放宽权限、伪造身份、删除历史或降低已有数据保护。旧配置／历史不自动迁移，不支持的恢复明确拒绝并保留原数据；不把旧会话重标成新会话。
- 不建立第二套 Agent 调度、队列、重试、生命周期或插件管理系统。只为 DSMM 特有语义保留必要状态。

先完成计划和由主执行者组织的 critic，再实施和必要验证。当前授权包括指定项目依赖、DSMM 实现/资源/说明、定向测试与隔离运行，完成后清理任务自有废物、提交 DSMM、push/tag 发布 **`0.3.1`** 并安装系统 Desktop 插件。开发阶段不提前发布或安装；planner 只改指定三份文档，不实现、不派 agent、不 Git 写。保留全部用户 dirty/staged/stash，不能 reset/stash/整体覆盖。插件安装不授权升级 Desktop 宿主或修改 credentials、真实 session、其他插件及配置；付费外部调用另行授权。

## 需求与完成标准

| 需求 | 下一版本目标 | 不能替代完成的证据 |
| --- | --- | --- |
| Deepwork 可选启用 | Core 配置独立可用；启用 Deepwork 后提供角色、提示词、路由及委托能力。开关控制 DSMM 功能，不要求用户选择另一套 Runtime。 | 服务注册成功不等于真实委托成功。 |
| 角色与模型路由 | 通过原生 preset/provider 组织角色、工具与模型。普通根 Agent 保持原生模型选择；显式使用 Profile 模型与保存配置分开。按角色配置 normal／显式 low/high/max 和通用模型参数，不维护品牌专用表。 | 某角色出现在目录中不等于该角色可执行。 |
| 调用身份展示 | 收起的调用行显示实际目标名称，例如 **“调用 Coding”**，而不是仅显示“调用 dsmm_category”。准备、运行、结果、失败、中断和当前格式重放均能识别目标。 | 后端 title、展开详情或源码中存在组件，不证明调用行正确。 |
| 配置体验 | 使用原生 Plugins → DSMM 配置入口及命名 Profiles 入口。全局与当前 DSH profile 独立保存；明确草稿、已保存、未来默认、当前会话实际值和生效时机。 | 保存成功不代表已应用到正在运行的会话。 |
| 委托与结果 | 官方 activation 执行，明确区分已接收、运行中、完成、失败和取消；不会因为切换显示方式而重新执行同一任务。 | child ID、后台回执、interrupt 回执都不是任务完成。 |
| 子任务控制 | 原生能力可用时提供直接子代理的 Queue／Steer／Interrupt 和只读后代查看；权限与归属由真实调用上下文决定。 | 前端按钮可见不等于 Host 有控制权。 |
| 权限 | 继承并组合原生工具、只读、深度、sandbox 与审批规则。DSMM 可收窄，不可通过角色或 Profile 扩权。 | 自定义 metadata、角色名、模型输出都不是授权凭据。 |
| Clash Fake-IP 网络访问 | fetch 与实际实施地址过滤的 shell 网络边界默认允许 `198.18.0.0/16`；不再仅因该地址属于保留网段而拒绝。用户输入 `198.18.0.1/16` 规范化为这一网段。 | DSMM 工具审批 Allow 不代表已穿过 fetch provider 或进程网络边界。 |
| 简单部署与持久化 | 普通新会话和基本委托使用官方存储与运行时，不要求用户手工替换 Registry／Runtime／JSONL。高级恢复不可安全支持时显式限制该能力。 | 根 Agent 有回答不等于子代理执行或冷恢复已通过。 |

## 原生优先架构

### 职责分层与不可变接口

| 层 | 原生提供 | DSMM 保留的必要状态与接口 |
| --- | --- | --- |
| 配置输入 | Loader entry/profile、volatile Config、SettingsForms/ConfigForm、ConfigEditor 事务 | sparse Global、命名 overlay 文档/选择 pointer、各层 revision；不复制原生 form owner，不将保存等同于执行生效 |
| 准备与准入 | Registry 身份、awaited created、preset composition | 完整配置候选、每次调用 pending、精确 Agent 的 live admission、startup ceiling/lifetime；不是另一执行 owner |
| 执行 | AgentLoop、工具/审批、LLM prepared call、SubagentRuntime | role/readonly 交集、manual intent/候选策略、仅必要的 raw 参数适配和配置撤权；不造队列/重试调度器 |
| 资源 | scope skills provider/snapshot、preset/serviceFor、原生 namespace 持久化 | 打包角色/技能、metadata 懒发现、scope 失效；展示记录不恢复授权，历史读取不唤醒 Agent |
| 展示与交付 | 原生 Plugins、session/model 投影、catalog/控制、tool.call.toolview、Plugin Manager | 按动作 capability、dirty draft、严格 DTO/身份展示、自包含包与独立 publication/delivery/install 结果 |

完整字段和文件分工见集成计划。共享主链为配置源 → 完整候选 → 准入 → 请求/工具 → activation/catalog → UI；权限撤权与取消横跨各层。UI 或序列化日志不能反向授予执行权，未发布候选只供创建期间私有 getter 使用。

### 1. DSH 拥有执行，DSMM 拥有业务配置

**默认设计使用官方 `AgentRegistry` 和 `SubagentRuntime`。** DSH 负责 Agent 创建、activation、队列、目录、资源释放、父子归属、深度／容量、原生持久化和 Gateway；DSMM 负责角色目录、preset、路由选择、配置快照、可见身份与必要策略。

执行路径：

`原生调用入口 → DSMM 目标/路由解析与有效策略 → 原生 preset/provider → startActivation → 原生结果/通知 → DSMM 展示`

使用 `delivery: 'caller'` 等待结果，使用 `delivery: 'parent'` 接收原生完成通知。接受后的取消使用 activation receipt 的生命周期接口，不把启动 signal 当作永久任务控制器。检查原生终止原因，不将成功接受映射成成功执行。

本版本的工具结果和状态直接围绕原生 activation 设计，不维护旧 Job-backed 分支或双协议只为兼容旧版本。保留等待／后台体验；同次运行的前台转后台仅在原生 ownership/delivery 能安全支持时提供，否则仅在发起前选择模式，执行中不提供误导性的转换按钮。

### 2. 角色通过 preset/provider 表达

- 角色的 persona、技能、工具集合由原生 Agent Preset 组合；spawn 选择独立 preset，fork 仅用于确实需要继承父会话的语义，不以 fork 模拟独立角色。
- DSMM 根据配置解析角色、类别、模型、effort 和有限的显式覆盖；保留必要的调用前验证，不复制原生执行调度。
- 角色路由与工具拓扑可以选择参数化或独立入口；**可见代理名称不得由 wire tool 名称决定**。不能为了显示 Coding 给每个角色增加一套重复协议。
- 使用原生当前工作目录服务。原始项目路径可以约束权限，但不能冒充当前执行目录。
- 启动天花板、只读和父策略交集继续有效；已有同名角色、可序列化捕获或客户端声称不能授予权限。

### 3. 自定义 Runtime／Registry 的处理

`subagent-runtime.ts`、`agent-registry.ts`、`delivery-authority.ts`、`runtime-composition.ts`、`role-runs.ts` 及 companion 的 owner 职责退出。其间的有效调用/权限校验由 `native-admission.ts`、角色策略和独立 lifetime 承接；配置事务、路由策略、children DTO/UI 不随 owner 删除。不得为恢复业务功能整套带回旧 owner，也不得以已删除 owner 为由删除有效回归测试。

实施前先核对有限的真实入口：首次委托、官方消息工具、浏览器子代理控制、冷恢复、取消／dispose 和插件卸载。将目标／路由检查放在 DSMM 工具与 provider；将执行交还原生。删除的模块同时删除其专属测试，不增加“组件已不存在”的测试。

原生 `subagent/start` 是发布后的通知，不能充当创建前授权钩子。若某个高级策略无法在所有相关入口执行，不通过监听通知补做已经迟到的安全校验，也不 monkey-patch SDK 私有 manager。优先缩小该项功能，例如仅支持下一新会话生效或暂不支持 DSMM 冷恢复。

rc.2 的 `agent/created({ agent, source, signal })` 串行等待，AgentLoop 在其完成前不释放排队输入，可用于执行前初始化；它在 Registry publication 后发生，失败由 factory 回滚，不能承诺之前的观察者从未看见 Agent，也不覆盖所有后续投递。监听器不等待 `whenIdle()` 或自己的 owner disposal。

每次角色工具调用先冻结父 admission、角色与路由，预留唯一 `SessionId` 并登记短生命周期 pending，再将 `childId`、`request.agentPreset`、`request.agentOptions` 传入官方 `startActivation()`。角色 provider 的 `prepareContinuable` 通过 `sessionId + exact parent` 核对 pending，仅返回 seed；它没有请求路由/preset 参数，也不能返回这些配置。awaited created 校验 Registry ownership、header、所选 preset、调用取消及 owner，安装 Agent-scoped 策略/技能/路由后绑定精确 Agent 的不可变 admission，并消费 pending。所有退出路径清理 pending；不使用共享可变 provider defaults。具体数据流及文件归属以[集成计划](2026-10-18-integrated-native-stage.md#每次调用配置的具体绑定)为准。

Preset 没有 child-only/root-eligibility 字段。辅助 preset 注册后，首次创建和空白会话 preset 切换都必须保留有效根资格；`agent-preset/selected` 是通知而非 veto，后者通过公开 `agent/pre-step`、`agent/request` 及工具执行边界拒绝不合法 composition 的执行。通用 spawn/fork 不得绕过 DSMM 受控父的 pending 准入；后续原生消息只使用 frozen live admission，冷 resume 无可信绑定时拒绝执行。原生消息可能已进入 inbox，不能把执行拒绝说成投递前拒绝。

只有当基本需求也确实无法通过公开接口安全实现、且已指出准确缺口时，才允许计划中出现一个边界明确的最小适配层；不能直接保留整套托管架构作为兜底。若该层要求修改 Host、扩大权限或改变数据保护，先取得相应授权。

### 4. 配置与生效时机

- 保留原生 Plugins `plugins.bundle.config`、Settings、drawers、Profiles 和模型目录的用户入口，按原生职责重构其控制器/状态，不另造配置中心。Global、native profile 和命名 overlay 属于不同事务；复用现有 stores，不要求恢复旧内部接口。
- rc.2 `SettingsForms` 仅编辑 volatile 路径；现有 sparse deployment 输入可保持 volatile，表示 desired 更新而非 Agent policy 热更新。`ConfigForms.get(ns)`/`ConfigForm.mutate(ops, revision)` 绑定准确 entry/profile/namespace，保留原生 base/user 与 secret redaction，不以 redacted 全量 replace 清掉隐藏值。普通冷挂载字段不送入 mutate，旧 owner 字段退出不等于所有持久化配置消失。
- 全局与 profile 是独立事务；显式值、继承、Unset、无效输入及 CAS 冲突清晰可见。不得“保存全部”却只成功一半，或 profile 写失败后改写 Global。
- `profile-runtime` 保留完整候选与真实磁盘 CAS/admitted 身份分离。根 publish 不覆盖 baseline/selection/source revision，selection commit 消费 store 返回值；提交后的观察失败不能反转提交结果。异步前后及提交前保留 operator、精确对象和 lifetime 校验。
- Global/store 写使用 prepare/CAS/committed/observation；原生 form 写使用公开 `ConfigEditor.edit` 的原事务。DSMM entry 的必要 permission façade 只负责校验和相关权限撤权，不替换整个原生 editor，不让 direct Settings 写绕过安全边界。保存/通知失败区分 committed、refresh-required/unsynced 与 unconfirmed；无可信 commit 证据不盲目重试。无关字段变化不反复撤销同次原生 once 批准。
- 未来默认影响未来会话；运行中的任务保留其启动配置。普通根 Agent 的原生模型选择不因保存改变。
- 当前会话 Apply 只有在明确空闲、没有未决审批／调用且有安全原生边界时启用；确有接口缺口则只保存供新会话使用，不排队隐式 Apply、不后台重启、不继承一次审批到另一配置。Save/未来默认、Apply、Use profile model、模式切换分别投影 capability 与原因，不共用一个 `switchAllowed` 关闭全部操作。Use profile model 通过原生 `selectModel`，不提交 overlay pointer，保留会话、配置和手工意图时序检查。
- generic routing 保留 assembly 捕获的 manual selection、参数来源、省略 effort、候选顺序和无输出安全 fallback，不锁定旧 route-lock 数据结构。child 的 initialRoute 是初始配置，不是每步覆盖；新的原生手工选择和合法 fallback 继续生效，取消/部分输出阻止自动 replay。
- HMR／插件更新由 DSH 负责。显示原生 applied／restart-required／failed 状态；不承诺不中断 owner 的热切换，不以 remove/install 模拟无损更新。

#### 原生模型接口与 raw 参数适配

原生 adapter 能完整表达并消费的 provider/model/effort/temperature/maxTokens 等配置通过 `agent/request` 与 `LlmRuntime.prepareCall`，捕获一次 adapter generation、默认值和验证后 dispatch。目录使用原生 `listProviders/listModels/resolveModelInfo`；普通根的 downstream/native 选择优先。分流依据是已准入参数策略和实际 adapter 能力，不以字段出现在通用类型中推断支持。

rc.2 `LlmCallConfig/ConfigureCall` 不支持 arbitrary provider JSON，Pi-AI 原生 stream 也拒绝 `stop`；`llm/stream` 不能改写冻结的 loop request。显式 generic raw 参数及已有 passthrough 中原生 adapter 不支持、但公开 payload seam 可安全消费的参数仍须实际消费，包括没有 arbitrary 字段的 stop-only 请求。收敛 `host-llm.ts`、`llm-runtime.ts`、`live-pi-ai-owner.ts` 为单一 native LLM registry 的最小公开 prepare/registration 适配；这些请求使用 `native-pi-ai-wire.ts` 的 public adapter/payload hook，其余完整受支持请求直接委托原生。不预设保留完整旧 LLM 架构，不静默丢字段，也不绕过原生手工选择的能力校验。用现有本地 provider seam 验证 stop-only 的实际请求体。

raw 调用绑定真实 adapter fiber、provider config/credential reference generation 和精确 Agent admission，await 后及发出前复核取消/退役；不复制、修改凭据，不允许 raw 参数覆盖执行 envelope、认证或实际 route，不丢 attribution/附件/工具更新协议。不支持该 raw seam 的 provider 明确拒绝这一配置，标准 Coding 仍可执行。`agent/request-error` 与 `agent/assistant-stream` 仅在正面无输出证据下允许有界候选切换；manual intent（含同值重选）使旧 retry 失效。

#### 技能与 persona 的作用域

`skills.ts` 复用 `registerProvider/snapshot`：list 仅元数据，get 按需读正文；保留 non-DSMM 祖先 winner、不完整发现、取消、读中失效和两 Agent 隔离。`preset-skills.ts` 收敛为准入 scope 内安装/释放的 handle，不为每个 Agent 再注册一套全局 lifecycle owner。模式/preset 改变只失效受影响资源，不循环广播。persona 和 skill 仅决定内容与可发现性，工具/只读/委托资格仍由执行策略约束。

### 5. 存储与恢复

使用官方 JSONL namespace 插件和官方生命周期；不默认引入替换存储 owner 的 companion。DSMM 配置仍保存在明确的配置／Profile 文档，不通过任意日志字段恢复权限。

`appendPluginRecord` 可承载可丢失的展示／关联信息；它是实验接口，迁移保留是 best-effort。记录不是单独的授权来源。完整冷恢复需要原生身份、可信配置快照及有效策略共同确定；缺失或冲突则拒绝恢复该 DSMM 能力，不猜测默认角色、不提升权限、不改写原日志。

交付新会话与基本委托。若安全恢复仍需稳定的原生持久化扩展契约，则提供当前进程的受支持控制及只读历史，不自动恢复 DSMM 特有策略。冷恢复执行拒绝不承诺原生 factory 在 created 前没有 load/repair 日志；DSMM 历史浏览不得调用 resume。guard 在 owner 退役后仍须 fail-closed；公开 scope 无法保证时限制活会话热卸载，不能撤掉 guard 留下无约束 Agent。将具体缺口列入路线图，不重新引入存储代理。

### 6. Clash Fake-IP 的精确默认例外

默认网络地址例外是 **`198.18.0.0/16`**，覆盖 `198.18.0.0` 至 `198.18.255.255`。这是用户明确授权的保留地址例外，不是将其认定为公网，也不代表识别或认证了 Clash。不得扩为 `198.18.0.0/15`、`198.19.0.0/16`、其他私网／回环／链路本地地址或通用 unrestricted network。显式拒绝规则及其他权限检查继续有效。

对 DNS 解析到 Fake-IP 的正常域名保留原 hostname、HTTP Host 和 TLS SNI，不将请求重写成 IP URL；使用解析后的地址判定并保持连接地址绑定。IPv4-mapped IPv6 必须按实际 IPv4 目标执行同一规则。DNS 答案中其他禁止地址、重定向、URL 凭据、响应大小、超时和取消限制不因例外失效。不改全局 DNS、Clash 配置、系统防火墙或宿主认证。

当前目标 SDK 的 `dsh-web-fetch-http/src/network.ts` 使用固定公网地址分类，Config 没有 CIDR 例外入口；`dsmm/src/permission-web.ts` 仅包装工具审批，不能覆盖该传输层拒绝。实现必须落在真实 provider 网络边界，不能新增一个没有实际消费者的“白名单”设置，不能靠工具 Allow 或放宽沙盒模式声称修复。

原生 `sandbox-policy` 的公开契约只定义文件效果，未提供 IP allowlist。shell 侧必须用实际失败命令／错误定位具体 runner、网络代理或命令内调用的拒绝层，不能假定它与 HTTP provider 使用同一过滤器。无配置接口时记录上游 CIDR 扩展缺口；不得修改 `node_modules` 私有实现、进程全局 monkey-patch 或关闭 sandbox 作为交付。

HTTP 使用公开 `HttpFetchProvider(limits, resolveAddresses)` 和 `HttpFetchResolver`，通过 DSMM 独立 ID 的 `WebFetchProvider` 委托原生实现并注册到 `ctx.web.registerFetchProvider()`；不新造 transport、不替换 web owner。DSMM resolver 保留全 DNS 答案、mapped IPv6、transition/NAT64、取消及精确 `/16` 策略，原生 provider 继续负责 pinned connection、同 origin redirect、URL/响应限制与资源释放。直接声明所消费的 rc.2 web seam/HTTP provider 及地址解析依赖，不导入 SDK 私有网络文件。具体文件、依赖、选择和证据要求见[集成计划](2026-10-18-integrated-native-stage.md#fake-ip-与隐私)。

该适配只有用户明确选择后才挂载；不抢占 `http` ID，不因多注册一个 available provider 而隐式外联或制造选择歧义。入口使用直接声明依赖的公开 `proxyRouteFor()` 判断原生路由；应走代理的 Fake-IP／mapped literal 在调用 provider 前拒绝，避免其固定分类器与放宽后的 resolver 合成意外直连。rc.2 已配置代理的域名分支绕过本地 resolver，不声称此分支具备本地 CIDR/DNS 绑定保证；必须执行本地地址 deny 而不能控制远端解析时拒绝，不偷偷改直连。真实 Fake-IP 路由验证和代理远端地址策略分别报告未覆盖范围；不能把 mock resolver 或已有代理可达当作整个网络要求完成。shell 的实际拒绝层未知时保持阻塞；系统宿主修改与上游提交另需授权。

沿用已完成的 **13+2 定向测试及 P1-closed 网络 review**；本次不重开网络设计。**真实 Fake-IP wire 验证不作 gate**，不为其配置网段/TLS/系统代理环境。已有 resolver/代理防护证据不等于真实 Fake-IP、TLS 或代理远端 DNS 验证；交付分别说明覆盖范围。shell 无实际拒绝来源仍为独立缺口，不猜改 sandbox，不阻塞 HTTP 集成或其他已验证能力。

## 代理名称展示设计

### 可见文案

- 当目标可识别时，主调用行包含代理名称：`调用 Coding`、`调用 Reviewer`。可附加 `· high` 或简短任务描述，技术名 `dsmm_category` 放在详情，不占据主标题。
- 原生 subagent 名称使用首字母大写的简短 agent 名、冒号及任务描述，例如 `Coding: 修复登录问题`，不附加技术 ID。创建请求、activation 与后台任务使用同一 label；任务描述不能替代或决定代理身份。不改写既有会话名称。
- 参数尚未给出目标时显示 `调用 DSMM 代理 · 目标待确定`；流式参数一旦能安全解析目标就更新名称，不等结果返回。
- 请求目标与实际执行不同或尚无执行证据时，明确区分“请求 Coding”和已验证执行信息；不能把输入猜测包装成执行事实。
- 完成／失败／中断后仍保留目标名称。原生 Auto review 拒绝视图等优先级更高的安全展示不被 DSMM 覆盖；其限制应如实说明。
- 当前版本记录的重放使用记录中的目标及有效元数据，不依赖活的 Agent。未知数据展示未知，不猜测；不增加旧版日志解析分支。

### 实现接口与边界

优先使用 DSH `tool.call.toolview`，按实际 wire tool 注册视图。消费原生 `preparing`／`start`／`result` 与 lazy args，并复用原生 disclosure、状态、inspect、复制和无障碍语义。根调用和嵌套 PTC 调用使用同一身份解析，不自行配对 Session 事件或重建调用树。

Host `presentCall/presentResult` 不进入新版 Web Client，不能作为 Web 标题修复方案。现有 `RoleToolView.tsx`、`RoleToolView-data.ts`、本地化资源和客户端注册可以复用，但必须验证它们实际接入原生调用树；已有代码不代表已交付。

遵循 `dsmm/DESIGN.md` 的原生 token／组件约束，不更换视觉体系或增加框架。该文档中的旧运行时选择不约束本计划的架构。无定制 Web renderer 的宿主在可用文本输出中提供角色名，不声称其 UI 与 Web 等价。

## 有用能力与明确受限边界

| 能力 | 首选方案 | 具体卡点／最小可用交付 | 后续恢复条件 |
| --- | --- | --- | --- |
| 基本角色委托与结果 | 官方 activation + preset/provider | 必须交付实际委托、结果和取消；不以空壳配置替代 | 基本功能无降级为“仅配置”的方案 |
| 代理调用名称 | 原生 keyed tool view，流式目标解析 | 至少 Web 收起行在目标已知时显示 Coding 等名称；美化不阻塞 | 补充其他宿主实际可用的显示接口 |
| 当前会话 Apply | 原生可执行的空闲／审批边界 | 无可靠边界时仅未来新会话生效，明确不可热应用 | 支持精确单次调用、审批和配置绑定的接口及行为证据 |
| 同次运行前台转后台 | 原生 activation ownership/delivery | 无安全交接接口时仅启动前选择，不重启任务模拟转换 | 原生支持可观察的同次执行交接 |
| 持久化子代理续聊 | 原生恢复 + 可信 DSMM 配置绑定 | 缺失可靠绑定时限制 DSMM 恢复，保留历史；基本新会话仍可用 | 能验证身份、策略、丢失与关闭／重开行为 |
| 热更新 | 原生 Plugin Manager/HMR | 展示需重启，不保证不停机；不替换活 owner | 原生可保持活动任务／审批的生命周期契约 |
| 重复 Git 审批 | 复用原生权限与精确命令策略 | 没有准确触发命令和审批原因就不放宽规则 | 获得具体触发证据和不扩权的修复路径 |
| Clash Fake-IP 默认例外 | 沿用独立实现/review 的公开 HTTP resolver 适配，精确 `198.18.0.0/16` | 13+2 定向证据与 P1-closed review 继续有效；真实 wire 非 gate，TLS/真实网络未验证注明；shell 拒绝层仍未知 | shell 仅在取得具体拒绝来源后给出方案，不为本次补 wire gate |
| Web Search／Fetch | 用户显式配置原生 provider；精确 Fake-IP 可选择上述公开 HTTP resolver 适配 | 不另造搜索/提取或凭据系统，不自动发送原始问题或更改 provider | 明确用户选择；验证权限、返回语义和实际网络消费链 |
| LSP | 优先使用原生只读导航 | 原生仅 definition/references/implementation/hover；不将其声称为 diagnostics/rename/format | 额外能力有单独权限与实现依据；不恢复旧自动挂载仅为兼容 |

卡点只记录当前无法满足的目标、接口缺口、可用替代及重启条件，维护在 `dsmm/docs/roadmap.md`。不记录执行日记、假设流水或无期限的“继续调研”。发现与本需求无关的问题另行报告，不扩展任务。

## 实施波次与验收证据

以[集成计划实施顺序](2026-10-18-integrated-native-stage.md#实施顺序与产出)为执行入口：先固定跨域接口，配置/form、技能/presets、模型/参数可并行收敛；官方 admission/activation/权限消费这些契约；children/UI 接实际 native 投影；最终包/协议验证后才执行清理、提交、发布及安装。现有两份中间实现不约束任务边界，不将既有功能列为从零待办。

最小有效证据为：配置提交后观察失败及多 Host CAS、原生 form/direct Settings 写与权限同步、旧根/子和新根配置隔离；手工模型意图、真实 raw body、fallback/取消；技能懒加载/祖先 winner/失效；官方 Coding 结果/失败/取消、root/readonly/caller/depth、created 与退役竞态；真实 child 控制、独立动作能力及名称视图。迁移现有 fixtures 与有效断言，只删除被撤销 owner/协议的专属测试。源码必须先与测试导入的 `lib/` 对应。

既有依赖/UI/label 及网络证据在相关输入未变时复用，不因写计划重跑。网络不重复设计或派实现任务；shell/wire/Electron 分别报告。开发构建产物不代表 npm/GitHub/Desktop 三个交付面完成。

## 0.3.1 发布与 Desktop 安装

- 新包为 `@dsmm/dsmm@0.3.1`，tag 为 `dsmm-scoped-v0.3.1`，tarball 为 `dsmm-dsmm-0.3.1.tgz`，SDK/host contract 精确 `0.2.1-rc.2`。`release-contract.mjs` 为该版本定义最终 exports/官方组合及包资源，不扩写 `0.3.0` 的 rc.1 policy，不以被删除 owner 的旧验收字段决定新包。
- `.github/workflows/dsmm-release.yml` 的 `split-publication-v1` 继续采用六 job；普通 tag push 选择普通 prepare/publish，recovery pair 与 bootstrap 按协议 skipped。prepare/pack/freeze 绑定 source/control/tag/run/attempt 与原 tarball；必要 provenance/校验和保留，不新增全源码/环境锁。
- `terminal-publication` 只证明 npm publication；GitHub transport/finalize 另证本次拥有的 draft/assets、原 tarball、receipt、checksums、tag 和 public 状态。部分失败不得覆盖、repack、移动 tag 或修复已发布版本。根 OCMM checker 不适用；不新增 registry readback 或 fresh reinstall gate。
- 必要开发验证后只提交 DSMM 相关内容，保留无关 staged/dirty/stash。遵守仓库提交前 typecheck/test/build 门槛；未推送的无关提交不能混入 push。新 tag 不提前创建/推送，历史身份不改写。
- 发布完成后用 Desktop 自有 carrier/公开 Plugin Manager 安装准确插件版本；先核对实际宿主是否为精确 rc.2。宿主版本/安装 API、同名旧 bundle 冲突或数据迁移要求不满足时报告安装阻塞，不能升级宿主或修改 credentials/session 来完成。安装记录与实际 Electron 激活分别验证；开发与行为探针均用任务自有 profile/session，不向真实会话发起执行，不强杀或自动重启活动宿主。

## 验证与当前授权限制

按受影响接口执行定向测试和隔离运行验证；集成阶段统一安排必要重型检查，不重复每个子任务的整套验证。开发阶段不操作系统 Desktop；授权交付阶段仅安装插件，真实用户会话、credentials 和无关配置仍不可改动。编译、构建和静态核对只能证明相应集成条件，不能用其或旧候选包结果替代当前架构的行为证据。

复用有意义的现有检查，仅补充改变的行为边界；不新建大型夹具、不增加文档／包版本／机器环境／全文件 hash 锁。真实 UI 使用隔离上下文，不登录、不复用用户认证；认证不可达时报告限制。安全或数据边界没有证据时不宣称已满足。

## 上游依据

- [完整版本跨度](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.0-rc.2...dsh-v0.2.1-rc.2)、[0.2.1-rc.1 发布迁移说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.1)、[0.2.1-rc.2 发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2)。比较涉及 1,925 个提交；GitHub 聚合文件列表有上限，不将其视为完整 API 审计。
- [Activation 迁移](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/upgrade-guide/v0.2.1-alpha.1/subagent-activations/guide.md)、[Preset 组合](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/upgrade-guide/v0.2.1-alpha.1/subagent-preset-composition/guide.md)、[原生 Runtime 接口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/subagent/subagent/src/index.ts)。
- [原生 Tool View 契约](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/client/ui-tool/README.md)、[工具模式变更](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/upgrade-guide/v0.2.1-alpha.1/tool-presentation-mode/guide.md)、[工作目录与 PTC 展示](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/upgrade-guide/v0.2.1-alpha.1/working-directory/guide.md)。
- [JSONL namespace 插件](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/upgrade-guide/v0.2.1-alpha.1/jsonl-persistence-plugin/guide.md)、[实验 PluginRecord](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/core/session/src/index.ts)。
- [Plugin Manager](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/boot/plugin-manager/README.md)、[HMR](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/boot/hmr/README.md)、[Gateway 交互参与](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/upgrade-guide/v0.2.1-alpha.2/operator-connect/guide.md)。
- [凭据优先级](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/upgrade-guide/v0.2.1-alpha.2/stored-credentials-precedence/guide.md)、[Azure provider 命名](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/upgrade-guide/v0.2.1-alpha.2/pi-ai-azure-provider/guide.md)、[原生 LSP 范围](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/lsp/lsp/README.md)。
- [HTTP 地址验证与连接绑定](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/web/web-fetch-http/src/network.ts)、[HTTP provider 配置](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/web/web-fetch-http/README.md)、[Sandbox policy 边界](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/sandbox/sandbox-policy/README.md)。
