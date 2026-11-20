---
author: dsh-session-marker 研究子代理
date: 2026-11-20
version: 1.3.0
---

# 12 · 如何让 AI 智能体更主动地给会话打状态标记

本文讨论一个具体问题：会话状态标记插件已经提供了 `set_session_status` 工具，为什么模型很少主动调用它，以及在不修改 DSH 主仓库的前提下，能把「主动」推进到什么程度。

## 1 范围与方法

### 1.1 范围

讨论对象是 `dsh-session-status-marker` 插件的两条主动路径：

- 模型主动路径：模型在对话过程中调用 `set_session_status` / `clear_session_status`，写入 `source: 'agent'` 的行。
- 宿主推断路径：插件监听 `session/event`，用 `src/inference.ts` 的纯函数推断出 `source: 'auto'` 的行。

不讨论客户端交互（悬停卡、行内图标、设置页总览），那部分见 `docs/research/08-hover-interaction.md` 与 `docs/research/09-status-overview.md`；也不重复 `docs/research/04-session-state-taxonomy.md` 的八种状态语义定义。

### 1.2 方法

三条取证线并行：

1. **本仓库源码**：`src/inference.ts`、`src/contracts.ts`、`src/service.ts`、`tests/inference.test.mjs` 逐行核对，行号以 2026-11-20 工作区状态为准（HEAD `c9c9609` 之上带未提交改动）。
2. **DSH 官方镜像**：`.research/dsh-repo/`（来源 `https://codeload.github.com/deepseek-ai/deepseek-harness/zip/refs/heads/master`）。凡断言 DSH 官方行为，一律给出该目录内的文件与行号；镜像里没有对应源码时明确写「镜像内没有找到」，只引用生成文档并标注这一点。
3. **外部资料**：官方文档、上游仓库源码、厂商 engineering blog 与 issue 原文。避开内容农场与云厂商营销页。每条外部做法都读到了正文，记录的是机制本身。

镜像覆盖范围有边界：`packages/` 下只有 bundle、client、core、experimental、goal、host、interaction、session、settings、storage、test-support、todo、util、web 这些目录，`packages/context/`、`packages/jobs/`、`packages/guard/`、`packages/workspace/` 都不在镜像里。涉及这些包的断言只能引 `docs/` 下的生成目录（`docs/config-catalog.md`、`docs/persistence-catalog.md`、`docs/event-producer-consumer.md`），本文会逐条注明。

## 2 现状

### 2.1 现有自动推断规则

`inferStatus(observation)` 是纯函数，输入 `{ type, seq, time, data }`，输出 `InferenceResult | null`（`src/inference.ts:67-101`）。全部规则如下：

| 触发事件 | 条件 | 写入状态 | autoReason | subjectId | 位置 |
|---|---|---|---|---|---|
| `turn/end` | `reason.kind === 'interrupted'` | `stopped` | `turn-interrupted` | `null` | `src/inference.ts:71` |
| `turn/end` | `reason.kind === 'blocked'` | `blocked` | `turn-blocked` | `null` | `src/inference.ts:72` |
| `turn/end` | `reason.kind === 'aborted'` 或 `'error'` | `stopped` | `turn-interrupted` | `null` | `src/inference.ts:73` |
| `turn/end` | 其他 kind（含 `completed`） | 不推断 | — | — | `src/inference.ts:74` |
| `tool/call` | name 为 `TodoWrite` 或 `todo_write`，且解析 `arguments` 后存在 `status !== 'completed'` 的条目 | `todo` | `tool-write-todo` | `callId` | `src/inference.ts:76-86` |
| `job/settled` | `status` 为 `failed` 或 `killed` | `stopped` | `job-failed` | `id` | `src/inference.ts:88-91` |
| `goal/change` | `phase === 'blocked'` | `blocked` | `goal-blocked` | `null` | `src/inference.ts:93-96` |
| 其他事件类型 | — | 不推断 | — | — | `src/inference.ts:98-99` |

三条结构性事实：

- **正常结束没有规则**。`turn/end` 的 `completed` 分支落在 `src/inference.ts:74` 返回 `null`，所以一个顺利做完的会话不会自动变成 `done`。这是「自动标记看起来总是滞后」的直接原因，`docs/research/10-vnext-evaluation.md:89` 已经记录过同一观察。
- **`turn/end` 的 `interrupted` 在实时链路上不出现**。DSH 的定义是：`interrupted` 是崩溃后补写的关闭标记，agent-loop 在 resume 时追加、session-query 冷读时合成，正常循环从不实时发出（`.research/dsh-repo/packages/core/session/src/types.ts:221-227`）。所以 `src/inference.ts:71` 这条规则实际只在恢复或冷读场景命中，对「会话进行中被打断」没有帮助。
- **`todo_write` 规则依赖工具名与参数结构**。`tool/call` 事件的 `arguments` 是模型产出的原始 JSON 字符串，未解析（`.research/dsh-repo/packages/core/session/src/types.ts:369`），`src/inference.ts:46-54` 先 `JSON.parse` 再取 `todos`，解析失败按无参数处理。DSH 自己的 `todo_write` 参数是 `{ todos: TodoItem[] }`，`TodoItem` 只有 `content` 与 `status` 两个字段（`.research/dsh-repo/packages/todo/tool-todo/src/types.ts:22-34`），与规则读取的字段一致。

### 2.2 已声明但从未产出的规则码

`src/contracts.ts:22-30` 的 `AUTO_REASON_VALUES` 有 7 个码，`inferStatus` 只产出其中 5 个：

- `tool-result-progress`（`src/contracts.ts:26`）
- `session-stop-invoked`（`src/contracts.ts:29`）

在 `src/`、`tests/` 全量搜索这两个字符串，命中只有 `src/contracts.ts` 里的声明行本身，`src/inference.ts` 从不返回它们。这意味着两件事：类型层面允许「工具结果推进」与「会话停止被调用」两类推断，实现层面缺规则。B 级建议里最有价值的两条正好落在这两个空位上（见 §5.2）。

### 2.3 与真实事件负载不一致的两条规则

写文档前把 DSH 的事件负载与本仓库的读取路径逐条对过，发现两处层级不符。这两处会让对应规则在真实会话里静默失效，同时现有单元测试仍然通过，因为测试用的是伪造的扁平负载。

