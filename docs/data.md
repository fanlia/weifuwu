# 数据层 — postgres / redis（weifuwu）

自研 PG v3 / RESP2 协议客户端，真实库测试（CS-04），故障恢复见各节。

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

## postgres — PostgreSQL 客户端（自研）

> **自研 PG v3 协议**（零第三方依赖）——支持 SCRAM-SHA-256 认证、扩展查询（参数化）、类型映射（int8 超范围自动 string 防丢精度）、事务、连接池（acquire 超时防饿死）、schema 写前校验、statement_timeout 慢查询保护。

```ts
import { postgres } from 'weifuwu'

// 注入 ctx.sql（懒连接池）
app.use(postgres())

// ① tagged template —— 插值自动参数化（防注入）
app.get('/users', async (req, ctx) => {
  const users = await ctx.sql`SELECT * FROM users WHERE id = ${ctx.params.id}`
  return Response.json(users)
})

// ② jsonb 对象直传——自动序列化，不再有双重编码/parseRow 样板
app.post('/decks', async (req, ctx) => {
  const deck = await req.json()
  await ctx.sql`INSERT INTO decks (title, deck_json) VALUES (${deck.title}, ${deck})`
  // 读回来自动是对象：rows[0].deck_json === { slides: [...] }（不是字符串）
})

// ③ 事务（postgres.js 兼容 begin）
app.post('/transfer', async (req, ctx) => {
  await ctx.sql.begin(async sql => {
    await sql`UPDATE accounts SET balance = balance - 100 WHERE id = 1`
    await sql`UPDATE accounts SET balance = balance + 100 WHERE id = 2`
  })
})
```

### Query Language（`sql.query` — AST 双后端）

结构化查询对象（AST）→ **真库编译参数化 SQL / 内存直执行**——同一查询两种后端，业务代码零改动切换：

```ts
// 链式 builder：SQL 能力（WHERE 合并/聚合/JOIN/子查询）以类型安全对象表达
const rows = await sql.query.from('orders')
  .where({ user_id: userId, status: { in: ['paid', 'shipped'] } })
  .orderBy('created_at', 'desc')
  .limit(20)
  .run()

// 插入 + RETURNING（onConflict 无列 = 任意唯一冲突 DO NOTHING）
const conv = (await sql.query.insert('conversations')
  .values({ type: 'direct', created_by: userId })
  .returning('id', 'created_at')
  .run())[0]

// 逃生舱：raw 片段（真库透传 / 内存裁剪）
await sql.raw`now()`
```

- **双后端一致**：内存端（MemorySql）直执行同一 AST——关联子查询/聚合/JOIN/游标分页语义对齐真库
- **诚实裁剪**：内存不支持的语义（raw 片段/窗口函数等）抛 `ProtocolError('unsupported')`
- 事务性写入（INSERT/UPDATE/DELETE）建议走 Query Language；分析型列表（复杂 JOIN/COALESCE）用 tagged template 真库

### Memory 实现（零数据库模式）

`MemorySql` / `MemoryRedis` 是**生产契约的黑盒实现**（非 mock 桩）——开发/测试/单实例部署**零外部数据库**：

```ts
import { createMemorySql } from 'weifuwu/db/memory-sql'
import { MemoryRedis } from 'weifuwu/db/memory-redis'

const sql = createMemorySql()      // 契约 Sql：tagged template / query / unsafe / raw
const redis = new MemoryRedis()    // 契约 Redis：command / publish / subscribe / close

// 注入中间件（构造注入模式——消费方只见接口）
const msg = messager({ sql, redis })
const q = queue({ redis })
```

- **语义对齐真库**：惰性 TTL、XREADGROUP 游标、XACK/XAUTOCLAIM、23505→409、gen_random_uuid / now() 默认值、事务 BEGIN/COMMIT no-op（回滚快照由服务器层提供）
- **替换成本为零**：与生产实现（PgConnection/RedisClient）同一契约——业务测试跑内存、协议测试跑内存服务器、生产跑真库

### 测试（零外部依赖）

`npm test` **不需要 docker**——协议层测试连进程内内存服务器（`MemoryRedisServer` / `MemoryPostgresServer`：真实 TCP 线协议 RESP/PG v3 交互），业务测试跑 Memory 实现：

```
协议测试（三部分）        connection（连接/命令/断开）→ 内存服务器
                          AST parse/stringify        → resp/protocol 编解码 + query-language
业务测试                  user/queue/messager/rate-limit → MemorySql/MemoryRedis
```

### 类型映射（自动）

| 数据库类型 | 返回 JS 类型 |
|-----------|-------------|
| json / jsonb | `object`（自动 JSON.parse） |
| int2 / int4 / int8（安全范围内） | `number` |
| **int8（超出安全范围）** | **`string`**（防静默丢精度，金额/ID 关键） |
| float / numeric | `number` |
| boolean | `boolean` |
| text / varchar / uuid | `string` |
| **timestamptz** | **`Date`**（带时区，ISO 解析无本地时区魔法） |
| timestamp / date / interval | `string`（无时区语义——转 Date 按本地时区解析即时区魔法，诚实裁剪不转） |
| NULL | `null` |

