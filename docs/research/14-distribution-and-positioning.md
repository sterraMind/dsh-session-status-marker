# 14 · 分发渠道与产品定位调研

> **文档版本**：v1.0.0 · 最后更新：2026-11-20（对应插件 1.2.3）

> 本文件盘点 DSH 插件的市场、平台与社区分发渠道，实测同类插件市场格局，给出竞品空缺与后续迭代方向。
> 数据分为两类：一类是本次实际拉取并统计的索引数据与 npm 下载数据，另一类来自公开渠道页面。凡未取得的数据一律标注「未取得」。

---

## 1. 范围与方法

### 1.1 调研范围

1. **本插件的分发现状**：已发布到 npm（`dsh-session-status-marker@1.2.3`）与 GitHub Release，是否进入社区索引。
2. **社区分发渠道**：官方插件机制之外的聚合目录站、GitHub 话题、第三方市场应用、社区讨论区。
3. **同类插件市场格局**：从索引数据统计总条目、分类分布、状态类目条目。
4. **竞品空缺与迭代方向**：结合竞品数据给出可执行的迭代建议。

### 1.2 方法与数据来源

| 动作 | 工具与方法 | 结果 |
|---|---|---|
| 拉取索引 | Node fetch（`NODE_USE_ENV_PROXY=1` 走本机代理）GET `https://awesome-dsh-plugin.com/plugins.json` | HTTP 200，约 15.5 MB 文本，条目数 12,203 |
| 统计分类与条目 | 本地 Node 脚本解析 JSON，按 `category` 分组，按名字与描述筛选状态/标记/标签类 | 23 个分类，状态类候选 35 条，见 §3 |
| 校验本插件是否在索引 | 在 `name`/`npm`/`description` 字段检索 `session-status-marker`/`status-marker` | 命中 0 条，确认本插件不在索引 |
| npm 下载量 | `https://api.npmjs.org/downloads/point/last-month/<pkg>` 与 `registry.npmjs.org` | 见 §3.4 |
| 渠道页面正文 | Node fetch 抓取 `dsh-plugin.org`、`dsh.so`、`dshbase.com` 的提交页与说明页 | 取得提交方式与收录口径 |
| 社区讨论 | GitHub/Reddit/V2EX/知乎 平台检索 | 部分取得，Reddit 正文接口 403 |

