# 智能体团队：任务原子化拆分与验收规范

> **文档版本**：v1.0.0 · 2026-11-20
> **适用范围**：以「主会话 + 子代理」协作方式开发的仓库外插件项目。本项目 dsh-session-status-marker 为首个适用对象，其他 DSH 插件项目可以直接沿用。
> **取证方式**：条文全部来自厂商官方文档、协议规范与 arXiv 论文原文，每条条文在「依据」小节给出英文原文引用与链接。二手聚合站（CSDN、云厂商开发者社区、简书、51CTO、抖音）一律不进入引用列表。
> **读法**：每节先列可执行条文（编号 R<节号>.<序号>），再给依据与本项目对照。条文可以直接抄进任务派发单。

---

## 1. 调研范围与方法

### 1.1 要回答的六个问题

| 编号 | 问题 | 对应章节 |
|---|---|---|
| Q1 | 什么情况下应该把工作拆给子代理，什么情况下应该留在主会话 | §2 |
| Q2 | 一个任务拆到多小才算原子任务，必须自带哪些信息 | §3 |
| Q3 | 派发单要写多细，子代理才能独立执行 | §4 |
| Q4 | 并行子代理如何避免改同一个文件 | §5 |
| Q5 | 子代理返回的结论如何复核，什么可以采信 | §6 |
| Q6 | 超时、无产出、中断之后如何接管 | §7 |

### 1.2 检索方法

按项目 AGENTS.md 第 13 条的要求，检索词一次只表达一个概念，关键词之间用空格分隔，禁止整句检索。实际使用的检索词：

| 检索词 | 想验证的概念 |
|---|---|
| `multi agent task decomposition granularity` | 拆分粒度的判定标准 |
| `subagent context isolation best practice` | 上下文隔离的收益与代价 |
| `agent task verification acceptance criteria` | 验收判据怎么写 |
| `multi agent write conflict` | 并行写入冲突 |
| `subagent timeout hung detection` | 无产出与挂起的检测 |
| `task expected output guardrail validation` | 任务模板必填字段 |
| `agent team shared task list claim` | 任务领取与依赖声明 |
| `verification aware planning multi agent` | 子任务结构化输入输出 |

### 1.3 来源分级

| 级别 | 含义 | 在本文中的用法 |
|---|---|---|
| A 厂商官方文档 | Anthropic、OpenAI、LangChain、Microsoft、CrewAI 的正式文档 | 作为条文的主要依据 |
| B 协议规范 | Google A2A（Linux Foundation 托管） | 作为任务生命周期与终态语义的依据 |
| C 学术论文 | arXiv 综述与会议论文 | 作为失败模式分类与粒度权衡的依据 |
| D 工程实践 | 个人或团队的公开实践记录 | 只补充操作细节，出现冲突时以 A/B/C 为准 |

### 1.4 术语约定

- **主会话**：持有用户对话、派发任务、做最终验收的会话。
- **子代理**：被派发出去的独立执行单元，拥有独立上下文窗口，只把最终结果交回主会话。
- **派发单**：主会话写给子代理的完整任务说明，是本文的核心产物。
- **写入白名单**：任务允许修改的文件或目录列表，白名单之外一律只读。
- **原子任务**：自带输入、输出、验收判据、写入白名单与预算，可以被单独执行与单独验收的最小工作单元。

---

## 2. 主题一：什么时候该拆，拆过头的代价

### 2.1 结论条文

- **R2.1** 只有同时满足两个条件才拆给子代理：子任务需要的背景可以完整写进派发单；子任务的产出可以压缩成一段结论。任一条件不满足时留在主会话执行。
- **R2.2** 任务之间存在大量依赖、或者所有执行者必须看到同一份上下文时，留在主会话。多代理架构在这类场景上表现更差，官方文档对此有明确说明。
- **R2.3** 拆分前先估算 token 收益。上下文隔离确实能减少 token 消耗（LangChain 实测多领域任务减少 67%），但多代理整体消耗显著高于单代理（Anthropic 实测约为普通对话的 15 倍）。收益来自隔离，成本来自重复读取与协调开销。
- **R2.4** 子代理默认无状态，第二次调用不记得第一次的结论。需要连续推理的工作要么留在主会话，要么在派发单里重发全部必要事实。
- **R2.5** 拆过头的四个症状，出现任意两个就应当合并任务：① 并行子代理数量超过互不重叠的写入白名单数量；② 每份派发单都在重复同一段背景；③ 子代理开始引用另一个子代理的中间结论；④ 主会话花在写派发单上的时间超过自己执行的时间。
- **R2.6** 子代理数量按任务复杂度取：单点事实查找 1 个，两个对象的直接比较 2 个，职责清晰划分的多路调研 3 到 5 个。超过 5 个并行子代理在本项目的写入冲突风险已经高于收益。

### 2.2 依据

**Anthropic《How we built our multi-agent research system》**（2025-06-13）给出多代理的适用边界：

> "some domains that require all agents to share the same context or involve many dependencies between agents are not a good fit"

> "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time"

