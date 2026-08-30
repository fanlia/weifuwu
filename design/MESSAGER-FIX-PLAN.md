# MESSAGER-FIX-PLAN — src/server/messager/ 优化修复计划

> 针对 `src/server/messager/`（消息系统中间件：会话/消息持久化 + WS/Redis 实时广播）
> 的缺陷修复与测试补齐计划。**关键发现均以复现脚本实证**（非纯审读）。
>
> 基线：`node --test src/server/messager/messager.test.ts` → 10 pass（当前绿）。
> 当前测试面：**仅 memory-sql 契约层**——路由层/实时层/真库路径零测试。

---

## 0. 缺陷清单总览（按严重度）

| ID | 严重度 | 缺陷 | 实证方式 |
| --- | --- | --- | --- |
| M2 | **安全（P0）** | 编辑消息越权写——`PATCH` 先 `editMessage` 后校验归属 → 403 应答**但内容已被改写**（任意登录用户可篡改任意消息） | 复现脚本：非发送者 PATCH → 403 + 内容已变 |
| M10 | **正确性（P1）** | `createConversationRow` 的 `BEGIN/COMMIT` 在连接池下**断裂**——`pool.query` 每条 acquire/release 任意连接（pool.ts:192-201 实证）——真库多连接时 BEGIN 在 A、INSERT 在 B、COMMIT 在 C → "COMMIT has no corresponding BEGIN" 或事务外自动提交 | 代码实证：`makeSql` → `pool.unsafe` 无连接亲和；`pool.begin` 才是正途（client.ts:89） |
| M9 | **正确性（P1）** | direct 会话并发重复创建——查-插窗口无唯一约束 → 同对用户两会话（状态分割） | 复现脚本：`Promise.all` 2× createConversation → 两不同 id |
| M3 | **契约违背（P2）** | 会话列表排序与签名不符——文档「按最近活动倒序」，实际 `ORDER BY c.created_at DESC`（建会话时间）——旧会话收新消息后不置顶 | 代码审读 |
| M2b | 信息泄露（P2） | 编辑/删除路由顺序：非成员可探测消息存在性（403 vs 400 差异） | 与 M2 同族修复（先成员校验） |
| M12 | 健壮性（P2） | `GET messages?limit=` 无上限——`Number(searchParams) ?? 50` → limit=100000 全量拉取 DoS | 代码审读 |
| M6 | 健壮性（P2） | Redis psubscribe 回调 `JSON.parse` 无 try/catch——畸形/外来消息崩回调（unhandled） | 代码审读 |
| M15 | 安全设计缺口（P2） | WS 无鉴权——升级不跑中间件（core/ws.ts:103-105 ctx 仅 {params,query,hub}）——任意客户端 subscribe 任意 room（`conv:{id}`/`user:{id}` 窃听） | 代码审读（核心层实证） |
| M11 | 语义决策 | `listMessages` 返回软删消息（测试锁定"仍在"）vs 会话列表 `last_message` 排除软删——**不一致但均可辩护**（历史占位 vs 列表干净） | 决策点（不修——文档澄清） |

**诚实边界**：`listConversations` 用真库专用 raw SQL（to_jsonb + 标量子查询）——memory
无法执行 → **零测试**（现有测试注释承认"由真库测试覆盖"——repo 无此测试——盲区）。
M3 修复顺带消除此盲区（重构为 Query Language 可测路径）。

---

## 1. M2 — 编辑消息越权写（P0 安全——确证）

### 根因

`PATCH /api/messages/messages/:id`（index.ts:545-563）：

```ts
const edited = await editMessage(messageId, body.content)   // ← 写入先发生
if (!edited) return badRequest('message not found')
if (edited.sender_type === 'user' && edited.sender_id !== ctx.user.id) {
  throw new HttpError('Forbidden: not your message', 403)   // ← 403 后置
}
```

**实证**：非发送者 B PATCH A 的消息 →

```
PATCH by non-sender status: 403
after content: "B 篡改"          ← 403 应答，但 DB 已写入
```

与删除路由对比（删除**先查后校验**——正确），编辑路由是**写后校验**——根因翻转。

