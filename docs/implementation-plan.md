# Implementation Plan & Progress

> **文档版本**：v1.0.2 · 2026-11-12（对应插件 1.0.2）

> 本文件记录「开发框架 → 实现逻辑 → 测试验收 → 回归」的实际执行顺序、每一步的证据与当前状态。选型依据与风险见 `docs/feasibility-and-risks.md`，架构见 `docs/architecture.md`。

## 1. 技术栈选型（已落盘）

| 项 | 选型 | 依据 / 理由 |
|---|---|---|
| 语言 | TypeScript ESM（`strict: true`, `noImplicitAny`） | `.research/dsh-repo/AGENTS.md`；`src/` 全部 `.ts`/`.tsx` |
| 包管理 | pnpm + `pnpm-workspace.yaml` 工作区 store | 本机全局 store 的 `index.db` 损坏；项目级配置在 pnpm 11 从 workspace 文件读 |
| 配置 Schema | `@deepseek-ai/schemastery`（`z.natural()` 等） | `docs/user/develop/basic/config.md:9-31`；与 DSH 共享实例，放 peer + dev |
| 记录校验 | `zod 4.4.3`（与 `dsh-storage-domain` 内嵌版本对齐） | `domainTable<K,V>(schema: ZodType<V>)` 的类型必须同源 |
| Host 框架 | `@deepseek-ai/cordis` `Service` + `[Service.init]` | `packages/session/session-projection-cache/src/index.ts:105-123` 官方 class-plugin 先例 |
| 持久化 | `@deepseek-ai/dsh-storage-domain` `defineDomain` / `domainTable` | 见 architecture §3.2 |
| 工具 | `@deepseek-ai/dsh-tools` `defineTool` | `packages/core/tools/src/schema.ts:555-557` |
| Host→Client | `@deepseek-ai/dsh-client-connection` `ctx.connection.fetch.register` | `packages/client/connection/src/rpc.ts:146-166` |
| Client UI | React 18 + CSS Modules + `--dsw-*` tokens + `ctx.slots.inject` | `packages/client/AGENTS.md`；`platform.ts:8-15` 白名单 |
| Client bundle 构建 | TypeScript compiler API 进程内 `transpileModule` + `window.__ModuleLoader__.load` | Windows 沙箱禁 spawn，esbuild service 不可用 |
| 测试 | `node:test --test-isolation=none` + 自建 Vitest 风格 shim | Vitest/Vite 配置加载同样触发 esbuild spawn EPERM |
| Rust | 不引入 | 每会话一条记录，napi-rs 成本远高于收益（`docs/research/05-rust-feasibility.md`） |

## 2. 实现顺序与实际结果

| # | 步骤 | 输出 | 验证 | 状态 |
|---|---|---|---|---|
| 1 | 官方镜像与扩展点盘点 | `.research/dsh-repo/`（docs 全量 + 15 个 packages 域） | 文件:行号清单落进 `docs/research/01..07` | 完成 |
| 2 | 竞品 / 市场 / 社区最佳实践网络调研 | `docs/research/06-market-and-practices.md` | 外部 URL 全文 + 官方冲突项标注 | 完成 |
| 3 | V1 架构草案 | 初版 `docs/architecture.md` + `src/events.ts` | — | **已作废**（见下一节） |
| 4 | 逐层读官方持久化源码，发现 V1 延迟失败 | 证据链见 architecture §3.1 | `storage-contract.ts:75-80` | 完成 |
| 5 | 改走 `ctx.storageDomain` 并放弃 Typert | V2 `docs/architecture.md` | `cua-consent-storage/guide.md` 先例 | 完成 |
| 6 | 共享契约 + zod schema + domain spec + 纯推理函数 | `src/contracts.ts` / `types.ts` / `domain.ts` / `inference.ts` | 编译期双向 extends 校验 | 完成 |
| 7 | Host Service：`init` + 3 routes + 2 tools + autoInfer 观察器 | `src/service.ts` / `index.ts` | `pnpm run typecheck` | 完成 |
| 8 | Client half：locale + trailing badge + hover card + CSS Modules | `src/client/*` | `pnpm run typecheck` | 完成 |
| 9 | Client bundle 构建脚本（不用 esbuild） | `scripts/build-client.mjs` → `lib/client.js` | `node --check lib/client.js` | 完成 |
| 10 | 测试环境：37 项断言 | `tests/*.test.mjs` + shim | `pnpm run test` 37/37 | 完成 |
| 11 | 文档修订（V1 结论 → V2） | 本文件 + 其余 docs | 一致性 grep | ✅ 完成 |
| 12 | 集成 smoke / `pnpm pack` / GUI 回归 | `docs/acceptance-and-regression.md` §3–§5 | `pnpm pack` tarball 内容核对通过 | Phase 4 待真实环境 |

