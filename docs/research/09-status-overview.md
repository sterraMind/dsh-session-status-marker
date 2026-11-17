# 跨会话状态总览设计（v1.1.0）

> 文档版本：v1.1.0 · 2026-11-17（对应插件 1.1.0 设计）

## 1. 背景与目标

竞品调研（`docs/research/07-competitive-session-managers.md`）确认：dsh-session-manager
三个主要项目全部集中在「生命周期（删/归档/移动）+ 注意力（未读/收藏）+ 组织（搜索/批量）」赛道，
**无人做「按工作状态分组查看全部会话」**。我们独占 8 状态语义 + AI 推断，但当前只能逐行看徽标，
缺少一张总览。本特性补上这块。

目标：在设置面板新增「会话状态」分区，把全部已标记会话按状态分组 + 计数展示。

## 2. 入口选择：`settings.section`

官方设置面板 slot 契约（`.research/dsh-repo/packages/client/ui-settings/src/client/contract/slots.ts:57`）：

```ts
'settings.section': { kind: 'list'; scope: 'root'; owner: SettingsSectionOwnerProps }
```

- 每个 list entry = 一页设置。`SettingsSectionOwnerProps = { close: () => void }`
  （`:134-137`，section 收到的唯一宿主能力是关闭面板）。
- 注册范式参考 `ui-settings-models/src/client/index.ts:136-146`：

```ts
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section', id: 'models', order: 10,
  label: () => t('nav'),       // label 是 thunk，locale 切换时重注册拿新文案
  inject: injected,             // 注入 face，渲染时摊平进组件 props
  children: { ... },            // 可选子 slot
}, ModelsSection))
```

- `inject` face 形态：`ModelsSection.tsx:41-54` —— `{ controller, hooks: { snapshot }, operations, schema, t }`，
  其中 `t: (key) => string` 由 `ctx.locale.bind(NS)` 得来（`index.ts:92`）。
- 组件 props = inject face 摊平 + `SettingsSectionOwnerProps`（`ModelsSection.tsx:68-70` 注释）。

我们选 `settings.section`（整页）而非 `settings.general.item`（单行）：8 个分组内容量大，值得独立一页。

## 3. 数据与路由

### 3.1 新增 overview 路由

现有 `list` 路由（`src/service.ts:228-232`）返回 `{marks, refreshIntervalMs}`，被侧栏徽标轮询消费
（`src/client/marks.ts`）。徽标只需要轻量标记，不需要标题。总览需要标题。**新增独立 overview 路由**，
不动 list：

- 路径：`/api/session-status-marker.overview`（常量 `MARKER_OVERVIEW_PATH` / `MARKER_OVERVIEW_ROUTE`）。
- 响应：

```ts
export interface OverviewEntry {
  readonly sessionId: string
  readonly title: string | null          // 无标题时 null，前端回退到 sessionId
  readonly status: StatusEnum
  readonly note: string | null
  readonly source: MarkSource
  readonly autoReason: AutoReasonCode | null
  readonly updatedAtMs: number
}
export interface StatusGroup {
  readonly status: StatusEnum
  readonly count: number
  readonly entries: readonly OverviewEntry[]   // updatedAtMs 降序
}
export interface OverviewResponse {
  readonly groups: readonly StatusGroup[]       // 仅含 count>0 的组，按 STATUS_VALUES 顺序
  readonly totalMarked: number
  readonly refreshIntervalMs: number
}
```

### 3.2 标题来源

会话标题走 `ctx.sessionTitle`（`session-title/src/index.ts:65-67` 把 `sessionTitle: SessionTitleService`
合并进 cordis Context）。读标题：

- `ctx.sessions.list()` 拿全部 Session；
- `ctx.sessionTitle.get(session)?.title ?? null` 读投影标题。

只需为**已标记的 sessionId** 取标题（有界集合）。Host 端在 `#handleOverview()` 里建
`Map<sessionId, Session>`，逐个标记查标题。`sessionTitle.get` 可能抛（`initialization.spec.ts:136` 探针），
用 try/catch 包裹，失败回退 `null`。

### 3.3 inject 变更

