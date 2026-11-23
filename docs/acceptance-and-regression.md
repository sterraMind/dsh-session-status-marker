# Acceptance & Regression

> **文档版本**：v1.3.0-rc.3 · 2026-11-20（对应插件 1.3.0-rc.3）

> 记录验收标准、已通过证据、待执行集成 smoke 与回归清单。
> 对应实现进度见 `docs/implementation-plan.md` §2，风险优先级见 `docs/feasibility-and-risks.md`。

## 1. 已通过的验收

| 维度 | 命令 / 脚本 | 证据 |
|---|---|---|
| Host 类型安全 | `pnpm run typecheck` | exit 0，零输出 |
| Host bundle | `pnpm run build:host`（→ `tsc -p tsconfig.json`） | `lib/*.js` / `lib/*.d.ts` 均生成 |
| Client bundle | `node --check lib/client.js` | syntax OK；文件大小随版本变化（r8 为 24,150 B 量级，宿主实际提供的字节数含服务端附加内容） |
| 纯推理测试 | `node --test --test-isolation=none tests/inference.test.mjs` | 17 项全绿 |
| Schema 契约测试 | `tests/types.test.mjs` | 9 项全绿 |
| Service 集成测试 | `tests/service.test.mjs` | 20 项全绿 |
| 行操作 / 菜单入口 / 共享状态选择器 | `tests/action.test.mjs` | 13 项全绿 |
| 备注编辑 | `tests/note-input.test.mjs` | 9 项全绿（含悬停卡备注编辑器与换状态保留备注） |
| i18n / 图标 / 样式契约 | `tests/i18n.test.mjs`、`tests/theme.test.mjs` | i18n 12 项 + theme 11 项全绿 |
| `pnpm run test` | `tests 130 / suites 30 / pass 130 / fail 0`（目录形式 `node --test tests/` 在 Node 26 下另计入 4 个 `.test.ts` 薄壳，同一批断言） |
| pnpm pack | `pnpm pack` | `dsh-session-status-marker-1.3.0-rc.3.tgz`（98,666 B），含 `cordis.patch.yml`、`locale/`、`icon.svg`、`lib/`、`package.json`、`README.md`；`docs/` 与截图不入包 |
| 真实装载 | `dsh plugin --profile smoke add <tgz>`（dev4090） | profile 初始化成功并安装插件，详见 §3 |
| **前端视觉与交互** | 真实 GUI 上操作（dev4090 + CDP） | sidebar 行尾标记、hover card、状态改写/清除、跨进程持久化全部实测通过，见 §3.4 与 §4 |

> 注：`pnpm run <script>` 三条裸命令在 `pnpm-workspace.yaml` 生效前提下也 EXIT=0（见 `docs/project-memory.md` §5.3）。

## 2. 测试分布

| 文件 | 用例数 | 覆盖点 |
|---|---|---|
| `tests/inference.test.mjs` | 19 | `inferStatus` 全部规则分支 + `shouldApplyInference` 三态 + `isAutoMarkExpired` 三态 + `job/settled`/`goal/change` 真实负载形状（旧扁平形状不再命中） |
| `tests/types.test.mjs` | 9 | `MarkRecordSchema.strict`、超长 note 拒绝、默认值填充、`STATUS_META` 全覆盖、route 派生一致性 |
| `tests/service.test.mjs` | 20 | `getMark`/`clearMark`/`listAll`/`putMark`；state route 400 与命中；mutate set→clear 往返；unsupported-action；两个 tool 注册与 execute（含覆盖规则描述、`source:'agent'`）；note 超长抛错；`turn/end interrupted` auto inference + manual mark not overwritten；`?since=<revision>` 条件刷新（命中时返回 `unchanged` 且不带 revision）；`rowActionOrder`/`menuItemOrder` 页面全局注入与默认回退 |
| `tests/smoke.test.mjs` | 1 | 端到端 inference round-trip + state route read-back + neutral-event no-op |
| `tests/i18n.test.mjs` | 12 | `STATUS_META`/tone/schema 默认值一致性 + `MARK_SOURCES`/`EXPLICIT_SOURCES` 顺序 + 图标盒尺寸 + Shell 8 语言字典键集合与占位符 |
| `tests/theme.test.mjs` | 11 | 零字面颜色、inline glyph 盒、active 格不重设 color、badge 尺寸、`:has([data-status-slot])` 整卡覆盖宿主（同时覆盖 `--dsw-alias-hovercard-bg` 与 `--dsw-hovercard-bg`）、面板与状态色用主题别名、hover/active 用 interactive 令牌、桥接命中区、8 格盒尺寸、总览页主题别名 |
| `tests/marks.test.mjs` | 9 | 共享读取器：快照分发、本地写透、消失会话分发 `null`、采纳 Host 读取间隔、读取失败保留上次、`?since` + host 判 unchanged 时跳过 publish、读取失败保留 revision、晚加入会话全量读取、可见性恢复强制全量读取 |
| `tests/overview.test.mjs` | 11 | overview route：分组排序、仅非空组、标题关联、`sessionTitle` 缺失/抛错回退 null、空态、冷会话标题由 `sessionQuery.readTitleSnapshots` 补全、未标记会话按创建时间降序且截断 20 条、无查询引擎时 unmarked 为空 |
| `tests/action.test.mjs` | 13 | 行操作/菜单项 slot 注册（id、order 300、排在官方 archive/pin 之后）、行按钮只负责打开宿主悬停卡并 stopPropagation、菜单项用 owner menu hook + `role=menuitem`、共享选择器契约（8×22px 单行、主题令牌、POST 既有 route）、bundle 表与 8 语言字典键、默认 order + 页面全局读取回退、profile 配置暴露 |
| `tests/copy-guard.test.mjs` | 9 | 整卡防复制守卫（document capture 注册与移除、`stopPropagation` 且不 `preventDefault`、keydown 只拦 Enter/Space、`:has` 作用域限定、交互元素不拦、HoverCard 挂载）+ 行内图标只开宿主悬停卡（不含 popover/StatusPicker、`pointerover` 重放、document capture 拦 pointerdown 与 click） |
| `tests/touch-icon.test.mjs` | 6 | 插件页图标 36×36 填充渐变且无 `currentColor`、菜单项官方字号与 14px 图标列、菜单项与状态选择器接线、CSS 只用主题令牌 |
| `tests/note-input.test.mjs` | 9 | 备注编辑：`setSessionNote` 走既有 mutate route、`normalizeNote` 去空白与空串归 null、编辑态进入/取消/保存、`maxLength` 取 `DEFAULT_MAX_NOTE_LENGTH`、8 语言 `hover.noteEdit/noteSave/noteCancel` 键齐全 |
| **合计** | **130** | suites 30 / pass 130 / fail 0 |

## 3. 真实集成验证（dev4090，已执行）

测试机 `dev4090`（Windows，scoop `versions/deepseek-harness-pre` 0.2.2-rc.1），DSH home 隔离在 `%TEMP%\.drafts\dsh-session-marker\dsh-home`，不触碰真实用户配置。

### 3.1 环境事实与调用方式

复跑用的可复用脚本在 `scripts/remote-smoke/`：

| 文件 | 用途 |
|---|---|
| `scripts/remote-smoke/dsh-cli.cmd` | 用 Electron 二进制跑打包版 CLI（无 `dsh` shim 时唯一入口） |
| `scripts/remote-smoke/check-http.ps1` | 对运行中的宿主跑 8 步 HTTP 回路（401 / 400 / set / get / list / clear / 复查），token 由参数传入，不落盘 |

打包版没有 `dsh` shim（scoop manifest 无 `bin` 字段），CLI 入口在 asar 内。可用的调用方式是包装 cmd：

```bat
set ELECTRON_RUN_AS_NODE=1
set DSH_DESKTOP_NODE_EXECUTABLE=<...>\DeepSeek Harness.exe
"%DSH_DESKTOP_NODE_EXECUTABLE%" --expose-internals <...>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js %*
```

`--version` 返回 `0.2.2-rc.1`。`--from-default-profile web` 才能拿到含 `storageDomain` / `tools` / `connection` 三个 inject 服务的组合；`@deepseek-ai/dsh-base` 单独不含 `connection`。

### 3.2 已通过步骤

