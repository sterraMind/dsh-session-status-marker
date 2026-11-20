# 协作规范 · dsh-session-status-marker

> **文档版本**：v1.2.3-rc.2 · 最后更新：2026-11-20（对应插件 1.2.3-rc.2）

> 本文件面向本仓库的协作者，包括人员与智能体。内容覆盖环境准备、常用命令、代码风格、提交规范、合并请求与评审要求、智能体协作要求、禁止事项。
> 发布相关的规则见 `docs/release-process.md`，变更记录见 `CHANGELOG.md`，验收证据见 `docs/acceptance-and-regression.md`，架构约束见 `AGENTS.md` 与 `docs/architecture.md`。
> 适用范围：所有向本仓库提交代码、文档或发布动作的协作者。本文件与 `AGENTS.md` 冲突时，以 `AGENTS.md` 的架构约束为准。

---

## 1. 环境准备

### 1.1 必需工具

| 工具 | 版本要求 | 核对方式 |
|---|---|---|
| Node.js | 24.9.0 或更高（`package.json:34`） | `node --version` |
| pnpm | 仓库使用 pnpm 管理依赖，不使用 npm 或 npx 安装依赖 | `pnpm --version` |
| DeepSeek Harness | 0.2.2-rc.1 到 0.3.0 之间（`package.json:33`） | 查看 Harness 安装目录的版本号，低于下限时侧栏标题旁没有插槽，状态图标不会显示 |

Node 版本下限写在 `package.json` 的 `engines.node` 字段，Harness 版本区间写在同段的 `engines.dsh` 字段。低于 Node 下限时，构建脚本与测试运行器可能无法执行。

### 1.2 依赖安装

在仓库根目录执行下列命令安装依赖。

```bash
pnpm install --ignore-scripts
```

`pnpm-workspace.yaml` 已经固定了两项设置，安装前不需要手工修改。

| 设置项 | 取值 | 作用 |
|---|---|---|
| `storeDir` | `./.pnpm-store` | 把依赖存储放在仓库内部，避开本机全局存储的索引数据库无法读取的问题 |
| `verifyDepsBeforeRun` | `false` | 关闭每次执行脚本前的依赖预检查 |

`.npmrc` 里重复声明了同样的两项设置，并且把 `registry` 指向 `https://registry.npmjs.org/`。这两处配置必须保持一致，修改其中一处时同步修改另一处。

如果安装过程报出存储相关的错误，改用下列命令显式指定存储目录。

```bash
pnpm --config.verify-deps-before-run=false --config.store-dir="./.pnpm-store" install --ignore-scripts
```

### 1.3 本机环境的已知限制

Windows 上部分命令会受到进程创建限制的影响。遇到下列现象时按对应说明处理。

| 现象 | 原因 | 处理方式 |
|---|---|---|
| `spawn EPERM` | 环境禁止以管道方式启动子进程 | 使用仓库自带的构建脚本与测试命令，它们不依赖这类子进程 |
| `ERR_SQLITE_ERROR` | 全局依赖存储的索引数据库无法读取 | 确认 `storeDir` 指向 `./.pnpm-store` |
| npm 日志目录写入失败 | 本机 npm 日志目录权限不足 | 把日志目录重定向到仓库内或临时目录 |

---

## 2. 常用命令

下列命令都在仓库根目录执行。

| 用途 | 命令 | 通过判据 |
|---|---|---|
| 类型检查 | `pnpm run typecheck` | 退出码为 0，无输出 |
| 构建 | `pnpm run build` | 退出码为 0，`lib/` 与 `lib/client.js` 重新生成 |
| 只构建 Host 侧 | `pnpm run build:host` | 退出码为 0 |
| 只构建浏览器端 | `pnpm run build:client` | 退出码为 0 |
| 运行单元测试 | `node --test --test-isolation=none tests/*.test.mjs` | 失败数为 0 |
| 运行完整测试流程 | `pnpm run test` | 先构建再跑测试，失败数为 0 |
| 监听模式跑测试 | `pnpm run test:watch` | 用于开发过程中反复执行 |
| 打包 | `pnpm pack` | 生成 `dsh-session-status-marker-<版本>.tgz`，记录字节数 |

