# weifuwu/scheduler — 计划任务中间件
> **状态（2026-12 确认）**：✅ 已完成——ctx.schedule/cron/cancelCron——解析器 + 执行器 + 真库测试全绿

> 即时 / 延时 / 定时（cron）三类任务，与 queue 咬合（触发后入队执行）。
> 方法论：TDD 先行、零 npm 运行时依赖、CS-04 真库验证、诚实裁剪。

## 需求（对齐主流库）

| 能力 | BullMQ | Bree | 本计划 |
|------|--------|------|--------|
| 即时任务 | `add` | — | `queue.add`（已有）✓ |
| 延时任务（delayMs / 指定时间） | `add({ delay })` | — | **新增** `scheduler.schedule(name, data, { delayMs \| when })` |
| 定时任务（cron 重复） | repeatable jobs | cron 作业 | **新增** `scheduler.cron(expr, name, data?)` |

## 架构：scheduler 独立 + 触发后推 queue（职责分离）

```
ctx.schedule / ctx.cron
    ↓ 写入
Redis 存储：ZSET（延时）+ HASH（cron 注册表）
    ↓ 守护循环（独立连接，多实例原子抢占）
到期任务 → queue.add → ctx.queue.worker 消费（可靠执行/重试/DLQ 复用现有）
```

- **延时任务**：`wf:sched:delayed` ZSET——score=触发时间戳，member=任务 JSON
- **cron 任务**：`wf:sched:crons` HASH——field=`name:expr`，value=任务 JSON（含 nextRunAt）
- **守护循环**：独立 RedisConnection（对齐 queue worker），周期扫描：
  - 延时：`ZRANGEBYSCORE(0, now)` 取到期 → `ZREM`（**ZPOPMIN 原子抢占**，多实例不重复）
  - cron：读 HASH → 计算 next-run → 到期则**原子推进 nextRunAt**（`HSET 条件` 或 GETSET 比对）→ 入队
- **执行**：触发即 `queue.add(name, data)`——复用 queue 的消费组/重试/DLQ

## API

```ts
import { scheduler } from 'weifuwu'

app.use(scheduler())          // 依赖 ctx.queue（触发后入队）

// 延时任务（单次）：delayMs 或指定时间
await ctx.schedule('email.send', { to, body }, { delayMs: 30_000 })
await ctx.schedule('report.build', {}, { when: new Date('2026-09-01T00:00:00Z') })

// cron 定时任务（重复）：每分钟触发 → 入队执行
ctx.cron('* * * * *', 'heartbeat.check', { scope: 'health' })

// 执行端：与 queue 完全一致
const worker = ctx.queue.worker('email.send', async (job) => { ... })
```

## cron 表达式（自研零依赖解析器）

- **5 字段**：`分 时 日 月 周`
- 支持：`*`、`*/n`（步进）、`a,b,c`（列表）、`a-b`（范围）
- 裁剪：❌ 秒/年字段、别名（`@daily`）、`L`/`W`/`#`、`?`、时区（固定 UTC/服务器时区，文档红线）

## 一致性 / 崩溃恢复

- **多实例安全**：延时用 `ZPOPMIN` 原子取出；cron 用 nextRunAt 原子推进——抢占式，无分布式锁
- **崩溃恢复**：未消费延时任务留在 ZSET（到期后仍被扫描）——at-least-once（与 queue 一致，幂等由业务保证）
- **cron 注册**：进程重启后需重新 `ctx.cron(...)` 注册（定义在 HASH 持久化，但守护循环由实例驱动）——**文档红线：cron 注册在应用启动处**

## TDD 测试计划

| 迭代 | 内容 | 测试 |
|------|------|------|
| 1 | cron 解析器（纯函数） | `* * * * *` / `*/5` / `0 9 * * 1-5` / `a,b,c` / 非法拒绝 / next-run 计算 |
| 2 | 中间件骨架 + 延时任务 | delayMs 到期才入队；when 未来时间；未到期不执行；真库 |
| 3 | cron 任务 | 到期触发入队；next-run 推进；多实例不重复（原子抢占） |
| 4 | queue 咬合 + 崩溃恢复 | 触发后 worker 消费（含失败重试）；scheduler 重启后到期任务仍执行 |

## 体验完善（2026 会话追加，开发者影响驱动）

| # | 问题 | 方案 | 测试 |
|---|------|------|------|
| P0 ✅ | **改 cron 表达式双触发**：field=`name:expr`，改表达式生成新 field，旧定义残留仍触发 | field 改 **name**（一个 name 一个定义，HSET 覆盖更新） | 同 name 改表达式 → 旧定义不残留、只触发新 |
| P1 ✅ | **无取消 API**：注册错/业务下线只能手动 DEL | `cancelCron(name)`：HDEL 定义 + 清理 ZSET pending 触发点 | cancel 后不再触发；不存在返回 false |

## 诚实裁剪（明确不做）

- ❌ cron 秒/年/别名/特殊字符、时区配置（红线：服务器本地时区）
- ❌ 重排 / 手动触发 / 单次任务取消（v2）
- ❌ 分布式锁（原子命令抢占替代）
- ❌ 持久化调度器（cron 定义持久化在 HASH；重启后守护循环恢复即继续触发——
  应用无需重新注册，但**改表达式用覆盖语义**、停用必须 cancel——红线更新）
- ❌ 优先级 / 速率限制（queue 裁剪同）

## 验证（✅ 全部完成）

- ✅ 迭代 1：cron 解析器 16 测试（解析 8 + nextRun 8）
- ✅ 迭代 2：延时任务 5 测试（delayMs/when/多任务/崩溃恢复/双实例竞争）
- ✅ 迭代 3：cron 集成 3 测试（到期触发/非法抛错/多实例不重复）
- ✅ 全量：框架 1031 + db 191 全绿；tsc 干净
- ✅ cron 集成测试加速：HSET nextRunAt 模拟到点（84s → 0.77s，符合 15s 规则）

### 多应用隔离（实测暴露）

- **问题**：全量并发测试时"多个延时任务"偶发失败——scheduler 的 ZSET/HASH（`wf:sched:*`）是**应用级共享**的，并发文件的另一个 scheduler 实例 ZREM 抢占任务 → 入队到自己的 queue → 原 worker 收不到。**真实的多应用串扰**：同一 redis 的多应用会互相抢任务。
- **修复**：`scheduler({ prefix })`——多应用共用 redis 必须各自 prefix；同应用多实例共享 prefix = 协作消费（多实例语义不变）。测试全部唯一 prefix 隔离。

### 落地细节

- ✅ **体验完善已落地**（`7c0be2d`）：field=name 覆盖更新 + cancelCron；附带修复 tickCrons 未定义变量崩溃、测试公共注册表累积、断言转义错误

- 依赖 queue（参数传入）：`scheduler({ queue })`——触发后 `queue.add`，复用消费组/重试/DLQ
- 守护循环：独立 RedisConnection + tickMs 扫描（默认 1000ms）
- 原子性：延时 ZREM 抢占；cron ZADD NX（触发点唯一 member）+ nextRunAt 幂等推进
- 崩溃恢复：start() 立即补扫（ZSET 到期任务马上触发）
