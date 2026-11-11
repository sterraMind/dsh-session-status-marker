# Host 端插件可用扩展点调研

> **文档版本**：v1.0.2 · 2026-11-12（对应插件 1.0.2）

> **V2 修订（重要）**：本文记录的是官方 API 的客观存在性，但「结论速览」里把 `SessionEventMap` declaration merging / `ignorable?: true` / `PluginRecordMap` 列为本插件**可直接用**的扩展点是 V1 误判。深入读持久化源码后确认：**仓库外（out-of-tree）bundle 没有任何合规途径写出带 `ignorable: true` 的自定义会话事件**——`Session.append` 无该参数（`packages/core/session/src/index.ts:806-837`），`appendPluginRecord` 被明禁（`packages/core/session/README.md:70-74`），而读路径对未知 required 事件 fail-closed（`packages/session/session-persistence/src/storage-contract.ts:75-80`）。本插件最终实现改走 `ctx.storageDomain` + `ctx.connection.fetch` + `ctx.slots.inject`，详见 `docs/architecture.md` §3。下面 §5/§6 的事实描述保留作为「为什么不能用」的证据，但不再作为选型建议。

本文档基于 `.research/dsh-repo/` 本地镜像整理，只以真实文档源码为事实来源。目标是梳理 DSH Host 端插件可用的扩展点，供后续设计「用户手动标记会话状态 + AI 自主标记」插件时使用。每处关键 API 均给出实际文件路径与行号；不确定的地方明确标注「需实测确认」。

## 结论速览

**可直接用于本插件的扩展点（V2 最终选型）：**

- 插件生命周期：`ctx.effect()` 注册清理；class-plugin 用 `[Service.init]` 做异步初始化（见 §1、§3）。
- Config schema：`z` from `@deepseek-ai/schemastery` 声明必填字段，load-time fail loud（见 §2）。
- Service：`extends Service` 暴露宿主侧服务，配合 `declare module '@deepseek-ai/cordis'` 实现 declaration merging（见 §3）。
- 事件观察：所有 turn/step/tool 类事件统一走 `'session/event'` Cordis event + `event.type` 判别 + `{global:true}`（见 §4）。
- **持久化：`ctx.storageDomain.open(defineDomain(...))`**，`KvTable` 同步读 / 异步写，host-side sidecar 不进模型输入（`docs/subsystems/storage.md:5,145-171`）。
- **Host→Client：`ctx.connection.fetch.register(ConnectionFetchRoute)`** exact route，owner-peer 认证围栏（`packages/client/connection/src/rpc.ts:146-166`）。
- Tool：`defineTool` 单 canonical JSON 值，presentCall/presentResult 纯函数约束，tools/pre-execute 等策略扩展点（见 §8）。
- Client 挂载：`ctx.slots.inject` + `ctx.locale.register`（见 `docs/research/02-client-ui.md`）。
- 官方贴近先例：`session-title` 的 log-only 事件**只因它是 in-repo 包**才可行，`sessionProjections` 与 `action-cards` 的 projection 模式同样只作 API 参考（见 §10）。

**V1 误判、不能用于本插件的扩展点（保留为反面证据）：**

- 自定义 `SessionEventMap` 事件 / `ignorable?: true`：out-of-tree 写不出合规 ignorable 事件，读路径 fail-closed（见文档顶部 V2 修订说明与 §5）。
- `PluginRecordMap` / `appendPluginRecord`：`packages/core/session/README.md:70-74` 明确禁止仓库外调用。
- 标准 Typert Remote：需主仓库 `generate-typert.ts` 生成 5 个产物，独立 bundle 无法复现（`docs/subsystems/api-gateway.md:110-123`）。
- `agent/pre-step` waterfall 作为 append 时机：本项目不写会话事件，此约束作废；该 hook 仍可用于其它需要追加事件的插件（见 §9）。

**其它高风险 / 需注意事项：**

