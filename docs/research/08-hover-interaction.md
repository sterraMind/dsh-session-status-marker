# 08 · 悬停卡交互、可访问性与「鼠标挪开点不到」

> **文档版本**：v1.0.2 · 2026-11-12（对应插件 1.0.2）

> 本文回答用户 2026-11-12 的反馈：悬停卡里点击按钮却出现「已复制」、鼠标从会话行挪到悬停卡时卡片会消失、悬停卡文案在切换语言后没变、悬停卡外观在切换主题后没变、八个图标需要内边距。全部官方事实来自 `.research/dsh-repo/` 镜像，附精确路径:行号；外部最佳实践附 URL。

## 1. 官方悬停卡（HoverCard）的固有契约

我们只能向 `sidebar.session.row.hover` 槽提供**内容区**组件，宿主 HoverCard 的开启/关闭、定位、指针宽限都由官方实现控制。

- 整卡可点复制：`packages/client/ui-primitives/src/HoverCard.tsx:293-303` 把卡片 div 设为 `role="button"`，`onClick` 执行 `void copy(copyText)`；`:304` `onKeyDown` 在 Enter/Space 时同样复制；`:312` `copied ? <span className={css.copied}>{copiedLabel}</span> : content` — 复制后整张卡内容被替换成提示文字。会话行传入的 `copiedLabel` 是 `t('hover.copied')`（中文「已复制」），见 `packages/client/ui-workspace/src/client/rows/Rows.tsx:763-778`。
  - **结论**：内容区里任何一个 `button` 若不阻断点击/键盘冒泡，点击就会触发复制并把整卡替换成「已复制」，看起来像「点了按钮却返回 copied」。修法是内容区根节点接管 `onClick` 与 `onKeyDown` 并 `stopPropagation()`。
- 锚点间隙与指针宽限：`packages/client/ui-primitives/src/pointer-grace.ts:8` `export const POINTER_GRACE_MS = 200`，注释「Covers the anchor->popup gap (8px for HoverCard, 4px for Menu) at a hand's travel speed」。
- compact 分支没有 bridge：`packages/client/ui-primitives/src/HoverCard.tsx:222-224` compact 定位只设 `setPos({ left: r.right + ANCHOR_GAP, top })`；只有 `inline` 分支（`:199-220`）才生成 `pos.bridge`，`:350` 才渲染 `<span className={css.bridge} …>`。
- 关闭链条：根 span 的 `onPointerLeave`（`:337-342`）在卡片已开时 `armClose()`；`onPointerEnter`（`:326-336`）会 `cancelClose()`，注释「Coming back inside during the grace (the gap, or the card itself) keeps the current card」。因为卡片是 `createPortal` 到 `document.body`（`:348-353`），卡片内容在 React 树上仍是根 span 的后代，所以**内容区里的指针事件会冒泡到根 span 的 `onPointerEnter`**。
  - **结论**：内容区可以在锚点与卡片之间的 8px 间隙上放一条透明命中区，指针经过它就会冒泡触发 `cancelClose()`，等效于官方 `inline` 分支的 bridge。这就是「鼠标挪开点不到」的插件侧修法。
- Escape 关闭只在 preview/inline 注册：`packages/client/ui-primitives/src/HoverCard.tsx:156-167` `if (!open || (variant !== 'preview' && !inline)) return` 才挂 `keydown` 的 Escape 处理。compact 悬停卡两者都不是，**宿主不注册 Escape**。
- 卡片盒尺寸：`packages/client/ui-primitives/src/HoverCard.module.css:9-19` `.card { --dsw-hovercard-bg: #2C2C2E; position: fixed; z-index: 100; box-sizing: border-box; width: 244px; padding: 12px 16px; }` → 内容宽 212px；无 `overflow: hidden`，内容区可向卡片外延伸命中区。

## 2. 槽位宿主给的钩子与触达通道