**`job/settled` 读错了主键字段。** `src/inference.ts:91` 读 `stringField(observation.data, 'id')` 作为 `subjectId`，而真实的 `JobSettledData` 字段是 `cause`、`detail?`、`finishedAt`、`jobId`、`kind`、`label`、`owner`、`producerReported`、`startedAt`、`status`、`toolCall?`（`.research/dsh-repo/docs/persistence-catalog.md:3900-3921`），`status` 的取值是 `completed` / `failed` / `killed`（同文件 `:5784-5792`）。`status` 读取正确，所以 `stopped` 会写入；`subjectId` 永远是 `null`。测试 `tests/inference.test.mjs:85` 用的负载是 `{ id: 'j2', status: 'failed' }`，断言 `subjectId === 'j2'`，因此测不出这个问题。

**`goal/change` 读错了一层。** `src/inference.ts:94` 读 `data.phase`，而真实负载是 `GoalChangeMeta`，其 `GoalSnapshotChangeMeta` 形态为 `{ kind, version, operation, goal, roundsStarted, createdAt, updatedAt }`（`.research/dsh-repo/packages/goal/goal/src/domain.ts:23-44`），`goal` 才是 `GoalSnapshot`（`.research/dsh-repo/packages/goal/goal/src/types.ts:59-69`），`phase` 在 `goal.phase` 上，取值 `active` / `paused` / `blocked` / `complete`（同文件 `:44-49`）。所以 `goal-blocked` 规则在真实会话里不会命中。测试 `tests/inference.test.mjs:90` 用的负载是 `{ phase: 'blocked' }`，同样测不出来。

这两条属于实现缺陷，与「更主动」主题相关：修掉它们等于凭空多出两条真实生效的推断路径，成本低于新增规则。

### 2.4 覆盖关系与过期

- 推断写入前先取 `effectiveMark`，再用 `shouldApplyInference` 判定（`src/service.ts:276-293`）。`shouldApplyInference` 现在的判定规则是：空行直接写；`current.source !== 'auto'` 一律拒绝（`src/inference.ts:108-112`）。`MARK_SOURCES` 已扩为 `manual` / `agent` / `auto` 三值（`src/contracts.ts:35-46`），`EXPLICIT_SOURCES` 把前两者归为显式意图（`:48-50`），因此用户点击与模型工具调用都不被推断覆盖。
- 保护只存在于 `#observe` 这一条路径上。`putMark` 只做整行替换，不做优先级比较（`src/service.ts:227-229`），任何其他写入方都能直接覆盖。当前没有第二个写入方，但这是 B 级建议里加新规则时必须注意的边界。
- 过期只作用于 `source === 'auto'` 的行：`autoExpireMs <= 0` 或非自动行一律不过期，否则按 `now - insertedAtMs > autoExpireMs` 判定（`src/inference.ts:114-118`），惰性删除发生在 `effectiveMark`（`src/service.ts:216-222`）。
- 没有「同一会话同一事件重复推断」的去抖：同一 `status` + 同一 `autoReason` 被 `shouldApplyInference` 挡住不写（`src/inference.ts:111`），但状态来回切换（例如 `todo` → `stopped` → `todo`）会每次都写一行，`insertedAtMs` 跟着事件时间一起变化。

## 3 DSH 官方通道

问题：插件有没有官方渠道影响模型看到的提示词。结论是「有，且不止一条」，但每条的成本与副作用不同。以下每条断言都带 `.research/dsh-repo/` 内的文件与行号。

### 3.1 工具描述会进模型上下文（已在用，成本最低）

`defineTool` 的 `description` 字段注释就是 `Human-readable description sent to the model.`（`.research/dsh-repo/packages/core/tools/src/schema.ts:487-488`）。`ToolsService` 在构造时把自己注册成工具 schema 提供者，把当前可见工具集交给 `ctx.systemPrompt.tools(...)`（`.research/dsh-repo/packages/core/tools/src/index.ts:113-117`）。生成文档把 `description` 直接标注成「what the model sees」（`.research/dsh-repo/docs/user/develop/basic/tool.md:21`、`.research/dsh-repo/docs/cookbook/adding-a-tool.md:20`）。

DSH 自己的 `todo_write` 就是范例：描述由四段常量拼成，按部署配置切换活跃状态子句（`.research/dsh-repo/packages/todo/tool-todo/src/index.ts:45-67`），注册时把拼好的字符串传进 `defineTool`（同文件 `:136-137`）。模型可见的完整文本记录在 `.research/dsh-repo/docs/tool-catalog.md:2440-2442`。

这条通道本插件已经用上了（`src/service.ts:417-424`），只是 `clear_session_status` 还只有一句话（`src/service.ts:457`）。

### 3.2 `ctx.systemPrompt.section()` 可以注册提示词段（可用，需要新增依赖）

`SystemPrompt` 是 core 级服务，服务名 `systemPrompt`（`.research/dsh-repo/packages/core/system-prompt/src/index.ts:435,452`）。公开三个注册入口：

- `section(section: PromptSection)`（`:484`），注册有序提示词段，返回释放函数。
- `context(context: PromptContext)`（`:519`），注册运行时上下文段。
- `tools(provider)`（`:551`），注册工具 schema 提供者。

`PromptSection` 的 `text` 既可以是静态字符串，也可以是 `(context: AssembleContext) => string`（`.research/dsh-repo/packages/core/system-prompt/src/index.ts:66`），所以同一段文本可以按当前 step 的工具可见性决定写什么。

仓库外插件是否合法，官方 README 说得明确：段按 `order` 升序拼接，仓库内贡献者用 `getSectionOrder(name)` 取中央分配的位置，运行时上下文贡献者用 `getContextOrder(name)`，然后有一句 **`External contributions may use any finite order.`**（`.research/dsh-repo/packages/core/system-prompt/README.md:56`）。也就是说仓库外插件可以自己定一个有限 order 插进去，不必等上游分配。

现成样例有三个，都在镜像里：

- `tool-goal` 注册 `tool:goal` 段，order 走 `getSectionOrder('TOOL_GOAL')`，文本是 `guidance(blockedAfter)` 返回的政策（`.research/dsh-repo/packages/goal/tool-goal/src/index.ts:189-192`）。这条政策文本的内容值得直接对照：只有目标真正达成才标 `complete`，同一阻塞条件连续至少 N 轮才标 `blocked`，难度、不确定、还有活可干都不算 `blocked`（同文件 `:115-122`）。这与我们要写的「何时该打标记」是同一类判断。
- `tool-web` 的 `tool:web_search` 段用函数式 `text`，按 `ctx.tools.get('web_search', scope, toolSet)` 是否可见决定返回空串还是文案（`.research/dsh-repo/packages/web/tool-web/src/search.ts:352-357`）。
- `tools` 服务自己支持 executor 附带 sections，并在 executor 未被选中时让 `text` 返回空串（`.research/dsh-repo/packages/core/tools/src/index.ts:329-345`）。

