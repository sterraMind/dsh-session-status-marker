# 发布流程与版本协定 · dsh-session-status-marker

> **文档版本**：v1.2.3 · 最后更新：2026-11-20（对应插件 1.2.3）

> 本文件规定本项目的版本号判定规则、npm 分发标签策略、GitHub Release 策略、标签命名规则、变更记录维护规则、分支与发布流程、发布门槛、回退与弃用处置。
> 本文件与 `CONTRIBUTING.md`（协作规范）、`CHANGELOG.md`（变更记录）、`docs/acceptance-and-regression.md`（验收证据）配套使用。
> 适用范围：本仓库的全部发布动作，包括正式版与预发布版。参与发布的人员与智能体都必须按本文件执行。

---

## 1. 判定依据与事实来源

本文件中的每一条规则都来自 `docs/research/10-release-and-versioning.md` 的条文，或者是本项目已经发生过并留有记录的事实。条文编号沿用该调研文档的编号（A 系列对应语义化版本，B 系列对应分发标签，C 系列对应变更记录，D 系列对应提交规范，E 系列对应分支与发布流程）。

当前可核对的起点事实如下。

| 事实 | 位置 | 观测值 |
|---|---|---|
| 插件版本号 | `package.json:3` | 本文件定稿时读到的值为 `1.2.3`。工作区可能已有并发改动把该字段递增，核对时以实际读取的值为准 |
| Harness 版本下限 | `package.json:33` | `>=0.2.2-rc.1 <0.3.0` |
| Node 版本下限 | `package.json:34` | `>=24.9.0` |
| npm 分发标签 | `npm dist-tag ls dsh-session-status-marker` 于 2026-11-20 执行 | `latest: 1.2.3`，`rc: 1.2.3-rc.2` |
| git 标签 | `git tag --sort=-creatordate` | `v1.2.3`、`v1.2.3-rc.2`、`v1.2.3-rc.1`、`v1.2.2`、`v1.2.1`、`v1.2.0`、`v1.1.6` 依次排列 |
| 发布政策原文 | `AGENTS.md:68` | 正式版本必须在用户实际前端验收通过之后发布，验收之前只能发预版本 |

---

## 2. 语义化版本规则

### 2.1 公共契约的六项内容

判定版本号时，逐项核对本次改动是否触及下表六项公共契约。这六项是用户实际依赖的对外承诺。

| 项 | 具体内容 | 位置 |
|---|---|---|
| 包入口 | `main`、`types`、`exports`、`files` 四个字段 | `package.json:6-21` |
| 插件身份 | `cordis.patch.yml` 声明的插件 id，`src/domain.ts` 的 domain 名 `session_status_marker` | `cordis.patch.yml`、`src/domain.ts` |
| Client 槽位 | `sidebar.session.row.trailing`、`sidebar.session.row.hover`、`sidebar.workspaces.session.row.action`、`sidebar.workspaces.session.menu.item`、`settings.section` 的注入 id | `src/client/index.ts:57-130` |
| HTTP 路由 | `/api/session-status-marker.state`、`.list`、`.mutate`、`.overview` 四条路由的路由名与查询参数 | `src/contracts.ts:242-245`、`src/service.ts:133-168` |
| 持久化 | 表名 `marks`、`defineDomain` 的 `version` 字段（当前值为 1）、记录字段 | `src/domain.ts:12-28`、`src/contracts.ts:10`、`src/types.ts` |
| 用户可见配置 | `autoInfer`、`maxNoteLength`、`autoExpireMs`、`refreshIntervalMs`、`rowActionOrder`、`menuItemOrder` 的字段名、类型与默认值；八种语言的 locale 键 | `src/service.ts:46-66`、`src/client/locales.ts` |

### 2.2 主版本号加一的判定

出现下列任一情况时，主版本号加一，次版本号与修订号归零。

- 删除或重命名 `src/index.ts` 的导出符号，或者修改默认导出的 Service 类名。
- 修改插件 id、domain 名或持久化表名，导致已存的标记无法被新版本读出。
- 删除某个 Client 槽位注入，或者修改注入 id，导致页面上的入口消失。
- 删除或重命名 HTTP 路由，或者修改请求体、响应体的必填字段。
- 删除配置项，修改配置项类型，或者修改配置项默认值并因此改变行为。
- 删除 locale 键或者修改键名。八种语言字典要求键完全一致，删除一个键等于八处变更。

