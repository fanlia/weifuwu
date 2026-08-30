# DB 层优化修复计划（2027-XX——协议服务器致命 bug + 内存引擎语义漂移实证驱动）

> **✅ 已实施归档**：四个波次全交付——提交面 8 文件 +477/-184 + 2 新测试文件
> （servers.test / memory-semantics.test + query-language 扩展——32 项新防线）。
> 验收：V1–V11 实测全部翻转（见 §4 对照表）；db 层 155/155；test:server 418/418；
> test:client 376/376（消费方零改动）；tsc 0。实施实录见本文 §4。
>
> **触发**：src/server/db/ 全量审读 + 可复现实验（9 项疑点全部坐实——非阅读推测）。
> **定位**：全部属**核心层**（自研数据库引擎——pg/redis 客户端 + 内存引擎 + 协议服务器）——
> 修复惠及全部消费方（queue / rate-limit / messager / userSystem / 业务模块）。
> **纪律**：每修复一个复现→锁定契约测试（R-01：测试命令 timeout ≤ 10s）；全库回归绿才收。

---

## 1. 实证画像（node 脚本实测——修复前基线）

| # | 实验 | 实测结果 | 真库语义（应然） | 严重度 |
|---|------|---------|----------------|--------|
| V1 | MemoryRedisServer 带 password：AUTH→SET→GET | `["+OK","-NOAUTH…","-NOAUTH…"]` | AUTH 后同连接全部可用 | **P0 致命** |
| V2 | MemoryPostgresServer.close() 带存活客户端连接 | **HANG > 3s（永久挂起）** | 立即关闭并销毁全部连接 | **P0 致命** |
| V3 | BLPOP key 1（1s 超时） | **2.5s 仍挂起** | 1s 后 resolve null | **P0**（queue worker 挂起源） |
| V4 | builder `.where({age:{gt:15}}).where({age:{lt:35}})` | 返回 10/20/30（只应用 lt） | AND 语义 → 20/30 | **P1**（注释承诺 AND——实为覆盖） |
| V5 | `WHERE age > 15 AND age = 25`（SQL 字符串路径） | 返回 25 和 30（**eq 条件静默丢弃**）；compileSelect 产物 `WHERE age > $1` 同样丢 | 1 行 age=25 | **P1**（双端丢条件） |
| V6 | MemorySql：事务内 DROP TABLE + ROLLBACK（snapshot/restore） | `hasTable('t') = false`——表与数据永久丢失 | 回滚还原表 | P1 |
| V7 | MemorySql UPDATE email 撞 UNIQUE | 静默成功产生重复 | 23505 → HttpError 409 | P1 |
| V8 | 并发 `Promise.all([setnx, setnx])` | `[1, 1]` 双成功 | 恰一个成功（锁语义） | P1 |
| V9 | sadd 已存在成员再加 `'a','b','c'` | 返回 3 | 新增数 = 1 | P2 |
| V10 | publish 到无订阅者的频道 | 返回 1（订阅者总数） | 匹配接收数 = 0 | P2 |
| V11 | incr 非数值字符串 `'abc'` | 静默置 1 返回 1 | 抛 ERR value is not an integer | P2 |

**归因**（三层分布——AGENTS §3 修复归类）：
- **协议服务器层**（V1/V2/V3）：redis-server 的 `authed` 是 dispatch 参数副本（赋值不回写外层闭包）；
  pg-server 不跟踪 socket 集合（close 只停 accept——存量连接无主）；BLPOP waiter 每 socket 单槽
  （二次 BLPOP 覆盖第一个——泄漏挂起）且 timeout 参数整个被忽略。
- **内存引擎层**（V6/V7/V8/V9/V10/V11）：语义对齐承诺（文件头「语义对齐真实 Redis」）在
  sadd/publish/incr/setnx 四点漂移；snapshot 只存 rows 不存表元数据（restore 无法复活表）。
- **Query Language 层**（V4/V5）：builder where 合并是 spread 覆盖（同列后写吃前写）；
  parser 把同列 `=` 合并产出的 `eq` 键——matchWhereExpr 的 hasOp 表与 compileWhere 都不认识
  （**静默 no-op——正是 AGENTS §23「无静默路径」纪律禁止的形态**）。

---

## 2. 波次划分

### W1 — 协议服务器致命修复（P0——测试基建可用性）