临时脚本与抓取产物放在 `%TEMP%\.drafts\ops-plan\`（本机 `%TEMP%` 实际为 `R:\Temp`）。

### 1.3 关于输入文件缺失的说明

任务书要求阅读 `docs/research/07-competitive-session-managers.md`，但该文件在仓库中不存在。`docs/research/` 目录下只有 `07-dsh-state-surfaces.md`（会话状态表面清单），没有竞品分析文件。仓库里对 `07-competitive-session-managers.md` 的引用只出现在 `CHANGELOG.md:209` 与 `docs/research/09-status-overview.md:7` 两处文字里。

因此本文件的竞品结论采用两个来源：一是任务书直接给出的三条已知事实（dream12347 115★ / hkkz9522 112★ / TOBYCAI 39★，全在「生命周期 + 注意力 + 组织」赛道）；二是本次实测索引与 npm 数据。实测星数与任务书给的数字略有出入（见 §3.4），已在表中并列标注，以实测为准。

---

## 2. 现有分发渠道盘点

DSH 官方提供插件安装机制（`dsh plugin add` 或从 npm 安装），但官方面向「发现」的页面对插件元数据的读取有限。真正的分发与曝光发生在社区目录站、第三方市场应用与 GitHub 话题，生态碎片化明显。下表列出已核实的渠道。

| 渠道 | 入口 URL | 提交方式 | 门槛 | 曝光量级 |
|---|---|---|---|---|
| npm registry | `https://www.npmjs.com/package/dsh-session-status-marker` | 自助发布 `npm publish` | 有 npm 账号与包名；DSH 版本兼容区间写对（`engines.dsh` 需带预发布比较器） | 全量安装兜底。本插件近 30 天下载 804；同类头部 18,263 |
| GitHub 话题 `dsh-plugin` | `https://github.com/topics/dsh-plugin` | 自助，给仓库加 Topic | 仓库公开 + 加 `dsh-plugin` 话题 + `package.json` 声明 `dsh.bundle.patch` | 话题页是多数目录的抓取源；dsh-plugin.org 称已确认收录 26,589 个仓库 |
| awesome-dsh-plugin.com 索引（用户桌面 `dshmarket` 用的就是它） | `https://awesome-dsh-plugin.com/` ；索引 `https://awesome-dsh-plugin.com/plugins.json` | 自动雷达 + 定时 PR；字段错误用 issue 更正 | 公开仓库 + `dsh-plugin` 话题 + `dsh.bundle.patch` + 提交引用的 patch 文件 | 索引 12,203 条、23 分类；配套市场 `dsh-market` 13,000★、累计下载 130 万 |
| dsh-plugin.org（Plugin Hub） | `https://dsh-plugin.org/` ；提交 `https://dsh-plugin.org/submit` | 表单/PR，人工审核后自动生成条目并定期刷新 | 公开仓库、`dsh-plugin` 话题、README 安装说明、许可证、11 类分类之一、兼容性说明 | 实时索引 26,589 仓库；Sessions & Msg 类 2,094、Tools 9,285、UI 3,998 |
| dsh.so（安全扫描 + 沙盒安装实测） | `https://www.dsh.so/zh/` ；提交 `https://www.dsh.so/zh/submit` | 粘贴仓库地址或 npm 包名，自动扫描后以 Issue 归档审核 | DSH 兼容信号（`dsh` 字段 / cordis manifest / `dsh-plugin` 话题）、README 安装说明、SPDX 许可证、包名符合 `^[a-z0-9]+(-[a-z0-9]+)*$`、源码可扫描、无阻断级安全发现 | 收录 32,151 个插件，31,684 已扫描、29,562 沙盒装过、21,694 真跑通 |
| dshbase.com（中文教程站 + 已验证目录） | `https://dshbase.com/zh/` | 索引自动 + L1–L4 实测分级 | 标注 `dsh-plugin` 话题即可被发现；标「已验证」需在其测试 DSH 版本上跑通 L1 安装 / L2 加载 / L3 headless / L4 Web CDP | 收录 26,846 个插件，其中 7,886 已验证、8,294 已收录未实测 |
| dshworks/awesome-dsh-plugins（开放数据登记库） | `https://github.com/dshworks/awesome-dsh-plugins` | PR | 每个条目需带被证明可安装的文件路径与校验过的 DSH 版本 | 36,924 条、22,269 位作者、17 个功能区 |
| walkinglabs/awesome-deepseek-harness-plugins | `https://github.com/walkinglabs/awesome-deepseek-harness-plugins` | PR | 需满足源码级 DSH 验证政策，须声明兼容版本，仅靠 `dsh-` 名或话题不算 | 策展清单，量级小于全量目录，但筛选更严 |
| 社区讨论区（Reddit / 知乎 / V2EX） | `https://www.reddit.com/r/DeepSeek/`、`https://zhuanlan.zhihu.com/`、`https://www.v2ex.com/` | 自助发帖/投稿 | 无技术门槛，靠内容质量与话题热度 | 波动大；本次检索到 Reddit r/DeepSeek 有 awesome-dsh-plugin 与「从对话里找并安装插件」等帖子 |

**渠道判断**：曝光量从大到小依次为 dsh.so（3.2 万）、dshworks（3.7 万，作者数口径）、dsh-plugin.org 与 dshbase（2.6 万级）、awesome-dsh-plugin 索引（1.2 万）。这些目录的收录口径互相不同（抓取方式、是否要求实测、是否算话题），因此条目数不一致。对单个插件而言，进入的目录越多，被 `dshmarket`、`dsh.so`、`dshbase` 等不同入口的用户看到的机会越多。

