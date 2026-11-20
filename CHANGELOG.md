# Changelog

本文件记录 `dsh-session-status-marker` 的对外可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.2.3] - 2026-11-20

正式版本，内容等于 `1.2.3-rc.2`。用户在 2026-11-20 于真实桌面端完成前端验收并确认「这个版本验收通过」，按发布政策（正式版本必须在用户实际验收通过之后发布）从预版本转为正式版。

### 变更（相对 1.2.2）

- **删除行内自建浮层，行内图标只负责打开宿主悬停卡**：会话行右侧 24×24 状态图标不再拥有自己的面板，点击它让宿主悬停卡出现，一条会话行上只有一个浮层。原因与实现见 `1.2.3-rc.2` 段落。
- **悬停卡空白点击不再复制会话标题**：`src/client/copyGuard.ts` 在 `document` 上以 capture 阶段拦截「含插件槽位的悬停卡」上、槽位外、非交互元素的 `click` 与 Enter/Space，官方整卡复制处理不再执行；按钮、输入框、链接与文本选择不受影响。见 `1.2.3-rc.1` 段落。
- **插件元数据补齐 8 种语言**：`locale/{zh,ja,es,fr,de,ru,pt}.json` 提供 `meta.title` / `meta.description`，官方「插件」页在对应语言界面显示本地化名称与描述。
- **新增发布与协作规范**：`docs/release-process.md`、`CONTRIBUTING.md`、`docs/research/10-release-and-versioning.md`、`docs/research/11-agent-team-practices.md`；`AGENTS.md` 增搜索规范与智能体团队原子化拆解规范。

### 验证

- 111 项测试全绿（27 套件），`pnpm run typecheck` 与 `pnpm run build` 通过。
- 用户桌面端（DSH 0.2.2-rc.3）实际验收通过：单一浮层、点行内图标打开右侧悬停卡、卡片空白处点击不再出现「已复制」。
- dev4090 真实页面复核记录见 `docs/acceptance-and-regression.md` §3.20、§3.21。

### 已知限制

- 第三方插件市场 `dshmarket` 的已装列表描述只读包 `package.json` 的字符串 `description`，不读 `locale/*.json`，仓库内无法改变那一页的显示语言。官方「插件」页读包内 locale 元数据，8 种语言在那里生效。

## [1.2.3-rc.2] - 2026-11-20

针对用户 2026-11-20 反馈的「点击行内图标后还是会出现下面一排，这一排要删掉，点击图标应该出现右侧浮窗」发布预版本（按发布政策，正式版本需用户实际验收后发布）。

### 变更

- **删除行内自建浮层，行内图标只负责打开宿主悬停卡**：会话行右侧那个 24×24 状态图标不再拥有自己的面板，点击它改为让宿主悬停卡出现，一条行上只有一个浮层。
  - 原因一：宿主在 `@media (hover: none)` 下把我们的行内插槽隐藏（`Rows.module.css:340-359` 的 `.rowQuickActions > [data-slot] > :not(.pinnedAction)`，而 `pinnedAction` 是宿主内部哈希类，插件拿不到），触屏本来就看不到这个图标，1.2.2 的行内面板实际只在桌面出现、与悬停卡重复。触屏入口仍然是会话菜单里的「设置状态」。
  - 原因二：官方 `HoverCard` 没有受控 open 属性，但卡根元素监听 `onPointerEnter`（`HoverCard.tsx:326-336`），React 由原生 `pointerover` 合成该事件。所以点击时向所在行派发一个 `pointerover`（`pointerType: 'mouse'`、`bubbles`/`cancelable`/`composed`、`pointerId: 1`、`isPrimary: true`、`relatedTarget: null`）即可让宿主自己打开卡片。
  - 实现：`src/client/RowAction.tsx` 的 `useRowCardTrigger()` 在 `document` 上以 capture 阶段注册 `pointerdown` 与 `click`，命中 `[data-status-action]` 时 `stopPropagation()`，`click` 时调 `openRowCard()` 派发 `pointerover`。必须绑在 `document`：React 合成事件监听在根容器元素上，绑在按钮自身拦不住宿主的 `onPointerDownCapture`/`onClickCapture`（卡片已开时会被关掉）与整卡复制。`src/client/action.module.css` 删除 `.popover` 整段样式，展开时的图标配色只保留 `:hover`。
- **新增发布与协作规范文档**：`docs/release-process.md`（语义化版本、`-rc.N` 递增、dist-tag 策略、GitHub Release、标签、CHANGELOG、分支与发布检查、发布门槛、回退与弃用）、`CONTRIBUTING.md`（环境、命令、代码风格、提交规范、合并请求评审、智能体协作要求、禁止事项），以及两份调研 `docs/research/10-release-and-versioning.md`、`docs/research/11-agent-team-practices.md`。
- **AGENTS.md 增两条规范**：Standing Order 1 增「搜索时把问题拆成原子化关键词再检索（`research` 除外），避开内容农场与云厂商营销站」；新增 Standing Order 8「智能体团队原子化拆解」，规定派发单必写输入、产出、验收判据、写入范围白名单、时间预算五项，共享文件由主会话独占，子代理完成后主会话必须逐条复核并自己跑测试，产物 10 分钟无改动先询问、30 分钟无改动中断接手。

### 验证