- **Agent loop 内部不能直接写 log**：running agent 时唯一的 append 点是 `agent/pre-step` 的 prepend listener；其它时机写事件可能被丢弃或未持久化（plan.md:17）。
- **PluginRecordMap 调用限制严格**：production source 只能在 `packages/experimental/` 下调用 `appendPluginRecord()`；`verify-plugin-record-callers` gate 拒绝其他 caller（session/src/index.ts:479-481）。
- **log-only 事件不进模型输入**：如 `session/title` 的 README 明确说 "never enters the session surface, deriveMessages(), system prompt, tool schemas, or request prefix"（session-title/README.md:123），所以想“让 AI 感知到状态”必须走其它路径（提示词注入、tool、status notice 等）。
- **SessionProjectionMap.registry 只在内存**：重启需要 refold，state v2 迁移需处理 backward compat（session-projection/README.md:173-174）。
- **Tool presentCall/presentResult 是纯函数**：不得做 I/O、读 session、调 clock/random；diff 必须 derive 自 args（adding-a-tool.md:87-90）。
- **Service 消失 → dependent plugin 自动 dispose + reload**：不要假定依赖永远在（service.md:104-109）。
- **Waterfall 必须调 next()**：否则短路 pipeline（events.md:66-77）。

**待实测确认的点：**

- `SessionProjectionMap.agentTeam` 的实际 declaration 位置在本镜像 packages/ 下未找到（grep 无匹配），建议实测时检查运行时 `packages/team/agent-team` 是否已 symlink 进镜像。
- `defineTool` 的 `output.render` 与 `presentationMeta` 如何影响模型可见内容（adding-a-tool.md 描述但无示例编译证明）。
- `exec.agent.inject()` 是否会在 `idle agent` 时被唤醒（文档说 "does not wake an idle agent"，需实测）。

---

## §1 · 插件最小形态

DSH 插件三种表达形式：函数导出、默认对象、class extends Service。

```ts
export const name = 'hello-plugin'
export function apply(ctx: Context) {
  ctx.on('foo/bar', () => void)
  return ctx.effect(() => {
    const timer = setInterval(...)
    return () => clearInterval(timer)
  })
}
```

- 函数导出 / inject / effect — `docs/user/develop/basic/index.md:22-24`、`:38-44`、`:76-84`、`:95-101`
- HMR 自动卸载旧实例；registered listeners/tools/timers 自动清理 — `docs/user/develop/basic/index.md:68-69`
- 对象形式 — `docs/user/develop/basic/index.md:114-121`
- class extends Service — `docs/user/develop/basic/index.md:127-136`

---

## §2 · Config schema（required 无默认值原则）

配置使用 `@deepseek-ai/schemastery` Schema，接口与同名录入 schema 一并导出；`required()` 字段不提供 `.default(...)`，invalid config 在 load-time fail loud。

```ts
import Schema from '@deepseek-ai/schemastery'
export interface Config { apiKey: string }
export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
})
```

- Schema import + same-named export — `docs/user/develop/basic/config.md:13`、`:17-27`
- required 字段无 default（对照 default 字段在 line 24-26）— `docs/user/develop/basic/config.md:63-64`
- cordis.yml 通过 `config` 字段提供 — `docs/user/develop/basic/config.md:39-43`
- Load-time validation fail loud — `docs/user/develop/basic/config.md:74`、`:78-96`
- Design principle："Do not hardcode tunable values" — `docs/user/develop/basic/config.md:78-92`

---

## §3 · Service

插件可将共享逻辑封装为 Service；通过 declaration merging 挂到 `Context`；可选依赖用 `ctx.get()`；被依赖 Service 消失时 dependent plugin 自动 dispose + reload。

```ts
import { Service } from '@deepseek-ai/cordis'
export class MetricsService extends Service {
  constructor(ctx: Context) { super(ctx, 'metrics') }
}
declare module '@deepseek-ai/cordis' {
  interface Context { metrics: MetricsService }
}
// 可选依赖
const m = ctx.get('metrics')
```

- extends Service + super — `docs/user/develop/framework/service.md:39-52`
- Declaration merging — `docs/user/develop/framework/service.md:70-76`
- `ctx.get()` 可选依赖 — `docs/user/develop/framework/service.md:91-99`
- 服务消失 → auto dispose + reload — `docs/user/develop/framework/service.md:104-109`
- 仓库内 declaration merging 样例多处在 `packages/core/agent/src/types.ts` 等处（见 docs 参考）

---

## §4 · Events 四种派发语义 & session/event 监听点

Cordis events 有 emit / bail / serial / waterfall 四种语义；waterfall 必须调 `next()`，否则会短路 pipeline。类型化 Events 用 declaration merging。

重要区分：`turn/*`、`step/*`、`tool/call`、`tool/result`、`compaction/*` 等 **不是同名 Cordis event**，它们是 **durable session-event type**；要观察它们必须监听 `session/event` 并检查 `event.type`。

```ts
interface Events {
  'my-plugin/ready': (payload: unknown) => void
}
ctx.on('session/event', (session, event) => {
  if (event.type === 'turn/end') console.log(event.data)
})
```

