# Architecture Design · dsh-session-status-marker

> **文档版本**：v1.0.2 · 2026-11-12（对应插件 1.0.2）

> V2（最终实现版）。V1 曾计划用 `SessionEventMap` declaration merging + `TypertRemoteService`；深入读官方持久化源码后证实该方案对仓库外 bundle 是**延迟失败**：写入当场成功，重启 / resume / fork 时整份会话日志被拒读。本版记录已落地的合规架构与全部取舍依据。

## 1. 总体架构

```
┌──────────────────────────────── DSH Host Process ────────────────────────────────┐
│                                                                                  │
│  ┌────────────────────────── SessionStatusService (class Service) ──────────────┐ │
│  │ static inject = ['storageDomain', 'tools', 'connection']                     │ │
│  │ [Service.init]():                                                            │ │
│  │   ├─ ctx.storageDomain.open(MarkerDomainSpec)   ← 持久态唯一入口             │ │
│  │   ├─ ctx.tools.register(set_session_status / clear_session_status)          │ │
│  │   ├─ ctx.connection.fetch.register(3 × exact route)  ← Host→Client 通道     │ │
│  │   └─ ctx.on('session/event', ..., {global:true}) ← autoInfer 观察器         │ │
│  └───────────────┬──────────────────────┬───────────────────────┬──────────────┘ │
│                  │                      │                       │                │
│         ┌────────▼────────┐   ┌─────────▼─────────┐   ┌─────────▼────────────┐ │
│         │ storageDomain   │   │ /api/...state     │   │ inferStatus(obs)      │ │
│         │ marks table     │   │ /api/...list      │   │ 纯函数（零 DSH 依赖） │ │
│         │ key = sessionId │   │ /api/...mutate    │   │ 7 条规则 + 去重       │ │
│         └─────────────────┘   └─────────┬─────────┘   └───────────────────────┘ │
│                                         │  owner-peer 认证后的 fetch             │
└─────────────────────────────────────────┼──────────────────────────────────────┘
                                          │ HTTP (Web GUI 同源)
┌─────────────────────────────── Web Client Bundle ─┼──────────────────────────────┐
│  src/client/index.ts  apply(ctx):                  │                             │
│    ├─ ctx.locale.register(NS, {zh, en})            │                             │
│    └─ ctx.slots.inject(...) × 2                    ▼                             │
│         ├─ sidebar.session.row.trailing → SessionStatusBadge (GET state)        │
│         └─ sidebar.session.row.hover    → SessionStatusHover (GET + POST mutate)│
│  样式：CSS Modules + --dsw-* tokens；图标：Phase 1 文本占位符                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

产物：`lib/*.js`（Host，tsc）+ `lib/client.js`（Browser，`window.__ModuleLoader__.load({id, factory})`，由 `scripts/build-client.mjs` 用 TypeScript compiler API 进程内生成）。

## 2. 真实包结构（已落盘）

```
src/
  contracts.ts          # 零依赖共享契约：状态枚举、MarkRecord、STATUS_META、3 组 /api 路径
  types.ts              # zod schema（MarkRecordSchema / SetMarkBodySchema / ClearMarkBodySchema）
                        #   + 编译期双向 extends 校验 zod 推导 === contracts.ts 契约
  domain.ts             # defineDomain({name:'session_status_marker', version:1, ...})
  inference.ts          # inferStatus / shouldApplyInference / isAutoMarkExpired（纯函数）
  service.ts            # SessionStatusService：Service.init + 3 routes + 2 tools + 观察器
  index.ts              # 纯导出入口（default = SessionStatusService，供 loader 作为 class plugin 加载）
  client/
    index.ts            # Browser apply：locale.register + slots.inject × 2
    Badge.tsx           # trailing 位徽标
    HoverCard.tsx       # hover 位详情卡 + 手动 set/clear
    locales.ts          # NS='sessionStatus.marker'，zh/en key-identical
    badge.module.css / hover.module.css / css.d.ts
scripts/
  build-client.mjs      # CJS closure-factory bundle，不 spawn 子进程
tests/
  *.test.mjs            # canonical 断言（node:test + 自建 Vitest 风格 shim），37 项
  *.test.ts             # 8 行薄壳，仅 re-import .mjs
locale/en.json · icon.svg · cordis.patch.yml · package.json · pnpm-workspace.yaml
```

## 3. 关键决策与依据

### 3.1 不写自定义 `SessionEventMap` 事件（最高优先级）

`.research/dsh-repo/packages/core/session/src/index.ts:806-837` 的 `Session.append<T>(type, data, ...opts)` 中 `opts` 只有 `SurfaceIntent<T>[]`，**没有 `ignorable` 参数**；`:827-833` 构造的 envelope 也不含该字段。`:849-865` 的 `#appendRecord()` 是唯一写 `ignorable: true` 的地方，而 `.research/dsh-repo/packages/core/session/README.md:70-74` 明确写 "Plugins outside this repository must not call it either"。同时 `.research/dsh-repo/packages/session/session-persistence/src/storage-contract.ts:75-80` 在读路径无条件拒绝未知且未标记 ignorable 的事件（`SessionFormatUnsupportedError`），`.research/dsh-repo/packages/core/session/src/known-event-types.ts:15-17` 说明 out-of-repo 事件按设计不在 KNOWN 集合内。

结论：仓库外 bundle 通过 declaration merging 写 `status/mark` 会出现「写入成功、下次打开会话整份日志拒读」的**延迟失败**。把 `ignorable: true` 塞进 `data` 也无效——`types.ts:510-523` 规定它是 envelope 顶层字段。官方 `docs/architecture.zh.md:168` 的「扩展 SessionEventMap」建议只对 in-repo 包成立（`goal/change` 可行仅因它被收进 generated catalog）。

### 3.2 持久态走 `ctx.storageDomain`

`.research/dsh-repo/docs/subsystems/storage.md:5` 原文 "The storage subsystem persists everything that is not a session event log"；`.research/dsh-repo/packages/storage/storage-domain/README.md:28` 明列 "session sidecar metadata" 为其适用场景。第一方先例：`.research/dsh-repo/docs/upgrade-guide/v0.2.1-rc.2/cua-consent-storage/guide.md:12,18` 的 Computer Use 同意状态 "follows the conversation ID across DSH restart"。

实现：`defineDomain({ name: 'session_status_marker', version: 1, layout: 'per-record', invalidRecords: 'backup-and-skip', tables: { marks: domainTable<string, MarkRecord>(MarkRecordSchema) } })`，key = sessionId，同步 `get/entries` + 异步 `put/delete`（写链 backend-first，再改内存，再 `domain/changed`）。标记是 UI sidecar 数据，不进 `deriveMessages()`、不进模型上下文、不影响 KV cache。

### 3.3 放弃标准 Typert Remote，改用 `ctx.connection.fetch` exact route

Typert 需要主仓库 `scripts/generate-typert.ts` 产出 `lib/typert.host.js` 与 `lib/typert.remote-client.*`（`.research/dsh-repo/docs/subsystems/api-gateway.md:110-118`），且 Client 消费依赖生成的 `TypertRemoteNamespaceMap` merge，build fail-closed（:122-123）。独立 bundle 无法运行该生成器。

替代：`ctx.connection.fetch.register(ConnectionFetchRoute)`，接口见 `.research/dsh-repo/packages/client/connection/src/rpc.ts:146-166`（`path` 必须以 `/api` 开头，`methods: readonly ('GET'|'HEAD'|'POST')[]`，`requestBody: 'buffered'|'streaming'`，`fetch: (Request)=>Promise<Response>`）；`rpc-host.ts:122-137` 提供 owner-peer 认证围栏，非 owner 一律 403。官方先例 `.research/dsh-repo/packages/client/ui-deliverables/src/present-open.ts:20-54`。三条路径：`/api/session-status-marker.state`（GET 单条）、`.list`（GET 全部）、`.mutate`（POST set/clear）；Browser 用 `PATH.slice(1)` 的 document-relative 形式 fetch。

### 3.4 Client 挂载 trailing + hover，不用 `useProjection`

`sidebar.session.row.leading` 只在 primary state idle 时挂载且已被 schedule clock mark 占用（`.research/dsh-repo/packages/client/ui-workspace/src/client/contract/slots.ts:133-147`）；`trailing` 在 hover-capable 设备上 hover 时隐藏（:148-155），因此详情放 `hover` slot。三个 slot 的 owner props 都只有 `{ sessionId }`（:110-118），故组件自行 fetch，不依赖 projection 或 store。注册用 generator 形式的 `ctx.slots.inject(name, () => ctx.slots.register(...))`（先例 `ui-schedule/src/client/index.ts:279-293`）。`ctx.slots` 的 declaration merge 来自 `@deepseek-ai/dsh-client-ui-renderer/client`（不是 slots 包自身），这是 typecheck 一次性通过的关键。

### 3.5 Manual > Auto

`shouldApplyInference(current, proposed)`：无 current 则写 auto；current 是 manual 则永不覆盖；否则仅当 status / autoReason 变化才写。`autoInfer` 与 `maxNoteLength` 是 required Config（缺失即加载失败），`autoExpireMs` 默认一天（`DEFAULT_AUTO_EXPIRE_MS = 86_400_000`）：自动行由事件推断写入，若默认永不过期，每个跑过回合的会话都会永久带标记，「未标记」区被掏空，状态本身也就没有信息量了。列表与看板两条读路径都经 `#effectiveRows()` 应用同一份过期判定，`0` 才表示永不过期。

### 3.6 不引入 Rust（Phase 1）

见 `docs/research/05-rust-feasibility.md`：纯函数 fold 数据量是每会话一条记录，napi-rs 的构建与 ABI 成本远高于收益。

### 3.7 Client bundle 用 TypeScript compiler API 进程内构建

Windows 沙箱禁止 named-pipe spawn，esbuild service 与 Vitest/Vite 配置加载都报 `spawn EPERM`。`scripts/build-client.mjs` 用 `ts.transpileModule` 生成 CJS，外层包 `window.__ModuleLoader__.load({id, factory})`（契约见 `.research/dsh-repo/packages/client/tsdown.client.ts:932-938`），CSS Modules 由自写插件注入 `<style>`。裸 specifier 只能取 `.research/dsh-repo/packages/client/web/src/platform.ts:8-15` 的 `PLATFORM_MODULES` 白名单。测试同理改用 `node --test --test-isolation=none`。

## 4. Phase 规划与当前状态

| Phase | 内容 | 状态 |
|---|---|---|
| 1 · Core (P0) | Host service / storageDomain / 3 routes / 2 tools / autoInfer；Client badge + hover + locale；37 项单测 | **已完成**：`pnpm run typecheck` / `build` / `test` 均 EXIT=0 |
| 2 · UX (P1) | 官方 inline SVG 图标替换文本占位符；session header actions 菜单；`verify-client-ui-i18n` 全覆盖 | 待办 |
| 3 · Reliability (P2) | Host→Client 变更推送（当前靠组件挂载时 fetch）；多窗口 `domain/changed` 跨进程限制；GUI 回归 `test:gui` / `DSH_SNAPSHOT=replay test:web` | 待办 |
| 4 · Distribution | `pnpm pack` tarball、profile 安装、`--dump-config` 核 `application: applied`、`cordis_inspect_query` 运行时自检 | 待办 |

## 5. 风险清单

| 风险 | 概率 | 影响 | 缓解 / 现状 |
|---|---|---|---|
| 自定义 SessionEvent 令日志拒读 | — | 致命 | 已从设计上排除（§3.1），V1 方案作废 |
| `sessionId` 与 fork 后的子会话不共享标记 | med | med | 明确语义：标记属于原会话；fork 继承可在 Phase 2 补 |
| `domain/changed` 仅进程内（storage.md:170） | med | low | 已实现全页共享的列表定时读取（`refreshIntervalMs`，默认 2000ms）加本地写透；跨进程变更靠轮询接收 |
| exact route 路径与上游重复注册 | low | med | 用带前缀的唯一路径；`rpc-host.ts:246` 重复注册会响亮报错 |
| patch override 静默失效 | med | high | 每次升级 DSH 后 `--dump-config` 核 `application: applied` |
| pnpm 全局 store `index.db` 损坏 | high（本机） | med | `pnpm-workspace.yaml` 设 `storeDir: ./.pnpm-store` + `verifyDepsBeforeRun: false`；已验证裸命令通过 |
| esbuild / Vitest spawn EPERM | high（本机） | med | 已迁移 TS compiler API + node:test，不依赖 spawn |
| 3080 scratch 与 55101 GUI 混淆 | med | med | 文档明确区分，集成 smoke 记录精确 URL |
| `plugin_manager install_bundle` 需 danger-full-access | med | low | 开发期用 `--patch`；发布期用 tarball + profile |
| 图标为文本占位符，未达美术要求 | high | med | Phase 2 换官方 `ICON_SYMBOLS` inline SVG + `currentColor` |

## 6. 参考

调研与取舍细节见 `docs/research/01-host-api.md`（Host 扩展点）、`02-client-ui.md`（Slots / 主题 / 图标）、`03-engineering-standards.md`（装载与测试回路）、`04-session-state-taxonomy.md`（状态分类学）、`05-rust-feasibility.md`、`06-market-and-practices.md`（竞品空缺）、`07-dsh-state-surfaces.md`（官方现有状态面）。可行性 / 风险优先级、实现计划、验收与回归方案分别见 `docs/feasibility-and-risks.md`、`docs/implementation-plan.md`、`docs/acceptance-and-regression.md`。
