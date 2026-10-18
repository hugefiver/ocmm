# DSMM 历史会话、会话配置与临时权限

## 目标与交付边界

在 DSH **`0.2.1-rc.2`** 上交付以下完整用户流程：

1. 打开 DSMM `0.2.x` 历史会话，保留列表条目、标题、消息和工具结果；加载历史与恢复执行分别处理。继续执行使用现行配置和新建立的权限，不复活旧审批。
2. 新会话首条消息前，可选已保存配置或默认配置，包括已经创建的空白会话；保留未发送文本和附件，不改变未来默认配置，不开放已开始会话的配置热切换。
3. 设置抽屉只有一个主要 section 时默认展开；普通界面只留下选择所需信息、必要风险与可操作错误。使用“本次会话配置”“新会话默认配置”“使用默认配置”“保存”等一致措辞。
4. 命令及子命令支持“仅本次”“本次会话”“15 分钟”“1 小时”批准，能查看、撤销；绑定真实调用、参数和项目，不自动跨会话或子代理。明确的子代理授权有可用入口和完整权限边界。
5. 保留原生按会话持久化的文件权限模式；提供能力真实覆盖的文件/目录及网站临时授权。精细文件隔离和 shell/子进程网络限制必须由实际执行后端支持，缺能力时明确阻塞，不以配置项代替执行效果。

范围限于 DSMM 及达成这些流程必需的 DSMM 支持。保留现有原生执行、单一审批、存储所有者与完整性约束，不引入第二审批队列或平行持久化执行引擎。长期“始终允许”不属于此次必需交付。External LSP、运行中任务后台交接、通用热更新等 roadmap 项不扩大进本任务。

项目内最小 DSH rc.2 补丁授权覆盖历史浏览/显式激活、审批 request/delivery/winner/final audit 关联，以及三个执行接缝：preset lease 同步现行性校验、Web Fetch 准备与最终 provider 交接、fresh 子代理审批来源证明。不更改原生 waterfall 拒绝语义、默认权限或网络安全规则。交付 pnpm patch artifact、公开类型及隔离验证；只重建现有依赖的任务专属副本。历史 worker 持有 `dsmm/patches/dsh-session-activation/`；权限 worker 持有独立审批/Web/subagent artifact；根 package、workspace、patchedDependencies 与 lockfile 由父协调者统一合并。此授权不包含 Desktop 安装、宿主升级、真实会话迁移或精细文件/全进程网络隔离 backend。

不得提交、推送、打标签、发布，或修改 Desktop 用户配置、凭据和真实会话。不得手改已安装 `node_modules`、系统代理或无关 OCMM/Codex/prompts/src 工作区改动。只用现有依赖、合成历史和任务专属隔离副本；浏览器 QA 可使用已获授权且仅安装于任务临时目录的 Playwright 与现有 Edge，不加入项目依赖，由父协调者清理。其他新软件/依赖或补丁接口扩围须另行授权。真正部署必须使用承载补丁的 Host；项目补丁及测试通过不代表当前原版 Desktop 故障已消失。

## 已验证接口与当前限制

以下路径以仓库根为基准。SDK 引用指已安装 rc.2 包供只读核对的 `lib/types/` 声明、同目录源码及实际 runtime `lib/index.js`。补丁修改包副本并形成项目 artifact，不直接编辑这些已安装文件。

| 领域 | 当前证据 | 实施约束 |
| --- | --- | --- |
| 历史 | 正式隔离研究已确认：follow 第二次 next → source.retain/promote → resolveObservedAgent → native writer；created 拒绝后 disposed → removed。list/inspect/follow 首帧/page 纯读正常。 | Host `activateOnFollow:false` 在 retain 前阻止 promotion，仍保留原生持续事件流；不把首帧成功当完整浏览证据。 |
| 存储 | `AgentLoop.resumeWith()` 在 created 前取得 writer、追加 interrupted-turn closers 与 session seed suffix；研究观察到拒绝前追加 turn/end 和 session/end-seed。JSONL `open("write")` 还能在返回句柄前发布迁移。 | admission 在 open(write) 前；持锁后的版本/权限校验在迁移发布与第一条 append 前。原生 revision 不是写入 CAS 或锁。 |
| DSMM 恢复 | `src/native-admission.ts:created()` 拒绝非 startup 的 DSMM preset/历史模式；`profile-rpc.ts` 只查询 live root，不 resume。 | 旧 admission 无法恢复只能限制执行，不能阻止读取。查询 profile 不得增加隐式激活。 |
| 空白配置 | `profile-runtime.ts:selectSession()` 无条件 unavailable，`sessionActions()` 固定 `canApplyOverlay:false`；`publish()` 不允许覆盖。`native-admission.ts:rebindBlank()` 只处理 preset/scope 变化，沿用原 admission。 | 必须实现空白阶段的真实配置提交；只改按钮、DTO 或复用 preset rebind 不足以交付。 |
| 原生互斥 | `Agent.runMaintenance()` 同步抢占 true-idle；期间新 waking input 留在 inbox，状态仍可能显示 idle。`SessionController.create()` 支持 blank reuse，但不是 DSMM profile 选择 API。 | 空白选择与首条 prompt 必须用 native maintenance 串行化；仅判断 `status === idle` 不充分。 |
| 配置存储 | `ProfileStore.selectSession()` 已有 selection/profile revision 检查、锁、atomicReplace、prepare/committed；客户端有 session/connection generation fence。 | 沿用这些真实提交边界；不伪造 native create 的 profile 参数或把配置写到全局默认。 |
| 审批 | 原版 `ApprovalService.request()` 生成 audit id，但不传给 request；Gateway 另有 eventId/client delivery，最终只回传 outcome。`never` 在 answerer 前拒绝。 | 补丁公开关联及最终回执；真实 args 仍来自执行边界。不能以相同 session/tool/callId、RPCissued 或 Client 布尔值推断 winner。 |
| 审批 UI | 真实 `PendingApproval.answer("allowed-once")` 与原生按钮走同一 Remote/native path，保留前置拒绝及 await-next 后置 veto；key 是 Client 局部计数器，answer 的 Promise 不代表 Host final audit。 | 复用原生 pending 与按钮，补充原生 first-wins 结算的 sideband，不在 Host 提前 claim。native terminal consumer 后普通 listener 对人工/自动均不执行，不另造通用 veto 链。 |
| 命令 | `permission-control.ts` 按 execution token 绑定、`approvedTarget` 同次消费、`finish()` 清理；`permission-controller.ts:shellScope()` 保留原生 body/approval/shell。`permission-native-command.ts` 有有限 literal grammar 与 tool/executable/subcommand/argv/cwd 精确匹配。 | 复用同次绑定与有限解析，新增临时授权内存，不扩成命令字符串前缀 allow。 |
| 子代理 | `captureDelegatedPolicyOverrides()` 通常把 approval 固定为 never；`role-control-rpc.ts` 已有 exact root、direct-child、continuable、live owner 校验和原生 prompt/interrupt。 | 不改变默认继承，不借 root answerer 绕过 child never；显式授权和更改可交互策略必须分别受控。 |
| 文件/网络 | 原生 `SandboxExecutionPolicy` 只有 mode/workspaceRoot/sessionId；没有额外读写根或 network 字段。现有 DSMM outside-read/web 控制是工具层。当前本机 backend 以文件 effect 为主，fs sandbox 不限制读取；Windows 为 partial，存在 hardlink 等边界。 | 文件/网站工具批准不等于进程隔离。不能将 read-only 改为 full access 或移除原生 deny 来实现某目录写入。 |
| HTTP | `web-fetch-fakeip.ts`/`web-fetch-address-policy.ts` 有已审查的精确 `198.18.0.0/16`、proxy、IPv6、deny 防护。 | 保留既有安全规则和 provider 选择；不扩大私网、不修改系统代理。已有有效证据可复用。 |

隔离研究已证明上述后台写恢复失效链；它解释了与 Desktop 症状一致的机制，但未在真实用户记录上重演，不能声称已经修复或验证该真实实例。未知 preset 在 `agent/created` 前解析失败；`agent/pre-step` 晚于 inbox claim，不能承担启动门禁。历史展示保持 detached observation，不将其注册为 live Session/Agent；计划与实现不访问真实记录。

## 一、历史浏览与继续执行

### 用户可见状态

- 历史可读性与执行能力是两个独立字段：可读/部分可读/损坏；尚未授权继续/可继续/执行不可用。执行错误不能清空已经读出的内容或改写标题。
- 历史列表由持久化记录及原生授权查询支撑，live Agent 的退出不代表记录删除。加载期间保留已有标题；仅确实没有标题才显示 id。分页、工具详情、失败/中断结果及 child 路径都保留。
- 历史普通内容、旧 prompt、工具输出、旧审批、旧角色 metadata 均是不可信数据。未知的非执行展示字段可保留为详情；未知的执行字段不转成现行权限。
- “继续此会话”先展示将采用的当前配置、角色和权限范围及必要行为差异，再由真实 Host 操作者确认。无法继续时仍可浏览，显示具体原因和可行动作；不能只显示“旧准入不可恢复”。

### 最小兼容补丁与公开接缝

以下新增名称为拟交付接口，不是原版 rc.2 已有能力。保留包版本 `0.2.1-rc.2`，通过 patch 明确区分能力，不依版本号猜测是否已修复。