- 四种语义 emit/bail/serial/waterfall — `docs/user/develop/framework/events.md:27-77`
- Waterfall 必须调 next() — `docs/user/develop/framework/events.md:64-81`（含 warning block）
- 类型化 Events declaration merging — `docs/user/develop/framework/events.md:87-100`
- `turn/*` 等是 session-event type 非 Cordis event — `docs/user/develop/framework/events.md:104-106`
- Cordis event 命名规则 — `docs/user/develop/framework/events.md:104`
- `'session/event'(session, event) => void` emit 签名 — `docs/subsystems/session.md:1385-1400`

---

## §5 · Session append-only 事件日志

> **V2 勘误**：本节第一段的「`Session.append` 接受带 `ignorable?: true` 的事件」是 V1 误读。实际签名 `append<T>(type, data, ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent<T>] : [])`（`packages/core/session/src/index.ts:806-837`）**没有 ignorable 参数**；`ignorable` 是 envelope 顶层字段，仅由 `#appendRecord()`（`:849-865`）写入。declaration merging 的 `SessionEventMap` 只对 **in-repo 包**成立（`packages/core/session/src/known-event-types.ts:15-17`）。本节的 API 事实保留供查阅，但**不能作为 out-of-tree 插件写状态的依据**。

Session 是一个 append-only 日志结构，`SessionEventMap` merge-extensible；in-repo plugin 通过 declaration merging 扩展自己的事件类型。Log-only 事件不进 SurfaceEventType，不参与 deriveMessages()。

```ts
interface SessionEventMap {
  'my/plugin/event': MyEventData
}
interface TurnEndReasonMap {
  interrupted: { reason: 'crash-orphaned-turn' }
  forked: void
}
```

- Source + merge-extensible — `docs/subsystems/session.md:7-11`、`:27`、`:294`
- `SessionEvent<T>` discriminated union over type, seq/time/data, ignorable? — `docs/subsystems/session.md:268-291`
- SurfaceEventType / SurfaceOp — `docs/subsystems/session.md:311-317`、`:335-337`
- SurfaceIntent 要求 on SurfaceEventType，禁止 on log-only — `docs/subsystems/session.md:349-357`
- `append()` 签名（validate JSON-serializable at source）— `docs/subsystems/session.md:618-622`
- `deriveMessages()` 缓存+深冻结，每 call 新数组 — `docs/subsystems/session.md:662`
- `TurnEndReasonMap` 各 reason（completed/aborted/error/max-tokens/interrupted/forked）— `docs/subsystems/session.md:705-734`
  - `interrupted` = crash-orphaned turn 后补 closer；loop live 不 emit — `docs/subsystems/session.md:720-726`、`:737`
  - `forked` = fork-seed construction closed open turn — `docs/subsystems/session.md:733`
- `session/end-seed` 仅由构造器/fork 创建，log-only — `docs/subsystems/session.md:152-175`、`:745-751`
- Plugin-contributed log-only events 不进入 SurfaceEventType — `docs/subsystems/session.md:755-761`

---

## §6 · PluginRecordMap / appendPluginRecord / pluginRecordOf

> **V2 勘误**：本节的调用示例仅对 `packages/experimental/` 下的 in-repo 包成立。`packages/core/session/README.md:70-74` 原文 "Plugins outside this repository must not call it either"。本项目不使用此机制。

Experimental 插件可通过 `PluginRecordMap` 扩展自身的 `plugin:` 命名空间记录。这些记录标记 `ignorable: true`，**不进 `SessionEventMap`，也不进 released persistence schemas**。调用入口仅限 `packages/experimental/` 下的 production source。

```ts
// 在 experimental package 的 types.ts
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    'plugin:my-plugin/state': MyStatePayload
  }
}
// 写入
appendPluginRecord(session, 'plugin:my-plugin/state', payload)
// 读取
const rec = pluginRecordOf(event)
```

- `type PluginRecordType = \`plugin:${string}\`` — `packages/core/session/src/types.ts:532`
- `interface PluginRecordMap {}` — `packages/core/session/src/types.ts:534-540`
- `interface PluginRecord { readonly type; readonly seq; readonly time; readonly data: unknown }` — `packages/core/session/src/types.ts:542-557`
- `appendPluginRecord<K>(session, type, data): SessionSeq` 签名 — `packages/core/session/src/index.ts:495-499`
- Caller 限制：only production source under `packages/experimental/`；gate `verify-plugin-record-callers` 拒绝非实验 caller — `packages/core/session/src/index.ts:475-481`
- `pluginRecordOf(event): PluginRecord | undefined` — `packages/core/session/src/index.ts:511-515`
- docs 整节阐述 — `docs/subsystems/session.md:763-804`

