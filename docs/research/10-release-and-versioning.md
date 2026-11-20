# 项目版本规划与协作规范调研

> 文档版本：v1.0.0 · 2026-11-20
> 适用项目：`dsh-session-status-marker`（DeepSeek Harness 仓库外插件，发布到 npm 与 GitHub Releases）
> 对应现状：`package.json:3` 的版本为 `1.2.3-rc.1`，`package.json:33` 的 `engines.dsh` 为 `>=0.2.2-rc.1 <0.3.0`，`AGENTS.md:68` 已写入发布政策
> 资料依据：版本号与 dist-tag 规则以 semver.org、npm 官方文档、node-semver 官方 README 为准；提交与变更记录规则以 Conventional Commits 1.0.0 与 Keep a Changelog 1.1.0 为准；分支与评审规则引用 Git 官方文档、GitHub Docs、trunkbaseddevelopment.com、Google 工程实践与知名开源项目自身的贡献文档。社区二手文章一律不引用。

---

## 1. 调研范围与方法

### 1.1 范围

本文覆盖六个主题，每个主题都落成本项目可以直接照做的条文：

| 编号 | 主题 | 要解决的问题 |
|---|---|---|
| 3.1 | 语义化版本判定 | 主版本号、次版本号、修订号在本插件场景下各自对应哪些改动；`-rc.N` 如何递增与比较；build metadata 如何使用 |
| 3.2 | 版本号与 npm dist-tag | `latest` 只指向经用户验收的稳定版；预发布用 `--tag rc`；出问题后如何回滚 |
| 3.3 | CHANGELOG 规范 | Keep a Changelog 的结构、Unreleased 段、日期格式、与 git tag 的对应关系 |
| 3.4 | 提交规范 | Conventional Commits 的类型集合、scope 用法、BREAKING CHANGE 的两种写法、与 semver 的映射 |
| 3.5 | 分支与发布流程 | 基于主分支的开发与 release 分支如何取舍；release checklist 的完整步骤（含真实环境前端验收） |
| 3.6 | 协作规范 | Issue/PR 模板要素、代码评审要点、任务拆解粒度、完成的定义 |

### 1.2 方法

1. 搜索词按单一概念拆分，一个概念一次检索。实际使用的检索词包括 `semantic versioning prerelease precedence`、`node-semver prerelease tags range comparison README`、`npm publish prerelease version must specify tag`、`npm dist-tag docs`、`npm deprecate message format best practice`、`keepachangelog guiding principles`、`conventional commits specification`、`git tagging official documentation annotated tag`、`trunk based development release from trunk`、`GitHub Docs about issue and pull request templates`、`definition of done scrum guide 2020`、`React release channels docs canary experimental`、`pnpm release workflow versioning`、`TypeScript release process contributing handbook`。
2. 检索结果只用来定位官方页面，结论一律回到官方原文核对。抓取到原文的页面在 §5 参考链接表里标注用途。
3. 内容农场与二手聚合站（CSDN、腾讯云/阿里云/华为云开发者社区、抖音、简书、博客园聚合页、51CTO、w3cschool）不作为引用来源，检索命中后直接丢弃。
4. 本项目自身的失败案例（1.2.0 拒装、1.2.0/1.2.1 桌面端不可用、预发布与正式版同发 latest、提交信息风格不统一）作为条文的反向验证材料，写在每个主题的「本项目依据」段里。

### 1.3 已发生事实的定位

| 事实 | 证据位置 |
|---|---|
| 版本号停在预发布 | `package.json:3` 的 `"version": "1.2.3-rc.1"` |
| `engines.dsh` 已改为带预发布标志的比较器 | `package.json:33` 的 `">=0.2.2-rc.1 <0.3.0"` |
| 预发布发布必须显式指定 tag | `CHANGELOG.md:22` 记录「npm 对预发布版本强制要求显式 `--tag`（不带 `--tag` 直接报错退出）」 |
| 正式版须经用户验收 | `AGENTS.md:68` 的发布政策段落 |
| CHANGELOG 已采用 Keep a Changelog 版式 | `CHANGELOG.md:3` 声明格式参考 Keep a Changelog 中文版 |
| git tag 与 Release 一一对应 | `git tag` 输出含 `v1.2.3-rc.1`、`v1.2.2`、`v1.2.1`、`v1.2.0` 等，与 CHANGELOG 版本小节同名 |

---

## 2. 结论速览

以下十二条是本文的核心条文，逐条展开见 §3。

1. 本插件的公共契约由六项组成：包入口与导出、插件 id 与 `cordis.patch.yml`、Client slot id、HTTP route 名、持久化表名与 schema version、配置字段与 locale key。
2. 破坏上述任一项并迫使用户改配置或改调用方式的改动，主版本号加一。
3. 新增功能且旧用法继续可用，次版本号加一，修订号归零。
4. 只修缺陷、改样式、改文案，修订号加一。
5. 同一 `X.Y.Z` 内的预发布标识 `-rc.N` 必须单调递增，已发布的版本号永不复用。
6. `engines.dsh` 的下限一律写带预发布标志的比较器，写成 `>=0.2.2` 会让 `0.2.2-rc.x` 全部装不上。
7. `latest` 只指向用户已实际验收的稳定版；预发布发布使用 `npm publish --tag rc`。
8. 出问题的版本用 `npm deprecate` 标记并把 `latest` 指回上一个稳定版，`npm unpublish` 不作为常规处置手段。
9. CHANGELOG 的版本小节标题、git tag 名、GitHub Release 标题三者必须完全一致。
10. 提交标题使用 `<type>(<scope>): <描述>`，`fix` 对应修订号，`feat` 对应次版本号，`BREAKING CHANGE` 对应主版本号。
11. 本项目采用基于主分支的开发，不为每个版本开长期分支；只有需要给已发布版本单独修缺陷时才从对应 tag 建分支。
12. release checklist 必须包含「真实环境前端验收」一项，验收未通过时只能发 `-rc.(N+1)`。

---

## 3. 各主题条文与依据

### 3.1 语义化版本

#### 3.1.1 结论条文

**条文 A1：公共契约的六项内容。** 本插件对外承诺的公共契约包括以下六项，判定版本号时逐项核对：

