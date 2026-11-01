# OCMM / DSMM 紧凑模型名与系列识别

## 交付目标

两个项目独立识别模型名中明确的家族、系列和版本，使紧凑写法、系列前置及省略家族的写法与既有规范名称具有相同语义：

- `gpt6.1sol` → GPT / Sol / 6.1。
- `opus4.7`、`opus-4-7` → Claude / Opus / 4.7。
- `sonnet4.6` → Claude / Sonnet / 4.6。
- `sol6.1`、`6.1sol` → GPT / Sol / 6.1。
- 相同语法覆盖 Claude 的 Opus、Sonnet、Haiku，以及 GPT 的 Sol、Terra、Astra、Luna；保持既有能力门槛和提示适用范围。
- 无显式家族或系列的纯数字 `4.7` 不提供家族证据，模型名识别为 unknown；不据版本猜测厂商或家族。

本交付的兼容基线是当前工作树及 `docs/superpowers/plans/2026-11-01-model-name-recognition.md` 中已确定的名称、路由和能力边界。旧计划保持原样。

## 范围与接口约束

- 根项目与 `dsmm/` 分别维护本地源码、测试和构建输入，不导入对方实现、fixture 或类型，不引入共享依赖。
- 保持公开函数签名、family 枚举、package exports、状态字段及协议；内部 recognition 事实可补充系列、确定版本、版本段数及解析所需的位置。DSMM 不新增对外版本字段或 GPT effort 策略。
- 所有现有未提交源码和测试改动是实施起点，保留其中有效行为与无关改动。不得 reset、覆盖还原或用 HEAD 文件替换当前文件。
- 不触碰 `dsmm/docs/roadmap.md`、`dsmm/docs/dsh-next-adaptation-draft.md`；不修改 prompt 正文、generated bundle、生成角色资源、skills、依赖、版本或配置 schema。不安装软件，不执行 Git 写入或发布。
- 名称解释不改写原始 model、provider、route、catalog key 或 fallback。用户显式配置继续权威。DSMM native DSH 保持 route、effort、Host admission 和权限所有权。

## 实现落点

| 项目 | 识别入口与内部事实 | 现有消费接口 |
| --- | --- | --- |
| OCMM | `src/intent/model-family.ts` 的 `recognizeModelName` 已提供 kind、version、versionParts、generation、lane、codex、mini、opus 等事实；扩展局部语法并补齐 Claude 系列事实 | 同文件的 classifier、版本和型号 helper；`src/intent/prompt-loader.ts`；`src/hooks/model-temperature-capability.ts`；`src/routing/variant-translator.ts`；`src/routing/model-upgrades.ts` |
| DSMM | `dsmm/src/model-family.ts` 的 `recognizeModelName` 已提供 identifier、family、opus5、gemini4；补齐本地系列与确定版本事实，现有布尔投影由这些事实派生 | `dsmm/src/prompts.ts` 的 `promptModelVariants` / `roleModelCalibration`；`dsmm/src/status.ts` 的 `createDsmmStatusSnapshot` |

各项目内部保留其现有返回空值习惯及消费者投影。OCMM `lane` 专指 GPT 四个既有系列；Claude 系列可以用小型内部联合类型表达，不能将 Sonnet/Haiku 投影为 Opus。DSMM 可使用本地 `series`、`version`、`versionParts` 等必要事实，不需要移植 OCMM 的能力表。内部字段名由各项目实施者依据现有结构确定，不形成跨项目 API。

## 名称解释契约

### 1. 有限语法与边界

在完整 model 字段的局部大小写无关视图上解析，保留字符位置和数字分隔符信息。沿用现有词段包装与 `-`、`_`、`.`、空白、模型区域内 `/` 的分隔语义，以及现有 `@` / `:` 后缀处理；不得先删去全部标点再猜版本。

新增语法只使用已有家族词和上述七个精确系列词：

