# AGENTS · dsh-session-status-marker

## Standing Orders（所有 Agent 必读，优先级最高）

1. **网络优先**：遇到问题先搜索已有解决方案，再动手。搜索时把问题拆成原子化关键词再检索（`research` 工具除外），并避开内容农场与云厂商营销站：CSDN、腾讯云、阿里云、华为云、抖音、百家号一类站点不作为依据，优先官方文档、规范原文、上游仓库源码与 issue。禁词列表：硬/绕弯子/发射/配方/天花板/xx钥匙/阶梯/一句话总结/还狠/更绝的是/就是xx/把xx撑住/把xx走好/直接拉满/这波/xx账/认/接下/收下/xx的锅/纯纯的xx/名场面/问就是/属于是。
2. **事实源唯一**：官方 API / 行为 / 契约一律以 `.research/dsh-repo/` 本地镜像中的文件:行号为准。外部网页资料只用于竞品/市场/社区最佳实践，不得用于断言 DSH 官方行为。
3. **路径规范**：所有 DSH 相关路径从 `$env:DSH_HOME`、`$env:TEMP`、工作区根解析；仓库内不写死 `<user-home>\...`。临时脚本与生成产物放 `$env:TEMP/.drafts/<会话id>/`，可复用代码落盘到本仓库。
4. **包管理**：优先 pnpm；Node fetch 走代理时确保 `NODE_USE_ENV_PROXY=1`。npm 日志目录若权限不足，重定向到工作区或 temp。
5. **审批政策**：删除文件前必先请示用户说明目的、影响与风险；批量删除优先用 `send2trash`。
6. **rtk wrap**：常用命令用 `rtk <cmd>` wrap 节省 token，如 `rtk read <file>`、`rtk grep <pattern>`。
7. **每步一行 status**：在正文最前面单独写一行 `⏵ <正在做的事>`（≤20字），切换任务必须更新。
8. **智能体团队原子化拆解**：支持子代理或智能体团队时，把目标拆成互不依赖、可单独验收的原子任务再分别派发，不要按线性顺序一个人做完全部。每个派发单必须写清五项：输入（必读文件与已知事实）、产出（文件路径与格式）、验收判据、写入范围白名单、时间预算；共享文件（`AGENTS.md`、`README.md`、`CHANGELOG.md`、`package.json`）由主会话独占，子代理只写各自范围内的文件。子代理完成后主会话必须按判据逐条复核产物并自己跑一遍测试，不得只凭子代理的结论判定通过。判定子代理是否真在工作看产物文件修改时间，10 分钟无改动先询问、30 分钟无改动中断并接手。条文与来源见 `docs/research/11-agent-team-practices.md`，落地要求见 `CONTRIBUTING.md` §6。

## 项目概要

- **目标**：为 DeepSeek Harness 编写「会话状态标记」插件，支持用户手动标记会话状态（8 种：todo / done / stopped / blocked / review / pending-subagent / awaiting-answer / feedback）以及 AI 自主推断，Client 侧用徽标 + 悬停卡展示。
- **约束**：必须是仓库外的独立 npm bundle，不修改 DSH 主仓库源码；遵循 DSH 工程化规范（ESM、strict TS、JSDoc、declaration merging、effect-based lifecycle）。
- **入口文档**：`docs/architecture.md`（V2 最终架构）、`docs/research/01..11.md`（调研）、`docs/feasibility-and-risks.md`、`docs/implementation-plan.md`、`docs/acceptance-and-regression.md`、`docs/release-process.md`（版本规划与发布流程）、`CONTRIBUTING.md`（提交规范与协作规范）。
- **官方镜像位置**：`.research/dsh-repo/`（来源 `https://codeload.github.com/deepseek-ai/deepseek-harness/zip/refs/heads/master`）。

## 架构红线（最重要，勿回退）

**仓库外 bundle 不能写自定义 `SessionEventMap` 事件。** `Session.append` 没有 `ignorable` 参数（`packages/core/session/src/index.ts:806-837`），`appendPluginRecord` 被明禁（`packages/core/session/README.md:70-74`），读路径对未知 required 事件整份拒读（`packages/session/session-persistence/src/storage-contract.ts:75-80`）。V1 曾这样设计，已证伪删除（`src/events.ts` 不存在）。

最终链路：