| 项 | 具体内容 | 出处 |
|---|---|---|
| 包入口 | `package.json` 的 `main`、`exports`、`files` 字段 | `package.json:9-22` |
| 插件身份 | `cordis.patch.yml` 声明的插件 id、`src/domain.ts` 的 domain 名 `session_status_marker` | `cordis.patch.yml`、`src/domain.ts` |
| Client 槽位 | `sidebar.session.row.trailing`、`sidebar.session.row.hover`、`sidebar.session.row.action`、`sidebar.workspaces.session.menu.item`、`settings.section` 的注入 id | `src/client/*` |
| HTTP 路由 | `/api/session-status-marker.list`、`.mutate`、`.overview` 等 exact route 名与查询参数 | `src/service.ts` |
| 持久化 | 表名 `marks`、`defineDomain` 的 `version: 1`、记录 schema 字段 | `src/domain.ts`、`src/types.ts` |
| 用户可见配置 | `refreshIntervalMs`、`rowActionOrder`、`menuItemOrder` 的字段名、类型与默认值；8 种语言的 locale key | `src/index.ts`、`src/client/locales.ts` |

**条文 A2：主版本号加一的判定。** 出现下列任一情况时，主版本号加一，次版本号与修订号归零：

- 删除或重命名 `src/index.ts` 的导出符号，或修改默认导出的 Service 类名。
- 修改插件 id、domain 名、持久化表名，导致已存标记无法被新版本读出。
- 删除某个 Client 槽位注入或修改注入 id，导致页面上的入口消失。
- 删除或重命名 HTTP route，或修改请求体、响应体的必填字段。
- 删除配置项、修改配置项类型、修改配置项默认值并改变行为。
- 删除 locale key 或修改 key 名（8 种语言字典要求键完全一致，删一个键等于 8 处变更）。

**条文 A3：次版本号加一的判定。** 新增能力且旧用法继续可用时，次版本号加一，修订号归零。典型情形包括新增槽位注入、新增状态种类、新增带默认值的配置项、新增 tool、新增 locale 语言、新增 HTTP route。

**条文 A4：修订号加一的判定。** 只做下列改动时，修订号加一：缺陷修复、样式与配色修正、文案与翻译修正、README 与文档修正、测试补充、依赖区间调整但不改变可安装范围的实际含义、打包内容修正。

**条文 A5：预发布标识的递增规则。** 同一 `X.Y.Z` 内，预发布标识使用 `-rc.N` 或 `-beta.N`，`N` 从 1 开始，每次重新发布必须 `N+1`。即使只改了一行文档或只重新打包一次，也必须递增，因为 npm 拒绝同一个 `name@version` 二次发布（npm 官方文档原文：同一个名称与版本组合一旦发布就永远不能再用，即使执行了 `npm unpublish`）。需要重发同一批改动时，写 `1.2.3-rc.2`。

**条文 A6：预发布优先级的比较规则。** 判定顺序是主版本号、次版本号、修订号逐项按数值比较，三者相同时再比较预发布标识。预发布标识按句点分段从左到右比较：只有数字的段按数值大小比较，含字母或连接号的段按 ASCII 顺序比较，数字段低于非数字段，前缀相同时段数多的更高。因此 `1.2.3-rc.1 < 1.2.3-rc.2 < 1.2.3-rc.10 < 1.2.3`，并且 `1.2.3-beta.2 < 1.2.3-rc.1`。SemVer 2.0.0 规范第 11 条给出的完整示例链是 `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`。

**条文 A7：版本范围里预发布版本的匹配规则（本项目最关键的一条）。** npm 使用的 node-semver 规定：带预发布标识的版本只有在比较器集合中存在「主版本号、次版本号、修订号完全相同且自身带预发布标识」的比较器时，才可能满足该范围。因此 `engines.dsh` 写成 `>=0.2.2` 时，`0.2.2-rc.3` 不满足这个范围，安装会被判为不兼容。正确写法是 `>=0.2.2-rc.1 <0.3.0`，`package.json:33` 已经是这个写法。同样的规则适用于 `peerDependencies` 里九个 `@deepseek-ai/*` 区间（`package.json:42-49`）。

**条文 A8：build metadata 的用法。** `+` 之后的标识符在判断优先层级时被忽略，`1.2.3+build.7` 与 `1.2.3` 属于同一优先层级，两者只有 build metadata 不同。本项目据此确定三条用法：不用 build metadata 区分预发布与正式版；不用它表达兼容性；只在需要把构建来源写进版本串时附加，并且该字符串不得进入 dist-tag 判定，也不得进入 CHANGELOG 的版本小节标题。

**条文 A9：版本号与代码的一致性。** 已发布版本的内容不得修改。任何修复都必须以新版本发布，对应 SemVer 第 3 条。发布后如果发现内容有误，处置方式是 `npm deprecate` 标记问题版本，再用新版本修正，已发布的内容保持原样。

#### 3.1.2 依据

- Semantic Versioning 2.0.0 中文版给出三条递增规则与预发布、build metadata 的完整定义，第 9 条说明预发布标识的组成字符集，第 10 条说明 build metadata 在判断优先层级时可被忽略，第 11 条给出逐段比较的完整算法与示例链。
- node-semver 官方 README 的 Prerelease Tags 段给出本条 A7 的原文规则，并举例说明 `>1.2.3-alpha.3` 这类范围的匹配行为。node-semver issue #123 记录了 `*` 范围与预发布版本的边界讨论，说明这条规则在 npm 生态里长期存在且被广泛依赖。
- npm 官方 `package.json` 文档说明 `version` 字段必须能被 node-semver 解析，`engines` 字段用于声明运行环境范围。
- 本项目的直接证据：1.2.0 把 `engines.dsh` 写成 `>=0.2.2`，DSH 预发布版 `0.2.2-rc.3` 装不上，1.2.1 才改回带预发布标志的写法（`AGENTS.md:109` 记录该次修复，`CHANGELOG.md` 1.2.1 小节有完整说明）。这条失败案例说明 A7 属于必须写进 checklist 的强制条文。
- 另一次相关修正见 `AGENTS.md:68` 的加粗提示与 `AGENTS.md:107` 的 1.1.5 记录：`engines.dsh` 下限恢复为 `>=0.2.2-rc.1`，原因是侧栏徽标依赖 0.2.2-rc.1 才引入的槽位。

#### 3.1.3 本项目落地写法

