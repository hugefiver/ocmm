# OCMM / DSMM 模型名称识别

## 交付目标与边界

两个项目分别实现一致的模型名称解释规则：在模型名中从左向右选择第一个有效模型标识，再识别属于它的代数、版本和变体。大小写、包装前后缀和分隔符差异不应造成家族、提示、能力判断之间的分歧。识别只产生语义信息，provider/model 原始身份继续用于请求、catalog 查询、配置和状态展示。

- OCMM 覆盖家族、模型专用 helper、提示选择、reasoning/temperature 能力判断和既有 catalog successor 机制。
- DSMM 覆盖家族、提示层选择及状态中的家族投影；保持 native DSH 的路由、effort 和权限所有权。
- 两项目独立维护实现和测试。DSMM 不导入父项目源码、fixture 或构建输入，不引入共享包、外部依赖、配置字段或新协议。
- 保持现有公开函数签名、家族枚举和状态协议。OCMM 的 `extractModelName` 导出及其既有返回行为保留；内部识别不必经过这个有损提取器。
- 不修改模型能力门槛、角色到 lane 的策略、用户配置优先级或 provider 可用范围；不根据识别结果重写名字、创造 catalog 条目或主动重路由。
- 不修改 `prompts/v1/**`、`skills/v1/**`、模型提示正文、DSMM 生成角色资源或生成的 Codex bundle；不新增版本、发布、安装或 Git 写入步骤。

## 实现落点与接口

### OCMM

- `src/intent/model-family.ts`：放置项目内的纯名称识别逻辑；现有 `classifyModelFamily`、`parseGptVersion` 和各 `is…Model` helper 从同一个有效标识派生判断。小型内部识别结果只携带消费者需要的家族/标识类型、确定版本、变体及必要匹配范围，不建立可配置解析框架。
- `src/intent/prompt-loader.ts`：基础 workflow variant、additive calibration 和 category calibration 使用一致的模型归属；保留 planner 身份、orchestrator 专用 Opus 层以及 carry-ahead 规则。
- `src/hooks/config.ts`：在已知 selected full route 的 agent/category prompt 组装处先按既有契约分离 provider；保留 requirement 中本来就是模型名的分支。向 prompt selector 传递完整模型区域，不把两类输入合并后再猜边界。
- `src/routing/model-upgrades.ts`：版本和 lane 解释复用本项目识别逻辑，消除与 `model-family.ts` 独立解析 GPT 版本的差异。保留 `selectCatalogModel`、`matchRequirementSuccessorWithIndex`、`matchRequirementSuccessor` 的接口。
- `src/hooks/model-temperature-capability.ts`：模型启发式基于选中的标识；保留显式 `supportsTemperature` 优先级和现有 reasoning suffix 处理。
- `src/routing/variant-translator.ts`：消费修正后的 helper；无需为别名增加第二套能力表。
- `src/routing/effective-route.ts` 的现有首个 `/` 路由拆分、原始 identity 和 fallback materialization 是集成边界。仅在连接识别上下文确有必要时做最小接线，不改变它的路由策略。

### DSMM

- `dsmm/src/model-family.ts`：维护本地识别实现；`classifyModelFamily({ providerID?, modelID? })` 保持可处理空值，保留 `DsmmModelFamily` 和 package export。
- `dsmm/src/prompts.ts`：移除重复的独立名字解释，使用本地识别事实决定 `promptModelVariants` 和 `roleModelCalibration`。提示规则仍独立于 reasoning-family 映射。
- `dsmm/src/status.ts`：继续由 `createDsmmStatusSnapshot` 对已观测 route 分类。通常无需改动状态构造，只需验证它消费新的 classifier；不得改变 request header、agent options、configured-root 的取值优先级。

各 worker 可以自行选择最小内部 helper 名称和结构。跨项目交接契约是下述行为及测试，不是共用内部 TypeScript 类型。