---

## §7 · Session projection

投影通过 `ctx.sessionProjections.register(definition)` 注册；`apply` 必须同步且对无关事件返回**同一 state 引用**（Object.is 零下游）；`wire.viewSchema/view` 的 view 也必须 Object.is 稳定引用；`SummaryExcluded<T>` 和 `wire.summary` 控制是否进 summary；registry 只存在于内存中（重启需 refold）。

```ts
ctx.sessionProjections.register({
  key: 'my-state',
  stateSchema: z.object({ version: z.number(), value: z.string().nullable() }),
  init(header, inheritedEventCount) { return { version: 2, value: null } },
  apply(state, event) {
    if (event.type !== 'my/change') return state          // ← 同一引用
    return { ...state, value: event.data.text }
  },
  wire: { viewSchema: z.object({ label: z.string() }), view(s) { return s.value ? s.value : '' } },
})
```

- `ctx.sessionProjections.register()` 返回 `Promise<ProjectionHandle<S>>` — `docs/subsystems/session-projection.md:347-356`
- `ProjectionDefinition<K,S>` fields：key / stateSchema(ZodType) / init / apply / wire / stateVersion — `docs/subsystems/session-projection.md:55-105`
- apply 必须同步；无关事件返回同一 state 引用（Object.is 零下游）— `docs/subsystems/session-projection.md:66-75`、`packages/session/session-projection/README.md:53-54`
- wire.viewSchema / view / summary：view 必须 Object.is 稳定引用 — `docs/subsystems/session-projection.md:77-97`
- `SessionProjectionSummaryExcluded<T>` — `docs/subsystems/session-projection.md:178-180`
- `wire.summary?: boolean` default true；summary:false 与 mark 对齐 — `docs/subsystems/session-projection.md:159`
- snapshot / summaryKeys / viewCheckpoint / cachedSnapshot / restore / coldSnapshot / hydrate — `docs/subsystems/session-projection.md:389`、`:400`、`:421`、`:452`；`README:94`、`:104`
- registry 只在内存（重启需 refold）— `packages/session/session-projection/README.md:173-174`
- 源码位置 — `packages/session/session-projection/src/index.ts`（docs:7、:332、:497）

---

## §8 · Tool：defineTool

`defineTool` 产出单一 canonical JSON 值的 output.schema；execute 返回该值；registry 快照→JSON 序列化→校验→freeze→render。`output.render` 决定模型可见文本；`exec.signal` 必须 Honor；`presentationMeta` 生成 replayable JSON 给 core 存到 `tool/result.meta` 交由 `presentResult`。`exec.agent.inject` 异步通知，**不唤醒 idle agent**。pre-execute / guard / execute / post-execute / result 为策略扩展点。`presentCall`/`presentResult` 必须是纯函数。

```ts
defineTool({
  name: 'mark_state',
  description: '...',
  input: { kind: 'json-schema', schema: z.object({ tag: z.string() }) },
  output: { schema: z.object({ ok: z.boolean() }) },
  exec: async ({ args, signal, agent }) => {
    if (signal.aborted) throw new Error('abort')
    const v = await doWork(signal)
    await agent.inject({ content: [{ text: v, type: 'text' }], source: { kind: 'user' } })
    return { ok: true }
  },
  presentationMeta(args, value) { return { replayJson: JSON.stringify(value) } },
  presentCall(_args, _meta) { return 'call rendered...' },
  presentResult(_value, _meta) { return 'result rendered...' },
})
```

- `defineTool` 基本形状 — `docs/cookbook/adding-a-tool.md:12-36`、`:40-49`；`docs/user/develop/basic/tool.md:11-36`
- `output.schema` 单一 canonical JSON value — `docs/cookbook/adding-a-tool.md:45-47`
- `output.render` — `docs/cookbook/adding-a-tool.md:25-28`、`:68-69`
- `exec.signal` abort signal 必须 Honor — `docs/cookbook/adding-a-tool.md:48`（也见 :32、:47）
- `presentationMeta` — `docs/cookbook/adding-a-tool.md:48`
- `exec.agent.inject`（不唤醒 idle agent）— `docs/cookbook/adding-a-tool.md:49`
- `MessageSourceMap` 新增 producer kind — `docs/subsystems/llm-streaming.md:85-91`
- tools/pre-execute / guard / tools/execute / tools/post-execute / tools/result — `docs/cookbook/adding-a-tool.md:59`；`packages/core/tools/README.md:92-135`、`:112`、`:137`、`:197`
- `presentCall`/`presentResult` 纯函数约束 — `docs/cookbook/adding-a-tool.md:85-90`
- PTC mode 直接 await `tools.<name>(args)` — `docs/cookbook/adding-a-tool.md:63-65`

