# weifuwu/server 健壮性与性能升级计划（2027-12——四探针 + HTTP 基准实证驱动）

> **✅ 全部波次已交付（2027-12）**：
>
> **波次 1（流式正确性 S1-S3）**：`sendResponse` 重写（断开传播 → `reader.cancel()`
> → SSE onAbort 链路生效 + 背压 drain 等待）、`stop()` 优雅停机（timeoutMs 排空
> + closeIdleConnections + router.close 先行再强杀）、`Router.close()` WS 1001
> 握手（实证 `closeAllConnections()` 杀不掉已升级 WS——socket 残留 + 客户端
> close 永不触发）、`ws.ts` safeHook 错误兑底（同步抛 + 异步拒均不逃逸进程）。
>
> **波次 2（生产热路径 S4-S6）**：ui 编译缓存重设计（修订 a29efec3——失效键
> mtimeMs+size + esbuild metafile 依赖闭包校验 + in-flight dedup + ETag/304；
> 实测 showcase 入口 冷 96ms / 热 13ms（原每请求 40ms）/ 304 零传输）、
> `Redis` 契约暴露 `pipeline()`（RedisPipelineFace——双实现等价 + 真库验证；
> **顺带修 MemoryRedis INCR 原子性 bug**——读-写 await 间隙）、rateLimit RTT
> 压缩（fixed 2-3→1、sliding 3-4→2-3——拒绝路径不写 ZSET 语义逐位保持）、
> serve 热路径（无 body 跳过 readBody + match.mws 空时免分配——全场景 +8~12%，
> bare 7.0k→7.9k req/s）。
>
> **波次 3（传输面与防线 S7-S9）**：`compress()` 中间件（br 优先/gz 兑底/阈值
> 1KB/SSE 显式跳过/流式压缩）、serveStatic Range 单区间（206/416 + Accept-Ranges）
> + 预压缩探测（.br→.gz，mtime 防陈旧回退）、scheduler 时序测试 deadline 轮询化
> （三连稳定）、错误形态统一（500 = JSON——对齐 serverError() 助手）、bench/
> 失修 import 修复 + `bench:server`/`bench:db` 脚本。
>
> **S10（WS 心跳）判负**——无场景证据（按计划「可选——无实证痛点不默认开」保留）。
>
> **验收**：server 测试 341→386（+45 契约）全绿；契约层 376、场景层 121 全回归；
> tsc 0；bench 全场景较基线 +8~12%；探针 ①②③④ 全部转正为契约测试。

> 触发：用户决策「优化 weifuwu/server」。以**实测先行**（house 风格：实证画像 →
> ROI 矩阵 → 波次 → 防线）排查全模块：core(serve/router/ws) + middleware +
> ui + user/queue/scheduler/messager/email + ai(sse) + db 契约。
> 结论：**路由/DB 面已经够快**（trie 命中与 404 miss 同速、POST 1KB 10k req/s）——
> 真正的缺口在**流式正确性 + 生产热路径 + 传输面**三处。

---

## 1. 实证画像（本机 node v26.7.0——2027-12 实测）

### 1.1 HTTP 吞吐基准（`bench/server-bench.ts`——64 并发 × 3s）

| 场景 | req/s | p50 | p99 | 结论 |
|---|---|---|---|---|
| **raw node http（对照基线）** | **12 311** | 4.8ms | 8.4ms | 平台下限 |
| weifuwu bare JSON | 7 052 | 8.2ms | 14.6ms | 框架开销 1.75x——可接受区间（Web Request/Response 互操作税） |
| bare param 路由 ×2 | 10 263 | 6.3ms | 7.5ms | Trie 快——非瓶颈 |
| 404 miss（深路径） | 8 812 | 7.2ms | 8.6ms | miss 与 hit 同速——非瓶颈 |
| POST 1KB JSON echo | 10 252 | 6.3ms | 7.2ms | readBody/parseBody 非瓶颈 |
| + cors | 8 001 | 7.9ms | 9.3ms | 中间件链开销小 |
| + rateLimit(fixed, mem redis) | 8 271 | 7.6ms | 10.1ms | 每请求 2-3 次 `command()` 串行 await——真 Redis 每跳 0.2ms × RTT 数 |