| 结构 | 支持示例 | 约束 |
| --- | --- | --- |
| GPT 家族 + 数字版本 + 可选系列 | `gpt6.1sol`、`gpt6.1-sol`、`gpt-6.1sol`、`chatgpt6.1sol`、`gpt6.1` | 家族和数字、数字和系列可紧邻；不把其他字母后缀当纯数字版本 |
| 家族 + 系列 + 版本 | `claude-opus4.7`、`claude-sonnet-4-6`、`gpt-sol6.1`、`gpt-sol-6-1` | 家族与前置系列沿用词段边界；系列必须属于该家族 |
| 系列 + 版本 | `opus4.7`、`haiku-4-5`、`sol6.1`、`terra-6-2` | 精确系列词直接提供家族证据，版本起点紧接系列或其分隔符 |
| 版本 + 系列 | `6.1sol`、`6-1-sol`、`6/astra`、`4.7opus` | 从完整数字序列起点识别，必须紧邻一个精确系列词；纯数字不构成标识 |

系列前后顺序对七个系列使用相同规则；显式 family 与系列一致时共享这一局部语法。系列前置的 familyless 新入口要求相邻数字版本起点，不将无版本的普通包装词扩大成新家族别名。数字前置入口要求完整数字版本与精确系列词；不得从词中间或坏数字尾部重新起步。

系列词匹配完整边界；`solar`、`solstice`、`astral`、`lunar`、`sonnetish` 不等于系列词。只允许已声明的数字/系列连接，不把任何字母数字交界都拆成有效模型词。`notgpt6.1sol`、`xsol6.1` 不能从内部命中。

保留其他家族的既有语法和别名。此交付不为 GLM、Gemini、DeepSeek 等另行推广新的 compact 版本语法，不新增家族、provider hint 或任意英文词推断。`deepseek-v41` 仍只证明 DeepSeek，不能解释成 4.1。

### 2. leftmost 与属性归属

采用小型局部匹配和明确的 span 归属即可，不需要 parser 框架、配置化规则引擎或逐例黑名单。最终行为须满足：

1. 在模型区域中按字符位置选择最左有效标识，既有显式 family、familyless 系列和数字前置系列使用同一顺序。`6.1sol-gemini-4` 的 GPT 标识从 `6` 开始，不能按 `sol` 的位置排序，也不能从 minor `1` 开始识别。
2. 显式 family 的本地合法结构拥有其紧邻版本和同族系列。`gpt6.1sol`、`gpt-sol6.1`、`claude-opus4.7` 各是一个标识，内部系列不能反过来截断自己的 family。已消费的数字、系列位置不能同时成为另一独立候选。
3. 数字前置匹配不允许借用前一个标识已经消费的版本、截取连续数字序列的尾段或跨过普通后缀回填版本。进入 suffix 后，本标识的版本解析结束。
4. 后续独立 familyless 标识和显式 family 一样终止属性范围，包括同族重复出现。`gpt-5.5-sol6.1` 的 `sol6.1` 自带新版本，是后续独立标识；前一个 GPT 保持 5.5，不能取得 Sol 或 6.1 能力。分隔形式 `gpt-5.5-sol-6.1` 同样不能借用后一个版本。`gpt-6.1-sol` 的 Sol 没有另带新版本，是当前 GPT 的系列。
5. `gpt4o` 等仅粗分类的 compact 标识仍是有效的最左标识。`gpt4o-6.1sol` 不得跳过它、替换版本或吸收后面的 lane。`gpt-5.5-fast-6.1sol-mini` 中当前版本保持 5.5，后续标识的 mini 不回流。
6. GPT + Codex 保留组合语法：`gpt6.1sol-codex`、`sol6.1-codex` 的输出 family 为 Codex，底层 GPT 版本/系列和 GPT calibration 保持。遇到其他独立标识即停止，`gpt-5.5-opus4.7-codex` 不能获得尾部 Codex。
7. 系列前置名称即使版本后续部分不完整，精确系列词加数字起点仍能提供粗家族并阻止 provider hint 抢占，例如 `opus5.5foo` 是 Claude，确定版本为空；不得因此跳到后面的 GPT。数字前置且未形成完整“版本 + 精确系列”的字符串则不产生新标识。

### 3. 版本安全