### 类型层（查询泛型 + schema 写前校验）

```ts
// ① 查询结果泛型（编译期类型，无需手写 interface + 断言）
interface Deck { id: number; title: string; deck_json: { slides: unknown[] } }
const decks = await ctx.sql.query<Deck>('SELECT id, title, deck_json FROM decks')

// ② schema 注册 → insert 写前校验（脏数据源头拦截）
ctx.sql.register('decks', {
  title: { type: 'text', required: true },
  status: { type: 'enum', values: ['outline', 'ready'] },
  deck_json: { type: 'jsonb' },
})
await ctx.sql.insert('decks', { title: 'x', status: 'INVALID' }) // → ValidationError
```

### 方法面

| 方法 | 说明 |
|------|------|
| `ctx.sql\`...\`` | tagged template → 参数化查询（插值=参数，表名需硬编码） |
| `ctx.sql.query<T>(sql, params?)` | 参数化查询 + 泛型 |
| `ctx.sql.unsafe(sql, params?)` | 原生 SQL（DDL / 动态表名） |
| `ctx.sql.begin(fn)` | 事务（回调收到 tagged template sql） |
| `ctx.sql.transaction(fn)` | 事务（回调收到 `{ query }`） |
| `ctx.sql.register(table, schema)` | 注册表结构（写前校验） |
| `ctx.sql.insert(table, row)` | schema 校验 + 参数化插入 |
| `ctx.sql.insertMany(table, rows[], { batchSize? })` | **批量插入**：多行 VALUES 单次往返（默认 500/批；所有行键必须一致） |
| `ctx.sql.update(table, set, where, { returning? })` | **参数化 UPDATE**：SET/WHERE 全部参数化，返回 `affectedRows` |
| `ctx.sql.delete(table, where)` | **参数化 DELETE**：WHERE 必填（防全表误删），返回 `affectedRows` |
| `ctx.sql\`...\` 内嵌片段` | 条件 SQL 片段（嵌套过滤，参数自动重编号） |
| `ctx.sql.close()` | 关闭连接池 |

### 影响行数（affectedRows）

`INSERT / UPDATE / DELETE / MERGE` 的返回行数组带**非枚举** `affectedRows` 属性（不干扰 `deepEqual`/`JSON.stringify`）：

```ts
const r = await ctx.sql`UPDATE messages SET read = true WHERE id = ${id}`
if (r.affectedRows === 0) return new Response('not found', { status: 404 })
```

```ts
// 批量插入：100 行 1 次往返
await ctx.sql.insertMany('agent_logs', logs, { batchSize: 500 })
// 语义化更新/删除：WHERE 全参数化 + 返回影响行数
await ctx.sql.update('users', { role: 'admin' }, { id: userId })
await ctx.sql.delete('messages', { id: msgId })
```

### 条件片段（嵌套过滤）

```ts
const status = req.query.status // 可能为空
const rows = await ctx.sql`
  SELECT * FROM orders WHERE amount > ${100}
    ${status ? ctx.sql`AND status = ${status}` : ctx.sql``}
`
// 空片段内联为空，参数自动重编号——同一 SQL 无论条件多少都安全参数化
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `connection` | `string` | `DATABASE_URL` | 连接字符串 |
| `max`（或 `poolSize`） | `number` | `10` | 连接池大小 |
| `acquireTimeoutMs` | `number` | `30000` | 池全忙时 acquire 超时（防饿死，0=无限） |
| `statementTimeoutMs`（或 `statementTimeout`） | `number` | `0` | 语句超时（慢查询保护，0=禁用） |
| `idleTimeoutMs` | `number` | `0` | 空闲连接回收（超时未用关闭，容量收缩后自动重建；0=禁用） |
| `onQuery` | `(sql, durationMs, rowCount, traceId?) => void` | — | 查询观测钩子；第 4 参数为请求级 traceId（`x-trace-id` 头经 ALS 传播） |

### 幂等迁移（内置）

`postgres()` 返回的中间件自带迁移跟踪（`_weifuwu_migrations` 表），模块启动时检查-执行-记录三步幂等：

```ts
const db = postgres()
await db.migrate()        // ① 建迁移跟踪表（幂等）

if (!(await db.isMigrated('users'))) {       // ② 检查是否已迁移
  await db.sql.unsafe(`CREATE TABLE users (...)`)
  await db.markMigrated('users')             // ③ 记录（幂等，重复调用无害）
}