同一篇文章的规模建议是：简单事实查找由 1 个代理执行 3 到 10 次工具调用；直接比较由 2 到 4 个代理各执行 10 到 15 次；复杂研究用 10 个以上子代理并明确划分职责。早期失败模式包括「简单查询派了 50 个子代理」「子代理之间用过多更新互相干扰」。

**LangChain 多代理文档**把动机归纳为三条：上下文管理、分布式开发、并行化，并给出量化对照：

> "At the center of multi-agent design is context engineering—deciding what information each agent sees."

> "Subagents processes 67% fewer tokens overall due to context isolation"

同页的对照实验显示，多领域任务用子代理是 5 次模型调用约 9K token，用技能注入是 3 次调用约 15K token（技能文档每次后续调用都要重发约 6K）。重复请求场景下子代理因为无状态，每次都要重跑全流程（8 次调用对 5 次调用）。

**Anthropic《Building effective agents》**（2024-12-19）的总体建议是先用最简单的方案，只在确实需要时增加复杂度；文章把「并行化」分成 sectioning（拆分互不依赖的子任务）与 voting（同一任务多次取样）两种，前者才是子代理并行对应的模式。

**Microsoft AutoGen 团队文档**：

> "Teams are for complex tasks that require collaboration and diverse expertise. However, they also demand more scaffolding to steer compared to single agents."

> "start with a single agent for simpler tasks, and transition to a multi-agent team when a single agent proves inadequate."

### 2.3 本项目对照

「实现状态总览功能」这个任务被派给单个子代理后运行 48 分钟没有任何文件产出。用 R2.1 检查：该任务同时涉及 Host 新增路由、Client 新增设置页组件、8 种语言字典补齐、测试新增，产出无法压缩成一段结论，背景也无法在一次派发里说清。按 R2.2 它属于「多文件、多功能、需要共享同一份契约理解」的工作，应当留在主会话，或者拆成「Host 路由」「Client 组件」「语言字典」「测试」四个原子任务。当时的派发方式违反了 R2.1，因此失败有可预期的原因。

---

## 3. 主题二：原子化任务的判定标准

### 3.1 结论条文

- **R3.1** 一个原子任务必须自带五项字段，缺任意一项就退回重写派发单：**输入**（读哪些文件、跑哪些命令）、**输出**（产物路径与格式）、**验收判据**（可执行命令与期望结果）、**允许修改的文件范围**（写入白名单）、**预算**（时间上限与首个落盘检查点）。
- **R3.2** 一个原子任务只产出一个可判定的结果。验收判据必须能用一条命令或一次页面读取表达；需要三条以上互不相关的命令才能判定时，说明任务需要拆分。
- **R3.3** 预期工具调用次数落在 3 到 15 次之间。超过 20 次说明任务过大，少于 3 次说明不值得派发，主会话自己做更快。
- **R3.4** 任务名必须是「动词 + 对象 + 范围」三段结构。禁止使用「优化」「完善」「实现 XX 功能」这类没有边界的命名。
- **R3.5** 一个任务只对应一组相邻的产物文件。跨目录改动（例如同时改 `src/` 与 `scripts/`）必须拆成两个任务，或者明确标注为串行任务。
- **R3.6** 每个任务必须带首个落盘检查点：开始后 10 分钟内写出骨架文件、进度日志或半成品，写不出就视为无产出，按 §7 处理。
- **R3.7** 任务边界要用否定句写清：「不要修改 `package.json`」「不要执行 `pnpm install`」「不要新增依赖」。子代理不会自己推断出这些限制。

### 3.2 依据

**CrewAI Tasks 文档**把任务必填字段压缩到两个：

> `description` — "A clear, concise statement of what the task entails."
> `expected_output` — "A detailed description of what the task's completion looks like."

同一页的字段表还给出 `guardrail`（进入下一任务前校验输出）、`guardrails`（多条校验）、`guardrail_max_retries`（默认 3）、`human_input`（人工复核最终答案）、`output_json` / `output_pydantic`（结构化输出）、`output_file`、`context`（前置任务名列表，禁止前向引用）。CrewAI 的实现会在 guardrail 校验失败时带着错误信息重试该任务。

**arXiv 2510.17109《Verification-Aware Planning for Multi-Agent Systems》**（VeriMAP，Purdue 与 Megagon Labs，2025-10-20）把任务的输入输出结构化写进规划：

> "The VeriMAP planner decomposes tasks, models subtask dependencies, and encodes planner-defined passing criteria as subtask verification functions (VFs) in Python and natural language."

> "Analogous to good project management, tasks are assigned with clear acceptance criteria, and handoffs follow well-defined 'passing standards'."

该文把执行失败分成三类：完全没有结果；输出格式错误导致下游无法消费；结果看起来合理但偏离规划者或下游预期。第二类与第三类的例子是「section extractor 返回原始文本，没有返回结构化 JSON」「把 summarize key claim 误解成 summarize all paragraphs」。

**分解粒度的权衡**在 ceur-ws Vol-4307 paper31 中有明确表述：

> "Granularity—how finely the task is split—does not admit an abstract optimum. Many small sub-tasks exploit specialisation but multiply coordination cost and the number of interfaces at which information may be lost"

