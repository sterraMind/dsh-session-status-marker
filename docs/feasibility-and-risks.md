# Feasibility, Risk & Priority Assessment

> **文档版本**：v1.0.2 · 2026-11-12（对应插件 1.0.2）

> 评估对象：仓库外独立 npm bundle `dsh-session-status-marker`，目标 DSH `0.2.2-rc.1`。评估依据为 `.research/dsh-repo/` 官方镜像（文件:行号）与本机实测；外部网页只用于竞品对照。

## 1. 可行性结论

**可行，且 Phase 1 已实现并通过验证。** 三个核心能力都有官方合规接缝：

| 需求 | 官方接缝 | 依据 |
|---|---|---|
|  durable 会话标记 | `ctx.storageDomain.open(defineDomain(...))` | `.research/dsh-repo/docs/subsystems/storage.md:5`；`packages/storage/storage-domain/README.md:28`；先例 `docs/upgrade-guide/v0.2.1-rc.2/cua-consent-storage/guide.md:12,18` |
| 手动标记（Client） | `ctx.slots.inject('sidebar.session.row.hover', ...)` + `ctx.connection.fetch` exact route | `packages/client/ui-workspace/src/client/contract/slots.ts:156-170`；`packages/client/connection/src/rpc.ts:146-166` |
| AI 自主标记 | `defineTool` × 2 + `ctx.on('session/event', ..., {global:true})` | `packages/core/tools/src/schema.ts:555-557`；`docs/subsystems/session.md:1390-1400` |
| 主题同步图标 | CSS Modules + `--dsw-*` tokens + `currentColor` | `packages/client/ui-theme/README.md:28-48`；`docs/web-styling.md` |

**不可行并已排除的两条路径**（详见 `docs/architecture.md` §3.1 / §3.3）：

1. 自定义 `SessionEventMap` 事件：`Session.append` 无 `ignorable` 参数（`packages/core/session/src/index.ts:806-837`），out-of-tree 调用 `appendPluginRecord` 被明确禁止（`packages/core/session/README.md:70-74`），而 `packages/session/session-persistence/src/storage-contract.ts:75-80` 对未知 required 事件在读路径无条件抛 `SessionFormatUnsupportedError`。这是**写入成功、重启拒读**的延迟失败，风险等级最高。
2. 标准 Typert Remote：需主仓库 `scripts/generate-typert.ts` 生成 5 个产物（`docs/subsystems/api-gateway.md:110-123`），独立 bundle 无法运行；Client 侧生成的 namespace merge 是 build fail-closed。

## 2. 风险登记（按影响排序）

| # | 风险 | 触发条件 | 影响 | 概率 | 缓解措施 | 当前状态 |
|---|---|---|---|---|---|---|
| R1 | 自定义 SessionEvent 令整份日志拒读 | 误用 V1 设计 | 数据不可用 | — | 架构层排除；`src/events.ts` 已删除 | 已消除 |
| R2 | `domain/changed` 只进程内推送 | 多窗口 / 跨进程 | UI 不自动刷新 | 中 | 全页共享定时读取 + 本地写透（1.0.0 已实现）；`storage.md:170` 记录为已知限制 | 已实现 |
| R3 | exact route 与上游路径冲突 | DSH 升级 | 启动失败 | 低 | 唯一前缀 `session-status-marker.*`；`rpc-host.ts:246` 重复注册响亮报错 | 已缓解 |
| R4 | patch override 静默失效 | 上游删行/改名 | 插件看似装好实际没挂 | 中 | 每次升级跑 `--dump-config` 核 `application: applied` | 待执行（发布期） |
| R5 | `sessionId` 跨 fork 语义 | 用户 fork 会话 | 子会话无标记 | 中 | 明确文档化「标记属原会话」；Phase 2 可补继承 | 已文档化 |
| R6 | 自动推断误判 | `turn/end reason` 复杂 | 错误标记 | 中 | 仅 3 类 reason 触发；manual 永不覆盖；`autoInfer` 默认由 Config 显式决定 | 单测覆盖 |
| R7 | 图标未达美术要求 | Phase 1 文本占位符 | 视觉不统一 | 高 | Phase 2 换官方 `ICON_SYMBOLS` inline SVG | 待办 |
| R8 | 本机 pnpm 全局 store 损坏 | `pnpm run` | 命令失败 | 高（本机） | `pnpm-workspace.yaml` 工作区 store + 关闭预检 | 已验证通过 |
| R9 | 沙箱禁止 spawn | esbuild / Vitest | 构建测试失败 | 高（本机） | TS compiler API + `node --test --test-isolation=none` | 已验证通过 |
| R10 | `plugin_manager install_bundle` 需 danger-full-access | 会话内安装 | 审批摩擦 | 中 | 开发期 `--patch`；发布期 tarball | 待执行 |
| R11 | `engines.dsh` 说法冲突 | 社区文档称不校验 | 版本错配 | 低 | 以官方 `docs/tool-catalog.md:58-122` 为准：不满足会阻止安装与激活 | 已按官方声明 |

## 3. 优先级

| 优先级 | 交付 | 理由 | 状态 |
|---|---|---|---|
| **P0** | 合规持久化 + 手动 set/clear + AI 工具 + 徽标显示 + 单元测试 | 没有这几项功能不成立；R1 必须先消除 | 完成（37 项测试全绿） |
| **P1** | 官方 SVG 图标、hover 详情完善、i18n 全量校验、状态切换菜单 | 用户明确要求「图标风格化、与 DSH 统一、同步主题」 | 待办（图标当前为文本占位符） |
| **P2** | Host→Client 变更推送、fork 继承策略、GUI 回归 `test:gui` / `DSH_SNAPSHOT=replay test:web` | 可靠性与视觉回归，需要主仓库 context | 待办 |
| **P3** | Rust 加速 | 见 `docs/research/05-rust-feasibility.md`：每会话一条记录，native addon 成本远高于收益 | 不做（保留评估） |

## 4. 前置假设与验证状态

- 假设：插件作为 out-of-tree npm bundle 安装，不改 DSH 主仓库源码。已通过 `package.json` 的 `dsh.bundle.patch` + `dsh.client` manifest 落地。
- 假设：registry 上的 `@deepseek-ai/dsh-*` `0.2.2-rc.1` 与本机打包版同源。已通过安装真依赖 + typecheck 验证（非 mock）。
- 假设：Web GUI 的 Browser bundle 消费 `exports['./client']` 的已构建产物。已由 `scripts/build-client.mjs` 产出 `lib/client.js` 并 `node --check` 通过。
- 未验证：真实 DSH 进程内装载（`--dump-config` / `cordis_inspect_query`）、`pnpm pack` tarball、GUI 视觉回归。这三项列入 `docs/acceptance-and-regression.md`。
