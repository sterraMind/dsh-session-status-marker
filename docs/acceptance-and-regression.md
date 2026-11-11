# Acceptance & Regression

> **文档版本**：v1.0.0 · 2026-11-11（对应插件 1.0.0）

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
| i18n / 图标 / 样式契约 | `tests/i18n.test.mjs`、`tests/theme.test.mjs` | 12 项全绿 |
| **合计** | `pnpm run test` | `tests 58 / suites 15 / pass 58 / fail 0 / duration_ms ~246ms` |
| pnpm pack | `pnpm pack` | `dsh-session-status-marker-1.0.0.tgz`（39,386 B），含 `cordis.patch.yml`、`locale/en.json`、`icon.svg`、`lib/`、`package.json`、`README.md` |
| 真实装载 | `dsh plugin --profile smoke add <tgz>`（dev4090） | profile 初始化成功并安装插件，详见 §3 |
| **前端视觉与交互** | 真实 GUI 上操作（dev4090 + CDP） | sidebar 行尾标记、hover card、状态改写/清除、跨进程持久化全部实测通过，见 §3.4 与 §4 |

> 注：`pnpm run <script>` 三条裸命令在 `pnpm-workspace.yaml` 生效前提下也 EXIT=0（见 `docs/project-memory.md` §5.3）。

## 2. 测试分布

| 文件 | 用例数 | 覆盖点 |
|---|---|---|
| `tests/inference.test.mjs` | 16 | `inferStatus` 全部规则分支 + `shouldApplyInference` 三态 + `isAutoMarkExpired` 三态 |
| `tests/types.test.mjs` | 7 | `MarkRecordSchema.strict`、超长 note 拒绝、默认值填充、`STATUS_META` 全覆盖、route 派生一致性 |
| `tests/service.test.mjs` | 15 | `getMark`/`clearMark`/`listAll`/`putMark`；state route 400 与命中；mutate set→clear 往返；unsupported-action；两个 tool 注册与 execute；note 超长抛错；`turn/end interrupted` auto inference + manual mark not overwritten |

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
| 主题同步 | 同一页面读取 token 计算值 | 图标颜色来自 `--dsw-alias-state-*-primary`，未出现字面色值；样式契约测试禁止 CSS 里出现 hex/rgb |

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

## 4. Phase 2 – Smoke & icon round-trip（已完成）

### 新增文件
- `src/client/icons.ts` — 八条手写 inline SVG，对应 DSH 官方 glyph ids (`checklist-outline`, `check-circle-fill`, `stop-fill`, `warning-triangle-outline`, `browse-outline`, `agent-preset-outline`, `pause-outline`, `like-outline`)。颜色通过 CSS `currentColor` + `STATUS_META.tone` 跟随主题 token。
- `tests/smoke.test.mjs` — 端到端单 session 推理链路：fake context → `[Service.init]()` → fire `turn/end:interrupted` → 断言 `effectiveMark()` 与 registered `GET state` route 均返回同一持久化行；neutral event 不改写。
- `tests/i18n.test.mjs` — 契约一致性：每个 status 有 metadata、`tone` 指向 `--dsw-alias-state-*`、AUTO_REASON 非空、MARK_SOURCES = ['manual','auto']、DEFAULT_MAX_NOTE_LENGTH 正整数。

### 更新后的测试分布
| 文件 | 用例数 | 覆盖点 |
|---|---|---|
| `tests/inference.test.mjs` | 16 | `inferStatus` 全部规则分支 + `shouldApplyInference` 三态 + `isAutoMarkExpired` 三态 |
| `tests/types.test.mjs` | 7 | `MarkRecordSchema.strict`、超长 note 拒绝、默认值填充、`STATUS_META` 全覆盖、route 派生一致性 |
| `tests/service.test.mjs` | 15 | `getMark`/`clearMark`/`listAll`/`putMark`；state route 400 与命中；mutate set→clear 往返；unsupported-action；两个 tool 注册与 execute；note 超长抛错；`turn/end interrupted` auto inference + manual mark not overwritten |
| `tests/smoke.test.mjs` | 1 | 完整 inference round-trip + GET state route read-back + neutral-event no-op |
| `tests/i18n.test.mjs` | 6 | STATUS_META/tone/schema/defaults 跨模块一致性 + 图标尺寸契约 |
| `tests/theme.test.mjs` | 4 | 样式只用 `--dsw-*` token、图标盒尺寸、active 格不覆盖 color、badge 盒尺寸 |
| `tests/marks.test.mjs` | 5 | 共享读取器：快照分发、本地写透、消失的会话分发 `null`、采纳 Host 下发的读取间隔、读取失败保留上一次结果 |
| **合计** | **58** | suites 15 / pass 58 / fail 0 / ~256 ms |

## 5. 升级回归清单

- `defineDomain` 版本升 `version+1`，写入 `compatibleVersions:[旧版本]`；`invalidRecords:'backup-and-skip'` 已在 spec 设好，可丢弃历史脏数据
- 新字段加进 `MarkRecordSchema` 时需同时加进 `contracts.ts` 与 `src/client/*` 消费面
- 路由 path 一旦对外发布就冻结；如需改动须在 `_ROUTE` 常量里同步更新，并保留 `/api/session-status-marker.*` 作为 legacy fallback
- `STATUS_VALUES` / `AUTO_REASON_VALUES` 追加新值时必须同时更新 `STATUS_META.icon/tone/labelKey`、locale 字典、hover card 的状态网格渲染