这条与 R3.2、R3.3 对应：粒度没有理论最优值，只能按「验收判据能否用一条命令表达」和「接口数量是否可控」两个可观测指标来定。

**Anthropic 多代理文章**关于派发质量的原文：

> "Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information."

文中给出的派发要素是 objective、output format、guidance on tools and sources、clear task boundaries，与 R3.1 的五项字段一一对应。

### 3.3 判定流程

对一个候选任务依次问五个问题，任意一个答不上来就退回重写：

1. 产物落在哪个路径？写出完整绝对路径。
2. 用什么命令判定它通过？写出命令原文与期望输出。
3. 允许改哪些文件？写出白名单。
4. 多少分钟内应该出现第一个文件？写出检查点。
5. 子代理需要知道哪些它自己读不到的事实？写出事实清单。

---

## 4. 主题三：派发信息完整性

### 4.1 结论条文

- **R4.1** 子代理看不到主会话的任何内容。派发单必须自带五类事实：绝对路径、文件与行号、既有结论及其证据位置、禁止事项、环境约束。
- **R4.2** 路径一律写绝对路径或相对工作区根的路径。禁止出现「那个文件」「上次那个脚本」「之前的方案」这类指代。
- **R4.3** 既有结论必须标注证据等级：已核实（附命令与关键输出）、未核实（标注为推测）、已否证（附否证依据）。三种等级混在一起写会让子代理把推测当成事实继续推理。
- **R4.4** 禁止事项要写具体对象与动作：「不要修改 `package.json`」「不要执行 `pnpm install`」「不要碰 `docs/` 下除本文之外的文件」「不要用 `alert`」。
- **R4.5** 环境约束必须写清：文件沙箱策略、代理设置、端口号、被禁用的包管理器、临时目录位置。子代理无法从代码里推断这些。
- **R4.6** 反过来，子代理自己读得到的信息不要写进派发单。写之前问两个问题：能不能从代码里读到？它会不会真的去看？两个都答是就删掉。仓库里读不到的事实（会议决定、部署流程、集成测试需要的环境变量）必须写。
- **R4.7** 派发单里给出「已知失败路径」：已经试过并失败的做法，以及失败原因。省掉这一段，子代理会重复同一个失败。
- **R4.8** 派发单长度以 300 到 800 字为宜。超过 1500 字说明任务太大，应当拆分。

### 4.2 依据

**Claude Code 子代理文档**描述上下文边界：

> "Each subagent runs in its own context window with a custom system prompt, specific tool access, and independent permissions."

中间的工具调用与结果留在子代理内部，只有最终结果回到主对话。同页还提示子代理的 `description` 会占用主上下文，所有自定义子代理的 description 合计超过 15,000 token 时启动会给出警告，建议把细节移进子代理的 system prompt（只在运行时加载）。这条对 R4.8 有直接参考价值：常驻说明要短，单次派发要具体。

**Anthropic《Best practices for Claude Code》**给出「告诉它看不到的东西」这一原则：

> "Tell Claude what it can't see"

> "Only write down what Claude can't find by reading the repo, or what it would otherwise spend time rediscovering every session."

同页的判定方法正是 R4.6 引用的两问。文章还指出，任务跑偏的常见原因是缺少仓库里读不到的信息，加强指令语气解决不了这个问题。

**Cognibl 的定义完成文章**区分提醒与规格：

> "A reminder is read by someone who shares your context... A specification is read by someone who has none of that context."

派发单属于规格，读者没有任何共享上下文，因此不能依赖省略与指代。

**VeriMAP** 关于交接失败的分析：

> "Execution failures frequently arise not from flawed reasoning alone, but from subtle misalignments in task interpretation, output format, or inter-agent handoffs."

### 4.3 本项目对照

「远程环境复现 bug」这个任务超时未返回。按 R4.5 检查，派发单没有写清远程机器的安装形态、CLI 入口路径、测试 home 目录、ssh 命令分隔符约定（项目教训 8：远程 PowerShell 用 `;` 分隔，内联 `$` 变量会被本地 shell 提前展开）。子代理需要在远程环境里自行摸索这些事实，摸索本身消耗了全部预算。按 R4.7 检查，派发单也没有写「之前哪些远程命令失败过」，重复试错因此发生。

---

## 5. 主题四：写入范围隔离

### 5.1 结论条文

- **R5.1** 每个任务在派发单里声明写入白名单，白名单之外一律只读。白名单写成文件路径或目录前缀，粒度到文件。
- **R5.2** 同一个文件在同一时刻只能属于一个子代理。以下共享文件由主会话独占修改：`package.json`、`AGENTS.md`、`README.md`、模块出口文件（`src/index.ts` 这类统一导出文件）、语言字典文件、锁文件。
- **R5.3** 并行子代理数量上限等于互不重叠的写入白名单数量，本项目建议同时不超过 3 个。
- **R5.4** 需要改同一个文件的任务必须声明依赖关系，按串行顺序执行，禁止并行。
- **R5.5** 交付时主会话执行 `git status` 与 `git diff --stat`，逐个核对改动文件是否落在白名单内。越界文件由主会话决定保留或回退。
- **R5.6** 隔离声明不等于隔离生效。使用 worktree 或独立分支时，仍要在合并前核对 diff，公开缺陷记录表明 worktree 隔离对部分实现不生效。
- **R5.7** 冲突处理规则：同一文件出现两个版本时，以主会话最后一次验证通过的版本为准，另一份作废并在项目记忆里记一条。不要试图逐行合并两个子代理的改动。
- **R5.8** 只读类任务（检索、评审、现状调查）在派发单里显式声明为只读，并要求子代理把结论写进指定的一份报告文件，其余文件一律不动。只读任务之间的写入冲突由此变成「一个任务一个报告文件」。