- 数字段只接受完整十进制整数，段间使用既有分隔语义；版本为最多三段，缺省 minor/patch 用 0 表示，同时保留实际段数。不得将 `61` 拆成 6.1，也不得将超出可表达范围的连续版本截断后冒充精确版本。
- 精确系列词可以终结相邻数值段，故 `6.1sol` 中的 `1` 是合法 minor；`6.1foo` 中的 `1` 不是完整 minor。`gpt6.1foo`、`gpt-6.1foo-sol`、`sol6.1foo`、`opus5.5foo` 均不得获得精确版本能力，也不能降级为 major-only 的精确能力。
- 非纯 numeric compact 旧名称继续只保留其既有粗家族事实。`gpt4o`、`chatgpt4o` 不产生 `[4, 0, 0]`；后续 `6.1sol` 也不能补全它们。`v41` 不转换为 4.1。
- 完整日期 token 和 context token（例如 `20261101`、`19990101`、`128k`、`1m`、`2m`）终止版本，不进入 major/minor/patch，也不重新开放版本搜索。`sol6.1-128k`、`gpt6.1sol-2m`、`opus5.5-20261101` 保持已有明确版本。
- 不用数字长度限制替代语法。保留 `5.6000`、`5.1.1000` 等既有完整数值含义和精确比较；日期按现有日期形态区别。普通后缀不取消已明确版本。
- OCMM 的粗 `generation` 与确定 `version` 继续区分：既有 `gpt-5.1foo` 的 GPT-5 temperature 禁止仍有效；不完整版本不能获得 native max、Sol 6.1+ 或 Opus 精确 calibration。消费者不能以 generation 代替其原本需要的确定版本。

### 4. 路由、provider 和消费者

- 无上下文字符串 helper 扫描完整模型名。已知 full route 的调用者先按首个 `/` 分离 provider，再交入完整 model；结构化 model 内 slash 不再拆分。OCMM `extractModelName` 导出与既有返回值不变。
- `6.1sol/gemini-4-pro` 作为 bare model 选择 GPT；作为已知 full route 则选择 model 部分的 Gemini。`gateway/6.1sol/gemini-4-pro` 作为 full route 先取出 `gateway`，剩余 model 选择 GPT。
- familyless 系列也是显式模型证据。provider 为 google、anthropic 或 codex 时，`sol6.1` 仍是 GPT；`opus4.7` 仍是 Claude。provider hints 仅在模型无有效标识时按各项目已有规则 fallback，不提供版本或系列。纯数字无模型证据，在没有适用 hint 时仍为 unknown；不改变现有 hint 契约。
- OCMM Opus 4.7+ 继续投影为 `claude-opus-47-plus`，DSMM 保持 `claude`。Sonnet/Haiku 即使数字相同也不获得 Opus 能力。仅 Opus 5 或精确 5.5 使用既有 orchestrator 专用层；5.0、5.50、50 不因此获得该层。
- OCMM Sol 6.1+ 保持 low–max、minimal/off → low、none/auto 和显式配置语义；精确 GPT-6 helper 与 6.1+ helper 保持区分。native max 仍是 GPT 5.6+ 或 major 6+。Terra/Astra/Luna 复用既有各自策略，不新增能力门槛。
- Temperature 显式 metadata 继续优先，仅扩展现有名字规则到同义写法。GPT-6/Sonnet/Haiku 不凭识别成功新增禁用规则。
- prompt base、additive、category 共享同一识别结果，保持 planner persona、orchestrator-only Opus、Codex + GPT、carry-ahead、层顺序和去重；不修改提示正文。
- Catalog 的 baseline 和 candidate 同时理解新写法。保留已声明 lane、同 lane 不降级、最低版本、Astra bridge、legacy role-map、Oracle exact fallback、非 GPT head 优先级、允许 provider、原 key 排序、baselineIndex、controls 及 fallback 顺序。仅返回真实 `${provider}/${originalModelKey}`，不得生成标准化 key 或扩大搜索范围。

## 实施任务与依赖

### A. OCMM：识别事实贯通能力与 catalog

此任务可以独立完成，无需等待 DSMM。