- 111 项测试全绿（27 套件）。
- dev4090（DSH 0.2.2-rc.3）真实页面复核（CDP）：点击行内图标后 822ms 悬停卡打开（822ms 是宿主自己的 800ms 停留计时，与鼠标悬停同一延迟）、`popover: 0` 只有一个浮层、`copied: false`、再点一次图标卡片不会被关掉、点卡片标题与卡底空白均 `copied: false`。截图 `.drafts/shots/v123rc2-row.png`。

### 发布

- GitHub Release v1.2.3-rc.2（prerelease 标记）附 tgz（82,987 B），发布页 https://github.com/sterraMind/dsh-session-status-marker/releases/tag/v1.2.3-rc.2 ，资源 `dsh-session-status-marker-1.2.3-rc.2.tgz` 已上传（82,987 B）。
- npm 以 `--tag rc` 发布 `1.2.3-rc.2`（67 个文件，shasum `623d7996ba65ac925aba67194ebecdf419d9ab0b`）；发布后直连 registry 核对 `latest: 1.2.2`、`rc: 1.2.3-rc.2`，`latest` 未变动，tarball 返回 200。

### 已知限制

- 第三方插件市场 `dshmarket` 的已装列表描述只读包 `package.json` 的字符串 `description`，不读 `locale/*.json`，仓库内无法改变那一页的显示语言。官方「插件」页读包内 locale 元数据，我们的 8 种语言文件在那里生效。

## [1.2.3-rc.1] - 2026-11-20

针对用户 2026-11-20 反馈的三个问题发布预版本（按发布政策：正式版本需用户实际验收后发布，此前只能发预版本）。

### 修复

- **悬停卡空白点击不再复制标题**：官方 HoverCard 把整张卡注册成 `role="button"` 并在卡级 `onClick`（`HoverCard.tsx:293-303`）与 Enter/Space `onKeyDown`（`:304-310`）里复制会话标题，此前 1.0.2 的 `stopPropagation` 只覆盖插件槽位内部，点击卡的标题、路径、时间等空白区域仍会触发「已复制」替换整卡。新增 `src/client/copyGuard.ts`：在 `document` 上以 capture 阶段监听 `click` 与 `keydown`（React 合成事件绑在根容器元素上，`document` 是其祖先，原生 capture 先于 React 分发），只拦截「含插件槽位的悬停卡」上、槽位外、非交互元素的点击与 Enter/Space，`stopPropagation` 后事件不再到达 React 根容器，官方复制处理不执行；按钮、输入框、链接等交互元素与文本选择不受影响，不调用 `preventDefault`。
- **行内浮窗与悬停卡只留一个**：`RowAction` 用 `MutationObserver` 监听悬停槽位挂载（悬停卡打开时宿主才挂载 `sidebar.session.row.hover` 槽位，`contract/slots.ts:160-163`），悬停卡可见时行内面板自动收起、点击行内图标不再开第二个浮层；悬停卡关闭后行内面板恢复。
- **插件市场元数据补齐 8 种语言**：新增 `locale/{zh,ja,es,fr,de,ru,pt}.json`（`meta.title`/`meta.description`），插件市场与插件页在对应语言界面显示本地化名称与描述（此前只有英文）。

### 验证

- 111 项测试全绿（27 套件，新增 `tests/copy-guard.test.mjs` 9 例）。
- dev4090（DSH 0.2.2-rc.3）真实页面复核（CDP）：浅色主题悬停卡空白点击（标题行、卡底部）不出现「已复制」、卡保持打开；选中文本后点击不复制且选区保留（「标记会话为完成」）；深色主题悬停卡整卡 `rgb(44,44,46)`、标题 `rgb(249,250,251)`、空白点击同样不复制；悬停卡打开时点行内图标不开第二个浮层（popover=1 且为悬停卡前已开的面板收起后重开路径）；行内面板 214×110、8 格、摘要「Manual: Blocked」、备注「Note: 需要等待上游接口确认后再继续」、清除齐全。截图 `.drafts/shots/v123-card-guard.png`、`v123-panel-light.png`、`v123-dark-card.png`。

### 发布

- GitHub Release v1.2.3-rc.1（prerelease 标记）附 tgz（81,880 B）；npm 以 `--tag rc` 发布 `1.2.3-rc.1`，`latest` 保持 1.2.2 不动。npm 对预发布版本强制要求显式 `--tag`（不带 `--tag` 直接报错退出），这是对 1.2.2 发布流程的补充认知。

## [1.2.2] - 2026-11-20

修复用户在 1.2.1 上反馈的四个交互问题：行内入口是文字按钮而非图标、点开后是行内展开一排按钮而非浮窗、面板里看不到备注、点击仍会触发整卡复制。

### 修复

- **行内入口改图标按钮**：`RowAction` 的触发按钮从 22×18 的「状态」文字按钮改为官方 iconButton 规格（24×24、`margin:-4px`、无边框、`--dsw-radius-xs`），内容是随当前状态变化的状态图标（未标记时显示清单图标），不再有文字（`Rows.module.css:453-470` 的官方按钮规格）。
- **行内面板改浮窗**：点开后的面板从行内下方展开的一排格子改为卡片式浮窗（214px 宽、`--dsw-alias-bg-layer-2` 表面、`--dsw-radius-lg` 圆角、大阴影），与悬停卡同构。
- **浮窗补备注与清除**：`StatusPicker` 新增 `showSummary`，渲染与悬停卡一致的摘要行（`hover.loading`/`hover.empty`/`hover.auto`/`hover.manual`）、备注行（`hover.note`，截断 64 字符）与「清除」按钮；触屏设备（悬停卡不可达，`HoverCard.tsx:326-327` 忽略 touch 指针）由此也能看到备注并清除标记。新增 `clearSessionStatus` 导出。
- **菜单项补图标与官方字号**：`MenuStatusItem` 的「设置状态」入口补 14px 前置图标（随当前状态变化），按钮规格对齐官方菜单 `.item`（`min-height:34px`、`padding:6px 8px`、`gap:6px`、13px/20px 字号），图标颜色用 `--dsw-alias-menu-icon`。
- **插件页图标改填充渐变**：`icon.svg` 从 16px `currentColor` 空心勾改为 36×36 填充渐变（蓝紫渐变圆角方块 + 白色勾），浅色背景下不再显示为黑色勾；对齐官方 `auto-review`/`badge-skill-bundle` 的图标范式。