### 5.2 依据

**Claude Code 并行代理文档**给出判定方法：

> "Do the tasks touch the same files? Isolate the work with worktrees."

> "Agent teams don't isolate teammates in worktrees, so partition the work so each teammate owns a different set of files."

**Claude Code agent teams 文档**列出不适用场景：

> "For sequential tasks, same-file edits, or work with many dependencies, a single session or subagents are more effective."

**Claude Code worktrees 文档**说明隔离单元的构造方式：git worktree 提供独立工作目录与独立分支，共享同一份仓库历史与远端；`claude --worktree <name>` 默认建在 `.claude/worktrees/<name>/`，分支名为 `worktree-<name>`；`.worktreeinclude` 可以把被 gitignore 的文件（例如 `.env`）带进每个新 worktree。退出时如果 worktree 有未提交或未跟踪改动，会提示保留或删除。

**A2A 协议的任务生命周期文档**给出并行任务的依赖声明方式：同一 `contextId` 下可以建立多个并行任务并声明依赖（例如先订机票，再并行订酒店与租车，最后基于酒店任务加订 SPA）。这与 R5.4 的串行依赖声明对应。

**公开缺陷记录** anthropics/claude-code issue #56137 标题为 "isolation: \"worktree\" does not actually isolate subagent file writes"（已标记为重复关闭）。这条不构成对官方能力的断言，只用来说明 R5.6：隔离机制的声明与实际生效需要在交付后核对。

### 5.3 本项目的共享文件清单

| 文件 | 冲突原因 | 归属 |
|---|---|---|
| `package.json` | 版本号、依赖、scripts 三处都会被并行任务改 | 主会话独占 |
| `src/index.ts` | 统一导出入口，每个新增模块都要加一行 | 主会话独占 |
| `src/client/locales.ts` | 8 种语言字典在同一文件，新增键必须全语言补齐 | 主会话独占 |
| `scripts/build-client.mjs` | 新增客户端模块要加进构建清单 | 主会话独占 |
| `tsconfig.json` | 新增 DOM lib 之类的配置改动会影响全部构建 | 主会话独占 |
| `AGENTS.md` / `docs/project-memory.md` | 全局规范与教训，任何子代理都无权改 | 主会话独占 |
| `tests/*.test.mjs` | 一个测试文件对应一个功能，可以按文件分配 | 可按文件分配 |

---

## 6. 主题五：验收与复核

### 6.1 结论条文

- **R6.1** 子代理返回的结论默认是「主张」，写进任何文档之前必须由主会话复核。项目记忆教训 3 记录过一次集体失败：6 个 teammate 报失败，4 个子代理中只有 1 个成功写回产物。
- **R6.2** 复核结果分三态：**已核实**、**未核实**、**已否证**。因为超时、限流、环境缺失而无法核对的内容只能记为「未核实」，不得记为「已否证」，也不得记为「已通过」。
- **R6.3** 每个结论必须附可重新执行的命令与关键输出行。没有命令的结论按「未核实」处理。
- **R6.4** 主会话必须亲自执行的最小集合：`pnpm run typecheck`、`pnpm run build`、`pnpm run test` 三条命令；改动客户端时追加真实页面几何读取与截图；改动发布配置时追加 npm registry 与 dist-tag 读取。
- **R6.5** 结构存在不等于功能正确。项目记忆教训 11 记录过：图标查表键写错时 `innerHTML` 里仍有完整的 SVG 文本，尺寸缺陷时 markup 完全正确而 `getBoundingClientRect()` 返回 0×0。验收必须读几何或截图。
- **R6.6** 验收判据写成断言形式：期望值、实际值、比较方式三者齐全。「正常」「没问题」「符合预期」都不构成判据。
- **R6.7** 子代理的自评只能作为线索。让独立代理互相做对抗式复核，比让同一个代理评价自己的产出更可靠。
- **R6.8** 采信条件四条，全部满足才采信：① 产物文件存在且修改时间落在任务时间窗内；② 验收命令可以重新执行并复现同样结果；③ 结论与产物内容一致；④ 没有越界写入。
- **R6.9** 出现以下任意一种情况必须重做：产物缺失；命令无法重新执行；结论与产物矛盾；越界写入影响了其他任务的产物；子代理改写了验收判据。

### 6.2 依据

**Claude Code workflows 文档**给出可采信度分级的直接依据：

> "When the verifier agents can't check a claim, such as after a rate limit or API error, the report lists that claim as unverified instead of counting it as refuted."