副作用有官方说明：段文本与 order 稳定时提示词前缀稳定，任一处变化会让复用从第一个变化的 token 起失效（`.research/dsh-repo/packages/core/system-prompt/README.md:156,170`）。提示词最终以 `system/message` 表面节点提交，到达模型时它是派生历史里的一条消息（`.research/dsh-repo/docs/subsystems/system-prompt.md:46`）。

限制也写在 README 里：**没有面向最终用户的提示词编辑 API**（`no end-user prompt-editing API`，`.research/dsh-repo/packages/core/system-prompt/README.md:179`）。合法贡献者是插件，最终用户没有这个入口。

成本：本插件 `peerDependencies` 目前不含 `@deepseek-ai/dsh-system-prompt`，`static inject` 也没有 `systemPrompt`（`src/service.ts:110`）。要用这条通道，得加一个 peer 依赖、加一个注入项、再处理依赖缺失时的降级，属于 C 级工作（见 §5.3）。

### 3.3 AGENTS.md 属于用户侧配置，插件无法直接写入

`agent-instructions` 包在镜像里没有源码（`packages/` 下没有 `context` 目录）。只能引生成文档：

- 它「discovers AGENTS.md-style instruction files under an agent's own cwd」（`.research/dsh-repo/docs/subsystems/workspace.md:171`）。
- 读到的内容以 `user/message` 的 `source.kind === 'agent-instructions'` 形式进入会话（`.research/dsh-repo/docs/persistence-catalog.md:1389-1393,3160-3174`），落在 user 角色消息这一层，与 system prompt 分开。
- 容量由 `maxBytes` 分别限制用户全局链（`$DSH_HOME/AGENTS.md` 与共享 agents 根目录）与项目链（`.research/dsh-repo/docs/upgrade-guide/v0.2.1-rc.1/agent-instructions-chain-budgets/guide.md:12-24`）。
- 配置项定义在 `packages/context/agent-instructions/src/config.ts:18`（`.research/dsh-repo/docs/config-catalog.md:72-105` 引用该路径），**该文件不在镜像内，本文没有读过它的源码**。

结论：插件想让模型看到某段文字，往用户的 `AGENTS.md` 里写是可以做到的，但那要修改用户文件，且会永久留在用户仓库里。本文不把它算作插件的官方通道，只在 §5.3 列为「用户可选的一步」，由用户自己决定要不要加。

### 3.4 `agent.inject()` 与 `agent/pre-step` 注入（可用，需要 agents 依赖）

`Agent.inject(message: UserMessage): void` 把面向模型的上下文排到下一个 pre-step，不唤醒 driver；运行中的 driver 在最近的后续步边界领取；空闲 driver 留待 follow-up 或 steering 唤醒；取消或销毁可能丢弃待处理上下文（`.research/dsh-repo/packages/core/agent/src/runtime-types.ts:263-270`，另见 `.research/dsh-repo/docs/subsystems/core.md:136-142`）。

`agent/pre-step` 是 waterfall 事件，消费方包括 agent-instructions、repeat-tool-reminder、plan-mode、goal-round-driver 等（`.research/dsh-repo/docs/event-producer-consumer.md:22`）。`tool-skill` 提供了一个完整范例：在 live 会话的第一个 `agent/pre-step` 注入一条持久的 user 角色 `<system-reminder>`，之后每步把当前可见条目与会话日志里最新一条可识别的目录消息比较，只有变化时才产出替换消息（`.research/dsh-repo/docs/subsystems/skills.md:229,231`）。这就是「插件按需提醒模型、并且自己做去重」的官方写法。

这条通道同样要求 `agents` 注入项，本插件现在没有（`src/service.ts:110`）。

### 3.5 Claude Code mod 桥（外部路线，不建议）

DSH 提供 Claude Code 兼容层：mod 可以监听 `prompt.submit`、`session.start`、`turn.complete`、`ui.render`，其中插件提交的 prompt 带 `origin { kind: 'plugin', name }`（`.research/dsh-repo/docs/subsystems/claude-code-mods.md:22-32`）。同一份文档明确说，能改工具清单与权限的 `tool.check` / `tool.describe` / `tool.list` / `tool.register` **不被抛出**，只以 `$.tool.register` / `$.tool.list` 形式提供（同文件 `:31`）。mod 运行在进程内、没有沙箱、拥有进程全部权限，官方建议「mount only mods you would run as a plugin」（同文件 `:16`）。

对本插件不合适：我们已经是一个正常 bundle，改走 mod 桥等于放弃类型契约与依赖注入，换来的只是往 prompt 后面贴块文字，收益不成比例。

### 3.6 通道结论表

| 通道 | 模型能看到 | 本插件现状 | 门槛 | 依据 |
|---|---|---|---|---|
| 工具 `description` | 是，逐字 | 已在用，`clear` 工具待补 | 只改文案 | `.research/dsh-repo/packages/core/tools/src/schema.ts:487-488` |
| `ctx.systemPrompt.section()` | 是，作为 system 消息 | 未用 | 加 peer 依赖 + 注入 `systemPrompt` | `.research/dsh-repo/packages/core/system-prompt/README.md:56`；`src/service.ts:110` |
| `agent.inject()` / `agent/pre-step` | 是，作为 user 消息 | 未用 | 加注入 `agents` | `.research/dsh-repo/packages/core/agent/src/runtime-types.ts:270` |
| 用户 `AGENTS.md` | 是，作为 user 消息 | 不属于插件 | 修改用户文件 | `.research/dsh-repo/docs/subsystems/workspace.md:171` |
| Claude Code mod 桥 | 是，贴在 prompt 后 | 未用，不建议 | 放弃 bundle 形态 | `.research/dsh-repo/docs/subsystems/claude-code-mods.md:22-32` |

## 4 外部做法

九条公开做法，每条给出机制本身。前三条来自 AI 编程助手的工具设计，中间两条来自任务管理系统，后四条来自工具描述与提示词的官方最佳实践。

### 4.1 Claude Code `TodoWrite` 的工具描述

URL：`https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-todowrite.md`（记录的是 ccVersion 2.1.84 的原文）

