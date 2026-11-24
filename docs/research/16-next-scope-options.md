# 下一轮实现范围决策建议 · dsh-session-status-marker

> **文档版本**：v1.0.0 · 最后更新 2026-11-24
> **输入**：`.drafts/reviews/` 下六份只读调研（`features-plan.md`、`inv-config.md`、`inv-host-events.md`、`inv-practice.md`、`inv-usage.md`、`inv-bulk-marking.md`）。
> **读者**：在 1.3.0 发布后决定下一轮实现范围的用户本人；每条结论都附证据位置，可直接跳回原始调研核对。
> **决策动作**：在第 4 节给出的方案 A / B / C 三个预设组合里挑一个，或按全景表自行重组。

/**
 * 用途：把六份功能调研压缩成一份可以直接拍板的决策输入，列出七个候选项的工作量、风险、依赖与优先级建议。
 * 读者：1.3.0 发布之后选择下一轮实现范围的用户，以及需要按方案拆派发单的主会话。
 * 决策动作：从第 4 节的方案 A / B / C 中挑一组，或按第 2 节全景表自行重组候选，再按第 5 节的验收点逐条验收。
 */

---

## 1. 背景与范围

1.3.0（本轮已交付，等待用户前端验收后转正）包含手动会话备注编辑、智能体标记来源、设置页会话状态看板、四项前端缺陷修复（复制误触、编辑期焦点漂移、看板「加载中」、轮询健壮化）以及 DSH 0.2.3-alpha 兼容。本文件汇总的是 1.3.0 交付之外、六份调研里已经论证过的候选项，按产品线分成五组：

- **显示与配置**：会话备注显示开关（O1）与四个运行/配置开关（O3）。
- **AI 主动标记**：提高模型主动调用 `set_session_status` 的命中率（O5）。
- **新标记规则**：子代理运行中、轮结束、目标完成、会话报错四条新推断规则（O4）。
- **批量打标**：一键批量分析并写入标记 + 专用打标模型配置（O6）。
- **读取工具与运营**：`get_session_status` 读取工具（O2）与 1.3.0 转正后的目录站与社区投放（O7）。

第 2 节给全景表，第 3 节给每组的结论摘要，第 4 节给三套预算不同的组合方案，第 5 节给验收点，第 6 节列来源。

## 2. 候选全景表

| 编号 | 候选项 | 工作量 | 风险 | 依赖 | 优先级建议 |
|---|---|---|---|---|---|
| O1 | `showNote` 会话备注显示开关 | S（约 5 文件 + 2 测试文件；无新 locale 键） | 低（隐藏只影响展示，不影响读写；需 README 说明「隐藏不等于删除」） | 无 | **P2**：纯展示层开关，用户没把它列为阻塞，可与 O3 合并做 |
| O2 | `get_session_status` 读取工具 | S（约 2 文件 + 1 测试文件；无新 locale 键） | 低（只读，不触碰推断与写入；工具数量从 2 变 3 需同步现有工具名断言） | O3 的 `enableStatusTool` 决定是否共用门控（`inv-config.md` §8 待定问题 1） | **P0**：零风险、补齐读写对称性，1 天内可完成 |
| O3 | 四个配置开关（`enableStatusTool` / AI 标记组合 / 强制标记三级别 / 会话结束默认标记 / `displayEnabled` 徽标总开关） | 第一步 S–M，第二步 L | 第一步低（官方 `when` API 全量支持）；第二步高（破坏 `EXPLICIT_SOURCES` 契约，需 `MARK_VERSION` 1→2 与新 `source` 值） | 第一步无；第二步前置调研已完成（`inv-host-events.md`）但价值与风险不匹配 | **P1 第一步 / P2 第二步**：先做 `enableStatusTool` + 复用 `autoInfer` + `displayEnabled` 运行时表；强制覆盖档位建议搁置 |
| O4 | 四条新推断规则（R1 pending-subagent / R2 awaiting-answer / R3 done / R4 stopped） | R1 M（有状态配对集合 + 重启失忆边界）；R2 M（需前置条件或超时推断）；R3 S（仅目标会话，零新事件）；R4 S（仅信 `turn/end reason.kind === 'error'`） | R1 中（`interrupt_agent` 后是否发 `subagent-settled` 通知待实测）；R2 中高（goal 自动续轮抖动 + 未标记区块污染 R9）；R3 低（覆盖面有限需预期管理）；R4 低（`llm/retry` 与单工具失败都不触发） | 宿主事件证据已全部落盘（`inv-host-events.md`）；`AUTO_REASON_VALUES` 需扩充 4 个码 | **P2**（与方案 C 绑定）：R1/R2/R3 可在 1.4.0 推进，R4 信号面完整可先做 |
| O5 | 提高模型主动标记命中率（工具描述增补 WHEN TO USE 例子 + 宿主系统提示加状态标记使用规则块） | S（工具描述英文文案一次改动；系统提示块按插件能影响的范围评估，若需宿主侧注入则超出插件职权） | 低（描述与规则块只约束调用，无副作用） | 无；真实调用率基准已落盘（`inv-usage.md`：843 会话 20 次调用 ≈ 2.37 次/百会话） | **P0**：证据强度最高的低成本动作，1.2.0 已建立的 WHEN TO USE / WHEN NOT TO USE 结构直接扩展 |
| O6 | 一键批量打标 + 专用打标模型（路线 A：宿主侧 `ctx.llm.prepareCall` 无头一次性推理；先例 `session-title-llm`） | L（新 exact route 2–3 条 + run 状态机 + `@deepseek-ai/dsh-llm` peer 依赖 + 7 个新 config 字段 + 设置页一键按钮 + 8 语言键） | 中（`GenerateOptions.sessionId` 归因语义未文档化，需实现期实测；凭证未配置时 fail loud） | 宿主 `ctx.llm` 能力面已具备（base bundle 全量挂载）；定时任务不能绑模型（`docs/subsystems/schedule.md:79-84`） | **P2**：833 会话一轮约 218K 输入 + 33K 输出 token（3.5–5 分钟串行），价值依赖用户真实需求；建议放在 1.4.0 之后 |
| O7 | 运营投放（六个目录站 + 三个社区渠道，动作与判据写在 `docs/distribution-plan.md`） | S（零代码改动；文案与索引条目准备） | 低（仓库外动作；第三方 `dshmarket` 不读 locale meta，改那一页需向 `awesome-dsh-plugin` 提交索引） | 1.3.0 转正（npm `latest` 切到 1.3.0 之后才能引用稳定版本号） | **P0**：1.3.0 用户验收通过后即可执行，无需开发资源 |