同页描述内置 `/deep-research` 工作流的做法：多角度扇出搜索，抓取并交叉核对，对每条主张投票，输出带引用的报告，未通过交叉核对的主张被过滤。质量模式则是让独立代理互相做对抗式复核（"adversarially review each other's findings"）之后才上报。

**Anthropic《Best practices for Claude Code》**给出自检缺失的诊断：

> "Claude said it was done and it wasn't quite, usually because it had no way to check its own work."

同页的处置原则是「给它一条能跑的命令」：

> "Give Claude a check to run"

并把「什么时候算完成」分成两类：非确定性（请求证据、`/goal`、`/code-review`）与确定性（测试、typecheck、Stop hook、CI）。R6.4 与 R6.6 对应确定性这一类。

**CrewAI Tasks 文档**的 guardrail 机制对应 R6.2 的三态判定：guardrail 返回成功或失败，失败时带着错误信息重试该任务，最多 `guardrail_max_retries` 次（默认 3）。

**OpenAI Agents SDK Guardrails 文档**补充了检查时机：输入护栏只对链条第一个代理运行，输出护栏只对产生最终输出的代理运行，工具护栏每次受保护的工具调用都运行。两种执行模式中，并行模式延迟更低，但护栏触发时代理可能已经消耗 token 并执行了工具；阻塞模式（`run_in_parallel=False`）让代理在护栏通过前不启动，适合避免副作用。触发 tripwire 时会拒绝候选最终输出，已完成的工具调用与输出仍会持久化。这条对 R6.9 有用：即使产出被拒绝，中间证据仍可保留用于复核。

**VeriMAP** 的三类失败对应 R6.5：无结果、格式错误导致下游无法消费、结果看似合理但偏离预期。第三类最容易被误采信，必须靠可执行断言拦截。

### 6.3 复核动作表

| 子代理声称 | 主会话动作 | 采信条件 |
|---|---|---|
| 改了代码，测试通过 | 亲自跑 `pnpm run test`，比对测试数量 | 数量与新增用例数一致，全绿 |
| 页面显示正常 | 读 `getBoundingClientRect()`，明暗两主题各截一张图 | 尺寸非 0，两主题都符合判据 |
| 已发布到 npm | 读 `npm view <name> dist-tags` 与 tarball 状态码 | 版本号与 tarball 都到位 |
| 文档已更新 | 读文件，比对章节与版本头 | 内容存在且版本号正确 |
| 功能已修复 | 复现原始故障路径 | 故障现象消失，且回归用例存在 |

---

## 7. 主题六：失败处理

### 7.1 结论条文

- **R7.1** 每个任务在派发单里写明时间预算：快任务（检索、评审、单文件改动）15 分钟；中等任务（多文件实现）45 分钟；远程环境任务 30 分钟。超出预算就立即中断并记录中断原因。
- **R7.2** 判断子代理是否在工作，以产物文件的修改时间与大小为准；运行时报告的「运行中」状态不能作为依据。
- **R7.3** 四态判定与动作：

  | 状态 | 判定条件 | 动作 |
  |---|---|---|
  | healthy | 运行中且产物文件在增长 | 继续等待 |
  | stalled | 运行中且最后一次写入距今超过 10 分钟 | 记录告警，继续观察，同时准备接管 |
  | hung | 运行中且最后一次写入距今超过 30 分钟 | 中断子代理，按超时终止记录 |
  | dead | 已不在运行且没有完成通知 | 读产物末段内容，按尽力结果处理 |

- **R7.4** 阈值按任务类型调整：快任务的 stalled 收紧到 3 分钟、hung 收紧到 10 分钟；长调研任务可以放宽，hung 不超过 60 分钟。
- **R7.5** 无法判定产物年龄时，默认判为 stalled。不确定的情况一律向失败方向回退，禁止向健康方向回退。
- **R7.6** 中断前先取证：已写入的文件清单、最后一条输出、可复用的中间产物路径。这三样决定接管时是补做还是重做。
- **R7.7** 中断后由主会话接管。先读产物判断完成度，再决定补做、缩小范围还是自己执行。不要原样重派同一个派发单。
- **R7.8** 同一派发单最多重派一次。第二次失败后改为主会话自己执行，或者把任务拆成更小的两份。
- **R7.9** 远程任务必须先把脚本写到本地文件再传过去执行，并给远程命令加超时。项目记忆教训 8 与教训 23 记录过内联命令被引号规则吞掉、scp 走 SFTP 失败的具体现象。
- **R7.10** 任务进入终态（完成、取消、拒绝、失败）之后不能重启，后续工作必须在同一上下文里新建任务。这条来自 A2A 的任务生命周期规范，用于避免「在失败任务上继续追加要求」。

### 7.2 依据

**子代理看门狗实践文档**（npow/claude-skills 的 `subagent-watchdog.md`）给出四态判定与阈值：

> "treats output-file growth as ground truth"

> "a process that is deadlocked, spinning, or stuck in an infinite retry loop stays status: \"running\" forever and the completion notification never fires"

