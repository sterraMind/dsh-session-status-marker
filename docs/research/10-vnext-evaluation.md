# 下一版本需求评估（v1.1.6 之后）

> 文档版本：v1.1.6 · 2026-11-19
> 对应需求：用户 2026-11-19 提出的五类版本需求
> 取证方式：7 个原子任务，每个任务恰好一次网络搜索 + 一次本地查找；官方行为一律以 `.research/dsh-repo/` 本地镜像的行号为准，网页资料只作设计参考。

## 0. 范围说明

本文只记录技术类调研结论：图标配色、行尾按钮、自动推断、覆盖关系、状态刷新、多语言检阅、筛选与批量。

文档优化（README 手动标记句改写、新增「路线图」章节）已经直接落到 `README.md`，不在本文重复。

## 1. 完成状态对勾的配色评估

### 1.1 当前实现

- 图标本体：`src/client/icons.ts` 的 `ICON_CHECK_CIRCLE`，圆环加圈内对勾，描边 `stroke="currentColor"`，线宽 1.3，16×16，无填充色。
- 契约引用：`src/contracts.ts` 的 `STATUS_META.done` 用 id `check-circle-fill`（id 带 fill，实际是描边风格）。
- 颜色令牌：`done` 的 `tone` 与 `hoverTone` 都是 `var(--dsw-alias-state-done-primary)`。徽标用 `tone`，悬停卡用 `hoverTone`，两者取同一个令牌。图标自身不写颜色，颜色由 CSS 的 `color` 注入令牌值。

### 1.2 实测对比度与结论（2026-11-19 补充）

按 WCAG 2.2 相对亮度公式计算，取 `design-platform.css` 里令牌的解析值与卡片表面色。卡片表面取 `--dsw-alias-bg-layer-2`：浅色段 `:183` 为 `neutral-bluish-00` 即 rgb(255,255,255)，深色段 `:306` 为 `neutral-bluish-850` 即 rgb(44,44,46)，两值与真实页面读到的 computed style 一致。WCAG 1.4.11 对图形对象要求不低于 3:1。

| 状态 | 浅色解析色 | 浅色对白底 | 深色解析色 | 深色对灰底 |
|---|---|---|---|---|
| todo / review | deepseek-500 rgb(65,118,230) | 4.23:1 通过 | deepseek-400 rgb(122,170,255) | 5.99:1 通过 |
| done | violet-600 rgb(124,58,237) | 5.70:1 通过 | violet-400 rgb(167,139,250) | 5.12:1 通过 |
| stopped | red-600 rgb(236,19,19) | 4.50:1 通过 | red-400 rgb(242,90,90) | 4.24:1 通过 |
| blocked | amber-500 rgb(245,158,11) | 2.15:1 不足 | amber-500 rgb(245,158,11) | 6.49:1 通过 |
| pending-subagent / feedback | green-500 rgb(34,197,94) | 2.28:1 不足 | green-500 rgb(34,197,94) | 6.12:1 通过 |
| awaiting-answer 徽标 | neutral-300 rgb(212,212,212) | 1.48:1 不足 | neutral-600 rgb(84,85,87) | 1.87:1 不足 |
| awaiting-answer 悬停格 | label-secondary，浅色 rgb(97,102,107) | 5.80:1 通过 | label-secondary，深色 rgb(207,211,214) | 9.25:1 通过 |

由此得出三条结论：

1. done 不是黑色，也不该改成绿色。`state-done-primary` 在浅色段 `:266` 是 violet-600，深色段 `:390` 是 violet-400，两主题对比度分别是 5.70:1 与 5.12:1，都远高于门槛。若把 done 改成 green-500，浅色主题对比度会降到 2.28:1，低于门槛，反而更差。用户看到的黑色对勾不来自本插件的令牌，需要另找来源。
2. 真正低于门槛的是另外三项：blocked 在浅色主题 2.15:1，pending-subagent 与 feedback 在浅色主题 2.28:1，awaiting-answer 徽标在两个主题都不足。走主题别名无法同时满足两主题，这些属于宿主设计系统的取值，改动意味着偏离 DSH 自己的配色。
3. WCAG 1.4.1 要求不只靠颜色传达状态。当前每个状态都有独立形状图标，满足这一条，所以对比度不足不等于状态无法区分，但仍是清晰度问题。