`pnpm run test` 依次执行三条命令：`tsc -p tsconfig.json`、`node scripts/build-client.mjs`、`node --test --test-isolation=none tests/*.test.mjs`（见 `package.json:27`）。只改文档时不需要执行构建。只改浏览器端代码时执行 `pnpm run build:client` 再运行测试即可。

测试命令必须带 `--test-isolation=none` 参数。不带这个参数时，测试运行器会为每个测试文件启动独立的子进程，本机环境会拒绝这类进程创建。`package.json` 的 `test`、`test:node`、`test:watch` 三个脚本已经带上这个参数。

### 2.1 提交前的三条命令

提交代码之前依次执行下列三条命令，三条都通过才能提交。

```bash
pnpm run typecheck
pnpm run build
node --test --test-isolation=none tests/*.test.mjs
```

---

## 3. 代码风格要点

### 3.1 类型与编译

- 编译器配置在 `tsconfig.json`，`strict` 与 `noImplicitAny` 都已打开，目标为 ES2022，模块体系为 NodeNext。
- 不新增 `as unknown` 断言。需要收窄类型时使用类型守卫或者显式校验。
- 配置字段使用 `z` 的 `.required()` 声明，不在代码里硬编码默认值。配置错误时直接报错，不静默降级。
- 处理封闭联合类型时按判别字段分支，并让编译器检查分支是否穷尽；可扩展的联合类型在默认分支返回明确的兜底值。

### 3.2 注释与文档

- 每个导出符号都必须写 JSDoc。这条要求对齐 DeepSeek Harness 主仓库的 `verify-export-jsdoc` 检查。
- 注释说明为什么这样做，不复述代码做了什么。
- 每个文件结尾恰好一个换行，不留多余空行。

### 3.3 浏览器端样式

- 浏览器端组件的样式只使用 `--dsw-*` 主题令牌，不写任何字面颜色值。字面颜色会让界面在浅色与深色主题下出现割裂。
- 这条规则由 `tests/theme.test.mjs` 断言：样式声明里不出现 `color:` 字面值，也不出现 `background: currentColor`。
- 需要覆盖宿主组件样式时，用属性选择器配合 `:has()` 限定命中范围，只命中包含本插件槽位的那个节点。

### 3.4 界面文案与语言字典

- 界面文案全部走 `src/client/locales.ts` 的类型化字典，组件里通过翻译函数取值，不写裸字符串。
- 字典覆盖八种语言：`zh`、`en`、`ja`、`es`、`fr`、`de`、`ru`、`pt`，由 `DICTIONARIES` 一次注册。
- 八种语言的键必须完全一致。`tests/i18n.test.mjs` 以中文（`zh`）的键集合为准，逐个比对其余七种语言的键集合与占位符，多一个键或少一个键都会失败。
- 新增一种语言时补齐全部键。缺失的键会按 `FALLBACK_LOCALE` 回退成英文，用户看到的是混合语言界面。

### 3.5 架构约束

浏览器端与 Host 侧之间只允许通过既有通道通信。下列三条来自 `AGENTS.md` 的架构约束，评审时逐条核对。

1. 不新增自定义 `SessionEventMap` 事件。仓库外插件不能写这类事件，读取路径会对未知事件整份拒读。
2. 不调用 `appendPluginRecord`。这个接口禁止仓库外插件使用。
3. 持久化只走 `ctx.storageDomain`。状态记录存放在 Harness 自己的数据目录，不写进会话记录，因此不占用对话上下文。

---

## 4. 提交规范

### 4.1 标题格式

提交标题写成 `<type>(<scope>): <描述>`。冒号后空一格，描述使用中文，结尾不加句号，标题总长度不超过 72 个字符。