### 2.3 次版本号加一的判定

新增能力并且旧用法继续可用时，次版本号加一，修订号归零。典型情形包括新增槽位注入、新增状态种类、新增带默认值的配置项、新增工具、新增界面语言、新增 HTTP 路由。

### 2.4 修订号加一的判定

只做下列改动时，修订号加一：缺陷修复、样式与配色修正、文案与翻译修正、README 与文档修正、测试补充、依赖区间调整但不改变可安装范围的实际含义、打包内容修正。

### 2.5 预发布标识 `-rc.N` 的递增规则

用户尚未验收时，在算出的 `X.Y.Z` 后面加 `-rc.N`，其中 `N` 从 1 开始。同一个 `X.Y.Z` 每次重新发布都必须把 `N` 加一，即使本次只改了一行文档或者只重新打包一次。

这条规则的依据是 npm 的发布约束：同一个名称与版本组合一旦发布就永远不能再用，执行 `npm unpublish` 之后也不能再用。需要重发同一批改动时，写 `1.2.3-rc.2`。

已经发布的 `-rc.N` 不复用。验收不通过时递增 `N` 再发。

### 2.6 预发布版本的优先级比较

比较顺序是先比较主版本号、次版本号、修订号，三者相同时再比较预发布标识。预发布标识按句点分段从左到右比较：只含数字的段按数值大小比较，含字母或连接号的段按 ASCII 顺序比较，数字段低于非数字段，前缀相同时段数多的更高。

因此 `1.2.3-rc.1 < 1.2.3-rc.2 < 1.2.3-rc.10 < 1.2.3`，并且 `1.2.3-beta.2 < 1.2.3-rc.1`。

### 2.7 版本范围与预发布版本的匹配

npm 使用的 node-semver 规定：带预发布标识的版本，只有在比较器集合中存在「主版本号、次版本号、修订号完全相同并且自身带预发布标识」的比较器时，才可能满足该范围。

因此 `engines.dsh` 写成 `>=0.2.2` 时，`0.2.2-rc.3` 不满足这个范围，安装会被判为不兼容。正确写法是 `>=0.2.2-rc.1 <0.3.0`，`package.json:33` 已经是这个写法。

同样的规则适用于 `package.json:41-49` 的九个 `peerDependencies`。其中八个 `@deepseek-ai/dsh-*` 依赖的下限都写成 `>=0.2.2-rc.1 <0.3.0`，带预发布标志；`@deepseek-ai/cordis` 写成 `>=4.1.0`，该依赖没有预发布版本，因此不带预发布标志。核对时逐项确认这八个依赖的下限没有被改成不带预发布标志的写法。

本项目的 1.2.0 曾把下限写成 `>=0.2.2`，用户在 DSH `0.2.2-rc.3` 上安装时被拒绝，1.2.1 才改回带预发布标志的写法。这条规则因此列为发布检查清单的强制项。

### 2.8 构建元数据

`+` 之后的标识符在判断优先层级时被忽略，`1.2.3+build.7` 与 `1.2.3` 属于同一个优先层级。本项目据此确定三条用法：不用构建元数据区分预发布与正式版，不用它表达兼容性，只在需要把构建来源写进版本串时附加。该字符串不进入分发标签判定，也不进入变更记录的版本小节标题。

### 2.9 已发布内容不可修改

已发布版本的内容保持原样，任何修复都以新版本发布。发布后发现内容有误时，处置方式是标记问题版本并用新版本修正，处理步骤见 §9。

---

## 3. npm 分发标签策略

### 3.1 `latest` 的准入条件

`latest` 只指向用户已经在实际前端验收通过的正式版。判定标准是用户在真实页面上确认功能可用，并且验收记录已经写进 `docs/acceptance-and-regression.md`。

预发布版不得占用 `latest`。1.2.3-rc.1 发布时 `latest` 保持指向 1.2.2，这条做法已经执行并记录在 `CHANGELOG.md:22`。

### 3.2 预发布发布命令

预发布一律使用 `npm publish --tag rc`。从 npm 11 起，发布带预发布标识的版本必须显式指定标签，未指定时命令直接报错退出。实验性改动可以使用 `--tag next`。

