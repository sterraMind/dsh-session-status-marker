# dsh-session-status-marker

> 一个仓库外的独立 DSH bundle：用户手动标记会话状态，AI 自主推断状态，Client 侧用徽标 + 悬停卡展示。持久数据放在 `ctx.storageDomain`，不写任何自定义会话事件。

## 能力

- **8 种状态**：`todo` / `done` / `stopped` / `blocked` / `review` / `pending-subagent` / `awaiting-answer` / `feedback`，每个可带备注。
- **手动标记**：hover 卡一键 set / clear，或调用 `set_session_status` / `clear_session_status` 两个 model tool。
- **AI 自主推断**：`inferStatus` 观察 `turn/end`、`tool/call`、`job/settled`、`goal/change`、`user/message` 等事件，按 7 类 `autoReason` 推断；手动标记永不覆盖。
- **跨会话状态总览**：设置页 `会话状态` 按 8 状态分组、带计数、关联真实会话标题，页面内轮询自动更新（1.1.0）。
- **跨重启保留**：`storageDomain` 的 `session_status_marker.marks` 表，key = `sessionId`，与第一方 Computer Use 同意状态同一机制。
- **主题同步**：CSS Modules + `--dsw-*` tokens；侧栏徽标与状态总览用随 light / dark / system 变化的主题别名（`--dsw-alias-state-*-primary` / `--dsw-alias-bg-layer-*`）；悬停卡用 `:has([data-status-slot])` 从我们内容区覆盖宿主整卡——卡片底色变量 `--dsw-hovercard-bg` 指向 `--dsw-alias-bg-layer-2`、宿主标题/时间/状态行指向 `--dsw-alias-label-*`，浅色主题整卡变白、深色主题整卡深灰，真正跟随 DSH 主题。
- **零上下文污染**：状态是 host-side sidecar，不进 `deriveMessages()`、system prompt、tool schema 或 KV cache。

## 架构红线

仓库外 bundle **不能写自定义 `SessionEventMap` 事件**：`Session.append` 没有 `ignorable` 参数，`appendPluginRecord` 被明禁，读路径对未知 required 事件整份拒读。因此本插件用 `ctx.storageDomain` 持久化、`ctx.connection.fetch` exact route 做 Host→Client、`ctx.slots.inject` 挂 Client 组件。完整证据与取舍见 [docs/architecture.md](./docs/architecture.md) §3。

## 快速开始

```bash
pnpm run typecheck     # EXIT=0
pnpm run build         # lib/*.js + lib/client.js
pnpm run test          # 73 项 node:test 断言
pnpm pack              # 产出 dsh-session-status-marker-*.tgz
```

安装到 profile（从 GitHub Release 下载 tarball，或从源码 `pnpm pack` 产出）：

```bash
# 方式一：GitHub Release（当前 1.1.2）
# 从 https://github.com/sterraMind/dsh-session-status-marker/releases 下载
#   dsh-session-status-marker-1.1.2.tgz
# 方式二：从源码打包
pnpm pack              # 产出 dsh-session-status-marker-*.tgz

dsh plugin --profile desktop add ./dsh-session-status-marker-*.tgz
dsh --profile desktop --dump-config   # 核对 application: applied
```

npm 包：`dsh-session-status-marker`。**当前 1.1.2 尚未从 npm 公开**——发布请求已被 registry 接受，但账号使用 npm 正在限制的「绕过 2FA 的 granular token 直发」，registry 只公开了占位版本 `0.0.0-stage`。owner 在 npmjs.com 的 Staged Packages 页签用 2FA 批准后，`1.1.2` 才会出现在 npm；在那之前请用上面的 GitHub Release 安装。原因与步骤见 [CHANGELOG](./CHANGELOG.md) 1.1.2「发布」与 [项目记忆](./docs/project-memory.md) §6 教训 28。

配置（`cordis.patch.yml` 的 `config`；前三项必填，`refreshIntervalMs` 有默认值可省略）：

```yaml
- id: session-status-marker
  name: dsh-session-status-marker
  config:
    autoInfer: true
    maxNoteLength: 200
    autoExpireMs: 0
    refreshIntervalMs: 2000   # 可选，≥250；浏览器侧列表读取间隔
```

## 目录

