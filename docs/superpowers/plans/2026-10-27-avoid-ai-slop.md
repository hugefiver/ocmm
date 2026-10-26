# OCMM / DSMM `avoid-ai-slop`

## 交付目标

OCMM（含 Codex 公共 bundle）与独立 DSMM 均提供可发现、可禁用、按需加载的 `avoid-ai-slop` skill。系统提示只携带位于各仓 `prompts/shared/avoid-ai-slop.md` 的简短引导，不默认注入完整技能正文。

在生成或修改当前代码、测试或文档时，识别到具体 slop 风险，或用户明确要求避免 slop，且当前宿主实际提供并允许该技能时，模型必须在继续相关工作前通过宿主原生 skill 工具／技能加载机制加载正文。普通事实查询、一般对话和无具体风险的每条消息不触发加载；当前上下文已有有效正文时不要求机械重复加载。

这是一项提示与技能资源能力，不是新的检测器、执行拦截器或清理工作流。`remove-ai-slops` 仍专用于用户明确要求的系统性清理；新技能不能隐式启动它，也不能授予编辑、代理调度、提交等权限。

## 有效边界

- 保持现有角色、工作流、授权、原生工具目录、工具权限、Deepwork activation、技能开关与覆盖优先级。不可要求加载禁用、未暴露或当前宿主不可调用的技能，不自动启用技能或 Deepwork，不以直接读文件绕过禁用。缺失技能不是完成加载的证据。
- “去 slop”不能删除真实的输入验证、安全／协议检查、必要异常传播、数据完整性保障或有效测试；不能把真实失败隐藏为成功，也不能以精简为由绕过必须的验证。
- 不加入 Guard、hooks、MCP、审批、额外日志、审计台账、新工作流或新的运行时风险分类器。仅在现有配置／提示装配代码中接线。
- 功能实现不改变公共 API、capture 版本、包名、依赖或 DSH 版本，不重新安装 Codex。实现执行者不做 Git 写入或安装；父代理在验证后负责用户授权的两仓版本更新、提交、推送、发布，以及将新版 DSMM 安装到 DSH 的 `desktop`、`dsh-tui` profile，遵守各仓发布与安装流程。
- DSMM 的源、资源、生成与验证均独立于 OCMM 父目录。两端可以交付语义一致的资源，但没有运行时、构建时或生成时的跨仓读取依赖。
- 保留项目所有 `.codex/` 本机配置以及 `INSTALL.local.md`、`generate-local-plugin.mjs`、`local-plugin`。保留 DSMM 的 `docs/superpowers/plans/2026-10-22-profiles-page-redesign.md` 和其他非本任务变更。

## 技能与简短引导的内容契约

### 完整技能

两仓分别交付 `skills/avoid-ai-slop/SKILL.md`，使用本地支持的 YAML frontmatter，名称为 `avoid-ai-slop`；描述表达明确的适用条件而非“所有编程工作必须加载”。正文聚焦当前授权产物，包含以下规则：

- 仅为已知需求和已有契约实现必要逻辑；避免推测性抽象、透明转发包装、多余配置／开关、不必要的兼容层、内部保证下的重复防御与复制。
- 区分真实边界校验与无需求兜底；错误应传播或按现有契约处理，不加入空 catch、伪默认值、吞错、假成功返回或掩盖类型错误的抑制。
- 注释、文档和报告描述有效行为、必要原因与已知限制，不填充代码复述、空洞标题、夸大完成声明、决策流水账或装饰性示例。
- 验证应证明有效需求和真实接口；不得添加恒真断言、仅断言 mock 被调用的伪证明、无效快照、无关文字锁、凑数测试或把未执行检查说成通过。
- 在当前任务范围内修正生成方向；不借此扫描／重写整个项目，不顺带清理旧代码，不越过只读角色。范围外问题交还任务所有者。
- 已有安全、权限、原生工具、验证与工作流规则优先；不自动调度清理、规划、评审或其他代理，不增加确认仪式。

正文适配 `https://github.com/lennney/stop-that-shit` 的 `skills/stop-that-shit/SKILL.md` 与 `skills/stss/SKILL.md`：前者提供当前职责、直接方案、具体缺口、防护效果与有效验证原则，后者提供文案是否改变读者理解或决策的判断。上游无独立 prompts 目录；共享短引导由本地维护。注释与测试约束结合两仓现有规则，不标作上游原文。措辞沿用仓库模型提示的语言与风格，不引入上游工具链和流程。

