# DSMM：ocmm 功能同步、最新 DSH 适配与 DeepSeek 4.1 Flash 实测

日期：2026-10-03；2026-10-04 根据协调者的真实包证据修订设置与角色分发合同。状态：已通过 plan-critic 的实现计划；下述发现保留规划时点的信息，当前验收以最终验证报告为准。

2026-10-04 执行裁定：宿主同时提供原生 `deepseek-account/deepseek-flash`，目录显示为 `DeepSeek-V41-Flash`。使用现有账户授权在隔离测试 home 中完成真实读写和 reviewer 委派；这不是第三方同名模型替代，不声称验证 API-key 路径。headless 明确不 compose preset，因此角色工具在 root Agent scope 挂载。预设与 headless 的角色工具均关闭会在只读 child 同作用域重装工具的 `modelSelectionSettings`；模型继承父路由，异构 Oracle 和 tier 路由留给显式且有权限验证的宿主配置。最终报告单独列出已验证与未验证边界。

## 目标与授权边界

用户要求将 ocmm 更新的功能迁移到 dsmm，适配 DSH 最新版本，并在真实 DSH 环境使用 DeepSeek 4.1 Flash 测试。完成态为：DSMM 作为独立 DSH-native Cordis bundle，在核实并固定的最新 DSH 版本上可以安装、启用、调用真实指定模型、使用工具和工作流；与当前 ocmm 的适用行为一致，不能移植的宿主能力有明确证据和边界。

- 保留 DSMM opt-in 范围：关闭 deepwork 且未选 DSMM preset 时，不泄漏 prompt、skills、路由或默认守卫策略。
- 不修改现有用户 DSH home/profile、模型默认值或凭据；测试使用独立 home、profile 和任务目录。真实模型测试是授权范围，但不得默默替换为 V4 Pro、V4 Flash 或其他供应商模型。
- 不提交、推送、打标签、发布或修改发布工作流；不执行根目录 release-completion。版本发布与 npm ownership 核验不属于本次验收。
- 不重写 OpenCode hooks 为兼容层，不引入虚构 DSH 事件、工具或权限。DSH 宿主重试、权限和取消仍拥有最终控制权。
- 保留现有用户改动。生成内容由适当生成器/build 产生，不能手改 `dsmm/lib` 或 `plugins/deepwork`。本任务预计不修改根 ocmm 的运行行为。

## 已核实基线

只读命令：`git status --short`（发现时干净）、`git log -8 --format='%h %ad %s' --date=short -- dsmm`、`git log 355fbb0..HEAD --oneline -- src prompts skills scripts`、针对以下路径的文本/代码检查。

- 当前 ocmm `package.json` 为 `0.6.24`，HEAD `a6a1e71`。DSMM 最后更新为 `355fbb0`（2026-08-28，`feat(dsmm): complete v1 release readiness`），自身版本 `1.0.0`。
- `dsmm/docs/compatibility.md` 只把 `@deepseek-ai/dsh@0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` 认作已验证权威。peer 范围、Dockerfile、smoke 和 readiness checker 多处硬编码此版本。
- `dsmm/src/index.ts` 接合 mode、commands/settings、presets、model routing、runtime recovery、guards。`dsh-types.ts` 手写 structural contracts；`test/runtime-recovery-types.test.ts` 只验证本地类型，不能证明符合新版真实宿主。
- `roles.ts` 仅有 orchestrator、planner、plan-critic、reviewer、code-search、doc-search、clarifier、media-reader 八个角色；角色 persona 很短，未完整表达当前角色权限。`preset-materializer.ts` 有 ownership marker、foreign/link 拒绝及安全更新机制，必须保留。
- `prompts.ts` 和 `prompts/deepwork.md` 镜像，七个 `skills/*/SKILL.md` 是旧版简写。旧策略为强制设计、multi-step 即规划、逐任务串行、固定 `reviewCap: 5`、`simple-oracle-complex-reviewer`，却没有打包 Oracle preset。
- `model-routing.ts` 和 prompt 仅识别 `deepseek-official/deepseek-v4-pro`。`auto` 保留显式 reasoning，`strict` 可覆盖；发出的 effort 必须是 `llm.resolveModelInfo` 广告值。
- `runtime-recovery.ts` 只在宿主拒绝 retry 后选择显式 fallback，一次性 `(agent, turn, step)` pending route，移除旧 reasoning 后由外层校准；可选 idle continuation 消费 durable goal/todo。默认关闭，不自动 child/parent follow-up。
- `lsp.ts` 固定八个旧工具，但当前 `crates/ocmm-lsp/src/main.rs` 已注册第九个 `format`。DAP 是 `skills/debugging/references/scripts/dap.mjs` 独立客户端，不是新增 LSP MCP 工具。