### 修复方案（对齐删除路由顺序——查 → 鉴权 → 写）

```ts
app.patch(`${p}/messages/:id`, async (req, ctx) => {
  if (!ctx.user) throw new HttpError('Unauthorized', 401)
  const messageId = ctx.params.id as string
  const body = (await req.json().catch(() => ({}))) as { content?: string }
  if (!body.content?.trim()) return badRequest('content is required')
  // M2 修复（2027-XX）：先查 + 鉴权，后写——原实现编辑先于校验（403 前已写入）
  const [row] = await sql.query.from(MESSAGES)
    .select('conversation_id', 'sender_type', 'sender_id')
    .where({ id: messageId }).run()
  if (!row) return badRequest('message not found')
  await requireMember(String(row.conversation_id), ctx)      // M2b：非成员 403（成员校验前置）
  if (row.sender_type === 'user' && row.sender_id !== ctx.user.id) {
    throw new HttpError('Forbidden: not your message', 403)
  }
  const edited = await editMessage(messageId, body.content)   // 鉴权通过后才写
  if (!edited) return badRequest('message not found')         // 竞态：写前被删
  broadcast(`conv:${edited.conversation_id}`, { type: 'message_edited', message: edited })
  return ok(edited)
})
```

删除路由同样前置 `requireMember`（信息泄露面收敛——非成员 403 早于消息探查）。

### 测试（红→绿）

- 非发送者 PATCH → 403 **且消息内容不变**（锁核心——原测试锁定内容变化即红）；
- 非成员 PATCH 他人消息 → 403（M2b）；
- 发送者本人 PATCH → 200 + 内容变化（既有行为保持）；
- 不存在消息 → 400。

---

## 2. M10 — 事务断裂（P1 正确性——确证）

### 根因

`createConversationRow`（index.ts:222-244）：

```ts
await sql.unsafe(`BEGIN`)
try {
  ... sql.query.insert(CONVERSATIONS).run()   // 每语句独立 acquire/release
  for (...) sql.query.insert(MEMBERS).run()
  await sql.unsafe(`COMMIT`)
} catch { await sql.unsafe(`ROLLBACK`); throw }
```

`makeSql` → `sql.unsafe` → `pool.unsafe` → **每条语句 acquire 任意空闲连接 → 执行 → release**
（pool.ts:192-201 实证）。`BEGIN` 的连接释放回池后，`INSERT`/`COMMIT` 可能落在其他连接：

- 真库：`COMMIT` 无对应 `BEGIN` → 错误 → catch → `ROLLBACK` 同样错误 → **createConversationRow 必然失败**
  （或侥幸同连接时"正常"——竞态偶发）；
- `pool.begin`（client.ts:89）才是连接亲和的事务正途——但 `SqlClient` 接口无事务
  （contracts.ts:70 明确："事务能力走中间件面 `pg.transaction`——不在 Sql 接口"）。

**memory 注释「内存自动提交」恰好掩盖此缺陷**——memory 的 BEGIN 是 no-op、自动提交。

### 修复方案（MessagerOptions 注入事务——零核心改动）

```ts
export interface MessagerOptions {
  sql: SqlClient
  /**
   * 连接级事务（传 `pg.transaction` / `pool.begin`）——提供时会话创建原子。
   * 不传 → 裸执行（回退面：成员 insert 失败时孤儿会话——低影响；并发唯一性由
   * M9 direct_key 唯一约束兜底）。原 BEGIN/COMMIT 在连接池下断裂（实证）。
   */
  transaction?: <T>(fn: (sql: SqlClient) => Promise<T>) => Promise<T>
  redis?: Redis
  prefix?: string
}

async function createConversationRow(createdBy, type, memberIds): Promise<Conversation> {
  const run = async (tx: SqlClient) => {
    const rows = await tx.query.insert(CONVERSATIONS).values({ type, created_by: createdBy })
      .returning('id', 'type', 'created_by', 'created_at').run()
    const conv = rows[0]
    for (const memberId of memberIds) {
      await tx.query.insert(MEMBERS)
        .values({ conversation_id: conv.id, user_id: memberId })
        .onConflict(undefined, false).run()
    }
    return conv
  }
  return options.transaction
    ? await options.transaction(run)          // 连接级事务（池亲和——真库正确）
    : run(sql)                                  // 无提供者：裸执行（memory/自管）
}
```