默认阈值是 stalled 10 分钟、hung 30 分钟、轮询间隔 60 秒；快任务收紧到 stalled 3 分钟、hung 10 分钟；长研究可以放宽，hung 不超过 60 分钟。文档中的铁律是：

> "'TaskOutput status is running' is never sufficient justification to enter an unbounded wait."

失效保护方向也写明：无法判定年龄时回退到 stalled，不得回退到 healthy；运行时信号与文件信号冲突时以文件系统为准。

**Claude Code 并行代理文档**给出运行中的检查手段：`/tasks` 列出后台任务并可以 attach 或 stop，`claude agents` 打开代理视图。

**LangChain subagents 文档**给出异步任务的三个工具模式：start job 返回 job_id，check status 返回 pending/running/completed/failed，get result 取结果。同页指出同步执行的代价是「长时间任务会冻结对话」：

> "Long-running tasks freeze the conversation"

**A2A 任务生命周期文档**给出终态语义：

> "Once a task reaches a terminal state (completed, canceled, rejected, or failed), it cannot restart. Any subsequent interaction related to that task, such as a refinement, must initiate a new task within the same contextId."

同页还说明任务在信息不足时应返回 `input-required` 请求澄清，不要猜测。这一点对派发单有反向要求：派发单信息不全时，子代理应当停下来提问，主会话应当把「信息不足就返回提问，不要自行假设」写进派发单。

### 7.3 本项目对照

「运行 48 分钟没有任何文件产出」这个事件按 R7.3 应当在第 10 分钟进入 stalled、第 30 分钟进入 hung 并被中断，实际到 48 分钟才由人工中断。缺失的机制是产物年龄监测。落地动作见 §9 第 3 条。

---

## 8. 任务派发模板

### 8.1 模板正文

复制下面整段，逐项填写。任何一项留空就不派发。

```text
【任务编号】T-<日期>-<两位序号>
【任务名】<动词> + <对象> + <范围>          （例：为悬停卡新增复制守卫，范围限 src/client/）
【执行者】<子代理名>             【任务类型】实现 / 调研 / 复现 / 评审（四选一）
【写入白名单】
  允许修改：<绝对路径或相对工作区根的路径，一行一个>
  只读：<需要读但不许改的路径>
  禁止修改：package.json、src/index.ts、src/client/locales.ts、AGENTS.md、docs/project-memory.md
  （以上为默认禁止项，确实需要改动时由主会话自己动手）

【背景事实】（子代理看不到主会话，必须自带）
  工作区：<绝对路径>
  相关文件：<路径:行号>，说明这几行是什么
  既有结论：
    - 已核实：<结论>（证据：<命令> 输出 <关键行>）
    - 未核实：<推测内容>（来源：<谁在什么场景下说的>）
    - 已否证：<结论>（否证依据：<路径:行号 或 命令输出>）
  已知失败路径：<试过什么、为什么失败>（没有就写「无」）
  环境约束：<沙箱策略、代理设置、端口、禁用的包管理器、临时目录>

【目标】<一句话，可以被验收判据判定的结果>

【输入】
  必读：<文件路径>
  必须执行：<命令原文>

【输出】
  产物路径：<绝对路径>
  产物格式：<Markdown 章节 / TS 模块 / 测试文件 / 截图 + 几何数据>

【验收判据】
  命令：<可直接粘贴执行的命令>
  期望：<期望输出或断言，写清期望值、实际值、比较方式>
  附加检查：<几何读取、截图、registry 查询等>

【预算】
  时间上限：<分钟>
  首个落盘检查点：开始后 10 分钟内必须出现 <骨架文件路径>，否则视为无产出
  中断条件：超过时间上限，或 30 分钟无任何文件写入

【回报格式】
  1. 结论：已核实 / 未核实 / 已否证，逐条列出
  2. 证据：每条结论附命令原文与关键输出行
  3. 产物：改动文件清单（路径 + 行数变化）
  4. 未解决项：需要主会话决定的问题
  5. 禁止在回报里写「已验证」而没有命令输出

【信息不足时】停下来提问，不要自行假设；把缺什么写清楚再返回。
```

### 8.2 填写示例（本项目真实任务，已完成）

