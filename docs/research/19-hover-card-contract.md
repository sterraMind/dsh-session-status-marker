# 悬停卡与提示气泡契约（1.3.1-rc.5 定稿）

本文是悬停卡、状态格、提示气泡、行内图标的唯一口径来源。改这几处之前先读本文，不要只看 `AGENTS.md` 的一行摘要。事实依据一律取 `.research/dsh-repo/` 里的文件:行号，或真实页面读到的 computed 值。

## 一、宿主那张卡长什么样

- 宿主悬停卡的表面由别名 `--dsw-alias-hovercard-bg` 决定。官方调色板 `packages/client/ui-theme/src/styles/design-platform.css` 里，light 与 dark 两个主题块都把它定义成 `var(--dsw-static-neutral-bluish-850)`，也就是 `rgb(44,44,46)`。
- 官方设计文档（app.asar 内，中英各一份）原文写明：悬停卡片使用 `--dsw-alias-hovercard-bg`、三档 `--dsw-alias-hovercard-label-*` 与状态色，**该表面在两套配色中均保持深色**。
- 宿主卡片自身样式（`packages/client/ui-workspace/src/client/rows/Rows.module.css` 与 ui-primitives 的 HoverCard 模块）：`position:fixed; z-index:100; width:244px; padding:12px 16px; border-radius:var(--dsw-radius-lg); background:var(--dsw-alias-hovercard-bg); box-shadow:var(--dsw-shadow-lv3)`。
- 宿主在卡里自己画了标题行、工作目录路径行、时间行、状态行（如 `Manual: TODO`）与底部活动状态行（`• Idle`）。这些不是我们画的，也不要去改它们的颜色。
- 卡片本身没有 `overflow: hidden`（只有行内文本类各自有 `overflow: hidden`），所以格子里弹出的气泡不会被卡裁掉。

## 二、我们不重绘宿主卡的表面与宿主行文字（1.3.1-rc.5 起）

- 1.1.2 到 1.3.1-rc.4 的做法是在 CSS 里用 `[class*='card']:has([data-status-slot])` 把 `--dsw-alias-hovercard-bg` 与 `--dsw-hovercard-bg` 指到 `var(--dsw-alias-bg-layer-2)`，把 `--dsw-alias-hovercard-label-primary/secondary/tertiary` 指到 `--dsw-alias-label-primary/secondary`。浅色主题下 `bg-layer-2` 解析成 `#fff`，而宿主文字颜色是固定的近白，于是出现用户看到的白底配近白字。
- 现在那张卡上只允许一条声明：`cursor: default`（宿主 `.copyable` 给整卡手型，读文字时不该像按钮）。
- 插件自己的文字读 `--dsw-alias-hovercard-label-primary/secondary/tertiary`，兜底用静态色 `--dsw-static-neutral-bluish-00` / `-300` / `-400`。不要用 `--dsw-alias-label-*`（页面正文色落在深底上会灰到看不清）。
- hover/active 仍用 `--dsw-alias-interactive-bg-hover` / `--dsw-alias-interactive-bg-active`，它们是低透明度叠加，在深底上成立。
- 验收读 `cardBg`：**两套主题都必须是宿主深色（约 `rgb(44,44,46)`），浅色主题下读到白色即失败**。不要回退到「整卡跟随主题」或负边距自绘白底（1.0.3 到 1.1.0 那种割裂做法）。

## 三、提示气泡一律用宿主 Tooltip

- 宿主 `Tooltip` 在 `@deepseek-ai/dsh-client-ui-primitives`（`.research/dsh-repo/packages/client/ui-primitives/src/Tooltip.tsx`）。这个包在 `packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES` 白名单里，并被 shell 静态 seed 进冻结模块表，所以插件 bundle 可以裸 `require()` 拿到。相应地在 `package.json` 里声明 peerDependency，版本区间与 `@deepseek-ai/dsh-client-ui-renderer` 保持一致。
- 宿主气泡样式：`padding:3px 7px; border-radius:var(--dsw-radius-sm); background:var(--dsw-alias-tooltip-bg); color:var(--dsw-alias-tooltip-label); font-size:13px; line-height:20px; z-index:100; position:fixed; pointer-events:none`。我们不内联这份样式，只调用组件。
- 原生 `title=` 一律不用：它由操作系统绘制，是方的，不读 `--dsw-*` 令牌，不跟界面语言，位置固定在目标上方，用户因此问「为什么 tooltip 在目标上面 好奇怪」。契约测试（`tests/tooltip.test.mjs`）禁止再出现 `title=`。
- 组件参数约定：`side="bottom"`；徽标与行内图标 `delayMs={300}`；悬停卡与行内面板的八格整组 `delayMs={300}`；看板标题 `delayMs={400}` 并另加 `onlyWhenClipped`（没有截断就不弹）。
- 八格整排共用一个气泡，锚在网格容器上（`align="center"`、`gap={8}`），不要每格各挂一个：单格锚点会让气泡跟着指针跳，业界做法（Material 3、Carbon、Radix）都是锚在整组控件上。
- 宿主 Tooltip 的一个坑：锚点被点击时会 `withdraw()`（`Tooltip.tsx:255-261`），而重新弹出只靠锚点的 `onPointerEnter`（`Tooltip.tsx:234-241`）；格间移动不会重发 enter。所以格子的 `onClick` 要 `stopPropagation()`，不把点击往宿主锚点冒泡。
- 「当前悬停的是哪一格」由整排来清空：`onPointerLeave` 挂在网格容器上，`onBlur` 挂在网格容器上并用 `relatedTarget` 判断是否还在组内。格子上不要再挂 `onPointerLeave`/`onBlur`，否则跨格时标签会闪回标记自身的状态一帧。