```text
判定顺序（每次发布前逐项走一遍）
1. 对照 A1 的六项契约，找出本次改动触及的项。
2. 任一契约被破坏          → 主版本号 +1，其余归零
3. 未破坏契约且新增能力    → 次版本号 +1，修订号归零
4. 未破坏契约且只修缺陷    → 修订号 +1
5. 用户尚未验收            → 在算出的 X.Y.Z 后加 -rc.N
6. 同一 X.Y.Z 重发一次     → N 加一
```

### 3.2 版本号与 npm dist-tag

#### 3.2.1 结论条文

**条文 B1：`latest` 的准入条件。** `latest` 只指向用户已在实际前端验收通过的稳定版。判定标准是用户在真实页面上确认功能可用，且验收记录写进 `docs/acceptance-and-regression.md`。当前 `latest` 指向 `1.2.2`，`1.2.3-rc.1` 挂在 `rc` 上。

**条文 B2：预发布的发布命令。** 预发布一律使用 `npm publish --tag rc`（实验性改动可用 `--tag next`）。从 npm 11 起，发布带预发布标识的版本必须显式指定 tag，未指定时命令直接报错退出。`CHANGELOG.md:22` 已记录本次实测结果。

**条文 B3：安装侧的对应写法。** 用户执行 `npm install dsh-session-status-marker` 会装 `latest`；要装预发布必须写 `npm install dsh-session-status-marker@rc`。本项目的 README 与插件市场说明里，预发布版本一律带 `@rc` 后缀出现。

**条文 B4：tag 命名的约束。** dist-tag 名称不得能被解析成 semver 范围。npm 会拒绝 `v1.4` 这类写法，因为它被解释成 `>=1.4.0 <1.5.0`。本项目只用 `latest`、`rc`、`next` 三个 tag 名，都不以数字或字母 `v` 开头。

**条文 B5：回滚的标准动作。** 稳定版出问题时按下列顺序处置，三步都要做：

1. `npm deprecate dsh-session-status-marker@<问题版本> "<原因与修复版本>"` 给问题版本加安装警告。deprecate 的说明要写清问题、修复版本、建议动作三件事，例如 `1.2.1 在桌面端无法加载图标，请升级到 1.2.2`。
2. `npm dist-tag add dsh-session-status-marker@<上一个稳定版> latest` 把 `latest` 指回上一个稳定版。
3. GitHub Release 上把问题版本标记为 prerelease 或在说明里补故障说明。

**条文 B6：不把 `npm unpublish` 当常规手段。** 同一个名称与版本组合发布后永不复用；本项目使用的 granular token 对 unpublish 一律返回 E403，1.2.0 与 1.2.1 的处置就是改用 deprecate 加 dist-tag 回指（`CHANGELOG.md` 1.2.1 小节有完整记录）。

**条文 B7：deprecate 的范围写法要小心。** npm 官方文档说明，传给 `npm deprecate` 的 semver 范围会把预发布版本一起包含在内，`my-thing@1.x` 会连 `1.0.0-beta.0` 一起标记。本项目因此按具体版本号逐个标记。

**条文 B8：发布后必须核对 dist-tag 状态。** npm 走 staged publishing，命令输出 `+ name@version` 只代表请求被接受，registry 先公开 `0.0.0-stage`，约 11 分钟后 `latest` 才切到真实版本（`AGENTS.md:68`）。发布后执行 `npm dist-tag ls dsh-session-status-marker` 核对三个 tag 各自指向的版本，核对结果写进 CHANGELOG 的发布段。

**条文 B9：staged publishing 的批准动作。** 使用 staged publishing 时，`npm publish` 只是把包提交到暂存区，需要维护者在命令行或 npmjs.com 上通过 2FA 显式批准后才会进入正式 registry。发布记录里要区分「已提交暂存」与「已批准上线」两个状态。

#### 3.2.2 依据

- npm `npm-dist-tag` 官方文档说明：发布时如果不带 `--tag`，`latest` 会被设成刚发布的版本；`npm install` 不带版本说明符时安装 `latest`；除 `latest` 之外没有别的 tag 对 npm 自身有特殊含义；可被解析为 semver 范围的 tag 名会被拒绝。
- npm `npm-publish` 官方文档说明同一个名称与版本组合发布后永不复用，并说明 `files` 字段决定打包内容。
- npm `npm-deprecate` 官方文档说明 deprecate 会更新 registry 条目并给所有安装者显示警告，支持版本范围，且范围写法会包含预发布版本；把说明写成空字符串可以解除标记。
- npm CLI 的 11.0.0 版本说明与 PR #7910（标题 `fix!: publishing prerelease requires explicit tag`）记录了「发布预发布版本必须显式指定 tag」这条破坏性变更。
- npm staged publishing 官方文档说明暂存区与批准流程，批准动作需要人在场的 2FA。
- 本项目的直接证据：1.2.0/1.2.1 在桌面端不可用，处置方式是 deprecate 加 `latest` 回指 1.1.6 加 GitHub Release 标 prerelease（`AGENTS.md:109`）；预发布与正式版同发 `latest` 导致用户误装，这条失败案例是 B1 与 B2 的来源。

### 3.3 CHANGELOG 规范

#### 3.3.1 结论条文

**条文 C1：文件结构。** 文件开头是 `# Changelog` 标题，紧接着一段声明格式来源与版本号规范的说明文字，然后是 `## [Unreleased]` 段，之后按版本从新到旧排列。`CHANGELOG.md:1-5` 已经是这个结构。

**条文 C2：六个变更分类固定。** 每个版本小节内部只使用这六个标题：`### 新增`（Added）、`### 变更`（Changed）、`### 弃用`（Deprecated）、`### 移除`（Removed）、`### 修复`（Fixed）、`### 安全`（Security）。没有内容的分类直接省略。当前 `CHANGELOG.md` 使用了「修复」「验证」「发布」三个标题，其中「验证」属于「修复」条目的证据部分，「发布」属于流程记录，需要在下次发布时按本条对齐：验证证据并入对应修复条目，发布信息放到该版本小节开头的一段说明里。

**条文 C3：版本小节标题格式。** 标题写作 `## [X.Y.Z] - YYYY-MM-DD`，预发布版本写作 `## [X.Y.Z-rc.N] - YYYY-MM-DD`。日期使用 ISO 8601 的 `YYYY-MM-DD`，取该版本实际发布的日期，月份写成两位数字，时间部分省略。