## 名称解释契约

### 1. 大小写、边界和选择顺序

1. 在识别用的局部视图中忽略大小写和首尾空白；不修改调用方字符串或原对象。
2. 支持 `-`、`_`、`.`、空白和模型区域中的 `/` 作为词段分隔符，允许混用。小数点仍能表达版本，不能先删除所有标点再尝试恢复版本。
3. 家族匹配需要有效词段边界或已支持的紧凑写法，不能仅凭任意 `includes` 命中。`xkimi`、`notgpt`、`kimish`、`codexish` 不是对应标识；`prefix-gpt-6-sol`、`custom.gemini-4-pro` 是有效包装。`not-kimi-k3` 中的 `not-` 只是包装，不是自然语言否定指令。
4. 保留已支持的别名识别，包括 GPT/ChatGPT、Codex、Claude/Fable、Gemini、GLM、DeepSeek、Kimi 及 `k2p5`/`k2-p7` 等。OCMM 的 MiniMax、SWE-2 提示及 o-series temperature 识别仍在各自原有作用域内。
5. 按模型区域的字符位置选择最左有效标识，不按固定家族优先级。一个已识别标识即使只能得到粗家族，也不能跳过它去采用后面版本更完整的家族。
6. 后续独立模型标识终止当前标识的属性范围；不能借用其版本、lane、`mini` 或其他变体。相同家族再次出现也形成新标识边界。
7. `gpt-…-codex` 是例外的组合语法：在当前 GPT 标识内，Codex 是其变体，输出 `codex` 家族并保留 GPT calibration 和该 GPT 的确定版本。`claude-opus-5-gpt-6-codex` 仍由最左 Claude 决定；`gpt-5.5-claude-opus-5-codex` 的尾部 Codex 不属于第一个 GPT。

### 2. Provider、命名空间与 `/`

路由边界由调用点已有上下文确定；识别器只扫描交给它的完整模型区域：

- 结构化 `{ providerID, modelID }` / `{ provider, model }` 中，provider 是独立元数据，model 字段完整进入识别器。即使 model 的开头与 provider 相同，也不自动再剥离一段。provider 名称不能覆盖模型显式标识。
- 调用点确知输入是 full route 时，沿用其既有拆分契约，先分离 provider，再把剩余完整 model 交给识别器。OCMM selected route 按首个 `/` 拆分；不得改用末个 `/`，也不得递归剥除 model 内的 namespace。
- 只有模型名、没有路由上下文时，从左向右扫描整个输入，不猜 provider。无上下文 `gpt-6-sol/gemini-4-pro` 选择 GPT；同一文本若来自已知 full route，则先得到 provider `gpt-6-sol` 和 model `gemini-4-pro`，再选择 Gemini。
- model 区域内的 `/` 与其他分隔符同等处理。`gpt/6.1/sol`、`auto-gpt/6.1/sol`、`gemini/4/pro`、`swe/2/high` 与相应连字符写法一致；不能因为含 slash 自动进入路由拆分。
- `providers/openai/gpt-6-sol`、`amazon-bedrock/us.openai.gpt-6.1-sol`、`gateway/auto/gemini-4-pro` 等非家族包装不影响有效标识选择。点分 vendor/region 不提供能力，也不触发隐藏的 provider 推断。
- `provider-kimi-for-coding/unrelated`、`gemini-4-provider/unrelated`、`swe-2-provider/unrelated` 的 provider 隔离断言放在已知 full-route 调用点：拆分后模型为 `unrelated`，不能加载专用 calibration。相同文本若明确作为无上下文模型名传入，则按词段识别左侧标识；不得为了保留旧测试而猜测 slash 前半段是 provider。
- `extractModelName` 保留原有导出签名和返回行为，其兼容测试继续保留；它不承担新识别器的路由上下文判断。用项目内接口/已解析结果连接消费者，不增加公开配置或改变公开函数签名。

