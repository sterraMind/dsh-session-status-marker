# 03 · 工程化规范、打包与测试环境

> **文档版本**：v1.0.2 · 2026-11-12（对应插件 1.0.2）

> 依据 `.research/dsh-repo/` 官方仓库镜像（文件:行号）+ 本机实测环境。
> 外部社区资料单独标注，不与官方事实混用。

## 1. 运行环境实测（本机，2026-11-10/11）

| 项 | 值 | 来源 |
|---|---|---|
| 工作区 | `<repo-root>` | pwd |
| `$DSH_HOME` | `<user-home>/AppData/Local/scoop/persist/deepsek-harness-pre` | PowerShell `$env:DSH_HOME` |
| 打包版 | `...\scoop\apps\deepseek-harness-pre\0.2.2-rc.1\resources\`（`app.asar` 213,202,918 B + `app.asar.unpacked`） | 实测 |
| Node / pnpm / git | v26.13.0 / 11.22.0 / 2.56.0.windows.4 | 实测 |
| 代理 | `http_proxy` / `HTTPS_PROXY` = `http://127.0.0.1:7897`，`NODE_USE_ENV_PROXY=1` | 实测 |
| Web GUI | `http://127.0.0.1:55101` | runtime context |
| `$DSH_HOME/profiles/` | 仅 `desktop`，且内容是用户数据（png/py/ps1/json），**不是标准 profile 骨架** | 实测 |
| `$DSH_HOME/cordis.patch.yml` | `- id: tool-web / config: {search: false, fetch: true, searchTimeoutMs: 60000}`；注释说明 home 级 patch 叠加在每个 profile 之上，且「a non-insert patch REPLACES the target row's whole config (no deep merge)」 | 实测 |

已知环境坑（避免重复踩）：