**条文 C4：条目写法。** 每条写用户可感知的变化，先写现象，再写实现方式，最后写证据。证据包括文件与行号、测试数量、真实页面截图路径。纯内部重构如果不改变任何用户可感知的行为，不单独成条，并入相关条目的说明。

**条文 C5：Unreleased 段的流转。** 开发期间所有改动先写进 `## [Unreleased]`。发布时把 `## [Unreleased]` 改名为 `## [X.Y.Z] - 日期`，并在文件顶部新开一个空的 `## [Unreleased]`。同一个改动不得同时出现在 Unreleased 与某个版本小节里。

**条文 C6：与 git tag 的一一对应。** 一个 git tag 对应 CHANGELOG 里的一个版本小节，名称完全一致，tag 名带 `v` 前缀（`v1.2.3-rc.1`），CHANGELOG 标题不带前缀（`[1.2.3-rc.1]`）。GitHub Release 的标题与 tag 名一致。三者在同一次发布提交里一起产生。

**条文 C7：标记被撤回的版本。** 如果某个版本发布后被撤回，在该版本标题后加 `[YANKED]` 标记，并在小节开头写撤回原因与替代版本，该小节需要保留。

**条文 C8：链接。** 每个版本标题写成可点击的链接，指向该版本的 GitHub Release 或 compare 视图。文件末尾集中放链接定义，避免正文重复长 URL。

#### 3.3.2 依据

- Keep a Changelog 1.1.0 与 2.0.0 两个版本的规范原文给出：六个变更分类的名称与含义、`YYYY-MM-DD` 日期格式、`Unreleased` 段、`[YANKED]` 标记。2.0.0 的变更说明明确写出「六个变更分类、`YYYY-MM-DD` 日期、`Unreleased` 与 `[YANKED]` 标记都保持不变，已有 changelog 继续有效」。
- Keep a Changelog 的指导原则写明 changelog 面向人阅读，同一类变更要归到一组，版本与分类要可链接，最新版本排在最前，每个版本都要写发布日期。
- GitHub Docs 的 About releases 说明 Release 基于 git tag，tag 日期与 release 日期可以不同，Release 可以附二进制文件与自动生成的说明。
- 本项目的直接证据：`CHANGELOG.md:3` 已声明格式参考 Keep a Changelog 1.1.0 中文版；`CHANGELOG.md:5` 与 `git tag` 的 `v1.2.3-rc.1` 一一对应。

### 3.4 提交规范

#### 3.4.1 结论条文

**条文 D1：标题格式。** 提交标题写成 `<type>(<scope>): <描述>`，scope 可省略。冒号后空一格，描述用中文，结尾不加句号。标题总长度不超过 72 个字符。

**条文 D2：类型集合固定为十一项。** 各类型的适用场景如下：

| 类型 | 适用场景 | 对本项目版本号的影响 |
|---|---|---|
| `feat` | 新增用户可感知的能力，例如新增槽位注入、新增配置项 | 次版本号加一 |
| `fix` | 修复缺陷，例如修复误触复制、修复拒装 | 修订号加一 |
| `docs` | 只改文档、注释、README、CHANGELOG | 不改变版本号 |
| `style` | 只改格式、空白、分号，不改变行为 | 不改变版本号 |
| `refactor` | 重构实现且不改变对外行为 | 不改变版本号 |
| `perf` | 改善性能，例如减少轮询次数 | 不改变版本号 |
| `test` | 新增或修改测试 | 不改变版本号 |
| `build` | 构建脚本、tsconfig、打包流程 | 不改变版本号 |
| `ci` | 持续集成配置 | 不改变版本号 |
| `chore` | 杂项维护，例如依赖升级、发布提交 | 不改变版本号 |
| `revert` | 回退先前的提交 | 视被回退提交的类型而定 |

**条文 D3：scope 取自模块名。** 本项目使用四个 scope：`client`（`src/client/` 下的改动）、`marker`（Host 侧服务与路由）、`release`（版本号、打包、发布脚本）、`docs`（文档）。`git log` 中已出现的 `fix(client):`、`feat(marker):`、`chore(release):`、`fix(docs):` 符合本条。

**条文 D4：BREAKING CHANGE 的两种写法。** 第一种是在 footer 写 `BREAKING CHANGE: <说明>`，第二种是在 type 或 scope 后加感叹号，例如 `feat(api)!: <描述>`。两种写法可以同时使用，此时 footer 提供详细说明。破坏性变更可以是任何类型，`docs!:` 也算。

**条文 D5：与 semver 的映射。** `fix` 对应修订号，`feat` 对应次版本号，带 `BREAKING CHANGE` 的提交对应主版本号。其余类型不产生版本变更，除非它们带 `BREAKING CHANGE` 标记。发布提交写成 `chore(release): <版本号>`，它本身不参与版本号推算。

**条文 D6：一条提交只做一件事。** 修复与文档分开提交，测试与实现可以合并为一条但要在正文说明覆盖范围。跨 Host 与 Client 的改动允许合并为一条，此时 scope 写受影响的模块名并在正文列出两侧改动。

**条文 D7：正文与 footer。** 正文写动机与影响面，每行不超过 72 个字符。footer 用于 `BREAKING CHANGE:`、`Refs:`、`Closes:` 三类信息。回退提交的标题写成 `revert: <被回退提交的标题>`，正文写 `Refs: <被回退提交的 sha>`。

**条文 D8：提交前的自查。** 提交前执行 `git log -1 --pretty=%s` 核对标题格式，并核对本次改动是否需要在 CHANGELOG 的 Unreleased 段补条目。发布提交之前，CHANGELOG 必须已经从 Unreleased 改成目标版本。

#### 3.4.2 依据

- Conventional Commits 1.0.0 规范原文给出标题结构 `<type>[optional scope]: <description>`、三种结构元素、`fix` 对应 PATCH、`feat` 对应 MINOR、`BREAKING CHANGE` 对应 MAJOR 的映射，以及 `!` 与 footer 两种写法。规范同时说明其余类型由各项目自行约定，这些类型对版本号没有隐式影响。
- 规范原文引用的类型清单（来自 `@commitlint/config-conventional`）包含 `build`、`chore`、`ci`、`docs`、`style`、`refactor`、`perf`、`test`，本文的十一项类型集合在此基础上加了 `revert`。
- Git 官方文档的 `git interpret-trailers` 说明 footer 采用 trailer 格式，与 Conventional Commits 的 footer 约定一致。
- 本项目的直接证据：`git log` 中同时存在 `fix(client): 悬停卡空白点击不再复制…`（规范写法）与 `docs: 记录 1.2.2 四点反馈修复与真实页面复核`（缺 scope）、`test: 断言行内图标按钮…`（缺 scope）。风格不统一是 D1 与 D3 的直接来源。

