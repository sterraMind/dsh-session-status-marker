# 分发与发布计划

> 本文件把 `docs/research/14-distribution-and-positioning.md` 的调研结论落成可执行动作。调研给的是渠道与空缺的事实，这里给的是「谁、在哪个渠道、做什么、做到什么算完成」。
>
> 数据截至 2026-11-20。渠道数字来自该调研实拉，仓库指标来自 npm 与 GitHub 实际读取。

## 1. 现状一句话

功能差异点在「按工作状态分组查看全部会话 + 智能体主动标记」，渠道覆盖不足：仓库话题为空、四个目录站一个都没提交、社区内容零投放。当前下载量 804/30 天，同类头部 18,263/30 天（`docs/research/14-distribution-and-positioning.md` §2），差距主要来自曝光，不在功能。

## 2. 已完成

| 动作 | 状态 | 证据 |
|---|---|---|
| 仓库加 `dsh-plugin` 等 8 个话题 | 已完成 2026-11-20 | `gh api repos/sterraMind/dsh-session-status-marker/topics` 返回 `deepseek-harness / dsh / dsh-plugin / plugin / productivity / session-management / status / typescript` |
| README 面向使用者重写、补三张真实截图 | 已完成（1.1.3 / 1.1.5） | `README.md` |
| 插件元数据 8 语言（`locale/*.json`） | 已完成（1.2.3-rc.1） | 官方「插件」页读 `meta.title` / `meta.description` |
| npm 发布链路 + `engines.dsh` 预发布比较器 | 已完成（1.2.1 起） | `docs/project-memory.md` 教训 33 |
| 悬停卡、状态总览、行内入口三处真实页面验收 | 已完成 | `docs/acceptance-and-regression.md` §3.13–§3.23 |

## 3. 待执行：目录站提交（P0，按门槛从低到高）

按「先能被发现、再被验证」排序。每一步的完成判据是目录详情页可访问且条目状态为已收录/已验证，不是提交表单返回成功。

| 顺序 | 渠道 | 提交入口 | 需要准备 | 完成判据 |
|---|---|---|---|---|
| 1 | dsh.so（安全扫描 + 沙盒实测） | `https://www.dsh.so/zh/submit`，粘贴仓库地址或 npm 包名 | 公开仓库、README 安装说明、SPDX 许可证、`dsh` 字段、`dsh-plugin` 话题 | 目录页出现条目，扫描无阻断项，沙盒安装通过 |
| 2 | dsh-plugin.org（人工审核 + 定期刷新） | `https://dsh-plugin.org/submit` | 11 类分类选 `Sessions & Msg`、兼容性说明（DSH `>=0.2.2-rc.1 <0.3.0`）、许可证 | 条目生成并出现在 Sessions & Msg 分类 |
| 3 | dshbase.com（L1–L4 实测分级） | 收录靠话题自动发现，标「已验证」走其测试版本 | 在其实测的 DSH 版本上跑通 L1 安装 / L2 加载 / L3 headless / L4 Web CDP | 条目状态从「已收录未实测」变成「已验证」 |
| 4 | dshworks/awesome-dsh-plugins | GitHub PR | 每个条目带被证明可安装的文件路径 + 校验过的 DSH 版本 | PR 合并 |
| 5 | walkinglabs/awesome-deepseek-harness-plugins | GitHub PR | 源码级 DSH 验证说明 + 兼容版本声明 | PR 合并 |
| 6 | awesome-dsh-plugin 索引 | 自动雷达 + 定时 PR；字段错误用 issue 更正 | 公开仓库 + 话题 + `dsh.bundle.patch`（已具备） | 条目分类正确（`session`），描述与仓库一致 |

前置检查（提交前一次性做完）：`package.json` 的 `description` 与 `locale/*.json` 的 `meta.description` 一致；`LICENSE` 为 MIT；README 有「安装 / 配置 / 截图」三节；仓库 homepage 指向 README。

## 4. 待执行：社区内容（P1，等 1.3.0 正式版）

只在正式版发布后投放，避免用户装到 rc 遇到未定稿行为。三个渠道各发一次，内容复用同一条主线，语气按平台改。

| 渠道 | 形式 | 主线 | 注意 |
|---|---|---|---|
| X | 一条带两张截图的短帖（浅色悬停卡 + 状态总览） | 会话多到分不清哪些在等回复；给会话标 8 种工作状态，侧栏和设置页按状态看全部 | 不堆功能清单，一张图说一件事 |
| 知乎「DeepSeek Harness 插件」相关问题下回答 | 600–900 字 + 安装命令 | 从「未标记会话」痛点切入，给安装与最短使用路径 | 不写内部实现术语（`sidecar`、exact route 这类），链接指向 README |
| V2EX / 小红书 | 一段可复制的安装说明 + 截图 | 同上 | V2EX 发在合适的节点；小红书用「3 步装好」的图文 |

内容纪律：禁用夸张词（「神器」「彻底解决」），不承诺未实现的能力（批量改状态、侧栏过滤仍是待办，见 `docs/project-memory.md` §7）；每条内容都带可点击的 npm 或 GitHub Release 链接。

## 5. 时间线（绑定 1.3.0）

| 阶段 | 触发条件 | 动作 |
|---|---|---|
| A | 用户验收 `1.3.0-rc.3` 通过 | 转正式版 `1.3.0`：`latest` 切到 1.3.0、GitHub Release 去 prerelease 标记、写验收记录 |
| B | 正式版发布当天 | 目录站按 §3 顺序提交（1–3 当天，4–6 一周内） |
| C | 目录收录后 1 周 | 社区内容投放（§4），每条带 UTM 化链接便于统计 |
| D | 投放后 2 周 | 复盘：npm 周下载、GitHub star、issue 类型；低于基线就换内容角度，不动功能 |

基线：投放前 npm 近 30 天下载 804，GitHub star 以投放当天读数为准。

## 6. 不做的事

- 不刷榜、不买 star、不在目录站重复提交同一条目。
- 不为曝光加功能；路线图里未完成的项（批量改状态、侧栏过滤、TUI 接入）按 `docs/release-process.md` §10 的节奏走，不因为发布计划提前。
- 不在社区内容里宣称与竞品的对比结论；差异点只描述自己做了什么。

## 7. 指标

| 指标 | 读取方式 | 目标（投放后 2 周） |
|---|---|---|
| npm 周下载 | `https://api.npmjs.org/downloads/point/last-week/dsh-session-status-marker` | 从 804/30 天提升到周下载 ≥ 300 |
| GitHub star | `gh repo view --json stargazerCount` | 投放当天基线上浮 ≥ 30 |
| 目录收录数 | 各目录详情页 | 6 个渠道至少 4 个收录 |
| 安装后留存信号 | issue / 讨论区提问内容 | 出现功能类问题而非安装类问题（说明装得上） |
