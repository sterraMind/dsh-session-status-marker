# 07 · DSH 现成会话状态表面清单

> **文档版本**：v1.0.1 · 2026-11-11（对应插件 1.0.1）

> **V2 修订**：本文 §1–§5 的官方事实描述保留；§6「本插件与现成表面的关系」是 V1 草案（写 log-only 事件 / projection / Remote API / 唯一真理来源是 Session log），已被证伪，改为下方 V2 版本。最终架构见 `docs/architecture.md`。
>
> 全部来自 `.research/dsh-repo/` 官方仓库镜像，每节附精确路径:行号；本插件在此之上扩展。

## 1. Session 层

- `session/event` Feed：所有 Turn/Step/Tool/Compaction 事件经此分发
  - `session.md:1390-1400`（`turn/start`, `turn/end`, `step/start`, `step/end`, `tool/call`, `tool/result`, `compaction/*`）
  - 这些是 **durable session-event types，不是同名 Cordis 事件**；观察须 `ctx.on('session/event', (session, event) => ..., {global:true})`
- `Session.append(type, data, opts?)` → 写入一条 Typed Event，data 必须 lossless-JSON 可序列化
  - `session.md:618-622`, `session.md:808`；`opts` 仅 `SurfaceIntent<T>[]`，**没有 `ignorable` 参数**（`packages/core/session/src/index.ts:806-837`）
- `Session.deriveMessages()` → 产出模型可见 message[]（不含 log-only 事件）
- `SessionEventMap` merge-extensible：这是 **in-repo 包**的声明位点（`session.md:755-759`）；out-of-tree 事件不在 generated `KNOWN_SESSION_EVENT_TYPES` 内（`packages/core/session/src/known-event-types.ts:15-17`）
- `PluginRecordMap` / `appendPluginRecord()`：**仅限** `packages/experimental/`，`packages/core/session/README.md:70-74` 明确禁止仓库外调用
- `ctx.sessions.flush(session)`：显式持久化屏障（`session.md:741`；`feedback.md:289`）——本插件不写 session log，故不使用

## 2. 事件分类

- `SurfaceEventType` = `'system/message' \| 'developer/message' \| 'user/message' \| 'assistant/message' \| 'tool/result'`
  - `session.md:311-317`；必须携带 `surfaceOp`（`{ op:'replace', startSeq, endSeq }` 或 `'append'`）
- `TurnEndReasonMap`（merge-extensible）：
  - `completed` / `aborted{reason}` / `blocked` / `error{error:LlmFailure}` / `max-tokens` / **`interrupted`** / `forked`
  - `session.md:705-735`；`interrupted` 表示 crash-orphaned 的 turn close，loop 不 live emit；`data.reason` 是对象 `{kind}`，不是字符串
- `SessionEvent<T>` 字段：`seq/time/data` + 可选 `ignorable?: true`（**envelope 顶层字段**，`packages/core/session/src/types.ts:510-523`）
  - 缺省 required-on-read；未知类型无此标记 reader MUST 拒绝重建

## 3. 存储子系统（V2 真正使用的接缝）

- `ctx.storageDomain` === `ctx.storage.domain`；`open<S extends DomainSpec>(spec: S): Promise<Domain<S>>`（`docs/subsystems/storage.md:145-171`）
- `defineDomain({name, version, layout?, compatibleVersions?, invalidRecords?, global?, tables})` + `domainTable<K,V>(schema: ZodType<V>)`（`packages/storage/storage-domain/src/spec.ts:91-93,107-147`）
- `KvTable`：同步 `get/entries/keys/size`，异步 `put/delete/deleteMany/update`；写链 backend durability first → mutate memory → emit `domain/changed`（`packages/storage/storage-domain/src/domain.ts:43-108`）
- `domain/changed` 是进程内 Cordis `emit`；跨进程 push 是已知限制（`storage.md:170`；`packages/storage/storage-domain/src/events.ts:10-47`）
- 第一方会话级 sidecar 先例：`docs/upgrade-guide/v0.2.1-rc.2/cua-consent-storage/guide.md:12,18`
- `UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/`（`packages/storage/storage/src/backend.ts:10`）

## 4. Host→Client 与 Client 挂载

- `ctx.connection.fetch.register(ConnectionFetchRoute)`（`packages/client/connection/src/rpc.ts:146-166`）：`path` 以 `/api` 开头、`methods`、`requestBody`、`fetch: (Request)=>Promise<Response>`；owner-peer 认证围栏（`rpc-host.ts:122-137,246`）
- 官方先例 `packages/client/ui-deliverables/src/present-open.ts:20-54`
- `sidebar.session.row.{leading,trailing,hover}` 三个 slot：owner props 仅 `{sessionId}`，scope root、list cardinality（`packages/client/ui-workspace/src/client/contract/slots.ts:110-170`）
  - `leading` 只在 primary state idle 挂载且被 schedule mark 占用；`trailing` 在 hover-capable 设备上 hover 时隐藏；详情放 `hover`
- `ctx.slots` 的 declaration merge 来自 `@deepseek-ai/dsh-client-ui-renderer/client`（`packages/client/ui-renderer/src/client/index.ts:33-49`）

## 5. 投影与 Hook（保留为 API 参考，本项目不用于数据源）

- `ctx.sessionProjections.register()`：`apply` 同步、对无关事件返回同一 state 引用、`wire.summary:false` + `SessionProjectionSummaryExcluded<T>` 排除摘要（`packages/session/session-projection/README.md:34-104`）
- Hook 全景表见 `docs/cookbook/extension-cookbook.md:98-132`：`agent/pre-step`(waterfall) / `agent/turn-stopping` / `tools/pre-execute` / `tools/execute` / `tools/post-execute` / `tools/result` / `session/flush`
- **V1 曾把 `agent/pre-step` 当作「唯一安全 append 时机」并计划在此写标记事件；本项目 V2 不写会话事件，该约束作废。**

## 6. 其他已知状态源（非本插件干预范畴，仅供推断交叉引用）

- `goal/change` events：`active` / `paused` / `blocked` / `complete`（`goal.md:23-31,93`）
- `job/registered` / `job/settled`（log-only）：`running` / `stopping` / `completed` / `killed` / `failed`（`jobs.md:21-31`）
- `schedule` task：七种 timing（after/at/every/daily/weekly/cron/rrule），exhaustion 后存储为 `ended`（`schedule.md:5,24`）
- `pendingInteraction` classification：`waiting-for-approval` / `plan-awaiting-review` / `waiting-for-answer`（leading seat 优先级高于 idle dot）
- `workspace/session-activity` waterfall + `workspace/session-stop` parallel（`workspace.md:138-167,617`）；workspace 是 host-side capability，对模型不可见

## 7. 本插件与现成表面的关系（V2）

本项目**不替代**上述任何状态源，而是叠加一层「业务语义层」，且**不向 Session log 写入任何内容**：

- 对已存在的 official event，插件通过 `session/event` 观察并**只读推断**（`turn/end:interrupted` → `stopped`），结果写进 `storageDomain` 的 `marks` 表。
- 用户的手动标记经 `ctx.connection.fetch` exact route → `KvTable.put(sessionId, row)`。
- Client UI 的 display 由 `ctx.slots.inject` 的组件 `fetch()` 读取，不经 projection、不进 Session summary。
- **唯一真理来源：`storageDomain` 的 `session_status_marker.marks` 表**（key = sessionId）。Session log 保持原样，因此 resume / fork / 重启读回不会遇到未知事件类型，也不会影响 `deriveMessages()` 与 KV cache。