### 3.3 安装侧的对应写法

用户执行 `npm install dsh-session-status-marker` 会安装 `latest` 指向的版本。要安装预发布必须写 `npm install dsh-session-status-marker@rc`。README 与插件市场说明里，预发布版本一律带 `@rc` 后缀出现。

### 3.4 标签命名约束

分发标签名称不得能被解析成版本范围。npm 会拒绝 `v1.4` 这类写法，因为它被解释成 `>=1.4.0 <1.5.0`。本项目只使用 `latest`、`rc`、`next` 三个标签名，三者都不以数字或字母 `v` 开头。

### 3.5 发布后核对

npm 走暂存发布流程，命令输出 `+ name@version` 只代表请求被接受，registry 先公开 `0.0.0-stage`，约 11 分钟后 `latest` 才切到真实版本。发布后执行 `npm dist-tag ls dsh-session-status-marker` 核对三个标签各自指向的版本，核对结果写进变更记录的发布段。

使用暂存发布时，`npm publish` 只是把包提交到暂存区，需要维护者在命令行或者 npmjs.com 上通过双因素认证显式批准之后才会进入正式 registry。发布记录里要区分「已提交暂存」与「已批准上线」两个状态。

---

## 4. GitHub Release 策略

| 版本类型 | prerelease 勾选 | 附带的文件 | 标题 |
|---|---|---|---|
| 正式版 | 不勾选 | 该版本的 tgz 压缩包 | 与标签名完全一致，例如 `v1.2.3` |
| 预发布版 | 必须勾选 | 该版本的 tgz 压缩包 | 与标签名完全一致，例如 `v1.2.3-rc.1` |

预发布版本必须勾选 prerelease 标记，因为该版本尚未通过用户验收，未勾选会让访客把它当作正式版下载。正式版在用户验收通过之后发布，因此不勾选 prerelease 标记。

版本发布后被判定有问题时，在 Release 说明里补写故障说明，并把该 Release 标记为 prerelease。1.2.0 与 1.2.1 的处置就是这个做法。

---

## 5. 标签命名

- 标签名写成 `v<version>`，`<version>` 与 `package.json` 的 `version` 字段完全一致，例如 `v1.2.3-rc.1`。
- 标签使用附注标签，命令写成 `git tag -a v<version> -m "<version>"`。附注标签是完整对象，包含创建者、日期与说明，可以签名与校验。
- 变更记录的版本小节标题不带 `v` 前缀，写作 `## [1.2.3-rc.1] - 2026-11-20`。标签名、变更记录标题、GitHub Release 标题三者在同一次发布提交里一起产生，并且一一对应。
- 已存在的标签不移动、不删除。需要修正时递增版本号重新发布。

---

## 6. 变更记录维护规则

### 6.1 文件结构

`CHANGELOG.md` 开头是 `# Changelog` 标题，紧接着一段声明格式来源与版本号规范的说明文字，然后是按版本从新到旧排列的版本小节。文件当前已经采用这个结构。

### 6.2 版本小节标题

标题写成 `## [X.Y.Z] - YYYY-MM-DD`，预发布版本写成 `## [X.Y.Z-rc.N] - YYYY-MM-DD`。日期使用 `YYYY-MM-DD` 格式，取该版本实际发布的日期，月份写成两位数字，时间部分省略。

### 6.3 变更分类

每个版本小节内部只使用下列六个标题，没有内容的分类直接省略。

| 标题 | 收录内容 |
|---|---|
| `### 新增` | 新增的用户可感知能力 |
| `### 变更` | 已有行为的变化 |
| `### 弃用` | 即将移除的能力 |
| `### 移除` | 已移除的能力 |
| `### 修复` | 缺陷修复 |
| `### 安全` | 安全相关修正 |

当前 `CHANGELOG.md` 的版本小节使用了「验证」与「发布」两个额外标题。下次发布时按本节归并：验证证据并入对应的修复条目，发布信息写成该版本小节开头的一段说明。已发布的历史小节不回溯改写。

### 6.4 条目写法

每条先写用户可感知的现象，再写实现方式，最后写证据。证据包括文件与行号、测试数量、真实页面截图路径。纯内部重构如果不改变任何用户可感知的行为，不单独成条，并入相关条目的说明。

### 6.5 未发布段的流转

