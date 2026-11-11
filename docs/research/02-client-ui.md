# 02 · Client UI、主题与图标规范

> **文档版本**：v1.0.1 · 2026-11-11（对应插件 1.0.1）

> 依据全部来自 `.research/dsh-repo/` 官方仓库镜像，引用格式为 `路径:行号`。
> 本文回答：状态徽标挂在哪里、怎么拿到状态、图标怎么做到「风格化 + 与 DSH 统一 + 同步主题」。

## 1. 三个候选挂载位置（按优先级）

| 位置 | slot key | 依据 | 适配性 |
|---|---|---|---|
| **会话列表行的 leading seat** | `sidebar.session.row.leading` | `packages/client/ui-workspace/README.md:78` | 会话列表正是要显示状态徽标的地方；但该 seat 只在行主状态为 idle 时渲染，且「an archived row keeps that cell blank」「a search result has no leading seat」（同文件 `:74, :78`） |
| 会话头部 actions | `conversation.session.header.actions` | `docs/subsystems/slots.md:144-149`、`:29-52` 给出完整可编译示例 | 适合放「切换标记」的下拉/按钮组，当前打开会话用 |
| 会话行右键菜单项 | `sidebar.workspaces.session.menu.item` | `packages/client/ui-workspace/README.md:82` | 适合「标记为…」的菜单项，与 Pin/Rename/Fork 并列 |

`docs/subsystems/slots.md:13` 另列出 root-scoped lists：`sidebar.panellist.actions`、
`conversation.session.header.views.actions`、`sidebar.right.tab.guide.actions`，
这些是「More 菜单」行，不是会话行，不适合做状态徽标。
`docs/subsystems/slots.md:15` 明确：「[ui-workspace] documents Session-row extension positions,
visibility, and keyboard behavior」——会话行扩展的事实源就是 `ui-workspace`。

**决策**：主显示用 `sidebar.session.row.leading`（列表页徽标 + 悬浮卡详情），
主操作用 `conversation.session.header.actions`（当前会话的状态切换控件），
补充入口用 `sidebar.workspaces.session.menu.item`（右键菜单批量标记）。
由于 leading seat 有 idle-only 限制，必须**同时**在会话头部提供可见控件，
避免「正在运行/等待输入」时看不到标记；这一点是对官方约束的适配，不是绕过。

## 2. Slots 注册契约

`docs/subsystems/slots.md:19-27`：

- `SlotMap` 是编译期注册表；包通过 declaration merging 声明 key、cardinality、scope、
  owner props、keyed props、可选 slot-level inject face。
- 运行时声明是「拥有渲染位置的组件上的 `children` 条目」。声明一个 child 有三重作用：
  让 key 生效、授权父级的 `renderSlot`/`renderSlotChain` 调用、记录 runtime dispatch 规格。
- **向未声明的 slot 注册、或重复声明已在别处拥有的 child，plugin activation 时直接失败**（`:23`）。
- `ctx.slots.inject(key, callback)`：等待别的包的声明生命周期；其 effects 在 owner collapse 时移除，
  owner 重新挂载时再跑（`:27`）。示例见 `:29-52`：
  ```tsx
  export const inject = ['slots']
  export function apply(ctx: Context): void {
    ctx.slots.inject('conversation.session.header.actions', () =>
      ctx.slots.register({ name: 'conversation.session.header.actions', id: 'review', order: 100 }, HeaderAction))
  }
  ```
- cardinality `single | list | keyed | chain | hoc`；scope `root | session-maybe | session`（`:54-69`）。
  普通 additive 贡献要选**新的** list/hoc `id` 或未占用的 key（`:69, :227`）。
- `priority` 是 shadowing rank，低值先运行/渲染（`:69`）。
- hoc 层必须用 `display: contents`，不得自建 box（`:79`）。

### 组件能拿到什么

`docs/subsystems/slots.md:83-99`：组件输入由 5 份派生 share 组成
（`PropsRuntime<K>` / `PropsRenderSlots<S>` / `PropsStore<H>` / `InjectFace<I>` / `PropsLocale<N>`），
**禁止手写 derived member**（`packages/client/AGENTS.md:13`）。
标准 props（`:101-118`）：