#### 调用点接线与上下文证据

| 调用点 | 已有上下文及要求 |
| --- | --- |
| OCMM `src/hooks/config.ts` 的 `deepworkPromptForAgent`、`promptForBuiltinCategory` | `selectedModel` 来自 `selectRoutePrimary`，使用 host selected route、catalog 的 provider/model 返回值或 `fmtModel` 结果；按既有 selected-route 契约拆分。`deepworkPromptForAgent` 的 `chain[0]?.model` 则已是模型名，应直接扫描。必须在 `selectedModel ?? chain[0]?.model` 混合前保留这个区别。 |
| OCMM `src/routing/effective-route.ts` | `parseSelectedModelIdentity` 已按首个 slash 得到 provider/model，successor 使用完整 `modelID`，不得再剥尾段。 |
| OCMM `src/routing/model-upgrades.ts` | `FallbackEntry.model` 和 provider catalog 的 model keys 是模型区域；provider 来自 `entry.providers` 或 catalog 外层 key，不能把 model key 内 slash 当新 provider。 |
| OCMM `src/hooks/chat-params.ts`、`src/hooks/model-temperature-capability.ts` | runtime 输入已有独立 provider/model；分类及能力识别接收完整 model，不重新拆分。 |
| OCMM `src/codex/plugin-generator.ts` | 已有 `FallbackEntry.providers` / `entry.model`，以及 `codexReasoningEffort` 的 model 参数；沿用模型名语义，验证共享 helper 的影响，不修改生成 bundle。 |
| DSMM `dsmm/src/mode.ts` → `buildDeepworkPrompt` | `routeFromAgent` 从 request header 或 agent options 得到结构化 `{ provider, model }`；`buildDeepworkPrompt` 传入 `roleModelCalibration` 的 `options.route.model` 已是完整模型字段，不再按 slash 剥离。 |
| DSMM `dsmm/src/status.ts` | `selectedRoute` 已有 provider/model，直接分类；继续保持实际 request header 优先级。 |

具体没有路由上下文的入口是直接调用 OCMM `parseGptVersion` / 各单字符串 `is…Model`、`pickModelCalibrationVariants`、`getCategoryModelCalibration`、`pickDeepworkVariantForAgent.preferenceModel`，以及 DSMM `promptModelVariants` / `roleModelCalibration` 的字符串参数。它们的现有签名没有标记字符串来源，单凭参数不能恢复 full-route 边界；按本契约将其作为完整模型名扫描。已知 full-route 调用者负责先拆分，公开签名保持不变。

相应旧单元测试把 full route 直接传入这些 selector/helper 时，并未向函数提供路由上下文。将其 provider 隔离断言迁移到 OCMM `createConfigHandler` 的已知 full-route fixture，或 DSMM `buildDeepworkPrompt` 的结构化 route fixture；parser/selector 层另测同一文本作为模型名时的左至右结果。不得为满足两类相反断言增加字符串启发式、provider 名单猜测或测试专用通道。上述生产调用链已有足够来源信息，实施需要保留或前移使用它，而非新增用户输入。

### 3. 版本和变体归属