| 修改包/位置 | 最小职责及类型同步 |
| --- | --- |
| `@deepseek-ai/dsh-api-session-controller`：`SessionController.Config`、constructor；`SessionHistoryController` constructor/follow | 新增 Host 配置 `activateOnFollow?: boolean`，schema 默认 true 保持普通部署兼容。传入 history owner；false 时在 `source.retain()` 之前跳过整个 promotion 分支，不提前 return，不替换 follow。同步 `lib/types/index.d.ts` 的 Config/ResolvedConfig、`history.d.ts` constructor 与 runtime bundle。DSMM 受支持 Host 组合显式配置 false。该开关只控制浏览，不是执行许可。 |
| 同包：`SessionController` 与 `ApiSessionAgentController` | 提供窄的 **Host-only 显式继续接口**，接收当前 preset/模型组成、调用取消和可信 setup/准入上下文，复用原生同 id claim/resume 去重、selection 安装和 AgentHandle 所有权。具体名可定为 `activateSession`；不能直接透出一个免确认的 Client remote。与 `composeAgent()`、`resumeObserved()` 区分，显式继续不先解析历史 preset。同步 `index.d.ts`/`agent.d.ts` 及实际导出；无须给 follow wire 增加可绕过 Host 配置的参数。 |
| 同包：Client opening gate 与只读 Remote | 按下文增加 required bootstrap 输入、`prepareHistoryOpen`、generation/scope/physical-opening 门禁及 `followReadOnly`；新增只读支持探测，不通过旧 `follow` 的额外字段协商安全性。同步 Host/Client runtime、公开类型和 `typert.host`/`typert.remote-client` 描述与 codec。 |
| `@deepseek-ai/dsh-agent-loop`：`AgentLoop.resumeWith()`、setupAndPublish/initializeAgent 的准入检查 | 在 `persistence.open(id,"write")` 之前调用新增公共 activation-admission guard，晚于无副作用的输入/owner 校验，早于 writer、closers、SessionPreparation、发布及 inbox claim。公开 guard 注册/请求/结果契约与 required 模式写入 `lib/types/index.d.ts` 并同步 runtime。所有 guard 都必须通过，不能采用某个 allow 短路其他 veto 的 waterfall。默认无 required 要求保持原版兼容；DSMM Host 在启动恢复之前启用 required，未挂载/已退出的 admission provider 返回不可继续，不能因没有 listener 自动放行。 |
| `@deepseek-ai/dsh-session-persistence`：`SessionPersistenceOpenOptions` 与后端能力声明 | 新增受支持的 write-admission 校验能力：loop 可传入可信、不可由 wire 伪造的同步校验回调，接收持锁下的不可变逻辑 inspection、存储格式/是否将发布迁移的信息。声明后端是否实际执行该回调；DSMM required 激活不接受会忽略新 option 的旧 backend。此接口只加校验，不提供写数据或更改权限的能力。 |
| `@deepseek-ai/dsh-session-persistence-jsonl`：`open()` write 分支 | 在 acquireLease + requireStoredLog 之后、`publishStoredMigration()` 之前执行上述校验；current-format 也在授予 write handle 前执行。校验拒绝释放 lease，无迁移发布、append、Session/Agent 注册。保留原生 migration source-generation、恢复原件和单写者保障。同步该包声明中的能力以及 runtime；不更改 worker 的转换算法。 |
| `@deepseek-ai/dsh-agent-preset-registry`：`acquireScope()` lease | 保留 `key` 与 `AsyncDisposable`，新增同步 `assertCurrent(): void`：lease 未 dispose、captured generation 未 retired，且 `definitions` 当前该 id 的 generation 与 captured 完全相同。unregister 先删除 definition 再 await ready/标记 retired，因此必须检查当前 registration identity。同步 runtime 与公开类型，不增加取消 signal，不因正常 lease release 取消已成功 Agent。 |

两个 persistence 包封闭确认后记录变动及 open(write) 内部迁移竞态；只在 loop 返回 write handle 后检查不足以提供保证。五包 Host 组合保持；Client opening 补充同包只读 Remote 和两个原生 UI 所有者的前置等待，不改 SessionStore、agent registry 或格式转换算法。subagent 的另行授权接缝只用于第四节 fresh 来源证明，不扩大历史恢复权限。

`dsmm/src/history-candidates.ts` 的 `candidate.assertCurrent()` 必须调用 captured lease 的同步校验；缺此能力返回 unsupported，失效返回 stale。沿用现有 pre-write、locked-read、publication 和 serial created 结束后的 final check，不改 loop 时序。释放候选资源不取消成功 Agent；退役或同名替换使未提交 activation 失效，不凭仍存活的 scope/service 对象继续执行。

**guard 合同：** 请求至少包含原生生成的本次 activation identity、owner、persistence 实例、sessionId、parentAgent（如有）、实际 ResumeAgentOptions/setup identity 及 fused signal；不从 reason、历史 metadata、可序列化 token 或仅 id 取得许可。guard 返回一次性准入及 current/loaded/publish 校验、生命周期取消/清理能力。校验在异步准备返回后、write 调用前、后端持锁且尚未发布任何写操作时，以及 setup/publication 前执行。成功许可仅对该次原生 activation 有效，不成为后续执行或其他会话的宽许可。声明还需明确原生 failure category（authorization-required、stale、cancelled、unsupported-backend），防止被当作 not-found 后创建替代会话。

**覆盖入口：** 共同调用点是 `AgentLoop.resumeWith()`，不只 `AgentRegistry.resume()`。现有 `resume(ownerCtx, options)`、配置 `resumeSessionId` 的 deferred inject、`restoreOrCreateConfigured()` 及 subagent `ensure` 中的 `ownerCtx.agents.resume({parentAgent,...})` 都必须经过它。Controller 的 prompt/rename/selectModel/updateQueue、Typert agent/session/context lookup、file-upload resolver 触发的 cold resume 同样受 guard 控制。fresh create 不借失败恢复改写已有 id；门禁拒绝不是 `SessionPersistenceNotFoundError`。非本机/替代 AgentFactory 若不能证明遵守该公共合同，不属于 DSMM 可恢复执行后端，历史仍可读。

**初始化可见性：** Session/Agent 可能在 serial 创建通知结束前进入 registry。Controller 必须识别 activation 的 initializing/committed 状态，并在 live 快路径、同 id promise 合并及异常后的 raced-live 退路之前检查。普通 prompt/updateQueue/lookup 遇到尚未完成的 activation 返回明确的正在激活结果，不返回该对象，也不等待后自动继续原操作；仅 exact 同一授权 activation 可以共享结果。最后的授权检查在全部异步创建通知结束后、maintenance 释放 driver 前完成。

**失败清理：** 恢复 activation 未提交且 driver 尚未释放时，所有清理层都保留旧 inbox，包括 initialize 失败分支、最终 prepared disposer、machine cancel 以及 DSMM owner 撤销。仅第一次 cancel 使用 keepInbox 不充分；最终 disposer 不得再次以默认参数清空队列。该规则限定于未成功的恢复初始化，不更改正常运行会话的取消语义。

### 浏览与流保持

- native list/inspect/page、follow snapshot 和后续 durable/assistant frames 保持原有授权、分页 cursor、buffer ordering、取消与清理语义。false 仅省略 retain/promote；不能只 yield 首帧，不能把 stream 改成一次性查询。另一个已授权执行者启动同一会话后，现存 follow 仍观察其合法事件。
- 历史 observation 保持 detached，不通过 `SessionStore.prepare/enter/announce` 注册伪 live view，不占用之后 native resume 的身份或生命周期。只读 profile/permission 状态不 resume，也不要求有 live admission。
- 原生 disposed 仍是运行生命周期事件，不证明持久记录被删除。预期权限拒绝都在发布前发生，不产生 removed；显式继续若在已许可的 setup/publication 阶段失败，历史视图保持持久内容。若 Controller 生命周期通知会移除该已知持久行，在同包对该恢复事务的持久存在事实分类并恢复/保留 native catalog summary；不可全局吞掉真实删除/权限撤回，不能让 Client 清空后靠用户刷新掩盖故障。

### 原生 Client 打开前门禁

**接入依据：** `dsh-api-session-controller/lib/types/client/sessions/service.js` 的同步 `retain()` 先 `retainScope()` 再 `Session.open()`；scope 发布会唤起其他插件，不能等 composer slot 的 `describe()` 才检查。`Session.resync()` 会重新 open，`client/transport.js:SessionEventStream.follow()` 是 journal/carrier 每次物理重开的入口，`client/index.js:connected()` 另行触发全量 refresh/control restart。`dsh-client-connection` 的 generation subscribe/onConnected 是同步通知，sink 异常不终止连接；没有可直接使用的全局 async readiness barrier。不能宣称 DSMM core 抛错会停掉整个 Host，也不把业务检查塞进 Gateway 所有的唯一 connection loop。

采用**同包 generation 门禁加调用方前置 await**：保留同步 retain 的返回合同，在可等待的原生导航/资源边界获取 lease；同包内部同步门禁防止未适配插件先创建 scope。新增名称是本次公开接口设计，不是 rc.2 原有 API。

| 包/所有者 | 最小改动与结果 |
| --- | --- |
| `@deepseek-ai/dsh-api-session-controller` Host：`SessionController`、`SessionHistoryController` | 增加只读 `historyOpenSupport` Remote，返回当前 required guard 的可用性与 generation；不 resolve Agent、open(write) 或承诺执行权限。支持组合通过 Host-only `registerHistoryOpenGuard()` 注册可信、可撤销的 readiness guard，复用 DSMM 现行 compatibility/activation owner 检查；缺 guard 或 owner 更换 fail closed。增加 `followReadOnly` stream Remote，保留普通 follow 的地址资源授权及 frame/schema，调用共享 native history 流但**每次调用强制不 promotion**，不临时改全局 `activateOnFollow`。required 调用还核对预检的 guard generation；不接受旧 Host 忽略未知 option 后继续普通 follow。 |
| 同包 Client：`client/index`、`sessions/service`、`sessions/manager`、`sessions/session`、`transport`、scope/agent context adapter | 新增 `prepareHistoryConnection({signal})` 供尚无目标的导航等待 generation 预检，`prepareHistoryOpen(target, {signal})` 在同一门禁上生成 opaque 本地 lease，并公开 opening readiness/error。lease 绑定 connection instance、当前 generation、完整规范 `SessionAddress`、guard generation 与 owner lifetime；不能由 JSON、sessionId 或 boolean 构造。同步 `retain(target, options)` 接受该 lease，required 下先校验后才 resolve/materialize scope/open；非 required 保持旧行为。`using()` 内部先 await prepare，再沿用 reference.ready/release。 |
| `@deepseek-ai/dsh-api-gateway`：Client incoming dispatch、受保护的 outbound dispatch、Host RPC/stream 接收入口 | 提供 opt-in 的 scope preparation/dispatch guard 接缝。incoming Agent delivery 在同步 resolver 前等待同 generation 的准备，保留原 delivery 与取消；outgoing required 调用使用独立的受保护 RPC/stream 入口，携带只读探测得到的 Host/guard generation，实际接收 Host 在任何 Agent/session lookup 前核对。该补丁与已有 approval settlement 合并为同一包 artifact；不改变普通 endpoint、非 required 组合或审批 first-wins/outcome。 |
| `@deepseek-ai/dsh-client-ui-workspace`：navigation 的 `replaceMain` 及调用点 | 主视图唯一 retain 所有者是 `replaceMain(...): sessions.retain(..., {source:"mainView"})`。required 分支先 await prepare，再取得新 reference，等待其 `ready` 成功后复核导航身份/取消，才提交 selection 并释放旧 reference；`restoreSelection`、`openWorkspaceSession` 等等待该结果，`openSession` 保留现有 public void 入口，由私有异步流程承接错误。每次导航取消前一次，沿用 layout/lifetime signal；等待/失败保留旧 reference、标题和草稿，失败仅释放新 reference。`beforeOpen` 仍在 binding 已建立、selection 提交前运行。非 required 分支保持原同步选择时机。 |
| `@deepseek-ai/dsh-client-ui-subagent`：`subagentChatResourceProvider.open` | 既有 async generator 在 `sessions.retain(address,{source:"sidebarChat",signal})` 前 await prepare，使用完整 parent/child/mode 地址；取消后不 retain、不 yield。资源 finally 继续负责 release，保留原生 SessionProvider/conversation renderer。 |