| 可用范围 | props | owner |
|---|---|---|
| 每个 scope | `useSessions`, `useSessionStatus`, `useSessionRetainInfo`, `useSessionAccess` | `ui-session` |
| 每个 scope | `useWorkspaces`, `useWorkspaceAccess` | `ui-workspace` |
| 每个 scope | `useRemoteAccess`（global 资源） | `api-remote-access` |
| 每个 scope | `usePanelInfo` | `ui-layout` |
| `session` | `sessionId`, `useSession`, `useProjection`, `useAccess` | `ui-session` |
| `session-maybe` | 同上但可选 | `ui-session` |

**V2 修订**：`useProjection` 是与 `ctx.sessionProjections` 配对的 Client 读取面，但**本插件不使用它**——V1 计划的 `sessionMarker` projection 因 out-of-tree 不能写会话事件而作废。V2 的 Client 组件通过 `fetch()` 读 `ctx.connection.fetch` exact route 拿标记。
`packages/client/ui-workspace/README.md:90` 补充：导航/启动恢复从 Session 的 `follow` 取 projections，不额外刷新；「listed values are cached hints that can lag its log after an unclean Host exit」——徽标允许短暂滞后。V2 组件经 `useMark()` 读取全页共享的标记列表（定时读取 + 本地写透），重连按 `connection/reset` 刷新（`docs/cookbook/adding-a-remote-api.md:111`）。

组件**永不收到 `ctx`**（`docs/subsystems/slots.md:99`）。live data 只有三个通道：
owner props / local state / declared store（`packages/client/AGENTS.md:16`）。
store 用导出的 `createXXXStore()` factory，禁止 module-level singleton；
`useStore` 读、`props.actions.*` 写。
注册项可用 `inject` factory 返回私有数据与回调；`hooks` 保留字把裸
`getSnapshot`/`subscribe` 源转成 `useXxx(selector)`（`docs/subsystems/slots.md:122-130`）。

### 三个必需注册面（新 client 包缺一不可）

`packages/client/AGENTS.md:150-153`：

1. `tsconfig.client.json` 的 references 加本包；
2. `packages/bundle/web-app/cordis.patch.yml` 加一行 `dsh.client`；
3. `packages/bundle/web-app/package.json` 加依赖。

`dsh.client` manifest 含 `platform: 'web'`；`inject` 只是 informational（`:151`）。
**`pnpm --filter <pkg> bundle` 之后才能对活服务探活**，registry 服务的是 `lib/client.js`（`:153`）。
对仓库外独立 bundle 而言，第 1–3 项由 bundle 自带 `cordis.patch.yml` 的 `dsh.client` 行承担
（`docs/user/develop/basic/publish.md:18-66`），不需要改 DSH 仓库。

## 3. 主题同步

`packages/client/ui-theme/README.md:12`：light / dark / system 三种偏好，存在 `ui-theme`
settings namespace，本地 provider 默认持久化到 `$DSH_HOME/cordis.patch.yml`；
`system` 通过 `prefers-color-scheme` 解析，发布 immutable `ThemeSnapshot`，
`ui-layout` 把快照应用到 document，并注入同步 bootstrap 让调色板在 shell 加载前生效。

`docs/web-styling.md:9-18`：

- `ui-theme` 独占 `--dsw-*` 静态刻度、语义别名、排版、动效、渐变、阴影、滚动条、明暗偏好；
  `ui-layout` 应用解析后的快照；**feature 包只消费语义别名，不得再定义一套全局主题**。
- 全局样式表归 `ui-theme/src/styles/`；**组件样式用 CSS Modules 放在组件旁边**。
- 用 CSS Modules + `clsx`；**不引入组件库、不用 Tailwind**。
- feature 组件用 `--dsw-alias-*` 语义 token；**不得复制静态调色板值或写字面颜色**。

`--dsw-*` 样式表清单在 `ui-theme/src/styles/` 八份
（`base` / `corner-shape` / `design-platform` / `focus` / `onboarding` / `scrollbar` /
`gradient-shadow-text` / `shiki`，`ui-theme/README.md:62-68`）。
`--dsw-alias-state-done-primary` 专用于「标记已完成工作」，light violet-600 / dark violet-400（`:68`）。
`--dsw-alias-menu-icon` 用于菜单图标（`:74`）。
flat border 用 `0.5px` hairline；elevated surface 用 `border: 0` + `--dsw-elevation-*`
（`docs/web-styling.md:26, :32`）。菜单必须用 `Menu` 或 `MenuSurface`（`:27`）。

