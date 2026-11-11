# 04 · 会话状态分类学与语义设计

> **文档版本**：v1.0.2 · 2026-11-12（对应插件 1.0.2）

> **V2 修订**：本文 §1、§2 的状态分类学仍然有效；§2.3 起的「log-only 事件 / projection / useProjection / ctx.remote」是 V1 草案，已被证伪并删除。最终持久化与通信方案见 `docs/architecture.md` §3。

## 1. 官方现有状态面（已有，不能重复）

| 官方机制 | 依据 | 适用范围 |
|---|---|---|
| `TurnEndReasonMap`: completed / aborted / blocked / error / max-tokens / interrupted / forked | `.research/dsh-repo/docs/subsystems/session.md:705-735` | turn 结束时自动推断 |
| `GoalPhase = 'active' \| 'paused' \| 'blocked' \| 'complete'` | `goal.md:23-31` | goal 层级 |
| `JobStatus = 'running' \| 'stopping' \| 'completed' \| 'killed' \| 'failed'` | `jobs.md:21` | job 层级 |
| SchedulingTask state: active / due / ended / error | `schedule.md:5, :24` | schedule 层级 |
| Session activity: turn / job / subagent / schedule | `workspace.md:153` | workspace 活动栏 |
| Pending interaction: waiting-for-approval / plan-awaiting-review / waiting-for-answer | `ui-workspace/README.md:74` | 单 row leading seat |
| `SessionActivityItem.family` + `id` + `label` | `workspace.md:167` | 归档判断 |

**结论：插件负责「人工标记」和「AI 自主标记」两类状态，覆盖上述官方机制未能表达的、面向会话列表的用户语义。**

## 2. 新状态类型设计

### 2.1 手动标记（用户明确操作）

最终实现为 `src/contracts.ts` 的 `STATUS_VALUES`，共 **8 个状态**（V1 只有 7 个，补入了 `blocked`）：

| 枚举值 | 含义 | `STATUS_META` icon glyph | tone token |
|---|---|---|---|
| `todo` | 会话停止输出但还有待办 | `checklist-outline` | `--dsw-alias-state-business-primary` |
| `done` | 已完成 | `check-circle-fill` | `--dsw-alias-state-done-primary` |
| `stopped` | 会话被中断、异常退出未完成 | `stop-fill` | `--dsw-alias-state-error-primary` |
| `blocked` | 被阻塞、等待外部条件 | `warning-triangle-outline` | `--dsw-alias-state-warn-primary` |
| `review` | 待人工复核 | `browse-outline` | `--dsw-alias-state-business-primary` |
| `pending-subagent` | 子代理未完成 | `agent-preset-outline` | `--dsw-alias-state-success-primary` |
| `awaiting-answer` | 等待用户回答 | `pause-outline` | `--dsw-alias-state-idle-primary` |
| `feedback` | 已给反馈 / 待处理反馈 | `like-outline` | `--dsw-alias-state-success-primary` |

> glyph id 来自 `.research/dsh-repo/packages/client/ui-primitives/src/icons/artwork.ts:22-145`；Phase 1 组件先用文本占位符，Phase 2 换官方 inline SVG + `currentColor`。`--dsw-alias-state-done-primary` 是官方「标记已完成工作」专用 token（`ui-theme/README.md:28-48`）。

每个状态可带 optional free-text note（长度由 required Config `maxNoteLength` 控制，默认建议 200）；标记有 `source: 'manual' | 'auto'`。

### 2.2 AI 自主推断（从 `session/event` 观察，不写事件）

`src/inference.ts` 是零 DSH 依赖的纯函数 `inferStatus(observation)`，规则表：

| 观察路径 | 推论 | `autoReason` | 依据 |
|---|---|---|---|
| `turn/end` `reason.kind='interrupted'` | `stopped` | `turn-interrupted` | `session.md:705-735` |
| `turn/end` `reason.kind='blocked'` | `blocked` | `turn-blocked` | 同上 |
| `turn/end` `reason.kind='aborted' \| 'error'` | `stopped` | `turn-interrupted` | 同上 |
| `tool/call` name `TodoWrite`/`todo_write` 且 todos 有非 completed | `todo` | `tool-write-todo` | `adding-a-tool.md:40-49` |
| `job/settled` status `failed` / `killed` | `stopped` | `job-failed` | `jobs.md:21-31` |
| `goal/change` phase `blocked` | `blocked` | `goal-blocked` | `goal.md:44-56` |
| `user/message` 带 text | `feedback` | `session-stop-invoked` | — |
| 其它 | `null`（不写） | — | merge-extensible documented default |

观察器用 `ctx.on('session/event', (session, event) => ..., { global: true })`（`session.md:1390-1400`）；session id 取 `session.id`，**不是** `event.data.sessionId`。`turn/end` 的 `data.reason` 是对象 `{ kind: ... }` 而非字符串。

