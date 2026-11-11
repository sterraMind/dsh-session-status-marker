# 05 · Rust 可行性预研

> **文档版本**：v1.0.0 · 2026-11-11（对应插件 1.0.0）

> **V2 修订**：本文结论（不引入 Rust）不变，但 workload 描述基于 V1 的「SessionEvent fold / projection / Typert Remote」草案，已按 V2 实现（`storageDomain` + 纯函数推断 + `ctx.connection.fetch`）更新。

## 1. 问题域（V2 实际 workload）

- `inferStatus(observation)`：纯函数，每事件 O(1)，零 DSH 依赖（`src/inference.ts`）
- `KvTable.put/get/delete`：host-side 内存读写 + backend durability（`storageDomain` 写链）
- `ctx.connection.fetch` exact route：同源 HTTP GET/POST，owner-peer 认证
- Client UI render：React tree diffing + `fetch()` 拉取标记
- `defineTool` execution：等待参数校验与一次 storage 写入
- `ctx.on('session/event', ...)`：进程内同步广播观察

规模：**每会话一条 `MarkRecord`**，不是逐事件累积的日志 fold。

## 2. Rust 可介入的点

| 点 | 当前实现语言 | Rust 收益 | Rust 成本 |
|---|---|---|---|
| `inferStatus` 纯函数 / 状态去重 | TS 同步纯函数 | 无类型安全改进（TypeScript `strict` 已 cover）；微秒级计算，零拷贝收益可忽略 | 高（FFI + serde 双向序列化） |
| `fetch` route batching | TS async/await | 批请求可减少 round-trip，但路径是浏览器同源 fetch + Host `Request`→`Response`，Rust 侧需自实现 HTTP 层 | 极高 |
| Plugin host 扩展 | Cargo workspace 外挂 | 可通过 napi / neon 暴露 Native addon；但破坏 HMR、破坏 `pnpm` bundle 构建链 | 极高 |
| Config / 记录校验 | schemastery + zod (TS) | 已有 TS implementation；Rust serde 等价 | 重复劳动 |

## 3. 约束

- DSH 官方打包版是 Electron + Node.js 宿主；所有插件以 **TypeScript ESM** 编译后加载进 Node 进程。
- `ctx.storageDomain`、`ctx.connection.fetch`、`ctx.tools.register` 均为 TS 接口，Node 运行时无法用 Rust FFI 直接替换。
- `build:artifacts`、`test:gui`、`DSH_SNAPSHOT=replay test:web` 全链路依赖 TS 产物结构。
- out-of-tree plugin 必须兼容宿主进程 Node version（本机 v26.13.0；package.json 声明 `>=24.9.0`），NAPI 版本匹配繁琐。
- 本机 Windows 沙箱禁止 named-pipe spawn，任何需要额外编译/子进程的工具链（含 esbuild）都已实测失败；cross-compile native addon 更不可行。

## 4. 结论

**本轮不引入 Rust**。原因：

1. 性能瓶颈不在状态推断（每会话一条记录的 O(1) 纯函数）而在 HTTP round-trip 与 React render；
2. Rust 引入会破坏「热重载开发回路」这一核心诉求，且与本机已验证的纯 TS 构建链冲突；
3. 未来若真有重型计算需求（如大规模 log replay / diff），应先在 Node 侧 profile，再决定是否 native。

如果后续真要走 Rust，推荐路径：

- 通过 `napi-rs` 暴露一个 `infer_batch(observations)` 之类 pure function 作为 Host tool；
- 宿主 JS 负责 event stream 与 storage，Rust 只做批量计算；
- 但这是后证明确有需求的阶段，不在本项目 Phase 1 内。

## 5. 已验证的替代（V2 实测）

不需要 native 加速也能满足性能与工程约束：Host 用 `tsc` 直出 `lib/*.js`；Client bundle 用 TypeScript compiler API 进程内 `transpileModule` 生成（不用 esbuild，规避 `spawn EPERM`）；测试用 `node --test --test-isolation=none`。`pnpm run typecheck` / `build` / `test` 三条命令均 EXIT=0。
