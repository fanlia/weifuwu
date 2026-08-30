# QUEUE-SCHEDULER-FIX-PLAN — src/server/queue/ + src/server/scheduler/ 优化修复计划

> 针对可靠任务队列（Redis Streams 消费组）与延时/cron 调度器的缺陷修复计划。
> **关键发现均已实证**（真 Redis docker / MemoryRedis 复现脚本）。
>
> 基线：`queue.test.ts` 14 测试（MemoryRedis）+ `scheduler/*.test.ts` 13 测试
> （**localhost:6379 真 Redis——docker 运行中——CS-04 精神**）——全绿。
> 注：memory-redis **无 hash 面**（HSET/HGETALL/HDEL 裁剪）——scheduler 只能真 Redis 测。

---

## 0. 缺陷清单总览

| ID | 严重度 | 缺陷 | 实证 |
| --- | --- | --- | --- |
| Q25 | **资源保护（P0）** | **concurrency 无上限**——循环批次滚动 fire-and-forget 不背压：每轮 XREADGROUP 再 claim concurrency 条径直开跑 → 在途无界膨胀 | 实测：concurrency=5，60 个 300ms job → **实测最大并发 60** |
| S2 | **正确性（P1）** | `cancelCron` 前缀匹配误删——`member.includes("id":"cron:foo:")` 命中 `cron:foo:bar` | 实测：cancelCron('foo') → foo:bar 触发点被删（R-03/G9 同族——字符串前缀歧义） |
| Q21 | **可靠性（P1）** | 重试任务丢失窗口——XACK 先于 ZADD(delayed)：ZADD 瞬时失败 → entry 已清 pending → **任务静默丢失**（at-least-once 违例） | 代码审读（顺序确定） |
| Q8 | **可靠性（P1）** | worker 连接断不重连——`isConnClosed(e)` → `running = false` 永久停止（Redis 重启/网络抖动 = worker 死亡；start() 复用死连接同样失败） | 代码审读（loop/claimStale/requeueDelayed 三处——无重连路径） |
| S9 | **可靠性（P1）** | scheduler `connPromise` 拒绝被缓存——Redis 启动时不可用 → start() 失败后 `connPromise` 永久 rejected → **schedule/cron/tick 永久坏**（不再重试） | 代码审读（getConn 单次赋值——无失败复位） |
| S13 | **可靠性（P2）** | scheduler ZREM（原子抢占）→ queue.add 失败 → **任务丢失**（仅 console.error——无恢复） | 代码审读 |
| S15 | 健壮性（P2） | `cancelSchedule`/`cancelCron` 子串匹配——member JSON 内 data 字段含 `"id":"X"` 子串 → 误删（与 S2 合并修：parse 精确匹配） | 代码审读 |
| M-d | 决策 | cron 停机补跑洪水——`while (next <= now)` 生成 [nextRunAt, now] 全量触发点（停机 3 天×每小时 = 72 个一次入队） | 决策点 |

---

## 1. Q25 — concurrency 无界膨胀（P0——确证）

### 根因

`loop()`（queue/index.ts:341-361）：

```ts
result = await conn!.command('XREADGROUP', ..., 'COUNT', String(concurrency), ...)
...
for (const [entryId, fields] of entries) {
  const p = processEntry(entryId, ...)   // fire-and-forget——不 await
  inflight.add(p)
  ...
}
// 下一轮循环立即再 XREADGROUP claim concurrency 条——不等待在途完成
```

`concurrency` 被当作**每轮批量数**而非**在途上限**——队列满时每轮 N 条持续累加：inflight 无上界。

**实测**：

```
concurrency=5，60 个 300ms job 实测最大并发: 60 ——Q25 无界膨胀确认（超出 55）
```

**影响**：资源保护语义（LLM 限流/DB 池/CPU）完全失效——文档「concurrency ≈ 并发度」承诺违例。

### 修复方案（背压——在途上限）

```ts
async function loop(myEpoch: number): Promise<void> {
  while (running && myEpoch === epoch) {
    await claimStale()
    await requeueDelayed()
    // Q25 背压（2027-XX）：在途达 concurrency 时等待任一完成——
    // 原实现每轮 i 无等待 claim（实测 5→60 无界膨胀）
    if (inflight.size >= concurrency) {
      await Promise.race([...inflight])
      continue
    }
    const remaining = concurrency - inflight.size
    result = await conn!.command('XREADGROUP', ..., 'COUNT', String(Math.min(remaining, concurrency)), ...)
    ...
  }
}
```

- claim 批量收窄为 `concurrency - inflight.size`（≤0 时等待退让）；
- `Promise.race([...inflight])` 无谓空转（race 即可——任一完成即继续）；
- XAUTOCLAIM/requeueDelayed 路径同样受背压保护（loop 顶部统一判断——claimStale 在背压检查之前？**注意**：claimStale 也会火速 processEntry——需同样纳入 inflight 追踪——见 §3 修复）。