**社区检索结果说明**：Reddit 正文接口返回 403（「blocked due to a network policy」），未取得帖子正文，只从检索摘要看到标题与链接；V2EX 站内检索「dsh 插件 DeepSeek Harness」无结果；知乎取得一篇《用好 DeepSeek Harness 一定安装的 5 个实用插件！》的标题与摘要，未抓取正文。

---

## 3. 同类插件市场格局

### 3.1 索引总体数据（2026-11-20 实拉）

`https://awesome-dsh-plugin.com/plugins.json` 的元字段与统计：

| 项 | 值 |
|---|---|
| 索引名 | `awesome-dsh-plugin` |
| 数据源仓库 | `github.com/awesome-dsh-plugin/awesome-dsh-plugin` |
| 更新时间 | 2026-11-19 |
| 条目总数（`count` 与数组长度） | 12,203 |
| 分类数 | 23 |
| 有 npm 包名的条目 | 6,379 / 12,203 |
| 全索引 `downloads` 字段合计 | 28,783,862 |
| 星数 ≥1000 的条目 | 70 |
| 星数 ≥100 的条目 | 320 |
| 星数 ≥50 的条目 | 484 |
| 星数 ≥10 的条目 | 1,406 |
| 星数 = 0 的条目 | 4,771（约 39%） |

星数分布说明：绝大多数条目是零星的个人作品，头部集中度较高。这决定了新插件进入目录后，靠「被目录收录」只能获得基础曝光，真正的差异化要靠功能空缺。

### 3.2 分类分布（23 类）

| 分类 | 条目数 | 分类 | 条目数 |
|---|---|---|---|
| ui | 2,447 | security | 311 |
| tools | 1,723 | browser | 238 |
| session | 950 | docs | 234 |
| workflow | 740 | vision | 215 |
| dev | 670 | git | 206 |
| usage | 663 | voice | 170 |
| model | 616 | market | 151 |
| memory | 517 | identity | 144 |
| theme | 439 | agi | 95 |
| skill | 437 | wsl | 89 |
| notify | 409 | | |
| fun | 394 | | |
| remote | 345 | | |

本插件按功能应归入 `session`（950 条）或 `ui`（2,447 条）两类之一。`session` 分类的头部是 `billion-context`（7,968★）、`dsh-infinite-gen-4`（4,583★）、`dsh-synapse`（732★）、`dsh-archive-manager`（381★）等，与本插件不在同一功能面上。

### 3.3 状态 / 标记 / 标签类目条目清单

索引没有单独的「状态」分类，状态、标记、标签类功能分散在 `session`、`ui`、`notify` 等分类。用名字与描述筛选后，与本插件功能真正相关的有 35 条。下表列出主要条目（★ 为星数，dl 为索引中的近 30 天下载量，与 npm 下载接口核对一致）。