## 四、交互约束（沿用 1.2.3 之前的结论）

- 内容区**根节点**必须接管 `onClick` 与 `onKeyDown` 并 `stopPropagation()`（`HoverCard.tsx` 里的 `guard` 对象 spread 到每个根 div）。官方 HoverCard 把整张卡注册成 `role="button"` 并在 `onClick` 与 Enter/Space `onKeyDown` 里复制会话标题（`packages/client/ui-primitives/src/HoverCard.tsx:290-304`），复制后整卡内容被替换成提示文字，所以只给单个 `button` 加 stop 不够，点标签或备注同样会误触。
- 官方 `onPointerDownCapture` 与 `onClickCapture` 由卡片持有（`HoverCard.tsx:343-344`），组件不能靠 `onPointerEnter` 维持打开；跨间隙保持打开靠 `.root::before` 命中区冒泡到宿主 `onPointerEnter` 触发 `cancelClose()`。不要删掉这条规则。
- **行内图标不拥有面板**（1.2.3-rc.2 起）：会话行右侧那个 24×24 状态图标只负责把宿主悬停卡打开，不要再给它配自己的 popover，否则同一条行上会同时出现两个浮层。实现方式是在 `document` 上以 capture 拦 `pointerdown` 与 `click`（命中 `[data-status-action]` 时 `stopPropagation()`），click 时向 `from.closest('[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"]')` 派发一个 `pointerover`（`pointerType:'mouse'`）让宿主 `onPointerEnter` 自己开卡。必须绑在 `document`：React 合成事件监听在 root container 上，绑在按钮自身拦不住宿主的 `onPointerDownCapture/onClickCapture`（`dismissFromAnchor` 会在卡片已开时把它关掉）与整卡复制。宿主在 `@media (hover:none)` 下会把我们的行内 slot 隐藏（`.rowQuickActions > [data-slot] > :not(.pinnedAction)`），触屏的入口是 `sidebar.workspaces.session.menu.item` 那个菜单项，不要再试图给触屏补行内面板。
- compact 悬停卡宿主不注册 Escape（`HoverCard.tsx:156-167` 只为 preview/inline 注册），WCAG 1.4.13 的 Dismissible 在这个分支不可达，只能做到 Hoverable 与 Persistent，不要在文档里声称已满足 Dismissible。

## 五、实测数字（1.3.1-rc.5，隔离实例真实页面）

浅色主题（`prefers-color-scheme: light`，页面 `body` 背景 `rgb(255,255,255)`）：

| 项目 | 实测值 |
|---|---|
| 卡片尺寸 | 244×198，圆角 16px |
| 卡片背景 | `rgb(44,44,46)`（宿主深底，浅色主题下也不变白） |
| 宿主标题 | `rgb(255,255,255)` 14px/20px |
| 宿主路径与时间 | `rgb(207,211,214)` 12px/16px |
| 宿主状态行 | `rgb(173,178,184)` 12px/20px |
| 插件标签 | `rgb(255,255,255)` 12px |
| 八格 | 8 个，22×22，同一行（y 全 480），x 从 296 每 24px 递增 |
| 气泡 | 13px/20px、内边距 `3px 7px`、圆角 8px、`z-index:100`、`position:fixed`，落在格子下方 8 像素 |

深色主题（`body` 背景 `rgb(21,21,23)`）：卡片背景同为 `rgb(44,44,46)`，标题 `rgb(255,255,255)`，路径与时间 `rgb(207,211,214)`，气泡底色 `rgb(67,69,74)`（即静态色板 `-750`），落在格子下方 8 像素。

截图：`.drafts/shots/rc5-card-light.png`、`.drafts/shots/rc5-card-dark.png`、`.drafts/shots/rc5-tip-light.png`、`.drafts/shots/rc5-tip-dark.png`。