### 验证

- 102 项测试全绿（25 套件，新增 `tests/touch-icon.test.mjs` 6 例）。
- dev4090（DSH 0.2.2-rc.3）真实页面复核：触发按钮 24×24/16px svg/无文字；浮窗 214×91、8 格单行、白底圆角阴影；摘要行「Manual: Done/Blocked」、备注行「Note: 需要等待上游接口确认后再继续」、清除按钮齐全；浅色与深色主题表面/文字/状态色均随主题切换；点面板文本区与状态格均不触发整卡复制；触屏模拟（hover:none）下面板可达；点击状态格写入成功且面板收起。
- 「已复制」回归的桌面端个案：v1.2.1 的 `HoverCard.tsx` guard 代码与 1.2.2 相同（`git show v1.2.1:src/client/HoverCard.tsx` 核对），复发根因是桌面端激活层未更新（旧 client.js 残留），不是 1.2.1 代码缺陷；重装后已消失。

## [1.2.1] - 2026-11-19

修复 DSH 预发布版（0.2.2-rc.x）无法从插件市场安装 1.2.0 的问题。

> **状态说明（2026-11-20 更新）**：代码经 dev4090（DSH 0.2.2-rc.3，与用户桌面同版本）CLI 安装后 CDP 全流程验收通过，功能完好。用户桌面报「图标全无、点击出现已复制」的根因在桌面端安装状态而非本包：desktop profile 的 bundles 与配置层均无插件条目但 node_modules 残留依赖（孤儿安装）。用户桌面清理残留重装后运行正常（2026-11-20 确认），两个版本的 deprecated 标记已解除，`latest` dist-tag 恢复指向 1.2.1，GitHub Release v1.2.0/v1.2.1 已恢复正式版状态并移除故障说明。

### 修复

- **`engines.dsh` 下限恢复为 `>=0.2.2-rc.1 <0.3.0`**：npm 语义化版本规则中，预发布标签（如 `0.2.2-rc.3`）排在正式版 `0.2.2` 之前，而 `>=0.2.2` 这种不带预发布标志的范围永远匹配不到预发布版本——DSH 0.2.2-rc.3 的插件市场因此拒绝安装 1.2.0（提示「与 DSH 0.2.2-rc.3 不兼容」）。1.2.0 的全部功能（`row.action` / `menu.item` / trailing 槽位）依赖的是 0.2.2-rc.1 引入的槽位体系，下限回到 `0.2.2-rc.1` 语义完全等价，同时覆盖所有 0.2.2-rc.x 与正式版。已安装 1.2.0 且运行正常的用户无需升级；运行在 0.2.2 正式版及以上、或 rc.1 至 rc.5 任意预发布版的用户均可直接安装。

### 发布

- 测试与 1.2.0 相同（95 项 / 23 套件全绿）；`engines.dsh` 变更是唯一的包元数据改动。
- **rc.3 桌面端故障调查与处置**：npm `unpublish` 对 granular token 一律 E403，改用 `npm deprecate` 标记 1.2.0/1.2.1（文案说明桌面端激活层问题与恢复路径）；`npm dist-tag add ... latest` 把 latest 回指 1.1.6；GitHub Release v1.2.0/v1.2.1 补故障说明并标记 prerelease。另发现 rc.3 的 CLI `dsh plugin add` 在依赖已存在（Already up to date）时不写 bundles，必须先 `plugin remove` 再 `plugin add` 走全新安装路径。

## [1.2.0] - 2026-11-19

新增不依赖悬停的状态入口、行操作顺序可配置，悬停卡默认直接展示八格状态选择，条件刷新减少无变化的重绘，并修复若干对比度与主题跟随问题。

### 新增

- **会话行行内状态按钮（触屏/键盘入口）**：新 slot `sidebar.workspaces.session.row.action`（id `session-status-row-action`），悬停行时显示行内状态选择按钮；同一状态选择器同时以 `sidebar.workspaces.session.menu.item`（id `session-status-menu-item`）贡献到行菜单，覆盖触屏与键盘场景（官方 `row.action` 在 `hover: none` 下隐藏）。两个入口此前在 1.1.x 列为「不依赖悬停的入口」未完成项。
- **行操作顺序可配置**：Host 配置新增 `rowActionOrder` 与 `menuItemOrder`（`z.natural()`，默认 300，排在官方 archive=100 / pin=200 之后），`cordis.patch.yml` 同步写入。Host 通过 `webserver/index-inject` 以全局 `__DSH_SESSION_MARKER_CONFIG__` 下发（动态加载的 client row 没有逐条配置通道，这是官方 index-inject 模式），client 在 `apply` 时读取，缺失或非法值回退默认 300。
- **条件列表刷新**：`GET /api/session-status-marker.list` 支持 `?since=<revision>`。服务端按行内容计算 revision，无变化时返回 `{marks: [], revision, unchanged: true}`，浏览器跳过重绘；变化或首次读取返回全量并带 `unchanged: false`。客户端保留 2 秒轮询兜底，仅在无变化时跳过分发；标签页重新可见、以及首次订阅且本地无缓存时会强制一次全量读取。减少无变化时的组件重绘与网络负载。
- **悬停卡默认展示八格**：已标记会话的悬停卡默认直接展示八个状态图标（此前需要先点「修改状态」展开），当前状态高亮，已标记时保留「清除」按钮；未标记会话行为不变（八格始终可见）。