| 名称 | 星数 | 近30天下载 | 功能描述（节选） |
|---|---|---|---|
| youxia-dsh-plugins#dsh-session-labels | 20 | 1,255 | Finder 风格会话标签：悬浮按钮与右键菜单打彩色标签，标题按首个标签着色，支持按标签筛选 |
| dsh-web-attention-badge | 6 | 862 | 会话需要你时三处同时亮起：角标、标签页标题计数、按状态换色的鲸鱼 favicon |
| dsh-workspace-status-board | 3 | — | 把侧栏工作区改成「需要介入 → 执行中 → 已完成」排序的状态看板，三种状态标识 |
| dsh-session-status | 2 | 1,487 | 为每个会话设置项目状态标签（进行中/已结项/搁置中 + 自定义，颜色可调），在侧栏、对话头部、悬停卡显示 |
| dsh-session-menu | 2 | 1,963 | 会话右键菜单补标记未读、复制信息、删除，会话行加报错与未读状态点、悬浮卡信息 |
| dsh-group-status | 1 | 2,909 | 侧栏折叠分组聚合徽标：收起的文件夹行显示进行中/待审批/已完成等聚合状态与数字 |
| dsh-workspace-status | 1 | 2,041 | 侧栏工作区行显示彩色状态标记（等待处理/运行中/刚完成，按工作区聚合） |
| dsh-session-tags | 1 | — | 为会话添加标签，并在 Web 设置面板按标签搜索会话 |
| dsh-status-lamp | 0 | 1,105 | 侧栏会话行状态灯：空闲蓝点、挂起灰空心（手动或 5 天无对话自动）、归档灰实心 |
| dsh-session-status-hub | 0 | 2,417 | 标题栏状态栏，按红（失败）> 黄（等你回答）> 绿（未读）> 蓝（运行中）> 灰列会话，点一下直达 |
| dsh-favicon-status | 0 | 1,090 | 按会话列表把 favicon 画成状态圆环（执行中蓝、等待琥珀、完成绿） |
| dsh-pending-review-glow | 0 | 1,145 | 按待审批、运行中、刚完成给会话行上色并加呼吸动效，行尾配状态点 |
| dsh-workspace-tree-status | 0 | 990 | 工作区树每个目录名前显示聚合状态点，父目录汇总嵌套工作区 |
| dsh-session-eva-status | 0 | 1,182 | 按官方状态给会话行染色（福音战士配色），左轨按模式分档 |
| dsh-better-tag | 0 | 607 | 给会话贴扁平标签并落「完成」章，侧栏行尾、悬停卡、标题旁可见，另有按状态计数的会话总览 |
| dsh-session-status-filter | 0 | 645 | 工作区工具栏下方加状态 chip，按运行中/待确认/未读筛选会话，行尾显示状态圆点 |
| dsh-session-focus | 0 | 1,151 | 从会话行/悬浮卡点一下标记「进行中/挂起」，侧栏底部显示还有几条 |
| dsh-unread-mark | 0 | — | 会话菜单加「标记未读/取消标记」，标题前钉一个不消失的红点，服务端持久化 |
| dsh-session-tags（另一实现） | 0 | 847 | 会话彩色标签：侧栏行与标题旁显示，预设颜色、悬停移除、拖拽排序，存宿主侧存储域 |

此外，本次检索中名字含 status/mark/label/tag 的条目共 237 条，`session` 分类里描述含「状态/标签」的共 176 条。多数是状态灯、角标、favicon、未读点一类的「显示层」小插件，星数集中在 0–20。

### 3.4 直接竞品（会话管理器赛道）与下载量对照

任务书给的三条竞品在索引中都能找到，实测星数略高于任务书给的数字：

| 插件 | 作者 | 实测星数（任务书值） | 近30天下载 | 最新版本 | 定位 |
|---|---|---|---|---|---|
| dsh-session-manager | hkkz9522 | 130（112） | 18,263 | 0.7.10 | 会话与工作区管理：归档、移动、预设迁移、删除、收藏、待回看、优先级、标签、备注、批量操作 |
| dsh-session-manager | dream12347 | 116（115） | 未取得（无 npm） | — | 会话管理：删除/恢复归档、活动统计、继续/暂停、未读标记、工作区分组与排序、上下文压缩阈值 |
| dsh-sessions-manager | TOBYCAI | 40（39） | 5,427 | 3.8.1 | 统一设置面板里归档、恢复、删除、跨工作区移动会话 |

本插件对照：

| 插件 | 近30天下载 | 最新版本 | 索引收录 |
|---|---|---|---|
| **dsh-session-status-marker（本插件）** | **804** | **1.2.3** | **不在任何目录索引** |