示例：`fix(client): 悬停卡空白点击不再复制`

### 4.2 类型集合

类型取自下列十一项，不自行发明新的类型。

| 类型 | 适用场景 | 对版本号的影响 |
|---|---|---|
| `feat` | 新增用户可感知的能力 | 次版本号加一 |
| `fix` | 修复缺陷 | 修订号加一 |
| `docs` | 只改文档、注释、变更记录 | 不改变版本号 |
| `style` | 只改格式、空白、分号，不改变行为 | 不改变版本号 |
| `refactor` | 重构实现且不改变对外行为 | 不改变版本号 |
| `perf` | 改善性能 | 不改变版本号 |
| `test` | 新增或修改测试 | 不改变版本号 |
| `build` | 构建脚本、编译器配置、打包流程 | 不改变版本号 |
| `ci` | 持续集成配置 | 不改变版本号 |
| `chore` | 杂项维护，包括依赖升级与发布提交 | 不改变版本号 |
| `revert` | 回退先前的提交 | 视被回退提交的类型而定 |

### 4.3 scope 取值

scope 取自下列四个值，可以省略。

| scope | 覆盖范围 |
|---|---|
| `client` | `src/client/` 下的改动 |
| `marker` | Host 侧服务与路由 |
| `release` | 版本号、打包、发布脚本 |
| `docs` | 文档 |

### 4.4 破坏性变更

破坏性变更有两种写法，可以同时使用。第一种是在标题的类型或者 scope 后加感叹号，例如 `feat(api)!: 移除旧字段`；第二种是在正文末尾写 `BREAKING CHANGE: <说明>`，说明具体影响与迁移方式。两种写法同时使用时，正文里的说明写详细内容。

### 4.5 一次提交只做一件事

- 缺陷修复与文档修改分开提交。
- 测试与实现可以合并成一条提交，正文里说明覆盖范围。
- 跨 Host 与浏览器端的改动可以合并成一条提交，此时 scope 写受影响的模块名，正文里列出两侧的改动。
- 发布提交单独一条，写成 `chore(release): <版本号>`。

### 4.6 正文与页脚

正文写改动的动机与影响面，每行不超过 72 个字符。页脚用于 `BREAKING CHANGE:`、`Refs:`、`Closes:` 三类信息。回退提交的标题写成 `revert: <被回退提交的标题>`，正文写 `Refs: <被回退提交的标识>`。

### 4.7 提交前自查

提交前执行 `git log -1 --pretty=%s` 核对标题格式，并核对本次改动是否需要在 `CHANGELOG.md` 的未发布段补一条记录。

---

## 5. 合并请求与评审

### 5.1 合并请求必须填写的内容

| 项目 | 要求 |
|---|---|
| 变更动机 | 说明要解决的问题，以及为什么采用当前做法 |
| 影响面 | 逐项标注是否触及 `docs/release-process.md` §2.1 的六项公共契约 |
| 验证方式 | 列出执行的命令与结果 |
| 真实页面验收证据 | 观测值与截图路径，要求见 §5.2 |
| 变更记录 | 说明 `CHANGELOG.md` 的未发布段是否已补条目 |
| 回滚方式 | 说明如何撤回本次改动 |
| 架构约束 | 说明是否触及 §3.5 的三条约束 |

### 5.2 真实页面验收证据

涉及浏览器端界面的改动必须提供真实页面上的验收证据。只执行类型检查与单元测试不构成验收，因为历史上出现过单元测试全部通过、真实页面上图标尺寸为 0×0 的缺陷。

验收证据必须写成可以核对的观测值，包含三项内容：读了哪个属性或者哪段样式，实际值是多少，期望值是多少。合格写法举例如下。