**优先序**：`shouldApplyInference(current, proposed)` — 无 current 写 auto；current 是 `manual` 永不覆盖；否则仅 status / autoReason 变化才写。`autoInfer`、`autoExpireMs` 都是 required Config，无硬编码默认值（`config.md:76-94`）。

### 2.3 持久记录 schema（V2，非 SessionEvent）

```ts
// src/contracts.ts（零依赖，Host 与 Browser 共用）
interface MarkRecord {
  readonly version: 1
  readonly insertedAtMs: number
  readonly seq: number                 // 触发它的 event.seq；手动标记为 0
  readonly sessionId: string           // storageDomain marks 表的 key
  readonly status: StatusEnum
  readonly source: 'manual' | 'auto'
  readonly subjectId: string | null    // subagent / callId / jobId
  readonly autoReason: AutoReasonCode | null
  readonly note: string | null
}
```

- 存于 `defineDomain({ name: 'session_status_marker', version: 1, layout: 'per-record', invalidRecords: 'backup-and-skip', tables: { marks: domainTable<string, MarkRecord>(MarkRecordSchema) } })`。
- `src/types.ts` 用 `z.object({...}).strict()` 校验，并有编译期双向 `extends` 检查保证 zod 推导与契约一致。
- **不写 `SessionEventMap`、不调 `appendPluginRecord`、不进 `deriveMessages()`、不注入 `agent.inject()`**。理由：`Session.append` 无 `ignorable` 参数（`packages/core/session/src/index.ts:806-837`），out-of-tree 写未知 required 事件会在 `packages/session/session-persistence/src/storage-contract.ts:75-80` 被整份拒读。
- 每行是完整 post-change state（不是 delta），`put(key, row)` 天然幂等；清除走 `delete(key)`。

## 3. 为什么废弃 V1 的 projection 设计

V1 计划注册 `sessionMarker` projection 并用 `wire.summary:false` + `cachedSnapshot` 给 Client 读。废弃原因不是 projection API 有问题，而是**它的数据源（自定义 log-only 事件）对 out-of-tree bundle 不成立**。替代链路：

```
Host: storageDomain marks 表
  ├─ /api/session-status-marker.state?sessionId=...  (GET)
  ├─ /api/session-status-marker.list                 (GET)
  └─ /api/session-status-marker.mutate              (POST set/clear)
Client: ctx.slots.inject('sidebar.session.row.trailing'|'hover')
  └─ 组件内 fetch() 上述 document-relative route
```

`ctx.connection.fetch.register` 契约见 `packages/client/connection/src/rpc.ts:146-166`；三个 slot 的 owner props 都只有 `{ sessionId }`（`packages/client/ui-workspace/src/client/contract/slots.ts:110-118`），故组件必须自行 fetch，不能依赖 `useProjection`。标准 Typert Remote 因需主仓库 `generate-typert.ts` 产物而被排除（`docs/subsystems/api-gateway.md:110-123`）。

## 4. 决策记录（ADR 摘要）

- Q: 为什么不用 `PluginRecordMap` / `appendPluginRecord`？A: `packages/core/session/README.md:70-74` 明确写 "Plugins outside this repository must not call it either"。
- Q: 为什么不用自定义 `SessionEventMap` 事件？A: 见 §3；这是写入成功、重启拒读的延迟失败，风险最高。
- Q: 为什么用 `storageDomain`？A: `docs/subsystems/storage.md:5` 把它定义为「非 session event log 的持久化」，且 `docs/upgrade-guide/v0.2.1-rc.2/cua-consent-storage/guide.md:12,18` 有跨重启的会话级 sidecar 先例。
- Q: 为什么每行是完整对象而非 delta？A: `KvTable.put(key, value)` 直接替换，天然幂等，无需 fold 重放。
- Q: 为什么手动优先于自动？A: 用户意图高于 heuristics；避免误标「完成」掩盖未完成任务。
- Q: 为什么 8 个状态而不是 4 个？A: 用户举例给了打勾 / TODO / STOP / SUBAGENT_TODO 四类，但「被阻塞」「等待回答」「待复核」「反馈」在竞品痛点是独立语义（见 `06-market-and-practices.md`），拆开后 UI 才能给出可操作的下一步。

## 5. 已收敛 / 仍开放

- [x] `sidebar.session.row.trailing` owner props：确认只有 `{ sessionId }`，不含 `useProjection` 能力。
- [x] `useSessionStatus` 返回值：不需要——Client 走 fetch，不读 session status hook。
- [x] 同一轮多次 `job/settled` 去重：`shouldApplyInference` 按 status / autoReason 比较，值不变不写。
- [ ] `artwork.ts` glyph id 与 `STATUS_META.icon` 的最终对齐（Phase 2 换 SVG 时逐个核对）。
- [ ] `subjectId` 跨 fork 有效性：当前标记不随 fork 继承，语义待 Phase 2 决定。
- [x] `domain/changed` 只进程内（`storage.md:170`）已用全页共享列表定时读取加本地写透处理（1.0.0），标记后无需刷新页面。