### 1.2 四探针（行为正确性——`/tmp/probe-*.ts` 可复跑）

| 探针 | 结果 | 影响 |
|---|---|---|
| **① SSE 客户端断开** | `aborted=false`——**abort 不传播**：`sendResponse` 的 `reader.releaseLock()` 不 cancel 流，`res.write` 失败也不可达 catch | AiChat/agent-platform 断开后 **LLM 上游请求继续跑 + token 继续入内存**（计费泄漏 + 内存泄漏）——`onAbort` 永不触发 |
| **② stop() 优雅性** | in-flight 请求被砍（`UND_ERR_SOCKET`）——**`stop(timeoutMs)` 的 timeoutMs 参数从未使用**，立即 `closeAllConnections()`；SIGTERM 路径同（`process.exit(0)` 不排空） | 滚动发布/重启 = 在途请求全部失败 |
| **③ WS async handler 抛错** | `unhandledRejection` 逃逸到进程级（node 默认 fatal——无兜底即**崩溃**）；服务侥幸存活仅因探针注册了 handler | 生产 WS handler 任一异步异常 = 整机宕机 |
| **④ ui.js 每请求编译** | showcase 入口 ~40ms/request（900KB bundle）+ `Cache-Control: no-store`（零浏览器缓存） | 生产每页面加载 40ms CPU + 900KB 重传；2026-12 a29efec3 删缓存决策的否决理由（mtime 同 ms 边界/并发双编译）可被**失效键唯一化 + in-flight dedup** 逐条消除 |

### 1.3 静态走查（代码级发现）

| 位置 | 发现 |
|---|---|
| `serve.ts sendResponse` | `res.write()` 返回值（背压信号）被忽略——慢客户端 + 快流 = 无界内存缓冲 |
| `serve.ts readBody` | GET/HEAD 也走 for-await 异步迭代器（微小）；413 前置检查已有 ✓ |
| `router.ts handle` | 每请求 `[...globalMws, ...match.mws]` 数组分配 + dispatch 闭包——注册后不变的东西每请求重算 |
| `middleware/rate-limit` | fixed = 2-3 RTT、sliding = 4 RTT 串行；`RedisPipeline` 类**已存在**但 `Redis` 契约面未暴露（contracts.ts 只 import 了类型） |
| `middleware/static` | 无 Range（视频 seek 失败）、无预压缩（.br/.gz）、每次 `open()+stat()` ×2 |
| `bench/` 全目录 | `db-bench.ts` 等 5 个文件 import `../src/db/...`——目录重组后**全部已坏**（资产失修） |
| `scheduler/index.test.ts` | 「崩溃恢复」用例在 `--test-concurrency=8` 下**偶发失败**（503ms 时序敏感——本次排查中实捕一次） |
| serve 错误形态 | HttpError→JSON、意外错→text/plain、router 404→JSON、serve 层→text——形态分裂 |

---

## 2. 优化矩阵（按 ROI 排序——实证驱动——无场景证据不造抽象）

