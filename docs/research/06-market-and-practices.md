# 06 · 竞品、市场空缺与社区最佳实践

> **文档版本**：v1.0.0 · 2026-11-11（对应插件 1.0.0）

> **外部资料来源**（所有 URL 全文引用，非官方 API 断言）；官方仓库镜像数据单独标注。
> 本文聚焦「同类产品的功能空白」与「社区最佳实践」，不对 DSH 官方行为做保证性陈述。

## 1. 竞品对照表

### Claude Code

| 特征 | Claude Code | 来源 |
|---|---|---|
| Agent View | 一屏管理多后台会话，按 working/needs input/done+failed 分组；`← 2 agents` / `← 2 done` 页脚计数 | https://code.claude.com/docs/en/agent-view |
| Task list | `TodoWrite`/`TaskCreate`/`TaskUpdate`/`TaskList`，生命周期 `Created→Activated→Completed→Removed` | https://code.claude.com/docs/en/agent-sdk/todo-tracking |
| 限制 | Task list 最多 5 项、仅终端可见、仅带 task tools 的模型默认提供；需用 `allowedTools`/`CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 开启 | 同上 |
| 状态行延迟 | debounce 300ms，只在 assistant message 完成后更新；无 in-flight 可见性；不含 active sub-agent count / tool_in_progress / thinking | https://github.com/anthropics/claude-code/issues/26375 |
| 社区诉求 | 要求在 TUI 显示 subagent 任务进度；desktop composer 统一 status stack（todos/subagents/background tasks/prompt queue 共用一个卡片） | https://github.com/NousResearch/hermes-agent/pull/44630 |
| 子代理风险 | `/btw`、`/stop` 或用户新消息打断父会话时，已完成实质工作但在总结阶段的子代理**立即被杀** | https://github.com/NousResearch/hermes-agent/issues/32851 |

### OpenAI Codex CLI

- 仅 turn 完成/需审批的终端通知（`[tui] notifications`），无 in-flight 状态
- Cursor IDE 内嵌 agent 面板，仅编辑器上下文可见

### 通用痛点（Jake Marsh, 2026-10-26 更新）

https://taskhold.com/guides/monitor-coding-agent-progress 核心观察：
> «Session views know whether a session is working or waiting. They can't tell you "step 3 of 5, 12 of 40 files migrated", because that lives in the agent's plan, not in the session.»

推荐模式（agent 主动汇报四件事）：plan(3–7 步有序)、progress(N of M + 一句当前在做)、blocked(带具体问题)、done(改了什么 + 如何验证)。
`PROGRESS.md` 方案缺陷：要打开 repo、写 BLOCKED 无通知、并行会话写同一文件、无法发现一小时前静默。
建议状态点：**Live** (≤2 min) / **Quiet** / **No word** (≥15 min)。

## 2. DSH 生态现状（存在性证据，不构成事实断言）

- www.dshdesktop.cn / www.dshdesktop.com / Composio / AI Profit Boardroom / Zima —— 均为「DSH 插件榜单」类页面，仅作生态广度证明。
- `dsh.so/docs` Plugin Development Guide —— 社区自维护文档（外部抓取成功）。
- `github.com/whyihaveyou/dsh-plugin-tutorial` / `github.com/perrylink/dsh-plugin-guide` —— 社区教程。

## 3. 社区最佳实践（martty.sh, 2026-08-23）

合格 Plugin 四条件：依赖可声明（inject）/ 能力可组合（Context 注册，Host 无须专用分支）/ 实例可隔离（独立 Fiber）/ 生命周期可逆（停用后连接、事件、界面贡献完整撤销）。

加载五层：Profile → 有序 Bundle patch layers → Loader rows → Cordis Fibers → Services/Events/Effects。
Scope 父链 `agent → preset → global` 继承能力，代价是隐式依赖 / 父层耦合 / 同名遮蔽。

动态插件 `cordis_define` 登记不可变版本 + `cordis_run` 装载，定义只留 Host 进程内存、重启不恢复；长期使用应固化成普通 package；AgentPreset 把 composition 变成可继承 standing scope。

## 4. DSH 市场空缺分析

| 维度 | 竞品/现貌 | 本插件填补（V2 实现口径） |
|---|---|---|
| 手工状态标记 | 无（仅 Claude Task list 5 项上限） | 8 个自定义状态 + 备注，hover 卡一键 set/clear，落在 `storageDomain` 跨重启保留 |
| 自动推断 | 仅 `turn/end.reason` 一种硬编码 | `inferStatus` 覆盖 interrupted / blocked / aborted / error / TodoWrite 未完成 / job failed / goal blocked / user message 共 7 类 autoReason |
| 在途可见性 | Claude debounce 300ms，无 in-flight | `ctx.on('session/event', ..., {global:true})` 同步观察 + `KvTable.put` 写链立即持久化；Client 全页共享定时读取 + 本地写透（1.0.0） |
| 跨 subagent 继承 | subagent 任务结束后若父被中断则丢失（hermes-agent #32851） | **Phase 1 明确不继承**：标记按 `sessionId` 存，fork 出的子会话无标记；继承策略待 Phase 2 决定，避免承诺未实现能力 |
| 主题同步 | 各竞品独立主题 | 基于 `--dsw-*` token + `currentColor` SVG 几何，完全跟随 light/dark/system（Phase 1 图标仍为文本占位符，Phase 2 换 SVG） |
| 一键报告 | PROGRESS.md 方案缺陷（无法发现历史静默） | `/api/session-status-marker.list` 可导出全部标记 JSON，供工具消费 |

## 5. 风险提示（外部资料层面）

- 社区教程（dsh-plugin-guide / martty.sh）可能滞后于官方最新 behavior（尤其 peer dep 范围、engines.dsh 校验冲突）。
- 所有外部 URL 均经 SSRF 过滤后由 exa web_fetch 缓存读取，可能已过时或截断。
- 实现时所有官方行为以 `.research/dsh-repo/` 为准，外部只用于需求与验收参照。