工作量分档标准：S = 单文件或两文件改动 + 一组测试，半天内可完成；M = 跨 Host 与 Client 的多文件改动，需要一轮真实页面验收；L = 含新依赖、新 route、新表、新 config 字段的整条产品线推进，需要 3–5 天预算。

## 3. 各组结论

### 3.1 显示与配置（O1 + O3）

**O1 `showNote`（`features-plan.md` 功能 A）。** `boolean` 配置，默认 `true` 保持现有行为；常量 `DEFAULT_SHOW_NOTE` 放 `src/contracts.ts`，与 `DEFAULT_ROW_ACTION_ORDER`、`DEFAULT_MENU_ITEM_ORDER` 并列。Host 经 `webserver/index-inject` 把它写进 `__DSH_SESSION_MARKER_CONFIG__`；Client 的 `BrowserConfig` 增加 `showNote?: boolean`，读取时用 `typeof value === 'boolean'` 守卫再回退默认值（避免 `||` 或 `??` 把 `false` 吞掉）。四个 slot 注册点与 `settings.section` 的 `inject` 工厂把 `showNote` 作为普通数据传入。隐藏后 `HoverCard` 不渲染备注文本行、`hover.noteEdit` 与 `noteInput`，`StatusPicker` 摘要隐藏备注行，`StatusOverview` 已标记分组不渲染 `entry.note`。工具与 exact route 不感知该开关，模型仍可读写备注，这一点要写进 README。已知取舍：`docs/user/develop/basic/config.md:76-94` 要求可调项不写死默认值，但旧 profile 升级兼容要求 `.default(DEFAULT_SHOW_NOTE)`；本报告主推后者，与 1.2.0 的 `refreshIntervalMs` / `rowActionOrder` / `menuItemOrder` 一致（`src/service.ts:72-74`）。无新 locale 键。

**O3 第一步（P1，约 1–2 天）。** 三件事：

- **`enableStatusTool`**：profile 静态 `z.boolean().default(true)` 打底，运行时表覆盖时优先；生效点在工具注册 effect `src/service.ts:322-328`，改用官方 `ToolRegistrationOptions.when`（`packages/core/tools/src/contracts.ts:115-124`：「False excludes it from both declarations and dispatch」），闭包每步求值，关闭后模型对话的下一步即生效，无需重启宿主。测试范式见 `packages/core/tools/tests/activation.spec.ts:46-161`。
- **AI 标记组合**（开关②）：不新增字段。auto 来源已由现有 `autoInfer`（`src/service.ts:54`、`:69`、`:387-393`）门控；agent 来源由 `enableStatusTool` 门控。四种组合语义都自洽（`inv-config.md` §2 表），README 与设置页描述把组合语义写清楚即可，零新增代码。
- **`displayEnabled` 徽标总开关**：推荐方案 B（运行时表）。`src/domain.ts:26-29` 的 `defineDomain` 增加 `prefs` 表（追加式，不升 version）；新增 exact route `POST /api/session-status-marker.preference`（与现有四条路由同批注册，`src/service.ts:360-368`）；状态经 list 响应下发（`AllMarksResponse` `src/contracts.ts:233` 加字段、`#handleList` `src/service.ts:510-523` 两个分支都返回，含 `:520` 的 `unchanged` 短路），客户端共享读取循环 `refreshMarksOnce`（`src/client/marks.ts:65-103`）把设置带进 `useMark` 分发；四个展示组件按设置条件返回 null。`settings.section` 注入不能跳过——关闭态渲染一行「显示已关闭」+ 开关，防锁死。生效时机：一个轮询周期内（默认 `refreshIntervalMs` 2000 ms）。新增 3 个 locale 键 × 8 语言（`overview.displayToggle` / `overview.displayToggleDesc` / `overview.displayOffNote`），与 `enableStatusTool` 的 2 键合计 5 键，再加上复用 `autoInfer` 的 2 键共 7 键。与 rc.5 的 overview 契约零冲突（不动 `OverviewResponse` `src/contracts.ts:290`）。