- 只在所选标识的模型语法位置提取版本。GPT、GLM、Gemini 的版本跟随家族；Claude 支持既有 `claude-opus-4-7`、`claude-opus-5.5` 等次序；Kimi 保留 `kimi-k2.7`、`kimi-k27` 和已支持的 `k2p7` 等别名解释。
- 数字 token 必须完整匹配，不能把 `1m` 的 `1` 读成 minor/patch，不能把 `4argon` 的 `4` 当作已确定的 Gemini 4 版本。保留相邻名称边界：`solar`、`solstice`、`astral`、`lunar` 不等同于对应 lane。
- 日期、context-window 标记及包装后缀的数字不补齐版本；进入后缀之后不重新寻找代数。`gpt-5-20261101` 不能变为 `[5, 20261101, 0]`，`gpt-5.5-1m` 不能变为 `[5, 5, 1]`，`gpt-5.5-fast-6` 仍是 GPT 5.5。
- `gpt-6.1-sol`、`gpt_6_1_sol`、`gpt 6.1 sol` 的确定版本和 Sol 归属一致。`gpt-6-sol` 的精确 GPT-6 helper 与 `gpt-6.1-sol` 的 6.1+ helper 保持原有适用范围，不能用“同为 major 6”合并它们。
- `mini`、GPT lane/Codex、Claude Opus/Fable 等只从当前标识取值；前缀 `mini-` 或后面别的家族的 `mini` 不改变当前 GPT 的能力。
- 保留 Claude Opus 5/5.5 专用 prompt 与 Opus 4.7+ reasoning-family 的不同范围；5.0、5.50、50 不因包含数字 5 获得 Opus 5/5.5 专用 prompt。普通包装、日期及尾部别名不应取消一个已明确识别的版本；旧测试中仅限制包装写法的断言按新需求更新。
- 对 `deepseek-v41` 只需认出 DeepSeek；不猜为 4.1，不增加能力规则。其他无法唯一拆分的紧凑数字可只保留家族/已确定部分，不虚构 minor/patch。已支持且有明确语义的紧凑别名保持兼容。
- `gemini-40` 不得获得 Gemini 4 calibration；`k2p80` 不得获得 k2p8 calibration；`swe-20` 不得获得 SWE-2 calibration。

### 4. 家族输出、提示和能力

- 两项目在共同支持的模型上选择同一底层标识。保留各项目现有输出粒度：OCMM 的 `claude-opus-47-plus` / `kimi-k27` 与 DSMM 的 `claude` / `kimi` 不必改成同一枚举。
- 识别成功与 reasoning-family 为 `unknown` 是不同事实。SWE-2、仅 prompt 支持的 `k2p8` 等不能因为投影为 `unknown`，再让 provider hint 或后面的 GPT 抢占标识。
- 保持 OCMM `k2p8` 仅获得 Kimi prompt、reasoning-family 仍为 `unknown` 的边界；DSMM 同样保留其已支持家族集合。此任务不将 MiniMax、SWE-2、o-series 等新增到 DSMM 公开枚举。
- Provider hint 仅在没有有效模型标识时应用。保留各项目已经支持的 hint 集合与无模型时的行为，不把一项目的 hint 集合扩展到另一项目。hint 比较忽略大小写；它只能给出已有粗分类，不能证明具体代数、lane 或专用 calibration。
- `providerID: "codex", modelID: "gpt-5.6"` 应为 GPT；真正的 `gpt-5.6-codex` 应为 Codex。DSMM 的 anthropic/zhipu/moonshot 等 hint 同样不得覆盖显式 Gemini、GLM、GPT 等模型。
- 保留 OCMM native max 门槛：GPT 5.6+ 或 major 6+；保留 Sol 6.1+ 的 low–max、`minimal/off` 到 low、`none/auto` 及显式配置语义。未知版本不借尾部数字获得 native max。
- Temperature：保留显式 runtime capability 优先；仅将既有 Codex、GPT-5、o-series、Claude Opus 规则推广到同义名称。GPT-6 等没有既有禁止规则的模型不凭空增加限制。
- 基础 prompt、additive 和 category 层共享标识归属；planner persona、仅 orchestrator 的 Opus 专用层、Codex + GPT 组合、现有层顺序/去重和 carry-ahead 保持。测试使用现有合成 marker seam 验证选层，不锁定提示正文。

### 5. Catalog successor

名称解释在 baseline 与 candidate 两侧一致，路由策略保持：