基线之后直接相关的 ocmm 变更包括 `7fea4e9`（恢复：402、重试状态、去重/dispatch reservation）、`d611342`（temperature capability）、`1fbde8e`（原子 LSP format）、`1bd02f0`（DAP）、`f5cc949`（workflow reliability）、`60976b7`（角色精简）、`551480e`（工作流简化）、`8c84a94`（共享 shell safety）、`b7ba589/a6a1e71`（模型校准）。planning tiers、Oracle slots、depth/interruption 等在 ocmm 存在但 DSMM 未覆盖的差距，也应在矩阵处理，不能只按日期遗漏。

### 最新宿主证据（协调者提供，2026-10-03/04）

- npm `latest` 与 `next` 均为 `0.2.0-rc.2`，`alpha` 为 `0.2.1-alpha.1`；已安装 CLI `--version` 输出 `0.2.0-rc.2`。本次固定 `@deepseek-ai/dsh@0.2.0-rc.2`，不采用 alpha。
- 官方 `@deepseek-ai/dsh-llm-deepseek/lib/index.js` catalog 将 `id: deepseek-flash` 显示为 `DeepSeek-V41-Flash`，provider 为 `deepseek-official`；本次唯一指定实测 route 为 `deepseek-official/deepseek-flash`。官方 adapter 默认 `baseURL` 为 `https://api.deepseek.com/anthropic`，支持输入 `text,image`。模型 ID 本身虽不含 `4.1`，官方 catalog 名称给出其身份；不得按旧 V4 Flash 猜测或自行改写模型 ID。
- 新版设置由 Loader plugin config + `SettingsForms` 承载，不是旧 `settings.register` 服务。`SettingsForms` 是表单/配置合同，不能等同于 live settings watch；保留已有 restart-scoped schema 和配置语义，不机械标记为 volatile。
- `systemPrompt` 的 `AssembleContext` 只有 `scope` / `signal`，不再有 `agent`；必须通过实际 scoped lookup 取得 agent。request 事件总体仍相近，但需要真实宿主 probe 确认。
- 预设使用原生 `PresetDefinition` 的 `id` / `plugins`，不再通过旧 filesystem roots discovery 接合。标准 subagent 继承父 preset，并不按 DSMM role ID 自动分发；可调用角色必须由原生 per-role tool composition 的 persona、`toolFilter`、`agentOptions` 表达。
- 原生 subagent `maxDepth` 默认 `1`，并已有 durable session / control 能力。复用该能力，不为凑齐 workflow 自动提高 depth。
- 当前未找到可用于官方 route 的 API key。真实 Flash 网络往返验收仍未执行；无认证 host probe 可以先行，但不能替代它。

## 迁移矩阵与实现原则