**O3 第二步（P2，建议搁置）。** 强制标记覆盖档位（`inv-config.md` 开关③档 B）需要破坏 `src/contracts.ts:45-50` 记载的「manual/agent 是显式意图，永远压过 auto」契约，引入新 `source` 值（如 `'forced'`），并升 `MARK_VERSION` 1→2 + `compatibleVersions:[1]`（`src/domain.ts:26-29`；官方 `compatibleVersions` 字段见 `packages/storage/storage-domain/src/spec.ts:56`、校验 `:114-117`）。覆盖的收益大部分已被「补空位 + auto 过期」（`autoExpireMs`，`src/inference.ts:120-123`）覆盖，代价是用户显式标记被静默抹掉。会话结束默认标记（开关④）阻塞于宿主信号缺口：`session/disposed` 是 store 逐出信号（宿主重启批量触发，`packages/core/session/src/index.ts:57-64` JSDoc），用它代替「会话结束」必然在重启时批量污染，建议等 O4 R2 的超时推断先落地再评估。

### 3.2 AI 主动标记（O5）

**现状基准（`inv-usage.md`）。** 本机真实会话统计：843 个 `session.v4.jsonl.zstd` 文件中，8 个文件含 `set_session_status` 调用、共 20 次（按逻辑会话去重为 6 个 / 18 次）。status 分布：`pending-subagent` 9、`blocked` 5、`awaiting-answer` 4、`todo` 1、`done` 1。上下文摘录显示调用全部是模型主动（编排会话子代理交接处、自证验收后、挂起后台监控后给自己立待办），没有一条是响应用户显式指令；终态 `done` 仅 1 次，模型更多是宣布「我在等什么 / 我被什么挡住」。marks 目录里 `source:'agent'` 为 0 是版本时间线造成的（`source:'agent'` 由 1.3.0-rc.1 引入，20 次调用全部发生在 rc.4 换装之前，当时运行的是 1.2.3，工具写入被记为 `manual`），模型调用的权威计数只能以会话日志为准。样本窗口结束与 rc.4 换装重合，rc.4 之后的调用频率变化无法判断。

**下一轮最小动作清单（`inv-practice.md` Q1/Q2）。**

1. **改 `set_session_status` 工具描述，扩充 WHEN TO USE 例子（零代码逻辑改动）。** 位置在 `#buildSetTool` 的 description 字段（`src/service.ts:813-820`，1.2.0 已建立 WHEN TO USE / WHEN NOT TO USE / DO NOT USE FOR / USAGE / EXAMPLES 结构）。Anthropic CCA-F 的写法是「只写工具做什么会触发不足（under-triggers），要把触发条件写明确并写反例」（`cleandataengineering.ai/.../2-1-writing-descriptions.html`）；OpenAI GPT-5.2 指南也要求描述「一两句话说明它做什么、何时用」。具体增补方向：把 8 种状态各自的真实触发条件写成完整例句（例如「子代理刚派发出去、要等它回来时标 pending-subagent」「识别到等待外部设备或用户回复时标 awaiting-answer」），并补一条反例（例如「不要在每轮都重复标记同一状态」）。工具描述属于英文文案，不进 `src/client/locales.ts` 字典，因此不影响八语言一致性。
2. **在宿主系统提示里加一段状态标记使用规则块（一次性，非每轮）。** OpenAI GPT-4.1 Prompting Guide 的三类 system prompt reminders（持续性、工具调用、规划）与 GPT-5.2 的 `<tool_usage_rules>` 块都背书这一做法。块内容三件事：① 声明 `set_session_status` 是无副作用的记录工具、调用它无需用户确认；② 列 8 种状态各自的触发条件；③ 给一两个该调用 / 不该调用的例子。**插件能影响的边界**：宿主系统提示由宿主装配，独立 bundle 不能直接注入；可行的落点是插件的工具描述（面向模型的说明书）与未来的 README 使用指南（面向用户的引导）。若要真正改宿主系统提示，需要向 DSH 主仓库提 PR 或等上游开放扩展点——这是一个上游依赖项，不是本轮 S 工作量。
3. **每轮上下文注入「当前标记为 X」不作为主要手段。** 机制有支持（长会话指令衰减 → tail ingestion，`avchauzov.github.io/blog/2026/context-engineering-production-patterns/`），但没有任何公开实验证明它能具体提升一个低优先级状态工具的调用率；且对 `set_session_status` 这种「只在状态发生语义变化时才该调用」的工具，每轮重复可能让模型把当前状态当成需要维持的指令。若 O5 动作 1 落地后实测仍不够，再考虑此路，并先做 A/B。