| 步骤 | 实际命令 / 操作 | 实测证据 |
|---|---|---|
| 1 | `dsh plugin --profile smoke add <tgz>` | `initialized profile smoke`、`+ dsh-session-status-marker 1.0.0`、`Done in 541ms using pnpm v11.28.5`；`profiles/smoke/package.json` 的 `dsh.profile.bundles` 为 `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-session-status-marker"]`，依赖为 `file:<tgz 绝对路径>` |
| 2 | `dsh --profile smoke --dump-config`（44,984 B 输出） | 第 1244–1249 行出现 `# == dsh-session-status-marker` / `- id: session-status-marker` / `name: dsh-session-status-marker` / `config: {autoInfer: true, maxNoteLength: 200, autoExpireMs: 0}`，即 patch 行生效且三字段被 Config 消费 |
| 3 | `dsh --profile smoke --no-open --port 3099` | 打印 `dsh web: http://127.0.0.1:3099/?token=…`；Web 宿主启动成功，同进程内插件 `[Service.init]` 完成（否则 boot 报错） |
| 4 | 未带 token 请求 `/api/session-status-marker.state` | 401，路由挂在鉴权层之后 |
| 5 | 带 token `GET …state?sessionId=`（空参） | 400，参数校验生效 |
| 6 | 带 token `POST …mutate` 写 `{action:'set', sessionId:'smoke-session-1', status:'todo', source:'manual', note:'integration smoke'}` | 200；随后 `GET …state` 回读同一行（`insertedAtMs:1794371895228`, `seq:0`） |
| 7 | **第二个独立进程**（同 home，端口 3100）冷读 `…list` 与 `…state` | 两者都返回上一步写入的记录 → 持久化在进程间成立，不需要原进程存活 |
| 8 | 落盘文件核对 | `$DSH_HOME/storages/session_status_marker/marks/smoke-session-1.json`（266 B），`storages/` 其余只有 `workspace.json`，未污染 session log |
| 9 | 首页 boot graph 核对 | 应用批次的 entry 表含 `{"id":"dsh-session-status-marker","url":"plugins/??dsh-session-status-marker/client.js&rev=5316c305b21c","rev":"5316c305b21c","inject":["slots"]}` → `dsh.client` 声明被 client-modules 组合进启动图 |
| 10 | `GET plugins/??dsh-session-status-marker/client.js&rev=5316c305b21c` | 200，23,233 B；内容含 `__ModuleLoader__.load`、`sessionStatus.marker`、`sidebar.session.row.trailing`、`sidebar.session.row.hover`、`session-status-marker.state`、SVG `viewBox` |

### 3.3 未执行项（受外部条件限制，不是代码问题）

| 项 | 阻塞原因 | 替代证据 |
|---|---|---|
| `cordis_inspect_query` 查 service/tools/routes/slots | 该工具只在 Creator mode 的 agent turn 内可用，属于打包版 Creator 面的能力，测试 home 里没有对应开关记录 | 步骤 3 证明 `[Service.init]` 未抛错；§3.4 用真实页面直接调用三条 route 得到 200/400/404，比 inspect 更直接；`tests/service.test.mjs` 14 项覆盖两个 tool 的注册与 execute |

> 该工具要补跑时，在 Creator mode 的会话内先 `cordis_inspect_list` 拿 provider/method，再 `cordis_inspect_query`。

### 3.4 前端视觉验收（dev4090 真实 GUI，已执行）

驱动方式：dev4090 上的 Edge 以 `--remote-debugging-port=9333` 常驻，本机通过 ssh `-L 9333:127.0.0.1:9333` 转发，再用仓库内的 `.drafts/cdp.mjs`（CDP over WebSocket）操作页面与截图。**这是"不绕过开发逻辑手动造数据"的验收方式**：所有标记都通过页面上的真实按钮产生。

| 验收点 | 操作 | 实测证据 |
|---|---|---|
| 侧栏标记可见 | 打开 `http://127.0.0.1:3099/`，读未选中行的行尾座位 | 有标记的行渲染 16×16 inline SVG，颜色为 `--dsw-alias-state-*-primary`（如 review 为 `rgb(65,118,230)`）；无标记行只渲染 a11y 文案 `此会话暂无标记` |
| 手动标记（未标记会话） | hover 一个全新会话 → 点「修改状态」→ 点 8 格之一 | hover card `data-mark="absent"`、`aria-expanded="true"`、8 格齐全；点「待办」后 `…list` 出现 `{status:"todo",source:"manual"}` |
| 手动标记（已标记会话） | hover 已有标记的行 → 点「修改状态」→ 点「已完成」 | `…list` 中该会话由 `review` 变为 `done`，`source` 仍为 `manual` |
| 清除标记 | hover 有标记的行 → 点「清除」 | `…list` 中该会话消失，`…state` 返回 `{"mark":null}`，行尾 SVG 消失 |
| 跨进程持久化 | 杀掉 3099 进程 → 重新 `dsh --profile smoke --no-open --port 3099` → 刷新页面 | 重启后行尾标记仍渲染原状态下标，未丢数据（连续三次重启复验） |
| AI 自主标记 | 新建会话 → 提示 `请调用 set_session_status 工具，把当前会话标记为 completed，备注写 ai-self-mark，然后只回复 DONE` | 模型确实调用工具，`…list` 新增 `{status:"done",source:"manual",note:"ai-self-mark"}`；侧栏出现对应标记 |
| 主题同步 | 同一页面分别用浅色与深色 `prefers-color-scheme` 读取徽标颜色 | 浅色下为 500/600 级、深色下切到 400 级（done `rgb(167,139,250)`、todo `rgb(122,170,255)`），尺寸始终 16×16，见 §3.7 |

截图（随会话产出，路径为工作区相对路径）：`.drafts/shots/acceptance-sidebar.png`（侧栏标记）、`.drafts/shots/hover-card-full.png`（hover card 全景）、`.drafts/shots/hover-card-picker.png`（8 格放大）、`.drafts/shots/badge-zoom.png`（标记放大）。

### 3.5 自动化驱动的已知偏差（属测试工具，不是产品缺陷）

| 现象 | 原因 | 处理 |
|---|---|---|
| CDP `Input.dispatchMouseEvent` 点击「修改状态」看起来没反应 | 一次 `mousePressed`+`mouseReleased` 在该页面上被 React 收到两次 click，`setPicking(v => !v)` 开了又关 | 该按钮用页面内单次 `element.click()` 触发；格子按钮用 CDP 真实鼠标点击验证 |
| 无头/远程 Edge 里 hover card 永不出现 | 无头浏览器上报 `(hover: none)`，DSH 按触屏处理，`sidebar.session.row.hover` 不展开；`Emulation.setEmulatedMedia` 覆盖不了 | Edge 启动参数加 `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`（Playwright 同款做法） |
| 被 hover / 被选中的行看不到行尾标记 | DSH 的 `sidebar.session.row.trailing` 契约规定行 hovered/focused 时隐藏 seats | 截图取未选中行；属官方行为，不是插件问题 |

### 3.6 Phase 4 变更推送（1.0.0）

背景：`domain/changed` 只在 Host 进程内广播（`docs/subsystems/storage.md:170` 记录为已知限制），out-of-tree 插件无法注册 Typert Remote 流，因此浏览器拿不到服务端推送，Phase 3 版本上标记完成后必须刷新页面才能看到新状态。

实现：`src/client/marks.ts` 是全页共享的标记读取与分发模块。

- 一个页面只保留一个定时读取器，按 Host 下发的 `refreshIntervalMs`（`Config` 新字段，默认 2000ms，最小 250ms）读取 `GET /api/session-status-marker.list`，把结果分发给所有订阅组件；`document.hidden` 时暂停，`visibilitychange` 变为可见时立即再读一次。
- 组件自身完成写入后调用 `publishLocalMark(sessionId, mark)` 做本地写透，行尾标记在点击后立即变化，不等下一轮读取。
- 订阅的会话如果从列表里消失（清除或自动过期），分发 `null`，标记随之消失。读取失败保留上一次结果，下一轮重试。

验收证据（dev4090 真实页面，r11 = 1.0.0）：

| 检查项 | 操作 | 结果 |
|---|---|---|
| 本地写透 | 在未标记会话的 hover card 点「待办」，鼠标移开行尾后读取徽标 | `data-status="todo"`、`title="待办"`，页面未刷新 |
| 轮询接收外部变更 | 页面内直接 `POST /api/session-status-marker.mutate` 清除该标记，等 3 秒后读取同一行 | 徽标变为空态（仅 `此会话暂无标记` 无障碍文案），`…list` 计数 6 → 5，页面未刷新 |
| 配置下发 | 读取 `…list` 响应 | `refreshIntervalMs: 2000` |

截图：`.drafts/shots/v1-sidebar.png`（行尾标记）、`.drafts/shots/v1-picker.png`、`.drafts/shots/v1-picker-zoom.png`（8 格选择器放大，同一行内显示）。

### 3.7 主题同步与悬停浮层配色（1.0.1）

DSH 的悬停浮层在两个主题下都固定使用深色底（`.research/dsh-repo/packages/client/ui-primitives/src/HoverCard.module.css:9-19` 的 `--dsw-hovercard-bg`，以及 `.research/dsh-repo/packages/client/ui-workspace/src/client/rows/Rows.module.css:410-444` 的说明「dark surface, fixed colors both themes」）。1.0.0 的悬停卡用 `--dsw-alias-label-primary` 这类随主题变化的别名取色，浅色主题下解析成接近黑色，落在深色浮层上几乎不可读。1.0.1 把浮层文字与格子颜色改为固定深色底可用的静态色板（`--dsw-static-neutral-00`、`--dsw-static-neutral-bluish-300`，以及每个状态各自的 `--dsw-static-*-400`），侧栏徽标仍用主题别名，因此徽标继续跟随主题。