上述 workspace 还通过 `sessions.using(...,{source:"workspaceOperation"})` 执行 rename，由同包 using 统一适配。Typert Client agent resolver 保持**同步**，`retainAgentScope()` 只在当前 connection/guard generation 已验证时创建 scope，不自动 open 历史或赋予执行权限。Gateway 在调用 resolver **之前** await 已注册的 scope preparation；required 状态在 Gateway 开始 incoming 派发前即默认关闭，尚未完成准备不得被捕获并发送 `next`。准备期间保留原生 delivery，不建立第二审批队列；取消/断线终止原请求，确定不兼容时按原生错误结算并显示原因，准备成功后仍由同一 native approval consumer 回答。历史打开仍需完整地址 lease。`retainScope`/公开 scope 创建、既有 scope 的 Remote identity 编码及 Session 操作入口均检查 gate，不降级为 root context。

**实际接收端绑定：** 本地 generation 校验只负责 Client 准备；required outbound RPC 和 stream 必须通过新受保护入口（例如 `$historyScoped/call`、`$historyScoped/stream`），不能把 optional 字段附在旧 endpoint 上期待旧 Host 拒绝。envelope 保留原 endpoint、不可变 payload、scope/address，以及探测所得 Host/guard generation；接收 Host 先校验自身现行 guard 和身份，再沿原 dispatch、peer、资源授权、参数 codec、signal 和限额调用一次。旧 Host 不认识新入口时失败，绝不 fallback。禁止 envelope 嵌套或携带协议控制端点，不能扩大原方法权限。所有可能冷激活的 sessionController 调用和 agent-bound 调用均覆盖；实际路由清单由 descriptor 和 Controller 行为确定，不能仅凭参数名猜测。

只读 support probe 是明确的 bootstrap 例外：不创建 scope/Agent、不写数据，可在 gate 关闭时调用，避免准备流程自锁。Gateway 在服务公开与 incoming 派发前读取同一 required bootstrap；缺准备提供者保持关闭。gate 注册与支持探测不得依赖先创建目标 scope。物理 stream opening 和 HTTP 实际接收均复核 generation，覆盖 payload 已准备后等待新 socket、Client 尚未观察到 Host 替换的窗口。guard 撤销/替换终止受保护 pending opening；不声称 HTTP 自带自动重试，也不要求修改 Connection 的独立 lifecycle loop。

`openWorkspaceSession`/`restoreSelection` 可能在 replaceMain 之前调用 connectBlank/restoreBlank/create，因此 required 导航先 await `prepareHistoryConnection`，原生 create/fork 等操作也校验当前 generation 后才发 Remote。该前置保护不决定冷 blank 的恢复方式；其语义仍由 frontend 负责人处理，共享 workspace patch 串行整合，不重写 blank admission 或 effective Git helper。

**初始化与生命周期顺序：**

1. 支持组合的 bootstrap owner 在 native Client 初始化前，通过已有 `webserver/index-inject` 的 head/global 注入 required 标志，Client 初始化时固定该值；页面遵守已有 `__DSH_BOOT_READY__` 顺序。该标志是部署要求，不是来自 Host 探测结果的自动降级开关；不能等 `dsmm/src/client/index.ts`、slot 或 binding 挂载后才设。DSMM 的 `history-support.ts` 提供组合接入，bootstrap 注册须独立于可能失败的 DSMM core 初始化。非浏览器隔离组合显式传同等初始化选项。用既有 webserver/frontend 接缝，不修改这些 SDK 包。
2. Gateway 和 session-controller Client 在各自 service 对外提供前读取 required 并建立 closed/pending gate，只提供安全的准备/状态及已证明只读的 bootstrap/catalog 操作；在连接 generation 建立时发起只读 support probe。DSMM guard 尚未安装、探测不存在/失败或 Host 不兼容时显示 unavailable，零 scope/open/Agent lookup；guard 就绪后允许显式重试。正常 incoming delivery 可以等待已有本代 probe，但不能无限等不存在的 provider，也不把失败当空列表或 not-found 后 create。
3. 原生 navigation/child opener await prepare；generation preflight 可以合并，但调用取消各自有效。返回前及同步 retain 前复核 exact connection/generation、guard 和完整地址；地址因 catalog 更新而变化必须重取 lease。释放或取消一个导航不能撤销其他合法 reference。
4. `connected()` 的 manager refresh/control restart 先经过同一个 generation gate；generation 丢失/替换同步关闭旧资格并取消旧 opening。保留已显示内容和 native ownership，不清空列表或吞 removed。Session.open/resync 及每次 `SessionEventStream.follow` 物理 opening 都 await/revalidate gate；carrier retry 即使 connection generation 未变也需复核 guard，不能依赖 connected 再触发。required lane 只调用 `followReadOnly`，method 缺失、拒绝、未知 schema 都不 fallback 普通 follow。
5. guard 退出/替换、取消或旧 probe 晚回不重开旧资格；Host 在 `followReadOnly` 入口同步验证现行 guard 后才读历史，流整个生命周期不会 promotion。正常 continuation 仍经过既有 activation guard，所有新增只读 probe/lease 都不授权 resume、迁移或执行。

**授权与部署边界：** 只读 endpoint/Client gate、Gateway 的 opt-in 受保护入口与 pre-resolve 等待，以及两个 UI 包的最小 await/取消接入，是已授权历史保护目标的必要公开接口补足。不改变普通 RPC/stream、Connection lifecycle、审批决策或执行权限；不修改 webserver/frontend 包。Gateway 的变更必须由单一 owner 与已有审批补丁合并。没有 patched Client/bootstrap 的原版 Desktop/其他 Host 不会自动受此保护；supported Client 连接旧 Host 应失败封闭，但单独装 DSMM 或仅 core throw 不能提供这一保证。所需 SDK 改动用项目 artifact 交付，不修改已安装包、真实用户数据或 Desktop。

**功能验收：**

- 原生 workspace 点击/启动恢复、child 侧栏成功走 prepare→retain→完整只读流，标题/messages/tools、分页及后续 durable/assistant frames 保持；不是所有点击被拒绝，也不是只取首帧。
- 支持 Client 连接原版或忽略未知字段的 Host、缺 guard、DSMM core 初始化失败：观测 native retain/open/Agent lookup/write spy，不能调用普通 follow、open(write) 或触发恢复；显示具体兼容错误，不清空既有历史。
- 首次连接、A→B 快速点击、等待时取消、generation 更换及旧 probe 晚回、地址 parent/mode 变化、手动 resync、相同 generation 的 carrier retry、guard 退役都不能复用陈旧 lease。重连到不兼容 Host 时，现存 scope 插件发起的 agent-bound 调用也不得先通过；安全 Host 重连后可正常重新打开。
- 用真实 native `using()`、gateway retainAgentScope 和绑定后即尝试 agent lookup 的合成插件验证 scope 门禁及正常审批 scope 不受破坏；无 lease 的 required retain 在 scope 创建前拒绝。没有 required 的原组合仍保持同步 retain/导航和原 follow 行为。
- incoming approval 先于 support probe 完成时仍保留原 delivery，准备成功后可人工答复；取消、断线和确实不兼容有真实原生结算，不静默消费成 next。暂停普通 RPC 的实际投递并替换 Host（Client generation 尚未变化）、暂停 stream 等待并换 socket，均必须在实际接收端 Agent lookup 前拒绝旧 envelope。prepare 成功后 opening 失败时，旧主视图/reference/草稿仍在，新 reference 已释放。
- 不新增 actor、审批/打开队列、monkeypatch 或独立 renderer；测试断言实际调用、存储效果、取消及可见操作结果，不锁源码字符串、文案或哈希。已通过且未受影响的 Host 五包、blank 与审批证据继续复用，仅补本接缝和受影响的原生 UI/重连集成。

### DSMM 显式 operator 确认与现行组成