| # | 面 | 机制 | 复杂度 | 收益 | 波次 |
|---|---|---|---|---|---|
| S1 | **断开传播 + 背压**（sendResponse 重写） | `res.on('close')` → `reader.cancel()`；`!res.write(v)` → await drain；destroy 后停止拉流 | 小 | **AI 流式正确性**（上游取消/内存止血）——onAbort 契约真正生效 | 1 |
| S2 | **优雅停机** | in-flight 计数 + `stop(timeoutMs)` 排空竞速 + 超时强杀；SIGTERM 走同路径；WS 连接关闭 | 小 | 滚动发布零失败请求 | 1 |
| S3 | **WS async 错误兜底** | open/message/close/error handler 统一 Promise.catch → error handler + console.error | 极小 | 进程崩溃消除 | 1 |
| S4 | **ui.js/css 编译缓存重设计** | 修订 a29efec3：失效键 = `entryPath:mtimeMs:size`（同 ms 写文件 → size 维度补齐）+ in-flight promise map（消并发双编译）+ ETag/304 | 中 | 40ms→~0ms（命中）/ 900KB→304；dev 改代码仍即时生效 | 2 |
| S5 | **rateLimit RTT 压缩** | `Redis` 契约暴露 `pipeline()`（RedisPipeline 已实现——只差契约面）；fixed 常态 1 RTT（INCR+TTL 同批，TTL<0 补 PEXPIRE 语义不变）；sliding 4→1 | 中 | 真 Redis 场景每请求省 ~0.4-0.6ms + 吞吐回补 | 2 |
| S6 | **serve 热路径微优化** | 注册/编译期快照中间件链（消每请求 spread）；GET/HEAD 跳过 readBody 迭代器 | 小 | 7.0k → 目标 8k+ req/s（bench 护栏证明才合入） | 2 |
| S7 | **compress() 中间件** | gzip/br、阈值（默认 1KB）、content-type 白名单、SSE/stream 跳过 | 中 | JSON/HTML 传输量 60-80% 降——SSR 页与列表 API 直接受益 | 3 |
| S8 | **serveStatic Range + 预压缩** | `Accept-Ranges: bytes` 单区间；同路径 .br/.gz 探测（体积更小者） | 中 | 视频 seek 可用；静态资源传输量降 | 3 |
| S9 | **测试稳定化** | scheduler 时序用例 deadline 轮询化（R-22 同款纪律：5s 上限）；错误响应形态统一为契约 | 小 | test:server 零偶发 | 3 |
| S10 | **WS 心跳** | 服务端 setInterval ping + 失联判定（可关） | 小 | 反代/LB 后死链清理——**可选**（无实证痛点） | 3 |
| — | HTTP/2 / cluster / SO_REUSEPORT | 部署面（反代/多进程）职责 | — | **判负** | — |
| — | 请求体流式透传（大文件上传不缓冲） | 10MB 上限已裁剪 + parseBody 契约不破 | — | **判负**（无场景证据） | — |
| — | handler 级执行超时 | 与 LLM 长任务语义冲突；socket 级 timeout 已有 | — | **判负** | — |
| — | 内存 Hub 优化 | Set 增删已是 O(1)；无热点证据 | — | **判负** | — |

---

## 3. 波次 1：流式正确性（S1-S3——正确性优先于一切性能）

### S1. sendResponse 重写（断开传播 + 背压）

```ts
// 现状三宗罪：
//   a) res.write(value) 返回值被忽略          → 背压缺失（无界缓冲）
//   b) reader.read() 的异常是唯一退出路径      → 客户端断开不可达 catch
//   c) finally 只 releaseLock 不 cancel        → ReadableStream.cancel() 永不触发
//     → SSE onAbort 失效 → LLM 上游请求继续计费

// 修复形态（保持签名不变——零消费端改动）：
let clientGone = false
const onClose = () => { clientGone = true }
res.on('close', onClose)
try {
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (clientGone || res.destroyed) { await reader.cancel('client disconnected'); break }
    if (!res.write(value)) await new Promise<void>(r => res.once('drain', r))  // 背压
  }
  if (!clientGone) res.end()
} finally {
  res.off('close', onClose)
  if (clientGone) await reader.cancel('client disconnected').catch(() => {})
  reader.releaseLock()
}
```

**契约**：`src/server/core/serve.test.ts` 新增——
- SSE 流客户端 3 chunk 后断开 → `stream.cancel()` 收到信号（onAbort 触发）
- 慢客户端（暂停 socket 读）+ 快流 → 服务器 RSS 有界（缓冲不无界增长）
- 正常完整响应回归（现有 8 用例全绿）

### S2. 优雅停机