| 检查项 | 操作 | 实测证据 |
|---|---|---|
| 浅色主题徽标 | 浅色页面读行尾标记 | done `title="已完成"`、todo `title="待办"`，16×16，颜色为主题 500/600 级别名 |
| 浅色主题悬停卡 | hover 有标记的行，读文字与按钮计算样式 | 标题与「手动标记」为 `rgb(255,255,255)`，按钮为 `rgb(207,211,214)`，边框 `color(srgb 1 1 1 / 0.24)`，浮层底 `rgb(44,44,46)`；8 格图标颜色分别为蓝/紫/红/琥珀/蓝/绿/浅灰/绿 |
| 深色主题徽标 | `Emulation.setEmulatedMedia` 设 `prefers-color-scheme: dark` 后读同一页面 | `color-scheme: dark`、body `rgb(21,21,23)`，徽标切到 400 级（done `rgb(167,139,250)`、todo `rgb(122,170,255)`），尺寸不变 |
| 深色主题悬停卡 | 同一会话内 hover 后读样式并截图 | 标题白、按钮 `rgb(207,211,214)`、浮层底 `rgb(44,44,46)`，与浅色主题完全一致（符合官方两个主题共用深色浮层） |
| 写入与清除回路无回归 | 1.0.1 页面上 `POST mutate` 设为 `blocked`，等 3 秒读徽标；再 `clear`，等 3 秒读徽标 | `data-status` 先变 `blocked/受阻` 再回到空态，`…list` 计数随之变化，全程未刷新页面；`refreshIntervalMs: 2000` |

截图：`.drafts/shots/v101-hover-light.png`（浅色悬停卡，640×480，34,253 B）、`.drafts/shots/v101-picker-light.png`（浅色 8 格，660×440，26,937 B）、`.drafts/shots/v101-dark-page.png`（深色整页，1576×861，72,037 B）、`.drafts/shots/v101-dark-hover.png`（深色悬停卡，660×500，39,558 B）。

工具说明：`Emulation.setEmulatedMedia` 是会话级设置，因此深色截图由 `.drafts/dark-shot.mjs` 在同一个连接里完成设置、悬停与截图；分开调用会各自回到浅色。

### 3.8 Phase 5 四项修复的真实页面复核（1.0.2）

1.0.2 针对五项反馈的实现在 §3.4 与 §3.7 之外还需要单独复核「复制误触」「八格单行与内边距」「跨间隙命中区」「主题响应的交互面」「八语言字典」。驱动脚本 `.drafts/hover-verify.mjs`、`.drafts/theme-picker.mjs`、`.drafts/lang-diag.mjs`（均为一次性诊断脚本，留在工作区 `.drafts/`）。

| 验收点 | 操作 | 实测证据 |
|---|---|---|
| 复制误触已修 | 悬停有标记的行 → 点 hover card 内的「修改状态」按钮 | `copiedLabelShown: false`、`pickerCells: 10`、`cardStillOpen: true`（1.0.1 及更早版本此处会把整卡内容替换成「已复制」） |
| 八格单行 | 点开选择器后逐个读 `button[aria-pressed]` 的 `getBoundingClientRect()` | `count: 8`、`distinctRows: 1`、`singleRow: true`，8 格 x=304/328/352/376/400/424/448/472 全部 y=458，无换行 |
| 图标内边距 | 读格子计算样式 | 22×22px、`padding: 2px`、`box-sizing: border-box`，16px SVG 有 3px 视觉留白 |
| 跨间隙命中区 | 读插件内容根节点的 `::before` | `content: ""`、`position: absolute`、`left: -24px`、`width: 24px`、`top: -12px`、`bottom: -12px`；指针经此区域冒泡到官方 `onPointerEnter`，抵消 `pointer-grace.ts:8` 的 200ms 关闭宽限 |
| 主题响应的交互面 | 同一页面分别用浅色与深色 `prefers-color-scheme`，点开选择器后用探针元素解析 `--dsw-alias-tooltip-key-bg` | 浅色 `--dsw-alias-tooltip-bg = #2c2c2e`（neutral-bluish-850），解析为 `color(srgb 0.32149 0.32149 0.327922)`；深色 `#43454a`（neutral-bluish-750），解析为 `color(srgb 0.395451 0.401882 0.417961)`。格子与按钮的悬停/选中底色随主题变化，而文字与状态图标保持静态色板（两个主题下浮层底色同为 `rgb(44,44,46)`、active 格「反馈」同为 `rgb(78,209,126)`） |
| 八语言字典 | 点击「账号菜单 → 设置 → 语言胶囊 → English」后按 0/80/250/600/1500ms 采样 `document.documentElement.lang`，再 `Page.navigate` 重载复查 | `T+0` 为 `en`、胶囊显示 `English`，证明 `locale/change` 事件与插件字典通路正常；随后 80ms 起回到 `zh-CN`，重载后仍是 `zh-CN`。定位为 Host 配置 `LOCALE_PREFERENCE_FIELD` 写在 dev4090 上不落盘（`locale/src/client/index.ts:261` 的 `void this.host?.set(...)` 被 adopt 读回旧值覆盖），**属环境限制而非插件缺陷**；单元测试用 `DICTIONARIES` 覆盖 Shell 全部 8 种语言且与 zh 键集合一致 |

截图：`.drafts/shots/v102-light-picker.png`（浅色 8 格，1576×861）与 `.drafts/shots/v102-dark-picker.png`（深色 8 格，1576×861）；`.drafts/shots/v102-light-hover.png` 与 `.drafts/shots/v102-dark-hover.png` 为选择器打开前的悬停卡整页。

> 未在真实页面验证的点：切换到 ja/es/fr/de/ru/pt 后的插件文案渲染（受上表最后一行的 Host 持久化限制，只能验证 `en` 的瞬时切换）；英文以外的字典键集合由 `tests/i18n.test.mjs` 的断言保证。

### 3.9 1.0.3 悬停卡主题同步（真实 DSH 主题，2026-11-17）

1.0.3（提交 `e5cb7cf`）把悬停卡表面与文字从静态色板改为主题别名（`--dsw-alias-bg-layer-2` / `--dsw-alias-label-primary`），内容区用负边距 `-12px -16px` 覆盖整张卡片，官方 `.card` 固定深色底色被遮住。此前（§3.8）受「`ui-theme preference` 固定为 dark、CDP `prefers-color-scheme` 媒体模拟不影响 DSH 主题解析」限制，只能验证深色一端；本轮通过把远程 `ui-theme preference` 改回 `system`，用真实 DSH 主题管线驱动 `prefers-color-scheme` 完成两端验收。

驱动脚本 `.drafts/theme-verify-103b.mjs`（一次性诊断脚本，留在工作区 `.drafts/`）。

| 验收点 | 操作 | 实测证据 |
|---|---|---|
| 浅色主题表面 | `ui-theme preference: system` + `prefers-color-scheme: light` → 悬停会话行 → 点「Change status」 | `dsThemeSource: system`、`darkAttr: false`、`bodyBg: rgb(255,255,255)`、`rootBg: rgb(255,255,255)`（白）、`rootColor: rgb(15,17,21)`（近黑）、`activeColor: rgb(65,118,230)`（浅色主题状态色） |
| 深色主题表面 | 同上，`prefers-color-scheme: dark` | `dsThemeSource: system`、`darkAttr: true`、`bodyBg: rgb(21,21,23)`、`rootBg: rgb(44,44,46)`（深灰）、`rootColor: rgb(249,250,251)`（近白）、`activeColor: rgb(122,170,255)`（深色主题状态色） |
| 桥接命中区 | 读插件内容根节点的 `::before` | 两主题一致：`left: -8px`、`width: 8px`（仅覆盖锚点间隙） |
| 八格单行 | 读 `button[aria-pressed]` 的 `getBoundingClientRect()` | 两主题一致：`cellCount: 8`、`cellRows: [458]`、`cellW: 22` |

截图：`.drafts/shots/v103-system-light-picker.png`（浅色 8 格，1600×900）与 `.drafts/shots/v103-system-dark-picker.png`（深色 8 格，1600×900）。

| 维度 | 浅色主题 | 深色主题 |
|---|---|---|
| 悬停卡表面 | `rgb(255,255,255)` 白 | `rgb(44,44,46)` 深灰 |
| 主文字 | `rgb(15,17,21)` 近黑 | `rgb(249,250,251)` 近白 |
| active 格「TODO」 | `rgb(65,118,230)` | `rgb(122,170,255)` |

> **语言持久化根因（2026-11-17 补充，环境侧修复）**：§3.8 记录的「语言切换不持久」根因已定位——`dsh-home/profiles/smoke/cordis.patch.yml` 头部含 UTF-8 BOM（3 字节 `EF BB BF`），导致 config-editor 写入路径解析失败，所有设置（语言、主题）写入均被拒绝。移除 BOM 并在 `cordis.patch.yml` 里补上 `- id: locale`（`config: { preference: en }`）与 `- id: ui-theme`（`config: { preference: system }`）两段配置后，语言（`lang=en`）和主题均跨重启保持。**属环境侧修复，插件代码无需改动。**