上述只影响设计取向，未改动任何代码。是否调整颜色需要用户先定，不预先写死十六进制值。

### 1.3 两类图标分开处理

- 插件图标 `icon.svg`：插件身份标识，出现在插件管理界面，`stroke="currentColor"` 由宿主决定颜色，本插件的 CSS 控制不到。它是另一套东西，改它影响的是插件市场外观，不是会话状态识别。
- 状态对勾 `ICON_CHECK_CIRCLE`：用于徽标和悬停卡的 done 状态，由令牌注入颜色。改它影响会话状态识别。

两者形状相近但职责不同，不混改。

## 2. 行尾常驻状态按钮评估

### 2.1 官方槽位契约

- `sidebar.workspaces.session.row.action`（`contract/slots.ts:203-212`）：`{ kind: 'list'; scope: 'root'; owner: SessionRowOwnerProps }`。契约写明是会话行尾「…」菜单按钮之后的悬停按钮，触屏设备隐藏此槽位，并要求把动作同时贡献到菜单。官方在此注册 `archive`（order 100）与 `pin`（order 200）。渲染点 `Rows.tsx:745-759`。
- `sidebar.session.row.trailing`（`contract/slots.ts:150-158`）：`{ kind: 'list'; scope: 'root'; inline: true }`。契约限定为非交互图标，位置在时间标签之后、置顶标记之前。渲染点 `Rows.tsx:733-743`。当前插件徽标在此。
- `sidebar.session.row.hover`（`contract/slots.ts:159-163`）：只在悬停卡打开时挂载。渲染点 `Rows.tsx:474-486`。当前八格状态选择器在此。
- `sidebar.workspaces.session.menu.item`（`contract/slots.ts:164-212`）：上下文菜单条目，自带 `useMenuOpenState`，是官方给触屏与键盘留的通道。

### 2.2 可见性规则

- `row.action` 对应 `.rowActions`：`Rows.module.css:273-278` 默认 `display: none`；`:322-326` 在 `hover: hover` 下，行悬停、菜单打开、键盘输入模态的 `:focus-within` 三种情形显示；`:340-353` 在 `hover: none` 下容器常显，但非置顶的动作按钮被隐藏。即归档与新增按钮在触屏上不可见。
- `trailing` 对应 `.rowResting`：`Rows.module.css:301-307` 默认 `inline-flex`；`:328-332` 在行悬停、菜单打开、键盘模态 `focus-within` 时 `display: none`；`:340-345` 触屏设备常显。指针进入行它就消失，契约也限定非交互。

### 2.3 结论

官方没有「在归档、置顶之后常驻可点状态按钮」的槽位。想要与归档、置顶同列且可点，只能进 `row.action`，代价是悬停才显示且触屏隐藏；想要常驻只能进 `trailing`，代价是非交互且悬停即消失。两者无法合并。

推荐方案：保留悬停卡作为编辑主路径，另在 `sidebar.workspaces.session.menu.item` 增加「设置状态…」菜单条目作为触屏与键盘的入口。常驻行尾按钮不纳入，因为它需要覆盖宿主样式或违反 `trailing` 契约，后续版本升级会破裂。取舍是放弃像素级的常驻按钮，换取跨版本稳定与触屏可用。

## 3. 自动推断规则清单与 AI 未调用原因

### 3.1 全部推断规则（`src/inference.ts:67-101`）

未知事件类型走默认分支返回 `null`，不推断。

