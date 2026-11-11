# 项目记忆 · dsh-session-status-marker

> **文档版本**：v1.0.0 · 2026-11-11（对应插件 1.0.0）

> 本文件是「项目记忆」的落盘载体，供后续会话 / Agent 续接时读取。记录决策沿革、硬约束、已验证事实与教训；不放临时日志。与 `AGENTS.md`（standing orders）、`docs/architecture.md`（当前架构）、`docs/implementation-plan.md`（执行顺序）、`docs/acceptance-and-regression.md`（验收证据）分工明确。

## 1. 用户目标与范围

- 原始需求（m00002）：做一个 DSH 插件，让用户手动标记会话状态（举例：打勾=已完成、TODO=会话停止输出但还有待办、STOP=会话被中断任务异常退出未完成、SUBAGENT_TODO=子代理未完成……「这个状态不一定，你可以分析有多少种可能性」），并提供 AI 自主标记的相关工具。
- 补充前提（m00139）：网络搜索并学习 dsh 插件最佳实践和工程化规范，调研、分析评估、同类产品特色 / 痛点 / 市场空缺。
- 流程要求：摸清 DSH 逻辑与接口 → 规划架构 → 评估可行性 / 风险 / 优先级 → 开发框架 → 实现逻辑 → 测试验收 → 回归测试。
- 硬约束：避免绕过开发逻辑手动操作实现结果；不懂的代码优先网络搜索；用 pnpm / uv 减少冗余；路径跟随 `DSH_HOME` 等配置、避免硬编码与 mock 假数据；研究测试环境；图标风格化且与 DSH 统一、支持主题同步；调研 / 规划 / 选型落盘 docs，通用规范同步 `AGENTS.md`，项目记忆同步到对应文档；可做一轮 Rust 预研。
- 用户说「继续」(m00167)；审批策略改为 ask for approval (m00001)。

## 2. 决策沿革（最重要）

### V1 → V2 的转折

1. **V1 假设**：`SessionEventMap` 是 merge-extensible（`docs/subsystems/session.md:755-761`），插件可以 declaration merging 追加 log-only 事件 `status/mark` / `status/clear`，用 projection `sessionMarker` 给 Client 读，用标准 Typert `@Remote` 做读写。曾写出 `src/events.ts`（把 `ignorable: true` 塞进 data）。
2. **证伪（逐层读官方源码）**：
   - `packages/core/session/src/index.ts:806-837` — `Session.append<T>(type, data, ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent<T>] : [])` 没有 `ignorable` 参数；`:827-833` envelope 构造不含该字段。
   - `packages/core/session/src/types.ts:510-523` — `ignorable?: true` 是 **envelope 顶层字段**，「Absent means required」；塞进 data 无效。
   - `:849-865` 的 `#appendRecord()` 是唯一写 `ignorable: true` 处；`packages/core/session/README.md:70-74` 原文 "Plugins outside this repository must not call it either"。
   - `packages/session/session-persistence/src/storage-contract.ts:75-80` — 读路径对 `!KNOWN_SESSION_EVENT_TYPES.has(type) && ignorable !== true` 无条件抛 `SessionFormatUnsupportedError`。
   - `packages/core/session/src/known-event-types.ts:15-17` — out-of-repo 事件按设计不在 generated KNOWN 集合内。
   - **结论**：V1 是「写入当场成功、重启 / resume / fork 时整份日志拒读」的延迟失败，风险最高。`src/events.ts` 已删除。
3. **V2 选型**：持久态走 `ctx.storageDomain`（`docs/subsystems/storage.md:5` 定义、第一方 `cua-consent-storage/guide.md:12,18` 先例）；Host→Client 走 `ctx.connection.fetch` exact route（`packages/client/connection/src/rpc.ts:146-166`、`ui-deliverables/src/present-open.ts:20-54` 先例）；Client 走 `ctx.slots.inject`。
4. **放弃标准 Typert Remote**：`docs/subsystems/api-gateway.md:110-123` 需主仓库 `scripts/generate-typert.ts` 产出 5 个文件且 Client 侧 build fail-closed，独立 bundle 无法复现。
5. **不引入 Rust**：每会话一条记录的 O(1) 纯函数，napi-rs 成本远高于收益（`docs/research/05-rust-feasibility.md`）。

