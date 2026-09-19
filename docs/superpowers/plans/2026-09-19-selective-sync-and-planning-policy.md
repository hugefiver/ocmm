# Selective sync：模型校准、planning policy 与浏览器隔离

## 目标与硬边界

在不改变用户默认模型、显式配置优先级和既有角色权限的前提下，同步 Kimi K2.8 / rolling aliases 与 SWE-2 的本地模型校准；复杂业务修改默认经过完整 `planner → plan-critic → 实施`；所有浏览器验证使用本次运行创建的临时空白 profile，禁止登录或导入身份状态。

- 本计划是已授权工作的执行交接，不另建 spec、不增加用户审批 checkpoint。当前只能调用 normal `planner` / `plan-critic`，不得虚构 tier，也不得让 planner 自行调用 critic；流程由父 orchestrator 编排。
- 不安装软件，不执行 Git 写操作，不修改 `omo/`，不导入 Senpi engine/provider/queue 或上游私有 harness、Atlas 身份/协议。research / 解释请求仍以回答结束，不产生隐式修改授权。
- 仅父集成者运行 bundle generator；不得手改 `plugins/deepwork/**`、`.codex/agents/**` 或生成 marketplace 文件。不执行 release completion。
- 本次规划阶段仅写本 Markdown；以下产品改动交由后续执行阶段完成。规划时工作区干净。

## 已确认接口与裁定

1. `src/intent/prompt-loader.ts` 的 `pickDeepworkVariantForAgent` 先选 planner，再选模型；当前无 Kimi / SWE 变体。`src/intent/model-family.ts` 中 `classifyModelFamily` 同时服务 reasoning 参数翻译，不能为了复用 prompt 将 SWE-2 分类成 Kimi。
2. `src/hooks/config.ts:391–477` 是实际组合入口：普通 agent 为 role + calibration，GPT 特调使用 base + addon；planner base 可叠加模型 addon；category 有独立路径，不能只改 variant selector。Codex 分支提前携带有模型适用条件的校准，以支持运行时 model override。
3. `src/codex/plugin-generator.ts:197–258` 的 `buildCodexAgents` 调用 `loadAllPrompts` 与 `createConfigHandler`，再生成 developer instructions；共享 skill 也会打包。新层必须在 OpenCode 配置结果及 Codex 生成结果都可见，且不能覆盖 role 的职责/权限。
4. 调用方提供的上游证据：`003977050` 增加 K2.8（`^kimi-k2[.-]?8` / `^k2[-.]?p8`）及 `kimi-for-coding`；highspeed 对应 K2.7。`c995fcd3c` 的 SWE-2（`^swe-2(?:[-.]|$)`）复用 `packages/prompts-core/prompts/atlas/kimi-k3.md`。执行时只读核对这些局部来源，抽取可移植的校准，不照搬完整 Atlas prompt。
5. 推荐独立的 prompt 匹配/校准选择逻辑，复用 `extractModelName` 处理 provider 前缀与大小写。共享校准内容不意味着共享 `ModelFamily`；新别名若涉及 reasoning 分类，必须有独立语义证据与回归测试，不借 prompt 同步暗改参数行为。误判代价是错误 provider 参数或误注入行为指令。
6. 浏览器指南现有安全边界尚有缺口：`skills/debugging/references/tools/playwright-cli.md` 与 `src/intent/browser-debug-safety-contract.test.ts:29–33` 仍允许 disposable test account / injected auth state；`skills/frontend/references/perfection/README.md:16` 要求 returning-user cookies/auth/warmed caches。必须同时改正文与旧测试期待，不能仅追加相反禁令。

## Wave 0：父级准备与统一输入

- 父 orchestrator 取得 normal plan-critic 的实质审查；对影响正确性、范围、安全、依赖或可验证性的阻塞先修订/澄清，再实施。非阻塞建议可采纳或说明不采纳；不以措辞/格式变化触发无限复审，不要求 hash 或固定 receipt。
- 记录当前差异与三个分区的文件所有权；后续出现既存用户改动时保留，不清理或覆盖。将统一 planning 规则和浏览器禁止事项原文交给各 worker。
- 上游额外同步只接收有局部来源证据、独立本地收益、不依赖私有运行时且可单独验证的小逻辑；记录“采用/不采用 + 理由”。若超出现有分区、改变公共接口或权限，先返回父级裁定，不把“适当同步”变成无边界迁移。

## Wave 1：三个并行实施分区

### A．模型路由、新校准与组合测试

