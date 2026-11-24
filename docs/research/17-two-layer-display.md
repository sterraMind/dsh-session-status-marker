# 显式标记与系统观察两层显示（含陈旧处理）

版本：v1.3.1-rc.2 设计稿
日期：2026-11-24
状态：已定稿，待实现

## 1. 现状

一条会话只有一行记录 `MarkRecord`（`src/types.ts:102-112`），字段为 `version` / `insertedAtMs` / `seq` / `sessionId` / `status` / `source` / `subjectId` / `autoReason` / `note`。

`source` 字段承担了「谁写的」这一信息，取值见 `MARK_SOURCES`：

- `manual`：用户在界面上点选
- `agent`：模型调用 `set_session_status`
- `auto`：`inferStatus`（`src/inference.ts:98-150`）或 `inferFallback`（`src/inference.ts:197-226`）推断写入

写入前的守卫有两个：`shouldApplyInference`（`src/inference.ts:157-161`）与 `shouldApplyFallback`（`src/inference.ts:239-249`）。前者在 `current.source !== 'auto'` 时直接返回 `false`。

这带来一个结构性问题：一旦会话上存在显式标记（`manual` 或 `agent`），系统观察就再也写不进去。用户看到的是「已完成」，但同一时刻这个会话可能正在运行、可能刚被中断、可能有子代理还在跑。反过来，只有观察没有显式标记时，观察会占住 `status` 字段，用户无法区分「这是我定的」还是「系统猜的」。

## 2. 方案选型

### 方案 A：同一行加并列字段（采用）

`MarkRecord` 增加三个可空字段，分别承载观察层的状态、来源事件、观测时间。显式层继续用原有的 `status` / `source` / `autoReason` / `note` / `subjectId`。

- 优点：读取路径不变，`.state` 路由自动带出新字段；一张表，无跨表一致性问题；旧行可读（见第 3 节的 zod 写法）。
- 代价：一行里同时存在两层，写入时必须明确「这次写的是哪一层」，否则会互相覆盖。

### 方案 B：拆成两张表（否决）

新增 `session_status_observation` 表，与 `session_status_marker` 以 `sessionId` 关联。

- 否决理由一：`src/domain.ts` 的 `defineDomain` 按表名声明，新增一张表要改 domain 声明与 `invalidRecords` 策略，还要处理两表之间的一致性（标记删掉后观察要不要跟着删）。
- 否决理由二：总览路由现在一次遍历标记表即可（`src/service.ts` 的 `.overview` 处理），拆表后要么两次查询再在内存里合并，要么加索引；对当前数据量（本机 143 条量级）收益为零。
- 否决理由三：观察层生命周期比标记层短（见第 6 节），拆表后需要独立的清理任务，反而更复杂。

### 方案 C：观察层只放内存、不落盘（否决）

- 否决理由：进程重启后观察全部丢失，用户看到的仍是「已完成」，而进程重启恰恰是最需要提示「这条观察可能过时」的时刻。

## 3. 数据模型

在 `src/types.ts` 的 `MarkRecordSchema` 里追加三个字段。关键是**同时**用 `.nullable()` 和 `.default(null)`：`.nullable()` 让类型是 `T | null`，`.default(null)` 让缺失该键的旧行在解析时自动补 `null`，因此 `z.output` 类型仍然是非可选的，不需要把 `MarkRecord` 的字段改成可选。

```ts
observedStatus: z.enum(STATUS_VALUES).nullable().default(null),
observedEvent: z.enum(OBSERVED_EVENT_VALUES).nullable().default(null),
observedAtMs: z.number().int().nonnegative().nullable().default(null),
```

`OBSERVED_EVENT_VALUES` 放在 `src/contracts.ts`，取值为 `session/event` 里真正会触发观察的规范事件名：

```ts
export const OBSERVED_EVENT_VALUES = ['turn/start', 'turn/end', 'subagent/start', 'subagent/end', 'job/settled', 'goal/change'] as const
```

`version` 保持 `MARK_VERSION = 1`。依据是加法式演进：新增可空字段不改变已有字段的语义与类型，旧版本客户端读到新行会忽略未知键，新版本客户端读到旧行会补 `null`。只有「字段变必填」或「字段类型变化」才需要升版本。

## 4. 接口变更

### `.state`（`MARKER_STATE_PATH`）

返回体里的 `mark` 就是整行记录，新增字段自动出现。**不需要**改 schema，但要确认客户端类型 `MarkRecord` 同步（`src/types.ts` 的 `type _MarkRecordMatches` 编译期检查会挡住漏改）。

### `.overview`（`MARKER_OVERVIEW_PATH`）

`OverviewEntry`（`src/contracts.ts`）追加三个**可选**字段，保持向后兼容——旧客户端不读这几个键也不会报错：

```ts
observedStatus?: StatusEnum | null
observedEvent?: ObservedEvent | null
observedAtMs?: number | null
```

用可选而不是必填，是因为 `.overview` 的响应被 `OverviewResponseSchema` 之类严格校验过；可选字段对旧客户端的解析是安全的。

## 5. 界面变更

### 悬停卡（`src/client/StatusPicker.tsx`）

手动选择器下面加一段只读的观察区：

```
系统观察  运行中 · turn/start · 12 秒前
```

没有观察时显示 `observation.none`（「暂无系统观察」）。观察已过时（见第 6 节）时整段降为次要色，并在尾部加「已过时」。