### 本机工具链决策

- **弃用 esbuild**：Windows 沙箱禁止 named-pipe spawn，`@esbuild/win32-x64` 与 Vitest/Vite 配置加载都报 `spawn EPERM`；`@esbuild/wasm` 在 registry 404。改用 TypeScript compiler API 进程内 `transpileModule` 生成 Browser CJS bundle（`scripts/build-client.mjs`），测试改 `node --test --test-isolation=none`。
- **依赖布局**：pnpm isolated linker 下 Node ESM 从顶层 `node_modules` 解析传递依赖，反复 `pnpm add` 提升不可行（`@deepseek-ai/dsh-credential` 404 且把链接改名 `.ignored_*`）。最终 `pnpm install --force --node-linker=hoisted`。`zod` 顶层 pin `4.4.3` 与 `dsh-storage-domain` 内嵌版本对齐，保证 `ZodType<V>` 同源。
- **pnpm 预检**：pnpm 11.22.0 不读 `.npmrc` 的项目级 `store-dir` / `verifyDepsBeforeRun`，`pnpm run` 会 spawn `pnpm install` 去读 Scoop 全局 store 损坏的 `index.db`（3,364,789,705 B）。`pnpm-workspace.yaml` 的 `storeDir: ./.pnpm-store` + `verifyDepsBeforeRun: false` 生效后，裸 `pnpm run typecheck/build/test` 全部 EXIT=0。

## 3. 已验证的技术事实（写新代码前先核对）

- 8 状态来自 `src/contracts.ts` `STATUS_VALUES`；`STATUS_META` 给每个状态的 icon / tone / labelKey。
- `src/types.ts` 用 `z.object({...}).strict()`，并有 `_MarkRecordMatches` / `_SetMarkMatches` / `_ClearMarkMatches` 编译期双向 extends 校验 zod 推导 === 共享契约。
- `MarkerDomainSpec = defineDomain({name:'session_status_marker', version:1, layout:'per-record', invalidRecords:'backup-and-skip', tables:{marks: domainTable<string,MarkRecord>(MarkRecordSchema)}})`；`domainTable<K,V>(schema)` **只接一个参数**；`UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/`（`packages/storage/storage/src/backend.ts:10`）。
- `SessionStatusService extends Service`：`static inject=['storageDomain','tools','connection']`、`static Config=Config`、`protected async [Service.init]()` 里 open domain + 注册 2 tools + 3 routes + 可选观察器。Config 用 `z.natural().required()`（schemastery，不是 zod 的 `.int()`）。
- `ctx.on('session/event', (session, event) => ..., {global:true})`；session id 取 `session.id`，不是 `event.data.sessionId`；`turn/end` 的 `data.reason` 是对象 `{kind}`，不是字符串。
- `ctx.connection.fetch.register(route)` 返回 `() => Promise<void>` disposer；`path` 必须 `/api` 开头，重复注册响亮抛错（`rpc-host.ts:246`）。
- Client：`ctx.slots.inject('sidebar.session.row.trailing'|'hover', () => ctx.slots.register(...))`；`ctx.slots` 的声明合并来自 `@deepseek-ai/dsh-client-ui-renderer/client`，不是 slots 包自身；`ClientContext` 只能从 `@deepseek-ai/cordis` 别名导入；三个 slot 的 owner props 都只有 `{sessionId}`；`leading` 只在 idle row 挂载且被 schedule mark 占用。
- Browser bundle 格式：`window.__ModuleLoader__.load({ id, factory: (require) => { ... return module.exports; } })`（`packages/client/tsdown.client.ts:932-938`）；裸 `require()` 只能取 `packages/client/web/src/platform.ts:8-15` 的 `PLATFORM_MODULES` 白名单。
- `domain/changed` 是进程内 `emit`，跨进程 push 是已知限制（`storage.md:170`）。
- 官方配置加载顺序：profile bundles → profile patch → home patch → `--patch`（`publish.md:79-136`）；逐行整段替换 config 而非深合并；升级后须 `--dump-config` 核 `application: applied`。`plugin_manager` 每个动作需 danger-full-access 或逐次审批（`docs/tool-catalog.md:58-122`）。