```
src/contracts.ts  共享契约（零依赖，Browser 不能带 zod）
src/types.ts      zod 严格 schema + 编译期双向 extends 校验
src/domain.ts     defineDomain / domainTable
src/inference.ts  纯函数推断
src/service.ts    SessionStatusService（init + 4 routes + 2 tools + 观察器 + overview 分组）
src/client/       Browser apply + Badge + HoverCard + StatusOverview + locale + CSS Modules
scripts/          build-client.mjs（TS compiler API，不 spawn）
tests/            73 项 canonical 断言（.mjs）+ 薄壳 .ts
docs/             architecture / research 01..09 / 规划与验收
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
| [悬停交互调研](./docs/research/08-hover-interaction.md) | 宿主 HoverCard 契约、WCAG/Floating UI/Radix 最佳实践、语言与主题根因 |
| [状态总览设计](./docs/research/09-status-overview.md) | P0 跨会话状态总览：路由、settings.section、标题关联、测试计划 |
| [可行性与风险](./docs/feasibility-and-risks.md) | 可行性结论、风险登记、优先级 |
| [实现计划](./docs/implementation-plan.md) | 技术栈、执行顺序、中途纠正 |
| [验收与回归](./docs/acceptance-and-regression.md) | 已通过证据、待执行 smoke、升级清单 |
| [项目记忆](./docs/project-memory.md) | 决策沿革、约束、经验教训 |

## 当前状态与已知限制

当前版本 **1.1.2**，73 项测试全绿。版本沿革：

- **Phase 3**：真实 GUI 前端验收通过（侧栏徽标、悬停卡选状态、改写与清除、模型经 `set_session_status` 自主标记、连续三次重启后标记仍在）。
- **1.0.0（Phase 4）**：标记写入后无需刷新页面即可在侧栏看到（全页共享列表定时读取 + 本地写透，`refreshIntervalMs` 默认 2000ms）。
- **1.0.1 / 1.0.2**：修悬停卡配色与使用反馈——复制误触、图标边距、跨间隙命中区、8 语言字典、交互面主题响应、8 格单行。
- **1.0.3**：悬停卡表面、文字、状态色全部改为随 DSH 主题变化的 `--dsw-alias-*`（浅色卡面白、深色卡面深灰，均经真实主题管线验收）；语言与主题设置持久化问题定位为 `cordis.patch.yml` 的 UTF-8 BOM 导致 config-editor 写入被拒，移除 BOM 后跨重启保持。
- **1.1.0**：竞品评估后落地 P0 跨会话状态总览——设置页新增 `会话状态` 分区，按 8 状态分组、带计数、关联真实会话标题、页面内轮询自动更新。
- **1.1.1**（已被 1.1.2 取代）：曾把悬停卡改回「融入官方固定深色浮层」，但官方卡两主题都固定深色，浅色主题下整卡仍是黑色，未真正跟随主题。
- **1.1.2**：悬停卡用 `:has([data-status-slot])` 从我们内容区覆盖宿主整张卡——卡片底色变量 `--dsw-hovercard-bg` 指向 `--dsw-alias-bg-layer-2`，宿主标题/路径/时间/状态行指向 `--dsw-alias-label-primary/secondary`，我们面板透明、状态图标与 hover/active 全用主题别名。属性选择器在 CSS-module 构建中不被哈希，`:has()` + `!important` 只命中含我们 slot 的那张卡。真实页面验收：浅色主题整卡 `rgb(255,255,255)` 白、深色主题整卡 `rgb(44,44,46)` 深灰（以 `cardBg` light≠dark 为准），8 格单行，截图 `.drafts/shots/v112-{light,dark}-picker.png`。

全部在 dev4090 的真实 DSH 进程与页面上验证过（tarball 装载、`--dump-config` 生效、route、跨进程持久化、前端交互、明暗主题、状态总览）。截图与命令见 [验收与回归](./docs/acceptance-and-regression.md) §3。

已知限制：浏览器侧用轮询接收外部变更，不是服务端推送；ja/es/fr/de/ru/pt 的字典键集合由单测保证，未在真实页面逐语言目检；`cordis_inspect_query` 运行时自检属 Creator mode 能力，测试环境未执行；TUI 端没有 slot 体系，标记只能由 AI 工具写入并以文本呈现，UI 接入待做；桌面端与 Web 端共用同一套 slot UI；侧栏按状态过滤（宿主无过滤 slot）与批量状态操作（P1）尚未做。

## 约束

- 必须作为 out-of-tree npm bundle 加载，不修改 DSH 主仓库源码。
- 所有 DSH 相关路径从 `$DSH_HOME` / `$TEMP` 解析，仓库内不写死绝对路径。
- 遵循 DSH 工程规范：ESM、strict TS、effect-based lifecycle、declaration merging、required Config、typed locale。

## License

MIT（与 DeepSeek Harness 一致）。