### 3.10 1.1.0 跨会话状态总览（真实页面，2026-11-18）

1.1.0 新增设置页 `会话状态`（`settings.section`，order 60）与新 Host 路由 `GET /api/session-status-marker.overview`。dev4090 真实页面完成端到端验收：

| 验收点 | 操作 | 实测证据 |
|---|---|---|
| 插件装载（新 DSH 安装） | dev4090 的 DSH 从 scoop 换成 `AppData\Local\Programs` 常规安装（0.2.0-rc.2），旧的 `dsh-test.cmd`  scoop 路径失效 → 用新版 exe/asar 路径重写 shim；插件 peerDependencies 声明 0.2.2-rc.1，被 0.2.0-rc.2 拒装 → `dsh plugin --profile smoke allow-version dsh-session-status-marker@1.1.0 --dsh-version 0.2.0-rc.2 --accept-risk` 显式豁免后 `dsh plugin add` 成功 | `INSTALLED_VERSION=1.1.0` |
| overview 路由 | 浏览器内 `fetch('/api/session-status-marker.overview')` | HTTP 200，`{ groups, totalMarked, refreshIntervalMs }`；初始 `totalMarked=4`、3 个非空组 |
| 设置页入口 | 点左下角 Settings → 侧栏出现 `Session status` 项 → 点入 | 页面标题 `Session status overview`；按 TODO / Done / Review / Awaiting answer 分组，组头带计数，组内按更新时间降序 |
| 标题关联 | mutate 一条当前会话的标记后读 overview | 该条 `title` = `标记会话为完成`（真实会话标题），备注 `v110-frontend-verify`；孤儿标记（会话已不在列表）回退 `Untitled session` |
| 轮询生效 | 页面不刷新，mutate 后等 3 秒 | 设置页自动新增 `Done 1` 分组并显示新标记，`totalMarked` 4 → 5 |
| 主题同步 | `ui-theme preference: system` + `prefers-color-scheme` 分别 light/dark | 浅色 `bodyBg rgb(255,255,255)`、深色 `bodyBg rgb(21,21,23)`；状态组标题用 `--dsw-alias-state-*-primary` 随主题切换，面板底色随 DSH 主题变化 |

截图：`.drafts/shots/v110-overview-light.png`（浅色，1576×861，59,217 B）、`.drafts/shots/v110-overview-dark.png`（深色，1576×861，61,936 B）、`.drafts/shots/v110-overview-titled.png`（含真实会话标题，63,498 B）。

> 环境注记：dev4090 本机 DSH 由 scoop 版改为 `AppData\Local\Programs` 常规安装，版本从 0.2.2-rc.1 变为 0.2.0-rc.2；通过显式版本豁免完成装载。前端行为在 two themes 下均正常，未观察到与版本差异相关的运行错误。

### 3.11 1.1.1 悬停卡浅色主题割裂修复（真实页面，2026-11-18）

用户指出 1.0.3–1.1.0 的 light picker 存在黑白割裂：DSH 会话行悬停卡两主题都固定深色、宿主的标题/时间/状态行都是深底浅字，而 1.0.3 起给状态面板单独涂了随主题变化的白底（`--dsw-alias-bg-layer-2`），浅色主题下出现「上黑 + 中白 + 下黑」。1.1.1 改回融入官方深色卡。

| 验收点 | 操作 | 实测证据 |
|---|---|---|
| 浅色主题无割裂 | `ui-theme preference: system` + `prefers-color-scheme: light`，悬停会话行、开状态面板 | `bodyBg rgb(255,255,255)`、`cardBg rgb(44,44,46)`、面板 `panelBg rgba(0,0,0,0)`（透明）、`panelColor rgb(255,255,255)`；8 格单行 `cellRows:[378]` |
| 深色主题一致 | 同一页面切 `prefers-color-scheme: dark` | `bodyBg rgb(21,21,23)`、`cardBg rgb(44,44,46)`、面板透明、文字白色、8 格单行——与浅色主题同一套卡内配色 |
| 状态图标可读 | 读 8 格 `color` | 400 级静态色：`todo rgb(122,170,255)`、`stopped rgb(242,90,90)` 等，在固定深色卡上两主题都稳定 |

截图：`.drafts/shots/v111-light-picker.png`、`.drafts/shots/v111-dark-picker.png`（均 1576×861，已目检）。部署链路同 §3.10：base64 经 ssh stdin 上传 tgz → 停 3099 → `dsh plugin add`（1.1.1 需 `allow-version --accept-risk`）→ 常驻 ssh 起 web → CDP 复核；远程 `lib/client.js` 实测含 `--dsw-static-neutral-00`、不含悬停卡白底声明。

> **1.1.1 已被 1.1.2 取代**：1.1.1 只改了自己面板（透明 + 固定浅色文字），整卡仍是宿主固定深色，浅色主题下整卡仍黑，未满足「跟随 DSH 主题」。见 §3.12。

### 3.12 1.1.2 整卡主题接管（真实页面，2026-11-18）

1.1.1 被用户否决（「light 这回也是黑色浮窗」）：验收口径应是**整张卡**跟随主题（读 `cardBg`，light≠dark 才算通过），只看「面板透明/文字白」是错误口径。根因：官方 `div.card`（`ui-primitives/src/HoverCard.module.css:9-19`）`--dsw-hovercard-bg` 写死 `#2C2C2E`，宿主标题/路径/时间/状态行也写死深底浅字（`ui-workspace/.../rows/Rows.tsx:473-495`、`Rows.module.css:417-444`），我们 slot 只是卡里的一段，只调自己面板无法让整卡跟随主题。

1.1.2 从内容区用 `:has([data-status-slot])` 覆盖宿主整张卡（方案先经 `.drafts/probe-takeover.mjs` 在 1.1.1 页面注入验证成立）：

- `src/client/hover.module.css` 新增 4 组全局规则（属性选择器不被 `build-client.mjs` 的 `.class` 哈希改写，`:has()` + `!important` 特异性高于官方样式，只命中含我们 slot 的那张卡）：`[class*='card']:has([data-status-slot]) { --dsw-hovercard-bg: var(--dsw-alias-bg-layer-2) !important }`；`[class*='hoverTitle'] → --dsw-alias-label-primary`、`[class*='hoverPath']/[class*='hoverTime']/[class*='hoverStatus'] → --dsw-alias-label-secondary`（均 `!important`）。我们面板 `.root` 透明、`--dsw-alias-label-primary`，hover/active 用 `--dsw-alias-interactive-bg-hover/active`，状态图标用主题别名。
- `src/client/HoverCard.tsx`：`data-status-slot` 锚点 spread 到三个根 div；`guard`（`stopPropagation` 阻断官方整卡复制）保留。
- `src/contracts.ts`：八项 `hoverTone` 改回主题别名（awaiting-answer 用 `--dsw-alias-label-secondary`）。
- `tests/theme.test.mjs`：新增 `:has` 整卡覆盖、面板主题别名、主题感知 hover 色三条断言。

`.drafts/verify-112.mjs` 两主题实测（驱动同 §3.10）：

| 验收点 | 操作 | 实测证据 |
|---|---|---|
| 浅色主题整卡变浅 | `ui-theme preference: system` + `prefers-color-scheme: light`，悬停会话行 → 点「Change status」 | `bodyBg rgb(255,255,255)`、**`cardBg rgb(255,255,255)`**、`titleColor rgb(15,17,21)`、`metaColor rgb(97,102,107)`、`ourPanelColor rgb(15,17,21)`；8 格单行 `cellRows:[378]` |
| 深色主题整卡变深 | 同上切 `prefers-color-scheme: dark` | `bodyBg rgb(21,21,23)`、**`cardBg rgb(44,44,46)`**、`titleColor rgb(249,250,251)`、`metaColor rgb(207,211,214)`、`ourPanelColor rgb(249,250,251)`；8 格单行 |
| 整卡随主题（验收口径） | 对比两主题 `cardBg` | light `rgb(255,255,255)` ≠ dark `rgb(44,44,46)` → 通过 |

截图：`.drafts/shots/v112-light-picker.png`（53,023 B，白卡深字彩色图标）、`.drafts/shots/v112-dark-picker.png`（51,214 B，深灰卡浅字），均 1576×861，已目检。部署：`.drafts/upload-112-chunked.ps1` 分块 base64 ssh 上传（REMOTE_BYTES=56683）→ `allow-version dsh-session-status-marker@1.1.2 --dsh-version 0.2.0-rc.2 --accept-risk` + `dsh plugin add`（INSTALLED_VERSION=1.1.2）。本地 73 项测试全绿、`pnpm pack` 56,683 B（发布前；放宽 engines 下限后重打包为 56,921 B）。

### 3.13 发布验收（2026-11-18）