### 测试（红→绿）

- **上限锁定**：concurrency=5 + 60×300ms job → `maxConcurrent <= 5`（实测 60——红）；
- 既有「并发 ≥3」测试保持（语义：接近上限分摊）；
- stop 时在途等待（inflight 追踪完整——含 claimStale 路径）。

---

## 2. S2 + S15 — cancelCron/cancelSchedule 精确匹配（P1——确证）

### 根因（与 userSystem keyedId 前缀问题同族——R-03/G9 教训）

```ts
if (member.includes(`"id":"cron:${name}:`))      // 前缀匹配——foo 命中 foo:bar
if (member.includes(`"id":"${id}"`))             // 子串匹配——data 内含同串误删
```

**实测**：`cancelCron('foo')` 后 `foo:bar` 的 pending 触发点也被删（`剩余 pending: []`）。

### 修复方案（parse 后精确比较——编码唯一性纪律）

```ts
const cancelCron = async (name) => {
  const removed = await (await getConn()).command('HDEL', cronsKey, name)
  try {
    const pending = (await (await getConn()).command('ZRANGE', delayedKey, 0, -1)) as string[]
    for (const member of pending) {
      try {
        const m = JSON.parse(member) as { name?: string }
        if (m.name === name) {                       // 精确匹配（parse 后字段比较——无前缀/转义歧义）
          await (await getConn()).command('ZREM', delayedKey, member)
        }
      } catch { /* 畸形 member（外部写入）忽略 */ }
    }
  } catch { /* 清理失败不影响取消结果 */ }
  return removed === 1
}
```

cancelSchedule 同法：`JSON.parse(member).id === id`。

### 测试

- 前缀关系 cron 名（foo / foo:bar）→ 取消 foo 保留 foo:bar（实证红）；
- data 字段含 `"id":"..."` 子串 → 不误删；
- 取消不存在 name → false（保持）。

---

## 3. Q21 — 重试载体写入顺序（P1）

### 根因

`processEntry` 失败分支（queue/index.ts:220-240）：

```ts
await conn!.command('XACK', s, GROUP, entryId)   // 先清 pending
... 
await conn!.command('ZADD', delayed, ...)         // 后写重试载体——失败 → 任务丢失
```

XACK 先行使「pending 保护」消失——ZADD 瞬时失败（同 Redis 抖动）即无声丢失。

**原则**：at-least-once——**新载体先行，XACK 后置**（崩溃窗口内旧 pending 被 stale-claim 重处理——同样失败 → 重复 ZADD 同 member（attempts 同值——幂等）；成功 → XACK）。

### 修复方案

```ts
} catch (err) {
  const nextAttempt = attempts + 1
  if (nextAttempt >= maxAttempts) {
    // 用尽 → DLQ（载体先行——XADD dead 成功后 XACK）
    await conn!.command('XADD', dead, '*', 'payload', JSON.stringify({...}))
    await conn!.command('XACK', s, GROUP, entryId)
    console.error(...)
  } else {
    // 重试（ZADD 先行——防 XACK 后 ZADD 失败丢任务——Q21）
    await conn!.command('ZADD', delayed, String(Date.now() + visibilityTimeout), JSON.stringify({...payload, attempts: nextAttempt}))
    await conn!.command('XACK', s, GROUP, entryId)
    console.error(...)
  }
}
```

- **重试路径**：ZADD → XACK（崩溃窗口 = 重复执行——at-least-once 允许）；
- **DLQ 路径**：XADD dead → XACK（同理——DLQ 重复条目可容忍；XACK 丢失面消除）；
- unparseable 路径：XACK + XADD dead 同序调整（先入死信再清——一致性）。

### 测试

- 命令包装器（spy Redis：command 按名注入失败）——ZADD 失败时：**entry 仍在 pending**（不丢失）——修复前失败即清（红）；
- 重试成功后 attempts 递增持久化（既有测试保持）；
- DLQ 路径顺序锁定。

---

## 4. Q8 — worker 连接断不重连（P1）

### 根因

loop/claimStale/requeueDelayed 三处：`if (isConnClosed(e)) { running = false; return }`——
**无重连路径**。Redis 重启/网络抖动 → worker 永久停止；再次 start()：`getConn` 复用
（connEpoch 匹配）死连接 → ensureGroup 失败 → 永久卡死。

### 修复方案（世代内重连 + 区分池关闭）

```ts
// loop 内（三处统一改造）：
if (isConnClosed(e)) {
  // Q8（2027-XX）：瞬态连接断 → 标记重建（conn=null）→ 有限退避重试；
  // 池关闭（redis.close()——调用方所有权——worker.stop 已覆盖）→ 退出
  if (poolClosed) { running = false; return }   // 显式池关闭 = 永久（stop 语义）
  conn = null
  await sleep(backoff)                           // 指数退避 500ms→5s 封顶
  continue                                       // 重建连接（getConn 下次调用）
}
```

- `isConnClosed` 拆分：`/pool is closed/`（永久——退出）vs `/connection closed/`（瞬态——重连）；
- 重连必须尊重 epoch/stop（running 检查在 while 顶部——安全）；
- 重连后 `ensureGroup` 在首次 XREADGROUP 前需要——循环顶部调 `getConn`（重建后 group 自动随 createStream 重建——stream 还在）——**重连后 group 仍存在**（Redis 重启后 stream 也没了——MKSTREAM 重建空 stream + group——旧 entry 丢失（Redis 数据丢失——超出框架责任——文档红线：Redis 持久化配置）。

### 测试

- MemoryRedis 不可模拟连接断——用 **真 Redis RESTART 不可行**（docker 操作重）——
  **方案**：命令包装器故障注入（wrapper Redis：`command` 抛 'connection closed' 一次 →
  之后正常）——断言 worker 继续消费（修复前 running=false 死亡——红）；
- 池关闭（`/pool is closed/`）→ worker 退出（stop 语义保持——既有 lifecycle 测试）。

---

## 5. S9 — scheduler connPromise 拒绝缓存（P1）

### 根因

```ts
let connPromise: Promise<RedisPoolConnection> | null = null
function getConn() {
  if (!connPromise) connPromise = options.redis.createConnection()  // 拒绝 → 永久缓存
  return connPromise
}
```

start() 启动时 Redis 不可用 → createConnection 拒绝 → `start().catch()`（工厂 fire-and-forget）
→ **connPromise 永久 rejected**——之后 schedule/cron/tick 全部抛（永远不再重试）。

### 修复方案

```ts
function getConn(): Promise<RedisPoolConnection> {
  if (!connPromise) {
    connPromise = options.redis.createConnection()
    // S9（2027-XX）：失败复位——下轮重试（原拒绝被永久缓存——Redis 启动抖动 = 永久坏）
    connPromise.catch(() => { connPromise = null })
  }
  return connPromise
}
```

### 测试

- 故障注入 Redis：`createConnection` 首次 reject → schedule() 抛（预期——启动不可用）→
  第二次调用（连接恢复）→ schedule 成功（修复前永远抛——红）；
- close() 对连接失败路径幂等（`.then(c => c.close()).catch()` 保持）。

---

## 6. S13 — scheduler enqueue 失败恢复（P2）

### 根因

tick()（scheduler/index.ts:79-96）：`ZREM`（原子抢占成功）→ `queue.add` 失败 →
仅 console.error——**任务丢失**（无恢复）。

### 修复方案（抢占失败恢复——ZADD 回写）

```ts
if (removed !== 1) continue
try {
  const task = JSON.parse(member) as ... 
  await queueModule.queue.add(task.name, task.data)
} catch (e) {
  console.error('[scheduler] enqueue:', ...)
  // S13（2027-XX）：入队失败 → 回写 ZSET（下轮重试）——原实现 ZREM 后丢任务
  await (await getConn()).command('ZADD', delayedKey, Date.now(), member).catch(() => {})
}
```

- 回写 score = now（立即重试——下一 tick）；崩溃窗口（ZREM→回写之间）仍存在——极小
  （进程崩溃才发生）——记录为已知边界（真原子方案需 Lua——超出裁剪）；
- 重复入队（回写成功后原任务又被处理？——不会——member 已被 ZREM——唯一副本）。

### 测试

- 注入失败 queue.add（stub queue 模块）→ 任务回写 ZSET → 下 tick 成功入队（修复前丢失——红）。

---

## 7. 决策点：cron 停机补跑（M-d）

`tickCrons` 的 `while (next <= now)` 生成停机期间**全部**错过的触发点——停机 3 天 ×
每小时 = 72 任务同一 tick 入队（资源风暴）——也是「补跑语义」（不丢触发）。

| 方案 | 语义 | 取舍 |
| --- | --- | --- |
| A（保持） | 全量补跑 | 停机越久 flush 越大——数据型任务（报表）可能重复洪水 |
| B（cap） | 最多补跑最近 N 个（如 5）+ skip 旧的 | 防洪水——丢失「错过即跑」语义 |
| C（只跑最新） | 只补偿最后一次 | 中间错过的放弃 |

**推荐 A（保持——文档明确「cron = 按时补跑语义」+ 建议应用层用 `delayMs` ID 幂等**
（如成员 `data.trigger = ts`——应用层去重）——不修代码，补测试锁定补跑行为 + 文档。

---

## 8. 测试计划总表

| 文件 | 新增覆盖 |
| --- | --- |
| `queue.test.ts`（扩展） | Q25 背压上限（≤concurrency）/ Q21 载体先行顺序（故障注入）/ Q8 瞬态断重连（命令包装器）/ 池关闭退出（保持） |
| `scheduler/index.test.ts`（扩展） | S9 connPromise 恢复 / S13 enqueue 回写（stub queue）/ M-d 补跑锁定（现有 cron-integration 扩展） |
| `scheduler/cron-integration.test.ts`（扩展） | S2 cancelCron 前缀隔离（foo/foo:bar）/ S15 子串不误删 |

故障注入基建：queue/scheduler 测试用包装 Redis（delegate command + 按名注入失败）——
零新依赖（queue 已在用 MemoryRedis——包装一层）。

---

## 9. 执行顺序与验收

| 步骤 | 内容 | 验收 |
| --- | --- | --- |
| 1 | **Patch 1：Q25**（背压——核心资源保护） | 红→绿：maxConcurrent ≤ 5（实测 60） |
| 2 | **Patch 2：S2+S15**（cancel 精确匹配——parse 比较） | 红→绿：foo:bar 保留 |
| 3 | **Patch 3：Q21**（载体先行顺序） | 故障注入：ZADD 失败 entry 仍 pending |
| 4 | **Patch 4：Q8**（瞬态断重连 + 池关闭区分） | 故障注入：connection closed 一次后恢复消费 |
| 5 | **Patch 5：S9+S13**（connPromise 复位 / enqueue 回写） | 注入测试红→绿 |
| 6 | 全量回归 `npm run test:server` + `npm run test:client` + tsc | 零引入（R-03：stash 前后类型对比） |

**每 Patch 独立可提交**（小步；先红后绿）。scheduler 测试依赖真 Redis（docker 已运行）。

---

## 10. 已知边界（诚实裁剪）

- Q8 重连只保连接存活——Redis 数据丢失（RDB/AOF 未配）超出框架责任（文档红线：生产配持久化）；
- S13 崩溃窗口（ZREM→回写之间进程死亡）——真原子需 Lua 脚本——记录为裁剪；
- memory-redis 无 hash 面——scheduler 测试保持真 Redis（CS-04 精神）——不给 memory 补
  hash 面（工程量 vs 收益——记忆在案）；
- queue `attempts` 0-based（首次执行 = 0）——已有文档——测试锁定；
- 延迟重试固定间隔 = visibilityTimeout（文档明确——不做指数退避——裁剪）。

---

## 11. 执行实录（2027-XX——全部交付）

| Patch | 内容 | 测试 | 状态 |
| --- | --- | --- | --- |
| 1 | **Q25 背压**：loop 顶部 `inflight.size >= concurrency` → Promise.race 退让 +
  claim 批量收窄（concurrency - inflight）——实测 5→60 无界根治 | queue.test +1 | ✅ |
| 2 | **S2+S15**：cancelCron/cancelSchedule 改 parse 后精确比较（m.name/m.id）——
  前缀（foo/foo:sub）/子串（data 内嵌 id）歧义消除——R-03/G9 纪律延续 | cron-integration +2 | ✅ |
| 3 | **Q21 载体先行**：重试（ZADD）/DLQ（XADD dead）先写载体再 XACK——
  ZADD 瞬败时 entry 保持 pending（stale 接管重试——原 XACK 先清 = 静默丢失） | queue.test +1 | ✅ |
| 4 | **Q8 瞬态断重连**：isConnClosed 拆分（pool closed 永久退出 / connection closed
  瞬态）→ dropConn + 指数退避（500ms→5s）+ loop 顶部重建钩子——原 running=false
  永久死亡根治 | queue.test +1 | ✅ |
| 5 | **S9+S13**：connPromise 失败复位（启动时 Redis 不可用 = 永久坏→恢复重试）；
  scheduler enqueue 失败 → member 回写 ZSET（下 tick 重试——原 ZREM 后丢任务） | index.test +2 | ✅ |

**验收**：queue 18/18（原 14）；scheduler 18/18（原 13）；`npm run test:server`
455/455；`npm run test:client` 385/385；`tsc --noEmit` 零错误。

**测试期间修正**：① Q21 测试最初误删 `const name` 声明（编辑事故——ReferenceError
现形后恢复）；② Q8 修复初版缺 loop 顶部连接重建钩子（dropConn 后 `conn!` 为 null
——三处 catch 改造后由 while 顶部 getConn 幂等重建补上）。

**决策记录（M-d）**：cron 停机补跑语义保持（全量生成触发点——补跑不丢）——
文档将明确「cron = 按时补跑语义 + 建议应用层按触发时间幂等去除重」（不修代码——
补跑行为已有测试锁定）。