---

## §9 · Agent 运行时唯一可追加事件点

`agent/pre-step` 是 running agent 期间**唯一**可以追加 session 事件的位置（prepend 语义：先调下游 listener，再执行 append）；append 失败不会阻塞 turn；未 append 的选择进程退出后会丢失。`agent/turn-stopping` 是 serial 监听点。`ctx.sessions.flush(session)` 是持久化屏障。`SessionProjectionMap.agentTeam` 为官方投影例子之一（需实测确认其 declaration 来源）。

```ts
// agent/pre-step payload & return
interface PreStepInputs {
  agent: string
  messages: UserMessage[]
  turn: Turn
  step: Step
  signal: AbortSignal
  modelSelection: ModelSelection
}
type PreStepDecision =
  | { kind: 'reject' }
  | { kind: 'enter'; messages: UserMessage[]; startsRequestSeries?: boolean }

// agent/turn-stopping payload & return
interface TurnStoppingInputs {
  agent: string
  turn: Turn
  signal: AbortSignal
}
```

- `agent/pre-step` 是唯一 append 点 — `docs/subsystems/plan.md:13-17`（唯一 append point while agent running）
- payload + PreStepDecision 返回类型 — `docs/subsystems/core.md:382-396`、`:1011-1030`
- `agent/turn-stopping` serial — `docs/subsystems/core.md:1089-1113`（payload `{ agent, turn, signal }`；returns `Promise<void>|void`；listener 可 steer → re-reads inbox → fresh step blocks turn-close）
- `ctx.sessions.flush(session)` 持久化屏障 — `docs/subsystems/session.md:741`、`:1192`（以及 parallel flush `session/flush` 签名见 `:1407-1421`）
- `SessionProjectionMap.agentTeam` — `docs/subsystems/agent-team.md:82`、`:117`（**注**：镜像内 `packages/team/agent-team` 目录不存在于 grep；`agentTeam` 的实际 declaration 文件需实测确认，此处仅以 docs 为依据）

---

## §10 · 官方贴近先例

### 10a · session-title（最贴近 log-only 状态的实现）

`session/title` 是 log-only 事件，**永不进模型输入**；采用 newest-wins 三源机制；单例 provider；所有 limits 均为 required 无默认；Fork 继承 title events 不变。

- Log-only 永不进模型输入 — `packages/session/session-title/README.md:123`（"log-only and never enters the session surface, deriveMessages(), system prompt, tool schemas, or request prefix"）
- 三源 newest-wins（built-in fallback / registered provider / explicit rename）— `packages/session/session-title/README.md:32-33`
- 单例 provider：第二注册抛错直到第一个 disposal — `packages/session/session-title/README.md:56-57`、`:141`
- 必需配置项（fallbackMaxWords / fallbackMaxBytes / maxTitleBytes 均 required no defaults）— `packages/session/session-title/README.md:36-51`（"All limits are required; the library supplies no defaults."）
- Fork 继承 — `packages/session/session-title/README.md:65`（"Forks inherit title events in their seed unchanged"）
- `title` 投影键 `string | null`（host-only `titleInput`）— `packages/session/session-title/src/types.ts:80-88`
- `'session/title': SessionTitleEventData` merge to SessionEventMap — `packages/session/session-title/src/index.ts:71-78`
- 失败行为：自动失败 warn 保留最新 title；explicit refresh 失败 reject；不回滚已接受 fallback — `packages/session/session-title/README.md:64-66`

### 10b · action-cards（plugin record + remote act 典型）

一 turn 一张 card，later replaces earlier unstarted；条件工具 `propose_action` 仅 root Agent + skill loaded 可见；每次用户 action 记为 `plugin:action-cards/decision`；Remote `act()` 供客户端驱动；status notice 在下一 request 注入；token/KV cache 实测显示 card 往返约 77 tokens。