### 系统 brief

brief 保持短小，表达“具体风险／用户明确要求 → 先加载可用的 `avoid-ai-slop` → 继续当前授权工作”，列举少量代表性风险并说明非触发条件。明确服从原生可用目录、禁用配置与适用的 Deepwork gating；不默认展开正文，不将普通询问变成加载请求。区分预防生成 slop 与明确请求的 `remove-ai-slops` 系统清理。

brief 可以使用稳定的结构标记作为装配边界；测试验证该片段的路由、数量与开关效果，不锁定自然语言句子。

### 归属和许可

适配内容保留上游仓库归属、所用素材的来源路径及必要 MIT copyright／permission notice。使用父代理提供的原始许可文本，不猜测作者或年份，不重新联网研究。将许可放在技能资源目录内的适当文件（如 `LICENSE`），使 DSMM 包与 Codex 技能目录复制自然携带它；若简短引导也派生自上游，归属说明同时覆盖该资源。许可与归属不需要默认注入系统提示，不增加 LICENSE 字符串锁测试。

## 接口与实施范围

### OCMM：共享发现、装配与 Codex

涉及源位置：

- `skills/avoid-ai-slop/SKILL.md` 及所需许可文件。
- `prompts/shared/avoid-ai-slop.md`。
- `src/intent/prompt-loader.ts`：参照共享 shell-safety 资源，在 `loadAllPrompts` 中加载并提供读取入口；重新加载其他 prompt root 时正确重置，不残留旧 brief。
- `src/hooks/config.ts`：在现有共享 terminal suffix 装配路径接入 brief，覆盖内建角色、类别及已有对应变体，不逐个复制角色正文。加入现有 terminal-policy 去重机制，重复配置装配时仍只有一份。
- `src/intent/skill-loader.ts` 的现有 `loadSharedSkills` 自动发现新顶层目录，无须建立第二张技能清单，也不把正文加入 v1 默认注入。`src/hooks/config.ts` 注册共享技能的原生发现路径时只加入已选技能自己的目录，不加入可递归暴露禁用同级技能的整个根目录；保留宿主已有路径、同名覆盖语义和更严格的原生权限，不通过覆盖权限掩盖发现问题。

brief 的接线须使用现有有效技能过滤结果或同一配置语义，尊重 `skills.enable`、`skills.disable`、`disabledSkills`，不因资源存在就强制调用。相同过滤结果控制新增原生发现路径、command 和 brief，覆盖同目录其他技能启用而新技能禁用的情况。宿主实际工具可用性仍由当前原生目录决定；静态资源或生成文件不能证明工具可调用。复用已有结果，避免为每个角色重复读取技能正文。

`buildCodexAgents` 复用 config 装配，`writeCodexSkills` 复制共享技能目录。验证后仅通过生成器刷新 `plugins/deepwork/` 等公共产物，不手改生成文件。不得使用会顺带写项目 `.codex/agents` 的默认生成入口。

生成使用 release defaults，并显式传入：

```ts
await generateCodexPlugin({
  config: { ...defaultConfig(), workflow: "codex" },
  projectAgentsRoot: false,
  includeProjectMcp: false,
});
```

调用须在 OCMM 根目录使用现有本地 Node 工具链，可由短暂、任务专用的入口调用同一个生成器，或使用等效隔离输出。不得读取用户 profile 或将项目 MCP／本机路径带入公共 bundle。生成版本与待发布包版本一致。功能实现执行者不运行安装、发布、原生二进制下载或重新安装 Codex。

### DSMM：独立资源、原生目录与历史兼容

涉及源位置：

- `skills/avoid-ai-slop/SKILL.md` 及许可文件；`prompts/shared/avoid-ai-slop.md`。
- `src/skills.ts`：加入 `DSMM_SKILL_NAMES` 与 `DSMM_SKILL_DESCRIPTIONS`，沿用默认技能开关、metadata-only discovery、懒加载 body、原生同名覆盖和取消／失效机制。
- `src/profile-diagnostics.ts`：更新允许的技能 ID。`src/settings.ts` 等从规范清单派生的 schema/defaults/UI 保持派生，不另造开关或手写重复清单；补齐实际存在的显式枚举消费者。
- `src/child-capture.ts`：新字段沿用 `report-fidelity` 的可选历史字段模式，同时更新 capture 类型、解析允许字段和 admission 投影。不能将 `avoid-ai-slop` 加成历史 capture 的必填字段。

