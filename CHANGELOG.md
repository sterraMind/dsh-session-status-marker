# Changelog

本文件记录 `dsh-session-status-marker` 的对外可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.3] - 2026-11-12

针对用户反馈「主题还是黑色没有同步 dsh 本身主题」的修复轮。

### 修复

- **悬停卡表面跟随主题**：官方 HoverCard 的 `.card` 背景色在 `ui-primitives/src/HoverCard.module.css:9-19` 里硬编码为深色常量，浅色和深色主题解析结果相同。内容区 `.root` 通过负边距 `-12px -16px` 覆盖整张卡片面积，自绘 `background: var(--dsw-alias-bg-layer-2)`（浅色主题白色、深色主题深灰），再以 `padding: 18px 24px` 恢复视觉缩进。
- **文字与图标跟随主题**：`.root` 前景色改用 `--dsw-alias-label-primary`（浅色近黑、深色近白）；状态图标 `hoverTone` 从静态色板改回 `--dsw-alias-state-*-primary`（与侧栏徽标一致，随主题切换）。
- **交互面响应主题**：悬停格、选中格、按钮悬停底色分别改用 `--dsw-alias-interactive-bg-hover` 与 `--dsw-alias-interactive-bg-active`（浅色主题半透明深色叠加、深色主题半透明白色叠加），两主题下均有明确视觉反馈。
- **桥接命中区收窄**：根节点已用负边距外扩至卡片边缘，`.root::before` 宽度从 24px 收窄为 8px（仅覆盖锚点间隙）。

### 变更

- `tests/theme.test.mjs`：三条断言改为主题化——要求 CSS 含 `--dsw-alias-label-primary` 与 `--dsw-alias-bg-layer-2` 且不含 `--dsw-static-neutral-00`；`hoverTone` 匹配 `^var\(--dsw-alias-(state|label)-[a-z0-9-]+\)$`；`.cell:hover` / `.cell.active` 分别使用 `--dsw-alias-interactive-bg-hover` / `--dsw-alias-interactive-bg-active`；桥接断言从 `left: -24px; width: 24px` 改为 `left: -8px; width: 8px`。
- 测试合计 66 项（16 套件）全绿，其中 theme 套件 9 例。

## [1.0.2] - 2026-11-12

针对 2026-11-12 用户验收反馈的修复轮，详见 `docs/research/08-hover-interaction.md`。

### 修复

- 点击悬停卡里的按钮却弹出「已复制」：DSH 自己的悬停卡把整张卡设为可点复制（官方 `ui-primitives/HoverCard.tsx:293-303` 在 `onClick` 复制标题，`:304` 在 Enter/Space 也复制，复制后整卡内容被替换成提示文字）。插件内容区根节点现在接管 `onClick` 与 `onKeyDown` 并 `stopPropagation()`，状态改写不再误触复制。
- 鼠标从会话行挪到悬停卡时卡片会消失：官方 compact 悬停卡只用 200ms 指针宽限跨过 8px 锚点间隙，且这个分支不生成 bridge 元素（`HoverCard.tsx:222-224`、`pointer-grace.ts:8`）。插件在内容区加了一条透明命中区（`.root::before`），指针经过它会冒泡到宿主卡片的 `onPointerEnter` 取消关闭，等效官方 `inline` 分支的 bridge。
- 悬停卡文案在切换语言后没变：插件此前只注册了中英两种字典，而 DSH 提供 8 种语言（`locale/src/client/index.ts:23`），切到其余 6 种时本命名空间按回退链掉回英文。现在 `src/client/locales.ts` 补齐 `zh`/`en`/`ja`/`es`/`fr`/`de`/`ru`/`pt` 并以 `DICTIONARIES` 一次注册。
- 悬停卡外观在切换主题后没变：卡片表面是官方固定深色（两主题一致），文字与状态图标为可读性必须保持静态色板（避免重演 1.0.0 的不可见文字）。本次让交互面响应主题：格子悬停/选中底色与按钮悬停底色改用随主题变化的 `--dsw-alias-tooltip-key-bg`（浅色主题派生自 neutral-bluish-850、深色派生自 neutral-bluish-750），它坐在静态色内容之下，不影响可读性。
- 八个状态图标缺内边距且会换行：格子此前 24px + 4px 间距合计 220px，超出官方卡 212px 内容宽导致换行。现在格子 22px、`box-sizing: border-box`、内边距 2px、间距 2px（8×22 + 7×2 = 190px）。真实页面复核发现 root 自身 6px/8px 内边距后可用宽约 196px，197px（3px 间距）仍会换行，故收窄到 2px。

### 变更

- 8 个状态格新增 `aria-label` 与 `aria-pressed`，屏幕阅读器与键盘可读。

### 测试

- 新增 3 条语言字典断言（覆盖 Shell 全部 8 种语言、与 `zh` 键集合一致、占位符保留）与 3 条样式断言（悬停/选中格用 tooltip 背景令牌、跨间隙命中区存在、8 格在 212px 内单行）。测试合计 66 项。
- 在 dev4090 真实页面复核五项修复：点「修改状态」不再触发复制（`copiedLabelShown: false`、`cardStillOpen: true`）；8 格 `distinctRows: 1` 全部 y=458、22×22px、`padding: 2px`；`.root::before` 命中区 `left: -8px` / `width: 8px`；`--dsw-alias-tooltip-key-bg` 在浅/深主题下解析为不同颜色；语言切换 `T+0` 生效。