1. 在 `src/intent/model-family.ts` 扩展本地语法与 span 归属；保持所有既有家族入口，提供七个系列的正确语义。现有 helper 统一从 recognition 投影，避免每个 helper 增加别名正则。
2. 确认 `src/routing/model-upgrades.ts` 的 `parseGptLane`、`parseGptVersion` baseline/candidate 路径均直接得到新事实。只有实际需要时才调整消费者；不增加第二套解析。
3. 检查 `src/intent/prompt-loader.ts`、`src/hooks/model-temperature-capability.ts`、`src/routing/variant-translator.ts`。重点保持 generation/确定版本区别、Opus 系列限制及 Sol 的 actual reasoning 输出。
4. 在下列现有测试文件补充受影响行为：
   - `src/intent/model-family.test.ts`：目标名称、七系列的语法类别、leftmost/截断、混合分隔、partial 数字及相邻词安全。
   - `src/routing/variant-translator.test.ts`、`src/hooks/model-temperature-capability.test.ts`：实际 capability/effort 输出与 metadata 优先级。
   - `src/routing/model-upgrades.test.ts`：紧凑和 familyless baseline/candidate、真实原始 key、索引和 controls，以及歧义版本不能成为 successor。
   - `src/intent/prompt-loader.test.ts`、`src/intent/planning-policy-contract.test.ts`：用现有 marker fixture 验证 selector 和真实 config 组装，覆盖 full-route/bare-model 差异及显式配置权威性。
5. `src/hooks/config.ts` 已区分 selected full route 与 requirement model；`src/routing/effective-route.ts` 保持首 slash 拆分及 materialization。优先通过已有 fixture 验证；无接线缺口则不改源码。现有 `src/hooks/config.test.ts` 的有效预期及他人改动保留。

完成证据：新名称从 recognition、family、prompt 到 reasoning/temperature/catalog 解释一致，catalog 真实 key 和显式路由保持不变。

### B. DSMM：本地识别贯通 prompt 与 status

此任务与 A 无共享输入和实现依赖，可并行；不引入 OCMM 的 routing policy。

1. 在 `dsmm/src/model-family.ts` 实现相同有限语法、leftmost 和版本安全，补齐系列/版本事实，并从中派生现有 `opus5`、`gemini4`。保留 optional classifier 输入、已有 hints 及粗 family 枚举。
2. `dsmm/src/prompts.ts` 继续消费本地 recognition；仅在必要时最小调整 selector，不更改内嵌 activation 正文。Sonnet/Haiku 不因 Claude 家族被当作 Opus。
3. 在 `dsmm/test/model-family.test.ts` 验证内部系列与版本，而不只断言粗分类；在 `dsmm/test/prompt-model-selection.test.ts` 使用现有 marker fixture 覆盖系列选层、partial 版本拒绝及 Codex 组合。
4. 在 `dsmm/test/status.test.ts` 验证 familyless model 的实际 request header 优先于 stale agent options，snapshot 保留原始 provider/model/currentReasoningEffort，不附加路由事件。`buildDeepworkPrompt` 对冻结 route 保持只读。
5. `dsmm/src/status.ts` 的分类接线通常无需修改；保留缺失/无效实际 header 不从旧 options 恢复能力的契约。不修改 native route recovery、权限、Host admission 或角色生成器。

完成证据：本地 recognition 可证明版本/系列，prompt marker 与 status family 一致，native route/effort 原样保留。

## 关键验收断言

语法在 parser 层覆盖，消费者只覆盖各自真实风险；不对所有分隔符、系列和 consumer 做笛卡尔积。

