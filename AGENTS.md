# AGENTS · dsh-session-status-marker

## Standing Orders（所有 Agent 必读，优先级最高）

1. **网络优先**：遇到问题先搜索已有解决方案，再动手。禁词列表：硬/绕弯子/发射/配方/天花板/xx钥匙/阶梯/一句话总结/还狠/更绝的是/就是xx/把xx撑住/把xx走好/直接拉满/这波/xx账/认/接下/收下/xx的锅/纯纯的xx/名场面/问就是/属于是。
2. **事实源唯一**：官方 API / 行为 / 契约一律以 `.research/dsh-repo/` 本地镜像中的文件:行号为准。外部网页资料只用于竞品/市场/社区最佳实践，不得用于断言 DSH 官方行为。
3. **路径规范**：所有 DSH 相关路径从 `$env:DSH_HOME`、`$env:TEMP`、工作区根解析；仓库内不写死 `<user-home>\...`。临时脚本与生成产物放 `$env:TEMP/.drafts/<会话id>/`，可复用代码落盘到本仓库。
4. **包管理**：优先 pnpm；Node fetch 走代理时确保 `NODE_USE_ENV_PROXY=1`。npm 日志目录若权限不足，重定向到工作区或 temp。
5. **审批政策**：删除文件前必先请示用户说明目的、影响与风险；批量删除优先用 `send2trash`。
6. **rtk wrap**：常用命令用 `rtk <cmd>` wrap 节省 token，如 `rtk read <file>`、`rtk grep <pattern>`。
7. **每步一行 status**：在正文最前面单独写一行 `⏵ <正在做的事>`（≤20字），切换任务必须更新。

## 项目概要

- **目标**：为 DeepSeek Harness 编写「会话状态标记」插件，支持用户手动标记会话状态（8 种：todo / done / stopped / blocked / review / pending-subagent / awaiting-answer / feedback）以及 AI 自主推断，Client 侧用徽标 + 悬停卡展示。
- **约束**：必须是仓库外的独立 npm bundle，不修改 DSH 主仓库源码；遵循 DSH 工程化规范（ESM、strict TS、JSDoc、declaration merging、effect-based lifecycle）。
- **入口文档**：`docs/architecture.md`（V2 最终架构）、`docs/research/01..07.md`（调研）、`docs/feasibility-and-risks.md`、`docs/implementation-plan.md`、`docs/acceptance-and-regression.md`。
- **官方镜像位置**：`.research/dsh-repo/`（来源 `https://codeload.github.com/deepseek-ai/deepseek-harness/zip/refs/heads/master`）。

## 架构红线（最重要，勿回退）

**仓库外 bundle 不能写自定义 `SessionEventMap` 事件。** `Session.append` 没有 `ignorable` 参数（`packages/core/session/src/index.ts:806-837`），`appendPluginRecord` 被明禁（`packages/core/session/README.md:70-74`），读路径对未知 required 事件整份拒读（`packages/session/session-persistence/src/storage-contract.ts:75-80`）。V1 曾这样设计，已证伪删除（`src/events.ts` 不存在）。

最终链路：

```
src/contracts.ts   共享契约（零依赖，Browser 不能带 zod）
src/types.ts       zod 严格 schema + 编译期双向 extends 校验
src/domain.ts      defineDomain({name:'session_status_marker', version:1, tables:{marks}})
src/inference.ts   inferStatus / shouldApplyInference / isAutoMarkExpired（纯函数）
src/service.ts     SessionStatusService：Service.init + 3 exact routes + 2 tools + 观察器
src/index.ts       纯导出入口（default = Service 类）
src/client/*       apply → locale.register + slots.inject(trailing / hover)
scripts/build-client.mjs   TS compiler API 生成 lib/client.js（CJS closure factory）
tests/*.test.mjs   canonical 断言（node:test + shim），*.test.ts 为薄壳
```

- 持久态只能是 `ctx.storageDomain`（host-side sidecar，不进模型输入、不进 session log）。
- Host→Client 只能是 `ctx.connection.fetch.register(ConnectionFetchRoute)`；**不用标准 Typert Remote**（需主仓库 `generate-typert.ts` 产物）。
- Client 只能是 `ctx.slots.inject` + 组件内 `fetch()`；**不用 `useProjection` / `ctx.remote`**。
- `ctx.slots` 的声明合并来自 `@deepseek-ai/dsh-client-ui-renderer/client`；`ClientContext` 从 `@deepseek-ai/cordis` 别名导入（locale 包内部同名类型未导出）。

## 技术栈（V2 实测）