- 条件工具 `propose_action` 仅 root Agent + skill loaded 可见 — `packages/experimental/action-cards/README.md:87-88`
- 一 turn 一张 card，later replaces earlier unstarted — `packages/experimental/action-cards/README.md:42-45`
- `plugin:action-cards/decision` 记录用户每次 action — `packages/experimental/action-cards/README.md:58-59`
- `SessionProjectionMap.actionCards` 视图 excluded from summary（projection state v2）— `packages/experimental/action-cards/README.md:58`
- Remote `act(sessionId, callId, verb, payload?)` — `packages/experimental/action-cards/README.md:60`
- status notice 下一 request 注入（status notice 机制）— `packages/experimental/action-cards/README.md:100-116`、`:98-116`
- Token 实测：tool 声明 ~574 chars ≈ 144 tokens；一次 card 往返 ~77 tokens — `packages/experimental/action-cards/README.md:92-95`
- KV cache 实测：tool-addition 走 deferred declaration，不破坏 cached prefix — `packages/experimental/action-cards/README.md:96-98`
- `interface PluginRecordMap { 'plugin:action-cards/decision': ActionCardDecision }` — `packages/experimental/action-cards/src/types.ts:68-70`
- `SessionProjectionMap` 声明 — `packages/experimental/action-cards/src/types.ts:75+`

---

## 对本插件的约束清单（V2 修订）

以下规则在设计「用户手动标记会话状态 + AI 自主标记」插件时必须遵守。第 1、2、4、6 条是 V1 草案，已被证伪并替换：

1. **持久标记不写会话日志**：out-of-tree bundle 无法通过 `Session.append` 产出 `ignorable: true` 事件（签名无该参数，`packages/core/session/src/index.ts:806-837`），且 `appendPluginRecord` 被明禁（`packages/core/session/README.md:70-74`）。未知 required 事件在读路径整份拒读（`packages/session/session-persistence/src/storage-contract.ts:75-80`）。改走 `ctx.storageDomain.open(defineDomain(...))`（`docs/subsystems/storage.md:5`）。（V1 的 `agent/pre-step` append 时机约束随之作废。）
2. **状态是 host-side sidecar，天然不进模型输入**：`packages/storage/storage-domain/README.md:12` 明确 "does not add tools, prompts, or session events"。若希望模型也能感知，需通过 tool / status notice 显式引入，而不是把它塞进 session log。
3. **Session event 观察必须走 `session/event` 事件**：不得通过同名 Cordis event 名（如 `turn/end`）订阅，必须用 `ctx.on('session/event', handler, {global:true})` 并检查 `event.type`；session id 取第一参数 `session.id`（events.md:104-106；session.md:1390-1400）。
4. **Host→Client 通信走 `ctx.connection.fetch` exact route**：`packages/client/connection/src/rpc.ts:146-166`；放弃标准 Typert Remote（需主仓库 `generate-typert.ts` 产物，`docs/subsystems/api-gateway.md:110-123`）。
5. **Config 设计遵循 required 无默认值原则**：所有对外可调参数都用 `z` from `@deepseek-ai/schemastery` 的 `.required()` 呈现，不允许硬编码（config.md:76-94）。
6. **Client 挂载走 `ctx.slots.inject`**：`sidebar.session.row.trailing` + `.hover`（owner props 仅 `{sessionId}`，`packages/client/ui-workspace/src/client/contract/slots.ts:110-118`）；`ctx.slots` 的声明合并来自 `@deepseek-ai/dsh-client-ui-renderer/client`。不使用 `useProjection`（V1 的 projection 注册约束随数据源作废）。
7. **Tool 的 `presentCall`/`presentResult` 是纯函数**：不得访问 I/O、session 读写、clock、random；差异必须从 args 派生（adding-a-tool.md:85-90）。`defineTool` 的 `execute` 返回 `output.schema` 声明的单一 canonical JSON 值。
8. **Service 消失 → dependent plugin 自动 dispose + reload**；**Waterfall 必须调 `next()`**（service.md:104-109；events.md:66-77）。
8. **Waterfall 事件监听必须显式调 `next()`**，否则 pipeline 会被短路（events.md:64-81）。
9. **Service 依赖消失会触发 dependent plugin 自动 dispose + reload**：不要在插件里假定依赖永远存活，需要处理 `ctx.get()` 为 undefined 的情况（service.md:104-109）。
10. **`exec.agent.inject()` 不会唤醒 idle agent**：如果需要模型在当前请求就能看到注入内容，只能在下一个 request 阶段生效，不能作为即时反馈手段（adding-a-tool.md:49-51）。