**独占文件：** `src/intent/{model-family,prompt-loader}.ts` 及对应测试、`src/hooks/config.ts` 与受影响 `config*.test.ts`、`src/codex/plugin-generator.test.ts`；新建 `prompts/{v1,codex}/deepwork/kimi.md`、`swe-2.md`（等价名称可调整，但不得编辑 B 所有的现有 prompt）。必要的参数翻译回归测试也归 A，动手前报出具体文件。

- 将 K2.8、rolling alias、K2.7 highspeed 的 prompt 匹配显式化；SWE-2 使用独立选择条件。用 provider-prefixed、大小写、后缀、相邻型号与伪匹配覆盖边界，避免 `swe-20`、非目标型号或 provider 名误触发。
- 将可移植 Kimi/SWE 校准本地化；可共享底层片段，但保留各自模型适用条件，不带 Atlas 身份、工具名、私有 harness 或默认模型替换。
- 普通 agent 使用现有 workflow base + 新 addon；planner 保留 planner base + addon；role 始终优先。category 保留 category role，再叠加适用校准。Codex agent/category 携带 guarded addon，运行时非目标模型不得启用这些特调；保持现有 GPT/Astra/Opus 层与顺序语义。
- 不更改配置默认模型、fallback 默认链或显式用户模型。除有证据的新 alias 分类外，锁定已有 reasoning 参数结果；SWE-2 不新增 Kimi thinking 行为。

**完成证据：** selector 表驱动测试、实际 config 组合结果与 Codex 生成 developer instructions 均覆盖 Kimi/SWE、planner、category、override/carry-ahead、未知模型；原模型路由与用户配置回归通过。向父级返回来源、采纳内容、模型文档更新要点，不直接改维护文档。

### B．现有 workflow prompts / skills 与维护文档

**独占文件：** `prompts/{v1,codex}/agents/{orchestrator,planner,plan-critic}.md`；现有 `deepwork/{default,gpt,glm,gemini,codex,planner,gpt-5.6,gpt-6-astra,claude-opus-5}.md` 中实际冲突处；`skills/v1/{brainstorming,writing-plans,subagent-driven-development}/**` 的必要入口/引用；`docs/v1-maintenance.md`。策略回归可新增 `src/intent/planning-policy-contract.test.ts`，不抢占 A 的测试文件。

- 统一分类：复杂业务/行为修改默认完整 planner → plan-critic → 实施。仅有限、简单、低风险、边界明确的业务修改，或用户明确要求，才可酌情跳过 planning/critic；记录简短适用理由，不能将“需求清晰”“多文件可直接做”“已有足够证据”泛化为复杂任务逃生口。
- planning 强制默认不等于额外设计审批：brainstorming 只消除实质不确定性，不重启已授权任务的确认循环。research/解释仍回答结束。用户显式跳过也不授权安全、数据、API 或不可逆边界变更。
- critic 是实质阻塞发现者：阻塞必须修复、证据化反驳或升级澄清，不能标成 advisory 后忽略；非阻塞优化不阻挡执行，不设固定迭代次数、hash、固定 receipt 或重复格式审批。只在实质变化影响原结论时复核相关部分。
- 明确保留 orchestrator 独占流程编排、planner plan-only、critic read-only，以及现有 reviewer/Oracle 权限；“直接执行可以”只描述实施方式，不能绕过前置 planning。当前使用 normal profile；保留已有显式 tier 配置能力，不创造可调用性。
- 检查两种 adapter 的模型特调、skill 入口及引用，删除与新默认冲突的“critic 总是可选 / 仅明确要求才 planning”等表述，避免后一层模型注入逆转政策。A 的新 prompt 也必须遵守同一合同。
- 集中更新 `docs/v1-maintenance.md`，说明默认完整流程、窄例外、阻塞处理和新增校准；模型/浏览器说明由对应 worker 提供后由父级串行整合，不让多 worker 同写文档。

**完成证据：** 行为场景矩阵覆盖复杂修改、简单低风险修改、显式跳过、research-only、实质阻塞、非阻塞建议及纯文字修订；实际组合/生成文本不存在反向指令。测试验证语义与关键合同，不把固定段落顺序或 receipt 当成功条件。

### C．浏览器 skills 与安全合同

**独占文件：** `skills/debugging/references/tools/playwright-cli.md`；`skills/frontend/references/perfection/{README,react-perf-tooling}.md`、`skills/frontend/references/design/clone-from-url.md` 及这些技能必要的浏览器入口；`src/intent/browser-debug-safety-contract.test.ts`。