| 触发事件 | 条件 | 状态 | autoReason | note | subjectId |
|---|---|---|---|---|---|
| `turn/end` | `reason.kind === 'interrupted'` | `stopped` | `turn-interrupted` | Turn was interrupted before completion. | `null` |
| `turn/end` | `reason.kind === 'blocked'` | `blocked` | `turn-blocked` | `null` | `null` |
| `turn/end` | `reason.kind === 'aborted'` 或 `error` | `stopped` | `turn-interrupted` | `null` | `null` |
| `turn/end` | 其他 kind | 不推断 | — | — | — |
| `tool/call` | name 为 `TodoWrite` 或 `todo_write`，且 `arguments.todos` 至少一项 `status` 存在且不为 `completed` | `todo` | `tool-write-todo` | `null` | `callId`，取不到为 `null` |
| `tool/call` | 其他情形 | 不推断 | — | — | — |
| `job/settled` | `status === 'failed'` 或 `killed` | `stopped` | `job-failed` | `null` | `id`，取不到为 `null` |
| `job/settled` | 其他 status | 不推断 | — | — | — |
| `goal/change` | `phase === 'blocked'` | `blocked` | `goal-blocked` | `null` | `null` |
| `goal/change` | 其他 phase | 不推断 | — | — | — |

关键事实：`turn/end` 正常结束分支没有推断 `done` 的规则。这是「已完成的会话仍是自动推断状态」的直接原因。

### 3.2 监听与过期链路

- `config.autoInfer` 为 true 时才注册 `session/event` 监听（`src/service.ts:148-154`）。
- 事件进入 `#observe`（`src/service.ts:219-236`）：先调 `inferStatus`，再取 `effectiveMark`，经 `shouldApplyInference` 判定后以 `source: 'auto'` 写入域表。
- `autoExpireMs` 只对 `source === 'auto'` 的行惰性过期（`src/inference.ts:111-114`、`src/service.ts:173-179`），手动行不过期。

### 3.3 AI 未主动调用工具的原因

- 工具已注册（`src/service.ts:100-106`），依赖为 `['storageDomain', 'tools', 'sessions', 'sessionTitle']`（`src/service.ts:84`），有意不把 `connection` 列为必需依赖。
- 工具描述原文（`src/service.ts:339`）：`Mark the current session with an explicit status label (TODO / DONE / STOP / BLOCKED / REVIEW / ...). Call this when the conversation state changes in a way that should be visible in the session list.`
- 官方 `docs/tool-catalog.md` 的机制确认：工具的 `name`、`description`、`parameters` 经系统提示词提供给模型，模型据此判断是否调用。搜索没有找到 DSH 官方关于「如何促使模型主动调用自定义工具」的权威说明。
- 可能原因：触发条件是抽象表述，没有列出模型可对照的具体时刻；描述没有写明调用义务；状态列表末尾是省略号，文字部分不完整；没有说明何时不调用；会话结束没有 `done` 规则兜底；是否主动调用还取决于模型版本的工具调用策略，这部分不在插件控制范围内。

### 3.4 改进方向（待范围确认后决定是否实施）

1. 具体化工具描述，列出可判定的触发时刻与不需要调用的情形。
2. 把状态列表补全为八种，去掉省略号，与 `STATUS_VALUES` 一致。
3. 在 `turn/end` 正常结束分支增加 `done` 兜底推断，仍需经过 `shouldApplyInference`，手动标记继续优先。
4. 验收清单增加一条：完成会话后检查状态是否变为 `done`，确认模型确实调用了工具，而不只是确认工具已注册。

## 4. 手动标记与自动/AI 标记的覆盖关系

核心在 `src/inference.ts:104-108` 的 `shouldApplyInference`：

```
if (current === null) return true
if (current.source === 'manual') return false
return current.status !== proposed.status || current.autoReason !== proposed.autoReason
```

- Manual 优先于 Auto 成立：当前行 `source === 'manual'` 时自动推断返回 `false`，不写入。
- AI 工具写入的行同时也是手动：`explicitRow`（`src/service.ts:194-206`）固定写 `source: 'manual'`、`autoReason: null`。`set_session_status` 的 `execute`（`src/service.ts:358-364`）与 HTTP `set` 动作（`src/service.ts:322-327`）都调用它。所以 AI 主动标记一旦落库，自动推断不会再改动它。
- 自动行之间只有 `status` 或 `autoReason` 变化才写入。空行直接写入。
- 清除之后会重新被推断：`clear_session_status` 或 HTTP `clear` 删除整行，下一条匹配事件会重新写入自动行。
- 保护方向是单向的：`putMark`（`src/service.ts:184-186`）本身不做优先级检查，只做整行替换。手动覆盖自动是预期行为；自动覆盖手动被挡在 `#observe` 这一条路径上。