## 3. 中途纠正（保留决策过程，不作废记录）

- **V1 假设**：`SessionEventMap` 是 merge-extensible，插件可以 declaration merging 追加 log-only 事件（`docs/subsystems/session.md:755-761` 的 in-repo 语义）。
- **证伪**：`Session.append` 签名没有 `ignorable` 参数、envelope 不含该字段；`ignorable` 是顶层字段，塞进 `data` 无效；读路径对未知 required 事件 fail-closed。V1 草稿里的 `src/events.ts` 因此被删除。
- **V2 决策**：`ctx.storageDomain` 存 sidecar，`ctx.connection.fetch` 做 Host→Client，`ctx.slots.inject` 挂 UI。选它的**原因**是官方明确把「session sidecar metadata」划给 storage 子系统，且有跨重启先例。
- **Typert 放弃原因**：生成物由主仓库脚本产出且 Client 侧 build fail-closed，out-of-tree 无法复现；exact route 有 `ui-deliverables` 的第一方先例与完整认证围栏。
- **测试栈替换原因**：Windows 沙箱禁止 named-pipe spawn，esbuild / Vitest 配置加载均 `spawn EPERM`；改为进程内 TS compiler API + `node --test --test-isolation=none`。

## 4. 已知限制（截至 Phase 4 / 1.0.0）

1. 图标已替换为官方 glyph id 对应的 inline SVG（`src/client/icons.ts` 用 `glyph()` 统一注入 `width/height/viewBox/aria-hidden`），但 SVG 是手抄的简化路径，不是 `ICON_SYMBOLS` 的逐字节副本；后续若要完全一致，需要把 `ui-primitives/src/icons/artwork.ts` 的对应条目直接引入。
2. `domain/changed` 只进程内推送（`storage.md:170`）：改为全页共享的列表定时读取（`Config.refreshIntervalMs`，默认 2000ms）加本地写透，最坏延迟一个读取周期；这是轮询，不是服务端推送，代价是每周期一次轻量 GET。
3. 标记按 `sessionId` 存储，fork 出的子会话不自动继承。
4. `leading` slot 只在 idle row 渲染且被 schedule mark 占用，故徽标固定放 `trailing`、详情放 `hover`。
5. `cordis_inspect_query` 运行时自检未执行（属 Creator mode 能力）；替代证据是真实页面对三条 route 的直接调用与 GUI 交互，见 `docs/acceptance-and-regression.md` §3.4。
6. TUI 端无 slot 体系，标记只能由 AI 工具写入并以文本呈现，需另做 UI 接入；桌面端与 Web 端共用同一套 slot UI。
7. 真实页面上才暴露的三个缺陷（route 未注册、图标键不匹配、未标记会话无选择入口与图标 0×0）说明：只跑 typecheck 与 DOM 字符串断言不足以验收前端，必须读几何或截图。对应回归断言已加进 `tests/i18n.test.mjs` 与 `tests/theme.test.mjs`。