```
src/contracts.ts   共享契约（零依赖，Browser 不能带 zod）
src/types.ts       zod 严格 schema + 编译期双向 extends 校验
src/domain.ts      defineDomain({name:'session_status_marker', version:1, tables:{marks}})
src/inference.ts   inferStatus / shouldApplyInference / isAutoMarkExpired（纯函数）
src/service.ts     SessionStatusService：Service.init + 4 exact routes + 2 tools + 观察器
src/index.ts       纯导出入口（default = Service 类）
src/client/*       apply → locale.register + slots.inject(trailing / hover / settings.section / row.action / menu.item)
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
| 浮层配色 | 用 `:has([data-status-slot])` 从 slot 覆盖宿主整张卡为背景 `--dsw-alias-bg-layer-2` + 宿主文字 `--dsw-alias-label-*`，我们面板透明融入、状态图标用主题别名；徽标同样用主题别名 | 官方卡底与标题/时间/状态行都写死深底浅字（`ui-primitives/HoverCard.module.css:9-19`、`ui-workspace/.../Rows.module.css:410-444`）；1.0.3–1.1.0 自绘白底割裂、1.1.1 融入深色卡不随主题，1.1.2 覆盖整卡才真正跟随主题 |
| Rust | 不引入 | 见 `docs/research/05-rust-feasibility.md` |

## 开发回路与可靠命令

1. `pnpm run typecheck` / `pnpm run build` / `pnpm run test` 三条裸命令已验证 EXIT=0（111 项测试 / 27 套件全绿）。前提是 `pnpm-workspace.yaml` 里 `storeDir: ./.pnpm-store` + `verifyDepsBeforeRun: false` 生效。
2. 若 pnpm 全局 store 又报 SQLite 错，退回 `pnpm --config.verify-deps-before-run=false --config.store-dir="<workspace>/.pnpm-store" run <script>`，或直接调 `node_modules/.bin/tsc` / `node scripts/build-client.mjs` / `node --test --test-isolation=none tests/*.test.mjs`。
3. 安装依赖一律带 `--ignore-scripts --store-dir "<workspace>/.pnpm-store" --node-linker=hoisted`（本机 npm 日志目录 EPERM、pnpm isolated 传递依赖解析不到）。
4. scratch 本地开发：生成绝对路径 `cordis.yml`，`pnpm dsh web --patch <generated>` → 独立实例端口 **3080**；现有 Web GUI 是 **55101**，不要替换。
5. 发布：`pnpm pack` 出 tarball（1.2.2 为 74,526 B，1.2.1 为 70,353 B，1.2.0 为 70,350 B，1.1.6 为 55,310 B，1.1.5 为 55,313 B，1.1.4 为 55,335 B，1.1.3 为 55,284 B，1.1.2 为 56,921 B，1.1.0 为 56,007 B，1.0.3 为 47,725 B）→ `dsh plugin --profile <name> add ./dsh-session-status-marker-*.tgz`；或直接 `add dsh-session-status-marker` 从 npm 装。npm 发布走 staged publishing：命令输出 `+ name@version` 只代表请求被接受，registry 先公开 `0.0.0-stage`，约 11 分钟后 `latest` 才变到真实版本；判据见 `docs/project-memory.md` §6 教训 28。**`engines.dsh` 下限写带预发布标志的比较器（`>=0.2.2-rc.1`），不要写 `>=0.2.2`**——npm semver 里预发布版本不匹配不带预发布标志的范围（教训 33）。GitHub 推送用 `git remote set-url origin https://x-access-token:$tok@github.com/<owner>/<repo>.git`（`$tok = gh auth token`），SSH 被沙箱拦。**发布政策（用户 2026-11-20 指定）：正式版本（stable，不带 prerelease 标记的 GitHub Release / npm dist-tag latest）必须在用户实际前端验收通过之后才能发布；用户验收之前只能发预版本——版本号带 `-rc.N` 后缀、GitHub Release 勾 prerelease、npm 用 `1.2.3-rc.1` 形式发布且不动 latest。**
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
- Client 组件所有文案走 typed locale dictionary + `t`（`src/client/locales.ts` 的 8 种语言 key-identical，新增语言必须补齐全部键，否则按 `FALLBACK_LOCALE='en'` 回退成英文）；样式只用 `--dsw-*` tokens，零字面颜色。
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
Phase 2 已完成：8 个官方风格 inline SVG 图标 + locale 一致性断言 + 样式契约断言；测试合计 72 项全绿（含 `tests/marks.test.mjs` 的共享读取器 5 例、`tests/theme.test.mjs` 的主题化 10 例、`tests/i18n.test.mjs` 的 8 语言字典 11 例、`tests/overview.test.mjs` 的状态总览 5 例）。
Phase 3 部分完成（真实 GUI 前端验收，2026-11-11）：侧栏行尾标记、hover card 8 格选择、状态改写与清除、连续三次重启后标记仍在、模型通过 `set_session_status` 自主标记，全部在 dev4090 的真实页面上用 CDP 复核并截图。这一轮修掉三个只在真实页面上暴露的缺陷：exact route 未注册（`ctx.get('connection')` 时机问题 → 改 `ctx.inject`）、图标查表键与 glyph id 不一致、未标记会话没有可点的状态格 + 图标 0×0 + active 格前景色吃掉图标。
Phase 4 已完成（1.0.0）：`src/client/marks.ts` 全页共享列表定时读取（`Config.refreshIntervalMs` 默认 2000ms）+ 本地写透，标记写入后无需刷新页面；客户端订阅统一走 `useMark()`。
Phase 4.1 已完成（1.0.1）：悬停卡文字与按钮改用 `--dsw-static-*` 静态色板。DSH 官方悬停浮层在浅色和深色主题下都用同一个固定深色底，主题别名在浅色主题下会解析成接近黑色，文字因此看不清。徽标仍用 `--dsw-alias-state-*` 主题别名跟随主题切换。
Phase 5 已完成（1.0.2，用户 2026-11-12 反馈）：① 复制误触 — 内容区根节点接管 `onClick`/`onKeyDown` 并 `stopPropagation()`，不再冒泡到官方 HoverCard 的复制处理器（`packages/client/ui-primitives/src/HoverCard.tsx:293-303` 在 `onClick` 复制、`:304` 在 Enter/Space 也复制）；② 鼠标挪开点不到 — 内容区加透明命中区 `.root::before` 跨过锚点到浮层的 8px 间隙，指针经过它冒泡到宿主 `onPointerEnter` 取消 200ms 宽限关闭（`pointer-grace.ts:8` + `HoverCard.tsx:326-336`）；③ 语言不同步 — `src/client/locales.ts` 补齐 Shell 全部 8 种语言并以 `DICTIONARIES` 一次注册（此前只有 zh/en，切到其余 6 种按 `FALLBACK_LOCALE='en'` 回退）；④ 主题不同步 — 卡片表面是官方固定深色，文字与状态色保持静态，改由交互面响应主题（悬停/选中格与按钮悬停底色用随主题变化的 `--dsw-alias-tooltip-key-bg`）；⑤ 图标内边距 — 格子 22px `border-box` + 2px 内边距 + 2px 间距 = 190px，稳定单行。根容器自身还有 6px/8px 内边距，官方卡 212px 内容宽扣掉后可用约 196px，dev4090 真实页面复核发现 197px（3px 间距）会让第八格换行，故收窄到 2px。真实页面已复核八格同一行、点按钮不再误触复制。测试 66 项全绿。调研见 `docs/research/08-hover-interaction.md`。
Phase 6 已完成（1.0.3）：悬停卡表面改为覆盖整张卡片并自绘 `--dsw-alias-bg-layer-2`（浅色主题白色、深色主题深灰），文字与状态图标颜色改回主题别名（`--dsw-alias-label-primary` / `--dsw-alias-label-secondary` / `--dsw-alias-state-*-primary`，与徽标一致），交互面改用 `--dsw-alias-interactive-bg-hover` / `--dsw-alias-interactive-bg-active`。桥接命中区因根节点负边距外扩收窄为 8px。**前端真实页面验收已完成**（`ui-theme preference: system` + `prefers-color-scheme` 两主题截图 `.drafts/shots/v103-system-{light,dark}-picker.png`）；语言持久化根因是 dev4090 的 `cordis.patch.yml` 带 UTF-8 BOM 导致 config-editor 写入被拒，移除 BOM 后语言与主题跨重启保持（环境侧修复，非插件缺陷）。
Phase 7 已完成（1.1.0，竞品评估后落地 P0 跨会话状态总览）：新 Host 路由 `GET /api/session-status-marker.overview`（8 状态分组、组内按更新时间降序、`ctx.sessionTitle.get` 关联标题、缺失/抛错回退 null），设置页 `settings.section` 新组件 `StatusOverview.tsx`（mount + 轮询 + 可见性感知，全 `--dsw-alias-*`），8 语言各补 6 键。`static inject` 增 `sessions`/`sessionTitle`（`declare module '@deepseek-ai/cordis'` 合并 Context，未加依赖），client 侧本地声明 `settings.section` SlotMap entry（未装 `dsh-client-ui-settings`）。**真实页面验收**：dev4090 设置页出现 `Session status` 入口，按状态分组带计数、标题关联真实会话「标记会话为完成」、mutate 后 3 秒内自动更新；明暗两主题均随 DSH 主题变化，截图 `.drafts/shots/v110-overview-{light,dark,titled}.png`。72 项测试全绿，tgz 56,007 B。设计见 `docs/research/09-status-overview.md`。
Phase 8 已被 Phase 9 取代（1.1.1 的方案被用户否决）：1.1.1 让整卡留在深色，浅色主题下仍是黑色浮窗，不满足「跟随 DSH 主题」。
Phase 9 已完成（1.1.2，用户「light 这回也是黑色浮窗，你哪里看出通过了」）：从 slot 用 `:has([data-status-slot])` 覆盖**宿主整张卡**——卡片背景变量 `--dsw-hovercard-bg` 指向 `--dsw-alias-bg-layer-2`，宿主标题/路径/时间/状态行指向 `--dsw-alias-label-primary/secondary`；我们面板透明、状态图标与 hover/active 全用主题别名。属性选择器在 CSS-module 构建中不被哈希，`:has()` + `!important` 特异性高于官方样式，只命中含我们 slot 的那张卡。**真实页面验收**：light 整卡 `rgb(255,255,255)` 白底标题近黑、dark 整卡 `rgb(44,44,46)` 深灰标题近白，8 格单行，截图 `.drafts/shots/v112-{light,dark}-picker.png`（已目检）。73 项测试全绿，tgz 56,921 B（放宽 engines 下限后）。
Phase 10 已完成（1.1.3，用户「为什么项目介绍里放什么架构红线、完整证据与取舍、明禁是啥意思，docs 可以不用放到 npm 仓库里面」）：`README.md` 重写为面向使用者的说明——先讲插件做什么、怎么用、八种状态各自用在哪，再给安装与配置；内部实现术语（`SessionEventMap`、`ctx.storageDomain`、exact route、sidecar、`ignorable` 等）全部从 README 移除，只在「开发」一节保留一句「独立安装包、数据不进会话日志」的白话说明。README 里所有链接改成 GitHub 绝对地址（此前 `./docs/...` 在 npm 页面会指向不存在的 `npmjs.com/package/.../docs/...`），并引用两张真实界面截图 `docs/images/hover-{light,dark}.png`（`raw.githubusercontent.com` 绝对地址）。npm 包内容不变：`package.json` 的 `files` 仍只有 `lib/`、`locale/`、`cordis.patch.yml`、`icon.svg`，`docs/` 与截图不入包。73 项测试全绿，tgz 55,284 B。
Phase 11 已完成（1.1.4~1.1.6，2026-11-18~19）：1.1.4 预览图改局部裁切 + README 去 AI 味润色（`lieflat-less-ai-tone` skill 完整流程）；1.1.5 恢复 `engines.dsh` 下限到 `>=0.2.2-rc.1`（侧栏徽标依赖 0.2.2-rc.1 才引入的 `sidebar.session.row.trailing` 槽位）+ README 补侧栏图标预览图；1.1.6 依赖声明归位——`peerDependencies` 区间化到 `>=0.2.2-rc.1 <0.3.0`、`zod`/`@deepseek-ai/schemastery` 按官方范式移入 `dependencies`、`devDependencies` 从 30 项瘦身到 14 项。三者均无运行时行为改动，typecheck/build EXIT=0、73 项测试全绿。
Phase 12 已发布并复核（1.2.0，2026-11-19，dev4090 真实 GUI 七项复核全部 PASS）：悬停卡对已标记会话直接常显 8 格状态选择（去掉「修改状态」展开步骤）；新增会话行快捷操作 `sidebar.workspaces.session.row.action`（id `session-status-row-action`，行内状态选择器）与菜单入口 `sidebar.workspaces.session.menu.item`（id `session-status-menu-item`，`role=menuitem`，选中后关闭菜单），作为不依赖悬停的触屏/键盘入口；新增 `rowActionOrder`/`menuItemOrder` 配置（默认 300）——Host 经 `webserver/index-inject` 推页面全局 `__DSH_SESSION_MARKER_CONFIG__`（`BootPluginRow` 无 per-entry config，官方 index-inject 模式）；`list` 路由支持 `?since=<revision>` 条件刷新（unchanged 跳重绘，可见性恢复/首次订阅全量读取）；`awaiting-answer` 色改用 `--dsw-alias-label-secondary`；`set_session_status` 工具描述重写（WHEN TO USE / WHEN NOT TO USE / DO NOT USE FOR / USAGE / EXAMPLES）；整卡主题接管同时覆盖 `--dsw-alias-hovercard-bg` + `--dsw-hovercard-bg`（新构建画卡用前者）；`engines.dsh` = `>=0.2.2 <0.3.0`。95 项测试 / 23 套件全绿（目录形式另计入 4 个 .test.ts 薄壳报告 99/23），tgz 70,350 B。**发布与复核记录**：提交 `27e06d1`+`24e70be`+tag `v1.2.0`、GitHub Release 附 tgz、npm shasum `b7fb2b8bc331f3d79cf0d466d70e6a9550096f3a`（latest=1.2.0）；dev4090 DSH 0.2.2-rc.5 npm 源安装，七项复核全 PASS（8 格单行防误触 / 行操作排官方归档置顶后 / 菜单选中自动关 / 条件刷新 323ms 无闪烁 / 全局注入正确 / cardBg light 白 dark 深 / awaiting-answer 用 label-secondary），截图 `.drafts/shots/v120-rc5-{light,dark}-picker.png`，详见 `docs/acceptance-and-regression.md` §3.17。
Phase 13 已完成（1.2.1 与 rc.3 桌面端故障调查，2026-11-19）：① 1.2.1 修 engines 拒装（`>=0.2.2` 不匹配任何 `0.2.2-rc.x`，npm semver 预发布规则，教训 33）；② 用户报桌面 rc.3「图标全无、点击出现已复制」——dev4090（同为 rc.3）CLI 安装 CDP 全流程验收全过 + rc3-repro 子代理独立复现，**插件代码无缺陷**；真正根因是用户桌面 desktop profile 的孤儿安装（bundles/patch 层全无、node_modules 残留 1.2.1，`operations.jsonl` 显示 1.2.0 两次 incompatible-version 失败 + 1.2.1 enable applied 未落盘 + 最终 remove）；③ 处置：npm deprecate 1.2.0/1.2.1（granular token 不可 unpublish，教训 36）、dist-tag latest 回指 1.1.6、GitHub Release 补故障说明标 prerelease；④ 新增教训 34（rc.3 CLI「Already up to date」分支不写 bundles，必须 remove 后重新 add）与 35（桌面 plugin-manager 失败路径留孤儿依赖、市场装完默认 enabled:false 要点「立即启用」）。
Phase 14 已完成（1.2.2，用户四点反馈，2026-11-20）：①行内入口从 22×18「状态」文字按钮改 24×24 官方 iconButton 规格 + 随状态变化的状态图标（未标记显示清单图标）；②行内面板从行内下方展开一排格子改 214px 卡片浮窗（bg-layer-2 表面、radius-lg、大阴影）；③`StatusPicker` 加 `showSummary`（摘要行 + 备注行截 64 字符 + 清除按钮），触屏（悬停卡忽略 touch 指针）由此可达备注与清除；④菜单项补 14px 前置图标并对齐官方 `.item` 字号（34px 高、13px/20px）；⑤`icon.svg` 改 36×36 填充渐变（浅色背景不再黑色勾）。**用户桌面「已复制」复发经 `git show v1.2.1:src/client/HoverCard.tsx` 核对为激活层未更新（旧 client.js 残留），非 1.2.1 代码缺陷**。102 项测试全绿（新增 `tests/touch-icon.test.mjs` 6 例），tgz 74,526 B；dev4090（rc.3）真实页面复核通过：trigger 24×24/16px svg/无文字、浮窗 214×91/8 格单行/白底、摘要「Manual: Done/Blocked」、备注行真实渲染、明暗两主题随主题切换、点文本区与格子均无复制、触屏模拟面板可达，截图 `.drafts/shots/v122b-panel-{light,note,dark}.png`。发布：提交 `6719b57`+`b86dbb6`+tag `v1.2.2`、GitHub Release 附 tgz、npm `+ dsh-session-status-marker@1.2.2`（integrity sha512-2m2Nbk8xCLCR6）。
Phase 15 已完成（1.2.3-rc.1，用户 2026-11-20 三点反馈，**仅发预版本待用户验收**）：①悬停卡整卡防复制守卫 — 新增 `src/client/copyGuard.ts`（`useCardCopyGuard()` 在 document 上以 capture 注册 click/keydown：target 在含 `[data-status-slot]` 的官方卡内、不在我们 slot 内且非交互元素时 `stopPropagation()`，keydown 只拦 Enter/Space；React 17+ 合成事件绑在 root container，原生 capture 先触发故官方卡 onClick 不再执行），挂在 `HoverCard.tsx` 组件体首行，官方卡空白处点击不再出现「已复制」；②单一浮层 — `src/client/RowAction.tsx` 加 `useHoverCardOpen()`（MutationObserver 观察 document.body），`showPicker = expanded && !cardOpen`，悬停卡打开时行内面板让位不再两个浮窗并存；③市场元数据 8 语言 — 新增 `locale/{zh,ja,es,fr,de,ru,pt}.json`（只含 `meta.title`/`meta.description`，官方 `readPluginMeta` 扫描 locale/ 全部 json 且忽略其余键）。tsconfig 加 DOM lib、build-client MODULES 加 copyGuard。111 项测试 / 27 套件全绿（新增 `tests/copy-guard.test.mjs` 9 例），tgz 81,880 B；dev4090（rc.3）真实页面验收通过：浅/深两主题下悬停卡标题与空白处点击 `copied:false`、拖选文本不触发复制、悬停卡打开时行内 popover 只有一个、行内面板含摘要/备注/清除，截图 `.drafts/shots/v123-{card-guard,panel-light,dark-card}.png`。发布遵循**发布政策**：GitHub Release 勾 prerelease（tag `v1.2.3-rc.1`）、npm 用 `--tag rc` 发布（`dist-tags.rc=1.2.3-rc.1`，latest 保持 1.2.2）。提交 `586bbb9`+`151ff5c`。
Phase 16 已完成（1.2.3-rc.2，用户「点击图标还是有下面一排，这一排删掉，点击图标出现右侧floating」）：**删除行内自建浮层**，行内图标改为只负责打开宿主悬停卡。原因有两条：①`Rows.module.css:340-359` 的 `@media (hover: none)` 把 `.rowQuickActions > [data-slot] > :not(.pinnedAction)` 设为 `display:none`，而 `pinnedAction` 是宿主内部哈希类（只出现在 `PinSession.tsx:37`），我们的 slot 拿不到，触屏本来就看不到行内图标，1.2.2 的行内面板只在桌面出现、与悬停卡重复；②官方 `HoverCard` 没有受控 open 属性，但卡根 span 监听 `onPointerEnter`（`HoverCard.tsx:326-336`），React 由原生 `pointerover` 合成该事件，所以点击时向所在行派发一个 `pointerover`（`pointerType:'mouse'`、`bubbles/cancelable/composed`、`pointerId:1`、`isPrimary:true`、`relatedTarget:null`）就能让宿主自己打开卡片。实现：`src/client/RowAction.tsx` 的 `useRowCardTrigger()` 在 `document` 上以 capture 注册 `pointerdown` 与 `click`，命中 `[data-status-action]` 时 `stopPropagation()`（必须绑在 document——React 合成事件监听在 root container，绑在按钮上拦不住宿主的 `onPointerDownCapture/onClickCapture` 与整卡复制），click 再调 `openRowCard()` 派发 `pointerover`。`action.module.css` 删除 `.popover` 整段。**真实页面验收**：点行内图标后 822ms 卡片打开（822ms 是宿主自己的 800ms 停留计时，与鼠标悬停同一延迟）、`popover:0` 只有一个浮层、`copied:false`、再点图标不会关卡、点标题与卡底空白均 `copied:false`，截图 `.drafts/shots/v123rc2-row.png`。111 项测试全绿，tgz 82,987 B。同轮新增 `docs/release-process.md`（版本规划与发布流程）与 `CONTRIBUTING.md`（提交规范与协作规范），以及 `docs/research/10-release-and-versioning.md`、`docs/research/11-agent-team-practices.md` 两份调研。
未完成：`cordis_inspect_query` 自检（属 Creator mode 能力）；TUI 端 UI 接入（无 slot 体系）；fork 继承策略；侧栏按状态过滤（宿主无过滤 slot，P0 推迟）；批量状态操作（P1）；1.2.3 正式版待用户实际验收后发布（发布政策见开发回路第 5 条）。插件市场的已装列表描述由第三方 `dshmarket` 渲染，它只读包 `package.json` 的字符串 `description`，不读 `locale/*.json`，仓库内改不了；官方「插件」页读 locale meta，我们的 8 语言已生效。桌面端走同一套 Web UI，可直接用。详见 `docs/implementation-plan.md` §2 与 `docs/acceptance-and-regression.md` §3.4、§3.6、§3.9、§3.10、§3.11、§3.17、§3.20。

## 悬停卡交互约束

- 内容区**根节点**必须接管 `onClick` 与 `onKeyDown` 并 `stopPropagation()`（当前实现是 `HoverCard.tsx` 里的 `guard` 对象 spread 到每个根 div）。官方 HoverCard 把整张卡注册成 `role="button"` 并在 `onClick` 与 Enter/Space `onKeyDown` 里复制会话标题（`packages/client/ui-primitives/src/HoverCard.tsx:290-304`），复制后整卡内容被替换成提示文字，所以只给单个 `button` 加 stop 不够，点标签/备注同样会误触。
- 官方 `onPointerDownCapture` 与 `onClickCapture` 由卡片持有（`HoverCard.tsx:343-344`），组件不能靠 `onPointerEnter` 维持打开；跨间隙保持打开靠 `.root::before` 命中区冒泡到宿主 `onPointerEnter` 触发 `cancelClose()`。不要删掉这条规则。
- 悬停卡必须**整张跟随 DSH 主题**（1.1.2 起，最终口径）：官方卡底与标题/时间/状态行写死深底浅字（`ui-primitives/HoverCard.module.css:9-19`、`ui-workspace/.../rows/Rows.module.css:410-444`），只在自己面板上调色无论怎样都不能让整卡跟随。正解是在 CSS 里用 `[class*='card']:has([data-status-slot])` 覆盖宿主整卡：`--dsw-hovercard-bg` → `--dsw-alias-bg-layer-2`，宿主 `[class*='hoverTitle']` → `--dsw-alias-label-primary`，`hoverPath/hoverTime/hoverStatus` → `--dsw-alias-label-secondary`，均 `!important`。属性选择器在 CSS-module 构建中不会被哈希（构建器只重写 `.class`），`:has([data-status-slot])` 保证只命中含我们 slot 的那张卡。我们面板 `.root` 透明、文字 `--dsw-alias-label-primary/secondary`、`hoverTone` 用主题别名、hover/active 用 `--dsw-alias-interactive-bg-*`。**不要回退到静态色板融入**（1.1.1 被否决）或负边距自绘白底（1.0.3–1.1.0 割裂）。验收必须读 `cardBg`：light≠dark 才算通过，只看面板透明/文字白是错的口径。
- **行内图标不拥有面板**（1.2.3-rc.2 起）：会话行右侧那个 24×24 状态图标只负责把宿主悬停卡打开，不要再给它配自己的 popover，否则同一条行上会同时出现两个浮层。实现方式是在 `document` 上以 capture 拦 `pointerdown` 与 `click`（命中 `[data-status-action]` 时 `stopPropagation()`），click 时向 `from.closest('[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"]')` 派发一个 `pointerover`（`pointerType:'mouse'`）让宿主 `onPointerEnter` 自己开卡。必须绑在 `document`：React 合成事件监听在 root container 上，绑在按钮自身拦不住宿主的 `onPointerDownCapture/onClickCapture`（`dismissFromAnchor` 会在卡片已开时把它关掉）与整卡复制。宿主在 `@media (hover:none)` 下会把我们的行内 slot 隐藏（`.rowQuickActions > [data-slot] > :not(.pinnedAction)`），触屏的入口是 `sidebar.workspaces.session.menu.item` 那个菜单项，不要再试图给触屏补行内面板。
- compact 悬停卡宿主不注册 Escape（`HoverCard.tsx:156-167` 只为 preview/inline 注册），WCAG 1.4.13 的 Dismissible 在这个分支不可达，只能做到 Hoverable 与 Persistent，不要在文档里声称已满足 Dismissible。