- GPT 继续使用已声明的 Sol/Terra/Astra/Luna lane、既有最低版本、同 lane 禁止降级、已有 Astra bridge 和 legacy role-map 规则；泛 GPT、相邻 lane 名、其他家族不得被升级规则吸收。
- GLM 继续只从语义上的 GLM 5.1 baseline 采用既有 GLM 5.2+、major 5 successor 规则；包装形式的同一 baseline 也使用相同解释，不扩展到其他 major。
- 所有 candidate 必须来自当前 catalog 的真实 model key 和允许 provider。返回 `${provider}/${originalModelKey}`，保留大小写、空格、slash、前后缀；不能拼造标准化名称去查询或返回。
- 保留 fallbackChain 顺序、baselineIndex、baseline 的 controls、现代链可用非 GPT head 的优先级、Oracle legacy exact fallback 和 provider tie 顺序。版本相等时继续使用现有原始 model key 的确定性排序。
- 用户显式模型和 fallback 配置继续权威；名字识别不授权扩大 catalog 搜索或改变已选路由。

## 验收实例

下表是行为断言，不是对模型是否真实发布的声明。两项目各自在本地测试中覆盖共同规则，不建立跨仓库测试依赖。

| 输入或情形 | 必须观察到的结果 |
| --- | --- |
| `group/glm-5.3-1m` | GLM；suffix 不污染 5.3；OCMM 合法 GLM successor 可使用完整原始 key |
| `auto-deepseek-v41` | DeepSeek；不推断 4.1 |
| `auto-gemini-4-pro`、大小写/下划线/空格变体 | Gemini；Gemini 4 additive |
| `auto-gpt-6.1-sol`、`auto-gpt/6.1/sol` | GPT；确定 6.1 Sol；OCMM native max 为真、low 保持 low |
| `prefix-gpt-5.6-codex-fast` | Codex；GPT calibration；确定 GPT 5.6 能力 |
| `claude-opus-5-gpt-6.1-sol` | Claude；GPT version 为 null，不能加载 GPT calibration |
| `gemini-4-pro-gpt-6-codex` | Gemini 4；尾部 Codex 不覆盖 |
| `gpt-5.5-claude-opus-5-mini` | GPT 5.5，非 mini；不借尾部 Opus/mini 改变能力 |
| `gpt-5.5-gpt-6.1-sol` | 第一个 GPT 5.5；无 Sol 6.1+ 能力，max 仍受原门槛限制 |
| `gpt-5-20261101`、`gpt-5.5-1m`、`gpt-5.5-fast-6` | 版本分别为 5、5.5、5.5；不能误获 native max |
| `auto-claude_opus_5_5-20261101` | Opus 5.5；仅 orchestrator 得到专用 prompt |
| `auto-kimi-k2.7` / `auto-k2p8` | Kimi prompt；各自原有 reasoning-family 粒度保持 |
| `auto-swe/2/high-gpt-6` | SWE-2 prompt；尾部 GPT 不覆盖 |
| `xkimi-k3`、`notgpt-6`、`codexish` | 无对应模型标识；不误触发专用能力 |
| `gemini-40-pro`、`k2p80`、`swe-20` | 无相邻代数的专用 calibration |
| provider 为 `google`，model 为 `auto-gpt-6.1-sol` | GPT，provider 字符串原样保留 |
| provider 为 `codex`，model 为 `gpt-5.6` | GPT；provider 不制造 Codex 变体 |
| provider 为既有 hint，model 为 `custom-model` | 保留本项目已有 fallback；不产生具体版本能力 |
| 无上下文模型名 `gpt-6-sol/gemini-4-pro` | GPT；后面的 Gemini 不提供版本或 calibration |
| 已知 full route `gpt-6-sol/gemini-4-pro` | 先拆成 provider `gpt-6-sol`、model `gemini-4-pro`；选择 Gemini 4，原始 route 保持 |
| provider 为 `gateway`，model 为 `gpt-6-sol/gemini-4-pro` | GPT；model 内 slash 不再拆出 provider |
| 已知 full route `provider-kimi-for-coding/unrelated` | model 为 `unrelated`；不因 provider 加载 Kimi calibration |
| 无上下文模型名 `provider-kimi-for-coding/unrelated` | 识别左侧 Kimi；不猜 provider |