接线（agent-platform/server.ts:1074）：`messager({ sql: pg.sql, transaction: pg.transaction, redis })`。

### 测试

- **shape 锁定**：注入 fake `transaction`（`(fn) => fn(txSql)`——txSql 计数器断言
  conv+members **全部写经 txSql**（非 pool sql）；
- **事务语义**（真库协议——test-servers MemoryPostgresServer）：注入 `transaction`
  （PgPool 真协议 `pool.begin`）→ 成员 insert 失败（制造唯一冲突？成员无冲突面——
  用快照回滚验证：tx 内抛错 → ROLLBACK → 会话不存在）；
- 不注入回退：裸执行正常创建（既有 memory 测试保持——回退面锁定）。

---

## 3. M9 — direct 会话并发重复（P1 正确性——确证）

### 根因

`createConversation` direct 分支：复杂 EXISTS 查重（无唯一约束）→ 无则 INSERT——
两并发请求均通过查重 → 两会话。**实证**：

```
M9 并发 direct 两结果同会话: 重复会话确认（42cd23d4-... vs bd0409ac-...）
```

### 修复方案（direct_key 列级 UNIQUE + onConflict 重查——零窗口）

**可行性验证结论（2027 实施前置——mini 脚本）**：

| 验证项 | 结果 |
| --- | --- |
| `onConflict('direct_key')` 命中**列级 UNIQUE**（CREATE TABLE 声明）→ 冲突 0 行 | ✅ |
| 无 onConflict 插入重复 → 409 | ✅ |
| UNIQUE 声明下 group 行 direct_key=NULL 多行 | ❌ **memory-sql 语义漂移**——NULL 参与唯一性检查（真库 PG：多 NULL 允许）——见 Patch 0 |
| `CREATE UNIQUE INDEX` 被 memory 记忆 | ❌（parser 仅 createIndex no-op——**必须列级 UNIQUE**） |
| `ALTER TABLE ... ADD COLUMN` memory no-op（真库生效） | 已知（parser:349——迁移兼容） |

**方案**（因验证结论修正）：

1. **Patch 0（前置——memory-sql NULL 语义修复）**：execInsert/execUpdate 的唯一性
   检查跳过 NULL 值（`next[u] == null` → 不参与）——对齐真库 PG（DB-FIX-PLAN
   精神：内存引擎语义漂移根治）。受益面：所有 nullable unique 列；现有表
   （users.email/apps.slug NOT NULL）零影响——memory-semantics 新增契约：
   nullable unique 多 NULL 行允许 + 非 NULL 重复仍 409。**（不在本计划的原始
   范围——M9 schema 引入 nullable unique 后 memory 下 group 会话全局炸——
   必须前置）**

2. **schema**（migrate 幂等追加）：

```sql
-- CREATE TABLE 内（新装）：direct_key TEXT UNIQUE
-- 旧库（ADD COLUMN 两路径）：
ALTER TABLE _weifuwu_conversations ADD COLUMN IF NOT EXISTS direct_key TEXT UNIQUE;
```

3. **createConversation**：

```ts
if (input.type === 'direct') {
  const directKey = [userId, input.otherUserId].sort().join(':')
  const existing = ... // 既有复杂查重（保留——兼容旧数据 direct_key 为 NULL 的行）
  if (existing.length) return ...
  const rows = await sql.query.insert(CONVERSATIONS)
    .values({ type: 'direct', created_by: userId, direct_key: directKey })
    .onConflict('direct_key')        // M9：并发唯一冲突 → DO NOTHING → 重查
    .returning('id', 'type', 'created_by', 'created_at').run()
  if (rows.length) { /* 新建会话——写成员 */ return createMembers(rows[0], [userId, otherUserId]) }
  const [winner] = ... // 重查（原查重查询复用——拿到并发赢家）
  return winner
}
```