| 目标 | 状态 | 证据 |
|---|---|---|
| 放宽 dsh 版本下限 | 完成 | `package.json` `engines.dsh` = `>=0.2.0-rc.2 <0.3.0`（匹配 dev4090 真实验收的常规安装 0.2.0-rc.2）；提交 `f836a4c`，tag `v1.1.2` 重打到该提交 |
| GitHub 发布 | 完成 | `sterraMind/dsh-session-status-marker`（public），`git push -u origin main` + `git push origin v1.1.2` EXIT=0；Release <https://github.com/sterraMind/dsh-session-status-marker/releases/tag/v1.1.2>，附 `dsh-session-status-marker-1.1.2.tgz`（56,921 B，sha256 `f5d0edec8fe24a75633d2bd65d70226bed08a0938c308d308ffe02a29313778a`）。SSH push 被沙箱拦（198.18.0.78:443），改用 `git remote set-url origin https://x-access-token:$tok@github.com/...`（`$tok = gh auth token`）后成功 |
| npm 发布 | 完成 | `npm publish` 输出 `+ dsh-session-status-marker@1.1.2`、EXIT=0、publish 日志 `PUT 202`（非 201）。走 staged publishing：发布后约 1 分钟 `npm view version` 仍是 `0.0.0-stage`、`@1.1.2` tarball HEAD 404、`/-/stage` 为空；第 11 分钟重读时 `versions` 含 `1.1.2`、`latest` 变 `1.1.2`、tarball HEAD 200、`dist.integrity` `sha512-3ws7itHa9zP5M...`（与 dry-run shasum `a6cb9c1848edeb3c8a96d2df72214b10212fc574` 一致）。上线：<https://www.npmjs.com/package/dsh-session-status-marker/v/1.1.2>。详见 `docs/project-memory.md` §6 教训 28 |

> 发布是否上线不能只看 `npm publish` 的输出：它只代表请求被接受。判据是三个独立视图重读——两个 packument 视图（`/dsh-session-status-marker` 与 `/-/package/.../dist-tags`）、版本端点、tarball HEAD；registry 读副本约 4.5 分钟、staged→publish 约 14 分钟延迟（借鉴 dsh-triage `docs/HANDOFF.md`）。

### 3.14 1.1.3 README 重写与 npm 包边界（2026-11-18）

用户反馈：「为什么项目介绍里面放什么架构红线什么看不懂的内容，还有什么完整证据与取舍，明禁是啥意思？缩写？docs 可以不用放到 npm 仓库里面」。

| 验收点 | 证据 |
|---|---|
| README 面向使用者 | 新结构：一句话说明 → 两张界面截图 → 怎么用（手动标记 / 跨会话总览 / AI 自动标记）→ 八种状态表（状态 / 图标 / 用在哪）→ 安装 → 配置 → 主题与语言 → 已知限制 → 开发 → 许可 |
| 内部术语已移除 | `README.md` 全文检索 `红线|明禁|out-of-tree|sidecar|slot|route|bundle|契约|schema|token|tarball|Phase|证据与取舍|零上下文` 仅命中「打包成 .tgz 压缩包」一行（改写后无残留） |
| 文档链接可点 | README 中 6 个链接全部为 `https://github.com/sterraMind/...` 或 `https://raw.githubusercontent.com/...` 绝对地址，相对链接数 0（npm 页面不会指向不存在的 `npmjs.com/package/.../docs/...`） |
| 截图入仓库、不入包 | 新增 `docs/images/hover-light.png`（53,023 B）、`docs/images/hover-dark.png`（51,214 B）；`package.json` 的 `files` 仍为 `lib/`、`locale/`、`cordis.patch.yml`、`icon.svg`，打包后 `tar -tzf` 中无 `docs/` |
| 构建与测试 | `pnpm run typecheck` EXIT=0、`pnpm run build` EXIT=0、`node --test --test-isolation=none tests/*.test.mjs` → 73 tests / 17 suites / pass 73 / fail 0 |
| 包内容 | `dsh-session-status-marker-1.1.3.tgz` 55,284 B；包内 `README.md` 为 101 行新版（含「怎么用 / 八种状态 / 已知限制」标题），无 `docs/` |

## 4. Phase 2 – Smoke & icon round-trip（已完成）

### 新增文件
- `src/client/icons.ts` — 八条手写 inline SVG，对应 DSH 官方 glyph ids (`checklist-outline`, `check-circle-fill`, `stop-fill`, `warning-triangle-outline`, `browse-outline`, `agent-preset-outline`, `pause-outline`, `like-outline`)。颜色通过 CSS `currentColor` + `STATUS_META.tone` 跟随主题 token。
- `tests/smoke.test.mjs` — 端到端单 session 推理链路：fake context → `[Service.init]()` → fire `turn/end:interrupted` → 断言 `effectiveMark()` 与 registered `GET state` route 均返回同一持久化行；neutral event 不改写。
- `tests/i18n.test.mjs` — 契约一致性：每个 status 有 metadata、`tone` 指向 `--dsw-alias-state-*`、AUTO_REASON 非空、MARK_SOURCES = ['manual','auto']、DEFAULT_MAX_NOTE_LENGTH 正整数。

### 更新后的测试分布（Phase 2 时点快照）

> 当前权威用例数见 §2（111 项 / 27 套件）。下表是 Phase 2 收尾时的快照，后续版本新增的 `tests/copy-guard.test.mjs`（9）与 `tests/touch-icon.test.mjs`（6）未列入。
| 文件 | 用例数 | 覆盖点 |
|---|---|---|
| `tests/inference.test.mjs` | 17 | `inferStatus` 全部规则分支 + `shouldApplyInference` 三态 + `isAutoMarkExpired` 三态 |
| `tests/types.test.mjs` | 9 | `MarkRecordSchema.strict`、超长 note 拒绝、默认值填充、`STATUS_META` 全覆盖、route 派生一致性 |
| `tests/service.test.mjs` | 20 | `getMark`/`clearMark`/`listAll`/`putMark`；state route 400 与命中；mutate set→clear 往返；unsupported-action；两个 tool 注册与 execute；note 超长抛错；`turn/end interrupted` auto inference + manual mark not overwritten；`?since` 条件刷新 + revision 稳定；`rowActionOrder`/`menuItemOrder` 页面全局注入 |
| `tests/smoke.test.mjs` | 1 | 完整 inference round-trip + GET state route read-back + neutral-event no-op |
| `tests/i18n.test.mjs` | 11 | STATUS_META/tone/schema/defaults 跨模块一致性 + 图标尺寸契约 + Shell 8 语言字典键集合与占位符 |
| `tests/theme.test.mjs` | 11 | 零字面颜色、图标盒尺寸、active 格不覆盖 color、badge 盒尺寸、`[class*='card']:has([data-status-slot])` 整卡覆盖宿主（含 `--dsw-alias-hovercard-bg` 双变量）、状态 hover 色用主题别名、`.root::before` 桥接命中区、格子 22px border-box + 2px 内边距 + 2px 间距、总览页主题别名 |
| `tests/marks.test.mjs` | 9 | 共享读取器：快照分发、本地写透、消失的会话分发 `null`、采纳 Host 下发的读取间隔、读取失败保留上一次结果、`?since` + unchanged 跳过 publish、晚加入会话全量读取、可见性恢复强制全量读取 |
| `tests/overview.test.mjs` | 5 | overview route：分组排序、仅非空组、标题关联、`sessionTitle` 缺失/抛错回退 null、空态 |
| `tests/action.test.mjs` | 12 | 行操作/菜单项 slot 注册（order 300、官方 archive/pin 之后）、行按钮接共享选择器、菜单项 `role=menuitem`、共享选择器 8×22px 单行 + 主题令牌、bundle 表 + 8 语言字典键、order 默认值与页面全局回退、profile 配置暴露 |
| **合计** | **95** | suites 23 / pass 95 / fail 0 |

## 5. 升级回归清单

- `defineDomain` 版本升 `version+1`，写入 `compatibleVersions:[旧版本]`；`invalidRecords:'backup-and-skip'` 已在 spec 设好，可丢弃历史脏数据
- 新字段加进 `MarkRecordSchema` 时需同时加进 `contracts.ts` 与 `src/client/*` 消费面
- 路由 path 一旦对外发布就冻结；如需改动须在 `_ROUTE` 常量里同步更新，并保留 `/api/session-status-marker.*` 作为 legacy fallback
- `STATUS_VALUES` / `AUTO_REASON_VALUES` 追加新值时必须同时更新 `STATUS_META.icon/tone/labelKey`、locale 字典、hover card 的状态网格渲染
### 3.15 1.1.4 预览图裁切与正文润色（2026-11-18）

用户反馈：「为啥图片里的对话框被顶到最上面了 这能当预览图吗。另外你的README要用说人话skill润色一下」。