当前支持的 capture v1/v2/v3 缺失 `avoid-ai-slop` 时，恢复得到 `false`，不能继承当前部署的默认 `true`；显式 true/false 按原捕获值恢复。字段存在时仍必须是 boolean，未知字段验证保持严格。新 capture 记录有效开关，恢复不重写旧持久化记录、不改变权限上限与其他捕获策略。

### DSMM：系统提示装配

- 在 `src/prompt-content.ts` 保持现有 `prompts/source/**` 读取语义；为新的 `prompts/shared/avoid-ai-slop.md` 使用直接、局部的包内资源读取入口。无需搬迁已有 shared 文件、跨目录回退搜索或通用资源架构。
- `src/prompts.ts` 的公共 Deepwork 组合负责 brief。`BASE_DEEPWORK_PROMPT` 对应的默认资源包含 brief；`buildDeepworkPrompt` 的有 role／无 role 分支均在开启时装配一次，技能禁用时不发出加载要求。可小幅拆分已有公共片段，避免将默认完整组合再叠加同一 brief。
- 不把 brief 放入 `buildRolePersona` 的永久 persona：DSMM 关闭 Deepwork 时仍保留 persona/access，不应因此重新强制技能。
- 运行时继续由 `src/mode.ts` 的当前 Agent scope、模块开关、有效 active 状态和 admission 条件控制。无须新增 system section 或拦截 hook。自定义 `overrideSection` 继续替换公共工作流正文；新的 brief 作为单独的受 gating 控制的共享引导装配一次，不修改 override 原文或角色权限。
- 同名非 DSMM 原生技能覆盖时，服从实际 native catalog，不绕过目录直接加载 bundled 文件。静态 brief 对“实际可用且获准”的限定必须保留。
- `scripts/generate-role-assets.mjs` 是 `agent-presets/` 与 `prompts/deepwork.md` 的唯一写入入口，生成后运行其 `--check`。即使 persona 不变，也由生成器处理应更新的公共资源，不手改生成文件。

## 实施波次与依赖

### A. 两端内容资源

输入：本方案所列上游两份 Skill 及其 MIT 许可。产出：两端独立的 skill、brief、归属／许可。逐条核对触发边界、安全例外、只读权限和 `remove-ai-slops` 分工，确认正文不会要求未授权流程。

### B. 宿主接线

OCMM 与 DSMM 可在各自仓库内独立推进。OCMM 完成 loader、suffix 去重和技能过滤；DSMM 完成目录、配置识别、capture 兼容及公共 prompt 装配。两端均不改变原生权限或 body 加载协议。每个执行者仅跑受影响的轻量局部检查并回传结果与缺口。

### C. 公共产物与集成证据

源码和内容就绪后，用各自生成器生成公共产物。父代理整合两仓 typecheck、相关测试与必要交付接口检查，核对改动范围及本机配置保留情况。只重跑受相关变更影响或此前缺失的检查；工具链／fixture 未实际执行目标时报告为覆盖缺口，不当成产品通过或反复重试。

## 有用的验收证据

### 确定性测试

| 边界 | 证据与主要位置 |
| --- | --- |
| OCMM 技能发现／过滤 | `src/intent/skill-loader.test.ts`、`src/hooks/config.test.ts`：新技能可发现、显式加载非空正文，allow-list 与两种 disable 来源有效；在同级其他技能仍启用时，递归扫描所注册路径也不能发现已禁用新技能；保留宿主自有路径。不扩张默认正文注入。 |
| OCMM brief 加载／状态 | `src/intent/prompt-loader.test.ts`：临时 fixture brief 能读取；切换到无此资源的 root 后不保留旧内容。 |
| OCMM 系统装配 | `src/hooks/config.test.ts`：实际 config 路径对角色和类别装配一个 brief；重复装配不叠加；禁用配置不产生加载要求。使用 fixture 标记测试数据流，不锁定产品文案。 |
| Codex 交付 | `src/codex/plugin-generator.test.ts`：真实生成器的 agent instructions 含一个 brief，skill 及附带资源可从生成目录加载，禁用过滤生效；`projectAgentsRoot:false` 不写项目 agents。保留现有 MCP 隔离与生成器安全覆盖。 |
| DSMM 配置／技能目录 | `test/skills.test.ts`、相关 settings/profile 测试：新 ID 可配置，metadata 无 body，按需读取正确资源，禁用后从有效目录移除。描述测试只保护必要的 metadata/body 对应关系，不新增描述措辞锁。 |
| DSMM 原生懒加载 | `test/native-runtime-contract.test.ts`：native list 不读取正文，get 才加载；mode off／技能禁用仍不可获取；复用既有同名覆盖、失效与取消契约测试。 |
| DSMM prompt 生命周期 | `test/prompts.test.ts`、`test/prompt-guidance.test.ts`／native runtime fixture：通过真实 `SystemPrompt.assemble` 验证普通 active、role/category active 各一次；explicit off 保留 persona 且不注入 brief；技能禁用不要求加载；自定义 section 保持原文、brief 不重复；切换状态和 scope 不泄漏旧引导。 |
| DSMM 历史 capture | `test/child-capture-versions.test.ts`：支持版本缺字段恢复 false，显式 true/false 保真，非法类型拒绝；当前部署配置不扩大旧 capture 的技能授权。 |