`src/service.ts` `static inject` 从 `['storageDomain','tools']` 改为
`['storageDomain','tools','sessions','sessionTitle']`。两者都是核心 session 服务，
任何有 session 的组合都存在（我们的插件本就是 session 插件）。`connection` 保持懒注入不变。

## 4. 客户端

### 4.1 组件

`src/client/StatusOverview.tsx`：

- 注入 face `StatusOverviewInjected = { t: (key) => string; fetchOverview: () => Promise<OverviewResponse> }`
  （数据获取通过注入的 `fetchOverview`，组件本身不直接碰 fetch，便于测试）。
- 组件 props = `StatusOverviewInjected & SettingsSectionOwnerProps`。
- mount 时 fetch 一次 + 按 `refreshIntervalMs` 轮询；`document.hidden` 暂停（复用 `useMark` 的可见性思路）。
- 渲染：每组一个区块，标题 = 状态名 + 计数徽标，下方列出该组会话（标题 + 备注 + 时间）。
- 空态：`totalMarked === 0` 显示 `t('overview.empty')`。
- `close` prop 保留但不强制使用（v1.1 不做跳转会话）。

### 4.2 主题与样式

- `src/client/overview.module.css`：全部用 `--dsw-alias-*` 主题令牌，禁字面色值；
  背景用 `--dsw-alias-bg-layer-2`、文字 `--dsw-alias-label-primary` / `--dsw-alias-label-secondary`、
  状态色用 `--dsw-alias-state-*-primary`（与 `STATUS_META.tone` 一致）。设置页内容区本身是宿主表面，
  跟随主题，**不需要**悬停卡那套负边距覆盖。
- CSS 文件内注释不得出现十六进制色值字面量（`tests/theme.test.mjs` 零字面颜色断言会扫描所有 css）。

### 4.3 locale

`src/client/locales.ts` 新增键（8 语言 DICTIONARIES 全覆盖）：
`overview.nav`（分区导航名）、`overview.title`、`overview.empty`、`overview.count`（`{count}` 占位）、
`overview.updatedAt`、`overview.noTitle`。沿用现有 17 键的 key-identical 约定。

### 4.4 注册与构建

- `src/client/index.ts`：`ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section', id: 'session-status', order: 60, label: () => t('overview.nav'),
  inject: overviewInjected }, StatusOverview))`。`order: 60` 排在官方分区之后。
  需要新增 `import type {} from '@deepseek-ai/dsh-client-ui-settings/client'` 拉 SlotMap merge
  （参考 `ui-settings-models/src/client/index.ts:11`）。
- `scripts/build-client.mjs` `MODULES` 表新增 `'client/StatusOverview.tsx'` 与 `'client/overview.module.css'`。

## 5. 测试

`tests/overview.test.mjs`（node --test + vitest shim）：

- overview 路由分组正确：给定若干标记，`#handleOverview` 返回按状态分组、组内 `updatedAtMs` 降序、
  仅含非空组、`totalMarked` 正确。
- 标题 join：有标题的会话返回 title，无标题返回 null，`sessionTitle.get` 抛错时回退 null。
- 空态：无标记时 `groups: []`、`totalMarked: 0`。
- `fetchOverview` 注入与轮询（轻量，验证 mount 取数 + 可见性暂停逻辑）。

复用 `tests/service.test.mjs` 的 fake ctx 模式（`reflect: { provide: () => {} }`；
`ctx.sessions.list` / `ctx.sessionTitle.get` 用可注入的 stub）。

## 6. 不在本版范围

- 侧栏内联按状态过滤：宿主拥有会话列表渲染，无过滤 hook slot，需另行调研宿主 store 介入点。推迟。
- 点击总览条目跳转会话：需宿主导航 API，v1.2 评估。
- fork 状态继承：独立特性，见 `docs/research/07` P1。

## 7. 风险

- `sessionTitle.get` 对大量会话可能较慢（逐个读投影）；已标记集合通常很小，可接受。
  若未来标记数增长，可改用 `sessionProjections` 批量读或缓存。
- settings.section 的 `inject` face 摊平语义：组件 props 必须与注入 face 字段名完全一致
  （`ModelsSection.tsx:68-70`），否则渲染时 undefined。以类型约束 + 测试防回归。