```text
【任务编号】T-20261120-03
【任务名】为悬停卡新增复制守卫，范围限 src/client/
【执行者】copy-guard-worker   【任务类型】实现
【写入白名单】
  允许修改：src/client/copyGuard.ts（新建）、src/client/HoverCard.tsx、
            scripts/build-client.mjs、tsconfig.json、tests/copy-guard.test.mjs（新建）
  只读：src/client/marks.ts、src/client/RowAction.tsx、docs/research/08-hover-interaction.md
  禁止修改：package.json、src/index.ts、src/client/locales.ts、AGENTS.md、docs/project-memory.md

【背景事实】
  工作区：<repo-root>
  相关文件：src/client/HoverCard.tsx 组件体首行（挂载点）；
            .research/dsh-repo/packages/client/ui-primitives/src/HoverCard.tsx:290-304（官方整卡复制行为，onClick 与 Enter/Space 都触发）；
            同文件 :343-344（官方 onClickCapture / onPointerDownCapture 由卡片持有）
  既有结论：
    - 已核实：官方 HoverCard 把整张卡注册成 role="button"，点击空白处也会复制会话标题（证据：读上述文件行号）
    - 已核实：React 17+ 合成事件绑在 root container，document 上的原生 capture 先于合成事件触发
    - 未核实：官方后续版本是否改了复制实现（未逐版本核对，本任务不需要）
  已知失败路径：只在单个 button 上加 stopPropagation 无效，点标签或备注仍会误触（1.0.2 已试过）
  环境约束：Windows 沙箱禁止 named-pipe spawn，构建走 TypeScript compiler API，不要引入 esbuild；
            测试用 node --test --test-isolation=none；临时文件放 $env:TEMP/.drafts/<会话id>/

【目标】在含 [data-status-slot] 的官方卡内，点击非交互区域不再触发复制，且拖选文本不受影响

【输入】
  必读：src/client/HoverCard.tsx、src/client/RowAction.tsx、scripts/build-client.mjs
  必须执行：pnpm run typecheck

【输出】
  产物路径：src/client/copyGuard.ts（useCardCopyGuard 钩子）、tests/copy-guard.test.mjs
  产物格式：TypeScript 模块 + node:test 测试文件

【验收判据】
  命令：pnpm run typecheck && pnpm run test
  期望：typecheck 退出码 0；测试数量从 102 增加到 111，全部通过
  附加检查：真实页面上点击卡内标题与空白处，copied 为 false；拖选文本不触发复制

【预算】
  时间上限：45 分钟
  首个落盘检查点：10 分钟内出现 src/client/copyGuard.ts 骨架
  中断条件：超过 45 分钟，或 30 分钟无文件写入

【回报格式】按模板五段回报，结论逐条标三态，附命令原文与关键输出行

【信息不足时】停下来提问，不要自行假设。
```

### 8.3 只读任务的简化模板

调研与评审类任务把「写入白名单」收窄到一份报告文件，其余字段不变：

```text
【任务名】调研 <主题>，范围限网络资料与 .research/dsh-repo/
【写入白名单】允许修改：docs/research/<编号>-<主题>.md（唯一产物）；其余全部只读
【输出】该文件，章节结构：调研范围与方法 → 各主题（先条文后依据）→ 参考链接表
【验收判据】文件存在；每个主题至少一条可执行条文；每条引用给出来源标题与 URL；
           引用不含 csdn.net、云厂商开发者社区、简书、51CTO、抖音
【回报格式】三态结论 + 引用条数 + 未能核实的点
```

---

## 9. 本项目落地清单

| 编号 | 条目 | 现状 | 动作 | 验收方式 |
|---|---|---|---|---|
| 1 | 派发单模板 | 无统一模板，每次临时写 | 把 §8.1 模板落到 `docs/agent-task-template.md`，或在 `AGENTS.md` 增加指向本文的条目 | 下一轮派发直接引用模板编号 |
| 2 | 写入白名单 | 派发时口头说明，无记录 | 任务看板增加「写入白名单」一列；共享文件按 §5.3 清单归属主会话 | 交付时 `git diff --stat` 逐项核对 |
| 3 | 产物年龄监测 | 无，48 分钟无产出靠人工发现 | 派发时约定首个落盘检查点；主会话按 §7.3 四态表轮询产物 mtime | 出现 stalled 时能在 10 分钟内发现 |
| 4 | 超时预算 | 无 | 按 §7.1 三类预算写进派发单 | 超预算任务全部有中断记录 |
| 5 | 复核三态 | 结论直接写进文档 | 文档里的每条结论标注已核实／未核实／已否证，并附命令 | 抽查三条结论能否用文档里的命令复现 |
| 6 | 主会话亲自验证清单 | 部分执行 | 按 §6.4 固定为 typecheck / build / test 三条，客户端改动追加真实页面几何与截图 | 每次交付留一份命令输出片段 |
| 7 | 重派次数上限 | 无 | 同一派发单最多重派一次，第二次失败改为主会话执行 | 记录在项目记忆教训里 |
| 8 | 远程任务规范 | 已有教训但未成文 | 派发单固定包含「脚本先落盘再传」「命令加超时」「分隔符用 `;`」三条 | 远程任务回报里附脚本路径 |
| 9 | 子代理自评限制 | 无 | 回报格式禁止出现「已验证」而无命令输出 | 回报模板第 5 条生效 |
| 10 | 只读任务隔离 | 无 | 一个只读任务对应一份报告文件 | 并行只读任务无同名产物 |

### 9.1 与本项目既有规范的衔接

- 本文第 4 节的「派发信息完整性」与 `AGENTS.md` Standing Orders 第 2、3 条一致：事实源以 `.research/dsh-repo/` 的行号为准，路径从环境变量解析。
- 本文第 6 节的复核要求与 `AGENTS.md` 开发回路第 8 条一致：客户端改动必须在真实页面复核，只看 DOM 字符串不算验收。
- 本文第 7 节的失败处理与项目记忆教训 3 一致：不要假设委派成功，主会话自己核对产出是否存在。
- 本文只覆盖协作流程，不修改 `AGENTS.md`。把条文同步进 `AGENTS.md` 属于主会话的决定范围。