1. 新增 DSMM 历史 continuation controller/RPC（与现有 live-root profile RPC 分离），仅经真实本地 Host operator 身份和现有可见资源授权读取 detached inspection。展示历史标题、cwd、当前可用 preset/profile、当前 sandbox/审批限制、待执行 inbox 和任何迁移后果；未确认不调用 native resolveAgent 或 write open。
2. 操作者显式选当前支持的 root preset 和已保存配置/部署默认，检查当前部署、profile revision、preset availability/composition、模型与权限服务，不依赖旧 preset 名可解析。创建仅本次 Host 内存 continuation intent：绑定 peer/connection generation、存储实例、session/header/逻辑事件前缀、项目、候选配置及 guard owner。历史审批、旧 epoch 和旧临时 grant 不纳入新 authority；不在磁盘写一个“已同意”标记供任意未来请求消费。
3. 通过新增 Host-only `activateSession` 使用当前 preset 的 `composeAgent`/公开 `agentPresets.mount()` 与现行模型 selection 安装，叠加 DSMM 的可信 setup。持锁复核 inspection 与用户确认的前缀和权限；不同则 stale，重新展示差异再确认。不能把普通缓存 revision 当跨进程锁，也不引入自行发明的内容哈希凭证。
4. 在 native 未发布 setup 中安装新的 DSMM immutable admission、角色/路由与当前权限，必要的现行 policy/preset 事件在用户同意的写恢复事务内追加，不改历史记录。`native-admission.ts` 的 created 只接受 exact 已准备 candidate，不再以一刀切 cold-refusal 替代 pre-write gate；不向任意冷 Agent 自动授予当前默认权限。原生宽 sandbox/ask 历史值需现行权限流程确认；read-only、native deny、child never 等既有上限不被配置选择解除。
5. “继续”确认必须明确是否处理历史待执行 inbox；原生恢复可消费待执行输入，用户没有同意该集合就不启动恢复。不得在浏览中 claim/清除，也不得为了恢复成功静默丢弃、重复发送或自动重放失败任务。新 prompt 与继续动作串行：只有 activation 完成才发送一次；旧 inbox 与新 prompt 的顺序沿用 native 语义并在确认界面说明。
6. 两个并发继续请求只有 exact 同一已授权 activation 可共享结果；不能让未授权的普通请求搭上 authorized promise。后台 lookup/文件操作不能借同 sessionId 窃取 intent。使用原生 claim/resume 所有者加 DSMM exact operation 关联；失败清理 intent，重复确认不得二次执行。连接/候选配置/preset/父所有权变更、取消或 guard 撤销在 publication 前阻止执行；Host 重启后 intent 不恢复。发布成功但响应丢失，查询实际 live 状态，不再次 resume/发送。
7. 保证“未批准时无 writer/无修复”。批准后的正常恢复可能追加合法 closers 或进行已确认迁移；之后 setup 失败必须如实报告这些已提交的存储效果，保留原件和历史，不假称整个 resume 可事务回滚。授权撤销发生在原生写操作已开始后不能承诺撤回已提交字节，但必须阻止后续 publication/执行；真实会话的这类写操作仍不在本任务授权内。

### Root、child 与旧 vocabulary

- root 历史使用原生 session address；child 使用原生 parentSessionId/childSessionId/mode address，保持 `validateAddress()` 的 lineage/descriptor 检查与 inheritedEventCount 边界。读 child 不需要恢复 parent 或 child；缺 live ownership 只限制继续执行，不凭 parentSession 字符串建立权限。
- child 的原生冷恢复同样必须经过 loop guard；root intent 不覆盖 child。只能由有现行 exact parent ownership 的原生子代理 owner 按已有控制契约请求独立 continuation authority，不直接把 child 送进普通 root activateSession。历史格式转换若不能保全 child descriptor，展示可诊断的历史兼容状态，不能把 child 当 root 绕过验证；新增 child 授权 UI/never 语义仍以第四节为准。
- JSONL 当前已实现 read-only historical preparation：`requireStoredLog/prepareStoredMigration` 可用现有 format catalog 生成当前逻辑 inspection，read 路径不发布替换；只有 write 分支调用 `publishStoredMigration`。复用已支持的转换及原件保护，不另写宽松 JSONL loader。迁移-required 的读取成功不代表获得执行或迁移许可。
- DSMM `0.2.x` 与存储格式版本不是同一版本号。合成用例需覆盖其实际旧消息/工具/标题/child descriptor 与已支持 format 转换，而非只给当前事件换个旧 preset 名。未知 ignorable 数据保持可读详情；未知必需 vocabulary、损坏结构或缺转换器返回具体错误/可读前缀，不把它标成权限问题，不删列表项或静默丢消息。该接口补丁不自动补齐未知格式支持；若正式样本揭示缺少 converter，单独报告格式范围和必要的公开适配，保持 `0.2.x` 可加载目标未完成，不能宣称 blanket 支持。

### 项目 artifact、部署与验收

- 用现有 pnpm 支持的 `patch`/`patch-commit --patches-dir` 从任务专属包副本交付五包 Host patch（包含 session-controller 的 Client/Remote 补足）及两个原生 UI 包的前置 await patch；必要 `patchedDependencies` 和 lockfile 元数据由父协调者合并。存放于 `dsmm/patches/dsh-session-activation/`；不得手改已安装包或共享 package store。`patch-commit` 是 pnpm 生成补丁的操作，不是 Git commit，不扩大 Git 授权。
- 修改真正被 package exports 使用的 `lib/index.js`、`lib/client.js`、相关 Typert descriptors/codecs 和公开 `.d.ts`；若副本包含 `lib/types/*.js` 镜像，也同步其同一逻辑。只修改镜像源码而未更新运行 bundle 不算交付。不要求取得/安装新版 SDK 或原始构建链；隔离副本重建只能用已存在工具。受支持 patch 元数据的必需 integrity 由 pnpm 管理，不添加自制验收哈希。
- DSMM 支持组合同时设置 `activateOnFollow:false`、required activation admission 并在配置式恢复之前注册门禁；ready 检查证明 runtime 确有上述能力及可用 backend。原版 Host 不可伪报兼容：显示需要兼容 Host，禁止会触发写恢复的历史打开路径，不用只读仿真页面宣称已达成 native 浏览闭环。包发布/安装说明必须明确仅安装 DSMM 插件不能修改 Desktop 内嵌 Host；真正 Desktop 部署另行授权。
- 针对补丁的隔离测试验证：默认 true 保持原版 promotion；false 的第二次及后续 next 不 open(write)/不 append/不 claim inbox、不发 removed，且 durable/assistant frames、分页、取消仍真实传递。title/messages/tools 和 root/child 往返导航保持可读。
- guard 测试覆盖所有上述 native cold resume 入口，包括 configured restore 和 direct child；无 intent、伪造 intent、guard 缺失/退出、陈旧 peer/配置、竞争 writer、未知 preset、原生拒绝、迁移前取消都不获得执行权限。持锁前后插入并发改动，证明 stale 在 migration/closers 前被拒绝；fresh create 与非 DSMM 默认部署的兼容性单独检查。
- 成功继续用真实 native driver 证明当前 preset/config/权限先建立，然后才 claim 明确同意的 inbox/发送首条新 prompt；失效、回包丢失及 publication 失败不重复执行或清空历史。既有正式隔离研究用于定位，不重复全版本调查；本次功能需验证补丁后真实效果。
- 定点覆盖带旧 inbox 的恢复在 publication 后段失败及最终 disposer 完成，持久队列仍保留；在 serial 创建通知暂停期间，普通 prompt/updateQueue/lookup 不能通过 live 或 raced-live 快路径写入输入。只有授权 activation 完整提交后才开放正常访问。
- `dsmm/test/history-host-integration.test.mjs` 的 `retiring the selected preset while created is paused invalidates continuation before driver release` 必须证明退役在 driver release 前拒绝继续。lease 定点测试覆盖 unregister 删除 definition 后尚未 retired、同名重新注册、dispose 后校验及正常释放不取消成功 Agent；断言真实拒绝/执行行为，不锁补丁文本。

**完成条件：** 项目补丁、公开类型、DSMM Host 组合及上述隔离运行证据一起交付。当前原版 Desktop 没有应用补丁仍属于未部署状态；不得以文档、配置保存或单一首帧读取证明真实产品已修复。

## 二、首条消息前的配置选择

### 统一空白判定与互斥

新增 DSMM 内部 blank capability 判定，由 Host 作为唯一权威。满足：exact live ordinary root、没有已开始 turn、没有模型/工具执行、没有 active/pending child invocation 或被拥有的 child、没有待消费的已提交输入，且 owner、preset composition、原生服务都有效。预设配置事件不等于会话已经开始；历史 seeded 会话即使当前 idle，也不能作为空白会话。

`selectSession()` 在 `runMaintenance()` 内执行选择；进入时校验 blank、session/profile/selection revision 和操作者权限，每次异步返回后再校验身份，最终提交前检查未有与候选冲突的状态变化。晚到输入由 native maintenance 排队，不另造 prompt 队列。先开始 turn 则选择返回 busy/started；选择先抢占且提交成功，之后首条 prompt 使用新配置。并发双选只有满足 CAS 的请求提交；失败不伪称已应用，不自动重发用户输入。

### 配置提交与运行时一致性

- 保持执行开始后的 admission 不可变。仅空白维护事务允许更换整个 immutable admission；`NativeAdmission` 与 `DsmmProfileRuntime` 对同一 Agent 共享提交后的对象/epoch，不存在两个版本分别支配工具与模型。
- 重用 `ProfileStore.selectSession()` 的持久化事务。候选配置解析、验证、路由/角色可用性检查在写盘前完成；所有可能失败的安装准备在 commit 前完成。`committed` 只做已准备好的同步状态切换，不放异步安装或可能失败的 I/O。
- `index.ts` 中的安装闭包、skills/prompt、routing、guards、role tools 目前捕获 candidate；实现者必须统一到同一 Agent 的当前配置读取点或可安全替换的 DSMM 注册生命周期，使 blank 提交真正改变首轮提示、路由及后续 delegation。不能只修改 profile-store 指针。启动时没有挂载的能力仍不得被 profile 开启。
- 若安装结构需要替换，只有 DSMM 自己的注册可撤销/重装，且必须在 maintenance 期间准备成功再发布；不能 dispose 原生 Agent、换 session id 或删日志来模拟选择。不能证明原子切换的具体模块应在 preflight 拒绝，并报告阻塞，而非留下半应用状态。
- 持久提交前失败：旧配置和用户草稿不变。已提交但回包、观察或连接失败：表示“结果待确认”，重新读取状态，不自动回滚或盲重试。进程在写盘后退出，下一次建立的现行 admission 重新读取已提交选择并验证，不信任旧 epoch 恢复权限。

### 页面和默认语义