**优先级判断。** 动作 1 是 P0（半天内可完成，证据强度最高）；动作 2 的系统提示块在插件侧的等价物也是 P0（写进工具描述即可），但「真正改宿主系统提示」这一步需要上游支持，单列为待评估项。O5 与 O2（读取工具）配合可以让模型「先读后写」，减少重复调用，建议同轮落地。

### 3.3 新标记规则（O4）

`inv-host-events.md` §2 给出四条规则的可行性判定；本节不复述宿主事件枚举，只给结论与降级实现。所有规则共用 `#observe`（`src/service.ts:472-489`）的写入通道与 `shouldApplyInference`（`src/inference.ts:113-117`）的 source 保护；新增规则码需扩充 `AUTO_REASON_VALUES`（`src/contracts.ts:22-30`，现为 7 码，其中 `tool-result-progress` 与 `session-stop-invoked` 仍是空位）。

- **R1 子代理运行中 → `pending-subagent`：可行。** 开始 = 父会话日志的 `subagent/catalog` 事件（含 `childId`、`label`、`mode`、`childCreatedAt`），结算 = `user/message` 且 `data.source.kind === 'subagent-settled'`（`senderSessionId` 配对）。必须做成有状态规则（每会话维护活跃子代理集合）。已知边界：进程重启后集合从零重建（重启前未结算的子代理可能漏感知，R3）；`interrupt_agent` 永久停止的子代理是否仍发 `subagent-settled` 通知，官方镜像内无 `packages/subagent/` 源码可证，需实测（R4）。降级实现：集合非空时标 `pending-subagent` 并给它单独设较短的 `autoExpireMs` 兜底，避免永久挂起。
- **R2 轮结束 → `awaiting-answer`：部分可行，语义不精确。** `turn/end reason.kind === 'completed'`（`packages/core/session/src/types.ts:207`）实时可观测且持久化，但宿主没有「正在等用户回复」的判别字段；goal 自动续轮会在数秒内产生 `completed → turn/start → completed` 抖动（`goal-round-driver/src/index.ts:338` 监听同一事件流）。建议前置条件：只对「无活跃 goal（`goal/change` 追踪 phase）」且「无未结算子代理」的会话标 `awaiting-answer`；或改用超时推断（N 分钟内无 `turn/start`、无 `user/message` 才标，N 内有活动则已被后续事件改写）。产品面副作用：规则 2 落地后几乎所有聊过的会话都会离开未标记区块（`src/service.ts:728-770`），需要在 UI 侧把 auto 行视觉降权或让未标记区块排除「仅剩 auto 且已过期」的行（R9）。
- **R3 会话完成 → `done`：部分可行，仅对 goal 会话成立。** `goal/change operation === 'complete'`（`packages/goal/goal/src/domain.ts:24-32`，`data.goal.phase === 'complete'`）会持久化，可加条件「同时无活跃子代理、无未结算 job」避免误标完成。普通会话在宿主侧零信号（模型说完成 ≠ 宿主知道完成），只能靠模型 `set_session_status` 显式标记，或 R2 的超时推断变体。需在文档中明确「自动 done 仅限 goal 会话」做预期管理（R5）。
- **R4 会话报错 → `stopped`：部分可行，信号面完整。** 只信 `turn/end reason.kind === 'error'`（`LlmFailure` 带 message/code，`types.ts:218`）；`aborted` 区分 `reason.kind === 'user'`（用户主动取消，语义是「用户停了」而非「出事了」，可单独映射或不标）；`llm/retry` / `llm/retry-started` 不触发会话级 stopped（重试成功是常态，R7）；`tool/result` 的 error 字段不触发（单工具失败在长任务里是常态）；`job/settled failed/killed` 已有 job-failed 规则保留。`LlmFailure.code` 可写进 note（如 `TOOL_ACTIVATION_FAILED`）帮助读者判断。**这一条无宿主信号缺口，可先落地。**

**整体优先级 P2，与方案 C 绑定。** 理由：R1 与 R2 都需要插件侧维护有状态配对集合或超时推断窗口，改动量中且各带一条已知边界；R4 单独可先做但单独做的价值有限。建议与 O6 路线 A 一起作为「AI 主动性」产品线的整体推进放在 1.4.0。

### 3.4 批量打标（O6）

**路线 A 与路线 B 的对比结论。** 路线 A（推荐，P0 候选）由宿主经 `ctx.llm.prepareCall` 发起一次性推理，不进会话历史、不消耗用户当前会话 token，先例是官方 `session-title-llm` 插件（`packages/session/session-title-llm/README.md:38` 的 provider/model 成对覆盖契约、`:75` 的「无 agent-loop 身份、不进会话历史」声明）；路线 B 由当前会话的模型循环调用工具，token 计入用户当前模型，833 会话量级成本高一个数量级以上，只适合当交互式补充。