### 3.5 分支与发布流程

#### 3.5.1 结论条文

**条文 E1：分支模式的取舍。** 本项目采用基于主分支的开发（trunk-based development），不建立长期存在的 release 分支。判断依据有三条：维护者只有一人，发布节奏由用户反馈驱动，没有同时维护多个旧版本的需求。trunkbaseddevelopment.com 的说明是：发布频率很高的团队不需要也无法使用 release 分支，缺陷修复直接在主分支上完成后立刻发布。

**条文 E2：需要开分支的唯一情形。** 当 `latest` 指向的稳定版出现必须在旧版本上修、且主分支已经包含不兼容改动时，从该版本的 tag 建 `release/X.Y.x` 分支，在分支上只做缺陷修复，修完打修订号 tag。修复必须同时合并回主分支。trunkbaseddevelopment.com 对这种做法的表述是：release 分支只在必要时创建，创建之后不再接受继续开发的工作。

**条文 E3：发布以 tag 为准。** 稳定版与预发布版都从主分支的提交打 annotated tag 发布，tag 名带 `v` 前缀。Git 官方文档说明附注标签是完整对象，包含打标签者、日期与标签说明，可以签名与校验；轻量标签只是提交的指针。发布一律使用 `git tag -a v<版本号> -m "<版本号>"`。

**条文 E4：release checklist（本项目强制执行）。** 每次发布按下列顺序执行，任一步不通过就停下：

| 步骤 | 动作 | 通过判据 |
|---|---|---|
| 1 | 检查工作区 | `git status` 无未提交改动 |
| 2 | 三条命令 | `pnpm run typecheck`、`pnpm run build`、`pnpm run test` 全部 EXIT=0 |
| 3 | 打包 | `pnpm pack` 生成 tgz，记录字节数 |
| 4 | 版本号对齐 | `package.json:3` 的 version 与 CHANGELOG 顶部版本小节标题一致 |
| 5 | 依赖区间检查 | `engines.dsh` 与九个 `peerDependencies` 下限都带预发布标志 |
| 6 | CHANGELOG 定稿 | `## [Unreleased]` 已改名为 `## [X.Y.Z] - 日期`，六类标题齐全 |
| 7 | 发布提交 | `chore(release): X.Y.Z` 一条提交包含版本号、CHANGELOG、tgz |
| 8 | 打标签 | `git tag -a vX.Y.Z -m "X.Y.Z"`，推送到远端 |
| 9 | GitHub Release | 预发布勾选 prerelease，附 tgz，标题与 tag 一致 |
| 10 | npm 发布 | 稳定版 `npm publish`；预发布 `npm publish --tag rc` |
| 11 | **真实环境前端验收** | 在 dev4090 安装该版本，用 CDP 读几何与截图，明暗两主题各一遍 |
| 12 | 验收结论落盘 | 验收项、观测值、截图路径写进 `docs/acceptance-and-regression.md` |
| 13 | 稳定版放行 | 只有第 11 步通过后，才允许把该版本作为稳定版（`latest` 指向它、Release 取消 prerelease） |
| 14 | 未通过时的处置 | `npm deprecate` 该版本，`latest` 回指上一个稳定版，改发 `-rc.(N+1)` |

**条文 E5：真实环境前端验收的判定标准。** 验收项必须写成可读出的观测值，禁止写「看起来正常」这类无法判定的描述。已有的合格写法包括：读 `getBoundingClientRect()` 确认触发按钮为 24×24、读 computed style 确认卡片背景在浅色主题下与深色主题下不相等、读页面内计数确认浮层数量为 1、点击后读状态确认未出现「已复制」。验收必须在真实页面上做，只跑 typecheck 与单元测试不算验收，原因是历史上出现过单元测试全绿但真实页面上图标尺寸为 0×0 的缺陷（`AGENTS.md:71` 记录该教训）。

**条文 E6：预发布到稳定版的路径。** 用户验收前只发 `-rc.N`。用户验收通过后，把同一份代码的版本号去掉预发布标识（或按 A2/A3/A4 重新判定一次），发布稳定版并把 `latest` 指向它，同时把对应 GitHub Release 的 prerelease 标记去掉。验收不通过时递增 `N` 再发，已经发布的 `-rc.N` 不复用。

**条文 E7：发布记录要写清状态。** 每次发布在 CHANGELOG 的发布段记录四件事：GitHub tag 名、npm 上的版本与 dist-tag 指向、tgz 字节数、验收结论。staged publishing 场景下要额外记录「已提交暂存」与「已批准上线」两个时间点。

#### 3.5.2 依据

- trunkbaseddevelopment.com 的 Release from trunk 页面说明：发布频率很高的团队直接从主分支发布，缺陷修复按最快速度在主分支完成，发布节奏保持稳定。Branch for release 页面说明：release 分支只在必要时创建，创建之后不再接受继续开发的工作，分支可以从历史上的任意提交创建。
- Git 官方 `git-tag` 文档与 Pro Git 第 2.6 节说明附注标签与轻量标签的区别，附注标签是完整对象、包含打标签者与日期、可签名可校验，Pro Git 原文建议为发布点创建附注标签。
- GitHub Docs 的 Managing releases 说明创建 Release 时可以选择已有 tag 或新建 tag，可以勾选「This is a prerelease」标记该版本尚未就绪，也可以选择是否设为 latest release。
- React 官方版本策略与 `scripts/release/README.md` 说明稳定版走 semver，不稳定版本走独立的发布通道（canary、experimental），稳定版由人工从 canary 提升，这条实践与本项目的 `-rc.N` 到稳定版路径一致。
- TypeScript 的发布流程文档说明每次发布依次经过 Beta、Release Candidate、Stable 三个阶段，破坏性变更尽量在 Beta 之前完成，RC 阶段只做缺陷修复，这条实践支撑 E6 里「预发布阶段只修缺陷」的做法。
- 本项目的直接证据：1.2.0 与 1.2.1 在用户桌面端不可用，说明当时缺少真实环境验收这一步；`AGENTS.md:71` 的教训「只看 DOM 字符串会漏掉 0×0 布局缺陷」支撑 E5。