```ts
let inFlight = 0            // 请求进入 handler +1，sendResponse 完成 -1
async function stop(timeoutMs = 2_000): Promise<void> {
  server.close()                          // 停止接收新连接
  server.closeIdleConnections()           // keep-alive 空闲连接立即断（node ≥18.2）
  await Promise.race([
    waitForZero(inFlight),                // 在途请求排空
    delay(timeoutMs),                     // 超时强杀
  ])
  server.closeAllConnections()            // 兜底（WS/挂起连接）
  await router.close().catch(() => {})
}
```

- SIGTERM handler 与 `stop()` 收敛同一实现（现在两套逻辑漂移）
- WS：close 时 `hub.leave` 已有——补 `wss.clients` 逐个 `ws.close(1001)`
- `process.exit(0)` 移除（交给调用方/容器）或保留为 stop 后最终手段——以「能排空则不 exit」为准

**契约**：in-flight 800ms 请求 + `stop(2000)` → 请求正常完成；`stop(0)` → 立即断；SIGTERM 探针同断言。

### S3. WS async 错误兜底（ws.ts）

```ts
const safe = (fn?: (...a: any[]) => any) => (...a: any[]) => {
  try { const r = fn?.(...a); if (r?.catch) r.catch(err => { /* → error handler 或 console.error */ }) } catch (err) { /* 同步抛也兜 */ }
}
ws.on('message', safe((data) => match.handler.message(ws, ctx, data)))
```

- message 抛错 → 若 handler.error 存在调用之，否则 `console.error('[ws] handler error')`——**绝不逃逸到进程**
- open/close/error 同包装
- **契约**：async message handler 抛错 → 进程存活 + 后续消息正常处理（未注册 unhandledRejection 兜底的裸进程验证）

---

## 4. 波次 2：生产热路径（S4-S6）

### S4. ui.js/css 编译缓存重设计（修订 a29efec3 决策）

**判词**：2026-12 删缓存的两个否决理由都是**实现问题而非缓存问题**——逐条消除后缓存重回：

| 当时否决理由 | 消除机制 |
|---|---|
| mtime 同 ms 写文件不失效 → 旧版残留 | 失效键加入 **size**：`entryPath:mtimeMs:size` 三元组（生产模式不改文件；dev 模式改文件必然 mtime 或 size 变化——双保险） |
| 无锁缓存并发双编译竞态 | **in-flight promise map**：`Map<key, Promise<code>>`——并发请求共享同一次编译（dedup 而非锁） |

```ts
const compileCache = new Map<string, { code: string; etag: string }>()
const inFlight = new Map<string, Promise<{ code: string; etag: string }>>()

async function compile(entryPath: string) {
  const key = `${entryPath}:${stat.mtimeMs}:${stat.size}`   // 失效键——唯一编码（R-02 原则）
  const hit = compileCache.get(key); if (hit) return hit
  const pending = inFlight.get(key); if (pending) return pending
  const p = doBuild(entryPath).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  // …容量上限（LRU 32）防多入口膨胀
}
```

- 响应带 `ETag` + `Cache-Control: no-cache`（浏览器 304 复验——比 no-store 省 900KB 重传）
- `ui({ cache: false })` 逃生舱保留（与现状等价）
- css 同机制（postcss 产物同键缓存）
- **验收**：同入口二次请求 <1ms + 304；改文件立即生效（mtime/size 变化）；10 并发首请求只编译 1 次

### S5. rateLimit RTT 压缩（契约面先行——CS-04/CS-05 纪律）

1. `db/contracts.ts` 的 `Redis` 接口增加 `pipeline(): RedisPipeline`（**类已存在——只补契约面**；MemoryRedis 补等效实现——批量即时执行）
2. rate-limit 改造（语义逐位保持）：
   - fixed：pipeline `[INCR, TTL]` → 常态 1 RTT；`TTL < 0`（新 key）→ 补 1 次 PEXPIRE（仅首请求 2 RTT——与现状「仅首个设过期」语义严格一致，无窗口续期漂移）
   - sliding：pipeline `[ZREMRANGEBYSCORE, ZCARD, ZADD]` → 1 RTT；`ZADD 返回 1`（新 key）→ 补 EXPIRE