**token 成本（全量 833 会话一轮，路线 A，`inv-bulk-marking.md` §1.4）。** N = 833、B = `markingMaxBatchSize` 默认 40、T = ⌈N/B⌉ = 21 次 LLM 调用；单会话摘要 s ≈ 200 tok（turnOutline 字段上限见 `session-turn-outline/README.md:40-47`）、系统提示 S ≈ 400 tok；单次调用输入 B×s + S ≈ 10,400 tok、输出 B×40 ≈ 1,600 tok；全轮输入 ≈ 218K tok、输出 ≈ 33K tok，合计 ≈ 250K tok/轮；串行耗时 ≈ 3.5–5 分钟。分批写完立即逐行持久化（storageDomain 无跨行事务 API，采用「逐行持久 + 批末回执 `{written, skipped, failed[]}`」语义），任意时刻可中断，`clear-bulk` 提供整体回滚（`source:'bulk'` 行按行过滤删除，无需 schema 变更）。

**配置面（7 个新字段，沿用 `src/service.ts:52-75` 的现有模式）。**

| 字段 | schema | 语义 |
|---|---|---|
| `markingProvider` | `z.string().min(1).optional()` | 批量分析的 provider 覆盖，必须与 `markingModel` 成对（全空或全填，否则加载期 fail loud），对齐 title-llm 的「both or neither」契约 |
| `markingModel` | `z.string().min(1).optional()` | 模型名 |
| `markingMaxBatchSize` | `z.natural().min(1).max(200).default(40)` | 每批会话数 |
| `markingMaxInputBytes` | `z.natural().min(1024).default(16384)` | 单批输入字节上限 |
| `markingMaxOutputTokens` | `z.natural().min(1).default(2048)` | 单批输出上限 |
| `markingTimeoutMs` | `z.natural().min(1000).default(60000)` | 单批端到端超时 |
| `allowBulkOverwrite` | `z.boolean().default(false)` | 是否允许 bulk 覆盖已有标记；默认 false，覆盖是破坏性行为，永不覆盖 `manual` 行 |

解析顺序：配置对非空 → 用它；否则 `ctx.agentDefaultModel.currentSelection()`（`packages/core/agent-default-model/src/index.ts:67-73`）。新增 `@deepseek-ai/dsh-llm` peerDependency 仅用于类型（`Message` / `GenerateOptions` / `LlmRequestPurposeMap` 声明合并），client bundle 零依赖不变。

**宿主约束（`inv-bulk-marking.md` §2.1e）。** 定时任务**不能绑模型**：投递目标三种（`session` / `new_once` / `new`），创建值只有 `cwd` 与 `agentPreset`，管理 API 无任何 provider/model 字段（`docs/subsystems/schedule.md:79-84`、`:89-100`）。这意味着「每天定时跑批量打标 + 用便宜模型」需要用户先建一个会话、手动切到便宜模型，再让定时任务投递 prompt 进该会话——这一人工步骤要等上游给 `ScheduleCreateRequest` 加 `agentOptions` 才能消除，属 nice-to-have，不阻塞路线 A 主路径。

**优先级 P2。** 能力面在 DSH 里全部已存在（base bundle 全量挂载 `dsh-llm`、`ctx.agentDefaultModel`、title-llm 先例），插件无需上游改动即可实现；唯一实测点是 `GenerateOptions.sessionId` 的精确语义（归因/日志归属）未文档化。放在 1.4.0 之后等用户真实需求信号再启动。

### 3.5 读取工具（O2）

**`get_session_status`（`features-plan.md` 功能 B）。** 不设入参，`parameters` 为空对象；当前会话 id 通过现有 `agentSessionId(exec)` 取 `exec.agent.id`，不提供 `sessionId` 参数（模型工具只应读当前会话，将来跨会话查询另设工具并配 exact route 校验）。返回结构：顶层 `ok` / `sessionId` / `marked` / `mark`；`marked` 为布尔，`mark` 已标记时含 `status` / `source` / `note` / `autoReason` / `insertedAtMs`，未标记时为 `null`。Host 侧走 `service.effectiveMark(sessionId)`（已处理惰性过期，`src/service.ts:412-418`），不能直接调 `getMark` 否则会把过期自动标记当成有效返回；只访问 `ctx.storageDomain`，不调用未在 `static inject` 声明的服务。注册位置在 `src/service.ts:308-394` 的 `[Service.init]`，紧挨 `#buildSetTool` 与 `#buildClearTool`，用 `defineTool` 新建 `#buildGetTool`；三个工具的 dispose 在同一清理流程里统一调用。

**与 `set_session_status` 的对称性。** 写工具描述已说明「手动标记不被推断覆盖」（`src/service.ts:817`）；读工具描述要写明「用于确认当前会话的状态与备注，不用于修改状态（修改用 `set_session_status`），返回未标记时不要推断或编造状态」。工具描述属于英文文案，不进八语言字典。`output.schema` 用 `marked` 布尔加 `mark` 可空对象表达，不用 `oneOf` 或 union（canonical JSON 约定，`docs/research/01-host-api.md`）。

