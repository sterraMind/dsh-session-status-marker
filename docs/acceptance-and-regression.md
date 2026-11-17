# Acceptance & Regression

> **文档版本**：v1.1.0 · 2026-11-18（对应插件 1.1.0）

> 记录验收标准、已通过证据、待执行集成 smoke 与回归清单。
> 对应实现进度见 `docs/implementation-plan.md` §2，风险优先级见 `docs/feasibility-and-risks.md`。

## 1. 已通过的验收

| 维度 | 命令 / 脚本 | 证据 |
|---|---|---|
| Host 类型安全 | `pnpm run typecheck` | exit 0，零输出 |
| Host bundle | `pnpm run build:host`（→ `tsc -p tsconfig.json`） | `lib/*.js` / `lib/*.d.ts` 均生成 |
| Client bundle | `node --check lib/client.js` | syntax OK；文件大小随版本变化（r8 为 24,150 B 量级，宿主实际提供的字节数含服务端附加内容） |
| 纯推理测试 | `node --test --test-isolation=none tests/inference.test.mjs` | 16 项全绿 |
| Schema 契约测试 | `tests/types.test.mjs` | 7 项全绿 |
| Service 集成测试 | `tests/service.test.mjs` | 14 项全绿 |
| i18n / 图标 / 样式契约 | `tests/i18n.test.mjs`、`tests/theme.test.mjs` | 14 项全绿 |
| `pnpm run test` | `tests 72 / suites 17 / pass 72 / fail 0` |
| pnpm pack | `pnpm pack` | `dsh-session-status-marker-1.1.0.tgz`（56,007 B），含 `cordis.patch.yml`、`locale/`、`icon.svg`、`lib/`、`package.json`、`README.md` |
| 真实装载 | `dsh plugin --profile smoke add <tgz>`（dev4090） | profile 初始化成功并安装插件，详见 §3 |
| **前端视觉与交互** | 真实 GUI 上操作（dev4090 + CDP） | sidebar 行尾标记、hover card、状态改写/清除、跨进程持久化全部实测通过，见 §3.4 与 §4 |

> 注：`pnpm run <script>` 三条裸命令在 `pnpm-workspace.yaml` 生效前提下也 EXIT=0（见 `docs/project-memory.md` §5.3）。

## 2. 测试分布

| 文件 | 用例数 | 覆盖点 |
|---|---|---|
| `tests/inference.test.mjs` | 16 | `inferStatus` 全部规则分支 + `shouldApplyInference` 三态 + `isAutoMarkExpired` 三态 |
| `tests/types.test.mjs` | 7 | `MarkRecordSchema.strict`、超长 note 拒绝、默认值填充、`STATUS_META` 全覆盖、route 派生一致性 |
| `tests/service.test.mjs` | 15 | `getMark`/`clearMark`/`listAll`/`putMark`；state route 400 与命中；mutate set→clear 往返；unsupported-action；两个 tool 注册与 execute；note 超长抛错；`turn/end interrupted` auto inference + manual mark not overwritten |
| `tests/overview.test.mjs` | 5 | overview route：分组排序、仅非空组、标题关联、`sessionTitle` 缺失/抛错回退 null、空态 |

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

## 4. Phase 2 – Smoke & icon round-trip（已完成）

### 新增文件
- `src/client/icons.ts` — 八条手写 inline SVG，对应 DSH 官方 glyph ids (`checklist-outline`, `check-circle-fill`, `stop-fill`, `warning-triangle-outline`, `browse-outline`, `agent-preset-outline`, `pause-outline`, `like-outline`)。颜色通过 CSS `currentColor` + `STATUS_META.tone` 跟随主题 token。
- `tests/smoke.test.mjs` — 端到端单 session 推理链路：fake context → `[Service.init]()` → fire `turn/end:interrupted` → 断言 `effectiveMark()` 与 registered `GET state` route 均返回同一持久化行；neutral event 不改写。
- `tests/i18n.test.mjs` — 契约一致性：每个 status 有 metadata、`tone` 指向 `--dsw-alias-state-*`、AUTO_REASON 非空、MARK_SOURCES = ['manual','auto']、DEFAULT_MAX_NOTE_LENGTH 正整数。

### 更新后的测试分布
| 文件 | 用例数 | 覆盖点 |
|---|---|---|
| `tests/inference.test.mjs` | 17 | `inferStatus` 全部规则分支 + `shouldApplyInference` 三态 + `isAutoMarkExpired` 三态 |
| `tests/types.test.mjs` | 9 | `MarkRecordSchema.strict`、超长 note 拒绝、默认值填充、`STATUS_META` 全覆盖、route 派生一致性 |
| `tests/service.test.mjs` | 14 | `getMark`/`clearMark`/`listAll`/`putMark`；state route 400 与命中；mutate set→clear 往返；unsupported-action；两个 tool 注册与 execute；note 超长抛错；`turn/end interrupted` auto inference + manual mark not overwritten |
| `tests/smoke.test.mjs` | 1 | 完整 inference round-trip + GET state route read-back + neutral-event no-op |
| `tests/i18n.test.mjs` | 11 | STATUS_META/tone/schema/defaults 跨模块一致性 + 图标尺寸契约 + Shell 8 语言字典键集合与占位符 |
| `tests/theme.test.mjs` | 10 | 样式只用 `--dsw-*` token、图标盒尺寸、active 格不覆盖 color、badge 盒尺寸、悬停卡主题别名与静态色板、每个状态的 `hoverTone`、格子底色用 `--dsw-alias-tooltip-key-bg`、`.root::before` 桥接命中区、格子 22px border-box + 2px 内边距 + 2px 间距、总览页主题别名 |
| `tests/marks.test.mjs` | 5 | 共享读取器：快照分发、本地写透、消失的会话分发 `null`、采纳 Host 下发的读取间隔、读取失败保留上一次结果 |
| `tests/overview.test.mjs` | 5 | overview route：分组排序、仅非空组、标题关联、`sessionTitle` 缺失/抛错回退 null、空态 |
| **合计** | **72** | suites 17 / pass 72 / fail 0 |

## 5. 升级回归清单

- `defineDomain` 版本升 `version+1`，写入 `compatibleVersions:[旧版本]`；`invalidRecords:'backup-and-skip'` 已在 spec 设好，可丢弃历史脏数据
- 新字段加进 `MarkRecordSchema` 时需同时加进 `contracts.ts` 与 `src/client/*` 消费面
- 路由 path 一旦对外发布就冻结；如需改动须在 `_ROUTE` 常量里同步更新，并保留 `/api/session-status-marker.*` 作为 legacy fallback
- `STATUS_VALUES` / `AUTO_REASON_VALUES` 追加新值时必须同时更新 `STATUS_META.icon/tone/labelKey`、locale 字典、hover card 的状态网格渲染