### 变更

- **`awaiting-answer` 对比度**：状态色从 `--dsw-alias-state-idle-primary` 改为 `--dsw-alias-label-secondary`。实测旧值仅 1.48:1（浅色）/ 1.87:1（深色），均低于 WCAG 图形对象 3:1 门槛；新值 5.80:1（浅色）/ 9.25:1（深色），两主题均达标。
- **`set_session_status` 工具描述重写**：按 WHEN TO USE / WHEN NOT TO USE / DO NOT USE FOR / USAGE / EXAMPLES 重写，明确「模型正常结束会话不应自动标记为 done」「已有手动标记时不覆盖」，减少模型误调用与漏调用。
- **`engines.dsh` 提升为 `>=0.2.2 <0.3.0`**：`row.action` / `menu.item` 槽位与侧栏行尾徽标（`sidebar.session.row.trailing`）均要求 0.2.2-rc.1 起引入的槽位体系，下限从 `0.2.2-rc.1` 提到稳定版 `0.2.2`。

### 修复

- **悬停卡整卡主题接管加固**：新版 DSH 构建的悬停卡底色改用 `--dsw-alias-hovercard-bg`（固定深底别名）绘制，旧版用 `--dsw-hovercard-bg`。1.1.2 起只覆盖了后者，在较新构建上整卡主题接管失效。现在 `[class*='card']:has([data-status-slot])` 同时覆盖两个变量指向 `--dsw-alias-bg-layer-2`，两个构建都跟随主题。

### 发布

- 95 项测试 / 23 套件全绿（目录形式另计入 4 个 `.test.ts` 薄壳，报告 99/23）；`pnpm pack` → `dsh-session-status-marker-1.2.0.tgz`（70,350 B）。

## [1.1.6] - 2026-11-19

按官方发布包的依赖声明规范重写 `package.json` 的依赖字段：运行时与宿主共享的依赖放 `peerDependencies`，第三方运行时依赖放 `dependencies`，开发期只保留类型检查与构建实际需要的包。

### 变更

- **`peerDependencies` 用区间而非精确版本**：此前写死 `0.2.2-rc.1`，DSH 更新到 rc.2 或 rc.3 就会被版本检查拒装。现在每个宿主共享的包（`@deepseek-ai/cordis`、`dsh-client-connection`、`dsh-client-locale`、`dsh-client-ui-renderer`、`dsh-client-ui-slots`、`dsh-client-ui-workspace`、`dsh-session`、`dsh-storage-domain`、`dsh-tools`）用 `>=0.2.2-rc.1 <0.3.0`，与 `engines.dsh` 范围一致；`@deepseek-ai/schemastery` 保持 `^3.19.0`。
- **新增 `dependencies`**：`zod 4.4.3` 与 `@deepseek-ai/schemastery ~3.19.0` 是插件自身运行时必须拿到的独立包，按官方范式（`docs/user/develop/basic/publish.md:105`）从 `devDependencies` 移到 `dependencies`，不再依赖宿主提供。
- **`devDependencies` 只留开发实际需要**：删除 `cosmokit`、`dsh-agent`、`dsh-brand`、`dsh-client-ui-primitives`、`dsh-llm`、`dsh-scope`、`dsh-system-prompt`、`dsh-user-approval`、`dsh-util-values`、`esbuild`、`@esbuild/win32-x64`、`react-dom`、`@types/react-dom`、`vitest` 共 14 个源码里没有引用的包（测试实际走 `node --test`，构建走 TypeScript compiler API）。保留类型检查与构建所需的镜像依赖。
- 行为与产物不变，73 项测试全部通过。

## [1.1.5] - 2026-11-18

修两个问题：README 的预览图没展示核心功能，以及 1.1.2 把 DSH 版本下限放宽到了核心功能不可用的版本。

### 修复

- **恢复 DSH 版本下限为 `>=0.2.2-rc.1`**：1.1.2 曾把下限放宽到 `>=0.2.0-rc.2`，理由是 dev4090 上的验收通过。但侧栏标题旁的状态图标挂在 `sidebar.session.row.trailing` 槽位上，而这个槽位是 `@deepseek-ai/dsh-client-ui-workspace` 0.2.2-rc.1 才加入的：逐个下载 npm 上的 tarball 检查，`0.2.0-rc.2`、`0.2.1-rc.1`、`0.2.1-rc.2`、`0.2.1-rc.3` 都没有这个槽位名，`0.2.2-rc.1` 起才有。也就是说在 0.2.0-rc.2 上插件只能显示悬停卡里的状态格子，侧栏图标不会渲染。当时的「验收通过」只覆盖了悬停卡，没有覆盖侧栏图标，结论下早了。
- **README 增加侧栏图标的预览图**：新增 `docs/images/sidebar-badge.png`，展示侧栏会话标题后面的状态图标（完成是紫色对勾、待办是蓝色清单）。原来的两张图都是悬停卡展开状态，看不到核心功能。开头改成「侧栏每个会话标题后面显示一个状态图标」，先给图标图，再给悬停卡图。
- README 的版本要求改成「`0.2.2-rc.1` 到 `0.3.0`」，并注明低于 `0.2.2-rc.1` 的版本没有侧栏标题旁的插槽，状态图标不会显示。