| 修复 | 文件 | 方案 |
|------|------|------|
| AUTH 状态丢失 | `redis-server.ts` | 引入 **per-connection 上下文对象** `{ id, sock, authed, subscribed, waiter }`——dispatch 改传 ctx 引用（消灭参数副本）；与 postgres-server W1.4 同型重构 |
| close 挂起 | `postgres-server.ts` | handleSocket 注册 `sockets: Set<Socket>`；close() 遍历 destroy（对齐 RedisServer）后再 server.close |
| BLPOP 挂起 | `redis-server.ts` | ① 解析 timeout 参数（0=无限 / >0 定时回 `$-1` null）② waiter 改 per-key 队列（同 key 多等待者不互覆）③ LPUSH 唤醒 LPOP 取值 null 防御（唤醒竞态不回 `[key, null]` 畸形帧）④ 连接断开清空该连接全部 waiter |

**防线**（新增 `src/server/db/servers.test.ts`）：AUTH 往返后命令可用（V1 复现）；pg close
限时断言 <1s（V2）；BLPOP 超时回 null + 双 waiter 各自回（V3）；LPUSH 唤醒顺序。

### W2 — Query Language 语义修复（P1——条件静默丢失）

| 修复 | 文件 | 方案 |
|------|------|------|
| builder where 覆盖 | `query-builder.ts` | 同列深合并：对象 × 对象 → spread 合并（{gt:15}+{lt:35} 并存）；scalar × 对象 → `{ eq: scalar, ...新条件 }`；scalar × scalar 冲突 → dev warn（恒假语义显式化） |
| `eq` 键静默丢弃 | `query.ts` + `memory-sql.ts` | ① `ColOps` 类型登记 `eq?: WhereScalar` ② compileWhere 输出 `col = $n` ③ matchWhereExpr hasOp 表 + `deepEq` 判定补 eq——**类型登记 + 双端消费 + 契约测试**（对齐「编码唯一性」纪律：eq 是合法编码就两端都必须认识） |

**防线**（并入 `query-language.test.ts`）：V4/V5 复现锁定——链式 where AND 语义、
`WHERE x > a AND x = b` 双端（parser→内存执行 / builder AST→compileSelect SQL 字符串）各断言。

### W3 — 内存引擎语义对齐（P1/P2——「语义对齐真库」承诺兑现）

| 修复 | 文件 | 方案 |
|------|------|------|
| 快照无法复活表 | `memory-sql.ts` | snapshot 存 `{ rows, 元数据副本 }`（columns/columnTypes/pk/uniques/defaultNow）；restore 对快照有而现表无的 → 重建表+数据（V6） |
| UPDATE 不校验 UNIQUE | `memory-sql.ts` | execUpdate 应用 sets 后逐 unique 检查（排除自身行）→ HttpError 409（对齐 INSERT 路径）（V7） |
| setnx await 间隙 | `memory-redis.ts` | 去 await——同步查 strings + 过期检查（对齐 incr 的同步读-写模式）（V8） |
| sadd 计数 | `memory-redis.ts` | `st.has(m)` 真值跳过——只计新增（V9） |
| publish 返回值 | `memory-redis.ts` | `_dispatch` 返回是否命中 → publish 累加命中数（V10） |
| incr/incrby 非数值 | `memory-redis.ts` | `Number.isNaN(cur)` → ProtocolError('ERR value is not an integer or out of range')（对齐真库错误文案）（V11） |
| LIKE 锚定 | `memory-sql.ts` | `%`→`.*`、`_`→`.`、其余转义 → 全锚定 RegExp（ilike 加 i）——前缀/后缀语义恢复 |
| affectedRows | `memory-sql.ts` | execInsert onConflict 跳过行不计入（返回实际插入数） |

**防线**（新增 `src/server/db/memory-semantics.test.ts`）：V6–V11 + LIKE 每项一个复现锁定。

### W4 — 诚实裁剪细化 + 结构清理（P2——低风险收尾）

| 项 | 文件 | 方案 |
|------|------|------|
| assertOpen 不一致 | `memory-redis.ts` | exists/lpop/rpop/srem/hdel/hget/hgetall/lrange/smembers/zrem/zadd 补 assertOpen（closed 后可预测失败——不留半开状态） |
| XGROUP CREATE '$' | `memory-redis.ts` | startId='$' → 游标 = entries.length（只投新）；'0' → 0（现状恒 0） |
| 死代码 | 两 server | postgres-server `rowDescription()`（sample 版无调用）；redis-server handleSocket 未用 `subscribed` 局部；实施时 rg 反查确认 |
| handleMessage 10 参数 | `postgres-server.ts` | getter/setter 参数表 → per-connection ctx 对象（与 W1 redis 同型——两服务器一致化） |
| derived 表重复解析 | `memory-sql.ts` | execSelect derived 分支 Map 缓存 innerSql→AST（perf——每次执行重 parse） |

**判负记录**（不做——诚实裁剪红线保持）：
- 内存引擎真事务隔离（MVCC/锁等待/嵌套事务）——snapshot/restore 已覆盖 queue 自愈测试场景，
  真事务语义由真库承担（文件头文档红线）；