| 面 | 本次目标 | 不可照搬的部分 / 验收证据 |
| --- | --- | --- |
| Deepwork 工作流及七个核心技能 | 从当前 `skills/v1`、`prompts/v1` 迁移按风险缩放的授权、规划、执行、验收规则；复杂行为默认 planner → critic → implementation，简单有界例外；取消无价值固定审批/固定复审循环 | 使用 DSH 实际可调用工具；host 没有某角色时明确能力不足，不声称 dispatch 成功；源文件和运行时 prompt 都检查 |
| 角色及 Oracle | 更新现有角色并补齐 builder、Oracle normal/2nd；原生 `PresetDefinition` 负责 preset，原生 per-role tool composition 负责实际角色调用；Reviewer 是主模型自审，Oracle 是交叉核验职责 | 标准 subagent 继承父 preset，不会解释 role ID；必须证明实际 tools inventory、persona/toolFilter/agentOptions 生效；默认继承用户模型，只有显式角色配置可选其他模型；同 Flash 不声称异构 |
| Planning/review tiers | normal 无后缀；仅显式配置才注册 tier preset/tool；继承 canonical persona、skills 与权限；调用前检查可用性 | 使用新版原生组合，不另造调度器；不默认批量产生 suffix，不导入 GPT effort 为 DeepSeek 值；实际 preset 与 tools inventory 和 route/effort 证据 |
| DeepSeek 4.1 Flash | 精确支持官方 `deepseek-official/deepseek-flash`（catalog 名称 `DeepSeek-V41-Flash`），保留 V4 Pro 兼容和明确配置优先级 | 不猜 max/high 支持、不注入 GPT/Claude 校准；官方 adapter 的真实 request/header 与工具往返；无 key 时明确未完成 |
| temperature 能力 | 对需要由 DSMM 设置/重设的参数使用最终路由的宿主 capability；若 DSMM 从不设置该参数，确认保留 host 处理，不制造无用模型 registry | 不以模型名白名单覆盖宿主能力；explicit config 不被 silent rewrite；跨 route 回归 |
| Shell / git /工具安全 | 同步简洁 shell、路径核验、禁止复杂跨 shell 删除、子任务 Git 授权约束；绑定新版真实 tool schema 与权限事件 | 不把所有普通命令变成 deny；guard 必须在真实工具管线生效且不改变批准/取消语义 |
| depth / interruption | 对最新 DSH 原生 child depth、continuable session、durable descriptor 能力先映射；可用则迁移“不越更严格宿主限制、只对真实 child/task ID提示、去重、单一重试拥有者” | 禁止凭空使用 OpenCode `task_id` / `session.error`；宿主缺少身份或 resume 能力时保留明确不可用，不能猜 parent prompt 或新造独立 retry loop |
| Runtime fallback | 在 DSH request-error 边界迁移明确 status/code 分类、402 显式路由策略、取消/重复/过期状态安全；保持 host-first、opt-in 和有界行为 | 不移植 OpenCode dispatcher/timer；不解析任意供应商正文；不会为实测主动制造真实 402/429；可用宿主 fault fixture 验证 |
| LSP format | 对齐当前 MCP 9 工具及可选 external `ocmm-lsp mcp` 集成；实际发现并调用 format fixture | 不把 formatter 安全写入变为强制默认插件，不复制 native binaries 到 DSMM；旧工具仍可用 |
| Debugging/DAP | 迁移可移植 debugging 方法、DAP 客户端/必需引用和隔离规则为 DSH-native 按需技能；与七个自动注入核心技能分开，避免提示膨胀 | 不引入 Codex browser 或 OpenCode tool 假设；只打包技能引用实际需要文件；可运行 fixture/DAP 验证，无需生产 attach |
| 平台专属功能 | Codex marketplace/generator、OpenCode cache/hooks、模型默认大表、根发布流程不迁移 | 文档说明 host-specific，不声明全 hooks parity |

范围裁定：迁移的是与 DSMM 可用工作流相关的行为与能力，不复制 ocmm 全部宿主基础设施。若某项有 DSH 原生能力，应利用并验证；若不存在，记录源码证据和对交付的影响。不得把实际可实现的必要功能以“未来工作”删除；确实影响用户要求且无替代时向用户报告阻塞。

## Wave 1 — 锁定最新 DSH 与指定模型的真实合同（P0）

结果：有准确版本、组件依赖、CLI/host/tool/API 差异和模型身份，可以开始安全实现。