**典型用途。** ① 模型在编排会话里检查「我上一轮给自己标的 pending-subagent 是否还在」；② 模型在收到 `subagent-settled` 通知后读取当前状态再决定是否改写；③ 用户在对话里问「现在这个会话是什么状态」时模型可直接读而非猜测。与 O5 的工具描述增补形成闭环：模型先读后写，减少重复调用与无效调用。

**优先级 P0。** 改动量 S，无新 locale 键，工具数量从 2 变 3 需同步 `tests/service.test.mjs` 的工具名列表断言；与 O3 的 `enableStatusTool` 共用注册位置（`inv-config.md` §8 待定问题 1：读写工具同受门控，注册同处 `src/service.ts:322-328`）。

## 4. 推荐的下一轮范围

三套组合按预算与侧重不同排列，用户可按 1.3.0 转正后的精力与需求挑一组，或按第 2 节全景表自行重组。

### 方案 A · 快赢轮（约 1 天）

**做**：O7 运营投放 + O5 动作 1（`set_session_status` 工具描述扩充 WHEN TO USE 例子）+ O2 `get_session_status` 读取工具。

- **预估改动文件**：`src/service.ts`（`#buildGetTool` + 工具描述增补，约 60 行）、`src/contracts.ts`（可选，返回结果类型复用）、`tests/service.test.mjs`（工具注册与执行断言 +5 例）、`docs/distribution-plan.md`（投放执行记录）、README（工具列表加 `get_session_status`）。
- **预估测试用例**：`tests/service.test.mjs` 增加 5 例（有标记场景、无标记场景、过期场景、错误场景、只读校验），合计 135 项 / 31 套件左右。
- **前置条件**：1.3.0 转正（O7 需要 npm `latest` 指向 1.3.0）。
- **用户验收点**：`get_session_status` 在 dev4090 真实页面由模型调用成功并返回正确状态；工具描述增补后模型在长会话里主动调用 `set_session_status` 的频率不低于 rc.4 基准（2.37 次/百会话）；六个目录站索引条目提交完成、三个社区渠道帖子发布。

### 方案 B · 配置轮（约 2–3 天）

**做**：方案 A 全部 + O3 第一步（`enableStatusTool` + 复用 `autoInfer` + `displayEnabled` 运行时表）+ O1 `showNote`。

- **预估改动文件**：方案 A 全部 + `src/service.ts`（Config 接口与 zod schema 加 `enableStatusTool` 与 `showNote`、工具注册改 `when` 写法、`#handleList` 加 `displayEnabled` 字段、新增 `preference` route、`webserver/index-inject` 注入对象加键）、`src/domain.ts`（加 `prefs` 表）、`src/contracts.ts`（`AllMarksResponse` 加 `displayEnabled`、加 `DEFAULT_SHOW_NOTE`）、`src/client/index.ts`（`BrowserConfig` 加 `showNote`、apply 跳过 slot 注入分支）、`src/client/marks.ts`（共享读取循环带设置下发）、`src/client/Badge.tsx` / `HoverCard.tsx` / `RowAction.tsx` / `MenuStatusItem.tsx` / `StatusPicker.tsx` / `StatusOverview.tsx`（条件渲染）、`src/client/locales.ts`（新增 9 键 × 8 语言：displayToggle 3 键 + toolToggle 2 键 + autoToggle 2 键 + showNote 2 键）、`tests/service.test.mjs` / `tests/note-input.test.mjs` / `tests/overview.test.mjs` / `tests/i18n.test.mjs`。
- **预估测试用例**：新增约 15 例（`enableStatusTool` 门控 3 例、`displayEnabled` 运行时下发 4 例、preference route 3 例、`showNote` 隐藏 3 例、8 语言键齐备 1 例、优先级规则 1 例），合计 150 项 / 32 套件左右。
- **前置条件**：方案 A 完成；`prefs` 表追加式变更不影响现有 `marks` 表，无需数据迁移。
- **用户验收点**：设置页「标记行为」区块出现三个可交互开关（总体显示、AI 标记工具注入、自动推断），关闭后一个轮询周期内（约 2 秒）四个展示面消失、数据不丢失、重开立即恢复；`enableStatusTool=false` 后模型在下一次对话里看不到 `set_session_status`；`showNote=false` 后悬停卡、行内面板、看板三处备注隐藏但工具读回仍能拿到备注。

### 方案 C · 智能体轮（约 3–5 天）

**做**：方案 B 全部 + O4 R1/R2/R3 三条新规则（R4 会话报错 → stopped 因信号面完整可在方案 C 内一并做，或拆到 1.4.0 单独交付）+ O6 路线 A 批量打标（宿主无头 LLM）。

