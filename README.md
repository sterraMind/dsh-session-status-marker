# dsh-session-status-marker

> 一个仓库外的独立 DSH bundle：用户手动标记会话状态，AI 自主推断状态，Client 侧用徽标 + 悬停卡展示。持久数据放在 `ctx.storageDomain`，不写任何自定义会话事件。

## 能力

- **8 种状态**：`todo` / `done` / `stopped` / `blocked` / `review` / `pending-subagent` / `awaiting-answer` / `feedback`，每个可带备注。
- **手动标记**：hover 卡一键 set / clear，或调用 `set_session_status` / `clear_session_status` 两个 model tool。
- **AI 自主推断**：`inferStatus` 观察 `turn/end`、`tool/call`、`job/settled`、`goal/change`、`user/message` 等事件，按 7 类 `autoReason` 推断；手动标记永不覆盖。
- **跨重启保留**：`storageDomain` 的 `session_status_marker.marks` 表，key = `sessionId`，与第一方 Computer Use 同意状态同一机制。
- **主题同步**：CSS Modules + `--dsw-*` tokens，跟随 light / dark / system；`done` 用官方 `--dsw-alias-state-done-primary`。
- **零上下文污染**：状态是 host-side sidecar，不进 `deriveMessages()`、system prompt、tool schema 或 KV cache。

## 架构红线

仓库外 bundle **不能写自定义 `SessionEventMap` 事件**：`Session.append` 没有 `ignorable` 参数，`appendPluginRecord` 被明禁，读路径对未知 required 事件整份拒读。因此本插件用 `ctx.storageDomain` 持久化、`ctx.connection.fetch` exact route 做 Host→Client、`ctx.slots.inject` 挂 Client 组件。完整证据与取舍见 [docs/architecture.md](./docs/architecture.md) §3。

## 快速开始

```bash
pnpm run typecheck     # EXIT=0
pnpm run build         # lib/*.js + lib/client.js
pnpm run test          # 37 项 node:test 断言
pnpm pack              # 产出 dsh-session-status-marker-*.tgz
```

安装到 profile：

```bash
dsh plugin --profile desktop add ./dsh-session-status-marker-*.tgz
dsh --profile desktop --dump-config   # 核对 application: applied
```

配置（`cordis.patch.yml` 的 `config`，三个字段都必填、无硬编码默认值）：

```yaml
- id: session-status-marker
  name: dsh-session-status-marker
  config:
    autoInfer: true
    maxNoteLength: 200
    autoExpireMs: 0
```

## 目录

```
src/contracts.ts  共享契约（零依赖，Browser 不能带 zod）
src/types.ts      zod 严格 schema + 编译期双向 extends 校验
src/domain.ts     defineDomain / domainTable
src/inference.ts  纯函数推断
src/service.ts    SessionStatusService（init + 3 routes + 2 tools + 观察器）
src/client/       Browser apply + Badge + HoverCard + locale + CSS Modules
scripts/          build-client.mjs（TS compiler API，不 spawn）
tests/            37 项 canonical 断言（.mjs）+ 薄壳 .ts
docs/             architecture / research 01..07 / 规划与验收
```

## 文档

| 文档 | 内容 |
|---|---|
| [架构设计](./docs/architecture.md) | V2 最终架构、关键决策、Phase 规划、风险 |
| [Host 扩展点](./docs/research/01-host-api.md) | 官方 API 全景 + V2 勘误 |
| [Client UI](./docs/research/02-client-ui.md) | Slots / 主题 / 图标 / locale |
| [工程规范](./docs/research/03-engineering-standards.md) | 装载顺序、测试回路、依赖选型 |
| [状态分类学](./docs/research/04-session-state-taxonomy.md) | 8 状态语义、推断规则、schema |
| [Rust 预研](./docs/research/05-rust-feasibility.md) | 不引入 Rust 的依据 |
| [竞品与市场](./docs/research/06-market-and-practices.md) | 同类产品特色 / 痛点 / 空缺 |
| [官方状态面](./docs/research/07-dsh-state-surfaces.md) | DSH 现有状态机制清单 |
| [可行性与风险](./docs/feasibility-and-risks.md) | 可行性结论、风险登记、优先级 |
| [实现计划](./docs/implementation-plan.md) | 技术栈、执行顺序、中途纠正 |
| [验收与回归](./docs/acceptance-and-regression.md) | 已通过证据、待执行 smoke、升级清单 |
| [项目记忆](./docs/project-memory.md) | 决策沿革、约束、经验教训 |

## 当前状态与已知限制

当前版本 **1.0.2**，66 项测试全绿。开发与验收过程：Phase 3 完成真实 GUI 前端验收；Phase 4（1.0.0）让标记写入后无需刷新页面即可在侧栏看到（全页共享的列表定时读取 + 本地写透）；1.0.1 修掉浅色主题下悬停浮层不可读的配色缺陷；1.0.2 修掉五项使用反馈里的问题。全部在 dev4090 的真实 DSH 进程与真实页面上验证过：tarball 装载、`--dump-config` 生效、三条 route、跨进程持久化、侧栏标记、hover card 选择状态、改写与清除、连续三次重启后标记仍在、模型通过 `set_session_status` 自主标记。截图与命令见 [验收与回归](./docs/acceptance-and-regression.md) §3。

五项反馈对应的修复：

| 反馈 | 修复 |
|---|---|
| 点悬停卡上的按钮却返回「已复制」 | 内容区根节点接管 `onClick` 与 `onKeyDown` 并 `stopPropagation()`，不再冒泡到官方 HoverCard 的复制处理器 |
| 图标没有边距 | 格子 22px `border-box` + 2px 内边距 + 2px 间距 = 190px，稳定单行，16px SVG 四周有留白 |
| 鼠标挪开就点不到 | 内容区根节点加 `::before` 透明命中区，覆盖锚点到浮层的 8px 间隙，指针经过即取消关闭宽限 |
| 语言没有同步 | 字典补齐到 Shell 全部 8 种语言（此前只有 zh/en，其余按 `FALLBACK_LOCALE` 回退英文） |
| 主题没有同步 | 格子与按钮的悬停/选中底色改用随主题变化的 `--dsw-alias-tooltip-key-bg`；文字与状态图标保持静态色板（官方悬停浮层两个主题都固定深色） |

已知限制：浏览器侧用轮询（`refreshIntervalMs`，默认 2000ms）接收外部变更，不是服务端推送；dev4090 的 Host 语言配置不落盘，因此真实页面只验证到切换瞬间生效、无法验持久化后的非中文界面（字典键集合由单测保证）；`cordis_inspect_query` 运行时自检属 Creator mode 能力，测试环境未执行；TUI 端没有 slot 体系，标记只能由 AI 工具写入并以文本呈现，UI 接入待做；桌面端与 Web 端共用同一套 slot UI。

## 约束

- 必须作为 out-of-tree npm bundle 加载，不修改 DSH 主仓库源码。
- 所有 DSH 相关路径从 `$DSH_HOME` / `$TEMP` 解析，仓库内不写死绝对路径。
- 遵循 DSH 工程规范：ESM、strict TS、effect-based lifecycle、declaration merging、required Config、typed locale。

## License

MIT（与 DeepSeek Harness 一致）。