1. 固定协调者已验证的 `@deepseek-ai/dsh@0.2.0-rc.2`。保留 dist-tags 与 CLI 版本证据；`latest` 只用于发现，测试/install 使用精确版本，不因 alpha 较新而切换。
2. 在独立 `output_test/dsmm-dsh-20261003` 或 task-owned 临时根安装真实 DSH；仅持有本次创建文件。读取实际包 exports/types/source，核对 settings、systemPrompt、commands、skills、persona/presets、tools guard、request/error/turn-stopping、session header/goals/todo、MCP 和 CLI/plugin lifecycle。
3. 使用已核实的 `deepseek-official/deepseek-flash`，继续核对该 route 广告的 reasoning/temperature 能力。只输出身份和配置来源，不输出 token、认证 header、完整用户配置或 provider error body。当前无官方 key，需协调者在无凭据工作完成后请求所需认证，不能用其他 route 或 mock 冒充验收。
4. 根据上述事实形成短 compatibility delta，并把准确版本更新到后续工作参数。本波可用无认证 dump-config/contract probe，不调用付费模型探测明显无效身份。

证据：`0.2.0-rc.2` registry + CLI 身份、相关真实 .d.ts/.js 文件与接口位置、CLI help/安装列表、官方 Flash catalog 非敏感摘要。静态包证据已补齐版本和模型身份；本波剩余重点是挂载/作用域的真实 host probe，不能只靠 structural mock。

## Wave 2 — 最新宿主加载、路由与参数兼容（P0）

依赖 Wave 1。主要路径：`dsmm/package.json`、`pnpm-lock.yaml`、`dsmm/src/{dsh-types,dsh-events,index,settings,mode,commands,skills,preset-skills,session-scope,model-routing,prompts,status}.ts`、对应 tests、`cordis.patch.yml`。

- 更新已证实的组件 peers/devDependencies 与锁文件；不宣称旧版兼容，除非它也被验证。保留公共 exports/旧 V4 Pro 设置可用。
- 调整宿主接口到实际新版事件/服务，不通过 widening `any` 或吞掉安装错误令类型检查假绿。对官方公开 types 增加真实 assignability/contract test；无法稳定导入的接口由实际宿主集成证明。
- 设置安装切换为 Loader 的 plugin `Config` 与 `SettingsForms` 声明：从传入的插件配置解析 DSMM settings，不探测不存在的旧 registry 并静默回退。保留原 schema 的 restart-scoped 设置，不加无依据的 volatile/live watch；表单和 status 如实标记需要重启。旧 `DSH_HOME/settings.yaml` 的 `dsmm` namespace 不会自动被新版加载：文档给出迁移到所选 profile 的 DSMM plugin config 的字段映射和重启步骤；本任务不自动移动、删除或覆写用户旧文件。
- prompt assembly 通过真实 `AssembleContext.scope` 的宿主 lookup 获取 agent/session，不读取已删除的 `context.agent`。宿主级与 agent/preset 级插件必须在各自受支持 scope 挂载；active state、selected role、skills、guards 与 routing 都使用相同实际 session，不从另一 agent 或父全局对象借用。用真实 host 的 inactive root、active root、不同 role child、独立 sibling session 验证没有串流或泄漏。
- 引入 Flash 精确路由校准和设置（或经证据支持的通用模型校准结构），`auto` 保留明确用户 effort，`strict` 只在明确配置下覆盖，off/unknown route/out-of-scope 不改变请求；能力查询失败不得发送猜测参数。
- 验证 recovery 与 routing middleware 顺序：最终 fallback route 决定适用校准；取消信号和下游返回的其他字段不丢失。声明新模型 support 不改变用户当前全局默认模型。
- 默认 workflow 转为当前证据驱动策略，新增可选 `workflow.policy: risk-based | legacy` 作为明确选择。`strictGates`、`reviewCap`、`finalReviewPolicy` 继续解析且显式 legacy 值保持旧语义。原始输入中：显式 `policy` 优先；未指定 policy 但任一旧字段实际存在则选择 legacy；均省略则选择 risk-based。schema/form 不得在解析前为可选 policy 或三个旧字段注入默认值，否则会丢失“用户明确填写”和“schema 补默认”的区别。旧字段的历史默认值只在上述 policy/provenance 已决定后的 normalization 补齐。状态输出列出 effective policy 及来源；表单新增显式 policy 选择，不宣称旧静态 patch 中填入的值是“省略”。更新默认安装 patch 选择 risk-based，保留用户旧 patch 的 legacy 行为；文档说明显式 risk-based 时旧字段不参与该策略，不默默改变明确旧设置。