用户 2026-11-19 需求原文写「确认手动标记可以被自动推断和 AI 标记覆盖」，与当前代码行为相反。此处按源码如实记录，是否反转等用户确认。

## 5. 状态刷新机制评估

### 5.1 当前实现

- `src/client/marks.ts:1-14` 写明设计前提：Host 无法把变更推送到浏览器，`domain/changed` 只在进程内，仓库外 bundle 无法注册 Typert Remote 流。因此共用一个定时器读取列表路由，再分发给订阅组件。
- 轮询：`refreshMarksOnce()`（`src/client/marks.ts:55-79`）请求列表路由逐条 `publish`，已订阅但响应缺失的会话发布为 `null`；`tick()`（`:82-88`）每次结束后按 `intervalMs` 重新挂 `setTimeout`，页面隐藏时跳过；`onVisibilityChange()`（`:91-94`）在标签重新可见时立即读一次；`subscribeMarks()`（`:102-136`）在首个订阅者出现时启动，末个订阅者退出时清理。
- 频率来自 Host 在列表响应里回传的 `refreshIntervalMs`（`src/client/marks.ts:62-64`），Host 配置字段在 `src/service.ts:47-57`，下限 250ms，默认 2000ms。
- 本地写透：`publishLocalMark()`（`src/client/marks.ts:138-141`）让发起写入的页面立即更新，无需等下一个周期。
- 三条写入路径（手动、AI 工具、推断）都只更新域表，没有一条主动通知浏览器。其他窗口与 AI 写入靠轮询发现。

### 5.2 DSH 是否提供跨进程广播通道

- `docs/subsystems/storage.md:143,151,170`：`domain/changed` 在写链里严格在持久化确认后发出，但文档明确写「The event is in-process only; cross-process change push is a recorded limitation」。
- `packages/client/connection/src/rpc.ts:79-95,152-176,205-212`：连接层是请求响应模型，没有面向插件的服务端推送或订阅原语。
- 结论：仓库外插件拿不到进程外的事件广播通道。流式响应能否穿过共享 fetch handler 属于待验证项，不能当作已确认能力。

### 5.3 分层改进方案（待范围确认后决定是否实施）

1. 保留本地写透，不改动。这是延迟最低的路径。
2. 多窗口用 `BroadcastChannel` 互通知，改动局限在 `src/client/marks.ts`。页面手动写入成功后发一条只带 `sessionId` 的轻量消息，其他同源窗口收到后调用一次 `refreshMarksOnce()`。发送方自己收不到消息，与本地写透互补。旧浏览器用 `localStorage` 加 `storage` 事件兜底。
3. Host 到浏览器用 SSE 唤醒，覆盖 AI 写入和推断写入。Host 监听进程内 `domain/changed`，新增一个 GET exact fetch route 返回 `text/event-stream`，收到相关变更时写一条只表示「数据变了」的事件。浏览器用 `EventSource` 订阅，收到事件后拉全量列表。三条写入路径最终都落到 `putMark` 或 `clearMark`，会被同一个监听统一覆盖。

事件只做唤醒而不带记录正文，是为了避免客户端缓存与事件顺序交错导致显示不一致。仍需轮询兜底的场景：流式响应不能穿过 Connection、多 Host 进程部署、事件通道断线期间、不同端口或不同 profile 的实例之间。建议保留低频轮询（如 30 秒一次），把 2 秒轮询改为例外启用。

## 6. 多语言真实页面检阅方案

### 6.1 现状