| 项 | 选型 | 依据 |
|---|---|---|
| 语言 | TypeScript ESM（`strict`, `noImplicitAny`） | `docs/user/develop/basic/index.md` |
| 框架 | `@deepseek-ai/cordis` `Service` + `[Service.init]` | `packages/session/session-projection-cache/src/index.ts:105-123` |
| 持久化 | `@deepseek-ai/dsh-storage-domain` `defineDomain` / `domainTable` | `docs/subsystems/storage.md:5,145-171` |
| 工具 | `@deepseek-ai/dsh-tools` `defineTool` | `packages/core/tools/src/schema.ts:555-557` |
| Host→Client | `@deepseek-ai/dsh-client-connection` `ctx.connection.fetch` | `packages/client/connection/src/rpc.ts:146-166` |
| Config | `@deepseek-ai/schemastery` `z.natural().required()` | `docs/user/develop/basic/config.md:9-31` |
| 记录校验 | `zod 4.4.3`（与 dsh-storage-domain 内嵌版本对齐） | `domainTable<K,V>(schema: ZodType<V>)` 需同源 |
| Client UI | React 18 + CSS Modules + `--dsw-*` tokens + `ctx.slots.inject` | `packages/client/AGENTS.md`；`platform.ts:8-15` 白名单 |
| Client 服务注册 | `ctx.inject(['connection'], (childCtx) => childCtx.effect(...))` | `packages/bundle/web-app/src/index.ts:219`；`cordis/lib/types/registry.d.ts:111,185` |
| Client 构建 | TypeScript compiler API 进程内 `transpileModule` | 绕开 Windows 沙箱 `spawn EPERM` |
| 测试 | `node --test --test-isolation=none` + 自建 Vitest 风格 shim | Vitest/Vite 配置加载同样触发 esbuild spawn |
| 前端验收 | CDP（`.drafts/cdp.mjs`）+ 真实 GUI 几何/截图断言 | 只看 DOM 字符串会漏掉 0×0 布局缺陷 |
| Rust | 不引入 | 见 `docs/research/05-rust-feasibility.md` |

## 开发回路与可靠命令

1. `pnpm run typecheck` / `pnpm run build` / `pnpm run test` 三条裸命令已验证 EXIT=0（58 项测试全绿）。前提是 `pnpm-workspace.yaml` 里 `storeDir: ./.pnpm-store` + `verifyDepsBeforeRun: false` 生效。
2. 若 pnpm 全局 store 又报 SQLite 错，退回 `pnpm --config.verify-deps-before-run=false --config.store-dir="<workspace>/.pnpm-store" run <script>`，或直接调 `node_modules/.bin/tsc` / `node scripts/build-client.mjs` / `node --test --test-isolation=none tests/*.test.mjs`。
3. 安装依赖一律带 `--ignore-scripts --store-dir "<workspace>/.pnpm-store" --node-linker=hoisted`（本机 npm 日志目录 EPERM、pnpm isolated 传递依赖解析不到）。
4. scratch 本地开发：生成绝对路径 `cordis.yml`，`pnpm dsh web --patch <generated>` → 独立实例端口 **3080**；现有 Web GUI 是 **55101**，不要替换。
5. 发布：`pnpm pack` 出 tarball（1.0.0 为 39,386 B）→ `dsh plugin --profile <name> add ./dsh-session-status-marker-*.tgz`；或 0.2 世代 `plugin_manager install_bundle`（需 danger-full-access）。
6. 运行时自检：`cordis_inspect_query` 查服务/tool/route/slot；`dsh --profile <name> --dump-config` 核 `application: applied`。不要手写 profile 的 `package.json` / `cordis.patch.yml` 绕过验证。
7. **真实集成测试走 dev4090**（`ssh dev4090`，Windows/PowerShell）：打包版没有 `dsh` shim，用 `DeepSeek Harness.exe` + `ELECTRON_RUN_AS_NODE=1 --expose-internals` 跑 asar 内 `@deepseek-ai/dsh-desktop-host/lib/cli.js`；`DSH_HOME` 指向 `%TEMP%\.drafts\dsh-session-marker\dsh-home` 做隔离。`--from-default-profile web` 会覆盖 profile 且丢掉已装 bundle，之后必须重装；起服务用 `--profile <name> --no-open --port <n>`（`web` 是 profile 名不是子命令，`--web-port` 不存在）。远程命令分隔用 `;` 不用 `&`；诊断脚本先落 .ps1 再 scp 执行，别内联 `$node -e`。
8. **前端改动必须在真实页面复核**：只跑 typecheck/单测不算验收。改 client 侧要走一遍「`pnpm pack` → scp → 停 3099（按端口找 PID，进程名是 `DeepSeek Harness.exe`）→ `dsh plugin add` → 本地后台作业跑 `ssh dev4090 "cmd /c start-web2.cmd"` → 刷新页面 → 读 `getBoundingClientRect()` 与截图」。远程 Edge 必须带 `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`，否则 `sidebar.session.row.hover` 不展开。CDP 对「切换开关」型按钮会重复投递 click，这类按钮用页面内单次 `element.click()`。
9. **诊断服务注册问题先看 route 状态码**：同源 `fetch('/api/<plugin>.<verb>')` 得到 404 说明 exact route 没注册（`rpc-host.ts:207-232` 未命中即 404），此时优先怀疑 `ctx.get('service')` 在 `[Service.init]` 时机拿到 undefined，改用 `ctx.inject`。