---

## 10. 参考链接汇总表

| 编号 | 标题 | 发布方 | 类型 | URL | 用于条文 |
|---|---|---|---|---|---|
| S1 | How we built our multi-agent research system | Anthropic | A | https://www.anthropic.com/engineering/multi-agent-research-system | R2.1 R2.2 R2.3 R2.6 R3.2 |
| S2 | Building effective agents | Anthropic | A | https://www.anthropic.com/engineering/building-effective-agents | R2.3 R2.6 |
| S3 | Best practices for Claude Code | Anthropic | A | https://www.anthropic.com/engineering/claude-code-best-practices | R4.6 R6.4 R6.5 |
| S4 | Create custom subagents | Claude Code | A | https://code.claude.com/docs/en/sub-agents | R2.4 R4.1 R4.8 |
| S5 | Run agents in parallel | Claude Code | A | https://code.claude.com/docs/en/agents | R5.1 R5.2 R7.2 |
| S6 | Orchestrate agent teams | Claude Code | A | https://code.claude.com/docs/en/agent-teams | R5.4 R2.2 |
| S7 | Run parallel sessions with worktrees | Claude Code | A | https://code.claude.com/docs/en/worktrees | R5.6 |
| S8 | Dynamic workflows | Claude Code | A | https://code.claude.com/docs/en/workflows | R6.2 R6.7 |
| S9 | Multi-agent orchestration | OpenAI Agents SDK | A | https://openai.github.io/openai-agents-python/multi_agent/ | R2.1 R6.7 |
| S10 | Guardrails | OpenAI Agents SDK | A | https://openai.github.io/openai-agents-python/guardrails/ | R6.9 |
| S11 | Multi-agent | LangChain | A | https://docs.langchain.com/oss/python/langchain/multi-agent | R2.3 |
| S12 | Subagents | LangChain | A | https://docs.langchain.com/oss/python/langchain/multi-agent/subagents | R2.4 R7.2 |
| S13 | Agent teams | Microsoft AutoGen | A | https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html | R2.1 |
| S14 | Crews | CrewAI | A | https://docs.crewai.com/en/concepts/crews | R5.4 |
| S15 | Tasks | CrewAI | A | https://docs.crewai.com/en/concepts/tasks | R3.1 R3.7 R6.2 |
| S16 | A2A key concepts | Google / Linux Foundation | B | https://a2a-protocol.org/latest/topics/key-concepts/ | R5.1 |
| S17 | Life of a task | Google / Linux Foundation | B | https://a2a-protocol.org/latest/topics/life-of-a-task/ | R5.4 R7.8 |
| S18 | Large Language Model based Multi-Agents: A Survey of Progress and Challenges (arXiv 2402.01680) | Guo 等 | C | https://arxiv.org/abs/2402.01680 | §1 背景 |
| S19 | Verification-Aware Planning for Multi-Agent Systems (arXiv 2510.17109) | Xu 等，Purdue 与 Megagon Labs | C | https://arxiv.org/abs/2510.17109 | R3.1 R3.2 R4.7 R6.5 |
| S20 | Granularity of task decomposition in multi-agent workflows (Vol-4307 paper31) | CEUR Workshop Proceedings | C | https://ceur-ws.org/Vol-4307/paper31.pdf | R3.2 R3.3 |
| S21 | Subagent watchdog: output-file growth as ground truth | npow/claude-skills | D | https://raw.githubusercontent.com/npow/claude-skills/main/_shared/subagent-watchdog.md | R7.2 R7.3 R7.4 R7.5 |
| S22 | How to write a definition of done for AI agents | Cognibl | D | https://cognibl.com/blog/definition-of-done-for-ai-agents | R4.6 R6.6 |

来源统计：官方文档 15 条（S1–S15），协议规范 2 条（S16–S17），学术论文 3 条（S18–S20），工程实践 2 条（S21–S22）。

### 10.1 排除说明

检索过程中出现过大量二手转述页面，包括 CSDN、腾讯云开发者社区、阿里云开发者社区、华为云开发者社区、简书、51CTO、抖音，以及若干以「十分钟读懂多智能体」为题的内容聚合页。这些页面不进入引用列表。凡官方文档与二手转述冲突的地方，以官方文档原文为准，这也与 `AGENTS.md` Standing Orders 第 2 条一致。

### 10.2 未能核实的点

- S8 提到的 `verified / unverified / refuted` 三态是 Claude Code 内置 `/deep-research` 工作流的行为描述，本文借用其语义作为复核分级，未在本地复现该工作流的输出格式。
- S20 的粒度结论来自会议论文摘要页，正文中关于协调成本的具体系数未逐项核对。
- S21 的四态阈值来自社区实践文档的默认值，本文按项目实际情况调整了快任务阈值（3 分钟 / 10 分钟），调整依据是本项目单文件改动的实际耗时，没有独立实验数据支撑。
- S22 关于定义完成的可校验写法只抓取了摘要与要点，未逐段核对原文。