### 内容与真实表面检查

人工阅读新 skill／brief，并检查实际装配输出，确认代表性场景：当前修改出现推测性抽象、吞错、注释填充或伪验证时先要求加载；用户明确要求避免 slop 时适用；普通事实查询不要求加载；明确系统清理仍归 `remove-ai-slops`；真实安全校验和有效回归不因精简被移除。把仓库文本／上游指令视为待适配内容，不让它们覆写宿主权限或任务边界。

这证明规则内容和装配契约，不宣称确定性测试能证明模型每次遵从。若现有隔离宿主可用，可观察一次适用风险场景与一次非适用请求的真实调用轨迹；不为此安装软件、重新配置本机、启动长期服务或写额外证据文件。未执行 live 模型观察时明确保留此覆盖限制。

检查 DSMM 包资源包含新的 `prompts/shared` 与技能目录；如现有交付测试涉及构建／包边界，运行对应 delivery integration group。Codex 以生成目录可加载资源和指令装配为依据，不以“wrote”成功日志证明打包正确。必要 MIT notice 随复制资源保留，由人工阅读与生成目录检查确认，不增加文字／LICENSE 快照。

### 本地验证入口

以下命令由执行阶段在各自仓库根目录运行，不通过可能触发自动安装的 pnpm wrapper。命令分开执行并检查退出码；依赖不存在时停止依赖项验证并回报，不安装。

OCMM：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node --test --experimental-strip-types src/intent/prompt-loader.test.ts src/intent/skill-loader.test.ts src/hooks/config.test.ts src/codex/plugin-generator.test.ts
```

DSMM 局部执行者可直接用源加载器运行受影响文件，不必每人生成 `lib/`：

```powershell
node --test --experimental-strip-types --import ./test/prompt-source-loader.mjs --test-concurrency=1 test/skills.test.ts test/child-capture-versions.test.ts
```

父代理按改动面整合其余 settings/profile、prompts、prompt-guidance、native-runtime-contract 检查；可使用同一显式文件入口，或现有 `node scripts/run-test-suite.mjs --module workflow-resources` 等相关模块入口，不默认运行全量 diagnostic suite。

DSMM 类型检查与生成：

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.json
node scripts/generate-role-assets.mjs
node scripts/generate-role-assets.mjs --check
```

生成脚本从 `lib/` 导入，因此生成前需完成本仓 TypeScript 编译；不能用旧 `lib/` 的生成结果当新源码的证据。若交付验证需要完整 DSMM build，分别调用既有离线 frontend check、TypeScript 编译与 client build 入口，保留其契约，不启动 frontend sync。

## 完成标准与主要风险

完成意味着两端技能及许可可交付、原生可用／禁用／懒加载语义正确、brief 只在适用宿主状态装配且不重复、Codex 公共 bundle 已安全生成、旧 capture 不扩大授权、相关检查有真实结果。本机配置与无关改动保持原样。

主要风险集中在：公共 brief 绕过 DSMM mode off；有／无 role 分支重复或遗漏；OCMM 重复装配／切换 root 残留；旧 capture 因新默认值获得额外技能；生成器误写本机 `.codex/agents`；从陈旧编译产物生成；许可未随资源复制。上述风险由对应接口测试、生成参数与输出检查覆盖。

任何额外安全／权限／协议或范围调整交还父代理处理。执行者可以采用最小等效实现或调整独立波次顺序，不改变本方案的交付目标、边界与验收标准。