### 关于悬停卡贴顶

有反馈说悬停卡看起来贴在页面顶部。查过官方源码与真实页面几何后确认这不是本插件的布局问题：官方 `HoverCard` 用 `position: fixed`，`top` 直接取锚点行的 `getBoundingClientRect().top`（`.research/dsh-repo/packages/client/ui-primitives/src/HoverCard.tsx:223-224`），卡片高度超出视口底部时才整体上推。实测悬停第二行会话（`anchorTop=242`）时卡片 `cardTop=276`、`deltaTopFromAnchor=34`、`position=fixed`、`hostTag=BODY.`，卡片顶端始终跟着锚点行走。看起来贴顶是因为被悬停的是侧栏最上面那一行。

## [1.1.4] - 2026-11-18

按用户反馈修 README 的两处问题：预览图构图不合适，正文有机器味。

### 修复

- **预览图改成局部裁切**：原来用的是 1576×861 的整窗截图，悬停卡只占左上角一小块，右侧和下方大片空白，当预览图看不清内容。现在从同一张截图裁出侧栏三行会话加整张悬停卡的范围（1200×530，放大两倍），浅色与深色各一张，卡片、八个状态格和按钮都看得清。
- **正文按去 AI 味规则润色**：检测报告里顿号并列从 7.62 处/千字降到 2.16 处/千字（人类参考约 1.78）。具体改动是把三处三项以上并列改成更自然的说法，例如开头「待办、已完成、被中断，还是卡住了」改成「待办、已完成，还是被中断或者卡住了」，语言清单拆成两个短句，限制说明里「日文、西班牙文、法文、德文、俄文、葡萄牙文」改成「除简体中文和英文之外的六种语言」。
- 「开发」一节里「DSH 宿主侧的数据文件」改成「DeepSeek Harness 自己的数据目录」，去掉内部简称。
- 按检测规则的 X 级清单，没有改动「空转句引列表」这类实测不是 AI 特征的地方（安装段的「然后：」「装完核对一下是否生效：」等保留）。

## [1.1.3] - 2026-11-18

重写 README，让第一次接触这个插件的人能读懂。此前的 README 把内部实现术语写在项目介绍里（「架构红线」「完整证据与取舍」「明禁」等），普通读者看不懂。

### 变更

- README 改用面向用户的语言：先说明插件做什么、怎么用、八种状态各自用在哪，再给安装与配置。内部实现细节移到仓库文档，README 只保留一句必要说明（独立安装包、数据不进会话日志）。
- README 里的文档链接全部改成 GitHub 绝对地址。此前用的是 `./docs/...` 相对路径，在 npm 页面会指向 `npmjs.com/package/.../docs/...` 这个不存在的路径。
- README 增加两张真实界面截图（`docs/images/hover-light.png`、`docs/images/hover-dark.png`），用 `raw.githubusercontent.com` 绝对地址引用。
- npm 包内容不变：`package.json` 的 `files` 只包含 `lib/`、`locale/`、`cordis.patch.yml`、`icon.svg`，`docs/` 与截图不进包，安装体积不受影响。

## [1.1.2] - 2026-11-18

彻底修复浅色主题悬停卡不跟随 DSH 主题：1.1.1 的「融入官方固定深色卡」方案被用户否决——它在两个主题下都显示深色浮窗，等于没有跟随主题。真正的根因是官方会话行 hover card 的表面与标题/时间/状态行颜色全部写死（深底浅字、两主题一致），插件只改自己的面板无论怎么调都无法让整张卡跟随主题。

### 修复

- 从我们的 slot 用 `:has([data-status-slot])` 覆盖**宿主整张卡**：卡片背景变量 `--dsw-hovercard-bg` 改指向 `--dsw-alias-bg-layer-2`，宿主的标题/路径/时间/状态行改指向 `--dsw-alias-label-primary/secondary`。属性选择器在 CSS-module 构建中不会被哈希，`:has()` + `!important` 保证特异性高于官方样式，且只命中包含我们 slot 的那张卡，不影响其它 HoverCard。
- 我们自己的面板保持透明、文字与状态图标全部回到主题别名（`hoverTone` 与徽标 `tone` 同源），hover/active 用 `--dsw-alias-interactive-bg-hover/active`。
- 真实页面复核：**light 整卡 `rgb(255,255,255)` 白底、标题 `rgb(15,17,21)` 近黑；dark 整卡 `rgb(44,44,46)` 深灰、标题 `rgb(249,250,251)` 近白**；8 格单行、状态图标两主题都可读。截图 `.drafts/shots/v112-light-picker.png` / `v112-dark-picker.png`（已目检）。
- `tests/theme.test.mjs` 改为断言整卡主题接管（surface + 每个宿主文字行 + `:has` 作用域 + 主题别名 hoverTone）；73 项测试全绿；`pnpm pack` → `dsh-session-status-marker-1.1.2.tgz`（56,683 B）。