### 3.6 协作规范

#### 3.6.1 结论条文

**条文 F1：Issue 模板要素。** 新建 Issue 必须包含八项：现象描述、复现步骤、DSH 版本、插件版本、主题（浅色或深色）、界面语言、期望结果与实际结果、截图或日志。缺少任意一项时，维护者要求补充后再处理。模板文件放在 `.github/ISSUE_TEMPLATE/`，GitHub Docs 说明模板必须放在默认分支的这个目录下才会在新建 Issue 页面出现。

**条文 F2：PR 模板要素。** 提交 PR 必须填写六项：变更动机、影响面（逐项标注是否触及 A1 的六项契约）、验证方式与证据、CHANGELOG 是否已更新、回滚方式、是否触及架构约束。模板文件命名为 `.github/PULL_REQUEST_TEMPLATE.md`，GitHub Docs 说明该文件的内容会自动出现在 PR 正文里。

**条文 F3：代码评审的八个维度。** 评审按下列顺序检查，每项给出结论：设计是否与现有架构一致、功能是否符合作者声明的意图、实现能否更简单、测试是否覆盖新行为与回归、命名是否清晰、注释是否说明原因、风格是否与项目一致、文档是否同步更新。这套维度来自 Google 工程实践文档的评审清单。

**条文 F4：本项目的附加评审项。** 在 F3 之外增加五项强制检查，任一项不通过就要求修改：

1. 是否引入自定义 `SessionEventMap` 事件（架构约束禁止）。
2. 是否调用了 `appendPluginRecord`（架构约束禁止）。
3. 持久化是否只走 `ctx.storageDomain`。
4. Client 样式是否只用 `--dsw-*` 令牌，是否出现字面颜色值。
5. 新增文案是否补齐 8 种语言的 locale key，键名是否完全一致。

**条文 F5：任务拆解粒度。** 一个任务应当能在一次会话内完成，并且能用一条命令验证结果。跨 Host 与 Client 的改动拆成两个任务，Host 侧的契约先落地并验证，Client 侧随后接入。发布相关的任务拆成「准备」「发布」「验收」三个任务，验收任务必须在发布任务之后。

**条文 F6：完成的定义（DoD）。** 一个任务只有同时满足下列六项才算完成：

1. 代码实现并符合项目代码风格要求（`strict`、无 `as unknown`、导出有 JSDoc）。
2. `pnpm run typecheck` 与 `pnpm run test` 全部通过，新增行为有对应测试。
3. CHANGELOG 的 Unreleased 段有对应条目。
4. 相关文档已更新，并写明版本号与日期。
5. 涉及 Client 的改动有真实页面验收证据（截图路径与观测值）。
6. 写明回滚方式。

**条文 F7：评审结论的三种状态。** 评审意见分三种：必须修改、建议修改、仅说明。必须修改项全部处理完才能合并；建议修改项由作者决定是否采纳，并在回复里说明理由。GitHub Docs 对评审决策的表述是 Comment、Approve、Request changes 三种，与这三种结论一一对应。

**条文 F8：任务与发布的关系。** 只有进入 release checklist 的改动才影响版本号。文档任务、测试任务、构建脚本任务在版本号判定时归入修订号或不计入变更。

#### 3.6.2 依据

- GitHub Docs 的 About issue and pull request templates 说明模板的作用是统一贡献者填写的信息，Issue 模板存放在 `.github/ISSUE_TEMPLATE` 目录，文件名大小写不敏感，Issue 表单使用 `.yml` 扩展名；PR 模板的内容会自动出现在新建 PR 的正文里。
- GitHub Docs 的 Pull request reviews 说明评审的三种决策是 Comment、Approve、Request changes，仓库管理员可以通过分支保护要求合并前必须有批准。
- Google 工程实践的代码评审文档给出八个检查维度：设计、功能、复杂度、测试、命名、注释、风格、文档，并说明评审的目标是持续改善代码健康度。
- Scrum.org 对完成的定义的说明是：完成的定义描述增量达到产品质量标准时的状态，未满足完成的定义的条目不能被发布；完成的定义由团队共同写下并共同遵守。
- Vue 官方贡献指南说明 PR 的接受范围：修复必须有清晰可复现的缺陷，新功能必须有明确且广泛适用的场景，纯风格重构不被接受。Vite 官方贡献指南说明依赖管理原则与提交前必须执行的构建与测试步骤。这两个项目的做法支撑 F5 与 F6 里「一个任务要有可验证的完成判据」。
- pnpm 官方版本管理文档给出变更意图文件的做法：开发时用 `pnpm change` 记录本次改动影响哪些包、按什么级别递增、以及一段将进入 changelog 的说明，发布时一次性消费这些意图。本项目只有一个包，这套做法的价值在于「改动发生时就把 changelog 文案写好」，可以按需引入。
- 本项目的直接证据：仓库当前没有 `.github` 目录，F1 与 F2 的模板文件属于待创建项；`AGENTS.md` 的架构约束段落是 F4 前三条的来源；`AGENTS.md:80-86` 的代码风格段落是 F6 第 1 条的来源。

---

## 4. 本项目的落地清单

以下条目可直接勾选执行。每条都给出判定方式，勾选时把判定结果写在条目后面。

### 4.1 版本号

- [ ] 对照 A1 的六项契约，逐项确认本次改动触及哪几项，把结论写进发布提交的正文。
- [ ] 按 A2/A3/A4 判定主版本号、次版本号、修订号，把判定依据写进 CHANGELOG 该版本小节的开头。
- [ ] 用户尚未验收时，版本号带 `-rc.N`；同一 `X.Y.Z` 重发时 `N` 加一（A5）。
- [ ] 已发布的 `name@version` 不复用，重发一律递增 `N`（A5、A9）。
- [ ] `package.json:33` 的 `engines.dsh` 下限带预发布标志，写成 `>=0.2.2-rc.1 <0.3.0`（A7）。
- [ ] `package.json:42-49` 的九个 `peerDependencies` 区间下限同样带预发布标志（A7）。
- [ ] 版本串里不使用 build metadata 表达兼容性或预发布状态（A8）。