证据：真实 `0.2.0-rc.2` Loader 加载 packed bundle，无旧 settings registry 假成功；配置经过真实 schema 处理后，空配置、旧字段显式 false/0/off、旧 patch、新默认 patch、显式 policy 的 policy/provenance 都正确；SettingsForms 与重启后 config/status 一致。真实 assembly 的 active/off/role-child/sibling 作用域正反例；V4 Pro 回归与 Flash 精确/近似名称、explicit effort、无 reasoning capability、fallback route 测试；status 无秘密。

## Wave 3 — 工作流、角色与技能迁移（P1，可与安全功能部分并行）

依赖 Wave 1 合同和 Wave 2 设置接口。主要路径：`dsmm/src/{roles,preset-materializer,prompts,skills,preset-skills,settings,status}.ts`、`dsmm/agent-presets/**`、`dsmm/skills/**`、`dsmm/prompts/**`、对应测试。

- 七个核心技能同步当前行为：授权明确就推进、规划按复杂度、严谨但不仪式化的 blocker review、协调者拥有工作流编排、worker 有边界且不可替人扩大权限、集成验收而非固定逐任务全量复审、清理仍锁住行为。
- 原生 preset 注册使用 `PresetDefinition { id, plugins, ... }` 的真实 0.2.0-rc.2 合同，而非继续把旧 `preset.yml` / `agent.cordis.yml` 写入 roots 并声称已发现。每个 preset 的 plugins 组合 persona 和 DSMM agent-scoped skills/策略；宿主 profile 按新版明确注册这些 definitions。旧 roots 示例改成原生配置迁移说明。
- 为需要委派的每个启用角色注册 DSH 原生 per-role subagent tool composition，使用真实接口提供对应 persona、`toolFilter`、`agentOptions`；标准 subagent 继承父 preset 不构成角色分发，不能只在 prompt 中写 `dsmm-planner` 或传入不存在的 role 参数。协调者 prompt 使用实际工具注册返回/暴露的名称与 schema。原生宿主继续拥有 depth、lifecycle 和 session/control，不新增平行 scheduler。
- persona 表达 plan-only、critic/reviewer read-only、研究叶子权限、no autonomous git；`toolFilter` 同时限制实际可见/可用工具。read-only 角色不能执行写工具或有写副作用的泛用 shell，也不能通过子工具修改；planner 仅允许计划 artifact 写入，其余产品写和 implementation dispatch 不可用。若 filter 只能限制工具名，则为 planner 暴露路径约束的计划写入能力或明确返回 inline plan，不将不受限写工具作为等价权限。最新宿主真实 probe 必须证明这些权限，而非仅断言 persona 文本。
- builder/Oracle 与既有角色统一使用上述机制。默认 `agentOptions` 继承父用户 provider/model，不自动切换模型；只有用户显式 role route/effort 配置才 override。planning/review tiers 同样仅显式配置才注册 preset/tool，normal 无后缀，suffix 继承 canonical persona/skills/权限；选定能力不能超出实际 model catalog。Oracle 角色承担交叉核验职责，但没有显式不同模型时 status/docs 明确不保证异构。
- role enable/disable、status、skills scope、preset definitions、per-role tools 使用同一 inventory。仅生成 preset metadata 不算角色功能完成。保留旧文件物化 API 的兼容性/安全边界，但把它明确标记为 legacy artifact 路径，不作为新宿主默认 discovery。只有在用户选择该 legacy 路径时才执行 owned 文件更新；不自动清理用户旧 roots。现有 marker-owned、foreign 文件保护、symlink/junction 不越界测试仍保留。
- 增加按需 debugging/DAP 资产时，将“可用技能目录”和“每轮注入的核心技能集合”分离；保留既有七个核心技能配置兼容。