- `sidebar.session.row.hover`（`packages/client/ui-workspace/src/client/contract/slots.ts:160-163`）：「Section of the Session row's hover card between its relative time and its trailing status line. **Mounted only while that card is open**」——内容区只在卡片打开时挂载，不能自己维持打开。
- `sidebar.session.row.trailing`（`:148-158`）：「Non-interactive icons … On hover-capable devices, hidden while the row is hovered」——徽标是**非交互**图标，悬停时隐藏，不能当按钮。
- 官方明确要求把动作同时给到菜单：`:203-212` `sidebar.workspaces.session.row.action` 注释「Hoverless devices hide this slot; **contribute the action to the menu list as well for touch access**」；`:176-202` `sidebar.workspaces.session.menu.item` 提供 `useMenuOpenState` 钩子，菜单项渲染 `role="menuitem"` 的 `button`，点击后 `setMenuOpen(false)` 自行收起菜单。
  - **结论**：要彻底摆脱「必须悬停才能标记」，官方指定的通道是会话行的右键/更多菜单（`menu.item`）与行内动作按钮（`row.action`）组合。本次先做悬停卡内的桥接命中区；不依赖悬停的菜单入口列为后续增强。

## 3. 外部最佳实践（网络来源）

- WCAG 2.2 成功标准 1.4.13「Content on Hover or Focus」原文与理解文档：https://www.w3.org/TR/WCAG22/#content-on-hover-or-focus 、https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html — 三条要求：**Dismissible**（指针不移动即可按 Esc 关掉附加内容）、**Hoverable**（指针可移入附加内容而不消失）、**Persistent**（附加内容保持可见直到消失条件/用户关闭/信息失效）；仅一条例外（输入错误提示或不遮挡不替换其他内容时豁免）。
- Floating UI `safePolygon()`：https://floating-ui.com/docs/usehover —「only close the floating element if the pointer is outside a dynamically computed polygon area. This allows the user to move the cursor off the reference element and towards the floating element without it closing」；实现 https://github.com/floating-ui/floating-ui/blob/master/packages/react/src/safePolygon.ts （`requireIntent` 默认 true、`buffer` 默认 0.5）。
- Radix UI tooltip 的 `pointerGraceArea`：https://github.com/radix-ui/primitives/blob/main/packages/react/tooltip/src/tooltip.tsx — 用多边形路径扩大触发区。
- W3C ARIA APG Tooltip Pattern https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/ 与 MDN `tooltip` role https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tooltip_role ；Sarah Higley《Tooltips in WCAG 2.1》 https://sarahmhigley.com/writing/tooltips-in-wcag-21 — **含按钮等可交互内容的浮层已经不是 tooltip**，应按 disclosure / 非模态对话框语义处理。

**综合判断**：安全多边形、指针宽限、关闭延迟、focus 触发都实现在**宿主的触发元素与浮层容器**层，插件只渲染内容区，无法注入多边形、改宽限时长、给触发元素加 `aria-describedby` 或把宿主卡片改成非模态对话框。插件可做的正是官方 `inline` 分支自己用的同一招——在内容区补一条跨间隙命中区，让指针进入内容时能 `cancelClose()`。

## 4. 语言与主题「没同步」的根因

- 语言：官方 Shell 提供 8 种语言 `en, ja, es, fr, de, ru, pt, zh`（`packages/client/locale/src/client/index.ts:23`；`ui-workspace/src/client/index.ts:136` 的 `locale.register(NS, { zh, en, ja, es, fr, de, ru, pt })` 是官方范式），回退语言 `FALLBACK_LOCALE = 'en'`（`locale/src/client/index.ts:110`）。插件此前只注册 `{ zh, en }`，切到其余 6 种时本命名空间缺字典，按回退链掉回英文，读起来就是「语言没切换」。**修法**：把 `src/client/locales.ts` 补齐 8 种并以 `DICTIONARIES` 一次注册（`src/client/index.ts`）。
- 主题：悬停卡表面是**两主题都固定的深色**（`HoverCard.module.css:10` `--dsw-hovercard-bg: #2C2C2E`；`ui-workspace/src/client/rows/Rows.module.css:410-444` 注释「dark surface, fixed colors both themes」）。文字与状态色若改用主题别名，浅色主题下会解析成接近黑色，重演 1.0.0「文字看不见」的缺陷（见 `AGENTS.md` 悬停卡交互约束）。
  - 因此文字与八个状态图标保持静态色板；**主题响应**改由交互面承担：悬停/选中格底色与按钮悬停底色改用 `--dsw-alias-tooltip-key-bg`。该令牌由 `--dsw-alias-tooltip-bg` 派生（`packages/client/ui-theme/src/styles/design-platform.css:281` 浅色 = neutral-bluish-850、`:407` 深色 = neutral-bluish-750，两者不同），是**随主题变化的背景**，坐在静态色文字之下，不会重演不可读问题。