**结论：同步主题不是「监听主题事件再换色」，而是「组件 CSS 只写 `var(--dsw-alias-*)`」。**
本项目徽标的每个状态色都必须是语义 token（或经 `ctx.theme` 注册的第三方 theme alias override，
`ui-theme/README.md:44`），不写 `#RRGGBB`。若现有 alias 不足以表达 8+ 状态，
优先用**同一组 alias + 形状/图标区分**，第二选择是注册 theme alias override；
绝不内联静态色值。

## 4. 图标：官方 glyph 清单与「插件图标」的边界

### 官方产品图标集

`packages/client/ui-primitives/src/icons/artwork.ts:1-6` 说明：每 glyph 是一个 SVG 文档，
几何可随 stroke weight 变化，`ui-theme` 把每个 glyph×weight 发布为
`<symbol id="dsw-icon-<glyph>-<weight>">` 放进文档级 icon sprite。
`artwork.ts:8-12`：`ICON_REGULAR_STROKE = 1`、`ICON_MEDIUM_STROKE = 1.3`。
`artwork.ts:147-154`：

```ts
export type IconSymbolId = `dsw-icon-${IconGlyph}-${IconWeight}`
export const ICON_SYMBOLS = Object.freeze(Object.fromEntries(
  (Object.entries(ICON_ARTWORK) as [IconGlyph, IconArtwork][]).flatMap(([glyph, artwork]) =>
    (Object.keys(STROKES) as IconWeight[]).map(weight => [iconSymbolId(glyph, weight), artwork.svg(STROKES[weight])])),
)) as Readonly<Record<IconSymbolId, string>>
```

`ICON_ARTWORK` 从 `artwork.ts:22` 开始，已核实的 glyph id（行号即定义处）：
`layers-outline`:23、`save-outline`:24、`new-chat-outline`:25、`search-outline`:26、
`globe-outline`:27、`settings-outline`:28、`panel-left-outline`:29、`ellipsis-outline`:30、
`plus-outline`:31、**`check-outline`:32**、`branch-outline`:33、`chevron-down-outline`:34、
`chevron-left-outline`:35、`chevron-right-outline`:36、`triangle-right-fill`:37、
`chevron-up-outline`:38、`close-outline`:39、`close-fill`:40、**`close-circle-fill`:41**、
`copy-outline`:42、`refresh-outline`:43、`like-outline`:44、`like-fill`:45、
`dislike-outline`:46、`dislike-fill`:47、`share-outline`:48、`deliver-doc`:49、
`edit-outline`:50、`think-outline`:51、`agent-preset-outline`:52、`browse-outline`:53、
`context-injection-outline`:54、`link-outline`:55、`right-up-outline`:56、
`enhance-outline`:57、`trash-outline`:58、**`warning-outline`:59**、**`check-circle-fill`:60**。
（完整清单继续到 `:145`，实现前应重新读一遍该文件，禁止凭记忆编造 id。）

统一几何：`viewBox="0 0 16 16"`、`fill="none"`、`stroke-width=${strokeWidth}`、
`stroke="currentColor"`、`stroke-linecap/linejoin="round"`；**`currentColor` 是与主题同步的关键**。

### 重要边界

`ui-theme/README.md:139`：「**Only product icons are replaceable** — `ThemeDefinition.icons`
covers the ui-primitives product icon set; file-type, **plugin**, site, and brand artwork still
render fixed inline SVG.」
`ui-theme/README.md:44` 的 `ThemeDefinition.icons` 是把 `ICON_SYMBOLS` 的 **id** 映射到完整 SVG 文档
（隐藏 sprite 的 `<symbol>` 子节点、fallback 到默认）；register 会拒绝：未知 id、
无 svg namespace/viewBox、含 `<style>`/`<script>`、元素 id 不以 `<symbol id>-` 开头；
root 的 `width`/`height`/`class`/`aria-hidden` 被忽略；渐变 stop 在 sprite 内解析，跟随 palette token。

**因此本项目的美术方案是**：