开发期间所有改动先写进 `## [Unreleased]` 段。发布时把 `## [Unreleased]` 改名为 `## [X.Y.Z] - 日期`，并在文件顶部新开一个空的 `## [Unreleased]` 段。同一个改动不得同时出现在未发布段与某个版本小节里。

### 6.6 撤回标记

某个版本发布后被撤回时，在该版本标题后加 `[YANKED]` 标记，并在小节开头写撤回原因与替代版本，该小节保留不删除。

---

## 7. 分支与发布流程

### 7.1 分支模式

本项目采用基于主分支的开发方式，日常改动直接提交到主分支，不建立长期存在的发布分支。判断依据有三条：维护者只有一人，发布节奏由用户反馈驱动，没有同时维护多个旧版本的需求。

需要开分支的唯一情形是：`latest` 指向的正式版出现必须在旧版本上修、并且主分支已经包含不兼容改动。此时从该版本的标签建立 `release/X.Y.x` 分支，在分支上只做缺陷修复，修完创建修订号标签。修复必须同时合并回主分支。

### 7.2 发布前检查清单

每次发布按下列顺序执行，任何一步不通过就停止，不得越过后续步骤。

| 步骤 | 动作 | 通过判据 |
|---|---|---|
| 1 | 检查工作区 | `git status --short` 中没有属于本次发布的未提交改动 |
| 2 | 类型检查 | `pnpm run typecheck` 退出码为 0 |
| 3 | 构建 | `pnpm run build` 退出码为 0，`lib/` 下产物重新生成 |
| 4 | 单元测试 | `node --test --test-isolation=none tests/*.test.mjs` 全部通过，失败数为 0 |
| 5 | 打包 | `pnpm pack` 生成 tgz，记录字节数 |
| 6 | 版本号对齐 | `package.json:3` 的版本与变更记录顶部版本小节标题一致 |
| 7 | 依赖区间核对 | `engines.dsh` 与八个 `@deepseek-ai/dsh-*` 依赖的下限都带预发布标志，见 §2.7 |
| 8 | 变更记录定稿 | 未发布段已改名为目标版本小节，六个分类按 §6.3 使用 |
| 9 | 发布提交 | 一条 `chore(release): X.Y.Z` 提交，包含版本号与变更记录 |
| 10 | 创建标签 | `git tag -a v<version> -m "<version>"` 并推送到远端 |
| 11 | GitHub Release | 按 §4 决定是否勾选 prerelease，附上 tgz |
| 12 | npm 发布 | 正式版执行 `npm publish`，预发布执行 `npm publish --tag rc` |
| 13 | 核对分发标签 | `npm dist-tag ls` 的结果与预期一致 |
| 14 | 真实页面验收 | 在测试机安装该版本，按 §8 的门槛复核并留下截图 |
| 15 | 验收记录 | 观测值与截图路径写进 `docs/acceptance-and-regression.md` |
| 16 | 正式版放行 | 只有第 14 步与用户确认都通过，才把该版本作为正式版发布 |

第 14 步与第 16 步的先后关系是本项目的核心约束：预发布版本可以在第 13 步之后交付用户验收，正式版必须等到用户验收通过之后才能发布。

第 9 步的目标状态是单独一条发布提交。历史发布中，1.2.2 与 1.2.3-rc.1 采用的是先提交功能改动、再提交文档记录、然后创建标签的顺序，没有单独的 `chore(release)` 提交。历史记录不回溯改写，新发布按本清单执行。

---

## 8. 发布门槛

一个版本要作为正式版发布，必须同时满足下列五项。任何一项未满足时，只能发布 `-rc.(N+1)`。

| 门槛 | 判定方式 | 当前状态 |
|---|---|---|
| 类型检查通过 | `pnpm run typecheck` 退出码为 0 | 1.2.3-rc.1 已通过 |
| 构建通过 | `pnpm run build` 退出码为 0，`lib/` 与 `lib/client.js` 均生成 | 1.2.3-rc.1 已通过 |
| 单元测试全部通过 | `node --test --test-isolation=none tests/*.test.mjs` 失败数为 0 | 1.2.3 为 111 项测试、27 个套件全部通过 |
| 真实页面验收 | 在真实页面上读出几何尺寸、计算样式与截图，判定标准见 §8.1 | 1.2.3-rc.1 已在测试机完成复核，证据见 `docs/acceptance-and-regression.md` §3.20 |
| 用户验收 | 用户在实际使用的界面上确认功能可用 | 待用户确认 |