| 验收点 | 证据 |
|---|---|
| 预览图构图 | 原图为 1576×861 整窗截图，悬停卡只占左上角。改用 Pillow 从 `.drafts/shots/v112-{light,dark}-picker.png` 裁 `box=(0,205,600,470)`（侧栏三行会话 + 整张悬停卡），LANCZOS 放大两倍 → 1200×530，覆盖 `docs/images/hover-{light,dark}.png`（139,256 B / 153,016 B）；`raw.githubusercontent.com` HEAD 返回 200 |
| 顿号并列密度 | 按 `lieflat-less-ai-tone` 的 `detect.py`：改前 7.617 处/千字（7 处），改后 2.157 处/千字（2 处），人类参考约 1.78 |
| 具体改写 | 开头「待办、已完成、被中断，还是卡住了」→「待办、已完成，还是被中断或者卡住了」；「任务被中断、子代理还没跑完、需要你回答时」→「任务被中断、子代理还没跑完，或者需要你回答的时候」；「侧栏徽标、状态总览、悬停卡片都使用同一套主题颜色」→「侧栏徽标、状态总览和悬停卡片用的是同一套主题颜色」；语言清单拆成两段短句；限制条目「日文、西班牙文、法文、德文、俄文和葡萄牙文」→「除简体中文和英文之外的六种语言」；「DSH 宿主侧的数据文件」→「DeepSeek Harness 自己的数据目录」 |
| 未改项（按规则保留） | X 级「空转句引列表」5 处（`README.md:30` `:36` `:42` `:52` `:92`）实测不是 AI 特征；F 级破折号/分号/引号均 0，不因指纹增删；C 级小标题密度 9.709/千字偏高属 README 导航结构所需，不改结构 |
| 语义层判读 | 20 条候选（rename 7 / cohesion 7 / colon 6 / iso3 0）按 `references/semantic-criteria.md` 封闭判据逐条标注，结果存 `.drafts/readme-candidates-labeled.json`：rename 0组 6 / 1组 1，cohesion 明确承接 5 / 主题跳转 2（最长连环 3），colon 定义或解释 5 / 版式用途 1，均未达改写门槛 |
| 前后对比报告 | `.drafts/去AI味报告.md`（改前 919 字 / 改后 927 字） |
| 构建与测试 | `pnpm run typecheck` EXIT=0、`pnpm run build` EXIT=0、73 tests / 17 suites / pass 73 / fail 0 |
| 发布 | tag `v1.1.4`，Release 附 `dsh-session-status-marker-1.1.4.tgz`（55,335 B）；npm `latest` 17:43:27 变 `1.1.4`，tarball 200；registry 顶层 `readme` 3,002 字符已确认含新措辞、旧措辞消失 |

### 3.16 1.1.5 与 1.1.6 依赖与版本声明（2026-11-18 ~ 11-19）

1.1.5 与 1.1.6 均为发布声明修正，无运行时行为改动，客户端 bundle 与 1.1.4 字节一致。

| 项 | 1.1.5 | 1.1.6 |
|---|---|---|
| 变更 | 恢复 `engines.dsh` 下限到 `>=0.2.2-rc.1`（1.1.2 曾放宽到 `>=0.2.0-rc.2`，但侧栏行尾徽标依赖 0.2.2-rc.1 才引入的 `sidebar.session.row.trailing` 槽位，0.2.0-rc.2 无此槽位导致徽标不显示）；README 补侧栏图标预览图 `docs/images/sidebar-badge.png` | 依赖声明归位：`peerDependencies` 从写死 `0.2.2-rc.1` 改为 `>=0.2.2-rc.1 <0.3.0` 区间；`zod`、`@deepseek-ai/schemastery` 按官方 publish 范式从 `devDependencies` 移入 `dependencies`（zod 4.4.3 固定、schemastery ~3.19.0）；`devDependencies` 从 30 项瘦身到 14 项（删 14 个未用包） |
| typecheck / build | EXIT=0 / EXIT=0 | EXIT=0 / EXIT=0 |
| 测试 | 73 tests / 17 suites / pass 73 / fail 0 | 73 tests / 17 suites / pass 73 / fail 0 |
| tgz | 55,313 B | 55,310 B |
| 发布 | tag `v1.1.5`、GitHub Release、npm `latest` 1.1.5 | tag `v1.1.6`、GitHub Release、npm `latest` 1.1.6 |

### 3.17 1.2.0 快捷操作、悬停卡 8 格直出与条件刷新（2026-11-19）

1.2.0 为功能版本：代码与单元测试已全部完成，dev4090 真实 GUI 复核已完成（2026-11-19，DSH 0.2.2-rc.5，npm 源安装，全部 PASS）。

| 验收点 | 状态 |
|---|---|
| 已标记会话的悬停卡直接展示 8 格状态格（无需先点「修改状态」），当前状态高亮，清除按钮保留 | **PASS**：cellCount=8、cellRows=[443] 单行、cellWidths 22px、active 格 aria-pressed=true；点非 active 格写入成功且 copiedLabelShown=false、titleStillThere=true；点 active 格状态保持 |
| 未标记会话同样直接展示 8 格 | **PASS**：未标记行 hover 卡 cellCount=8 单行 |
| 新增 `sidebar.workspaces.session.row.action` 行操作（id `session-status-row-action`，默认 order 300），行内按钮打开共享状态选择器 | **PASS**：按钮 x 顺序 Session actions(131)→Archive(160)→Pin(189)→Set session status(222)，order=300 生效；点击展开 8 格（labels=TODO/Done/Stopped/Blocked/Review/Subagent running/Awaiting answer/Feedback），选 TODO 后行徽标变 todo、选择器关闭 |
| 新增 `sidebar.workspaces.session.menu.item` 菜单入口（id `session-status-menu-item`，order 300），打开状态子菜单、选中后关闭菜单 | **PASS**：菜单含 Set status（data-slot=menu.item、role=menuitem）；展开 8 格（菜单项 14=官方 6+插件 8）；选 Done 后菜单全部关闭、revision 更新 |
| `rowActionOrder` / `menuItemOrder` 配置（默认 300）：Host 经 `webserver/index-inject` 注入页面全局 `__DSH_SESSION_MARKER_CONFIG__`，Client 读取失败回退默认值 | **PASS**：`globalThis.__DSH_SESSION_MARKER_CONFIG__` = `{"rowActionOrder":300,"menuItemOrder":300}`（键名逐字核对）；远程 cordis.patch.yml 无 BOM（首三字节 45,32,105） |
| `GET /api/session-status-marker.list?since=<revision>` 条件刷新：revision 命中返回 `unchanged:true` + 空 marks，Client 跳过重绘；可见性恢复与首次订阅无缓存时强制全量读取 | **PASS**：`?since=<revision>` 多轮返回 unchanged:true；mutate 后 revision 变化、全量 5 条；页面另一会话被 mutate 后徽标 323ms 更新、canary 12345 不变（无整页重载）。注：无头 Edge 新开标签页抢占前台时原页面按可见性感知暂停轮询，关闭新标签页并 bringToFront 后立即恢复，属设计行为 |
| `awaiting-answer` 状态色改用 `--dsw-alias-label-secondary`（明暗主题对比度） | **PASS**：light rgb(97,102,107) == 卡片次要文字色；dark rgb(207,211,214) == 次要文字色；不再使用 idle 蓝（对照 todo active rgb(65,118,230)） |
| `set_session_status` 工具描述重写（WHEN TO USE / WHEN NOT TO USE / DO NOT USE FOR / USAGE / EXAMPLES，明确手动标记不被推断覆盖） | 代码完成，工具契约测试全绿（描述内容经系统提示词下发，无法在页面直接断言） |
| 整卡主题接管同时覆盖 `--dsw-alias-hovercard-bg` 与 `--dsw-hovercard-bg`（兼容较新 DSH 构建的卡底变量） | **PASS**：light cardBg=rgb(255,255,255)/标题 rgb(15,17,21)；dark cardBg=rgb(44,44,46)/标题 rgb(249,250,251)；截图 `.drafts/shots/v120-rc5-{light,dark}-picker.png` 已目检 |
| `engines.dsh` 收紧为 `>=0.2.2 <0.3.0` | **PASS**：dev4090 DSH 0.2.2-rc.5，npm 源直接安装成功（INSTALLED_VERSION=1.2.0，无需 allow-version） |
| 测试 | 95 tests / 23 suites / pass 95 / fail 0（脚本形式 `pnpm run test`）；目录形式 `node --test tests/` 报告 99/23（4 个 `.test.ts` 薄壳各计 1 条，同一批断言） |
| 打包 | `pnpm pack` → `dsh-session-status-marker-1.2.0.tgz`（70,350 B）；`lib/client.js` 72,264 B |
| 发布 | 已完成（2026-11-19）：提交 `27e06d1` + `24e70be`、标签 `v1.2.0`（24e70be）已推送；GitHub Release v1.2.0 附 tgz（70,350 B，直连下载 200）；npm publish shasum `b7fb2b8bc331f3d79cf0d466d70e6a9550096f3a`，`dist-tags.latest=1.2.0` 生效（tarball 端点复制稍滞后） |
| 发布状态文档 | 提交 `a455915`（docs: 记录 1.2.0 发布状态）已推送 |