证据：canonical/渲染/mirror 一致；新默认不含固定审批/固定轮次数或旧不可调用工具名；真实 DSH 可发现原生 preset definitions，并在 coordinator 的实际 tools inventory 中看到启用的 per-role tools。无认证 host probe 调用每类关键 role composition 并捕获实际 child persona/工具集合/agentOptions：角色正确、只读角色无法写、关闭角色不可见、默认无 tier suffix、显式只产生请求 tiers、默认模型继承且显式配置生效、parent/sibling 不被 child 配置污染。遵守原生 maxDepth=1，不要求 child 再嵌套以验证流程。legacy foreign/links/disabled/marker 回归及 DAP fixture/打包引用验证照常。

## Wave 4 — 安全、恢复与可选 MCP 迁移（P1）

依赖真实 tool/session 合同；可拆为互不写同文件的守卫、恢复、LSP 工作单元。主要路径：`dsmm/src/{guards,shell-command,plan-validation,runtime-recovery,recovery-policy,lsp,dsh-types,settings,status}.ts`、`dsmm/scripts/{docker-smoke,lsp-mcp-smoke,lsp-smoke-fixture}.mjs`、patches、对应 tests/docs。

- 新版 tools 名称、arguments、pre/post decision、structured value/content 与 approval/deny 语义逐项对齐。保留非文本输出、错误结果和 metadata，不让截断抹去权限结果。
- depth/interruption 复用已存在的原生 `maxDepth`（默认 1）及 durable session/control：协调者直接编排一层角色完成 planner → critic → implementer，不能自动提高 host depth 或要求角色嵌套。只使用已证明的 lineage/session identity 和控制接口；缺少某身份不推断，重复证据至多一个说明，manual notice 不拥有自动 retry 权限。
- 扩展 recovery 的新安全不变量：host retry wins；取消、过期 turn/step、重复 error 无重复 fallback；402 仅明确结构化状态和显式配置决定；没有显式 fallback 时无自动换模；日志只含固定非敏感诊断。默认关闭与 no timer/no background poll 保持。
- 更新 LSP inventory 与文档为实际发现的九工具，增加 format 正/负验证：安全 fixture 可格式化、工具错误不能当成功、路径/dirty-file保护由现有 LSP 实现保持。DAP 不加入 LSP tool list。

证据：有意义的定向回归与真实 host tool-pipeline 测试；latest DSH fault harness 证明 error/recovery 合同（非生产故障注入）；MCP tools/list 和 fixture format 前后内容；无宿主全局安全降级。

## Wave 5 — 打包、真实 Flash 端到端与文档交付（P0 完成门槛）

主要路径：`dsmm/scripts/check-release-readiness.mjs`、`docker/Dockerfile.smoke`、smoke scripts、package tests、`README.md` 与 `docs/{compatibility,migration-from-ocmm,skill-sync,model-routing,agent-presets,safety-guards,runtime-recovery,lsp,settings-status,releasing}.md`；新增有明确目的的真实模型 smoke runner 可放 `dsmm/scripts/`。