## 4. 验收证据

- `pnpm run typecheck` → EXIT=0，无输出。
- `pnpm run build` → EXIT=0，`[session-status-marker:client] built lib/client.js`；`node --check lib/client.js` EXIT=0。
- `pnpm run test` → EXIT=0，`tests 58 / suites 15 / pass 58 / fail 0 / duration_ms ~246`。
- 测试分布：inference 16 例（10 规则 + 3 优先序 + 3 过期）、types 7 例、service 14 例、smoke 1 例（`turn/end:interrupted` → `effectiveMark` 与 GET state route 同一行）、i18n 6 例（STATUS_META/tone/schema/defaults + 图标尺寸契约）、theme 4 例（样式只用 `--dsw-*` token、图标盒尺寸、active 格不覆盖 color）。
- `pnpm pack` → `dsh-session-status-marker-1.0.0.tgz`（39,387 B；r8 的 0.1.0 为 32,600 B）。
- dev4090 真实集成（2026-11-11）：`dsh plugin add` 装载成功、`--dump-config` 第 1244–1249 行显示行与 config、web 宿主起 3099、三条 route 的 401/400/200 与跨进程冷读、落盘 `storages/session_status_marker/marks/<sid>.json`、boot graph 含本插件 entry、`/plugins/??…&rev=…` 200。全部细节见 `docs/acceptance-and-regression.md` §3。
- dev4090 前端视觉验收（2026-11-11，真实 GUI + CDP 驱动）：侧栏行尾标记渲染 16×16 SVG 且颜色取 `--dsw-alias-state-*-primary`；未标记会话经 hover card 的 8 格可手动标记；已标记会话可改写状态、可清除；**连续三次杀掉 3099 进程重启后标记仍在**；模型通过 `set_session_status` 工具自主标记（新增 `{status:"done",source:"manual",note:"ai-self-mark"}`）。截图见 `.drafts/shots/`。
- fake Cordis ctx 必须有 `reflect: { provide: () => {} }`（`cordis/lib/index.js:1854` 的 `Service` 构造器会调它）与可调用的 `inject(deps, callback)`（路由注册改用 `ctx.inject(['connection'], …)` 之后）；`defineTool.execute` 会先校验参数，`subjectId: null` 被拒，测试须省略该字段。

## 5. 环境事实