### 测试

- 并发 2× direct（输入顺序相反）→ 同一会话 id；
- 既有「同对用户唯一（顺序无关）」保持；
- migrate 幂等（含新列/索引）。

---

## 4. M3 — 会话列表排序 + 消除真库专用盲区（P2）

### 根因

`listConversations`（index.ts:249-276）：raw SQL `ORDER BY c.created_at DESC`——
与签名注释「按最近活动倒序」不符。且 to_jsonb 标量子查询 = 真库专用——memory 不能跑
→ 零测试（注释承认）。

### 修复方案（重构为 Query Language——单一实现源 + memory 可测 + 排序正确）

```ts
async function listConversations(userId: string): Promise<Conversation[]> {
  // 1. 我的会话（members JOIN conversations——QL 可测）
  const convs = await sql.query.from(`${MEMBERS} m`)
    .join(`${CONVERSATIONS} c`, { 'c.id': { col: 'm.conversation_id' } })
    .where({ 'm.user_id': userId })
    .select('c.id', 'c.type', 'c.created_by', 'c.created_at', 'm.last_read_at')
    .run()
  if (!convs.length) return []
  // 2. 每会话：最后消息（limit 1 索引命中）+ 未读数（count——QL aggregate）
  const out: Conversation[] = []
  for (const c of convs) {
    const last = await sql.query.from(MESSAGES)
      .where({ conversation_id: c.id, deleted_at: { isNull: true } })
      .orderBy('created_at', 'desc').orderBy('id', 'desc').limit(1).run()
    const unread = await sql.query.from(MESSAGES)
      .where({
        conversation_id: c.id, deleted_at: { isNull: true },
        ...(c.last_read_at ? { created_at: { gt: c.last_read_at as Date } } : {}),
        or: [{ sender_id: { isNull: true } }, { sender_id: { ne: userId } }],  // IS DISTINCT FROM 表达
      }).count().run()
    out.push({ ...conv, last_message: last.length ? normalizeMessage(last[0]) : null,
      unread_count: Number(unread[0].count) })
  }
  // 3. M3：按最近活动倒序（last message 时间 → 会话创建时间兜底）
  out.sort((x, y) => {
    const tx = x.last_message ? Date.parse(x.last_message.created_at) : Date.parse(x.created_at)
    const ty = y.last_message ? Date.parse(y.last_message.created_at) : Date.parse(y.created_at)
    return ty - tx
  })
  return out
}
```

**性能边界（诚实记录）**：1 + 2N 查询（N=会话数）——每查询索引命中（idx_messages_conv）；
原实现 1 条复杂 SQL 但零测试 + 排序错误。会话列表典型量级（<数百会话）下 2N 索引查询
可接受；**换取可测性 + 排序正确**（决策点——若用户偏好单 SQL 优化路径，备选 B：
保留 raw SQL + 排序子查询，测试面维持空白——**不推荐**）。

### 测试

- 3 会话（不同最后消息时间）→ 列表按最后活动倒序（**M3 锁定**——红→绿）；
- last_message = 最近未删消息 → 正确；无消息会话 → null；
- unread_count 只计「非本人 + 未删 + last_read_at 后」；
- member join 语义保持（非成员不在列表）。

---

## 5. M12 + M6 — limit 上限 + Redis 回调容错（P2）

### M12

```ts
const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50))
```
（1..100 clamp——非法/0/NaN 归一 50）。测试：limit=100000 → 100；limit=-5 → 1。

### M6

psubscribe 回调包 try/catch：

```ts
redisSub.psubscribe(`${REDIS_PREFIX}*`, (channel, message) => {
  try {
    const event = JSON.parse(message) as MsgEvent & { _pid?: string }
    if (event._pid === SELF_PID) return
    broadcastLocal(room, event)
  } catch { /* 畸形/外来消息忽略（不崩回调） */ }
})
```

测试：直接向 `wf:msg:conv:x` 发布非 JSON → 回调不抛（真实 Redis 路径——测试用
MemoryRedis publish 畸形串——内存订阅者直接 fn 调用——可断言）。