### 3.18 1.2.1 rc.3 桌面端故障调查与复现（2026-11-19）

用户在 DSH 0.2.2-rc.3 桌面版报告 1.2.1「图标全无、点击出现已复制」。调查结论：**插件代码无缺陷，根因在用户桌面的安装状态（孤儿安装）**。两路独立取证互相印证：

| 取证路径 | 结果 |
|---|---|
| 主会话 dev4090 复现（DSH 0.2.2-rc.3，CLI 安装 1.2.1） | **全部通过**：boot entry 正常（`plugins/??dsh-session-status-marker/client.js&rev=276d8c7c85f5`，71,225 B）；侧栏徽标 `done`+`awaiting-answer` 各 1 个 16×16 SVG 可见；悬停卡 8 格单行 22×22（x=296..464 y=443）、cardBg `rgb(255,255,255)`（浅色白卡，1.1.2 主题接管生效）；点面板文本区 `copiedShown:false`（复制误触未回归）；点第 7 格状态写入成功、徽标轮询更新；route state 200。截图 `.drafts/shots/rc3-hover.png`、`rc3-after-click.png` 已目检 |
| rc3-repro 子代理独立复现 + 静态分析 | **同一结论**：`webserver/index-inject` 在 rc.3 存在且正常（`dsh-host-webserver/lib/index.js:646-650` collectIndexInjections emit table+peer；`__DSH_SESSION_MARKER_CONFIG__` 成功注入）；运行时四条 route 全 200、行操作按钮 4 个、hover 卡 8 格浅色白卡、console 0 报错；1.2.0 在 rc.3 fresh-home 安装被拒（原文「installation rejected: … requirements {"engines.dsh":">=0.2.2 <0.3.0"}」），1.2.1 通过无需豁免 |
| 用户桌面取证（desktop profile + operations.jsonl） | bundles（17 项）与 dependencies（13 项）均无插件、cordis.patch.yml 0 命中、node_modules 物理残留 1.2.1（孤儿）；`operations.jsonl` 时间线：1.2.0 两次 `failed incompatible-version`（engines 拒装）→ 1.2.1 `enable applied` 但激活层未落盘 → 用户 10:22:39 remove applied → 10:22:54 install cancelled，最终状态未安装 |
| rc.3 CLI 坑（主会话实测） | `dsh plugin add` 在「Already up to date」分支（依赖已存在）**不写 bundles**——add 后 bundles 只剩官方两件套、`__DSH_BOOT__` 75 个 entry 无插件、client.js fetch 404；`plugin remove` 后重新 add（全新安装分支）bundles 恢复三件套。1.1.6 全新安装同样写 bundles → 坑与插件版本无关 |
| 处置 | npm `unpublish` E403（granular token 不可撤版）→ `npm deprecate` 1.2.0/1.2.1（文案说明根因与恢复路径）；`npm dist-tag add dsh-session-status-marker@1.1.6 latest` 回指；GitHub Release v1.2.0/v1.2.1 PATCH 补故障说明 + prerelease=true |
| 给用户的恢复路径 | 桌面端插件管理先卸载残留再重装，安装确认弹窗点「立即启用」（rc.3 市场装完默认 `enabled:false`）；或 CLI `dsh plugin remove` 后 `plugin add` 全新安装。重装后标记数据仍在（`$DSH_HOME/storages/session_status_marker/marks/` 不随卸载删除） |

### 3.19 1.2.2 行内图标入口、浮窗面板与触屏备注（2026-11-20）

用户在 1.2.1 上反馈四点：行内入口是文字按钮而非图标、点开是行内展开一排按钮而非浮窗、面板看不到备注、点击仍触发整卡复制。1.2.2 逐项修复并在 dev4090（DSH 0.2.2-rc.3）真实页面复核：

| 验收项 | 结果 |
|---|---|
| 触发按钮规格 | 24×24、svg 16×16、`textContent` 空（无「状态」文字）、`aria-label="Set session status"`、border 0px、radius 4px、颜色 `rgb(15,17,21)` —— 对齐官方 iconButton |
| 浮窗几何 | 214×91、`[class*=popover]`、8 格 `cellRows:[360]` 单行、白底 `rgb(255,255,255)`、radius 16px、阴影开启 |
| 摘要与备注 | `hasSummary:true`（「Manual: Awaiting answer」「Manual: Done/Blocked」随标记变化）；写入带备注的标记后 `noteText:"Note: 需要等待上游接口确认后再继续"` 真实渲染；`hasClear:true` |
| 复制误触 | 点面板文本区 (154,346) `copiedShown:false, panelStillOpen:true`；点状态格 `panelClosed:true, copiedShown:false`，徽标从 `done` 变 `blocked` 后轮询更新 |
| 触屏模拟 | `Emulation.setEmulatedMedia(hover:none, pointer:coarse)` 下面板 `panelOpen:true`（悬停卡忽略 touch 指针，此面板为触屏唯一入口） |
| 主题跟随 | 深色主题浮窗 `bg rgb(44,44,46)`、文字 `rgb(249,250,251)`、首格 `rgb(122,170,255)`、`bodyBg rgb(21,21,23)`；浅色对照全相反 —— 全 `--dsw-alias-*` |
| 「已复制」桌面个案根因 | `git show v1.2.1:src/client/HoverCard.tsx` 的 guard 代码与 1.2.2 完全一致（`stopPropagation` 两事件 + spread 到根 div）——1.2.1 代码无缺陷，桌面复发是激活层未更新（旧 client.js 残留），重装后消失 |
| 截图 | `.drafts/shots/v122b-panel-light.png`、`v122b-panel-note.png`（含备注行）、`v122b-panel-dark.png`，均已目检 |

发布：102 项测试全绿（新增 `tests/touch-icon.test.mjs` 6 例），tgz 74,526 B；提交 `6719b57`（fix）+ `b86dbb6`（test）+ tag `v1.2.2`；GitHub Release 附 tgz；npm publish `+ dsh-session-status-marker@1.2.2`（57 files，integrity `sha512-2m2Nbk8xCLCR6...`）。

### 3.20 1.2.3-rc.1 悬停卡防复制、单一浮层与市场元数据 8 语言（2026-11-20）

用户在 1.2.2 上反馈三点：悬停卡与行内浮窗并存（应只留一个）、悬停卡空白点击仍出现「已复制」、插件市场元数据只有英文。1.2.3-rc.1（预版本，按发布政策等待用户实际验收）逐项修复并在 dev4090（DSH 0.2.2-rc.3）真实页面复核：

| 验收项 | 结果 |
|---|---|
| 悬停卡空白点击防复制 | 标题行 (310,314) 点击后 `copied:false, cardOpen:true`；卡底部空白点击同样 `copied:false`；深色主题复测一致。守卫原理：`document` capture 监听 `click`/`keydown`，只拦「含 `[data-status-slot]` 的卡」上槽位外非交互元素，`stopPropagation` 阻断 React 根容器的合成事件分发 |
| 文本选择保留 | 在卡标题拖选得到「标记会话为完成」，`copied:false` 且选区保留（守卫不调用 `preventDefault`） |
| 单一浮层 | 悬停卡打开时点行内图标：popover=1（不开第二个浮层）；悬停卡关闭后行内面板恢复 214×110、8 格、摘要/备注/清除齐全 |
| 深色主题悬停卡 | 整卡 `rgb(44,44,46)`、标题 `rgb(249,250,251)`、8 格、空白点击不复制 —— 1.1.2 的整卡主题接管继续生效 |
| 市场元数据 8 语言 | `locale/{de,en,es,fr,ja,pt,ru,zh}.json` 全部随包发布（tarball 67 项），`meta.title` 各语言齐全（「会话状态标记」「セッション状態マーカー」「Sitzungsstatus-Marker」等） |
| 截图 | `.drafts/shots/v123-card-guard.png`（浅色卡+摘要/备注/格）、`v123-panel-light.png`（行内面板局部）、`v123-dark-card.png`（深色整卡），均已目检 |

发布：111 项测试全绿（27 套件，新增 `tests/copy-guard.test.mjs` 9 例），tgz 81,880 B；提交 `586bbb9`（fix）+ tag `v1.2.3-rc.1`；GitHub Release **prerelease** 标记附 tgz；npm `--tag rc` 发布，`latest` 保持 1.2.2。发布政策（用户 2026-11-20 指定）：正式版本需用户实际前端验收通过后发布，此前只能发预版本。npm 对预发布版本强制要求显式 `--tag`（缺省报错退出）。

### 3.21 1.2.3-rc.2 删除行内浮层，行内图标改为打开宿主悬停卡（2026-11-20）

用户在 1.2.3-rc.1 上反馈「点击图标还是有下面一排，这一排删掉，点击图标出现右侧浮层」。1.2.3-rc.2（预版本）删除行内自建面板，行内 24×24 状态图标改为打开宿主悬停卡，并在 dev4090（DSH 0.2.2-rc.3）真实页面复核：