- sessionless 新会话页可先保存本页待选意向，显式创建/取得 blank 后，完成 session 选择才启用发送；若页面本来已创建 blank，直接应用该 blank。沿用 native `sessions.create()`、retain 和正常 composer 输入存储，不伪造 profile 参数、不以 remount 清草稿。
- 选择器提供已保存 profile 和“使用默认配置”（当前部署基础，不附加 named profile，对应现有 id:null）。进入新会话时初始选中未来默认所指定的配置；之后该会话的明确选择固定下来。用当前选项和单独的“新会话默认配置”状态说明二者，名称与底层语义不得混用。
- 保存 profile 草稿、选择本次会话、设置未来默认是分离动作。修改未来默认只影响之后的会话；切换本次选择不写 `.selection.json`，不修改 named profile 原文。
- profile 默认影响会话策略和子代理配置；保留现有“使用配置中的模型”独立动作及用户已选模型优先语义。若用户同时选择应用配置模型，发送按钮需等模型选择结果，不能用两个无序 RPC 声称原子应用；模型失败展示已应用配置与未应用模型的真实状态，不自动修改模型的未来默认语义。
- DTO 可沿用 `canApplyOverlay` 的 wire 兼容字段表达 blank 可选，或新增独立 blank capability；客户端正常文案不出现 overlay。已开始会话仍不可换 profile，普通 model/mode 能力独立。

**完成证据：** sessionless 与已建 blank 均能选 A/B/默认、保留文本/附件并发送；实际首个 request header、prompt、role routing 及第一次 child 配置对应已接受选择。双 tab、延迟验证、首条 prompt 抢占、preset 切换、owner 退出、CAS 冲突均不混用配置；已有 turn 即使 idle 仍拒绝 profile 切换。更新现有把所有 blank 都断言为不可用的测试，不保留该中间行为契约。

## 三、单一原生审批上的临时授权

### 原生路径与补丁范围

人工和临时许可自动答复均通过原生 `PendingApproval` → Client Remote waterfall → Gateway delivery 结算 → Host waterfall → `ApprovalService.request()` final audit。Host 仅签发/验证临时 permit，不能提前返回 allowed-once。前置拒绝与 `await next()` 之后的 veto 继续生效；native terminal consumer 后的普通 listener 对人工/自动都不执行，不把这种原有行为视作新增旁路，也不改成新的通用 veto 体系。

现有 `PendingApproval` 类型允许读取 key/sessionId/toolName/callId/answerable 并 answer；局部 first-wins 在 `finish()` 同步完成。但 key 不是 Host request id，多个请求可同时具有相同 session/tool/callId；Client answer Promise、RPCissued 和本地 automatic 标记都不能证明 Host winner。补丁保持 `ApprovalOutcome` 字符串枚举、现有 request 调用及 native UI 兼容，只增加 opt-in 关联、答复 sideband 与最终回执。以下名称为拟新增公开接口，须同步实际 runtime bundle 和类型，不声称原版已有。

| 补丁包与准确接缝 | 最小变更 |
| --- | --- |
| `@deepseek-ai/dsh-user-approval`：`ApprovalService.request/decide`；`lib/types/index.d.ts`、`types.d.ts` | 将 request() 已生成、用于 approval/asked 的 opaque `ApprovalRequestId` 通过只读关联面交给本次 dispatch；调用者不能指定或覆盖它。保留原 request 身份/借用合同，必要时通过服务的只读关联 accessor 暴露。新增 bounded live settlement 查询/通知，在外层 decide、取消裁决及 approval/decided append **提交后**发布 final receipt；不改旧 audit event schema，不从历史重放 receipt。 |
| `@deepseek-ai/dsh-api-gateway`：Host `startRemoteEvent/deliverRemoteEvent/receiveRemoteEventResult/settleRemoteEvent`；Client `remote-events.ts:dispatchWaterfall/answer`；`types.d.ts`、`stream-protocol.d.ts` 及解析器 | 复用已有 eventId/clientId 与 pending deliveries，在实际 delivery 生成 opaque delivery identity，绑定真实 peer/stream generation；给同一 Client request 公开只读关联及一次性答复 sideband 提交面。扩展 `RemoteEventResult` 的可选 sideband，保持 outcome.value 为原字符串。Host 校验 delivery 与 auto permit，原生 first accepted result 的结算点产生可信 winner evidence，迟到/重复/旧连接答案保持无效。 |
| `@deepseek-ai/dsh-api-remotes`：`forwardWaterfall()`、`TypertRemoteEventInvocation` 对接 | 对 approval/request 显式接入上述 delivery/answer 校验和 winner 回传，维护 ApprovalRequestId ↔ 实际 invocation/exec 的映射。`resolve` 仍向原 waterfall 返回同一 outcome；可信 winner 通过独立 Host 内部关联回送 ApprovalService。非审批事件、next、异常路径保持原语义，不增加第二 pending 队列。 |
| `@deepseek-ai/dsh-client-ui-approval`：`answerApproval()`、`PendingApproval` constructor/answer/finish、`client/contract/slots.d.ts`、`lib/client.js` | 把 requestId/delivery identity 传到原生 PendingApproval；扩展 answer 的可选 permit 选项或等价方法，旧 `answer(outcome)` 保留。原生 finish 的同一个 first-wins 临界区同时固定 outcome 与 answer provenance，再由原 Remote dispatcher 发出；不得先写 automatic 标记再与人工按钮竞争。公开类型仍不等于包根有可导入的 class runtime。 |

Gateway 的新增 sideband 是原 event result 的附加协议，不是另一个答复 RPC。实现宜通过公开 Client helper 关联 exact dispatched request，将 sideband 与 finish 一次提交；不要修改 `TypertClientEventListener` 的 outcome 类型。若实际类型接缝必须改 `dsh-typert-protocol`，先报告必要的窄类型扩展，不能顺带改通用事件机制。只对协商支持的新 Host/Client 启用 sideband，旧 peer 仍走人工仅本次；旧解析器对 unknown fields 的拒绝不能被“字段可选”忽略。

### 授权身份与最终回执

共享 Host scoped grant store 保存已批准复用范围，不保存/调度审批问题，不写 Global/native-profile 的 nativeCommands。真实 exec 绑定包括 execution token、exact Agent/root/session、项目、冻结 args、工具注册/body、权限范围与 owner generation。后续使用同时匹配命令或工具的具体目标；reason、历史 approval、Client id 字符串或序列化角色名均不是 authority。

- **Request identity**：服务创建，一次 request 一值；即使 session/tool/callId 完全相同也不同。映射从真实 execution/受控 request 调用取得，不按三字段搜索最近请求。无法建立唯一 exec 绑定时保留人工仅本次。
- **Delivery identity**：Gateway 创建，绑定本次 request/event、实际答复 Client 和连接 generation。跨 tab/重连不是同一 delivery，Client 不能把任意字符串注册成有效 delivery。
- **Auto permit**：Host 验证 grant 后签发的一次性不透明引用，限定 request、delivery、exec、grant revision、权限和期限；不是 outcome，不消费 grant，也不说明自动答复赢了。RPC 仅向当前真实 operator delivery 签发，模型、其他 session/child 或旁观 peer 无权请求。
- **Winner evidence**：Gateway 在实际接受 result 的同一结算点记录 winning delivery、answer identity、经校验的 source（native operator answer 或 temporary permit）及候选 outcome。UI 布尔值不是证据；auto source 必须验证 Host permit。native operator source 表示经认证操作者的原生答复路径，不承诺浏览器硬件级“真人点击证明”。无 provenance 的旧答复标为 legacy/unknown，不能创建或消费 scoped grant。
- **Final receipt**：ApprovalService 在真正 final audit 提交后绑定 requestId、winning delivery/answer、已校验 permit（若有）、候选与 final outcome、audit seq 和 Host generation。外层 veto/cancel/throw/never 导致最终非 allowed-once，则无有效许可；非 Remote 分支产生的允许不得嫁接成之前的 manual/auto winner。其他 answerer 的来源无法确认时标 unknown，不猜测。receipt 不会因为本地 answer Promise resolved 就提前出现。

**来源连续性：** Client 的 approval 专用 dispatch 与 Host `ApprovalService.decide()` 分别跟踪每层 listener 的返回。使用 Cordis 公开 `ctx.events.dispatch("waterfall", args)` 获取同一过滤、顺序和 this 绑定的 listener 集合，仅在审批调用点包装 continuation；不修改通用 waterfall 或其它事件。来源仅由原生 PendingApproval/Remote terminal producer，以及身份与透传行为可证明的审批专用适配器传递；未知 listener 一律使来源变为 unknown。不能仅凭 next 次数、完成顺序和字符串相等证明任意 listener 的返回来源。逐层记录仍用于检测 outcome 改写、异常恢复、重复 next 或下游尚未完成等来源中断；来源一旦丢失，外层再返回相同字符串也不能恢复。真正 producer 通过本次 dispatch 的内部关联登记来源，不能由任意 listener 自报。

两个 dispatch 边界都必须验证连续性；仅比较 Gateway candidate 与最终 outcome 的字符串不足够。保留原生 outcome 和现有 veto/异常行为，无法证明时 receipt.source 为 unknown，不创建或消费 scoped grant。Gateway 已接受 auto winner 而之后来源丢失时，受控执行入口拒绝执行，不能降为人工仅本次；签发过 permit 或某 Client 的 auto 答复输掉竞争，不改变真正 manual winner 的同次批准合同。补丁以真实多层 listener 覆盖 allowed→rejected→allowed、异常恢复、重复 next、未等待 next 与跨 tab 竞争，并验证原生 outcome/order 无变化。

Receipt 用现行 Host 内存及原生审计提交序号证明，允许认证 Client 查询/订阅；只保留覆盖 pending 与该次执行结算所需的有界生命周期。重启、冷恢复不重建许可；审计持久化日志不变，append commit 不伪称 fsync。通知丢失通过查询恢复状态，通知观察者异常不把成功 native 审批变成失败。审计 append 未提交则不创建/消费 grant，不交付可执行 receipt。

### 用户闭环与结算次序