结论：本插件在 npm 上近 30 天下载 804，处在同类状态插件的中游（高于 better-tag 607、低于 group-status 2,909），但与会话管理器头部（18,263、5,427）差一个数量级，且完全不在社区索引里。分发缺口比功能缺口更直接地压低了可见度。

---

## 4. 空缺与痛点

以下逐条给出证据。

### 4.1 「按工作状态分组查看全部会话」这个点没有成熟产品

任务书已知事实与本文件实测都指向同一结论：三个会话管理器都在「生命周期 + 注意力 + 组织」赛道（归档、删除、标签、优先级、待回看），状态类小插件都在做「在行上显示一个点或灯」。索引里没有任何高星条目把八个工作状态聚合成一个可按状态分组的会话总览。

证据：`dsh-group-status`、`dsh-workspace-status`、`dsh-workspace-tree-status` 都只做「聚合状态点/徽标」，不带分组列表与计数面板；`dsh-session-status-hub` 做的是标题栏一条状态栏；`dsh-session-status-filter` 做的是按三个系统态筛选。本插件 1.1.0 起已有的 `settings.section` 状态总览（按 8 状态分组、组内按更新时间降序、带计数）在索引里找不到对等产品。

### 4.2 现有状态语义太浅，没有面向 agent 工作流的多态

现有插件要么是项目状态标签（`dsh-session-status` 只有进行中/已结项/搁置中 + 自定义），要么是系统运行态（`dsh-status-lamp` 空闲/挂起/归档；`dsh-session-status-filter` 运行中/待确认/未读）。索引里没有把 `blocked`（卡住等人工处理）、`awaiting-answer`（等用户回答）、`review`（产出待审查）、`pending-subagent`（等子代理）、`feedback`（等反馈）区分开的产品。

证据：§3.3 清单里所有条目的描述都停留在「运行/等待/完成/未读/归档」这一层，没有一条出现「卡住需要人工」「等子代理」「待审查」这类语义。本插件的 8 状态恰好覆盖这些 agent 工作流节点。

### 4.3 AI 自主推断能力缺位

索引里的状态类插件全部依靠手动点击或系统事件驱动的显示，没有一条描述提到「让模型在回合结束时自己标状态」。本插件通过 `set_session_status`/`clear_session_status` 两个工具让模型自主标记，并有「手动标记优先于自动推断、自动推断不覆盖手动」的规则；这是当前竞品里没有的能力。

证据：§3.3 清单 19 条与 §3.4 三个管理器，描述里均无「模型自动标记」相关表述。

### 4.4 本插件的分发缺口最直接

本插件在 `awesome-dsh-plugin.com/plugins.json` 里命中 0 条（`name`/`npm`/`description` 三个字段都搜过），也就是说用户桌面装的第三方市场 `dshmarket@1.73.20` 根本看不到本插件。近 30 天下载 804，说明已有用户通过 npm 或 GitHub 直接安装，但没有进入目录带来的自然流量。

证据：本插件从 GitHub 仓库 `sterraMind/dsh-session-status-marker` 存在且可检索，说明代码与 release 都在，缺的只是「加话题 + 声明 manifest + 被目录抓取」这一步运营动作。

### 4.5 生态碎片化，收录口径不一致，收录即曝光

同一批插件在不同目录里的总数差异很大：awesome-dsh-plugin 12,203、dsh-plugin.org 26,589 个仓库、dshbase 26,846、dsh.so 32,151、dshworks 36,924。这说明没有任何一个目录覆盖全部生态，用户会从不同入口进入。对插件作者来说，每进入一个目录就多一个被发现的机会，且多数目录的硬门槛只有「公开仓库 + `dsh-plugin` 话题 + manifest」。

证据：见 §2 渠道表各自的收录数与门槛列。

### 4.6 非桌面鼠标入口仍是短板

DSH 宿主在 `@media (hover: none)` 下会隐藏会话行内我们注入的快捷按钮（见 `AGENTS.md` 悬停卡交互约束一节），触屏用户只能通过右键菜单项 `sidebar.workspaces.session.menu.item` 进入；终端界面目前没有显示状态徽标的槽位。相较桌面鼠标用户，触屏与终端用户的操作路径更长。