### 4.2 dist-tag 与回滚

- [ ] `latest` 指向的版本已经过用户实际前端验收（B1）。
- [ ] 预发布使用 `npm publish --tag rc`，命令里显式写 tag（B2）。
- [ ] README 与插件市场说明里，预发布版本以 `@rc` 形式出现（B3）。
- [ ] 只使用 `latest`、`rc`、`next` 三个 tag 名（B4）。
- [ ] 发布后执行 `npm dist-tag ls dsh-session-status-marker`，把三个 tag 的指向写进 CHANGELOG 发布段（B8）。
- [ ] staged publishing 场景下区分「已提交暂存」与「已批准上线」两个时间点（B9）。
- [ ] 出问题时执行 deprecate 加 dist-tag 回指，不使用 unpublish（B5、B6）。
- [ ] deprecate 按具体版本号标记（B7）。

### 4.3 CHANGELOG

- [ ] 文件顶部保留 `# Changelog` 标题与格式声明（C1）。
- [ ] 保留 `## [Unreleased]` 段，开发期间的改动先写进这一段（C5）。
- [ ] 版本小节标题写成 `## [X.Y.Z] - YYYY-MM-DD`，日期为实际发布日（C3）。
- [ ] 小节内部只使用新增、变更、弃用、移除、修复、安全六个标题（C2）。
- [ ] 把现有的「验证」「发布」两个标题按 C2 归并：验证证据并入修复条目，发布信息放到版本小节开头说明。
- [ ] 每条写现象、实现、证据三部分，证据含文件行号或截图路径（C4）。
- [ ] 版本小节标题、git tag 名、GitHub Release 标题三者一致（C6）。
- [ ] 被撤回的版本加 `[YANKED]` 标记并写撤回原因，小节保留（C7）。

### 4.4 提交

- [ ] 提交标题写成 `<type>(<scope>): <描述>`，长度不超过 72 字符（D1）。
- [ ] 类型取自十一项集合：feat、fix、docs、style、refactor、perf、test、build、ci、chore、revert（D2）。
- [ ] scope 取自 client、marker、release、docs 四个值（D3）。
- [ ] 破坏性变更使用 `!` 或 `BREAKING CHANGE:` footer，两者可同时用（D4）。
- [ ] 发布提交单独一条，写成 `chore(release): X.Y.Z`（D5）。
- [ ] 回退提交写成 `revert: <被回退提交标题>`，正文写 `Refs: <sha>`（D7）。
- [ ] 提交前执行 `git log -1 --pretty=%s` 核对格式（D8）。

### 4.5 分支与发布

- [ ] 日常开发在主分支进行，不建长期 release 分支（E1）。
- [ ] 只有需要给已发布版本单独修缺陷时才建 `release/X.Y.x` 分支，修复同时合并回主分支（E2）。
- [ ] 发布使用附注标签：`git tag -a vX.Y.Z -m "X.Y.Z"`（E3）。
- [ ] 按 E4 的十四步执行 release checklist，逐步记录结果。
- [ ] **checklist 第 11 步「真实环境前端验收」已完成**，验收项写成可读出的观测值（E4、E5）。
- [ ] 验收证据写进 `docs/acceptance-and-regression.md`，含截图路径与观测值（E4 第 12 步）。
- [ ] 验收通过后才把版本作为稳定版发布，验收未通过时改发 `-rc.(N+1)`（E6）。
- [ ] CHANGELOG 发布段记录 tag 名、dist-tag 指向、tgz 字节数、验收结论（E7）。

### 4.6 协作

- [ ] 创建 `.github/ISSUE_TEMPLATE/` 目录与 Issue 模板，含 F1 的八项要素。
- [ ] 创建 `.github/PULL_REQUEST_TEMPLATE.md`，含 F2 的六项要素。
- [ ] 评审按 F3 的八个维度逐项给结论。
- [ ] 评审时执行 F4 的五项强制检查。
- [ ] 任务拆解到「一次会话可完成、一条命令可验证」的粒度，跨 Host 与 Client 的改动拆成两个任务（F5）。
- [ ] 任务完成前核对 F6 的六项，任一项缺失不标记完成。
- [ ] 评审意见按必须修改、建议修改、仅说明三种结论归类（F7）。

### 4.7 下一次发布（1.2.3 正式版）的即时动作

- [ ] 用户在实际前端验收 1.2.3-rc.1 的改动，把结论写进 `docs/acceptance-and-regression.md`。
- [ ] 验收通过后，把 `package.json:3` 的版本从 `1.2.3-rc.1` 改为 `1.2.3`，按 A4 判定为修订号（只修缺陷、不破坏契约）。
- [ ] CHANGELOG 新增 `## [1.2.3] - 日期` 小节，把 `-rc.1` 小节的条目归入对应分类。
- [ ] 按 E4 执行发布，npm 侧使用 `npm publish`（不带 `--tag`），让 `latest` 指向 `1.2.3`。
- [ ] 发布后核对 `npm dist-tag ls`，确认 `latest` 为 `1.2.3`、`rc` 仍指向 `1.2.3-rc.1` 或按需清理。
- [ ] 把 GitHub Release `v1.2.3` 的 prerelease 标记去掉。

---

## 5. 参考链接汇总表

下表按主题分组，全部为官方规范、官方文档或项目自身仓库文档。抓取到原文的页面在「核对情况」列注明。

