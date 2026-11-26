# AGENTS · dsh-session-status-marker

> 本文件写给编码智能体，不是给人看的 README。给人看的说明在 `README.md`，提交与协作规范在 `CONTRIBUTING.md`。
> 读法：先读「命令表」与「硬规则」，需要细节时按「更深文档」表格里的「何时读」跳转，不要在仓库里盲目遍历。

## 项目定位与背景

- **一句话背景**：为 DeepSeek Harness 编写的「会话状态标记」插件，支持用户手动标记、也支持 AI 自主推断会话状态（8 种：todo / done / stopped / blocked / review / pending-subagent / awaiting-answer / feedback），Client 侧用徽标与悬停卡展示。
- **形态**：仓库外的独立 npm bundle，不修改 DSH 主仓库源码；ESM + strict TypeScript + cordis Service + zod 严格 schema + React 18。
- **官方镜像**：DSH 源码镜像在 `.research/dsh-repo/`（来源 `https://codeload.github.com/deepseek-ai/deepseek-harness/zip/refs/heads/master`），官方行为一律以这里的文件:行号为准。

## 命令表

除特别说明外全部在仓库根目录执行。`<workspace>` 指仓库根，不要替换成绝对路径。

| # | 命令 | 前置 | 完成的定义 |
|---|---|---|---|
| 1 | `pnpm install --ignore-scripts --store-dir "<workspace>/.pnpm-store" --node-linker=hoisted` | Node 24.9 以上、pnpm；本机 npm 日志目录权限不足，这三个参数不能省 | 无报错退出，`node_modules` 就位 |
| 2 | `pnpm run typecheck` | 已完成第 1 步 | EXIT=0，无类型错误 |
| 3 | `pnpm run build` | 已完成第 1 步 | EXIT=0，`lib/*.js` 与 `lib/client.js` 均已更新 |
| 4 | `pnpm run test` | 已完成第 1 步 | EXIT=0，当前基线 223 项测试 / 50 套件全绿 |
| 5 | `pnpm pack` | 第 2、3、4 步全过 | 产出 `dsh-session-status-marker-<版本>.tgz`，把文件名与字节数写进发布记录，不写进本文件 |
| 6 | `dsh plugin --profile <name> add ./dsh-session-status-marker-<版本>.tgz` | 已有一个独立 profile，不要在正在用的 GUI profile 上装 | `dsh --profile <name> --dump-config` 显示 `application: applied` |
| 7 | 真实页面验收：`pnpm pack` → scp 到 dev4090 → 停 3099 端口进程 → `dsh plugin add` → 刷新页面 → 读 `getBoundingClientRect()` 并截图 | 改过 `src/client/` 才需要；远程 Edge 需带 hover 模拟参数 | 几何与截图断言逐项通过，截图路径写进 `docs/acceptance-and-regression.md` |

分层验证：改单个模块时跑第 2、4 步即可；收尾时第 2、3、4 步全跑；只有动了共享契约（`src/contracts.ts`、`src/types.ts`）才需要再补真实页面复核。

## 目录地图

```
src/contracts.ts   零依赖共享契约（Browser 侧不能带 zod）
src/types.ts       zod 严格 schema + 编译期双向 extends 校验
src/domain.ts      defineDomain({name:'session_status_marker', version:1, tables:{marks}})
src/inference.ts   纯函数：inferStatus / shouldApplyInference / isAutoMarkExpired / resolveAutoFromObservation
src/service.ts     Service.init + 4 条 exact route + 2 个 tool + 观察器
src/index.ts       纯导出入口（default = Service 类）
src/client/*       apply → locale.register + slots.inject（trailing / hover / settings.section / row.action / menu.item）
scripts/build-client.mjs   TypeScript compiler API 生成 lib/client.js（CJS closure factory）
tests/*.test.mjs   canonical 断言（node:test + 自建 shim），*.test.ts 是薄壳
docs/              调研、架构、计划、验收、发布与项目记忆
```

新代码放哪：Host 侧逻辑进 `src/service.ts` 或新建 `src/*.ts` 并在 `src/index.ts` 导出；纯判断写进 `src/inference.ts`；Client 组件放 `src/client/`，文案进 `src/client/locales.ts`（8 种语言必须 key 一致）；测试一律写 `tests/*.test.mjs`，同名的 `.test.ts` 只做 re-import。

## 硬规则（必须遵守）