- 工作区 `<user-home>\Projects\dsh-session-marker`；`$DSH_HOME = <user-home>\AppData\Local\scoop\persist\deepsek-harness-pre`（拼写 `deepsek`）。
- 打包版源码在 `app.asar` 单文件内（213,202,918 B），需自写 Node 脚本按 header pickle 抽取；不要把 asar 路径当目录。官方仓库 zip 已裁剪成 `.research/dsh-repo/`（docs 全量 + 15 个 packages 域）。
- `git clone` / `curl.exe` 走代理报 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e)`；Node 内置 fetch + `NODE_USE_ENV_PROXY=1` 成功；`api.github.com` 被 SSRF 拦到 198.18.0.185；`web_fetch` 对 raw.githubusercontent / dsh.so 也 SSRF blocked，需 `mcp__magpie__exa__web_fetch_exa`。
- 现有 Web GUI = `http://127.0.0.1:55101`；scratch `pnpm dsh web --patch` 是 3080，二者不同，不要替换现有服务。
- `$DSH_HOME/cordis.patch.yml` 是 home 级 patch，作用于**每个** profile，且非 insert patch 会整段替换目标行 config。
- **测试机 dev4090**（`ssh dev4090`，Windows / PowerShell，`测试主机地址`，密钥 `本机 SSH 密钥（走 SSH 配置，不在文档中记录）`）：scoop `versions/deepseek-harness-pre` 0.2.2-rc.1，**无 `dsh` shim**；CLI 需用 `DeepSeek Harness.exe` 以 `ELECTRON_RUN_AS_NODE=1 --expose-internals` 跑 asar 内 `dsh-desktop-host/lib/cli.js`。测试 home 固定为 `%TEMP%\.drafts\dsh-session-marker\dsh-home`，不碰真实配置。远程 `npm view @deepseek-ai/dsh` 可达（返回 0.2.2-rc.1），本机 npm `_cacache` 报 EPERM，查 registry 走远程。
- **远程 GUI 自动化链路**：dev4090 上 Edge 常驻 `--remote-debugging-port=9333`，本机 `ssh -L 9333:127.0.0.1:9333 dev4090` 转发；本机 `.drafts/cdp.mjs` 提供 `targets|eval|evalfile|shot|mouse|nav|text|key|desktop` 子命令，`shot` 支持 `--clip=x,y,w,h,scale` 放大取证。JS 探针放 `.drafts/js/`。
- **远程模型接入**：本机 magpie 在 `127.0.0.1:3425`；dev4090 侧用反向隧道 `ssh -N -R 13425:127.0.0.1:3425 dev4090` 映射到远程 loopback。smoke profile 的 `cordis.patch.yml` 里加 `llm-pi-ai`（`baseURL: http://127.0.0.1:13425/v1`、`apiKeyEnv: MAGPIE_API_KEY`、`api: openai-completions`、`compat.supportsDeveloperRole=false`、模型 `group/free`）与 `agent-default-model` 即可让远程会话跑起来。远程还须绕开系统代理（`127.0.0.1:7897` 会 502）。
- **部署回路**（改一次客户端要走的全过程）：`pnpm run typecheck` → `pnpm pack` → 复制成 `.drafts/dsh-session-status-marker-1.0.0-rN.tgz` → `scp` 到远程 → `kill-port.ps1 -Port 3099` 停服务 → `dsh plugin --profile smoke add <tgz>` → 用**本地后台作业**跑 `ssh dev4090 "cmd /c start-web2.cmd"` 起服务（普通 ssh 前台命令会随会话退出而杀死服务）→ 刷新页面 → 读几何/截图复核。

## 6. 教训（避免重犯）