| 编号 | 名称 | 地址 | 用途 | 核对情况 |
|---|---|---|---|---|
| 1 | Semantic Versioning 2.0.0（中文版） | https://semver.org/lang/zh-CN/ | 三条递增规则、预发布标识定义（第 9 条）、build metadata（第 10 条）、优先级比较算法与示例链（第 11 条） | 已抓取原文 |
| 2 | Semantic Versioning 2.0.0（英文版） | https://semver.org/spec/v2.0.0.html | 条文英文原文核对 | 检索命中，条文与中文版一致 |
| 3 | node-semver 官方 README | https://github.com/npm/node-semver/blob/main/README.md | 预发布版本的范围匹配规则（Prerelease Tags 段）、比较函数清单 | 已抓取原文 |
| 4 | node-semver issue #123 | https://github.com/npm/node-semver/issues/123 | `*` 范围与预发布版本匹配的边界讨论，佐证 A7 规则的长期存在 | 已抓取原文 |
| 5 | npm Docs：npm-publish | https://docs.npmjs.com/cli/v11/commands/npm-publish/ | 同名同版本永不复用、`files` 字段决定打包内容 | 已抓取原文 |
| 6 | npm Docs：npm-dist-tag | https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/ | `latest` 的默认行为、`--tag` 的作用、tag 名不得为 semver 范围 | 已抓取原文 |
| 7 | npm Docs：npm-deprecate | https://docs.npmjs.com/cli/v12/commands/npm-deprecate/ | deprecate 的范围写法会包含预发布版本、解除标记的方式 | 已抓取原文 |
| 8 | npm Docs：npm-version | https://docs.npmjs.com/cli/v11/commands/npm-version/ | `preid` 参数、`git-tag-version` 默认行为 | 已抓取原文 |
| 9 | npm Docs：package.json | https://docs.npmjs.com/cli/v11/configuring-npm/package-json/ | `version` 必须可被 node-semver 解析、`engines` 字段用途 | 已抓取原文 |
| 10 | npm Docs：Staged publishing | https://docs.npmjs.com/staged-publishing/ | 暂存区与 2FA 批准流程 | 检索命中 |
| 11 | npm CLI PR #7910 | https://github.com/npm/cli/pull/7910 | 「发布预发布版本必须显式指定 tag」的破坏性变更记录 | 已抓取原文 |
| 12 | Keep a Changelog 1.1.0 | https://keepachangelog.com/en/1.1.0/ | 六个变更分类、`Unreleased` 段、指导原则、示例结构 | 已抓取原文 |
| 13 | Keep a Changelog 2.0.0 | https://keepachangelog.com/en/2.0.0/ | 2.0.0 变更说明确认六个分类与日期格式不变 | 已抓取原文 |
| 14 | Conventional Commits 1.0.0 | https://www.conventionalcommits.org/en/v1.0.0/ | 标题结构、类型集合、BREAKING CHANGE 两种写法、与 semver 的映射 | 已抓取原文 |
| 15 | Git 官方文档：git-tag | https://git-scm.com/docs/git-tag | 附注标签与轻量标签的差别、`-a` 与 `-m` 的语义 | 已抓取原文 |
| 16 | Pro Git 第 2.6 节：打标签（中文版） | https://git-scm.com/book/zh/v2/Git-基础-打标签 | 附注标签包含打标签者、日期与标签说明，可签名可校验 | 已抓取原文 |
| 17 | GitHub Docs：About releases | https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases | Release 基于 git tag、tag 日期与 release 日期可以不同、可附资产 | 已抓取原文 |
| 18 | GitHub Docs：Managing releases | https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository | prerelease 勾选项、latest release 的选择方式、tag 的创建路径 | 已抓取原文 |
| 19 | GitHub Docs：About issue and pull request templates | https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates | 模板存放目录、Issue 表单的扩展名要求、PR 模板自动填充 | 已抓取原文 |
| 20 | GitHub Docs：Pull request reviews | https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews | Comment、Approve、Request changes 三种决策、分支保护的批准要求 | 已抓取原文 |
| 21 | Trunk Based Development：Release from trunk | https://trunkbaseddevelopment.com/release-from-trunk/ | 发布频率高的团队直接从主分支发布、缺陷在主分支修复 | 已抓取原文 |
| 22 | Trunk Based Development：Branch for release | https://trunkbaseddevelopment.com/branch-for-release/ | release 分支只在必要时创建、创建后不再接受继续开发、可从历史提交创建 | 已抓取原文 |
| 23 | React 版本策略 | https://react.dev/community/versioning-policy | 稳定版遵循 semver、不稳定版本走独立通道、破坏性变更尽量减少 | 已抓取原文 |
| 24 | React 发布脚本说明 | https://github.com/facebook/react/blob/main/scripts/release/README.md | canary 到 stable 的提升为人工步骤、预发布由自动化持续发布 | 已抓取原文 |
| 25 | TypeScript 发布流程 | https://github.com/microsoft/TypeScript/wiki/TypeScript's-Release-Process | Beta、Release Candidate、Stable 三阶段，RC 阶段只修缺陷 | 已抓取原文 |
| 26 | Vue 贡献指南 | https://github.com/vuejs/core/blob/main/.github/contributing.md | PR 接受范围、缺陷必须可复现、纯风格重构不被接受 | 已抓取原文 |
| 27 | Vite 贡献指南 | https://github.com/vitejs/vite/blob/main/CONTRIBUTING.md | 提交前的构建与测试步骤、依赖管理原则 | 已抓取原文 |
| 28 | pnpm 版本管理文档 | https://pnpm.io/versioning | 变更意图文件的做法：改动时写清递增级别与 changelog 文案 | 已抓取原文 |
| 29 | Google 工程实践：代码评审 | https://google.github.io/eng-practices/review/ | 八个评审维度、评审目标 | 已抓取原文 |
| 30 | Scrum.org：完成的定义 | https://www.scrum.org/resources/what-definition-done | 完成的定义描述增量达到质量标准时的状态，未满足不能发布 | 已抓取原文 |

### 5.1 未采用的来源类型

检索过程中命中的 CSDN、腾讯云开发者社区、阿里云开发者社区、华为云开发者社区、抖音、简书、博客园聚合页、51CTO、w3cschool 等站点一律未采用，理由有两条：这些站点的内容多为转载且缺少原文出处，版本与日期无法核对；本文需要的条文在 semver.org、npm Docs、GitHub Docs、Git 官方文档与各项目自身仓库里都有原文可查。另有若干第三方博客讨论 deprecate 说明的写法与 prerelease 的实践，内容与 npm 官方文档重复，本文改用官方文档作为引用来源。

---

## 6. 待办与后续

1. `.github` 目录尚不存在，Issue 模板与 PR 模板属于待创建项，见 §4.6。
2. `CHANGELOG.md` 现有的「验证」「发布」两个标题需要在下次发布时按 C2 归并，见 §4.3。
3. 1.2.3 正式版等待用户实际前端验收，验收通过后按 §4.7 执行。
4. 提交信息风格不统一的历史记录（缺 scope 的 `docs:` 与 `test:` 提交）不做回溯修改，新提交按 D1 与 D3 执行即可。