app.use(db)
```

> 多副本部署时天然安全：`markMigrated` 用 `ON CONFLICT DO NOTHING`，两个实例同时迁移也不会重复执行。

### 错误映射（自动）

`ctx.sql` 查询错误自动映射为 `HttpError`，业务无需手写 catch：

| 错误码 | 含义 | HTTP |
|--------|------|------|
| `23505` | 唯一约束冲突 | **409** |
| `23503` / `23502` / `23514` | 外键 / 非空 / 检查约束 | **400** |
| `22P02` / `22003` | 类型 / 数值错误 | **400** |

> 未映射的错误码原样抛出（带 `code` 属性，如 `42P01` 表不存在）。

> **裁剪声明**：逻辑复制 / 大对象 / 显式游标 / 二进制 COPY 不支持（明确抛 `ProtocolError('unsupported')`，而非静默出错）。

---

## redis — Redis 客户端（自研）

> **自研 RESP2 协议**（零第三方依赖）——连接/重连（断线 pending 拒绝、指数退避）/离线队列/管道/Pub-Sub（订阅断线自动重放）+ 消除 ioredis 高频痛点（TTL 参数顺序、JSON 手动序列化、缓存样板）。**二进制安全**：`getBuffer(key)` 原样返回字节（缓存序列化 payload 不损坏）。

```ts
import { redis } from 'weifuwu'

app.use(redis())

// ① TTL 安全 —— 直接传秒，不会写错
app.post('/cache/:key', async (req, ctx) => {
  const { value } = await req.json()
  await ctx.redis.set(ctx.params.key, value, 3600)  // ioredis 要 set(k, v, 'EX', 3600)
})

// ② JSON 零样板 —— 自动序列化（AI 缓存场景）
app.get('/cache/:key', async (req, ctx) => {
  const val = await ctx.redis.jsonGet(ctx.params.key)  // 自动 JSON.parse
  return Response.json(val ?? { miss: true })
})

// ③ 缓存便捷 —— 读-算-写一体，null 不缓存（防穿透）
app.get('/llm/:id', async (req, ctx) => {
  const result = await ctx.redis.cache(`llm:${ctx.params.id}`, async () => {
    return await generateLLM(ctx.params.id)  // miss 才执行
  }, 3600)
  return Response.json(result)
})

// ④ Pub/Sub —— 发布用 ctx.redis，订阅用独立连接（回调式，断线自动重连恢复订阅）
app.post('/events', async (req, ctx) => {
  await ctx.redis.publish('events', JSON.stringify({ type: 'deck.created' }))
})

const sub = ctx.redis.createSubscriber()
await sub.connect()
await sub.subscribe('events', (channel, message) => {
  // 收到实时消息
})
await sub.psubscribe('jobs:*', (channel, message) => {
  // 模式匹配订阅
})

// ⑤ 任意命令透传 + keyPrefix 隔离
await ctx.redis.command('LRANGE', 'list', '0', '-1')

app.use(redis({ keyPrefix: 'api:' }))  // 之后所有 key 自动加前缀
await ctx.redis.set('user', 1)         // 实际写入 'api:user'
```

### 方法面

| 方法 | 说明 |
|------|------|
| `get / set(key, val, ttl?) / del / incr / expire / ttl` | 基础命令（set 直接传秒） |
| `jsonGet / jsonSet(key, val, ttl?)` | JSON 自动序列化 |
| `cache(key, fn, ttl)` | 缓存读-算-写（null 不缓存防穿透） |
| `publish(channel, msg)` | Pub-Sub 发布 |
| `createSubscriber()` | 独立订阅连接（`subscribe`/`psubscribe` 回调式） |
| `hset / hget / hgetall / hdel` | hash 字段读写（`hgetall` → `Record`，缺失 `{}`） |
| `lpush / rpush / lpop / rpop / lrange` | list 队列操作（`lrange` 支持负数区间） |
| `sadd / srem / smembers` | set 成员操作（`sadd` 重复不加） |
| `zadd / zrange` | zset 有序集（score 升序） |
| `mget / mset / exists / setnx / incrby` | 批量读写 / 存在性 / 原子设值（锁基础）/ 增量 |
| `pipeline()` | 管道：批量命令一次往返（池级，key 自动加前缀） |
| `command(name, ...args)` | 底层命令透传 |
| `close()` | 关闭连接池 |

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | `REDIS_URL` 环境变量 | 连接字符串 |
| `poolSize` | `number` | `5` | 连接池大小 |
| `keyPrefix` | `string` | `''` | 所有 key 自动加前缀（多应用隔离） |
| `commandTimeoutMs` | `number` | `0` | 命令超时（阻塞命令 resolve(null)；防挂起。0=禁用） |
| `socketTimeoutMs` | `number` | `0` | socket 响应超时（僵尸连接自愈：pending 有命令且超时无数据 → 主动断开重连。0=禁用） |

> **连接健康**：断线自动剔除死连接并重建（池不萎缩）；`CLIENT KILL`/网络抖动后服务自愈，命令不命中死连接。

> **裁剪声明**：集群（MOVED 路由）/ 哨兵 / 自动管道不支持（standalone 优先）。

---