### 发布

- `engines.dsh` 下限从 `>=0.2.2-rc.1` 放宽到 `>=0.2.0-rc.2`（dev4090 真实验收环境是常规安装的 0.2.0-rc.2）。tarball 重打包为 **56,921 B**（shasum `a6cb9c1848edeb3c8a96d2df72214b10212fc574`）。
- **GitHub 已发布**：`sterraMind/dsh-session-status-marker`（public），tag `v1.1.2` 与 Release 已推送，Release 附 `dsh-session-status-marker-1.1.2.tgz`（sha256 `f5d0edec8fe24a75633d2bd65d70226bed08a0938c308d308ffe02a29313778a`）。地址：<https://github.com/sterraMind/dsh-session-status-marker/releases/tag/v1.1.2>。
- **npm 已发布**：<https://www.npmjs.com/package/dsh-session-status-marker/v/1.1.2>。发布走的是 staged publishing 路径——`npm publish` 输出 `+ dsh-session-status-marker@1.1.2`、publish 日志 `PUT 202`（非 201），registry 先公开占位版本 `0.0.0-stage`，约 11 分钟后 staged→publish 完成，`latest` 变为 `1.1.2`、tarball HEAD 200（integrity `sha512-3ws7itHa9zP5M...`，与 dry-run 的 shasum `a6cb9c1848edeb3c8a96d2df72214b10212fc574` 一致）。判据与延迟窗口见 [项目记忆](./docs/project-memory.md) §6 教训 28 与 [验收与回归](./docs/acceptance-and-regression.md) §3.13。

## [1.1.1] - 2026-11-18（已被 1.1.2 取代）

> 该版本的方案被用户否决：见下方记录与 1.1.2。它解决了「白块割裂」，但把整张卡留在深色，浅色主题下仍是黑色浮窗，没有满足「跟随 DSH 主题」的诉求。

修复浅色主题下悬停卡割裂：1.0.3 起给状态面板单独涂了随主题变化的背景（`--dsw-alias-bg-layer-2`，浅色主题下是白），但 DSH 会话行悬停卡本身在两个主题下都是固定深色、宿主标题/时间/状态行都是深底浅字，于是浅色主题出现「上黑 + 中白 + 下黑」的割裂。

### 修复

- 状态面板改回融入官方固定深色卡：背景透明、文字用固定白色 token（`--dsw-static-neutral-00`）、状态图标用 400 级静态色板（`--dsw-static-*-400`）、hover/active 与按钮用半透明白；侧栏徽标仍用主题别名 `tone`（徽标在随主题变化的侧栏表面上）。
- `tests/theme.test.mjs` 的三条悬停卡断言改为验证「融入深色卡 + 静态浅色文字/图标」。
- 真实页面复核：浅色（`bodyBg rgb(255,255,255)`）与深色（`rgb(21,21,23)`）两主题下，卡片均为 `rgb(44,44,46)`、面板背景透明、文字白色、8 格单行；截图 `.drafts/shots/v111-light-picker.png` / `v111-dark-picker.png`。
- 72 项测试全绿；`pnpm pack` → `dsh-session-status-marker-1.1.1.tgz`。

## [1.1.0] - 2026-11-18

竞品差异化轮：三个同类插件（dream12347 / hkkz9522 / TOBYCAI，见 `docs/research/07-competitive-session-managers.md`）全部落在「生命周期 + 注意力 + 组织」赛道，没有人在「按工作状态分组查看全部会话」这个点上有产品。本版本落地该独占痛点。

### 新增

- **跨会话状态总览（设置页）**：在 DSH 设置面板新增 `会话状态` 一节（`settings.section`，order 60）。页面按 8 个状态分组列出全部已标记会话，每组带计数，组内按更新时间降序。数据来自新的 Host 路由 `GET /api/session-status-marker.overview`（返回 `{ groups, totalMarked, refreshIntervalMs }`），标题通过 `ctx.sessions.list()` + `ctx.sessionTitle.get(session)?.title` 关联，读不到的标题回退为「未命名会话」。客户端组件 `src/client/StatusOverview.tsx` 按 `refreshIntervalMs` 轮询，页面隐藏时暂停、恢复可见立即刷新（与 `marks.ts` 同模式）。
- **Host overview 路由**：`src/service.ts` 新增 `#handleOverview()`，把 `storageDomain` 的标记表按状态分组、按 `STATUS_VALUES` 顺序输出、仅保留非空组。服务 `static inject` 增补 `sessions` / `sessionTitle`（connection 仍懒注入）。
- **8 语言总览文案**：`src/client/locales.ts` 每个语言新增 6 键（`overview.nav/title/empty/count/updatedAt/noTitle`），`DICTIONARIES` 一次注册。

### 变更

- `src/contracts.ts` / `src/types.ts`：新增 `OverviewEntry`、`StatusGroup`、`OverviewResponse` 类型与 `MARKER_OVERVIEW_PATH` / `MARKER_OVERVIEW_ROUTE`。
- `src/client/index.ts`：注册 `settings.section` 槽位占据者（inject face 提供 `t` 与 `fetchOverview`，`t` 经 `ctx.locale.bind(NS)` 绑定，语言切换时导航标签随之刷新）。
- 测试 72 项（17 套件）全绿：`tests/overview.test.mjs` 5 例（分组排序 / 仅非空组 / 标题关联 / null 回退 / 空态）+ `tests/theme.test.mjs` 新增总览页主题断言 + `tests/expect.mjs` 补 `toHaveLength`。
- `pnpm pack` → `dsh-session-status-marker-1.1.0.tgz`。