证据：`README.md` 路线图写明「终端界面接入」「侧栏按状态筛选、批量修改」都还没做；`AGENTS.md` 记录行内图标在触屏被宿主隐藏。

---

## 5. 迭代方向建议

按「用户痛点 / 已有能力基础 / 实现成本 / 预期收益」给出 5 条，按优先级排序。成本分小/中/大，收益以对分发、留存、差异化的实际帮助衡量。

### 5.1 进入主流索引（运营动作，优先做）

- **用户痛点**：用户装了 `dshmarket`、`dsh.so`、`dshbase` 却搜不到本插件，只能靠口碑与手动安装。
- **已有能力基础**：npm 包 1.2.3 已发布、GitHub 仓库与 Release 齐全、8 语言 `locale/*.json` 元数据已就绪。
- **具体动作**：给仓库加 `dsh-plugin` 话题；确认 `package.json` 声明 `dsh.bundle.patch`；向 awesome-dsh-plugin（自动雷达 + issue 更正）、dsh-plugin.org（`/submit` 表单）、dsh.so（`/submit` 粘贴仓库地址自动扫描）、dshbase（自动索引 + 实测分级）逐家提交；顺带补一份市场卡片（索引里有 `dsh-market-card` 这类工具可生成 README + 截图的市场卡片）。
- **实现成本**：小（无需改运行时代码，主要是补话题、补 manifest、写提交材料）。
- **预期收益**：大。这是把 804/月 提到类目可见区间的唯一低成本手段；参考同类 `dsh-group-status` 2,909、`dsh-status-lamp` 1,105 的下载量，进入目录后有明显可见度提升空间。

### 5.2 侧栏按状态筛选 + 批量改状态

- **用户痛点**：会话一多，侧栏里找「哪些卡住了、哪些等我回答」要一行行看徽标；改多个会话状态要逐个点。
- **已有能力基础**：8 状态徽标与 `sidebar.session.row.trailing` 槽位已就位；`list` 路由支持 `?since=<revision>` 条件刷新；状态总览路由 `overview` 已能按状态分组。
- **实现成本**：中（新增筛选 UI 与批量 mutate 路由入口，复用现有 `list`/`mutate` 路由与存储）。
- **预期收益**：中高。直接对标 `dsh-session-status-filter`（645/月）并叠加 8 态语义，把「显示层」升级为「筛选层」。

### 5.3 状态总览升级为独立工作台

- **用户痛点**：现在状态总览藏在设置页里，日常要主动进设置才能看；缺少按工作区分组与一键跳转。
- **已有能力基础**：`settings.section` 的 `StatusOverview.tsx` 已按 8 状态分组、带计数、可见性感知轮询；`overview` 路由已关联会话标题。
- **实现成本**：中（新增侧栏页面或首页入口，复用 overview 路由；按工作区分组需补一次投影）。
- **预期收益**：中高。强化 §4.1 的唯一差异点，做成可日常常驻的工作台，提升留存。

### 5.4 扩展 AI 推断的覆盖面

- **用户痛点**：模型目前主要靠 `interrupted → stopped` 这类信号推断，`blocked`、`awaiting-answer`、`review` 这些更贴工作流的态还主要靠手动。
- **已有能力基础**：`inference.ts` 的纯函数 `inferStatus`/`shouldApplyInference`、观察器已监听 `session/event`；工具描述已按 WHEN TO USE 分节重写。
- **实现成本**：中（扩展推断规则与置信度、补充「推断 vs 手动」的界面提示，需回归测试避免误标）。
- **预期收益**：高。这是竞品完全没有的能力，强化后能把「状态标记」从手动工具变成半自动工作流。

### 5.5 触屏与终端可达性补齐

