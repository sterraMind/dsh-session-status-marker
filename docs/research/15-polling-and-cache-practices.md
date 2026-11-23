# 轮询与缓存最佳实践调研（15）

> 文档版本：v1.3.0-rc.5 · 2026-11-23

背景：用户反馈大会话量宿主（会话数 800+）下，会话状态看板长时间卡在「加载中」。用户要求在动手之前先网络搜索最佳实践，并明确提醒不要自顾自地并行而吃满整机资源。本文档收录本次调研引用的资料与逐条结论，是 1.3.0-rc.5 看板性能改造（`docs/acceptance-and-regression.md` §3.26）的做法依据。

## 1. 调研对象

问题拆成四个原子问题：看板每 2 秒轮询一次全量会话清单，如何避免（a）扫描重复触发、（b）并发扫描把整机资源吃满、（c）失败时疯狂重试、（d）单个可选服务挂住导致路由永久无响应。

## 2. 逐条结论与引用

### 2.1 单飞合并（single-flight / request coalescing）

过期或首次取数时只启动一次后台刷新，并发调用方共享同一个在途 Promise，后续调用直接复用，而不是各自再扫一遍。要点是区分「新鲜度」「可用性」「并发度」三个维度：合并解决的是并发重复扫描，不等于把 TTL 拉长。

引用：

- [Cache stampede & request coalescing](https://ghassan.de/en/articles/cache-stampede-request-coalescing)：把新鲜度与并发度分开定义，合并不是延长 TTL。
- [Singleflight 高级模式（awaitly）](https://jagreehal.github.io/awaitly/advanced/singleflight/)：有缓存直接返回，值过期时后台刷新并复用在途任务。
- [Single-flight coalescer](https://system-design-in-depth.vedgupta.in/build/singleflight-coalescer/)：软 TTL + 硬 TTL 双时界的实现形态。

rc.5 落点：宿主侧 `listSessions()` 加单飞合并（`#sessionListInflight`），并发请求共享同一次扫描，扫描在途时新请求不再触发第二次扫描。

### 2.2 过期可用（stale-while-revalidate，SWR）

值在过期窗口内仍然返回旧值，后台同时刷新；引用 [web.dev 的 stale-while-revalidate](https://web.dev/articles/stale-while-revalidate) 与 [RFC 5861 的 max-age / stale-while-revalidate / stale-if-error](https://www.sevydevy.com/learn/caching-from-first-principles-strategies-invalidation-stampede)。

rc.5 落点：全量会话快照缓存 10 秒（过期点带 0–2 秒随机抖动），缓存失败时保留上一份快照按 TTL 节流重试，避免每次取数失败都立刻全量重扫。

### 2.3 有界并发

对成百上千个条目直接 `Promise.all` 会耗尽文件描述符（EMFILE）并打满 CPU 与 IO，需要用信号量或限流器（如 [p-limit](https://github.com/sindresorhus/p-limit)）把并发数封顶；参见 [EMFILE 解释](https://nodejs-errors.dev/EMFILE/)、[mapLimit 的有界启动模式](https://jream.com/learn/cloud-and-edge/serverless-patterns/scaling-model) 与 [异步任务的有界并发模式](https://stackpractices.com/recipes/async-patterns/)。

rc.5 落点：宿主三路可选服务读取是三个独立操作，`Promise.all` 的并发量封顶为 3，属于安全有界；真正昂贵的 `listSessions()` 是一次调用返回 800+ 条，用单飞合并加缓存解决，而不是把它拆成 800 次并发。

### 2.4 轮询不打爆服务端

轮询要退避、加抖动、不比工作完成速度更快，优先推送。引用 [Polling without overload](https://blog.openreplay.com/api-polling-without-overload/)。

rc.5 落点：客户端 `StatusOverview` 保留在途标志；连续失败按 Full Jitter 指数退避（`random(0, min(60s, interval × 2^失败次数))`），成功后恢复常规间隔；首次轮询带随机初始偏移，每拍间隔带 ±25% 抖动。

### 2.5 解压不落盘（用户问题「解压能不能不占用本机硬盘」）

用户要求评估。结论：读取路径的 zstd 解压是纯内存操作，零磁盘写入。依据是 `.research/dsh-repo/packages/session/session-persistence-jsonl/src/zstd.ts:120-122`（`decompressZstdFrame(input: Buffer): Promise<Buffer>`，node:zlib 的 Buffer→Buffer）与 `src/index.ts:1499-1533`（`readFirstZstdLine` 以只读方式 `open(path,'r')`，8KB 分块读入内存解压，`finally` 关闭句柄）；全仓库的写操作（`writeFile`/`mkdtemp`/`fsync`/`.tmp`）只出现在写入路径（`index.ts:1264` 物化、`:1427` 追加、`lease.ts:91`、`win32.ts:200` 暂存目录、`generation.ts:728` 迁移），读取路径零字节写入。实测：22MB 日志解压 224ms，512KB 头部约 14ms。因此插件不需要加磁盘缓存，真正的成本敞口是「每 2 秒轮询触发一次全量重扫」。

## 3. 决策记录

- 不引入第三方依赖：npm 上的 singleflight 相关包维护状况差（[bottleneck](https://github.com/jomery/bottleneck) 自 2019 年未维护），10 行左右的合并器自己实现即可。
- 保留 4 秒 `OVERVIEW_SERVICE_TIMEOUT_MS` 作为兜底，但要与 8 秒客户端超时错开（4 < 8），且截止时间不取消底层扫描：扫描继续在跑，`Promise.race` 降级返回空快照，避免慢扫描被多次触发叠加成正反馈雪崩。
- `listSessions` 收到服务生命期的共享 `AbortSignal`，该信号不被单请求截止时间取消。
- 看板响应新增 16 字符 `revision`（两轮 FNV-1a 摘要，不用 `node:crypto`）与 `?since=<revision>` 条件刷新，与 `list` 路由既有模式一致。

## 4. 参考清单

| 名称 | 地址 | 用途 |
|---|---|---|
| Cache stampede & request coalescing | https://ghassan.de/en/articles/cache-stampede-request-coalescing | 单飞合并的定义与三维度划分 |
| Singleflight 高级模式（awaitly） | https://jagreehal.github.io/awaitly/advanced/singleflight/ | 有缓存直返、过期后台刷新 |
| Single-flight coalescer | https://system-design-in-depth.vedgupta.in/build/singleflight-coalescer/ | 软/硬双时界实现形态 |
| Stale-while-revalidate（web.dev） | https://web.dev/articles/stale-while-revalidate | SWR 做法 |
| 缓存策略与 RFC 5861 详解 | https://www.sevydevy.com/learn/caching-from-first-principles-strategies-invalidation-stampede | max-age / stale-while-revalidate / stale-if-error |
| p-limit | https://github.com/sindresorhus/p-limit | 有界并发限流器 |
| EMFILE 解释 | https://nodejs-errors.dev/EMFILE/ | 文件描述符耗尽的后果 |
| mapLimit 有界启动模式 | https://jream.com/learn/cloud-and-edge/serverless-patterns/scaling-model | 并发数封顶的形态 |
| 异步任务有界并发模式 | https://stackpractices.com/recipes/async-patterns/ | 任务池与描述符上限 |
| Polling without overload | https://blog.openreplay.com/api-polling-without-overload/ | 轮询退避与抖动 |