| 验收项 | 观测方式 | 合格判据 |
|---|---|---|
| 触发按钮尺寸 | 读 `getBoundingClientRect()` | 宽高均为 24 |
| 卡片背景随主题变化 | 读计算样式里的背景色 | 浅色主题与深色主题下的取值不相等 |
| 浮层数量 | 统计页面内的浮层节点数量 | 同时最多一个 |
| 点击不触发复制 | 点击后读页面状态 | 没有出现「已复制」提示 |

截图保存在 `.drafts/shots/` 目录，文件名以版本号开头，例如 `v123-card-guard.png`。截图必须在浅色与深色两个主题下各留一张。`.drafts/` 目录已经在 `.gitignore` 里排除，截图不进入提交，只作为验收证据在合并请求里引用路径。

### 5.3 评审维度

评审按下列顺序逐项给出结论。

1. 设计是否与现有架构一致。
2. 功能是否符合提交者声明的意图。
3. 实现能否更简单。
4. 测试是否覆盖新行为与回归场景。
5. 命名是否清晰。
6. 注释是否说明了原因。
7. 风格是否与项目一致。
8. 文档与变更记录是否同步更新。

### 5.4 附加检查项

在上述八个维度之外，逐条核对下列五项，任一项不通过就要求修改。

1. 是否引入自定义 `SessionEventMap` 事件。
2. 是否调用 `appendPluginRecord`。
3. 持久化是否只走 `ctx.storageDomain`。
4. 浏览器端样式是否只用 `--dsw-*` 主题令牌，是否出现字面颜色值。
5. 新增文案是否补齐八种语言的键，键名是否完全一致。

### 5.5 评审结论的三种状态

评审意见分为必须修改、建议修改、仅说明三种。必须修改项全部处理完才能合并；建议修改项由提交者决定是否采纳，并在回复里说明理由。

---

## 6. 智能体协作要求

本节面向以智能体身份参与本仓库工作的协作者。人员协作者同样适用。

### 6.1 任务必须原子化

一个任务必须自带五项内容，缺少任意一项就退回重新拆分。

| 项目 | 内容 |
|---|---|
| 输入 | 读哪些文件、执行哪些命令 |
| 输出 | 产物路径与格式 |
| 验收判据 | 可执行的命令与期望结果 |
| 允许修改的范围 | 明确的文件清单或者目录前缀 |
| 预算 | 时间上限与第一个落盘检查点 |

一个任务只产出一个可以判定的结果。验收判据必须能用一条命令或者一次页面读取表达；需要三条以上互不相关的命令才能判定时，说明这个任务需要继续拆分。

### 6.2 写入范围不得重叠

- 同一个文件在同一时刻只能由一个协作者修改。并行处理时，各协作者的允许修改范围必须互不相交。
- 下列共享文件由主会话独占修改：`package.json`、`AGENTS.md`、`README.md`、统一导出文件（`src/index.ts`）、语言字典文件（`src/client/locales.ts`）、锁文件（`pnpm-lock.yaml`）。
- 派发任务时把允许修改的范围写进任务说明。任务完成后核对实际改动是否越界，越界写入必须回退。

### 6.3 完成后必须自测并交付验收证据

任务标记完成之前，逐项确认下列六条。

1. 代码符合 §3 的代码风格要求。
2. `pnpm run typecheck` 与测试命令都通过，新增行为有对应测试。
3. `CHANGELOG.md` 的未发布段有对应条目。
4. 相关文档已更新，写明版本号与日期。
5. 涉及浏览器端界面的改动有真实页面验收证据，包含截图路径与观测值。
6. 写明回滚方式。

交付结果时同时给出四类信息：产物路径、执行的命令与退出码、观测值、截图路径。结论必须与产物内容一致。出现下列任一情况时任务重新执行：产物缺失；命令无法重新执行；结论与产物矛盾；越界写入影响了其他任务的产物；协作者自行改写了验收判据。

### 6.4 失败处理

同一条命令连续失败两次时停止重试，改用检索查找原因或者向用户报告。不得在没有依据的情况下反复尝试同一条命令，也不得为了避开报错而改用手工操作实现结果。