机制：描述本身分成五块——一句总述、`## When to Use This Tool`（七条可判定条件，其中包含「三步以上的复杂任务」「用户一次给了多个任务」「收到新指令后立刻记下来」）、`## When NOT to Use This Tool`（单步、琐碎、少于三步、纯信息问答）、八个 `<example>`（四个该用、四个不该用，每个都带 `<reasoning>` 解释为什么）、`## Task States and Management`（三种状态的定义与维护纪律）。

值得抄的部分是维护纪律的具体写法：「Update task status in real-time as you work」、「Mark tasks complete IMMEDIATELY after finishing (don't batch completions)」、「Exactly ONE task must be in_progress at any time」、「ONLY mark a task as completed when you have FULLY accomplished it」，并明确列出不得标完成的四种情形（测试失败、实现不完整、有未解决的错误、找不到文件）。

这印证一件事：让模型主动维护状态，靠的是把「什么时候」「什么时候不」「怎么算完成」写成可判定的句子。「请积极使用」这类句子起不到这个作用。

### 4.2 Claude Code 系统提示词里的 Task Management 段

URL：`https://blog.thepete.net/claude-code-system-prompt/`、`https://github.com/anthropics/claude-code/issues/6968`

机制：工具描述之外还有一层系统提示词的强制指令，原文包括「Use these tools VERY frequently to ensure that you are tracking your tasks and giving the user visibility into your progress」以及「If you do not use this tool when planning, you may forget to do important tasks - and that is unacceptable」。

issue 6968 的论点是这段行为长期没有写进公开文档，导致用户对「为什么模型老是在建任务列表」预期不匹配。对我们的启示是：把催促写在系统提示词层效果更强，但也更容易让用户觉得吵，公开说明与可关闭开关要同时到位。

### 4.3 Claude Code 的空 todo 提醒

URL：`https://github.com/anthropics/claude-code/issues/18560`、`https://github.com/afumu/learn-claude-code/blob/ff8acd81/docs/en/s03-todo-write.md`

机制：运行时按「多久没更新」注入提醒消息，原文是「This is a reminder that your todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a todo list please use the TodoWrite tool…」。第二份资料记录的实现是「若模型连续 3 轮以上没有更新 todo，就注入一次提醒」。

这是去抖式催促的现成形态：不按事件触发，按「沉默时长」触发，并且提醒文本自己要求模型不要向用户复述这条提醒。

### 4.4 Claude Code 的 todo 生命周期与按模型开关

URL：`https://code.claude.com/docs/en/agent-sdk/todo-tracking`

机制：生命周期是 Created(pending) → Activated(in_progress) → Completed → Removed，删除走 `TaskUpdate` 的 `status: 'deleted'`。文档同时说明两件事：新模型不需要书面的 todo 列表；`TodoWrite` / `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` 默认只在部分模型上提供，其余模型要用 `allowedTools` 或 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 显式开启。

也就是说，「让模型主动维护状态」被做成了按模型能力开关的部署配置，默认并不开启。这与本插件 `autoInfer` 是必填配置项（`src/service.ts:62`）的思路一致。

### 4.5 OpenAI Codex 的 `update_plan`

URL：`https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/plan_spec.rs`、`https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide`

机制：工具描述只有三句话——「Updates the task plan.」「Provide an optional explanation and a list of plan items, each with a step and status.」「At most one step can be in_progress at a time.」，参数 `status` 用枚举 `pending` / `in_progress` / `completed`。真正决定「什么时候用、什么时候收尾」的政策写在模型提示词层：「Skip using the planning tool for straightforward tasks (roughly the easiest 25%).」「Do not make single-step plans.」「When you made a plan, update it after having performed one of the sub-tasks.」

最值得注意的是收尾条款：「Plan closure: Before finishing, reconcile every previously stated intention/TODO/plan. Mark each as Done, Blocked (with a one-sentence reason and a targeted question), or Cancelled (with a reason). Do not end with in_progress/pending items.」

这是两层分工的范例：工具描述只写不可协商的约束，使用时机与收尾纪律放在提示词层。对本插件的含义是，`set_session_status` 的描述可以只承担「何时该打、何时不该打」，而「每轮收尾必须复查状态」这类跨工具的纪律更适合放进提示词段（§3.2）。

### 4.6 Cursor Rules

URL：`https://cursor.com/docs/rules`

机制：「Rules provide system-level instructions to Agent」，分 Project Rules（`.cursor/rules` 下的 `.mdc`）、User Rules、Team Rules、`AGENTS.md` 四类。生效方式由 frontmatter 决定：`alwaysApply: true` 恒定注入、`globs` 命中文件时注入、只给 `description` 时由 Agent 自己判断相关性后拉取。文档明确「When applied, rule contents are included at the start of the model context」。

这是用户侧配置加相关性检索注入的形态，不属于插件 API。对我们的含义是：如果用户愿意，他可以在自己的 `AGENTS.md` 里加一段「何时该打标记」的规则，效果等价于 §3.3 那条通道，且不需要插件做任何事。

### 4.7 Linear Triage Intelligence

URL：`https://linear.app/docs/triage-intelligence`、`https://linear.app/changelog/2025-09-19-auto-apply-triage-suggestions`

机制：用 LLM 推断 issue 的属性与关联，「Every future issue that enters triage is assessed against the rest of your data. This allows Triage Intelligence to proactively surface suggested issue properties and relationships.」建议支持 accept、decline、查看理由三种操作。自动应用分三档：show（只显示）、hide（不显示）、auto-apply（直接写），规则可以按属性类型与具体值配置，子团队继承父团队规则并允许覆盖。

自动应用之后的可追溯性也做了：「Properties that have been automatically applied are clearly marked in the suggestions header. Hover over them to review the reasoning or to make changes.」

对我们的含义是三点：自动写入要标注来源（本插件已有 `source` 三值）、要能看理由（`note` 与 `autoReason` 承担这个职责）、要能改回去（`clear_session_status` 与悬停卡选择承担这个职责）。

### 4.8 Jira Triage Agent

URL：`https://support.atlassian.com/jira-software-cloud/docs/use-the-jira-triage-agent-to-categorize-and-route-work-items/`

机制：agent 分析工作项的上下文并与同类工作比较，给出字段更新、重复项识别、关联项建议。交互形态是「bulk field update card」，逐条 Accept / Reject，可以悬停看 reasoning 与 proposed field updates，也可以 Accept all 或 Refine in Chat。还能把 agent 挂到看板的某一列，工作项进入该列就自动启动。

与 Linear 的差别在于默认更保守：建议先落成可批量审阅的卡片，人确认之后才写字段。对「自动标记会不会太吵」这个问题，这是一种降低干扰的设计：把自动结果先当建议呈现。

### 4.9 工具描述与提示词的官方最佳实践

- Anthropic《Writing effective tools for agents》（`https://www.anthropic.com/engineering/writing-tools-for-agents`，2025-09-11）：「Because these are loaded into your agents' context, they can collectively steer agents toward effective tool-calling behaviors.」建议按「你会怎么向团队新人描述这个工具」来写，参数名要无歧义（用 `user_id` 这类写法，避免 `user`），并给出实测：「Even small refinements to tool descriptions can yield dramatic improvements. Claude Sonnet 3.5 achieved state-of-the-art performance on the SWE-bench Verified evaluation after we made precise refinements to tool descriptions.」
- Anthropic 工具定义文档（`https://docs.claude.com/en/docs/agents-and-tools/tool-use/implement-tool-use`）：「Provide extremely detailed descriptions. This is by far the most important factor in tool performance.」要求写清工具做什么、何时该用与何时不该用、每个参数的含义、注意事项，并建议每个工具描述至少三四句话；同时建议合并相关操作、只返回高信号信息。
- OpenAI 函数调用指南（`https://platform.openai.com/docs/guides/function-calling`）：「Use the system prompt to describe when (and when not) to use each function. Generally, tell the model exactly what to do.」「Include examples and edge cases, especially to rectify any recurring failures. (Note: Adding examples may hurt performance for reasoning models.)」「Pass the intern test.」并建议开局可见函数少于 20 个。函数定义注入 system message，计入上下文与输入计费。
- GitHub Copilot 自定义指令（`https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions`、`https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/`）：仓库级 `AGENTS.md` 由 coding agent 自动读取，属于用户与仓库侧配置。

OpenAI 那条括号里的提醒对本插件有直接约束：加 `<example>` 可能对推理型模型反而有害。所以 §6 给的两个版本里，完整版带例子，精简版不带。

## 5 分档建议

三档按「改动范围」划分，不按工作量划分。A 级只动文案，B 级动推断逻辑，C 级要跨包依赖。

### 5.1 A 级：只改工具描述文案

范围：`src/service.ts:417-424` 的 `set_session_status` 描述、`src/service.ts:457` 的 `clear_session_status` 描述。不动任何逻辑、不动依赖、不动类型。

要做的四件事：

1. **把 `clear_session_status` 补成五段式。** 现在只有一句 `Remove the status mark from the current session.`（`src/service.ts:457`），模型没有任何依据判断「什么时候该清除」。至少要写清：标记写错了要清除、任务从阻塞恢复要继续时清除、不要用清除代替改状态。
2. **把触发时刻写具体。** 现有 `WHEN TO USE` 是「the conversation reaches a state another person needs to see」（`src/service.ts:419`），这是抽象表述。改成枚举具体时刻（等用户回答、子任务还在跑、被外部条件卡住、工作确认完成），每条配一个状态名。
3. **在 `WHEN NOT TO USE` 里加频次约束。** 现在只写了「不要把正常结束的会话标成 done」，没有写「不要每轮都打」。补一句「普通问答不需要打标记」。
4. **`EXAMPLES` 保留但收紧。** 现在四条例子（`src/service.ts:423`）覆盖等回答、子代理、完成、清除，方向对。可以补一条反例，说明「测试还失败时不要标 done」。

预期收益与代价：收益是把「何时调用」从抽象变成可判定，这是 §4.1 与 §4.9 共同指向的结论。代价是描述变长，每次请求都多几个 token，且按 §4.9 的提醒，例子对推理型模型可能有害。所以 A 级落地时应该同时准备精简版（§6.2），用部署配置切换或直接选一个。

风险：A 级不能解决「模型压根不想打标记」的问题。工具描述能提高调用准确率，但「要不要主动做这件事」很大程度取决于模型自身的工具调用倾向，这部分不在插件控制范围内。

### 5.2 B 级：加推断规则与去抖

范围：`src/inference.ts`、`src/contracts.ts` 的规则码、`src/service.ts` 的 `#observe`。不引入新依赖。

按优先级排五条：

1. **修 `job/settled` 的 subjectId。** 把 `src/inference.ts:91` 的 `data.id` 改成 `data.jobId`，依据 `.research/dsh-repo/docs/persistence-catalog.md:3900-3921`。同步把 `tests/inference.test.mjs:85` 的伪造负载换成真实字段。这是修缺陷，不算新功能。
2. **修 `goal/change` 的读取层级。** 把 `src/inference.ts:94` 改成读 `data.goal.phase`，依据 `.research/dsh-repo/packages/goal/goal/src/domain.ts:23-44` 与 `.research/dsh-repo/packages/goal/goal/src/types.ts:59-69`。同步改 `tests/inference.test.mjs:90`。
3. **用掉 `tool-result-progress`。** 这个码已经声明（`src/contracts.ts:26`）但从未产出。可落地的规则是：`tool/result` 事件里 `error` 存在时推断 `blocked`（`tool/result` 负载含 `error?: { name, code, reason }`，见 `.research/dsh-repo/packages/core/session/src/types.ts:383-393`）。注意不要按「任意工具结果」推断 `todo`，那会把每个成功的读文件都变成状态变更，噪音不可接受。
4. **用掉 `session-stop-invoked`。** 同样已声明未实现（`src/contracts.ts:29`）。`workspace/session-stop` 是 parallel 事件，producer 在 `packages/workspace/workspace/src/index.ts:147`，消费方含 agent、jobs、schedule、subagent（`.research/dsh-repo/docs/event-producer-consumer.md:102`）。**但该包不在镜像内，本文没有读过它的负载定义**，落地前必须先取真实负载，不能照现在的扁平写法猜。
5. **加同会话去抖。** 现状是同状态同理由不重写（`src/inference.ts:111`），但状态来回切换会反复写行并刷新 `insertedAtMs`。可以加一条窗口规则：同一会话在 N 毫秒内（例如 5000ms）从 `A` 切到 `B` 又切回 `A` 时，第二次 `A` 不写。这需要在 `#observe`（`src/service.ts:276-293`）里读上一次写入时间，或在 `MarkRecord` 上加一个 `previousStatus` 字段（要动 `src/types.ts` 与域版本，成本上升）。更轻的做法是不加字段，直接用 `insertedAtMs` 与 `Date.now()` 的差判断。

第 5 条要谨慎：去抖会把「真实的快速状态变化」也吃掉。如果用户正在等一个两秒就失败的子任务，去抖反而让状态停在错误的值上。建议先只对 `todo` ↔ `stopped` 这一对做去抖，其他组合不动。

B 级共同的验收要求：新增规则必须配真实负载形状的单元测试，不能再用扁平伪造负载。`tests/inference.test.mjs` 现在所有 `job/settled` 与 `goal/change` 用例都是扁平的（`:85`、`:90`），这类测试通过了也不代表真实会话里会命中。

### 5.3 C 级：需要 DSH 侧支持

C 级的三条现在都做不了，原因各自不同。

**C-1：把「每轮收尾复查状态」写进提示词段。** 技术上可行（§3.2 的 `ctx.systemPrompt.section()` 对仓库外插件开放，README 明写 `External contributions may use any finite order.`，`.research/dsh-repo/packages/core/system-prompt/README.md:56`），但需要新增 `@deepseek-ai/dsh-system-prompt` 这个 peer 依赖并把 `systemPrompt` 加进 `static inject`（现在只有四项，`src/service.ts:110`）。做不了的原因是依赖面扩大：这个包不在当前 `peerDependencies` 里，装上之后如果用户环境的 DSH 版本低于该包首次发布的版本，插件会整个 pending 并停在这个状态，没有降级路径。按本项目已有的教训（`docs/project-memory.md` 的 `connection` 依赖事故，`src/service.ts:103-109` 的注释记录了那次 `pending (waiting for service: connection)`），新增必需依赖需要一次完整的版本矩阵验证，工作量远大于改一行依赖声明。

**C-2：在 `agent/pre-step` 注入提醒消息。** 同样可行（§3.4），同样要新增 `agents` 注入项。额外的难点是 `agent.inject()` 的语义：空闲 driver 不会因为注入而醒来，取消或销毁可能丢弃待处理上下文（`.research/dsh-repo/packages/core/agent/src/runtime-types.ts:263-270`）。也就是说这条通道只能提醒「正在跑的会话」，对「已经停下但没打标记的会话」无能为力。而「已经停下没打标记」恰恰是最需要提醒的场景。

**C-3：让推断结果参与模型决策（双向）。** 现在推断是单向的：事件 → 状态。我们没法让模型知道「宿主刚刚把你的会话推断成了 blocked，你确认一下」。要做到这一点，需要在模型下一次 pre-step 时注入一条带当前标记的消息，这仍然回到 C-2 的通道，且需要一个「已确认/待确认」的中间态，属于数据模型扩展。

**C-4：把提醒做成可配置的催视频率。** DSH 内有现成机制可对照：`repeat-tool-reminder` 的 `thresholds` 默认 `[3,5,8]`，按连续重复计数触发提醒，配置错误在加载期就抛错（`.research/dsh-repo/docs/config-catalog.md:2888-2922`）。但那是 DSH 自己的包（`packages/guard/repeat-tool-reminder`，不在镜像内），我们不能复用它的逻辑，只能在自己的插件里重写一份，且重写之后仍然需要 C-2 的注入通道才能把提醒送到模型。

结论：C 级三条共享同一个前提——插件必须先合法持有 `systemPrompt` 或 `agents` 注入项，并且要有依赖缺失时的降级路径。在此之前，A 级与 B 级是唯一能立刻落地的范围。

## 6 tool 描述改写文本

三段英文文本，可直接替换 `src/service.ts` 里对应的 `description`。结构保持五段式：总述、`WHEN TO USE`、`WHEN NOT TO USE`、`DO NOT USE FOR`、`USAGE`、`EXAMPLES`。第一段与第二段是 `set_session_status` 的两个版本，第三段是 `clear_session_status`。

### 6.1 `set_session_status` 完整版（带例子）

替换 `src/service.ts:417-424` 的数组，写法保持「每段一个字符串再 `join(' ')`」：

```ts
description: [
  'Set or replace the status label on the current session so the session list shows where it stands.',
  'WHEN TO USE: call it at one of these concrete moments. (1) You are about to stop and need an answer, a decision, or a credential from the user: status awaiting-answer, with a note naming what you need. (2) You started a background job or a subagent and are handing control back before it settles: status pending-subagent, with its id as subjectId. (3) You cannot proceed until someone else changes something: status blocked, with a note naming the concrete blocker. (4) The user asked for a change and the work is finished and verified: status done. (5) The user asked you to hold the work for later: status todo. (6) You produced something that needs a human decision before it ships: status review. (7) You are handing back a partial result and explaining why you stopped: status stopped. (8) You want a reaction to a proposal before continuing: status feedback.',
  'WHEN NOT TO USE: do not call it after every reply. A turn ending means this reply finished, not that the user goal finished, so a plain answer to a plain question needs no mark. Do not mark done while a test fails, while a step is still unverified, or while a background job you started is still running. Do not mark blocked for something you can resolve yourself in the next step.',
  'DO NOT USE FOR: do not use it to narrate progress inside a single turn, to duplicate what the todo list already records, or to record a guess about what the user might want next. Marks written here are explicit: host inference never overwrites them, so a careless mark stays visible until you or the user replaces it.',
  'USAGE: pass exactly one of todo, done, stopped, blocked, review, pending-subagent, awaiting-answer, feedback. Marks written through this tool carry source agent, which the hover card shows as a model decision. Pass note for anything a reader could not infer from the status alone, and subjectId when the mark points at a specific turn, goal, job, or subagent. Calling it again replaces the previous mark instead of stacking a second one.',
  'EXAMPLES: the user asks you to wait for their answer, call with status awaiting-answer and a note naming the question. You launch a subagent and return control, call with status pending-subagent and its id as subjectId. The user asks for a fix, you applied it and the tests pass, call with status done. The tests still fail and you cannot tell why, call with status blocked and a note naming the failing test. To drop a mark that is no longer true, call clear_session_status instead of overwriting it with a placeholder status.',
].join(' '),
```

### 6.2 `set_session_status` 精简版（不带例子）

同样的位置，给不想付例子 token 的部署用。按 OpenAI 的提醒，例子对推理型模型可能有害（§4.9），所以这个版本去掉 `EXAMPLES` 段，把关键判断压进 `WHEN NOT TO USE`：

```ts
description: [
  'Set or replace the status label on the current session so the session list shows where it stands.',
  'WHEN TO USE: when the conversation reaches a state another person needs to see before reading the transcript. Waiting on the user: awaiting-answer. Background work still running after you hand control back: pending-subagent. Stuck on something only someone else can change: blocked. Work finished and verified: done. Work deliberately deferred: todo. Work needing a human decision before it ships: review. Partial result handed back with a reason: stopped. Proposal awaiting a reaction: feedback.',
  'WHEN NOT TO USE: not after every reply. A finished turn is not a finished goal, so a plain answer needs no mark. Never mark done while a test fails, a step is unverified, or a job you started is still running. Never mark blocked for something you can resolve in the next step.',
  'DO NOT USE FOR: not for narrating progress inside one turn, not for duplicating the todo list, not for guessing what the user wants next. Marks written here are explicit and host inference never overwrites them, so a careless mark stays until someone replaces it.',
  'USAGE: pass exactly one of todo, done, stopped, blocked, review, pending-subagent, awaiting-answer, feedback. Marks written here carry source agent, which the hover card shows as a model decision. Pass note when the status alone would not tell a reader why, and subjectId when the mark points at a specific turn, goal, job, or subagent. Calling it again replaces the earlier mark.',
].join(' '),
```

### 6.3 `clear_session_status` 五段式

替换 `src/service.ts:457` 的单句：

```ts
description: [
  'Remove the status mark from the current session so the session list stops showing a state that is no longer true.',
  'WHEN TO USE: the mark you or the user set no longer describes the session. Work you marked blocked is unblocked and you are continuing. A subagent you marked pending-subagent has settled and you are taking the result. The user says the work is no longer deferred. You set a mark by mistake.',
  'WHEN NOT TO USE: do not clear a mark just to set a different one, call set_session_status instead so the new state is recorded with its reason. Do not clear a mark the user set by hand unless the user asked for it, their mark records a decision you cannot see. Do not clear and re-set in the same reply to simulate an update.',
  'DO NOT USE FOR: not for hiding a state you dislike, not for resetting the session before a new task, and not for cleaning up marks that belong to other sessions, this tool only touches the session it is called from.',
  'USAGE: takes no arguments. Returns deleted true when a mark existed and false when there was nothing to remove, so a false result means the session was already unmarked rather than that the call failed. A cleared session can be marked again by host inference later, clearing is not a permanent opt-out.',
  'EXAMPLES: you marked the session blocked on a missing credential, the user supplied it, call this before continuing. A pending-subagent mark is stale because the subagent settled, call this and then set the status that matches the new state. The user says they will handle the remaining work themselves, call this so the list stops claiming you are waiting on them.',
].join(' '),
```

三段文本的共同取舍：都避免写「请积极使用」这类无法判定的句子，都给出「什么时候不该用」，都说明写入后不会被推断覆盖这一事实（`src/inference.ts:108-112`），因为这条事实会影响模型对「写错了怎么办」的判断。

## 7 风险与抑制

过度主动打标记会造成四类干扰，每类都有对应的抑制手段，其中三条已经在代码里。

### 7.1 状态噪音：每个会话都带一个标记，列表失去信息量

表现：模型每轮都打标记，或者把每个读文件、跑测试的动作都变成状态变更。列表里全是标记，用户无法靠标记区分「需要我处理的」与「正在跑的」。

抑制：

- `shouldApplyInference` 只允许 `auto` 行被推断改写（`src/inference.ts:108-112`），模型写入的 `agent` 行不会被推断反复覆盖，避免「模型写一个、推断改一个」的抖动。
- 同状态同理由不重写（`src/inference.ts:111`），所以重复的 `todo_write` 不会每次都刷新行。
- A 级文案里的「不要每轮都打」与 B 级第 5 条去抖，是这一类的正面约束。

### 7.2 错误状态被当成事实：模型把没做完的活标成 done

表现：模型在测试还失败时标 `done`，用户看到列表里的完成标记就不再检查。

抑制：

- 文案层写死判据：`WHEN NOT TO USE` 明确列出「测试失败、步骤未验证、后台任务还在跑」三种不得标 `done` 的情形（§6.1、§6.2）。这是 Claude Code 的做法（§4.1 的「ONLY mark a task as completed when you have FULLY accomplished it」）。
- 自动过期只作用于 `auto` 行（`src/inference.ts:114-118`），模型写的 `agent` 行不会自己消失。这一条是双刃：错误标记不会自动消失，所以文案必须把判据写清楚，不能指望过期兜底。

### 7.3 自动推断与模型判断打架

表现：模型把会话标成 `review`，随后一条 `job/settled failed` 事件把状态推断成 `stopped`，用户看到的状态与模型说的不一致。

抑制：

- 现有实现已经挡住了：`current.source !== 'auto'` 时推断直接返回 false（`src/inference.ts:110`），模型与用户的标记都优先于推断。
- 反向不成立：推断写的行可以被模型覆盖，这是预期的（模型有更多上下文）。但 `putMark` 本身不做优先级检查（`src/service.ts:227-229`），保护只存在于 `#observe` 这一条路径上。B 级新增规则时必须继续走 `#observe`，不要新开一条直接 `putMark` 的路径。

### 7.4 提醒本身成为干扰：模型反复被告知「你该打标记了」

表现：如果将来上 C 级的 pre-step 注入，模型可能每步都被提醒一次，既浪费 token 又可能让它为了满足提醒而乱打标记。

抑制：

- 参照 `tool-skill` 的做法：只在观察结果变化时产出替换消息，未变化不注入（`.research/dsh-repo/docs/subsystems/skills.md:231`）。
- 参照 `repeat-tool-reminder` 的阈值式触发（默认 `[3,5,8]`，`.research/dsh-repo/docs/config-catalog.md:2888-2922`）：按「连续多少轮没有更新状态」触发，不用事件数量作为触发依据。
- 参照 Claude Code 空 todo 提醒的写法（§4.3）：提醒文本里自己要求模型不要向用户复述提醒内容，避免提醒泄漏成用户可见的噪音。
- 提示词段有缓存代价（`.research/dsh-repo/packages/core/system-prompt/README.md:156`），所以 C 级文案必须是静态文本或按工具可见性切换，不要按每步状态变化重写，否则每次变化都会打掉前缀复用。

### 7.5 手动标记被覆盖的风险

现状是安全的：用户点击写入 `manual`、模型工具写入 `agent`、推断写入 `auto`，前两者都在 `EXPLICIT_SOURCES` 里（`src/contracts.ts:48-50`），推断只改 `auto`。但有一条边界要写进文档提醒后来者：`clear_session_status` 删除的是整行，不区分来源（`src/service.ts:471-475` 调 `clearMark`），所以模型可以清掉用户手动设的标记。§6.3 的文案里用「Do not clear a mark the user set by hand unless the user asked for it」约束这一点，但这是文案约束，代码层面没有对应检查。要变成代码约束，得在 `clearMark` 之前读一次 `getMark` 并判断 `source`，属于 B 级可选增强。

## 8 参考链接表

### 8.1 DSH 官方镜像（本地）

| 用途 | 位置 |
|---|---|
| `defineTool` 的 description 契约 | `.research/dsh-repo/packages/core/tools/src/schema.ts:484-546` |
| 工具 schema 交给 systemPrompt | `.research/dsh-repo/packages/core/tools/src/index.ts:113-117`、`:329-345` |
| `SystemPrompt` 服务与三个注册入口 | `.research/dsh-repo/packages/core/system-prompt/src/index.ts:435,484,519,551` |
| 外部插件可用任意有限 order | `.research/dsh-repo/packages/core/system-prompt/README.md:56` |
| 提示词缓存代价 | `.research/dsh-repo/packages/core/system-prompt/README.md:156,170` |
| 没有面向最终用户的提示词编辑 API | `.research/dsh-repo/packages/core/system-prompt/README.md:179` |
| 提示词以 system/message 提交 | `.research/dsh-repo/docs/subsystems/system-prompt.md:46` |
| `tool-goal` 的工具 + 政策段双层写法 | `.research/dsh-repo/packages/goal/tool-goal/src/index.ts:115-124,189-192` |
| `tool-web` 按可见性返回空串 | `.research/dsh-repo/packages/web/tool-web/src/search.ts:352-357` |
| `todo_write` 的分段描述与参数结构 | `.research/dsh-repo/packages/todo/tool-todo/src/index.ts:45-67,136-137`；`.../src/types.ts:22-34` |
| `todo_write` 模型可见全文 | `.research/dsh-repo/docs/tool-catalog.md:2440-2442` |
| `agent.inject()` 语义 | `.research/dsh-repo/packages/core/agent/src/runtime-types.ts:263-270`；`.research/dsh-repo/docs/subsystems/core.md:136-142` |
| `agent/pre-step` 是 waterfall | `.research/dsh-repo/docs/event-producer-consumer.md:22` |
| `tool-skill` 的 pre-step 注入与去重 | `.research/dsh-repo/docs/subsystems/skills.md:229,231` |
| `repeat-tool-reminder` 阈值式提醒 | `.research/dsh-repo/docs/config-catalog.md:2888-2922` |
| `turn/end` 各 kind 的定义 | `.research/dsh-repo/packages/core/session/src/types.ts:206-235` |
| `interrupted` 不实时发出 | `.research/dsh-repo/packages/core/session/src/types.ts:221-227` |
| `tool/call` 与 `tool/result` 负载 | `.research/dsh-repo/packages/core/session/src/types.ts:369,383-393` |
| `job/settled` 负载与 status 取值 | `.research/dsh-repo/docs/persistence-catalog.md:3900-3921,5784-5792` |
| `goal/change` 负载层级 | `.research/dsh-repo/packages/goal/goal/src/domain.ts:23-44`；`.../src/types.ts:44-69` |
| `workspace/session-stop` | `.research/dsh-repo/docs/event-producer-consumer.md:102` |
| AGENTS.md 由 agent-instructions 读取 | `.research/dsh-repo/docs/subsystems/workspace.md:171`；`.research/dsh-repo/docs/persistence-catalog.md:1389-1393,3160-3174` |
| 插件记录写入的禁令 | `.research/dsh-repo/packages/core/session/README.md:70-72` |
| Claude Code mod 桥事件表 | `.research/dsh-repo/docs/subsystems/claude-code-mods.md:22-32` |
| `ctx.systemPrompt` 是 core 级接缝 | `.research/dsh-repo/docs/capability-seams.md:716` |

### 8.2 外部资料

| 主题 | URL |
|---|---|
| Claude Code `TodoWrite` 工具描述原文 | https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-todowrite.md |
| Claude Code 系统提示词 Task Management 段 | https://blog.thepete.net/claude-code-system-prompt/ |
| 该段行为未写入公开文档的讨论 | https://github.com/anthropics/claude-code/issues/6968 |
| Claude Code 空 todo 提醒原文 | https://github.com/anthropics/claude-code/issues/18560 |
| 连续三轮未更新即提醒的实现记录 | https://github.com/afumu/learn-claude-code/blob/ff8acd81/docs/en/s03-todo-write.md |
| Claude Code todo 生命周期与按模型开关 | https://code.claude.com/docs/en/agent-sdk/todo-tracking |
| Claude Code 状态行延迟问题 | https://github.com/anthropics/claude-code/issues/26375 |
| Codex `update_plan` 工具定义源码 | https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/plan_spec.rs |
| Codex 提示词指南（Plan tool 与收尾条款） | https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide |
| Cursor Rules | https://cursor.com/docs/rules |
| Linear Triage Intelligence | https://linear.app/docs/triage-intelligence |
| Linear 自动应用建议的 changelog | https://linear.app/changelog/2025-09-19-auto-apply-triage-suggestions |
| Jira Triage Agent | https://support.atlassian.com/jira-software-cloud/docs/use-the-jira-triage-agent-to-categorize-and-route-work-items/ |
| Anthropic《Writing effective tools for agents》 | https://www.anthropic.com/engineering/writing-tools-for-agents |
| Anthropic 工具定义最佳实践 | https://docs.claude.com/en/docs/agents-and-tools/tool-use/implement-tool-use |
| OpenAI 函数调用最佳实践 | https://platform.openai.com/docs/guides/function-calling |
| GitHub Copilot 自定义指令 | https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions |
| Copilot coding agent 支持 AGENTS.md | https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/ |
| 会话视图缺进度信息的观察 | https://taskhold.com/guides/monitor-coding-agent-progress |

### 8.3 本仓库其他相关文档

- `docs/research/04-session-state-taxonomy.md`：八种状态的语义边界。
- `docs/research/06-market-and-practices.md`：Claude Code Agent View、Codex 痛点、agent 主动汇报四件事。
- `docs/research/10-vnext-evaluation.md`：自动推断规则清单与 AI 未调用工具的四条原因，本文 §2 与 §5 在其基础上更新到当前代码状态。
- `docs/research/11-agent-team-practices.md`：本文的写作格式参照。