## 代码风格（对齐 DSH 主仓库要求）

- `strict: true`、`noImplicitAny`；禁止新增 `as unknown` 断言。
- 每个导出必须有 JSDoc（`verify-export-jsdoc`）；文件结尾恰好一个换行。
- `Waterfall listeners MUST call next()`（`framework/events.md:23-106`）。
- `Switch on discriminant tags`（closed union 用 assertNever，merge-extensible 走 documented default；`inferStatus` 的 default 返回 `null`）。
- `Misconfiguration fails loud`；Config 字段用 `z` 的 `.required()`，**不硬编码默认值**（`config.md:76-94`）。
- Client 组件所有文案走 typed locale dictionary + `t`（`src/client/locales.ts` 的 zh/en key-identical）；样式只用 `--dsw-*` tokens，零字面颜色。
- `window.__ModuleLoader__.load({id, factory})` 的 Browser bundle 里，裸 `require()` 只能取 `packages/client/web/src/platform.ts:8-15` 的 `PLATFORM_MODULES` 白名单。

## 已知环境约束（本机实测）

- `$DSH_HOME = <user-home>\AppData\Local\scoop\persist\deepsek-harness-pre`（注意拼写 `deepsek`）。
- 打包版源码在 `app.asar` 单文件内，需按 asar header pickle 抽取；不要把它当目录访问。
- git clone / curl.exe 走代理失败（`SEC_E_NO_CREDENTIALS`）；Node fetch + `NODE_USE_ENV_PROXY=1` 成功；api.github.com SSRF 拦截（198.18.0.185）。
- Scoop 全局 pnpm store 的 `index.db`（3.36 GB）不可读；`pnpm-workspace.yaml` 把 store 指向工作区并关闭预检。
- Windows 沙箱禁止 named-pipe spawn：esbuild service、Vitest/Vite 配置加载、`node --test` 默认隔离全部报 `spawn EPERM`；已用 TS compiler API + `--test-isolation=none` 绕开。
- Web GUI **55101** vs scratch **3080**，二者不同。
- 测试机 **dev4090**：`测试主机地址`，用户 `测试主机登录用户`，密钥 `本机 SSH 密钥（走 SSH 配置，不在文档中记录）`；scoop `versions/deepseek-harness-pre 0.2.2-rc.1`，无 `dsh` shim。测试 home 用 `%TEMP%\.drafts\dsh-session-marker\dsh-home`，可随时整体废弃，不影响该机真实配置。

## 任务进度看板

Phase 1 Core 已完成：Host + Client 源码、`lib/client.js`、全套 docs 修订、AGENTS/README/项目记忆同步。
Phase 2 已完成：8 个官方风格 inline SVG 图标 + locale 一致性断言 + 样式契约断言；测试合计 58 项全绿（含 `tests/marks.test.mjs` 的共享读取器 5 例）。
Phase 3 部分完成（真实 GUI 前端验收，2026-11-11）：侧栏行尾标记、hover card 8 格选择、状态改写与清除、连续三次重启后标记仍在、模型通过 `set_session_status` 自主标记，全部在 dev4090 的真实页面上用 CDP 复核并截图。这一轮修掉三个只在真实页面上暴露的缺陷：exact route 未注册（`ctx.get('connection')` 时机问题 → 改 `ctx.inject`）、图标查表键与 glyph id 不一致、未标记会话没有可点的状态格 + 图标 0×0 + active 格前景色吃掉图标。
Phase 4 已完成（1.0.0）：`src/client/marks.ts` 全页共享列表定时读取（`Config.refreshIntervalMs` 默认 2000ms）+ 本地写透，标记写入后无需刷新页面；客户端订阅统一走 `useMark()`。
未完成：`cordis_inspect_query` 自检（属 Creator mode 能力）；TUI 端 UI 接入（无 slot 体系）；fork 继承策略。桌面端走同一套 Web UI，可直接用。详见 `docs/implementation-plan.md` §2 与 `docs/acceptance-and-regression.md` §3.4、§3.6。