- `git clone` 与 `curl.exe` 均报 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e)`；
  **Node 内置 fetch + `NODE_USE_ENV_PROXY=1` 走代理可成功**（仓库 zip 即由此下载）。
- `api.github.com` 被 SSRF 拦截（解析到 `198.18.0.185`）；`web_fetch` 访问
  `raw.githubusercontent.com` / `www.dsh.so` 同样 `SSRF blocked`。
  `mcp__magpie__exa__web_fetch_exa` 可抓外部页面。
- `npm view` 首次失败于日志目录写入权限（`<user-home>/AppData/Local/npm/_logs`）——
  **规避办法**：把 `npm_config_cache` / `npm_config_logs_dir` 指到工作区或 `$TEMP/.drafts/<会话id>/`，
  并优先使用 `pnpm`（用户明确要求 pnpm/uv 减少冗余）。
- 打包版源码在 `app.asar` 单文件内，**不是目录**；用自写 Node 脚本按 asar header pickle 解析抽取，
  不要把 `...app.asar\dsh\` 当目录访问。
- 官方仓库 zip 已解到工作区镜像 `.research/dsh-repo/`（62.2 MB，含全量 docs 与 14 个 packages 域），
  这是本项目的**离线事实源**；`.research/dsh-repo/AGENTS.md` 等会作为工作区指令自动注入，属正常现象。

## 2. 包与工程规范（官方）

`packages/AGENTS.md` / 根 `AGENTS.md`（经 b2/b4 摘要记录，全文见镜像）：

- 包命名 `@deepseek-ai/dsh-<name>`；client 包 `@deepseek-ai/dsh-client-<name>`；
  路径 `packages/<group>/<pkg>/`。**仓库外独立 bundle 有自己的 npm 名**，不需要改 DSH 仓库目录。
- `@deepseek-ai/cordis` 与共享 dsh 实例放 `peerDependencies` **和** `devDependencies`；
  无状态工具/纯第三方放 `dependencies`
  （`docs/user/develop/basic/publish.md:79-136`）。
- ESM everywhere（`type: module`）；`strict: true` + `noImplicitAny`；禁止新增 `as unknown` 断言；
  **每个导出必须有 JSDoc**（`verify-export-jsdoc`）；文件结尾恰好一个换行；`git diff --cached --check`。
- 「Registrations are effects: every contribution goes through `ctx.effect()` / `ctx.on()`」。
- Typed events / typed session events 用 **declaration merging**；`SessionEventMap` 成员缺省 required-on-read，除非 `ignorable: true`。
  **V2 注意**：这是 in-repo 包的规则。仓库外 bundle 不能写自定义 `SessionEventMap` 事件（`Session.append` 无 `ignorable` 参数，读路径对未知 required 事件 fail-closed）。本项目用 `ctx.storageDomain` 的 zod schema 做数据校验，用 `declare module '@deepseek-ai/cordis'` 只合并 `Context.sessionStatus` 服务与 `LocaleNamespaceMap` 等类型面，不碰 `SessionEventMap`。见 `docs/architecture.md` §3.1。
- 「No hardcoded tunables in plugins」——两个部署可能想不同的值都要进 Config
  （`docs/user/develop/basic/config.md:76-94`）。
- `Model-visible ⟺ logged`；`Waterfall listeners MUST call next()`；
  `Switch on discriminant tags`（closed union 用 assertNever，merge-extensible 走 documented default）；
  `Misconfiguration fails loud`；`Opaque cross-boundary ids are branded`（`Branded<B>`）；
  `Trust TypeScript at typed same-process boundaries`；`Source plane vs artifact plane, never mixed`；
  `An empty catch names the error`；`Prefer symmetry for parallel values`。
- `docs/defensive-patterns/README.md` 在改包、远程服务、会话行为、生命周期前必读。
- PR labels：一个 `kind/*` + 所有相关 `area/*`。

## 3. Bundle 结构与装载

`docs/user/develop/basic/publish.md:18-66`：

```json
{
  "name": "dsh-session-status-marker",
  "version": "1.0.0",
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib/", "cordis.patch.yml", "locale/", "icon.svg"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "engines": { "dsh": ">=0.2.0 <0.3.0" }
}
```

`cordis.patch.yml` 形如（`:18-66`）：

```yaml
- insert:
    - id: session-status-marker
      name: dsh-session-status-marker
```

- profile 在 `$DSH_HOME/profiles/<name>`，含 `package.json`（`dsh.profile.bundles` 有序列表）
  与自己的 `cordis.patch.yml`。
- `dsh plugin --profile <name> add ./hello-plugin` 首次会初始化 profile，
  `@deepseek-ai/dsh-base` 为第一 bundle；`dsh --profile demo --dump-config` 校验 layer（`:79-136`）。
- **加载顺序（后覆盖前）**：①profile `dsh.profile.bundles` 里每个 bundle patch（列表顺序）
  ②profile 自己的 `cordis.patch.yml` ③home 级 `$DSH_HOME/cordis.patch.yml`
  ④每个 `--patch <path>`（argv 顺序）。
  「Later layers win per row, and a patch replaces a row's entire `config` value rather than
  deep-merging keys」（`:79-136`）——**这与本机 `$DSH_HOME/cordis.patch.yml` 的注释一致**。
- git 安装（`dsh plugin --profile demo add github:you/hello-plugin`）只取源码不跑 build，
  作者需自带 `prepare` 脚本自包含构建 `lib/`；pnpm≥10 需在 profile 的 `pnpm-workspace.yaml`
  加 `allowBuilds: { dsh-hello-plugin: true }` 并 pin commit。
  **规避办法**：npm 发布（带 `lib/`）或 `pnpm pack` tarball（`:161-187`）。
- `engines.dsh` 用 SemVer 范围；缺失时回退检查 `@deepseek-ai/dsh*` peer 范围（`:18-66`）。
  社区指南称「当前安装器/加载器都不校验 engines.dsh」，但官方
  `docs/tool-catalog.md:60` 明写「**Unmet DSH version requirements (engines.dsh, else DSH peer
  dependencies) block installation and activation**」——**以官方仓库为准，必须写 `engines.dsh`**。

### 0.2 世代的会话内安装（推荐给最终用户）

`docs/tool-catalog.md:58-122`：`plugin_manager` 动作
`list_plugins` / `list_bundles` / `set_plugin` / `set_bundle` / `install_bundle` /
`remove_bundle` / `list_version_exemptions` / `set_version_exemption`；
「Every action requires danger-full-access permission or approval for this call」、
「Changes affect every session in this profile」、「Version exemptions risk crashes and data loss」；
`approvedBuilds` 只在用户明确批准安装脚本后从 `pendingBuilds` 传入。
`docs/tool-catalog.md:29, :831, :842`：`cordis_inspect_list` / `cordis_inspect_query` 是
Creator mode 只读运行时检查工具；「**Call this Tool before writing or configuring a plugin …
Do not guess names or treat an Inspect method as a business Service that Plugin code can call**」。

`docs/user/develop/practice/dynamic-cordis.md:13`：验证需**同时**检查管理结果
`application: applied` 与工具调用成功；`restart-required` 表示已保存但未激活。
`docs/upgrade-guide/v0.2.1-alpha.2/plugin-install-over-installed/guide.md:14-18`：
HMR 时不能在无法移除的已安装包上覆盖安装；先 `remove_bundle(name)` 再 `install_bundle(spec)`。

**外部社区补充（非官方事实，标注来源）**：
https://raw.githubusercontent.com/PerryLink/dsh-plugin-guide/main/guide/plugin-dev-guide.md 称
`dsh.bundle.patch` 可为有序数组；`dsh.client` manifest 含 `platform:'web'` / `inject` /
`immediately` / `external`，client half 只挂在说明符恰为裸包名的行上；
`dsh.manifestVersion` 当前为 `1`；bundle 需 `locale/en.json`（`meta.title`/`meta.description`）
与 `icon.svg`（导出 `./icon`，≤256 KiB 且必须在包内）；
**上游删行/改名后 targeting 该 id 的 override 会静默失效，只在启动日志留一行
`patch: entry not found`**，所以每次升级后必跑 `--dump-config`。
「一个好的 Plugin，既要能插，也要能被插」四条件（依赖可声明 / 能力可组合 / 实例可隔离 /
生命周期可逆）来自 https://martty.sh/blog/plug-in-and-be-plugged-into （2026-08-23）。

## 4. 本地开发回路（scratch plugin）

`docs/user/develop/basic/index.md:46-64`：

```yaml
- insert:
    - id: hello
      name: '/absolute/path/.../my-plugin.ts'
```

路径**必须绝对**；用 `pnpm dsh web --patch ./scratch-plugin/cordis.yml` 启动，
Web UI `http://127.0.0.1:3080`。
「A patch file contributes configuration but does not change the profile directory from which
the loader resolves module paths」——模块解析仍按 profile 目录。
`docs/user/develop/basic/tool.md:11-36` 同样给出 `pnpm dsh web --patch ./scratch-plugin/cordis.yml` + `http://127.0.0.1:3080`。

⚠️ **本项目约束**：用户明确要求「路径要跟随 DSH_HOME 等配置避免硬编码」。
所以 scratch 用的 patch 文件应由脚本按 `$env:DSH_HOME` / `$env:TEMP` 生成到
`$TEMP/.drafts/<会话id>/`，不把绝对路径写进仓库配置；仓库里保留一个模板 + 生成脚本。
⚠️ **不要把 `--patch` 启动的 3080 与本会话 Web GUI 55101 混淆**：
前者是独立测试实例，须用 managed background job 启停并核对精确 URL，不替换现有 GUI。

## 5. 测试环境分层（官方测试阶梯）

`docs/testing.md:13`：性能基准 `pnpm run test:bench`（Linux PR gate `node 24 / benchmarks`），
`synthetic inputs enforce time, heap, and scaling budgets`；`benchmarks/` 按用户路径组织门禁。
根 `AGENTS.md`（b2 摘要）列出命令：

| 命令 | 用途 |
|---|---|
| `pnpm install`（node ≥24.9） | 装依赖 |
| `pnpm run build:artifacts` + `build:check` | 构建产物与校验 |
| `pnpm run test` / `test:coverage` / `test:snapshot` | 单测 / 覆盖率 / 快照 |
| `pnpm run typecheck` / `lint` / `hygiene` | 静态检查 |
| `pnpm run doc-sync` / `verify-cordis-catalog` / `verify-md-links` / `verify-md-wrap` | 文档一致性 |
| `pnpm run test:e2e` | **需 `DEEPSEEK_API_KEY`** |
| `pnpm run dev:web` | 编辑时重建 client bundles（HMR 前提） |
| `pnpm run website:build` | 站点构建 |

`packages/client/AGENTS.md:139-141`：GUI 改动 → `pnpm run test:gui`；
可见输出变化 → `DSH_SNAPSHOT=replay pnpm run test:web`；再跑 pre-push checks。
`docs/AGENTS.md`（b3 摘要）：`doc-typecheck` 要求 fenced ts 块必须编译
（` ```ts type-equiv ` / ` ```ts public-api `）；`verify-type-equiv` / `verify-md-links` /
`verify-doc-budgets`；`verify-md-wrap` 一段一行。

**本项目的现实约束**：这是仓库外独立 bundle，`pnpm run test:e2e` / `build:artifacts` 等
属于 DSH 主仓库脚本，**在本工作区不可直接运行**。因此本项目采用分层：

1. **纯逻辑单测（本工作区可跑）**：状态分类、事件 fold、冲突/优先级、payload 校验、
   状态机迁移——全部写成不依赖 DSH 运行时的纯 TypeScript 函数，用 `vitest` + `tsx` 跑。
2. **契约测试**：对 API 形状写类型断言/编译检查，用本地镜像的 `.d.ts` 作为类型源
   （从 asar 抽出的 9 个 `@deepseek-ai` 包在 `R:\Temp\...\src-pkgs\`）。
3. **集成测试（需 DSH 运行时）**：`pnpm dsh web --patch <生成的 patch>` 起独立实例，
   用 `cordis_inspect_query` 核对注册行、`session/event` 观察事件、`--dump-config` 核对
   `application: applied`；这一步受审批/端口/现有 GUI 约束，写成脚本 + 人工验收清单。
4. **GUI/回归**：`test:gui`、`DSH_SNAPSHOT=replay test:web` 在 DSH 主仓库上下文执行；
   本工作区提供 fixtures 与回归用例清单。
5. **零 mock 假数据**：单测用的事件样本必须是**按官方 `SessionEvent` 形状构造的真实值**
   （`seq`/`time`/`data` 齐全），并显式说明哪些字段来自官方契约；禁止用
   `{...}` 占位对象充当「已验证」的输入。

## 6. 依赖与构建选型

- 包管理：**pnpm**（用户明确要求），`pnpm-workspace.yaml` 记录 `allowBuilds` 策略；
  Python 侧如需脚本用 **uv**（本项目当前无 Python 依赖，暂不引入）。
- 语言：TypeScript ESM，`strict: true`，`tsc` 产出 `lib/`；Client 侧 React + CSS Modules。
- 测试：**V2 实测改为 `node --test --test-isolation=none` + 自建 Vitest 风格 shim**。Vitest/Vite 配置加载依赖 esbuild service，本机 Windows 沙箱禁止 named-pipe spawn（`spawn EPERM`）；组件级 `// @vitest-environment jsdom` 回归仍需主仓库 context。37 项断言全绿。
- 校验：Config `z` 来自 `@deepseek-ai/schemastery`；`storageDomain` 记录 schema 用 `zod 4.4.3`（与 `dsh-storage-domain` 内嵌版本对齐，保证 `ZodType<V>` 同源）。`src/types.ts` 有编译期双向 `extends` 校验 zod 推导 === 共享契约。
- Client bundle 构建：**V2 实测改用 TypeScript compiler API 进程内 `transpileModule`**（`scripts/build-client.mjs`），外层包 `window.__ModuleLoader__.load({id, factory})`；同样为绕开 esbuild spawn。裸 `require()` specifier 只能取 `packages/client/web/src/platform.ts:8-15` 的 `PLATFORM_MODULES` 白名单。
- 路径：所有 DSH 相关路径从 `$DSH_HOME` / `$TEMP/.drafts/<会话id>/` 解析，
  不写本机用户目录的绝对路径（例如 `<user-home>/...`）到源码或配置模板。
- 产物：`lib/`、`locale/`、`icon.svg`、`cordis.patch.yml` 进 `files`；`pnpm pack` 产出 tarball。

## 7. 风险登记（工程侧）

| 风险 | 依据 | 缓解 |
|---|---|---|
| `--patch` 的 override 在上游改 id 后静默失效 | 社区指南；`docs/user/develop/practice/dynamic-cordis.md:13` | 每次升级 DSH 后跑 `--dump-config` 并核对 `application: applied` |
| home 级 patch 整段替换 config | 本机 `$DSH_HOME/cordis.patch.yml` 注释；`publish.md:79-136` | 本项目自带完整 config 行，不依赖 home 层合并 |
| `engines.dsh` 冲突说法 | `tool-catalog.md:60`（官方）vs 社区指南 | 以官方为准，写 `engines.dsh` 并同时 pin `@deepseek-ai/dsh-*` peer |
| npm 日志目录不可写 | 本机实测 | 重定向 npm cache/logs 到工作区；优先 pnpm |
| 打包版源码在 asar 内 | 本机实测 | 用已抽取的 `src-pkgs/` 与 `.research/dsh-repo/` 镜像，不直接读 asar |
| 独立实例端口 3080 与现有 GUI 55101 | `basic/index.md:46-64` | 独立 background job + 精确 URL 核对，不替换现有服务 |
| `plugin_manager` 需 danger-full-access 或逐次审批 | `tool-catalog.md:58-122` | 文档写明；测试用 `--patch` 路径避开 |