- **预估改动文件**：方案 B 全部 + `src/inference.ts`（R1 有状态配对集合、R2 前置条件或超时推断、R3 goal complete、R4 仅信 error）、`src/contracts.ts`（`AUTO_REASON_VALUES` 扩充 4 码：`subagent-running`、`turn-completed-idle`、`goal-completed`、`turn-error`）、`src/service.ts`（批量打标 run 状态机、3 条新 route、7 个新 config 字段、`#collectUnmarked` 复用）、`src/types.ts`（`MarkRecordSchema` 加 `source:'bulk'`）、`src/domain.ts`（`MARK_VERSION` 若 O3 第二步同时做则升 2，否则不动）、`package.json`（加 `@deepseek-ai/dsh-llm` peerDependency）、`scripts/build-client.mjs`（MODULES 白名单不变，Host 侧类型引用）、设置页新增批量按钮组件、`src/client/locales.ts`（批量按钮 + 进度行 + 4 条新规则文案 × 8 语言，约 20 键）、`tests/inference.test.mjs` / `tests/service.test.mjs` / `tests/bulk.test.mjs`（新建）。
- **预估测试用例**：新增约 30 例（R1 配对与重启失忆 5 例、R2 前置条件与抖动 5 例、R3 goal complete 与普通会话 3 例、R4 error 与 aborted 区分 4 例、批量打标 route 与 run 状态机 8 例、新 config 字段校验 3 例、`AUTO_REASON_VALUES` 扩充 2 例），合计 180 项 / 35 套件左右。
- **前置条件**：方案 B 完成；`packages/subagent/` 源码不在官方镜像内，`interrupt_agent` 后是否发 `subagent-settled` 通知需在 dev4090 真实环境实测（`inv-host-events.md` R4）；`GenerateOptions.sessionId` 归因语义需实现期验证；批量打标的模型凭证未配置时 fail loud。
- **用户验收点**：长编排会话里子代理派发后侧栏徽标自动变 `pending-subagent`、子代理结算后自动清除；轮结束后无活跃 goal 的会话标 `awaiting-answer` 且 goal 自动续轮不抖动；goal 会话目标完成后自动标 `done`；会话报错（`turn/end error`）后自动标 `stopped` 且 note 含 `LlmFailure.code`；设置页一键批量分析 833 会话一轮约 3–5 分钟、进度行可见、任意时刻可中断、`clear-bulk` 一键回滚；`markingProvider`/`markingModel` 指向便宜模型后批量分析成本可控。

**三套方案的取舍。** 方案 A 全部是低成本、无风险、已调研清楚的动作，建议作为 1.3.0 转正后的第一轮；方案 B 补上用户提的「设置页能改配置」需求并引入 `prefs` 表（未来所有运行时开关共用同一张表）；方案 C 把「AI 主动性」这条产品线整体推到 1.4.0，需要 3–5 天预算与真实页面验收。

## 5. 用户验收点清单

**[1.3.0] 本轮已验收的项**（详见 `docs/acceptance-and-regression.md` §3.25 / §3.26）：

- [1.3.0] 跨会话点击悬停卡标题不再出现「已复制」（`copyGuard` 模块级共享监听对 + 引用计数）。
- [1.3.0] 编辑备注期指针漂移到其他会话行，卡片仍打开、输入框焦点仍在、草稿保留（`cardLock.ts` 共享 hook）。
- [1.3.0] 看板不再长时间卡「加载中」（`fetchOverview` 绝对路径 + 8 秒超时 + `inFlight` 在途标志）。
- [1.3.0] 看板待办 2 / 审查 2 / 未标记 7、`overview` 6 次采样 200、条件刷新 `unchanged:true`、悬停卡备注编辑期草稿保留（rc.5 性能轮询健壮化）。
- [1.3.0] DSH 0.2.3-alpha 兼容（服务改名 `sessionStatusMarker`、`engines.dsh` 覆盖 0.2.3 预发布线）。

**下一轮各方案建议的验收项**：