- BLPOP 多连接 FIFO 公平唤醒——单 waiter 队列 + null 防御足够（queue 单消费者形态）；
- Redis 协议完整命令面 / pg SSL+SCRAM 服务器端——unsupported 显式报错契约不变。

---

## 3. 验收标准

1. `npm run test:server` 全绿（含新增 servers.test / memory-semantics.test / query-language 扩展）；
2. `tsc --noEmit` 0 错误；
3. §1 实证表逐项复跑——V1–V11 全部翻转为应然值（对照表记入本文 §4 实施实录）；
4. 消费方回归：queue / rate-limit / messager 测试零改动通过（接口面不变——纯语义修复）。

## 4. 实施实录（全部交付）

### 修复对照表（§1 实证 → 修复后实测）

| # | 修复前实测 | 修复后实测 | 落点 |
|---|-----------|-----------|------|
| V1 | AUTH 后 `-NOAUTH…`×N | `+OK +OK`（同 chunk pipeline 全可用） | redis-server per-connection ctx（authed 写回） |
| V2 | close HANG > 3s | 限时返回（~2ms） | postgres-server sockets Set + close 全量 destroy |
| V3 | BLPOP 1s 超时永久挂起 | 303ms 回 null | redis-server timeout 末参 + waiter 全局队列 |
| V4 | where(gt).where(lt) → [10,20,30] | [20,30] | query-builder mergeWhere + query.ts 合并单一实现源 |
| V5 | `>15 AND =25` → 25/30（eq 丢） | [25]（双 scalar → and 包装恒假） | parser addWhereCond + matchWhereExpr eq/and |
| V6 | DROP+回滚表永久丢失 | 表复活 + 数据完整 | snapshot 含元数据副本（rows/columns/pk/uniques） |
| V7 | UPDATE 撞 UNIQUE 静默重复 | HttpError 409 | execUpdate 更新后状态视图校验 |
| V8 | 并发 setnx 双成功 `[1,1]` | `[1,0,…,0]` 恰一个 | setnx 同步读-写（无 await 间隙） |
| V9 | sadd 已存在计入 → 3 | 新增数 1 | sadd st.has 判重 |
| V10 | publish 无匹配 → 1 | 0（匹配接收数） | _dispatch 返回命中布尔 |
| V11 | incr 非整数静默置 1 | ProtocolError('ERR value is not an integer…') | incr/incrby 整数校验 |

### 实施中追加发现（计划外——同族歼灭）

1. **mergeWhereField 首版缺 scalar×scalar 分支**——数字被 spread 吞掉（测试现形——
   防线价值直接兑现）；补分支后双 scalar → and 包装（恒假语义保留双条件）。
2. **memory-sql affectedRows 可枚举**——污染 deepEqual/JSON.stringify（pg 客户端已
   非枚举并注释——内存端对齐同契约）：makeResult defineProperty 非枚举，10 处收敛。
3. **字符串 parser 不支持 WHERE [I]LIKE**——matchWhereExpr/builder 已支持而字符串
   路径不支持（路径间漂移）——parser 补 LIKE/ILIKE 分支（同列合并走 addWhereCond）。
4. **whereRaw 覆盖式写法**（update/delete builder 直接整体覆盖 where）——三处统一
   addWhereCond（raw 冲突 and 包装不丢弃）。

### 验收结果

```
db 层全量        155/155（123 存量零改动 + 32 新防线）
test:server     418/418（queue/rate-limit/messager/user 消费方零改动通过）
test:client     376/376（客户端层零影响确认）
tsc --noEmit    0
V1–V11 验收脚本  12/12 ✅（/tmp/db-accept.mjs——对照表同值）
```

### 新防线登记

- `src/server/db/servers.test.ts`（13 项）：AUTH 往返/WRONGPASS/无密码 AUTH/
  BLPOP 超时回 null/LPUSH 跨连接唤醒/同连接多 waiter/连接关闭释放 waiter/
  pg close 限时返回/close 幂等
- `src/server/db/memory-semantics.test.ts`（12 项）：sadd/publish/incr/setnx 原子性/
  setnx 惰性过期/快照复活表/快照清空新建表/UPDATE unique/自身同值不误报/
  LIKE 全锚定/ILIKE/affectedRows/XGROUP '$' 与 '0'
- `query-language.test.ts` 扩展（9 项）：builder 链式 where AND/scalar×ops → eq/
  字符串路径同列共存（正反序）/双 scalar 恒假/eq 编译进真库 SQL/and 组编译/
  or 组冲突包装/whereRaw 冲突不覆盖