---

## 6. M15 — WS 订阅鉴权缺口（P2——框架层加固）

### 根因（核心层实证）

`createWsUpgradeHandler`（core/ws.ts:103-105）：升级**不跑中间件**——ctx 仅
`{ params, query, hub }`——`ctx.user` 不存在。messager handler 的
`subscribe` 接受任意 room——任意客户端可订阅 `conv:{id}` / `user:{id}`
（P2 协议设计缺口——签名与文档均未声明鉴权面——需框架层修复或明确裁剪）。

### 修复方案（handler 可选注入——向后兼容 + 应用可接线）

```ts
handler(opts?: {
  /** WS 握手 token 验证（query ?token=）——返回 { sub } 或 null */
  verifyToken?: (token: string) => Promise<{ sub: string } | null>
  /** 订阅授权（userId + room）——false 拒绝订阅 */
  authorizeRoom?: (userId: string, room: string) => boolean | Promise<boolean>
}): WebSocketHandler
```

- open：若提供 verifyToken 且 query 有 token → 验证 → 连接绑定 userId
  （Map<ws, userId>——close 清理）；无 token/验证失败 → 连接可用但**不能订阅受控房间**
  （发 `{ type: 'error', code: 'unauthorized' }`）；
- subscribe：userId 存在 + authorizeRoom(userId, room) → join；否则不 join + error 事件；
- 未提供 opts → 现行为（向后兼容——文档标注「未接鉴权模式——生产必须接线」红线）。

**不影响核心层**（不改 ws.ts——ctx.query 已透传 token——钩子内取用）。

### 测试（实时层零测试补齐——memory-redis + 假 ws）

- `messager-realtime.test.ts`：
  - 本地广播：`join('conv:x')` 的假 ws（`{ readyState: 1, OPEN: 1, send: spy }`）收到 payload；
  - subscribe 协议：ping→pong / subscribe→subscribed / unsubscribe / 畸形 JSON 忽略；
  - 跨进程：两 messager 实例共享 MemoryRedis——A broadcast → B 本地收 + A 环回跳过
    （`_pid` 去重——防双发）；
  - close：rooms/wsRooms 清空 + redisSub 关闭；
  - **M15**：verifyToken 注入 + 非授权 room → 不 join（error 事件）验证。

---

## 7. 测试计划总表

| 文件 | 覆盖 |
| --- | --- |
| `messager.test.ts`（扩展） | M9 并发 direct / M10 transaction shape / M3 排序+未读 + 既有一切保持 |
| `messager-routes.test.ts`（新增） | 路由层：M2 越权（403+内容不变）/ M2b 非成员 / limit clamp / 匿名 401 / 会话成员校验 |
| `messager-realtime.test.ts`（新增） | M6 + M15 + 本地/跨进程广播 + 协议 + close |
| `messager-pg.test.ts`（新增——test-servers 真协议） | M10 真库事务（pool.begin 下 ROLLBACK 无残留）——**实施前置可行性验证** |

---

## 8. 执行顺序与验收

| 步骤 | 内容 | 验收 |
| --- | --- | --- |
| 0 | 复现脚本归档（M2/M9 实证输出记录在案） | 已实证：PATCH 403+内容变 / 并发双会话 |
| 1 | 实施前置验证：memory-sql `CREATE UNIQUE INDEX` 记忆 + onConflict 命中 / MemoryPostgresServer 事务快照语义 | 可行性结论 |
| 2 | **Patch 1：M2 + M2b**（编辑路由查→鉴权→写 + 删除路由成员前置）——安全先行 | 红→绿：越权 403 且内容不变 |
| 3 | **Patch 2：M9 + M10**（direct_key 唯一 + onConflict 重查；transaction 注入 + agent-platform 接线） | 并发同会话 / tx shape 锁定 |
| 4 | **Patch 3：M3 + M12 + M6**（listConversations QL 重构 + limit clamp + 回调容错） | 排序锁定 / clamp / 畸形消息 |  
| 5 | **Patch 4：M15**（handler opts 注入 + realtime 测试补齐） | 鉴权注入 / 协议测试全绿 |
| 6 | 全量回归 `npm run test:server` + `npm run test:client` + tsc | 零引入（R-03：stash 前后类型对比） |