针对上下文差异验证同一字符串在模型名入口与已知 full-route 入口的不同结果，并检查拆分后 model 内的 slash 完整保留。不要为所有分隔符、所有家族、所有 consumer 做笛卡尔积；在 parser 层覆盖语法类别，在 consumer 层覆盖各自可能失效的接口。

## 工作分工与依赖

### Worker A：OCMM 名称解释及所有本项目消费者

**目标：** 分类、prompt、版本能力及 successor 对同一个名字作一致解释，同时保留原始路由。

1. 在 `src/intent/model-family.ts` 建立单一标识选择与属性归属；保留 `extractModelName` 返回行为，更新各 helper。
2. 在 `src/hooks/config.ts` 的 agent/category prompt 调用点分离已知 full route，保留 bare requirement model 分支；接入 prompt、temperature 和 translator 消费者，处理 prompt-only 标识与 reasoning-family 的区别。单字符串 helper 不再推断 provider。
3. 将 `model-upgrades.ts` 的 GPT/GLM 版本及 lane 识别接到同一语义；在 catalog/requirement 输入处保留原始字符串与明确名字上下文。
4. 更新以下测试中的 prefix rejection、固定 family priority 和 provider override 旧预期；保留真实数值边界、能力门槛、显式 metadata 与路由权威性测试：
   - `src/intent/model-family.test.ts`
   - `src/intent/prompt-loader.test.ts`
   - `src/intent/planning-policy-contract.test.ts`
   - `src/routing/model-upgrades.test.ts`
   - `src/routing/variant-translator.test.ts`
   - `src/hooks/model-temperature-capability.test.ts`
5. 在现有 `createConfigHandler` / `materializeSelectedPrimary` / `resolveModelRouting` fixture 中验证完整 alias key 的选择、baseline controls 和最终 prompt；显式用户 alias 在存在更高 catalog candidate 时仍不被替换。将 provider-only prompt 隔离断言放在 `planning-policy-contract.test.ts` 的真实 config 组装 seam，并与模型名 selector 的 slash 扫描断言配对。

版本/能力和 successor 接入依赖本地识别契约稳定。Worker A 可按本计划完整实施，无需等待 DSMM 实现。

### Worker B：DSMM 本地识别、提示和状态

**目标：** 本地 classifier、prompt 选择和 status 对已观测模型一致解释，完全保留 native route。

1. 在 `dsmm/src/model-family.ts` 实现同一词段/位置/归属规则；保留 DSMM 的粗家族投影、optional 输入和已有 provider hints。
2. `dsmm/src/prompts.ts` 消费本地识别结果；消除 `modelName`、`includes`、prefix regex 各自决定家族的分歧。category family 与 base/additive 选择共同遵循最左标识，保留原有 category 层范围。
3. 在 `dsmm/test/model-family.test.ts`、`dsmm/test/prompt-model-selection.test.ts`、`dsmm/test/status.test.ts` 覆盖上表相关行为。
4. 通过现有 marker fixture 检查 planner、orchestrator、category 的组合顺序与去重；通过冻结 route 验证 `buildDeepworkPrompt` 不修改 provider/model/effort。将 provider 隔离用例改为 `{ provider: "provider-kimi-for-coding", model: "unrelated" }` 等结构化 fixture，保留其隔离断言；单字符串 `promptModelVariants` 则按完整模型名覆盖 slash 和最左标识。
5. 用真实 `createDsmmStatusSnapshot` 配合现有 Agent fixture 验证新的分类及原始 route；request header 仍完整优先于 stale options，缺失/无效实际 route 不从旧名字恢复能力。

只修改 DSMM 自身源文件和必要测试，不修改路由恢复、Host admission、权限或角色生成器。