### 总览页（`src/client/StatusOverview.tsx`）

每行在标题下面加第二行小字，只在有观察时渲染，避免占位。

### 徽标（`src/client/Badge.tsx`）

**不改**。徽标空间只够一个状态，两层合并显示会挤。徽标的 `title` 属性里追加观察摘要即可。

## 6. 陈旧处理

观察层的时效由 `observedAtMs` 与一个新的配置项 `observationTtlMs` 决定，默认 `300_000`（5 分钟）。

三种清理做法的取舍：

- **读取时惰性丢弃（否决）**：观察过时后整段消失，用户会以为「系统没有观察」，而实际上是有过观察、只是不新鲜了。信息损失。
- **后台定时清理（否决）**：需要额外的定时器与寿命管理，与现有的 `refreshIntervalMs` 轮询叠加后，本机 143 条量级下每秒都可能有定时器空转。
- **显式标记为过期（采用）**：写入时不动，读取时按 `observedAtMs` 计算 `stale: boolean`，界面降级显示。观察永远不会被静默删掉，用户能看到「最后一次观察是什么时候」。

判定函数放在 `src/inference.ts`，与 `isAutoMarkExpired` 并列：

```ts
export function isObservationStale(observedAtMs: number | null, now: number, ttlMs: number): boolean
```

`observedAtMs === null` 返回 `false`（没有观察谈不上过时）。`ttlMs <= 0` 视为永不过时，与 `isAutoMarkExpired` 里 `autoExpireMs <= 0` 的语义保持一致。

**重激活清陈旧**：当同一个会话产生新的观察时，直接覆盖 `observed*` 三个字段，不做历史保留。

## 7. 写入路径

`src/service.ts` 的 `#observe` 里，事件进来后先算显式层（`inferStatus` + `shouldApplyInference`），再算观察层（新增的 `observeEvent`），两层各写各的字段。

观察层的写入守卫是独立的：

```ts
export function shouldRecordObservation(current: MarkRecord | null, next: ObservedSnapshot): boolean
```

规则：`current === null` 时也要写（观察层不依赖显式标记存在）；否则只在 `observedEvent` 或 `observedStatus` 变化时写，避免每个事件都产生一次存储写入。

`subagent/start` 与 `subagent/end` 只用来维护进程内的 `subagentsRunning` 计数，本身不产生观察记录——它们没有可读的状态语义，写进去只会让观察区显示「subagent/start」这种没有信息量的文案。

## 8. 测试计划

`tests/inference.test.mjs`：

- `isObservationStale`：`null` 时间戳返回 `false`；`ttlMs = 0` 返回 `false`；恰好等于 `ttl` 的边界；超出 `ttl` 返回 `true`。
- `shouldRecordObservation`：`current === null` 返回 `true`；事件与状态都相同返回 `false`；只换事件返回 `true`；显式标记存在时仍然返回 `true`（这是与 `shouldApplyInference` 的关键区别）。

`tests/service.test.mjs`：

- 会话上先写 `manual` + `done`，再喂 `turn/start`，断言 `status` 仍是 `done`、`observedStatus` 变成 `todo`。
- 同一事件重复喂两次，断言第二次没有产生写入（用存储的 `put` 调用计数）。
- `.overview` 响应里带出 `observedStatus` / `observedEvent` / `observedAtMs`。

`tests/contracts.test.mjs`：

- 旧行（不含 `observed*` 三个键）能被 `MarkRecordSchema` 解析，且三个字段都是 `null`。

## 9. 风险清单

1. **两层语义混淆**：用户看到「已完成」+「运行中」会不知道该信哪个。缓解：观察区固定用次要色、加「系统观察」前缀、过时后进一步降级；显式徽标永远是主色。
2. **写入放大**：每个 `turn/*` 事件都可能触发一次存储写入。缓解：`shouldRecordObservation` 在事件与状态都未变化时返回 `false`，配合现有的 `refreshIntervalMs = 2000` 轮询，写入频率与轮询同阶。
3. **旧行解析失败**：如果只写 `.nullable()` 不写 `.default(null)`，旧行会因为缺少必填键被 `.strict()` 拒绝，读取时整批回退到备份。缓解：zod 字段同时带 `.default(null)`，并在 `tests/contracts.test.mjs` 里用真实的旧行断言。
4. **观察层在重启后丢失**：`subagentsRunning` 是进程内计数，重启后归零。这不是新增问题，`src/inference.ts:186-191` 已经写明，观察层沿用同样的边界。

## 10. 实施顺序

1. `src/contracts.ts` 加 `OBSERVED_EVENT_VALUES` 与 `ObservedEvent` 类型，`OverviewEntry` 加三个可选字段。
2. `src/types.ts` 加三个 zod 字段，顺手确认编译期检查通过。
3. `src/inference.ts` 加 `isObservationStale` 与 `shouldRecordObservation`。
4. `src/service.ts` 的 `#observe` 接上观察层写入，`.overview` 带出新字段。
5. `src/client/StatusPicker.tsx` 加观察区，`src/client/StatusOverview.tsx` 加第二行。
6. `src/client/locales.ts` 补 8 种语言的 `observation.*` 键。
7. 按第 8 节补测试，`pnpm run typecheck`、`pnpm run test`、`pnpm run build` 三条全绿。