1. 原生 pending 展示精确请求。DSMM 详情/权限入口提供“仅本次/本次会话/15 分钟/1 小时”，默认仅本次；retention intent 必须绑定 request 与当前 delivery，保留原生按钮和取消，不靠 detail slot 的 callId 获取权限。
2. 用户人工批准后，只有 final receipt 证明 **该 delivery 的 native operator answer 获胜且 final allowed-once**，才将其 retention intent 变成 grant。其他 tab 的意向、输掉的人工答案、auto winner 都不能创建/续期 grant。同次人工批准仍按现有合同执行。
3. 后续 exact exec 对应的原生 pending 出现后，Client 才向 Host 请求 auto permit；Host 检查实际 grant/owner/参数/期限而非只读 UI 状态。Client 在同一个 PendingApproval 上提交 allowed-once + permit，沿用与按钮相同的 Remote/native answer path，不新建 pending、不提前 Host allow。
4. Gateway 在接受自动 result 前同步验证 permit 的 request/delivery/peer/exec 与活性，然后沿原结算路径传回。无效 permit 不能降格为人工允许；使本次自动答复失败封闭并可见，用户可显式发起新的调用/原生审批，不能后台重放。其他 tab 的原生答案继续按原生竞争与取消语义处理。
5. final receipt 为 auto winner 且 final allowed-once 后，才把 permit 从 pending reservation 变为该次可消费授权；在实际 body/最终 provider 交接前重新检查活性和一次消费。manual winner 不按输掉的 auto permit 执行 TTL 检查；auto winner 不得因同 outcome 的人工输家而被标为人工，不能用最终 outcome 字符串推断来源。
6. 会话 grant 仅限该 live session；TTL 不滑动续期，Host 单调时钟为准。清理 pending reservation 不撤销用户原 grant；一次自动执行成功也不延长 grant。进程重启、owner/Agent 更换后不恢复；导航离开不是退出会话。

### 撤销、失败与验证

- 撤销先同步关闭后续 permit/消费，再返回 authoritative 列表；重复撤销幂等，旧 revision 不复活许可。人工审批的 existing same-call 合同保留，普通配置 revision 改动不取消人工 pending 或以旧 epoch 否定其已批准 scope；相关安全变更可使后续自动复用失效。
- `tools.guard()` 后还有异步 `tools/execute`，不能代替 body 检查。自动授权需在 Host result 接受、final receipt 后和具体 provider 交接前按所处阶段验证；异步 confine/resolve/文件/Web 预处理之后再检查。到期或撤销阻止尚未交接的自动执行，不自动重试工具/父任务。
- 交接完成后的动作可能已发生；撤销不回滚效果，不宣称与 OS target release 原子。需要停止当前工作使用原生取消并报告后端真实能力。原生 never/deny、caller cancel、外层 await-next veto、sandbox 和 OS 拒绝必须保留。
- 最终审查用真实 Host/Client 测试：相同 session/tool/callId 的并发请求、同 outcome 跨 tab 人工/auto 两种获胜顺序、局部 first-wins、旧 delivery/伪 permit、审核前断线、after-next veto、never、cancel、audit append 失败、receipt 查询恢复及交接前 TTL/撤销。断言实际执行次数和 final receipt 来源，而非 Client 状态/成功日志。已有正常 native answer 路径研究可复用，补丁新增的 winner/audit 绑定必须实测。

## 四、显式子代理授权

默认 root grant 不传给 child，也不传给后代。保持 native delegation 的 never 默认；不调用 answerer 绕过它。

### Fresh 创建来源接缝

在 `@deepseek-ai/dsh-subagent` 增加 `SubagentRuntime.creationApprovalOf(child)`，返回可信 live `LiveChildApprovalOrigin` 或无证明；该能力提供同步 `assertCurrent(parent, child)`。能力只存在于 SDK 内存并绑定实际对象，不接受 Client、session metadata 或日志提供的来源：

- manager `startLocal()` 在首次 await 之前，与 `captureDelegatedPolicyOverrides(parent)` 同阶段捕获 exact parent owner/realm、ApprovalService instance、override、configured policy 和 effective policy。configured/effective never 或 unknown 不能因后来变成 ask 获得资格。
- fresh unpublished setup 在 SDK `appendDelegatedPolicyOverrides` 周围捕获追加前限制及实际追加 record identity；composition 完成后捕获 child service/config。setup 只准备来源候选，`submitMaterialized()` 的初始输入接受和 catalog commit 成功后，才为实际 owned continuable child 发布 capability；失败、dispose、owner replacement 使其无效，cold/history 不重建。
- 校验当前 exact parent/child ownership、realm/service/config/policy 及 delegation record identity；同值记录替换也不是原来源。不能凭 `source: delegation` 或当前值为 never 推断默认来源，更不能忽略 composition 中明确禁止。

同步 runtime、公开类型并交付权限 worker 独立 patch。接缝只证明来源，不更改默认 policy、创建审批路由或提供授权。显式转换前同步校验来源与 live ownership；成功 setPolicy 后的授权绑定该次 operator 转换及新 policy record，不把变更后的记录当原 delegation proof 自动重新继承。

### 用户流程与边界

产品入口放在现有 direct-child 卡片的“权限”操作，显示准确 child、任务、项目与当前角色上限。仅真实操作者可操作当前 root 拥有的 live、continuable、可维护的 direct child；descendant 历史继续只读，不能以浏览权限取得修改权。

可实现路径分为两个明确动作：

1. **允许此子任务向我请求批准**：真实 operator 对仍存活的 exact direct child 显式操作，校验上述来源能力、当前 ownership、角色上限及已证明可回答的 child route。该动作只切换原生后续请求的审批策略，不重绑配置或启动任务。运行中的 child 在全部异步准备结束后同步复核身份、来源和仍在运行的状态，随后无 await 调用原生 `ApprovalService.setPolicy(child, "ask")`；idle child 必须当次同步取得 `runMaintenance()` 才可修改，取得失败立即报告已结束/不可操作，不等待回收后再恢复。只有不存在显式禁止/unknown 来源/角色 deny 时才允许。UI 必须说明作用于该子任务的后续审批，默认关闭，不影响 sibling 或未来 child；缺 capability 或可见 route 时不先改成 ask 再寻找答复入口。
2. **批准具体权限**：child 发生真实调用时，由父界面的子任务入口打开其原生 pending approval；使用第三节 request/delivery/permit/final receipt 流程，身份仍为 child，不替换成 root request。用户显式选择 child 的“仅本次/本次子任务/15 分钟/1 小时”。不能复制 root grant 中未经该 child 调用验证的命令或 sandbox 能力；parent operator 的可见性也不能扩大到 sibling/后代。

该动作不暂停、复活或延长原生 activation，也不通过伪造输入阻止自然回收。仅允许原生 `setPolicy` 自带的策略变更通知，不追加用于保活的消息；不能自动重放已失败/被拒绝任务。用户撤销 child 的交互权限时先阻断新授权及新自动复用，再以相同 live 检查通过原生接口收紧回 never。`setPolicy(..., "never")` 不会取消已经进入 answerer 的请求，未决请求按真实 signal/取消能力结算，不覆写已完成人工审批。来源或 owner 已失效时仍可撤销 DSMM grant，但不能向退役 Agent 写策略；历史中残留 ask 不构成冷恢复的交互权限。

实施必须在隔离 Host/Client 证明原生 Remote Event 和 pending-interaction 可把 exact child 审批交给可见的操作者，而不是无人可回答的 child 队列。该 route 尚未证实；新增授权只有 subagent 来源 hook。若实际需要另一个 SDK route hook，**子代理完整流程阻塞**，向父协调者报告确切接缝并等待扩围授权，不静默改为 root request 或启用所有 child。非 continuable/无 live ownership 的 child 不展示假授权按钮。

验收覆盖实际 fresh 默认 delegation、创建前 parent configured/effective never、unknown、准备期间 owner/service/config 替换、同值 delegation record 替换、失败/dispose 以及 cold/history 不获 live proof。成功路径须在实际运行的 child 中显式切换后，由后续真实调用走 Pending → Gateway winner → final audit → provider 交接；idle/自然回收竞争必须立即拒绝或在已取得的 maintenance 中完成，不能挂起或授权退役对象。撤销阻止后续 grant/复用而不假称取消已 pending 请求。保留第三节单队列及根审批合同；readonly child 对 argv 同样拒绝，不以新工具名绕过 shell/write 上限。

## 五、文件、网站与 shell 的能力分层

### 显式结构化 argv 工具

新增独立 DSMM 工具（建议 `dsmm_exec_argv`），输入为绝对 executable、完整有序 args、绝对 cwd；普通模型输入不提供自由 env、shell 字符串或 sandbox 提升参数。保留 native bash/pwsh 的名称、行为及仅本次审批；不静默改写调用，也不把该工具加入只读角色白名单。

已安装公开接缝是 `@deepseek-ai/dsh-subprocess` 的 `SubprocessRuntime.resolveExecutable()/spawn(SubprocessSpawnSpec)` 和 `@deepseek-ai/dsh-sandbox` 的 `SandboxProvider.confine(argv, policy, signal)`。`SubprocessSpawnSpec.argv[0]` 是程序，argv 不由该 seam 作为 shell 字符串解释，spawn 同步返回 handle；env 是 overrides/tombstones，不是 replacement。`dsh-subprocess-local.spawn()` 同步计算 `targetEnvironment()`，实际 runtime 还保留 provider 自己的进程管理/取消语义。实现用现有服务，不安装 runner、不另写裸 child_process 路径。

执行顺序与授权范围：

1. 捕获 exact exec、native tool 注册、session/project/cwd、subprocess/sandbox provider instance 与 owner generation、当前 native sandbox policy。校验当前角色是否允许执行程序，承接适用的明确命令/路径/工具 deny；未知规则语义不能默认放行。通过原生 pre-execute/ApprovalService 建立第三节 request 绑定，禁止绕开审批工具链。
2. 验证绝对 executable（可用 resolveExecutable 验证绝对路径），形成完整 `[executable, ...args]`；批准的是该路径、argv、cwd、有效环境及 provider/session scope，而不是 PATH token。子命令只是 argv 的精确成员，没有任意参数通配。仅支持已验证的本机 provider/同执行世界，其他 provider 缺环境或执行事实则不启用复用。
3. 初始不支持脚本解释器、shell wrapper 或脚本文件请求的复用；这类工作保留现有 native 工具仅本次流程。不得把绝对路径认证解释为二进制 inode 永不改变、Git 天然只读、hook/pager 无害或程序不会启动后代。授权摘要明确允许程序按给定参数在当前 sandbox 下运行，行为内容仍可能随文件/config 改变。
4. native mode 为 read-only/workspace-write 时，调用 `confine()` 并只执行其返回 argv，检查 enforcement 与 provider/政策身份；缺 backend 或 runner 拒绝 fail closed，不退回 unconfined。已有 standing danger-full-access 按原生语义处理，但临时 grant 不设置/升级 mode。有效政策改变使先前可复用 grant 失效或重新询问，不用旧 grant 覆盖新 deny。
5. `confine`/executable 校验及其他 async 工作完成后，执行最终同步检查：final receipt、auto permit/TTL/撤销、args/cwd/provider/环境/政策仍一致，随后无 await 地交给同一 `subprocess.spawn()`。完整 spec 显式给出 stdio、graceMs、signal；不开放任意 stdin 注入或持久 PTY，按现有工具输出上限收集结果、区分启动失败/sandbox拒绝/非零退出，生命周期结束由原生 handle 取消并排空。