### 主代理：集成与最终证据

两位 worker 分别汇报修改范围、实际检查结果、未覆盖接口和阻塞。主代理合并相关回归验证，重点核对 full-route 边界接线与原始 model 字段保留；相同规则的两份独立实现通过共同的行为实例对齐，无需共享源码或通用框架。

## 验证安排

本计划阶段只读取源码与测试，不运行产品测试或生成构建输出。实施检查使用现有工具链，不安装依赖。

### Worker 本地轻量检查

OCMM 在仓库根运行受影响测试，按实际修改选择文件；完成相应修改后可一次执行：

```powershell
node --test --experimental-strip-types src/intent/model-family.test.ts src/intent/prompt-loader.test.ts src/intent/planning-policy-contract.test.ts src/routing/model-upgrades.test.ts src/routing/variant-translator.test.ts src/hooks/model-temperature-capability.test.ts
```

DSMM 在 `dsmm/` 运行串行、source-backed 的直接测试。现有 loader 将 `lib/*.js` import 映射到当前源码，因此本地检查不依赖旧 `lib/` 构建：

```powershell
node --test --experimental-strip-types --import ./test/prompt-source-loader.mjs --test-concurrency=1 test/model-family.test.ts test/prompt-model-selection.test.ts test/status.test.ts
```

### 主代理合并检查

- 两项目分别运行 `pnpm run typecheck`。
- OCMM 合并运行 `pnpm run test:ts` 与 `pnpm run build:ts`，覆盖共享 helper 对其他 routing/config 消费者的影响；本任务不触及 Rust，不因 TypeScript 名称识别变化默认追加 Cargo/LSP 检查。
- DSMM 按 `AGENTS.md` 使用相关模块：`pnpm run test:module -- routing-model workflow-resources config-profiles`，并运行本项目 `pnpm run build`。不使用全诊断测试替代相关模块，不把仅 smoke 的 `pnpm test` 当作完整覆盖。
- 产品表面证据来自 OCMM 实际 config/route/prompt 组装函数和 DSMM 实际 prompt/status 函数，使用确定性 fixture。测试成功不代表外部 provider 接受某个人工 alias；本次无需联网调用模型。
- 重用仍覆盖最终输入的 worker 通过证据，新增或重跑受接口变化影响的检查；不因两个工作区并行变化重复运行无关检查。
- 模块缺失、loader、frontend 物料或工具链失败应明确报告为环境/测试装置阻塞；未执行到产品接口的检查不能计为通过。保留未解决的验收缺口，独立部分可继续完成。

## 主要风险与完成条件

- **路由上下文丢失：** 已知 full route 在调用边界拆分；结构化 model 和无上下文模型名完整扫描。尤其避免 config 中合并 selected route 与 bare requirement model 后才猜来源，也避免单字符串 helper 再取最后一个 slash 段。
- **能力误提升：** 日期、`1m`、后缀数字、后续家族不能污染版本；验证实际 reasoning/temperature 输出，不能只验证粗分类。
- **识别造成隐式重路由：** catalog 只返回真实原始 key；fallback 索引、controls、provider tie 和显式配置均有行为断言。
- **Prompt 与 family 粒度不同：** SWE-2、Kimi alias、Codex + GPT 必须有独立的投影检查；不因为共享识别而扩大能力或公开枚举。
- **工作区与产物污染：** 实施者保护届时已有改动；构建仅产生常规忽略输出。只清理本次 fixture 创建的临时目录，不触碰用户配置、当前会话、其他项目或生成 bundle。

完成时，两个项目的受影响入口均遵守本计划的最左标识和属性归属，原始 route 保持，相关测试、类型检查和构建证据齐备；full-route 隔离、完整 model 内 slash 和无上下文左至右扫描均通过实际调用边界测试。未完成接口或受阻检查在交付中明确列出。