| 输入/接口 | 必须观察到的行为 |
| --- | --- |
| `gpt6.1sol`、`gpt-sol6.1`、`sol6.1`、`6.1sol` | GPT / Sol / `[6,1,0]`；OCMM native max 为真、low 保持 low、minimal/off 到 low |
| `opus4.7`、`opus-4-7`、`claude-opus4.7` | Claude / Opus / `[4,7,0]`；OCMM Opus 4.7+ 投影及 temperature 规则；无 Opus 5 prompt |
| `sonnet4.6`、`haiku-4-5` | 对应 Claude 系列与版本；普通 Claude 能力，不含 Opus-only 层 |
| `terra6.2`、`6astra`、`luna-6` | 对应 GPT lane 与版本；复用已有 lane 能力和 catalog 规则 |
| `auto/SOL_6_1`、`Group/6.2Sol-128k` | 大小写、包装和分隔符不改变事实；原文本保留 |
| `6.1sol-opus5`、`opus4.7-gpt6.1sol` | 最左完整标识决定家族和版本，不按 family 优先级覆盖 |
| `gpt-5.5-sol6.1-mini`、`gpt-5.5-fast-6.1sol-mini` | GPT 5.5，无 Sol 6.1+、无尾部 mini、无 native max |
| `gpt4o-6.1sol`、`chatgpt4o` | GPT 粗家族，确定版本为空；不借后续数字获得能力 |
| `gpt6.1sol-codex`、`sol6.1-codex` | Codex family + GPT calibration + 原 GPT 版本/系列 |
| `gpt-5.5-opus4.7-codex` | GPT 5.5，尾部 Codex 不属于当前标识 |
| `gpt6.1foo`、`sol6.1foo`、`opus5.5foo` | 粗家族可保留，确定版本为空；不得获得对应精确能力/专用层 |
| `opus5`、`opus5.5-2m` vs `opus5.0`、`opus5.50`、`opus50` | 前组仅 orchestrator 得到既有 Opus 5 层；后组无该专用层 |
| `4.7`、`6.1`、`xsol6.1`、`6.1solar`，provider 无适用 hint | unknown，不产生 GPT 或 Claude 能力 |
| `deepseek-v41`、既有 Gemini `.1foo` 和 Opus `.5foo` 用例 | 不猜紧凑小数，不丢失现有拒绝精确能力覆盖 |
| `selectCatalogModel`：familyless baseline 与原始 `Group/6.2Sol-128k` candidate | 仅选允许 provider 的真实 key，返回原大小写/slash；同 lane 不降级，materialization 保留 controls/index/fallback |
| 已知 full route 与 bare `6.1sol/gemini-4-pro` | 分别识别 Gemini 与 GPT；显式配置和最终 model 字段保持原值 |
| DSMM actual header `{provider:"google",model:"sol6.1",reasoningEffort:"low"}` | snapshot 为 GPT，原 route/effort 保留，stale options 不覆盖，无写入事件 |

## 验证与交付

### 任务内轻量回归

OCMM 在根目录运行本次修改所覆盖的测试；这些文件共同覆盖识别到真实 config/route 的链路：

```powershell
node --test --experimental-strip-types src/intent/model-family.test.ts src/intent/prompt-loader.test.ts src/intent/planning-policy-contract.test.ts src/routing/model-upgrades.test.ts src/routing/variant-translator.test.ts src/hooks/model-temperature-capability.test.ts
```

DSMM 在 `dsmm/` 运行 source-backed 串行测试，使用已有 loader 避免旧 `lib/` 伪装源码验证：

```powershell
node --test --experimental-strip-types --import ./test/prompt-source-loader.mjs --test-concurrency=1 test/model-family.test.ts test/prompt-model-selection.test.ts test/status.test.ts
```

若实施实际触及其他消费者，只补充相关文件/行为检查。复用有效通过证据，不重复执行未受影响的全套模块、全 TS、Cargo、Host/browser 或 release 检查；不调查、修复或安装与 coding-agent-sessions Python 环境有关的内容。

### 主代理集中检查与真实构建入口

- OCMM：`pnpm run typecheck`、`pnpm run build:ts`。
- DSMM：在自身目录运行 `pnpm run typecheck`、`pnpm run build`；保持离线构建，不生成角色或同步前端资源。
- 构建成功后使用独立 Node 进程、无 source loader，直接 import OCMM 的 `dist/intent/model-family.js`、`dist/routing/variant-translator.js`、`dist/routing/model-upgrades.js`，验证代表性新名称、一个坏版本拒绝、实际 effort 输出及 catalog 原始 key；与 source-backed 断言一致。
- DSMM 直接 import `lib/model-family.js`、`lib/prompts.js`、`lib/status.js`，通过实际 selector/status 入口验证新名称和只读 native route。复用测试中的最小 Agent 形状；不启动真实会话或发网络模型请求。不要把加载 source loader 的测试声称为 built 验证。
- 真实 prompt/config 组装以现有合成 marker seam 验证选层；built probe 可验证 selector 返回值和实际对象字段，不用提示正文字符串锁证明行为。探针断言失败必须导致非零退出，成功日志不代替断言。
- 输出记录实际检查结果及未覆盖接口。工具链、fixture 或 loader 未执行到产品接口时归为验证阻塞，相关验收保持未完成；独立项目可继续。仅清理本任务创建的临时探针资源，不触碰现有工作区改动和用户会话。

完成条件是两个独立实现均满足已确认名称语义，能力与 catalog 不从错误版本提权，原始 route 与显式配置保持，并具备受影响 source 回归、集中类型/构建及 built 入口行为证据。无需新增公共协议、任意 family 推断或额外用户决策；若实施发现必须跨越这些边界，交回主代理裁定。