- [方案 A] 模型在真实会话里调用 `get_session_status` 返回正确状态与备注，未标记时返回 `marked:false, mark:null`，过期自动标记正确显示为未标记。
- [方案 A] `set_session_status` 工具描述扩充后，长会话里模型主动调用频率不低于 rc.4 基准（约 2.37 次/百会话文件 / 2.14 次/百逻辑会话），且调用上下文仍是主动而非被动。
- [方案 A] 六个目录站索引条目全部提交、三个社区渠道帖子全部发布、`dshmarket` 已装列表描述不变（第三方市场不读 locale meta，已知边界）。
- [方案 B] 设置页「标记行为」区块三个开关可交互，关闭 `displayEnabled` 后约 2 秒内四个展示面（侧栏徽标、行内状态按钮、菜单入口、悬停卡）与看板同时消失，`settings.section` 入口保留且渲染「显示已关闭」+ 开关。
- [方案 B] 关闭 `enableStatusTool` 后，模型在下一次对话里看不到 `set_session_status`（`when` 门控生效，无需重启宿主）；打开时行为与现状一致。
- [方案 B] `showNote=false` 后悬停卡、行内面板、设置页看板三处备注均隐藏，状态格与清除按钮仍在，切换状态后通过工具读回的备注仍然存在。
- [方案 C] 子代理派发后侧栏徽标自动变 `pending-subagent`，结算后自动清除；进程重启后集合从零重建，新派发正常跟踪（R3 已知边界）。
- [方案 C] 轮结束后无活跃 goal 且无未结算子代理的会话标 `awaiting-answer`；goal 自动续轮不产生 `awaiting-answer ↔ 运行态` 抖动；未标记区块在 R2 落地后仍有意义（auto 行视觉降权或排除陈旧 auto 行，二选一）。
- [方案 C] goal 会话目标完成后自动标 `done`，普通会话不受影响（预期管理写进 README）。
- [方案 C] 会话报错（`turn/end reason.kind === 'error'`）后自动标 `stopped` 且 note 含 `LlmFailure.code`；`llm/retry` 与单工具失败不触发会话级 stopped。
- [方案 C] 设置页一键批量分析在 833 会话量级一轮约 3–5 分钟，进度行可见「批 N/M · 会话 X/833 · 已写 Y」，任意时刻可中断，已完成批次保留，`clear-bulk` 一键回滚全部 `source:'bulk'` 行。
- [方案 C] `markingProvider`/`markingModel` 指向便宜模型后批量分析走该路由，未配置时回退 `ctx.agentDefaultModel.currentSelection()`；`allowBulkOverwrite=false` 时 bulk 只填空位、永不覆盖 `manual` 行。

## 6. 参考

**六份调研报告**（`.drafts/reviews/` 下，本轮唯一输入）：

- `.drafts/reviews/features-plan.md` — O1 `showNote` 与 O2 `get_session_status` 的设计。
- `.drafts/reviews/inv-config.md` — O3 五开关评估（含 `enableStatusTool` 官方 `when` API、`displayEnabled` 运行时表 vs profile 静态的取舍、`settings.section` UI 草案、8 语言键清单）。
- `.drafts/reviews/inv-host-events.md` — O4 四条新规则的宿主事件可行性判定（含事件证据表、风险清单 R1–R10、镜像覆盖缺口清单）。
- `.drafts/reviews/inv-practice.md` — O5 的外部实践调研（OpenAI / Anthropic 官方文档、arXiv 论文、行业先例；默认状态取 idle 而非 done 的先例）。
- `.drafts/reviews/inv-usage.md` — O5 的真实调用统计（843 会话文件 / 20 次调用 / 6 个逻辑会话、status 分布、source 分布、版本时间线闭环）。
- `.drafts/reviews/inv-bulk-marking.md` — O6 的批量打标路线 A vs B、token 成本估算、`markingProvider`/`markingModel`/`markingMaxBatchSize` 等 7 个配置字段、定时任务不能绑模型的宿主约束。

**项目文档**：

- `docs/project-memory.md` — 教训 53（宿主升 0.2.3-alpha 后插件整体消失的两条根因：`engines.dsh` 预发布匹配规则、服务重名冲突）、教训 54（桌面 profile 不能用 CLI 检查）、教训 55（看板「加载中」的性能根因：串行等待三路可选服务读取、`listSessions()` 无缓存每 2 秒全量重扫）。
- `docs/research/15-polling-and-cache-practices.md` — rc.5 的性能与轮询健壮化依据（单飞合并、stale-while-revalidate、Full Jitter 退避、有界并发）。
- `docs/research/12-agent-proactive-marking.md` — O4 与 O5 的前置调研（注意：其中关于 `src/inference.ts` 读 `data.id` 与 `data.phase` 的两条结论已过时，提交 `42b15cd` 已修复，接手时不要重复改）。
- `docs/distribution-plan.md` — O7 的六个目录站与三个社区渠道动作、完成判据、时间线、指标。
- `docs/release-process.md` — 1.3.0 转正流程与发布政策（正式版本必须在用户实际前端验收通过后发布）。
- `docs/acceptance-and-regression.md` — §3.25 / §3.26 记录 1.3.0-rc.4 / rc.5 的真实页面验收证据。

**官方镜像参考**（`.research/dsh-repo/`）：

- `packages/core/tools/src/contracts.ts:115-124` — `ToolRegistrationOptions.when`（O3 `enableStatusTool` 的生效机制）。
- `packages/core/tools/tests/activation.spec.ts:46-161` — `when` 的测试范式。
- `packages/session/session-title-llm/README.md:38,75` 与 `packages/session/session-title-first-prompt-llm/README.md:12,36` — O6 路线 A 的官方先例。
- `packages/core/agent-default-model/src/index.ts:67-73` — O6 的部署级默认模型读取。
- `docs/subsystems/schedule.md:79-84,89-100` — 定时任务不能绑模型的宿主约束。
- `packages/core/session/src/index.ts:43-85` — 四个公开 session 事件；`:57-64` `session/disposed` JSDoc（O3 开关④信号缺口的核心证据）。
- `docs/user/develop/basic/config.md:45,74,100` — Cordis 配置 schema 填充默认值、非法配置导致加载失败、配置编辑热替换插件。