- 所有浏览器入口必须使用本次 run-owned 临时空白 user-data directory / 独立空白 context；不得连接用户现存浏览器/profile/CDP 会话，不复制、导入或同步用户设置、扩展、cookies、auth/storage state 或 profile。
- 不登录浏览器/vendor、个人网站或测试账号；不得以 disposable account、cookie injection 或自动测试便利为例外。需认证才能完成的验证必须报告限制，不擅自登录或绕过认证。
- 删除 returning-user auth 的要求；如验证 warm cache，只能由本次匿名空白环境访问产生，并说明不代表真实登录用户覆盖。保留真实浏览器交互、截图/性能证据要求，不以隔离为由伪称验证成功。
- 保留禁用扩展/同步、非阻塞启动、bounded readiness 和 PID+启动时间所有权校验。只终止本次拥有的进程，只删除本次实际创建并核验的确切临时资源；路径猜测、前缀匹配、PID 复用、目录归属不明均 fail closed。
- Lighthouse/CDP 示例只使用本次启动并确认归属的浏览器端点；移除固定 `9222` 的假定，不得在启动失败或端点未知时回退连接已有浏览器。合同测试覆盖该边界。
- 更新旧安全测试中的允许登录/注入断言，扩展到 frontend 各入口及生成 bundle 的对应副本检查。禁令与示例一致；不得通过移除原有清理/进程回归检查来过测。现有进程身份记录是安全数据，不新增 planning receipt 仪式。

**完成证据：** 合同测试覆盖禁止导入/登录、全入口一致性、认证限制报告和确切资源清理；有已安装可用浏览器工具时，以匿名本地页面做一次独立空白 profile 启动→交互→关闭/清理验证。无工具则不安装，明确未进行 live browser QA；静态测试不能冒充运行证据。返回浏览器文档要点给父级。

## Wave 2：父级集成、生成与验收

1. 等三分区完成后检查文件所有权、上游采纳清单与组合政策；整合 B 的维护文档及 A/C 提供的信息。若 generator 自身的 dispatch 文案与政策冲突，仅父级修改 `src/codex/plugin-generator.ts` 并顺序补测试；worker 不并行编辑此文件。
2. 分区先跑各自 focused tests。父级运行下列命令（PowerShell，每项失败先解决；不得用自动下载/安装补依赖）：

   ```powershell
   pnpm run typecheck
   pnpm run build:ts
   pnpm run gen:codex-plugin
   pnpm run test:ts
   ```

   `test:ts` 包含 model-family、prompt-loader、config、plugin-generator、browser-debug-safety-contract 与新增策略测试；如选择全套，使用 `pnpm test` 替代 `test:ts`，其包含 Cargo 测试。未涉及 Rust 不需要为本任务运行 release 构建；若依赖/工具缺失，报告受限验证，不安装软件。
3. 验收生成产物：两种 workflow 的最终角色/校准组合正确；Codex 新 addon 有模型 guard，planner/category layering 不丢失；生成默认模型未改变；profile inventory 与配置一致，默认无凭空产生的 planning tier；浏览器禁止事项随 skills 正确打包。
4. 检查生成一致性与最终差异（必要时在临时输出根生成比较，避免无输入变化重复全测），确认没有 `omo/`、无关配置、用户凭据或测试临时资源变更。终止并清理仅本次创建的背景任务/资源。
5. 交付实际通过的证据、未跑项目与残余风险；只报告已证实的行为。不 Git 写入，不发布，不运行 `check:release-completion`。

## 主要风险与升级条件

- **路由耦合：** prompt 复用误变 reasoning 参数；用独立匹配与参数回归阻断，SWE-2 绝不伪装 Kimi。
- **多层冲突：** planner 优先、Codex carry-ahead、category 旁路或模型特调可能覆盖主策略；以最终组合输出而非仅源文件存在性验收。
- **浏览器越权：** 旧 disposable auth 示例、returning-user 性能目标与 cookie 注入构成后门；删除冲突并明确认证覆盖缺口，不能降低禁令换取“全测通过”。
- **并行冲突：** A 只写新 prompt，B 只改现有 prompt/维护文档，C 独占浏览器合同；共享 generator/生成文件/文档最终整合由父级串行持有。
- **额外同步失控：** 无局部来源或本地独立价值的改动不纳入；涉及权限、公开接口、数据保证、不可逆操作或纯猜测时向父级报告，不自行扩大范围。允许等价实现与排序调整，但不得改变这些约束与验收。