- 8 份字典：`zh / en / ja / es / fr / de / ru / pt`，由 `DICTIONARIES` 一次注册，键集合由 `MarkerKey = keyof typeof zh` 在编译期约束。
- 每份字典 23 个键：状态 8、悬停卡 8、无障碍标签 1、总览 6。占位符 5 种：`{status}` `{reason}` `{note}` `{count}` `{time}`。缺语言按 `FALLBACK_LOCALE = 'en'` 回退。
- `tests/i18n.test.mjs` 共 11 项，其中字典一致性 3 项只验证键集合非空、占位符保留。全部是构建期静态断言，不覆盖真实渲染、切换后文案、翻译准确度、文本扩张后的换行与截断、占位符替换成句、跨重启持久化。

### 6.2 逐语言检阅前置条件

1. 按 AGENTS.md 部署回路在 dev4090 上打包、上传、停旧进程、装插件、起 Web、刷新页面。远程 Edge 必须带 hover/pointer 的 `--blink-settings` 参数，否则悬停卡不展开。
2. 先处理 dev4090 的 `cordis.patch.yml` 带 UTF-8 BOM 导致语言写入被拒的环境限制。这是环境侧问题，不是插件缺陷。
3. 准备三类会话数据：无标记、手动标记带备注、自动推断带 reason，让各类文案都能出现。
4. 每轮记录界面语言、构建号、浏览器版本、截图。

### 6.3 检阅步骤

对每种语言：切换语言确认整页文案改变；刷新并重启实例确认语言与插件文案保持；检阅行尾徽标图标与 `aria-label`；悬停展开后检阅悬停卡文案；打开总览页检阅总览文案；截图检查文本截断、按钮重叠、间距错乱、字符缺失，重点看德语与俄语较长文案下八格是否换行（历史实测 197px 间距会让第八格换行，现已收窄到 190px）；确认占位符全部被替换。

统计字典键数量用 Node 脚本，不用 `grep -c`，多行值与引号差异会让 grep 少算。

## 7. 侧栏筛选与批量操作优先级

### 7.1 宿主能力边界

在 `.research/dsh-repo` 以 `sidebar.session`、`filter`、`batch`、`bulk`、`multi.?select` 等关键词查找，没有出现过滤官方侧栏会话列表或侧栏行多选的官方 slot。宿主提供的是行尾、悬停卡、设置页分区三类注入点，以及菜单项与行操作入口。插件只能在自己注入的区域内实现筛选与多选，不能改变官方侧栏列表本身。

### 7.2 优先级建议

| 方案 | Reach | Impact | Confidence | Effort | 判断 |
|---|---|---|---|---|---|
| 原生侧栏按状态筛选 | 高 | 1 | 低（无 slot，路径不确定） | 很高且不可控 | 本阶段不做 |
| 设置页总览加状态筛选 | 中 | 1 | 高（插件自有区域） | 低 | 优先做 |
| 总览页多选加批量修改 | 中 | 2 | 中（需新增批量路由） | 高 | 次优先 |

MoSCoW 分类：总览筛选为 Should have；总览多选批量为 Could have；原生侧栏筛选为 Won't have（本阶段）。

### 7.3 版本建议

- v1.2 做设置页总览的状态筛选。理由：在插件自有的 `settings.section` 区域内实现，不需要宿主 slot，工作量小，可复用现有 8 状态分组与计数数据，风险低；它是原生侧栏筛选的可行替代。
- v1.3 做总览页多选与批量状态修改。理由：需新增 Host 批量路由、多选界面与结果回写，工作量明显更大；放在 v1.3 可复用 v1.2 的筛选结果，形成先筛后批量改的完整流程。
- 原生侧栏按状态筛选条件性不做。理由：宿主没有过滤 slot，强行实现要依赖不稳定的界面改写手段，与「仓库外 bundle 不修改主仓库源码」的约束冲突。只有宿主后续提供过滤或多选 slot 才重新评估。

## 8. 文档一致性备注

`docs/implementation-plan.md` 的文档头是 v1.0.2 · 2026-11-12，落后于当前 1.1.6。后续若落盘规划文档，以代码与当前版本为准并同步版本标记。