| 验收项 | 结果 |
|---|---|
| 行内图标 | `getBoundingClientRect()` = 24×24、`textContent` 为空（纯图标，无「状态」文字），位置 (253,312) |
| 点击后只有一个浮层 | 点击后 822ms 悬停卡打开：`{open:true, popover:0, copied:false, cells:8, x:280, y:296, w:244, h:222, bg:"rgb(255,255,255)"}` —— 行内不再出现第二排图标。822ms 是宿主自己的 800ms 停留计时（点击重放 `pointerover` 会重新起计时），与鼠标悬停同一延迟 |
| 再点图标 | 卡片保持打开，`copied:false`，`popover:0`（不会把卡关掉、也不会开第二个面板） |
| 卡内空白点击 | 点标题行与卡底部空白均 `copied:false`，卡片保持打开（1.2.3-rc.1 的整卡防复制守卫继续生效） |
| 实现校验 | 远程 `lib/client.js`（85,780 B）含 `data-status-action`、`pointerover`、copyGuard，不含 `popover`；`profiles/smoke` bundles 为 `@deepseek-ai/dsh-base,@deepseek-ai/dsh-web-app,dsh-session-status-marker` |
| 截图 | `.drafts/shots/v123rc2-row.png`（1600×900，浅色白卡 + 标题 + 路径 + 8d ago + Manual: Blocked + Note 行 + 8 格 + Clear + Idle，侧栏行末只有一个状态图标），已目检 |

删掉行内面板不影响触屏可达性：宿主在 `@media (hover: none)` 下会隐藏我们的行内插槽（`Rows.module.css:340-359` 的 `.rowQuickActions > [data-slot] > :not(.pinnedAction)`，`pinnedAction` 是宿主内部哈希类），触屏入口一直是会话菜单里的「设置状态」。

同轮新增 `docs/release-process.md`、`CONTRIBUTING.md`、`docs/research/10-release-and-versioning.md`、`docs/research/11-agent-team-practices.md`，并在 `AGENTS.md` 增补「搜索关键词原子化 + 避开内容农场」与「智能体团队原子化拆解」两条 Standing Order。

市场页语言的结论（写入 CHANGELOG 已知限制）：用户看到的「插件市场」是第三方 `dshmarket@1.73.20`，其已装列表描述只读包 `package.json` 的字符串 `description`（`dshmarket/lib/routes.js:3533-3542` + `client/client.js:15196-15203`），不读 `locale/*.json`；官方「插件」页（`ui-plugin-manager`）才读包内 locale 元数据，我们的 8 语言文件在那里生效。

### 3.22 1.2.3 正式版转正（2026-11-20）

用户在 2026-11-20 于桌面端（DSH 0.2.2-rc.3）验收 `1.2.3-rc.2` 后确认「这个版本验收通过」，按发布政策（正式版本必须在用户实际前端验收通过之后发布）把 `1.2.3-rc.2` 转为正式版 `1.2.3`，代码与 `1.2.3-rc.2` 完全一致，只有版本号、`CHANGELOG` 段落与安装说明变化。

| 验收项 | 结果 |
|---|---|
| 版本号 | `package.json` version = `1.2.3`（`1.2.3-rc.2` 的内容原样转正） |
| 类型检查与构建 | `pnpm run typecheck` exit 0、`pnpm run build` exit 0（`built lib/client.js`） |
| 单元测试 | `tests 111 / suites 27 / pass 111 / fail 0` |
| 打包 | `pnpm pack` → `dsh-session-status-marker-1.2.3.tgz` 83,281 B |
| 用户验收 | 用户原话「这个版本验收通过 可以派上线了」（2026-11-20），验收对象即 `1.2.3-rc.2` 的真实桌面端行为：单一浮层、点行内图标打开右侧悬停卡、卡内空白点击不再出现「已复制」 |
| 发布 | GitHub Release v1.2.3（正式版，非 prerelease）附 tgz；npm `latest` 指向 `1.2.3`，`rc` 标签保留 `1.2.3-rc.2` |

### 3.23 1.3.0-rc.3 看板标题与未标记会话修复（2026-11-20）

rc.2 在 dev4090 真实页面上暴露两个缺陷：看板所有条目标题显示「未命名会话」、未标记会话区块计数为 0。根因是 cordis 的 context 代理只暴露 `static inject` 里声明过的服务，直接读 `this.ctx.sessionQuery` 这类未声明属性得到 `undefined` 且不抛错。修复改为经 `ctx.reflect.get(name)` 取值并收敛到 `#optionalService`。

| 验收项 | 结果 |
|---|---|
| 类型检查与构建 | `pnpm run typecheck` exit 0、`pnpm run build` exit 0（`built lib/client.js`） |
| 单元测试 | `tests 130 / suites 30 / pass 130 / fail 0` |
| 打包与部署 | `pnpm pack` → `1.3.0-rc.3.tgz` 98,666 B；dev4090 全新安装（remove → allow-version → add），远程 `lib/client.js` 103,893 B，含 `reflect.get` 与 `optionalService`，bundles 三件套正确 |
| `overview` 路由 | 页面内 `fetch('/api/session-status-marker.overview')` → 200，1684 B；`totalMarked=4`、`unmarked.count=7`、`refreshIntervalMs=2000` |
| 看板标题 | 已标记 4 条中 3 条显示真实标题（`Todo Write Tool Test`、`回复 OK 测试`、`Mark session status for review`），1 条 `smoke-session-1` 无标题投影显示「未命名会话」 |
| 未标记区块 | 7 条候选，其中 5 条真实标题（`标记会话为完成`、`写入两条待办并标记会话状态`、`回复 OK`、`Reply with the single word` ×2），2 条无标题投影 |
| 截图 | `.drafts/shots/v130d-overview.png`（1576×861，设置页「会话状态总览」：待办 2 / 审查中 2 / 未标记会话 7），已目检 |

### 3.24 1.3.0-rc.3 复验（2026-11-23）

用户要求按会话文件里的验收记录和更新方式复核前端。dev4090 smoke profile 已装 `1.3.0-rc.3`（remove → allow-version → add 全新安装路径），本机经 `ssh -L 9333:127.0.0.1:9333` 转发 Edge CDP，页面为 `http://127.0.0.1:3099/`。

| 验收项 | 结果 |
|---|---|
| `overview` 路由 | 页面内 `fetch('/api/session-status-marker.overview')` → 200，1684 B；`totalMarked=4`、`unmarked.count=7`、`refreshIntervalMs=2000`，分组 todo 2 / review 2，标题关联真实会话 |
| 侧栏行 | 5 行标题可读；标记行「回复 OK 测试」带状态图标，无标题会话回退为工作区名，无报错 |
| 悬停卡 8 格 | 打开后 `cellCount=8` 单行，`activeCell=审查中`；有「编辑备注」「清除」按钮，备注显示「验收 130rc3 备注」，来源「手动标记」 |
| 备注编辑态 | 点「编辑备注」后实时读到 `hasInput=true`、`tag=INPUT`、`value="验收 130rc3 备注"`、保存/取消按钮均在；截图见下 |
| 整卡主题 | 同一 CDP 会话内切 `prefers-color-scheme`：light 卡底 `rgb(255,255,255)`、dark 卡底 `rgb(44,44,46)`，两者不同即通过（说明：分两次 cdp.mjs 调用切主题会因仿真状态不跨连接而误判为都是白底，须单连接内切换后再读） |
| 行内图标 | 点击 `[data-status-action]` 后宿主卡打开、8 格、`popoverCount=0`、`copied=false`；无自建浮层、无误触复制 |
| 截图 | `.drafts/shots/v130rc3-acceptance-card.png`（悬停卡，1576×861）、`v130rc3-acceptance-overview.png`（看板，1576×861）、`v130rc3-acceptance-note-edit.png`（备注编辑态，1576×861），均已目检 |

**截图证据缺口与补齐**：§3.23 声称的修复后看板截图 `v130d-overview.png` 在磁盘上并不存在；磁盘上原有的 `v130-overview.png` 显示「加载失败，请重试」、`v130c-overview.png` 的已标记条目全是「未命名会话」，两者都是 rc.3 修复前的状态，不能作为通过证据。本轮从当前 rc.3 页面实时截取 `v130rc3-acceptance-overview.png`：待办 2（Todo Write Tool Test）、审查中 2（回复 OK 测试、Mark session status for review）、未标记会话 7（5 条真实标题），与页面内 API 探针一致。备注编辑态也由本轮补拍，此前磁盘上只有右键菜单截图，没有输入框展开状态。

**独立复核**：本轮派 4 个子代理分别复核悬停卡、看板、备注与深色主题截图，全部中途失败且未产出报告，改由主会话逐张 `read_image` 完成复核，报告见 `.drafts/reviews/{hover-card,overview,note-dark}-review.md`。复核结论与上面的 CDP 数据一致；子代理失败不影响验收结论，但「智能体团队独立复核」这一形式未达成。

结论：1.3.0-rc.3 七项前端复核全部通过，与 §3.23 记录一致；截图证据已补齐。