3. **TDD 先行**：pipeline 契约测试（顺序返回/错误按位/MemoryRedis 等效）→ rate-limit 语义测试全绿不变

### S6. serve 热路径微优化（bench 护栏证才合入）

- `handler()` 编译期快照 `globalMws`——`handle()` 运行时只在「match.mws 非空」时 concat
- GET/HEAD 跳过 readBody for-await（`req.method` 判定——body 语义本就为空）
- runChain `mws.length === 0` 快路径已有 ✓ 保留
- **验收**：`bench/server-bench.ts` bare JSON 7.0k → ≥8k req/s（p50 降 ≥15%）；全部现有契约回归

---

## 5. 波次 3：传输面与防线（S7-S10）

### S7. compress() 中间件（新 `src/server/middleware/compress.ts`）

- `br` 优先（Accept-Encoding 协商）→ gzip 兜底；阈值默认 1KB；content-type 白名单（json/html/css/js/text/*）；`Content-Encoding` 已存在或 SSE（`text/event-stream`）跳过
- 流式压缩：`node:zlib` createGzip/BrotliCompress → response.body pipe——**不在内存攒全量**（与 S1 背压机制天然衔接）
- 诚实裁剪：❌ zstd（node 内置支持面未稳）、❌ 动态字典、❌ 静态压缩（S8 覆盖）

### S8. serveStatic Range + 预压缩

- `Range: bytes=start-end`（单区间）→ 206 + `Content-Range`/`Accept-Ranges: bytes`——视频/音频 seek 前置条件
- 同路径 `.br`/`.gz` 预压缩文件探测（fs.stat 缓存失效键复用 S4 三元组）→ 命中即发 + `Content-Encoding`（构建期压缩资产——运行时零 CPU）

### S9. 测试稳定化 + 形态统一

- scheduler「崩溃恢复」用例：固定 sleep → **deadline 轮询**（条件满足即过，5s 上限——R-22 同款纪律）；排查 `--test-concurrency=8` 下其余偶发
- 错误响应形态统一：500 统一 JSON `{ error }`（serve 层 text/plain → 与 router 层对齐）；`Allow` 头 405 已有 ✓——契约锁定
- `bench/` 修复：5 个文件 `../src/db/` → `../src/server/db/`（目录重组失修资产）；`server-bench.ts` 转正；`package.json` 增 `bench:server` / `bench:db` 脚本

### S10. WS 心跳（可选——无实证痛点不默认开）

- `serve({ wsHeartbeatMs })` 默认 0（关）——开启后 setInterval ping、两拍无 pong 判死 terminate
- 判定依据保留：反代后死链清理属真实需求，但当前无用户报告——**场景证据驱动再启用**

---

## 6. 验收与防线

| 防线 | 内容 |
|---|---|
| 契约层（serve.test.ts / router.test.ts 扩展） | 断开传播 ×3 / 优雅停机 ×3 / WS 兜底 ×2 / 错误形态 ×2——**先红后绿**（波次 1 提交前置） |
| 契约层（db 契约） | pipeline 语义（顺序/按位错误/MemoryRedis 等效）+ rate-limit 语义不变 |
| 契约层（ui） | 缓存命中/失效/dedup/逃生舱 ×4 |
| bench（bench:server） | 基线登记：bare 7.0k / param 10.3k / POST 10.3k——S6 合入前后对比；回归 <90% 基线即 investigate |
| 探针转正 | probe-disconnect / probe-stop / probe-ws 三场景收编进 serve.test.ts（不留 /tmp） |
| 全量回归 | `npm run test:server`（R-01：timeout ≤10s 心态——偶发即修不宽容）+ `npm run typecheck` |

**顺序纪律**：波次 1（正确性）→ 波次 2（热路径）→ 波次 3（传输/防线）——
波次内 S1/S2/S3 独立可并行；S4 依赖无；S5 契约先行；S6 必须 bench 前后数字入提交说明（VDOM-PERF 同款验收）。