## [1.0.3] - 2026-11-12

针对用户反馈「主题还是黑色没有同步 dsh 本身主题」的修复轮。

### 修复

- **悬停卡表面跟随主题**：官方 HoverCard 的 `.card` 背景色在 `ui-primitives/src/HoverCard.module.css:9-19` 里硬编码为深色常量，浅色和深色主题解析结果相同。内容区 `.root` 通过负边距 `-12px -16px` 覆盖整张卡片面积，自绘 `background: var(--dsw-alias-bg-layer-2)`（浅色主题白色、深色主题深灰），再以 `padding: 18px 24px` 恢复视觉缩进。
- **文字与图标跟随主题**：`.root` 前景色改用 `--dsw-alias-label-primary`（浅色近黑、深色近白）；状态图标 `hoverTone` 从静态色板改回 `--dsw-alias-state-*-primary`（与侧栏徽标一致，随主题切换）。
- **交互面响应主题**：悬停格、选中格、按钮悬停底色分别改用 `--dsw-alias-interactive-bg-hover` 与 `--dsw-alias-interactive-bg-active`（浅色主题半透明深色叠加、深色主题半透明白色叠加），两主题下均有明确视觉反馈。
- **桥接命中区收窄**：根节点已用负边距外扩至卡片边缘，`.root::before` 宽度从 24px 收窄为 8px（仅覆盖锚点间隙）。

### 变更

- `tests/theme.test.mjs`：三条断言改为主题化——要求 CSS 含 `--dsw-alias-label-primary` 与 `--dsw-alias-bg-layer-2` 且不含 `--dsw-static-neutral-00`；`hoverTone` 匹配 `^var\(--dsw-alias-(state|label)-[a-z0-9-]+\)$`；`.cell:hover` / `.cell.active` 分别使用 `--dsw-alias-interactive-bg-hover` / `--dsw-alias-interactive-bg-active`；桥接断言从 `left: -24px; width: 24px` 改为 `left: -8px; width: 8px`。
- 测试合计 66 项（16 套件）全绿，其中 theme 套件 9 例。

## [1.0.2] - 2026-11-12

针对 2026-11-12 用户验收反馈的修复轮，详见 `docs/research/08-hover-interaction.md`。

### 修复

- 点击悬停卡里的按钮却弹出「已复制」：DSH 自己的悬停卡把整张卡设为可点复制（官方 `ui-primitives/HoverCard.tsx:293-303` 在 `onClick` 复制标题，`:304` 在 Enter/Space 也复制，复制后整卡内容被替换成提示文字）。插件内容区根节点现在接管 `onClick` 与 `onKeyDown` 并 `stopPropagation()`，状态改写不再误触复制。
- 鼠标从会话行挪到悬停卡时卡片会消失：官方 compact 悬停卡只用 200ms 指针宽限跨过 8px 锚点间隙，且这个分支不生成 bridge 元素（`HoverCard.tsx:222-224`、`pointer-grace.ts:8`）。插件在内容区加了一条透明命中区（`.root::before`），指针经过它会冒泡到宿主卡片的 `onPointerEnter` 取消关闭，等效官方 `inline` 分支的 bridge。
- 悬停卡文案在切换语言后没变：插件此前只注册了中英两种字典，而 DSH 提供 8 种语言（`locale/src/client/index.ts:23`），切到其余 6 种时本命名空间按回退链掉回英文。现在 `src/client/locales.ts` 补齐 `zh`/`en`/`ja`/`es`/`fr`/`de`/`ru`/`pt` 并以 `DICTIONARIES` 一次注册。
- 悬停卡外观在切换主题后没变：卡片表面是官方固定深色（两主题一致），文字与状态图标为可读性必须保持静态色板（避免重演 1.0.0 的不可见文字）。本次让交互面响应主题：格子悬停/选中底色与按钮悬停底色改用随主题变化的 `--dsw-alias-tooltip-key-bg`（浅色主题派生自 neutral-bluish-850、深色派生自 neutral-bluish-750），它坐在静态色内容之下，不影响可读性。
- 八个状态图标缺内边距且会换行：格子此前 24px + 4px 间距合计 220px，超出官方卡 212px 内容宽导致换行。现在格子 22px、`box-sizing: border-box`、内边距 2px、间距 2px（8×22 + 7×2 = 190px）。真实页面复核发现 root 自身 6px/8px 内边距后可用宽约 196px，197px（3px 间距）仍会换行，故收窄到 2px。

### 变更

- 8 个状态格新增 `aria-label` 与 `aria-pressed`，屏幕阅读器与键盘可读。

### 测试

- 新增 3 条语言字典断言（覆盖 Shell 全部 8 种语言、与 `zh` 键集合一致、占位符保留）与 3 条样式断言（悬停/选中格用 tooltip 背景令牌、跨间隙命中区存在、8 格在 212px 内单行）。测试合计 66 项。
- 在 dev4090 真实页面复核五项修复：点「修改状态」不再触发复制（`copiedLabelShown: false`、`cardStillOpen: true`）；8 格 `distinctRows: 1` 全部 y=458、22×22px、`padding: 2px`；`.root::before` 命中区 `left: -8px` / `width: 8px`；`--dsw-alias-tooltip-key-bg` 在浅/深主题下解析为不同颜色；语言切换 `T+0` 生效。