- **1.1.2 之后的最终方案（取代上面的静态色板）**：用户反馈 light 主题下整卡仍是黑色浮窗（1.1.1 只改自己面板、整卡仍宿主固定深色），最终改为用 `[class*='card']:has([data-status-slot])` 从内容区反向覆盖宿主整张卡——`--dsw-hovercard-bg` 指向 `--dsw-alias-bg-layer-2`、宿主 `hoverTitle/hoverPath/hoverTime/hoverStatus` 指向 `--dsw-alias-label-primary/secondary`，面板与状态图标全用主题别名。属性选择器不被 CSS-module 构建器哈希，`:has()+!important` 特异性高于官方样式且只命中含我们 slot 的那张卡。验收口径是**整卡**（读 `cardBg`，light `rgb(255,255,255)` ≠ dark `rgb(44,44,46)`），不是面板透明。见 `docs/acceptance-and-regression.md` §3.12。

## 5. 图标内边距

官方卡内容宽 212px（244 − 2×16），但本组件 `.root` 自身还有 `padding: 6px 8px`，实际可用宽约 196px。八格一行需 `8 × w + 7 × gap ≤ 196`。最终取 `w = 22px`、`gap = 2px`（8×22 + 7×2 = 190px）并在格内留 `padding: 2px` + `box-sizing: border-box`，图标 16px 外有 2px 内边距。dev4090 真实页面复核：先用 `gap = 3px`（197px）时第八格「反馈」换到第二行（实测 7 格 y=458、1 格 y=483），收窄到 2px 后八格同一行。此前 24px + 4px 间距 = 220px 同样溢出。

## 6. 残留限制（诚实记录）

- **Dismissible（Esc 关闭）对 compact 悬停卡不可达**：宿主在 `HoverCard.tsx:156-167` 只为 preview/inline 注册 Escape，插件无法为 compact 补上，也没有宿主暴露的关闭接口。已实现 Hoverable（跨间隙命中区）与 Persistent（内容随卡片存续）。
- 复制是官方设计：会话行传入 `copyText`/`copiedLabel`，插件不能关闭整卡复制，只能保证自己的交互不触发它。
- 触屏/不依赖悬停的入口未做：官方通道是 `menu.item` + `row.action`（§2），列为后续增强。

## 7. 参考

- `.research/dsh-repo/packages/client/ui-primitives/src/HoverCard.tsx:156-167,199-224,272-355`
- `.research/dsh-repo/packages/client/ui-primitives/src/HoverCard.module.css:3-19`
- `.research/dsh-repo/packages/client/ui-primitives/src/pointer-grace.ts:1-46`
- `.research/dsh-repo/packages/client/ui-workspace/src/client/contract/slots.ts:148-212`
- `.research/dsh-repo/packages/client/ui-workspace/src/client/rows/Rows.tsx:763-778`
- `.research/dsh-repo/packages/client/locale/src/client/index.ts:23,110`
- `.research/dsh-repo/packages/client/ui-theme/src/styles/design-platform.css:281,407`
- WCAG 1.4.13、Floating UI、Radix、APG、MDN、Sarah Higley（URL 见 §3）