**每个 Patch 独立可提交**（小步快跑；先红后绿）。

---

## 9. 决策点

1. **M11（软删语义）**：推荐保持现状（历史列表返回软删占位——既有测试锁定）+
   文档澄清「last_message 排除软删、历史列表含软删标记」——**不修代码**；
2. **M3（重构 vs 优化 SQL）**：推荐 QL 重构（可测 + 排序修复）——性能边界诚实记录；
   备选：保留单 SQL（零测试维持）——不推荐；
3. **M15（WS 鉴权范围）**：框架层提供注入 API（本计划做）+ 文档红线；
   agent-platform 接线（应用层——`verifyToken=token.ts` 验证 + room 授权表）留给应用；
4. **M10（transaction 选项）**：新可选参数——不破坏既有 API（agent-platform 需接线
   `pg.transaction`——框架文档更新）。

### 已知边界（诚实裁剪）

- M11 软删语义保持（文档澄清）——行为不变；
- 会话清理策略（无 active conv 回收）不在本计划；
- message 级 `content` 无长度上限——Scrypt 类 DoS 不适用（文本）——记录后续项；
- 实时层 Redis 断线**不重连**（initRedis 一次性——失败即降级本地模式——文档标注）；
- 路由层权限（RBAC：owner/admins 可删他组消息）——应用层自接（消息编辑仅限本人——
  本计划保持）。

---

## 10. 执行实录（2027-XX——全部交付）

| Patch | 内容 | 测试 | 状态 |
| --- | --- | --- | --- |
| 0 | **memory-sql 两处语义漂移修复**：① nullable UNIQUE 列 NULL 不参与唯一性
  （对齐真库多 NULL 允许——M9 direct_key schema 前置）+ ② 空集聚合 → [{count:0}]
  （原返回 []——M3 unread 空会话必崩——实证） | memory-semantics +1 | ✅ |
| 1 | **M2+M2b**：PATCH/DELETE 改「成员门控 JOIN 查询 → 鉴权 → 写」（原 editMessage
  先写后 403——内容已篡改——实证）+ M12 limit clamp 1..100 | messager-routes（8） | ✅ |
| 2 | **M9+M10**：direct_key 列级 UNIQUE（CREATE TABLE + ALTER 双路径）+ onConflict
  重查赢家（按 direct_key——EXISTS 需成员完整——事务未提交时必漏）；
  transaction 注入（options.transaction——pool.begin 连接级）；agent-platform 接线 | messager.test +2 | ✅ |
| 3 | **M3+M6**：listConversations 重构 QL 三步（消真库盲区 + 最近活动倒序）+
  psubscribe 回调 try/catch | messager.test +1 | ✅ |
| 4 | **M15**：handler(opts) verifyToken/authorizeRoom 注入（订阅前身份+房间授权）+
  实时层零测试补齐（协议/本地/跨进程/环回/M6/M15/close） | messager-realtime（6） | ✅ |

**验收**：messager 目录 27/27（原 10）；`npm run test:server` 448/448；
`npm run test:client` 385/385；`tsc --noEmit` 零错误。

**测试期间发现并修复的隐藏缺陷**：
- memory-sql aggregate 空集语义（[] vs [{count:0}]——M3 测试现形——内存引擎
  第 2 处漂移——DB-FIX 精神延续）；
- M9 输家回退查重初版用 EXISTS（成员完整前置——事务未提交时漏判）→ 改按
  direct_key 按行查（PG 唯一索引阻塞等待保证赢家已提交）；
- M10 测试初版 txSql/base 不同引擎（表缺失——id 无默认值）→ 同 mem 双包装。

**决策记录**：
- M11 软删语义保持（历史列表返回软删占位——既有测试锁定——文档澄清）；
- M3 采纳 QL 重构（1+2N 索引查询——性能边界记录——换取可测性 + 排序正确）；
- M15 框架层注入 API + 文档红线（agent-platform 业务房间授权接线为应用层后续项）。