- **用户痛点**：触屏设备上行内快捷入口被宿主隐藏，只能走菜单；终端界面完全没有徽标位置。
- **已有能力基础**：右键菜单项 `sidebar.workspaces.session.menu.item` 已是触屏入口；状态推断可写入并以文字形式呈现（README 路线图已述）。
- **实现成本**：小（触屏菜单入口完善）到 大（终端侧展示需另设计，宿主无现成槽位）。
- **预期收益**：中。扩大可用人群，但短期对下载量的直接拉动弱于前四条，建议排在后面。

---

## 6. 参考链接表

下表只列本文件实际访问或引用过的来源。

| 名称 | 地址 | 用途 |
|---|---|---|
| awesome-dsh-plugin 索引 | https://awesome-dsh-plugin.com/plugins.json | 12,203 条索引数据、分类分布、状态类条目、下载量（实拉 HTTP 200） |
| awesome-dsh-plugin 站点 | https://awesome-dsh-plugin.com/ | 索引来源说明 |
| awesome-dsh-plugins 提交规范（dongsheng123132） | https://github.com/dongsheng123132/awesome-dsh-plugins/blob/main/CONTRIBUTING.md | 收录门槛：公开仓库 + `dsh-plugin` 话题 + `dsh.bundle.patch` |
| walkinglabs 策展清单提交规范 | https://github.com/walkinglabs/awesome-deepseek-harness-plugins/blob/main/CONTRIBUTING.md | 源码级验证政策 |
| dsh-plugin.org 教程页（GitHub topic） | https://dsh-plugin.org/tutorials/dsh-plugin-github-topic | 实时索引 26,589 仓库、分类计数 |
| dsh-plugin.org 提交页 | https://dsh-plugin.org/submit | 提交三步：公开仓库、加话题、补信任信息 |
| dsh.so 首页 | https://www.dsh.so/zh/ | 32,151 插件、扫描与沙盒实测计数 |
| dsh.so 提交页 | https://www.dsh.so/zh/submit | 接受标准、包名正则、安全扫描、审核流程 |
| dshbase 中文站 | https://dshbase.com/zh/ | 26,846 插件、7,886 已验证、L1–L4 实测分级 |
| dshworks/awesome-dsh-plugins | https://github.com/dshworks/awesome-dsh-plugins | 36,924 条、22,269 作者、17 功能区 |
| GitHub 话题 dsh-plugin | https://github.com/topics/dsh-plugin | 话题定位与抓取源 |
| npm downloads API | https://api.npmjs.org/downloads/point/last-month/dsh-session-status-marker | 本插件与竞品近 30 天下载量 |
| npm registry | https://registry.npmjs.org/dsh-session-status-marker | 最新版本 1.2.3 |
| 本插件仓库 | https://github.com/sterraMind/dsh-session-status-marker | 确认仓库存在、可检索 |
| Reddit r/DeepSeek（awesome-dsh-plugin 帖） | https://www.reddit.com/r/DeepSeek/comments/1vnc00p/ | 社区讨论入口（正文 403，未取得） |
| 知乎《用好 DeepSeek Harness 一定安装的 5 个实用插件！》 | https://zhuanlan.zhihu.com/p/2101871616707895870 | 中文社区推荐入口（仅标题与摘要） |

---

## 附：数据可复现说明

- 索引拉取：`$env:NODE_USE_ENV_PROXY=1; node -e "fetch('https://awesome-dsh-plugin.com/plugins.json')..."`，产物 `R:\Temp\.drafts\ops-plan\plugins.json`。
- 统计脚本：解析 `plugins.json`，按 `category` 分组、按名字/描述筛选状态类，按 `stars`/`downloads` 排序。
- npm 下载：`https://api.npmjs.org/downloads/point/last-month/<pkg>`。
- 索引中的 `downloads` 字段与 npm 近 30 天下载接口在可核对的 8 个包上完全一致，可作为近 30 天下载量使用。