### 前端验收（2026-11-17）

通过真实 DSH 主题（`ui-theme preference: system`，不依赖 CDP 媒体模拟）验证悬停卡主题同步：

- **浅色主题**：`rootBg = rgb(255,255,255)`（白）、`rootColor = rgb(15,17,21)`（近黑）、`activeColor = rgb(65,118,230)`（浅色主题状态色）；截图 `.drafts/shots/v103-system-light-picker.png` 显示白色卡片表面 + 深色文字。
- **深色主题**：`rootBg = rgb(44,44,46)`（深灰）、`rootColor = rgb(249,250,251)`（近白）、`activeColor = rgb(122,170,255)`（深色主题状态色）；截图 `.drafts/shots/v103-system-dark-picker.png` 显示深灰卡片表面 + 浅色文字。
- 两个主题下 `cardBox` 尺寸一致（244×214px）、`.root::before` 命中区 `left: -8px / width: 8px`、8 格单行（`cellRows: [458]`、22px 宽、`padding: 2px`）。

语言持久化根因（2026-11-17 补充）：`dsh-home/profiles/smoke/cordis.patch.yml` 头部含 UTF-8 BOM（3 字节），导致 config-editor 写入路径解析失败，设置（语言、主题）写入均被拒绝。移除 BOM 并在 `cordis.patch.yml` 里补上 `- id: locale` / `- id: ui-theme` 两段配置后，语言（`lang=en`）和主题（`data-ds-theme-source`）均跨重启保持。属环境侧修复，插件代码无需改动。

## [1.0.1] - 2026-11-11

### 修复

- 悬停卡在浅色主题下看不清：DSH 的悬停浮层固定是深色表面（官方 `ui-primitives/HoverCard.module.css` 给 `--dsw-hovercard-bg` 写死了深色常量，两个主题都一样），而插件之前用 `--dsw-alias-label-primary` 等主题别名取色，浅色主题下解析成近黑色，按钮与标签落在深色浮层上几乎不可见。现在悬停卡的文字、边框、悬停底色改用 `--dsw-static-neutral-*` 静态色板，8 个状态图标改用 `--dsw-static-*-400` 二级色板（新增 `StatusMeta.hoverTone` 字段）。侧栏徽标仍在主题表面上显示，继续用主题别名，不受影响。

### 测试

- 新增两条样式断言：悬停卡不得引用 `--dsw-alias-label-primary` 与 `--dsw-alias-interactive-bg-hover`，且每个状态的 `hoverTone` 必须来自 `--dsw-static-*` 静态色板。测试合计 60 项。

## [1.0.0] - 2026-11-11

第一个前端验收通过、已知明显缺陷清零的版本。

### 新增

- 会话状态标记：8 种状态（`todo` / `done` / `stopped` / `blocked` / `review` / `pending-subagent` / `awaiting-answer` / `feedback`），手动标记优先于自动推断。
- Host 服务 `SessionStatusService`：`ctx.storageDomain` 持久化（域 `session_status_marker`，表 `marks`），跨进程重启保留。
- 两个 AI 工具：`set_session_status`、`get_session_status`，模型可自主标记当前会话。
- 自动推断：监听 `session/event`（只读），按 `turn/end` 原因与工具调用路径推断状态；自动标记不覆盖手动标记，可按 `autoExpireMs` 过期。
- 三条 exact HTTP route：`/api/session-status-marker.state`、`.list`、`.mutate`，注册走 `ctx.inject(['connection'], ...)`。
- Client UI：侧栏行尾徽标（`sidebar.session.row.trailing`）与悬停卡（`sidebar.session.row.hover`），8 个官方风格 inline SVG 图标，颜色跟随 `--dsw-alias-state-*-primary` 主题 token。
- 全页共享的标记读取器 `src/client/marks.ts`：按 Host 下发的 `refreshIntervalMs`（新配置字段，默认 2000ms，最小 250ms）读取列表并分发给订阅组件，本地写入做写透；页面隐藏时暂停，恢复可见时立即再读。标记写入后无需刷新页面。
- `useMark()` React 绑定，徽标与悬停卡统一从这里取状态。

### 变更

- 版本从 `0.1.0` 升到 `1.0.0`。
- `Config` 新增 `refreshIntervalMs`；`cordis.patch.yml` 同步写入 `2000`。

### 修复

- exact route 未注册：`ctx.get('connection')` 在 `[Service.init]` 时机返回 undefined，改用 `ctx.inject`。
- 图标查表键与官方 glyph id 不一致导致徽标空白。
- 未标记会话的悬停卡没有可点状态格，手动标记对新会话不可用。
- inline SVG 在弹性盒内塌成 0×0。
- 选中状态格用 `background: currentColor` 吃掉图标字形。
- 选择器格子过密，改为 21px 格 + 3px 间距，8 格同一行显示。

### 测试

- `node --test --test-isolation=none`：58 项断言、15 个套件全部通过（`tests/*.test.mjs`，`*.test.ts` 为薄壳）。
- 在 dev4090 的真实 DSH 进程与真实 Web 页面上完成验收：tarball 装载、`--dump-config` 生效、三条 route、跨进程持久化、侧栏徽标、悬停卡选择/改写/清除、AI 自主标记、外部变更经轮询自动显示。

## [0.1.0] - 2026-11-10

内部开发版本，未发布。Host 与 Client 骨架、单测与文档初稿；前端验收发现并修复多处只在真实页面暴露的缺陷。