1. 状态徽标的图形**复用官方 glyph**（`check-outline` / `check-circle-fill` / `warning-outline` /
   `close-circle-fill` / `refresh-outline` / `browse-outline` / `branch-outline` 等），
   通过 ui-primitives 的图标组件以 `currentColor` 渲染，天然与 DSH 同一风格、自动同步主题。
2. 需要专属「风格化」图形时，随包提供自己的 SVG 资源，放在 `src/client/assets/`，
   并在 `package.json` 声明 `"./assets/*": "./lib/assets/*"`
   （`packages/client/AGENTS.md:73`）；这些 SVG **必须**只用 `currentColor` / `--dsw-*`，
   与官方 `viewBox="0 0 16 16"` + 1/1.3 描边几何保持一致。
3. **不**通过 `ThemeDefinition.icons` 覆盖官方 glyph 来做状态图标——那会全局改变产品图标语义，
   且第三方 theme id 只是进程内扩展、不进 built-in settings schema（`ui-theme/README.md:44`）。

## 5. 文案与国际化

`packages/client/AGENTS.md:124`：所有 product-visible 字符串走 typed locale dictionary + `t`，
`pnpm run verify-client-ui-i18n` 强制；英文用 sentence case。
bundle 最小结构还需 `locale/en.json` 的 `meta.title` / `meta.description`
（Plugin Manager 展示用）与 `icon.svg`（导出 `./icon`，≤256 KiB 且必须在包内）
（社区指南 https://raw.githubusercontent.com/PerryLink/dsh-plugin-guide/main/guide/plugin-dev-guide.md，
**此项为外部资料，非官方仓库事实，实现前用 `cordis_inspect_query` 复核**）。
状态名、菜单项、tooltip、无障碍说明全部进 locale，不硬编码中文。
`ui-workspace/README.md:74` 说明 archived row「carry an accessible explanation」——
本项目徽标同样要提供可访问文本，不能只有色块。

## 6. 测试阶梯

`packages/client/AGENTS.md:139-141`：
`pnpm run test:gui`（每次 GUI 改动）→ `DSH_SNAPSHOT=replay pnpm run test:web`（可见输出变化时）
→ pre-push checks。client source 在 per-file 100% coverage gate 内；
jsdom 测试文件首行 `// @vitest-environment jsdom`（`:132`）。
`docs/web-styling.md:57`：改 shared token 要改 `ui-theme` 里的拥有者，再消费语义别名。
`docs/subsystems/slots.md:218`：可用 `cordis_inspect what:"client"` 查活树与精确 key；
`pnpm run gen-client-catalog` 生成 `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`，
它是每个 key 的 cardinality/scope/owner props/当前占用者/替换风险的权威清单。

## 7. 本项目 Client 侧落地清单

- [x] 读全 `artwork.ts:22-145` 取最终 glyph id 表；只用已核实 id（Phase 1 用文本占位符，Phase 2 换 SVG）。
- [x] 核实三个 slot 的 cardinality / scope / owner props（已确认：list / root / 仅 `{sessionId}`，`packages/client/ui-workspace/src/client/contract/slots.ts:110-170`）。
- [x] 三个注册面：`package.json` 的 `dsh.client` manifest、client 依赖、`exports['./client']` → `lib/client.js` 构建产物。
- [x] `ctx.slots.inject('sidebar.session.row.trailing'|'hover', () => ctx.slots.register({name,id,order,locale:NS}, Component))`。
- [ ] **V2 修订**：状态读取走 `fetch(MARKER_STATE_ROUTE + '?sessionId=...')`；写走 `fetch(MARKER_MUTATE_ROUTE, {method:'POST', body})`，按 `MutationOk.ok` / `MutationError.code` 分支。**不用 `useProjection`、不用 `ctx.remote.sessionStatus.set`**。
- [ ] CSS Modules + `clsx` + `--dsw-alias-*`；零字面颜色；图标 `currentColor`（当前 CSS 已用 token，图标仍为文本）。
- [x] locale 字典 + `t`（`src/client/locales.ts` zh/en key-identical）；`verify-client-ui-i18n` 待在主仓库 context 跑。
- [ ] `test:gui` → `DSH_SNAPSHOT=replay test:web` → pre-push（需主仓库 context）。