1. **网络优先**：遇到问题先搜索已有方案再动手，问题拆成原子化关键词检索（`research` 工具除外），避开内容农场与云厂商营销站，优先官方文档、规范原文、上游仓库源码与 issue。措辞禁用词表在 `CONTRIBUTING.md` §7.1，检索细则在 §7.2。
2. **事实源唯一**：DSH 官方 API、行为、契约一律以 `.research/dsh-repo/` 的文件:行号为准；外部网页只用于竞品、市场与社区实践，不得用来断言官方行为。
3. **不写自定义会话事件**：不要新增 `SessionEventMap` 事件，持久态只走 `ctx.storageDomain`。仓库外 bundle 写会话事件会造成「写入成功、下次打开整份日志拒读」的延迟失败，依据 `.research/dsh-repo/packages/session/session-persistence/src/storage-contract.ts:75-80`。要持久化标记，就用 `defineDomain` 加 `domainTable`。
4. **通道只有两条**：Host 到 Client 只走 `ctx.connection.fetch.register` 的 exact route，Client 只走 `ctx.slots.inject` 加组件内 `fetch()`；不要用标准 Typert Remote，也不要用 `useProjection` / `ctx.remote`（两者都需要主仓库 `generate-typert.ts` 的产物）。
5. **Client 侧规范**：文案走 typed locale dictionary 加 `t`（8 种语言 key 必须一致）；样式只用 `--dsw-*` 令牌，零字面颜色；Config 字段一律 `.required()`，不硬编码默认值；不新增 `as unknown` 断言；每个导出有 JSDoc，文件结尾恰好一个换行。
6. **不重绘宿主悬停卡**：那张卡上只允许 `cursor: default` 一条声明，插件文字读 `--dsw-alias-hovercard-label-*` 并用 `--dsw-static-neutral-bluish-*` 兜底；卡内提示只用宿主 `Tooltip`，禁止原生 `title=`。完整契约与验收口径见 `docs/research/19-hover-card-contract.md`。
7. **智能体团队分工**：把目标拆成互不依赖、可单独验收的原子任务再分别派发，不要按线性顺序一个人做完。每个派发单写清五项：输入、产出、验收判据、写入范围白名单、时间预算。`AGENTS.md`、`README.md`、`CHANGELOG.md`、`package.json` 由主会话独占。子代理完成后主会话必须按判据逐条复核并自己跑测试，不得只凭子代理结论判定通过；看产物文件修改时间判断是否真在工作，10 分钟无改动先询问，30 分钟无改动中断并接手。
8. **工作纪律与安全**：每步在正文最前面写一行 `⏵ <正在做的事>`（不超过 20 字），切换任务必须更新；常用命令用 `rtk` wrap 省 token；临时脚本与中间产物放 `$env:TEMP/.drafts/<会话id>/`，可复用代码才落盘到仓库；仓库文档禁止出现任何凭据、口令、内网地址与凭据占位符（含其语法形式、变量名、片段与描述），改完文档推送前先 `git grep` 核对；删除文件或杀进程前先说明目的、影响与风险并等用户确认，批量删除优先用 `send2trash`；正式版本必须等用户实际前端验收通过后才能发布，之前只发 `-rc.N` 预版本。

## 更深文档（何时读）

| 文档 | 何时读 |
|---|---|
| `docs/architecture.md` | 要改 Host 与 Client 之间的通道、持久化方式或槽位挂载时 |
| `docs/research/19-hover-card-contract.md` | 要动悬停卡、状态格、提示气泡或行内图标时 |
| `docs/implementation-plan.md` | 要知道每项功能的实现顺序、中途纠正与已知限制时 |
| `docs/acceptance-and-regression.md` | 要复核真实页面、查历史验收记录或升级回归时 |
| `docs/release-process.md` | 要发版、判版本号、选 dist-tag 或回退时 |
| `docs/project-memory.md` | 要查已验证的技术事实、环境事实与历史教训时 |
| `docs/research/20-phase-chronology.md` | 要查 Phase 1 到 19 的版本编年史与逐轮实测数字时 |
| `docs/research/11-agent-team-practices.md` | 要派发子代理、写派发单或定验收判据时 |
| `docs/research/18-agents-md-practices.md` | 要改本文件、判断某条规则该不该写进主文件时 |
| `CONTRIBUTING.md` | 要提交代码、写变更记录或查措辞禁用词（§7.1）与网络检索细则（§7.2）时 |
| `docs/distribution-plan.md` | 要往目录站或社区投放时 |

## 安全与审批边界

- **always do**：改完文档、推送前先 `git grep` 核对没有凭据与占位符；每次升级 DSH 后用 `--dump-config` 核对 `application: applied`；改过 `src/client/` 就走一遍真实页面验收。
- **ask first**：删除文件（先说明目的、影响与风险，优先用 `send2trash`）；发布正式版本（stable 版本必须在用户实际前端验收通过之后）；动任何端口上正在运行的进程；改 `package.json` 的依赖区间。
- **never do**：把真实 token、密钥、口令、内网地址凭据或任何凭据占位符写进仓库；在正在用的 GUI profile 上装本插件；跳过测试直接打包发布。

## 已知坑

- **Windows 沙箱禁止 named-pipe spawn**：esbuild service、Vitest/Vite 配置加载、`node --test` 默认隔离都会报 `spawn EPERM`。已用 TypeScript compiler API 与 `--test-isolation=none` 绕开，不要换回 esbuild 或默认隔离。
- **pnpm 全局 store 的 `index.db` 不可读**：`pnpm-workspace.yaml` 已把 store 指向工作区并关闭预检；若又报 SQLite 错，按 `docs/project-memory.md` §5 换调用方式（直接调 `node_modules/.bin/tsc` 等）。
- **前端只看 DOM 字符串不算验收**：会漏掉 0×0 布局缺陷，必须读 `getBoundingClientRect()` 并截图；触屏下宿主会隐藏行内 slot，入口只有菜单项。
- **exact route 返回 404**：说明路由没注册，优先怀疑 `[Service.init]` 时机拿到 `undefined`，改用 `ctx.inject`。

## 计划与决策的位置

- 决策沿革与取舍理由：`docs/project-memory.md` §2。
- 实现顺序、中途纠正与已知限制：`docs/implementation-plan.md` §2、§3。
- 发布记录与当前版本状态：`docs/release-process.md` §10；真实页面验收记录：`docs/acceptance-and-regression.md` §3。
- 一句话现状：当前版本 1.3.1-rc.5（预版本，待用户真机验收）；Phase 1 到 19 的编年史在 `docs/research/20-phase-chronology.md`，本文件不再重复。