### 8.1 真实页面验收的判定标准

验收项必须写成可以读出的观测值，禁止写「看起来正常」这类无法判定的描述。已经使用过的合格写法包括：读 `getBoundingClientRect()` 确认触发按钮为 24×24；读计算样式确认卡片背景在浅色主题下与深色主题下不相等；读页面内的浮层数量确认只有一个；点击后读页面状态确认没有出现「已复制」提示。

验收必须在真实页面上完成。只执行类型检查与单元测试不算验收，因为历史上出现过单元测试全部通过、真实页面上图标尺寸为 0×0 的缺陷。

### 8.2 预发布到正式版的路径

用户验收之前只发 `-rc.N`。用户验收通过之后，把版本号去掉预发布标识，或者按 §2.2 至 §2.4 重新判定一次，然后发布正式版：`latest` 指向该版本，GitHub Release 的 prerelease 标记去掉，`package.json` 的版本与变更记录标题同步更新。验收不通过时递增 `N` 再发，已经发布的 `-rc.N` 不复用。

预发布阶段只做缺陷修复，不引入新能力。这条做法与 TypeScript 官方发布流程一致：Release Candidate 阶段只修缺陷，破坏性变更在此之前完成。

---

## 9. 回退与弃用

### 9.1 标准处置顺序

正式版出问题时按下列顺序处置，三步都要做。

1. 执行 `npm deprecate dsh-session-status-marker@<问题版本> "<原因与修复版本>"` 给问题版本加安装警告。说明要写清问题、修复版本、建议动作三件事。
2. 执行 `npm dist-tag add dsh-session-status-marker@<上一个正式版> latest` 把 `latest` 指回上一个正式版。
3. 在 GitHub Release 上把问题版本标记为 prerelease，或者在说明里补写故障说明。

### 9.2 不使用 `npm unpublish`

同一个名称与版本组合发布之后永不复用，本项目使用的 granular token 对 `npm unpublish` 一律返回 E403。1.2.0 与 1.2.1 的处置方式就是改用 `npm deprecate` 加 `latest` 回指。

### 9.3 弃用标记的范围写法

传给 `npm deprecate` 的版本范围会把预发布版本一起包含在内，`my-thing@1.x` 会连 `1.0.0-beta.0` 一起标记。本项目因此按具体版本号逐个标记，不使用范围写法。

### 9.4 解除弃用标记

问题版本修复之后，用空字符串执行 `npm deprecate` 可以解除标记。解除之后把 `latest` 指回该版本或者更新的正式版。

---

## 10. 当前版本状态

### 10.1 分发标签与版本

下表于 2026-11-20 用 `npm dist-tag ls dsh-session-status-marker` 核对。

| 分发标签 | 指向版本 | 状态 | 说明 |
|---|---|---|---|
| `latest` | 1.2.3 | 正式版 | 用户已在 2026-11-20 实际验收，普通安装得到这个版本 |
| `rc` | 1.2.3-rc.2 | 预发布 | 已转正为 1.2.3，保留该标签供追溯 |
| `next` | 未使用 | 保留 | 供实验性改动使用 |

### 10.2 下一次发布计划

| 顺序 | 版本 | 前提 | 动作 |
|---|---|---|---|
| 1 | 1.2.3-rc.2（已于 2026-11-20 发布） | 1.2.3-rc.1 之后用户又提出「行内那一排要删掉」的修改要求 | 已执行：提交 `fef847c`/`fbabcec`/`3da65dd`/`8d501a4`、标签 `v1.2.3-rc.2`、GitHub Release 勾选 prerelease、`npm publish --tag rc` |
| 2 | 1.2.3（已于 2026-11-20 发布） | 用户在实际前端验收通过 | 已执行：提交 `03cd352`、标签 `v1.2.3`、GitHub Release 452333466（非 prerelease，附 83,281 B 的 tgz）、`npm publish` 后 `latest` 指向 1.2.3 |

如果 1.2.3-rc.1 不需要任何改动就通过用户验收，可以越过 1.2.3-rc.2 直接发布 1.2.3。`docs/research/10-release-and-versioning.md` §4.7 采用这个做法。两种路径的判定标准相同，都要求用户验收结论已经写进验收文档。