### 前端验收（2026-11-17）

通过真实 DSH 主题（`ui-theme preference: system`，不依赖 CDP 媒体模拟）验证悬停卡主题同步：

- **浅色主题**：`rootBg = rgb(255,255,255)`（白）、`rootColor = rgb(15,17,21)`（近黑）、`activeColor = rgb(65,118,230)`（浅色主题状态色）；截图 `.drafts/shots/v103-system-light-picker.png` 显示白色卡片表面 + 深色文字。
- **深色主题**：`rootBg = rgb(44,44,46)`（深灰）、`rootColor = rgb(249,250,251)`（近白）、`activeColor = rgb(122,170,255)`（深色主题状态色）；截图 `.drafts/shots/v103-system-dark-picker.png` 显示深灰卡片表面 + 浅色文字。
- 两个主题下 `cardBox` 尺寸一致（244×214px）、`.root::before` 命中区 `left: -8px / width: 8px`、8 格单行（`cellRows: [458]`、22px 宽、`padding: 2px`）。

语言持久化根因（2026-11-17 补充）：`dsh-home/profiles/smoke/cordis.patch.yml` 头部含 UTF-8 BOM（3 字节），导致 config-editor 写入路径解析失败，设置（语言、主题）写入均被拒绝。移除 BOM 并在 `cordis.patch.yml` 里补上 `- id: locale` / `- id: ui-theme` 两段配置后，语言（`lang=en`）和主题（`data-ds-theme-source`）均跨重启保持。属环境侧修复，插件代码无需改动。

## [1.0.1] - 2026-11-11

### 修复

- 悬停卡在浅色主题下看不清：DSH 的悬停浮层固定是深色表面（官方 `ui-primitives/HoverCard.module.css` 给 `--dsw-hovercard-bg` 写死了深色常量，两个主题都一样），而插件之前用 `--dsw-alias-label-primary` 等主题别名取色，浅色主题下解析成近黑色，按钮与标签落在深色浮层上几乎不可见。现在悬停卡的文字、边框、悬停底色改用 `--dsw-static-neutral-*` 静态色板，8 个状态图标改用 `--dsw-static-*-400` 二级色板（新增 `StatusMeta.hoverTone` 字段）。侧栏徽标仍在主题表面上显示，继续用主题别名，不受影响。

### 测试

- 新增两条样式断言：悬停卡不得引用 `--dsw-alias-label-primary` 与 `--dsw-alias-interactive-bg-hover`，且每个状态的 `hoverTone` 必须来自 `--dsw-static-*` 静态色板。测试合计 60 项。

## [1.0.0] - 2026-11-11

第一个前端验收通过、已知明显缺陷清零的版本。

### 新增

- 会话状态标记：8 种状态（`todo` / `done` / `stopped` / `blocked` / `review` / `pending-subagent` / `awaiting-answer` / `feedback`），手动标记优先于自动推断。
- Host 服务 `SessionStatusService`：`ctx.storageDomain` 持久化（域 `session_status_marker`，表 `marks`），跨进程重启保留。
- 两个 AI 工具：`set_session_status`、`get_session_status`，模型可自主标记当前会话。
- 自动推断：监听 `session/event`（只读），按 `turn/end` 原因与工具调用路径推断状态；自动标记不覆盖手动标记，可按 `autoExpireMs` 过期。
- 三条 exact HTTP route：`/api/session-status-marker.state`、`.list`、`.mutate`，注册走 `ctx.inject(['connection'], ...)`。
- Client UI：侧栏行尾徽标（`sidebar.session.row.trailing`）与悬停卡（`sidebar.session.row.hover`），8 个官方风格 inline SVG 图标，颜色跟随 `--dsw-alias-state-*-primary` 主题 token。
- 全页共享的标记读取器 `src/client/marks.ts`：按 Host 下发的 `refreshIntervalMs`（新配置字段，默认 2000ms，最小 250ms）读取列表并分发给订阅组件，本地写入做写透；页面隐藏时暂停，恢复可见时立即再读。标记写入后无需刷新页面。
- `useMark()` React 绑定，徽标与悬停卡统一从这里取状态。

### 变更

- 版本从 `0.1.0` 升到 `1.0.0`。
- `Config` 新增 `refreshIntervalMs`；`cordis.patch.yml` 同步写入 `2000`。

### 修复

- exact route 未注册：`ctx.get('connection')` 在 `[Service.init]` 时机返回 undefined，改用 `ctx.inject`。
- 图标查表键与官方 glyph id 不一致导致徽标空白。
- 未标记会话的悬停卡没有可点状态格，手动标记对新会话不可用。
- inline SVG 在弹性盒内塌成 0×0。
- 选中状态格用 `background: currentColor` 吃掉图标字形。
- 选择器格子过密，改为 21px 格 + 3px 间距，8 格同一行显示。

### 测试

- `node --test --test-isolation=none`：58 项断言、15 个套件全部通过（`tests/*.test.mjs`，`*.test.ts` 为薄壳）。
- 在 dev4090 的真实 DSH 进程与真实 Web 页面上完成验收：tarball 装载、`--dump-config` 生效、三条 route、跨进程持久化、侧栏徽标、悬停卡选择/改写/清除、AI 自主标记、外部变更经轮询自动显示。

## [0.1.0] - 2026-11-10

内部开发版本，未发布。Host 与 Client 骨架、单测与文档初稿；前端验收发现并修复多处只在真实页面暴露的缺陷。