1. **不要凭 `docs/subsystems/session.md` 的 merge-extensible 描述推断 out-of-tree 可写**：必须读 `Session.append` 实现与 `storage-contract.ts` 的读路径校验。in-repo 与 out-of-tree 是两回事。
2. **不要在 `data` 里塞 `ignorable`**：它是 envelope 顶层字段，`assertSessionEventEnvelope` 只允许 7 个顶层 key。
3. **子代理 / teammate 在本会话曾集体失败**：6 个 teammate 报 "Background subagent <uuid> failed before it finished"，4 个 subagent 中只有 1 个成功写回。Lead 应自己核对产出是否存在，不要假设委派成功。
4. **外部网页不能断言官方行为**：PerryLink 指南称 `engines.dsh` 不校验，与官方 `docs/tool-catalog.md:58-122` 冲突，以官方为准。
5. **npm / pnpm 默认路径在本机都不可靠**：npm `_cacache` EPERM、pnpm 全局 store SQLite 损坏；统一工作区 store + hoisted linker。
6. **不要手动改 profile 文件绕过验证**：用 `plugin_manager` / `dsh plugin add` / `--dump-config`，否则「看起来装好了」但 override 可能静默失效。
7. **`docs/architecture.zh.md:168` 的「扩展 SessionEventMap」建议只对 in-repo 包成立**，不能照搬到独立 bundle。
8. **远程 PowerShell 命令约定**：分隔用 `;` 不用 `&`（`&` 是后台作业符，会把命令变成 BackgroundJob）；内联 `$node -e '<script>'` 常被引号规则吞掉，一律「写 .ps1 文件 → scp → `powershell -NoProfile -ExecutionPolicy Bypass -File`」；`$_` 在内联字符串里会被提前展开，改用 `ForEach-Object { }` 体内的 `$_` 或 `[Environment]::GetEnvironmentVariable`。
9. **打包版 CLI 的两个坑**：`web` 是内置 profile 名不是子命令（`dsh --profile smoke web` 报 too many arguments）；服务启动参数是 `--port`，`--web-port` 不存在。`--from-default-profile web` 会用模板**覆盖**整个 profile，之前装的 bundle 会丢，必须重装。
10. **`ctx.get('service')` 在 `[Service.init]` 阶段可能返回 undefined**：`static inject` 不含该服务时，插件会先初始化，sibling row 尚未挂载，`ctx.get()` 静默拿到 undefined，路由注册被跳过且不报错（表现为页面 404）。必须用 `ctx.inject(['connection'], (childCtx) => childCtx.effect(...))`，服务后到时自动触发、消失时自动清理。
11. **只看 DOM 字符串会漏掉布局级缺陷**：图标查表键写错时 `innerHTML` 里仍有 SVG 文本，但那一次是把 glyph id 当键、值取不到；尺寸缺陷则是 markup 完全正确、`getBoundingClientRect()` 才是 0×0。验收必须读几何（`svgRect`/`badgeRect`）或截图，不能只 grep 标记。
12. **CSS 里 `background: currentColor` 与同一规则的 `color` 会互相吃掉**：`.cell.active { background: currentColor; color: var(--dsw-alias-label-primary-foreground) }` 里 `currentColor` 解析为被覆盖后的前景色，图标与背景同色 → 看不见。选中态改用 token 背景 + `box-shadow: inset 0 0 0 1px currentColor` 描边。
13. **无头浏览器 hover 能力要显式开启**：无头 Edge 上报 `(hover: none)`，DSH 按触屏处理导致 `sidebar.session.row.hover` 永不展开；`Emulation.setEmulatedMedia` 覆盖不了，必须用 Edge 启动参数 `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`。
14. **CDP `Input.dispatchMouseEvent` 的一次按压在该页面上会被 React 收到两次 click**：对「切换开关」型按钮会开了又关，表现为点了没反应。判断这类按钮请用页面内单次 `element.click()`，或改读 `aria-expanded` 区分。这是测试工具偏差，不是产品缺陷。
15. **杀掉 web 服务必须按端口找 PID**：Electron 版进程名是 `DeepSeek Harness.exe`，`taskkill /IM node.exe` 无效；用 `Get-NetTCPConnection -LocalPort 3099 -State Listen` 拿 PID 再 `Stop-Process`。

## 7. 仍开放的事项

- Phase 2（已完成）：8 个官方风格 inline SVG 图标 + `currentColor` 跟随主题；locale 一致性断言；状态切换用 hover card 状态网格。
- Phase 4（1.0.0 已完成）：Host→Client 变更可见性用「全页共享列表定时读取 + 本地写透」（`src/client/marks.ts`，`Config.refreshIntervalMs` 默认 2000ms）实现，标记后无需刷新页面。
- 仍开放：fork 继承策略；`cordis_inspect_query` 运行时自检（Creator mode 能力）；TUI 端 UI 接入；GUI 回归 `test:gui` / `DSH_SNAPSHOT=replay test:web`。
- Phase 4（已完成）：tarball 内容、profile 装载、`--dump-config`、跨进程持久化、client bundle 组合与投递、前端视觉与交互（含 AI 自主标记）都在 dev4090 验过。**仍未执行**：`cordis_inspect_query` 运行时自检——该工具属 Creator mode 能力，测试 home 里没有对应开关；替代证据是真实页面对三条 route 的直接调用（`docs/acceptance-and-regression.md` §3.4）。
- 桌面端 / TUI 端 UI 接入：Host service 与 route 已通用（headless 与 web profile 都能装载），但 `sidebar.session.row.trailing` / `.hover` 是 Web client 的 slot，桌面端走同一套 Web UI（Electron 窗口内是同一个 web 面，可用）；**TUI 端没有 slot 体系，标记只能由 AI 工具写、按文本呈现**，需另做接入。

## 8. 引用锚点

- 需求与流程：m00002、m00139、m00167（「继续」）。
- 关键决策证据链落在 `docs/architecture.md` §3、`docs/implementation-plan.md` §3、`docs/research/01-host-api.md` 顶部 V2 修订说明。
- 官方镜像路径与行号全部以 `.research/dsh-repo/` 为准。