1. 更新 checker 和 Docker smoke 中旧版硬编码及 exact inventory，不能删测试/放宽断言来掩盖新版差异。把 latest-resolved 版本变成受控固定输入，文档中历史证据和本次新证据分开。
2. `pnpm --filter dsmm typecheck`、`pnpm --filter dsmm typecheck:test`、`pnpm --filter dsmm test`、`pnpm --filter dsmm build`、`pnpm --filter dsmm check:release`。检查 dry-run package，实际 pack 到 task-owned 临时目录；安装该 tgz 而非直接 source import。
3. 运行更新后的 `pnpm --filter dsmm smoke:docker`，保留原要求的 packed Linux 生命周期证明；Docker 不可用时记录该阻塞，不把 Windows 测试冒称 Docker 通过。真实 Windows DSH 测试可独立完成，不应因 Docker 延迟而完全停止。
4. 新隔离 `DSH_HOME` + profile + task cwd，用固定 `@deepseek-ai/dsh@0.2.0-rc.2` 安装本次 packed artifact。检查 plugin add/list/dump/remove/reinstall、原生 preset definitions 与实际 per-role tools inventory、无 global contamination；命令/status 必须通过真实 host API，不能把 `/deepwork` 当 headless task 文本测试。增加 Loader config/SettingsForms 的 restart probe 和 scoped assembly 的 root/child/sibling 隔离 probe；不以 mock 的 `settings.register`、`context.agent` 或 roots discovery 代替。
5. 显式选择官方 `deepseek-official/deepseek-flash`（`DeepSeek-V41-Flash`），使用官方 adapter 的实际消息协议，禁止 fallback 到其他模型或借兼容代理调用自称同名模型获得“成功”。真实小任务至少证明：正常回复；读取 fixture 并正确引用内容；一次有权限的局部写/编辑与工具结果后的再次模型响应；启用 DSMM 时实际 prompt/role/skills 可见。任务目录只能包含本次小 fixture，模型不得修改仓库。当前无官方 key，因此该项是待用户提供认证才能解除的验收阻塞，不能用已完成的 host 本地 probe 代替。
6. 调用新注册的原生 per-role tool 执行 bounded child task（父/子均指定上述 Flash route），获取宿主确认的 role persona、toolFilter、agentOptions、session/model 证据；不能以标准 subagent 返回成功冒称特定角色生效。depth/恢复或只读拒绝若通过 host fault fixture 验证而非真实供应商失败，报告区分两种证据。
7. 分别记录真实请求的 provider/model、resolved effort、DSH/package 版本、工具调用及结果、最终 fixture 内容、exit/timeout。模型自称身份或简单“hello”不能独立证明整个集成通过。禁止记录完整 request/response/private reasoning 或认证字段；只保留必要脱敏摘要及测试自建 fixture。
8. 根仓库 `pnpm run typecheck`、`pnpm test`、`pnpm run build` 最终一轮集成检查；输入未改变不重复运行。若只改 DSMM 无需重新生成根 schema/Codex bundle；若意外触及 `src/config/schema.ts` / v1 prompt/skills，则分别按 AGENTS.md 同步 schema 或 maintenance 文档及生成器。

本次实测付费调用保持小而有界，runner 有明确 timeout/cancel、有限重试和进程回收。执行身份/关键调用失败时不能无限循环。结束移除本次临时凭据，确认子进程及 MCP server 已退出；保留脱敏验收报告，清理仅删除验证过位于本次测试根内的自建内容。

## 交付判断与协调边界

协调者先将此计划和 Wave 1 具体证据交给 plan-critic。阻塞需修复、证据反驳或向用户升级；不因无关建议、格式调整重复审整个计划。实现者可调整非关键文件划分或顺序，必须记录对范围、权限和验收无影响的重大等价选择。

真正完成需同时满足：迁移矩阵已落实（每个 host-specific 缺口有可审阅依据）、固定最新 DSH 的 packed runtime 成功、指定 Flash 的真实工具往返成功、有意义的回归/构建通过、无用户环境污染。兼容旧 DSH 版本、未测试 OS/UI、无可用认证的模型测试都不得写成已验证。

若模型或认证不可用，先完成所有无凭据迁移及真实 host 本地测试，再只针对实际缺失条件请求用户帮助；不能用 mock 替代真实模型门槛。若遇到需改变公开 API、降低权限安全、覆盖用户 profile 或新增发布权限的决定，停止该分支向用户升级，而不是凭计划自行授权。