---

## 7. 禁止事项

下列做法不经过插件的安装与校验机制，导致故障难以定位，一律禁止。

| 禁止做法 | 原因 | 正确做法 |
|---|---|---|
| 手工修改 profile 目录里的文件来让插件生效 | 不经过插件的安装与校验流程，profile 状态与安装记录不一致，后续升级与卸载会失败 | 使用 `dsh plugin --profile <名称> add <包名或者 tgz 路径>` 安装，用 `dsh plugin --profile <名称> remove <包名>` 卸载 |
| 手写 `cordis.patch.yml` 冒充安装 | 安装记录里没有这次安装，Harness 认为插件未安装，重启后配置不生效 | 由插件安装命令生成配置，只在需要调整配置项时修改已有条目 |
| 在源码里硬编码绝对路径 | 换一台机器或者换一个用户目录后无法运行，也无法在测试机上复现 | 路径从环境变量或者仓库根目录解析，例如 `DSH_HOME`、`TEMP` |
| 用 `npm unpublish` 撤回已发布版本 | 同一个名称与版本组合发布后不能复用，本项目使用的访问令牌会返回 E403 | 按 `docs/release-process.md` §9 使用 `npm deprecate` 并把 `latest` 指回上一个正式版 |
| 把预发布版本发布到 `latest` 标签 | 用户普通安装会得到未经验收的版本 | 预发布使用 `npm publish --tag rc`，正式版发布前必须通过用户验收 |
| 在浏览器端样式里写字面颜色 | 界面无法跟随浅色与深色主题 | 只使用 `--dsw-*` 主题令牌 |
| 只给一种语言补文案 | 其余七种语言回退成英文，界面出现混合语言 | 八种语言同时补齐，键名保持一致 |
| 用模拟数据代替真实页面验收 | 结构存在不等于功能正确，布局缺陷只在真实页面上暴露 | 在真实页面上读几何尺寸与计算样式，并留下截图 |

---

## 8. 参考资料

下表只列本文件实际引用过的资料，全部取自 `docs/research/10-release-and-versioning.md` 的参考链接汇总表。智能体协作条文另见 `docs/research/11-agent-team-practices.md`，该文件只作为条文来源，本表不重复列出它的链接。

| 名称 | 地址 | 本文件中的用途 |
|---|---|---|
| Conventional Commits 1.0.0 | https://www.conventionalcommits.org/en/v1.0.0/ | 提交标题结构、类型集合、破坏性变更的两种写法 |
| Keep a Changelog 1.1.0 | https://keepachangelog.com/en/1.1.0/ | 变更记录的分类与未发布段 |
| Google 工程实践：代码评审 | https://google.github.io/eng-practices/review/ | 评审的八个维度 |
| GitHub Docs：Pull request reviews | https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews | 评审结论的三种状态 |
| GitHub Docs：About issue and pull request templates | https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates | 合并请求模板的存放位置与自动填充 |
| Vue 贡献指南 | https://github.com/vuejs/core/blob/main/.github/contributing.md | 合并请求的接受范围 |
| Vite 贡献指南 | https://github.com/vitejs/vite/blob/main/CONTRIBUTING.md | 提交前必须执行的构建与测试步骤 |
| pnpm 版本管理文档 | https://pnpm.io/versioning | 依赖存储与版本管理设置 |
| Scrum.org：完成的定义 | https://www.scrum.org/resources/what-definition-done | 任务完成的判据 |

---

## 9. 待确认事项

1. 本文件尚未在 `README.md` 与 `AGENTS.md` 里建立指向链接，链接位置待维护者确认后补写。
2. `.github` 目录尚不存在，合并请求模板与问题模板属于待创建项，本文件 §5.1 的内容即为模板需要收集的字段。
3. 智能体协作的派发模板细节写在 `docs/research/11-agent-team-practices.md` §8，本文件只摘录了必须遵守的条文，模板正文是否单独成文待确认。