**有效环境合同：** Host 生成允许的环境，不从历史/模型复制凭据；使用公开 `scrubbedParentEnv()` 的凭据及 DSH scrub 规则，叠加受控 overrides/tombstones，并按平台处理 key（Windows 不区分大小写）。grant 匹配最终有效环境，UI 不回显秘密值。在确认时、async 准备后及 spawn 交接前重新计算完整有效 key 集和值；新 ambient key、删除/变更、proxy/PATH/HOME 等导致有效环境变化则拒绝复用并重新询问，不能只传旧 snapshot 后让新 ambient key 被继承。需要移除的当前 ambient key 必须显式 tombstone；只传 snapshot 不是 env replacement。最终检查到已验证 local provider 同步捕获环境之间不得再有 await；若实际 provider 延迟或另行改变环境且无法证明该边界，关闭复用并报告缺口，不扩充未授权 subprocess patch。

TTL 保证止于受控 provider 交接前，不保证与异步原生 runner/OS 释放目标进程的时刻原子一致。`signal`/terminate 用于交接后的取消，必须如实报告进程范围限制。验收以合成程序的真实 argv/cwd/环境/调用次数、异步 confine 期间新增 ambient key、policy/provider 替换、TTL/撤销竞态和 sandbox拒绝为证据；不冻结本机环境快照、不安装新的系统隔离能力。

### Web Fetch 准备与最终交接

在 `@deepseek-ai/dsh-web` 增加 `prepareFetch(request)` 和 `fetchPrepared(prepared, { signal, beforeDispatch })`，同步公开类型和实际 runtime：

- `prepareFetch` 纯准备，不发 DNS/网络；按原生选择规则选 provider，克隆请求并创建 opaque、不可伪造且绑定 WebRuntime owner、exact provider registration 和 fetch function 的 capability，不把可序列化 provider id 当证明。
- `fetchPrepared` 复核 capability 所有者、未消费状态、当前选择/registration/function identity 和 signal。同步执行 `beforeDispatch`，异常或 async/thenable 返回均不调用 provider；最终校验后无 await 调用同一 captured provider。capability 一次性且防 reentry，失败后不能再次拿来 dispatch。回调不能借同步变更 owner/注册绕过最终校验。
- 原 `fetch(request, signal)` 保持原有 provider selection、`available()` 调用次数及错误行为；不能先 prepare 再用原 fetch 重新选择/探测两遍。prepared 的重新校验属于新接口明确边界，不改变旧 fetch 合同。

DSMM native Web Fetch 的真实 body adapter 使用 clone 请求的 exact origin scope、第三节已 settled 的 grant 和本次执行绑定；`beforeDispatch` 同步检查 TTL/撤销、owner/provider、实际请求并消费许可。未知或未证明安全交接的 provider 不开放 reuse，不能用 tools.guard 的成功替代 body fence。

此 hook 只约束 provider 交接。HTTP/Fake-IP provider 的 same-origin redirect、direct DNS、proxy、IPv6、deny 和精确 `198.18.0.0/16` 规则原样保留；proxy 路径没有 local DNS proof 必须如实说明。不覆盖 search、shell、MCP、model 或 OS network。验收以实际 provider 调用证明：prepare 零网络、请求克隆、伪造/跨 owner/已消费 capability、provider 替换、callback throw/async/reentry、TTL/撤销均不能违规 dispatch；正常交接恰一次，旧 fetch 选择次数与错误行为保持。已有 HTTP 安全证据按相关性复用。

### 文件/网站与进程隔离

文件和网站许可与 argv 工具共享第三节 grant store、原生 pending/final receipt 和生命周期，不另建审批队列；只有能证明真实调用/目标以及实际 provider 交接检查的 adapter 才开放复用。既有 `shellScope` 的 unresolved 身份只能保障同次完整性，`shell.resolve` 不提供 execution proof；`literalCommand()` 可用于显示/验证有限语法，不能让旧 bash/pwsh 获得后续程序身份保证。

| 用户需求 | 本版本安全实现方向 | 不能宣称的能力/完整范围阻塞 |
| --- | --- | --- |
| 会话文件模式 | 沿用原生 read-only/workspace-write/danger-full-access 的持久化和真实 UI。 | 不新增另一套 mode 或从临时 grant 修改 standing mode。 |
| 指定文件/目录读取 | 对已注册 native read/glob/grep 的真实参数，使用同一 filesystem 的 resolve/contains/target identity，提供 file/tree + read + 生命周期授权。新请求仍受明确 deny 约束。 | 仅工具调用边界；fs sandbox 目前允许广泛读取，不能承诺 shell 或最终 inode 读取隔离。 |
| 指定文件/目录写入 | 先验证 native write/edit 注册、参数及底层 fs 操作映射，在当前 sandbox 已允许的范围内，给具体 write/edit 工具提供临时批准/附加限制。write 与 read 分开，不默认捆绑。 | 当前 managed tool coverage 尚未覆盖 write/edit，需要真实适配与执行验证。read-only 下或 workspace 外的精准写入例外缺公开后端；不能提升 full access 实现。 |
| 网站访问 | 以 exact URL origin（scheme、规范 hostname、端口）为最小网站授权；默认不含子域、其他端口或 scheme。仅对拥有真实 request URL 的 Web Fetch 工具/支持 provider 提供临时批准。 | 不覆盖 shell sockets、模型 provider、MCP、认证流；web search 返回的网站不是搜索请求实际连接目标，不能据此批准网络。 |
| 重定向/DNS | 原生 HTTP 检查每次实际目的地，遵守已存在 Fake-IP/proxy/IPv6/deny 规则；授权网站之外的 hop 不自动继承。 | 只有公开 resolver 而不能验证后续 proxy redirect 时，必须在可控 provider 限制跳转或返回 unsupported，不能声称网站隔离。 |
| 精确命令/子命令复用 | 新结构化 argv 工具在公开 subprocess + sandbox seam 上执行，匹配绝对程序路径、完整 argv/cwd/有效 env/provider/session，并使用最终原生审批回执。 | 不等于二进制内容固定、只读 Git 证明或任意 shell 字符串可复用；脚本解释器/wrapper 初始不复用。 |
| shell/子进程文件与网络权限 | 保持原生 sandbox 与命令级精确审批，并如实显示当前执行后端能力。 | 精准 read roots、额外 write roots、全进程域名/地址限制、后代进程网络、绕代理直连等缺执行契约及后端。配置字符串或工具 regex 无法补齐。 |

路径授权必须防止文本前缀误匹配、`..`、不同盘符/大小写规则误判、symlink/junction 跳转、文件/目录互换和执行前路径漂移。每次执行重新解析，并保留原生底层检查；不能证明 co-location 或稳定目标时拒绝该临时权限。tree grant 对新文件的语义是父目录中的受限操作，不是给旧文件路径永恒授权。Windows hardlink/final-inode 缺口必须在能力说明中明确，不能用预检查声称已经堵住 TOCTOU。

全进程隔离的完整交付需要额外执行后端：能接收不可扩张的文件 read/write roots 和网络目标规则，在实际文件打开/socket/connect 与后代进程上执行，具有取消、撤销、重定向/DNS/代理、平台能力和失败封闭契约。当前 SDK 的 `SandboxExecutionPolicy` 不能携带这些规则。**这是已确认的完整范围阻塞**；父协调者需决定是否授权新增/扩展 backend 及必要 SDK 协议工作，或者明确接受工具级交付范围。没有该决定不得宣称整个需求完成，也不得删除该要求。审批关联补丁和 argv 工具不提供新系统权限；Windows 精细文件/网络 backend 未获授权，不得代做，也不授权安装依赖、关闭 sandbox、改系统代理或手改已安装 SDK。

## 六、设置与状态呈现

- 以 `DeploymentPage.tsx`、`DeploymentFields.tsx`、`ProfilesSection.tsx`、`SessionProfiles.tsx`、`PermissionsPanel.tsx` 和现有 locale 文件为主，沿用 native primitives、间距、焦点与菜单风格，不做无关视觉重构。
- 一个抽屉只有一个主要配置 section 时，首次打开即展开该 section 的控件；不是把所有抽屉打开，也不是把高级诊断全部展开。多 section 保留可扫描结构。用户收起后，同一抽屉/会话内的 re-render、保存、语言切换不能强行再次展开。
- 删除标题重复、实现细节、泛泛说明及“不是 X 而是 Y”对比。保留范围、何时生效、不可逆/权限后果、未保存草稿提示及失败后的恢复动作。admission、overlay、mounted state、CAS、schema 等仅出现在可选技术详情中。
- 权限页默认显示本次会话的有效权限和临时授权列表；持久部署规则仍在现有部署范围内独立保存，不把临时授权偷偷写入规则配置。工具范围和 backend 不支持的关键限制必须在授权动作附近可见，不藏进诊断。
- 保存失败保留草稿；失去连接显示结果未知并提供刷新，不把 native 请求完成等同于许可已存或命令成功。旧 profile 缺失、历史只读、busy、无法批准、到期、已撤销均有简洁动作指引。
- 键盘可达、label/description 关联、展开状态、焦点回归和双语支持保持；测试关注控件可见与操作结果，不锁整段描述文案。

## 七、错误语义与跨模块契约

新增 DSMM DTO/RPC 需要同步 Host codec、remote facade、client controller 和行为测试；下列为产品错误语义，不要求虚构同名 native API。