1.2.3 已于 2026-11-20 转为正式版：用户在桌面端验收 `1.2.3-rc.2` 后确认通过（验收记录见 `docs/acceptance-and-regression.md` §3.22），`package.json` 版本、git 标签 `v1.2.3`、GitHub Release 452333466（非 prerelease，附 83,281 B 的 tgz）、npm `latest` 四者一致；`rc` 标签继续指向 `1.2.3-rc.2` 供追溯。

1.3.0 预版本序列（2026-11-20）：`1.3.0-rc.1`（122 项测试 / tgz 93,874 B）→ `1.3.0-rc.2`（130 项 / tgz 98,388 B，修看板空 400、悬停卡备注编辑、换状态保留备注）→ `1.3.0-rc.3`（130 项 / tgz 98,666 B，修看板标题与未标记区块：未 inject 的服务改经 `ctx.reflect.get` 读取）。三者都只发预版本，GitHub Release 勾 prerelease、npm 用 `--tag rc`，`latest` 保持 `1.2.3`。用户在实际前端验收通过后再把当前 rc 转正式版 `1.3.0`。
### 10.3 已知的待办事项

- `.github` 目录尚不存在，Issue 模板与 Pull Request 模板属于待创建项。
- `CHANGELOG.md` 的「验证」「发布」两个标题需要在下次发布时按 §6.3 归并。
- 提交信息风格不统一的历史记录不做回溯修改，新提交按 `CONTRIBUTING.md` 的提交规范执行。

---

## 11. 参考资料

下表只列本文件实际引用过的资料，全部来自 `docs/research/10-release-and-versioning.md` 的参考链接汇总表。

| 名称 | 地址 | 本文件中的用途 |
|---|---|---|
| Semantic Versioning 2.0.0（中文版） | https://semver.org/lang/zh-CN/ | 三条递增规则、预发布标识定义、优先级比较算法 |
| node-semver 官方 README | https://github.com/npm/node-semver/blob/main/README.md | 预发布版本的范围匹配规则 |
| npm Docs：npm-publish | https://docs.npmjs.com/cli/v11/commands/npm-publish/ | 同名同版本永不复用 |
| npm Docs：npm-dist-tag | https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/ | `latest` 的默认行为、`--tag` 的作用、标签名不得为版本范围 |
| npm Docs：npm-deprecate | https://docs.npmjs.com/cli/v12/commands/npm-deprecate/ | 弃用标记的范围写法会包含预发布版本、解除标记的方式 |
| npm Docs：Staged publishing | https://docs.npmjs.com/staged-publishing/ | 暂存区与双因素认证批准流程 |
| Keep a Changelog 1.1.0 | https://keepachangelog.com/en/1.1.0/ | 六个变更分类、未发布段、日期格式 |
| Conventional Commits 1.0.0 | https://www.conventionalcommits.org/en/v1.0.0/ | 提交类型与版本号的对应关系 |
| Git 官方文档：git-tag | https://git-scm.com/docs/git-tag | 附注标签与轻量标签的差别 |
| GitHub Docs：Managing releases | https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository | prerelease 勾选项与 latest release 的选择方式 |
| Trunk Based Development：Release from trunk | https://trunkbaseddevelopment.com/release-from-trunk/ | 从主分支直接发布、缺陷在主分支修复 |
| Trunk Based Development：Branch for release | https://trunkbaseddevelopment.com/branch-for-release/ | 发布分支只在必要时创建 |
| TypeScript 发布流程 | https://github.com/microsoft/TypeScript/wiki/TypeScript's-Release-Process | 候选版本阶段只修缺陷 |

---

## 12. 待确认事项

1. 本文件尚未在 `AGENTS.md` 与 `README.md` 里建立指向链接，链接位置待维护者确认后补写。
2. `CHANGELOG.md` 的六个分类归并工作尚未执行，待下次发布时按 §6.3 处理。
3. 暂存发布的批准动作需要维护者在场完成双因素认证，本项目尚未配置自动化批准，具体流程待确认。
4. `README.md` 的版本号与测试数量已在 1.2.3 同步为「稳定版 1.2.3」「111 项测试」；后续版本递增时这两处要一起改。