| 语义 | 用户可见结果 | 安全结果 |
| --- | --- | --- |
| history-readable / execution-unavailable | 保留历史，继续按钮说明原因 | 无执行 authority |
| busy / already-started | 保留当前选择与草稿，等待或另建会话 | 不热切换 |
| conflict / stale | 刷新后重选，不能静默覆盖 | 旧 RPC 不写入/不授权 |
| denied / native-never / role-read-only | 说明被现行权限禁止 | 不旁路、不改 sandbox |
| unsupported-backend / uncorrelated-call | 不提供可复用/精细授权；允许正常仅本次流程时明确区分 | 不生成假 grant |
| cancelled / disposed / expired / revoked | 旧请求不可再次提交 | 清理意向与后续复用资格 |
| committed-but-unobserved | “结果待确认”，重新读取实际状态 | 不重试造成双提交，不回滚已成功提交 |
| approved-but-tool-failed | 授权状态与执行失败分开显示 | 不重复执行命令 |

调用许可源必须可区分人工同次决定与临时复用；后台任务、队列输入、native 注册和真正 live owner 的状态属于 Host，不能由 Client 的 selectedId、title、reason 或角色名称代替。

## 八、实施波次与并行所有权

顺序由真实依赖决定；执行者可以做等价的局部调整，但不能改变权限、数据保证、用户目标或掩盖后端缺口。

### 波次 A：证明历史与权限接缝，建立共享契约

目标：隔离复现历史导航链，确认 blank maintenance 首次输入的互斥边界、native approval 最终确认点及 child 审批路由；冻结的是职责和 DTO 语义，不是文件哈希。

- 历史负责人：仅第一节第五包 preset lease patch、`history-candidates.ts` 接入及退役 regression；不改已有 loop 时序或审批补丁。artifact 留在历史目录，元数据交父协调者。
- blank 负责人：`profile-runtime.ts`、`profile-store.ts`、`profile-types.ts`、`profile-rpc.ts`、`profile-remote.ts`、`index.ts` 的配置读取/安装路径。与历史负责人共享 `native-admission.ts`，此文件由一人整合，不能平行互相覆盖。
- 权限负责人：Web/subagent 两包 patch、真实 body/来源 adapter 及 child UI；与现有 scoped grant store/RPC/Client native pending 集成，不重写第三节审批合同。Web/subagent artifact 使用独立于历史目录及 `dsmm/patches/dsh-approval-settlement/` 的任务目录；元数据交父协调者，不写根 package/workspace/lockfile。runtime/声明一起修补；child route 缺接口立即报告，不自行扩大 SDK 接口范围。
- backend 缺口由父协调者处理范围决定，不把“无 backend”转成隐藏 backlog。child 路由或旧格式若有额外阻塞在本波次上报；已确认可实现的独立工作不必因此全部停止，但整体交付保持未完成。

### 波次 B：历史/blank 核心与临时授权并行落地

目标：历史可浏览、blank 配置真的作用于首轮、root 精确命令授权可创建/复用/撤销。

- 历史与 blank 共享 admission 改动串行整合，其余 fixture、客户端状态和权限 core 可并行。
- 客户端负责人持有 `client/index.ts`、`client/controller.ts`、`SessionProfiles.tsx` 及会话状态桥；backend 负责人只修改其对应 Host/remote 契约，接口确定后接入。
- 临时授权与网站/文件适配共用一个 grant store 和 native request 绑定，不各建一套队列。持有 `permission-rpc.ts`/`permission-remote.ts` 的负责人统一集成 DTO。
- 结构化命令负责人持有新增 argv 工具与执行适配/测试；第三节 final receipt 契约是其自动复用的前置依赖。保留 native bash/pwsh，不修改其含义；角色工具暴露、注册及 readonly deny 的接入由权限/角色负责人单点整合。不得为工具可用而放宽只读角色。

### 波次 C：子代理、文件/网站与简化 UI

目标：root/child 权限不混用，工具级 file/site 许可可观察，设置动作可理解。

- 子代理负责人：`role-control-rpc.ts`/types/remote、`ChildrenPanel.tsx`/controller 与权限 owner 对接；不更改全局 delegated pin 或放开 descendant mutation。
- 文件/网络负责人：native read/write/web 注册与 provider 接缝，先证明实际可执行面再开放按钮；Fake-IP 已有策略保持不变。
- 设置负责人：`DeploymentPage.tsx`、`DeploymentFields.tsx`、`ProfilesSection.tsx`、locale；与客户端/权限负责人约定 locale 和共享 panel 的单一整合者。范围仅单 section 展开、必要交互及文案，不安装新 UI 工具。
- 必要文档同步在 `dsmm/docs/roadmap.md`、profiles/native-permissions/compatibility/settings-status 等对应 DSMM 文档中直接描述最终行为，删除与已交付功能冲突的“全部不可用”说法；尚未实现的后端保持明确限制，不写协调日志。

### 波次 D：集成验证与交付判断

父协调者统一合并根 package/patch 元数据并运行受影响的构建/类型检查与集成测试；两个 worker 仅运行对应轻量检查。未改变的八包基础组合、blank 审查与 Client slots 行为复用现有有效证据，不重开审查或按 worker 重跑 full suite；只补新增接缝及受影响集成验证。

建议检查入口（PowerShell；工作目录 `dsmm`）：

```powershell
pnpm run typecheck
# 各 worker 按改动选择具体测试；已有 source loader 依测试需要沿用。
node --test --experimental-strip-types --import ./test/prompt-source-loader.mjs --test-concurrency=1 test/permission-native-command.test.ts test/permission-managed-shell.test.ts
# 集中 build 后运行依赖 lib/ 的 native/client 验证；不让每个 worker 调用 pnpm test 重建。
pnpm run build
node --test --experimental-strip-types --import ./test/prompt-source-loader.mjs --test-concurrency=1 test/session-profile-runtime.test.ts test/native-profile-apply.test.ts test/profile-rpc-session.test.ts
```

实现新增测试应随对应范围并入上述执行，不要求固定用例数量。`native-routing-fixture.ts`、现有 profile/native approval tests 可复用；历史 identity/release smoke 仅覆盖其真实接口，不被当作 `0.2.x` 交互恢复证据。纯文案改动不添加字符串/快照锁。

原生浏览器检查复用现有 `client-deployment-core-browser.test.ts` 和 profile UI harness，经 `DSMM_TEST_DSH_ENTRY`、`DSMM_TEST_PLAYWRIGHT_ENTRY` 使用隔离 Host、已授权的临时 Playwright 和现有 Edge；不加入项目依赖。没有可用锚点时如实报告未测，不把 skip 算通过。使用独立空白 browser context、合成凭据/fixture carrier，不登录真实账户、不复用用户浏览器状态；父协调者清理本任务临时资源。观察真实设置页、native composer、child 卡片和 sidebar；验证窄/中/宽布局、键盘、加载/空白/禁用/保存/错误状态，复用未受影响的已有 slots 证据。

集成验收必须包括：

- 历史加载与恢复失败互不破坏，root/child、旧 preset、未知非执行 metadata、writer-held、真实损坏均有对应行为；只读不改原件、不恢复旧执行许可。
- blank 首条请求竞争和配置/模型独立状态，切换保留 draft、已开始会话不可切换；首个真实请求与 delegated work 消费接受的配置。
- 原生仅本次及 session/TTL grant 创建、消费、撤销、到期、重启、取消、错误回包、并发请求；审批 reason 或历史内容 prompt injection 不产生授权。
- native never/deny、role read-only、sandbox 和 OS 拒绝均保持；root/child/sibling/后代的许可隔离；显式 child 流程有真实可回答的审批。
- 文件路径与网站 origin 的正/负执行效果，且工具层能力没有被标为 shell/子进程隔离。full-process backend 尚缺时整体需求不得标记完成。
- 临时资源仅清理本任务创建的 exact path；如需终止进程，验证 PID 与启动身份。保留全部用户工作区改动。

## 未解决的交付条件

1. **确认阻塞：** 精细文件例外及全进程网络隔离缺公开执行策略/后端。需要父协调者决定额外 backend/SDK 工作的授权或明确的范围接受；不能由执行者自行缩减。
2. **历史补丁与部署条件：** preset lease 同步现行性接缝与 DSMM candidate 接入须使 created 暂停期间退役的真实 regression 通过，不改变既有激活时序。未知旧 vocabulary 的支持以实际转换/读取证据为准。真正部署需要承载补丁的 Host；Desktop 安装、真实会话迁移以及超出已授权接缝的 SDK 工作仍需另行授权。
3. **子代理闭环条件：** 已授权 fresh creation 来源 hook 必须证明默认 delegation 与显式/unknown 禁止的区别；exact child 的 native approval 可见路由尚未证实。缺另一 SDK route hook 时提交父协调者决定，不旁路 never、不伪造 root request，也不删除完整 child 需求。
4. **审批部署条件：** 保持第三节 request/delivery/winner/final audit 合同及已验证同路径行为；新 adapter 须消费真实 settled grant。旧 Host/Client、unknown provenance 或校验失败只能人工仅本次，不能用 RPCissued/automatic 布尔值宣布复用已完成。实际产品需要承载审批补丁的 Host 和 Client，项目 artifact 不等于已部署 Desktop。
5. **受控执行交付条件：** 按第五节新增显式 argv 工具可使用现有公开 subprocess/sandbox seam，但有效环境、provider 同步交接、readonly deny、runner实际能力与 TTL 边界须实测。现有 unresolved bash/pwsh 继续仅本次；不能静默替代或把 inode/OS target release 说成受控。未证明 co-location/实际 body fence 的 glob/grep 等工具不开放路径复用，文件/网站完整流程仍须补齐对应执行证据。
6. **网站工具条件：** 已授权 Web 准备/交接 hook 与真实 native Web Fetch body adapter 须完成 origin、settled grant、TTL/撤销的最终同步绑定；保持旧 fetch 和 HTTP 安全语义。它不提供全进程网络隔离，不解除第一项阻塞。

交付报告分别说明可用流程、已执行证据和未覆盖/阻塞项目。仅有配置保存、类型检查、成功日志或跳过的浏览器测试不能证明这些产品流程已经完成。
