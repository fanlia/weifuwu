# USER-SYSTEM-FIX-PLAN — src/server/user/ 优化修复计划

> 针对 `src/server/user/`（userSystem 中间件：register/login/logout/refresh/me /
> 三层模型 createApp/registerInApp/loginApp/ssoLogin/createInvite/addMember/requireApp）
> 的缺陷修复与性能优化计划。**所有发现均以复现脚本实证**（非纯审读猜想）。
>
> 基线：`node --test 'src/server/user/*.test.ts'` → 38 pass（当前绿）。

---

## 0. 缺陷清单总览（按严重度）

| ID | 严重度 | 缺陷 | 实证方式 |
| --- | --- | --- | --- |
| B1 | **安全/功能** | refresh 轮换丢 `role`（app 会话 refresh 后 token 无 role——前端角色 UI 失效） | 复现脚本：refresh 前后 token payload 对比 |
| B2 | **安全** | refresh token 重放竞态（并发同 token 刷新双 200——单次使用违例） | 复现脚本：Promise.all 2× refresh → 200+200 |
| B3 | **安全** | 登录时间侧信道邮箱枚举（不存在邮箱 1ms vs 错误密码 45ms——防枚举只统一消息未统一耗时） | 计时脚本：nonexistent 1.0ms / wrong-pwd 45.6ms |
| B4 | 性能 | `listAppsFor` N+1（members 循环内每 app 一次查询） | 代码审读（循环体内逐行 query） |
| B5 | 健壮性 | 密码无上限（MB 级 password → scrypt DoS）；register 允许自赋任意 `role` | 代码审读 |
| B6 | 健壮性 | `ssoLogin`/`registerInApp` 并发同 email 建号 → 唯一键 409 竞态（非幂等） | 代码审读（find→insert 窗口） |

---

## 1. B1 — refresh 轮换丢 role（确证）

### 根因

`refresh` 路由（index.ts:698-701）：

```ts
const { user, appId } = await consumeRefreshToken(body.refreshToken)
await ctx.auth!.logout(body.refreshToken)
const session = await issueSession(user, appId ? { appId } : undefined)
```

- `consumeRefreshToken` 返回 `{ user, appId }`——**没有 role**；
- `sessions` 表不存 role（只存 app_id）；
- `issueSession` 带 appId 时不再查成员表 → `signToken` payload = `{ sub, appId }`——**role 字段缺失**。

**实证**（复现脚本输出）：

```
app login token payload: {"appId":"cc99f5e9-...","role":"owner"}
after refresh token payload: {"appId":"cc99f5e9-..."}     ← role 消失
```

**影响**：loginApp 注释明确 role 是前端写操作防线（viewer 前端禁用写按钮）——
refresh 后前端拿不到 role → 恢复"点击才 403"体验缺口；任何按 role 的客户端逻辑失效。

### 修复方案（推荐 A）

**A（推荐）——refresh 时按 appId 查 membership role（成员表为唯一权威源）**：

```ts
// refresh 路由：
let session: { appId?: string; role?: string }
if (appId) {
  const role = await findMemberRole(appId, user.id)
  if (role) session = { appId, role }        // 成员态恢复（角色变更即时生效）
  else session = undefined                    // 已被移出应用 → 降级平台会话
}
const session = await issueSession(user, session && session.appId ? session : undefined)
```

- **与既有哲学一致**：「每次请求查库（删号/角色变更即时生效）」——成员表就是权威；
  role 提升/降级立即反映到新 token（方案 B 存 sessions 表会冻结旧角色）；
- **无 schema 迁移**（方案 B 需 ADD COLUMN app_role + 回填）；
- 被移出应用的成员 refresh → 降级为平台会话（client 拿到无 appId token + 无该 app
  的 apps 列表——仍可平台登录、零残留访问；**不做 401 硬失败**——refresh 是
  「恢复会话」语义，平台账号仍有效）。

**方案 B（备选，不推荐）**：sessions 表加 `app_role` 列，issueSession 落盘、
consumeRefreshToken 带出。缺点：角色冻结（成员降级后 refresh 仍给旧角色 token）、
迁移+回填成本，且与「成员表权威」原则冲突。

### 测试

- app 会话（registerInApp/loginApp 双路径）refresh → 新 token payload 含
  `role` 且 = 成员表当前角色；
- 成员被移除（DELETE membership）后 refresh → token 无 appId（平台态）；
- role 变更（member → admin via 直接 UPDATE 成员表）后 refresh → 新 role 生效。

---

## 2. B2 — refresh token 重放竞态（确证）

### 根因

`consumeRefreshToken`（index.ts:272-290）是先 SELECT（`revoked_at IS NULL`）再
由路由 `logout()` 单独 UPDATE revoke——**两个独立 SQL 之间的窗口**内并发请求全部
通过预检。**实证**：

```
concurrent refresh statuses: 200 200
REPLAY ACCEPTED (race): YES — both succeeded
```

**影响**：refresh token 单次使用是核心安全承诺（被盗 token + 并行刷新 = 无限期有效）。

### 修复方案

**原子消费**（单条 UPDATE ... RETURNING——query builder 已支持
`update().set().where().returning()`）：

```ts
async function consumeRefreshToken(refreshToken: string) {
  const rows = await sql.query.update(SESSIONS_TABLE)
    .set({ revoked_at: sql.raw`now()` })
    .where({ token_hash: hashRefreshToken(refreshToken), revoked_at: { isNull: true } })
    .returning('user_id', 'expires_at', 'app_id')
    .run()
  if (!rows.length) throw new HttpError('Invalid refresh token', 401)
  const row = rows[0]
  if (new Date(row.expires_at as Date) < new Date()) {
    throw new HttpError('Refresh token expired', 401)   // 过期：已原子撤销（正确——不允许再换）
  }
  const user = await findUserById(row.user_id as string)
  if (!user) throw new HttpError('User not found', 401)
  return { user, appId: row.app_id ? String(row.app_id) : undefined }
}
```

- **单语句原子**：`UPDATE ... WHERE revoked_at IS NULL` 在 DB 行锁下互斥——
  并发恰好一个 1 行、另一个 0 行 → 401。后到者「Invalid refresh token」
  （重放语义——与既有消息一致）；
- **✅ 已验证（mini 脚本实测）**：memory-sql `update().set().where(isNull)
  .returning()` 原子消费成立——首次 1 行、二次 0 行（直觉并发测试即可锁定）；
  `set({ revoked_at: sql.raw`now()` })` memory 有 now() 特判（真库同语义）；
  query builder update.returning 已有（query-builder.ts:141-147）；
- 路由内**删除** `await ctx.auth!.logout(body.refreshToken)`（消费即撤销——
  双写消除；原来先消费后撤销的窗口/重复 UPDATE 消失）；
- 过期分支：消费时已撤销 → 过期 token 再次 refresh = 401（语义正确——
  过期后旧 token 不可重放延长）。

**注意**：memory-sql 需验证 `update ... returning` 语义（memory-semantics.test
已覆盖 returning 面——执行时补断言当前 RETURNING 实现支持）。

### 测试

- 并发 2× 同 refreshToken（Promise.all）→ 恰好一个 200 一个 401；
- 顺序重放（现有测试已覆盖 401）；
- 过期 token refresh → 401 且**两**次都 401（不可重放）；
- logout 后 refresh → 401（现有测试）。

---

## 3. B3 — 登录时间侧信道邮箱枚举（确证）

### 现状

`login`（index.ts:380-395）：

```ts
const row = rows[0]
if (!row) throw new HttpError('Invalid email or password', 401)   // 立即返回
const valid = await verifyPassword(password, String(row.password_hash))  // ~45ms scrypt
```

**实证**：不存在邮箱 1.0ms vs 存在邮箱错误密码 45.6ms（scrypt N=16384）。
注释声称「统一 401 不泄露邮箱是否存在——防枚举」——**消息统一但耗时未统一**，
时序攻击可枚举（响应时间就是签名）。

### 修复方案

**延迟拉平（dummy verify）**：用户不存在 `/ password_hash 为 null（SSO 用户）` 时
对固定 dummy 哈希执行一次 `verifyPassword`（同参数同耗时）再抛统一 401：

```ts
const DUMMY_HASH = await hashPassword('dummy-password-for-timing')  // 模块级惰性（一次）

...
if (!row || row.password_hash == null) {
  await verifyPassword(password, DUMMY_HASH)   // 拉平耗时
  throw new HttpError('Invalid email or password', 401)
}
```

- dummy 哈希**模块级惰性初始化**（首次 login 时生成一次——不拖慢启动/注册路径）；
- `password_hash == null`（SSO 无密码账号）同样拉平——否则 SSO 账号可被
  时序区分（比不存在账号还快的路径即 SSO 账号信号）；
- 固定 dummy 串（非用户密码）——无泄露面。

**备选（B）**：恒定时 dummy 不用 scrypt 而用同耗时 sleep——不可靠（CPU 抖动），弃。
**备选（C）**：PBKDF2/argon2 迁移——超出本计划范围（记录为后续项）。

### 测试

- 打桩 verifyPassword 调用计数：不存在邮箱 / SSO 账号也**恰好调用 1 次**（比计时稳定）；
- 两个 401 响应消息一致（既有测试保持）；
- 移除后时序断言不做（计时机抖——用调用计数锁定语义）。

---

## 4. B4 — listAppsFor N+1（性能）

### 现状（index.ts:204-219）

```ts
for (const r of rows) {
  const apps = await sql.query.from(APP_TABLE).select(...).where({ id: String(r.app_id) }).run()
  ...
}
```

members 每行一次 app 查询——N 应用 = N+1 次往返（平台登录/我的应用列表路径）。

### 修复方案（JOIN 单查询）

```ts
const rows = await sql.query.from(`${MEMBER_TABLE} m`)
  .select('m.app_id', 'm.role', 'a.id', 'a.slug', 'a.name')
  .join(`${APP_TABLE} a`, { '__raw': 'a.id = m.app_id' })
  .where({ 'm.user_id': userId })
  .run()
```

- query builder `join(table, on)` 支持（`core/serve.ts` 已有先例）；
- **✅ 已验证（mini 脚本实测）**：memory-sql 支持 INNER JOIN + 对象式 on
  列-列比较 `{ 'a.id': { col: 'm.app_id' } }`（raw JOIN ON 不支持——诚实裁剪
  ——对象式即可）；**输出行键无别名前缀**（resolveCol 去前缀——`r.slug` 而非
  `r['a.slug']`）；`from('m m')` 别名语法可用于 members/apps 两表；
- 真库侧：compileQuery 生成 `JOIN ... ON a.id = m.app_id`（标准的对象 on——
  无需新能力）。

```ts
const rows = await sql.query.from(`${MEMBER_TABLE} m`)
  .select('m.app_id', 'm.role', 'a.id', 'a.slug', 'a.name')
  .join(`${APP_TABLE} a`, { 'a.id': { col: 'm.app_id' } } as any)
  .where({ 'm.user_id': userId })
  .run()
// rows[0] → { app_id, role, id, slug, name }（无前缀键——与现有 AppSummary 构造对齐）
```

### 测试

- 行为等价：3 应用用户 listAppsFor 返回全量、顺序稳定、role 正确（既有断言保持）；
- 查询次数计数（sql wrapper 包一层计数 exec 调用）——N 应用 = 1 次 query 调用
  （锁定 N+1 消除）。

---

## 5. B5 — 密码上限 + register 自赋 role（加固）

### 5.1 密码长度上限

`register`/`registerInApp`/`setPassword` 只有 `< 8` 下限——MB 级密码 JSON 进来
scrypt 内存/CPU 放大（DoS）。统一助手：

```ts
const MIN_PASSWORD_LEN = 8
const MAX_PASSWORD_LEN = 1024
function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LEN) throw new HttpError('password must be at least 8 characters', 400)
  if (password.length > MAX_PASSWORD_LEN) throw new HttpError('password is too long', 400)
}
```

同时消除 register / registerInApp / setPassword 三处重复校验（提取
`validateCredentials(email, password)` 助手——B5 先于行为保留：现 3 处相同消息）。

### 5.2 register 自赋 role 收紧（**决策点**）

现状：`register` 接受 `input.role` 直接入库（`role: input.role ?? null`）——
自助注册可写任意 `role: 'admin'`。虽有平台 `role` 仅是 profile 字段、
应用级 RBAC 用成员表 role（隔离面在），但**文档与实现口径不一致**
（AuthApi.register 的 role 参数来源=调用方应用——自注册场景无信任）。

**推荐**：`register` 忽略 `input.role`（入库恒 null）——平台 profile role 由
应用层用 `setProfile` 类 API（本模块无）或直接 DB 管理；RegisterInput.role 标记
deprecated（保留形状兼容）。**或者**：保留但文档注明「profile 字段非授权字段，
授权一律走成员表 role」。**执行前需用户决策**——默认取推荐（忽略）。

### 测试

- 密码 > 1024 → 400（三端点）；
- register 带 role='admin' → 入库 role = null（若采纳 5.2 推荐）；
- 现有注册测试全绿（不传 role——无破坏）。

---

## 6. B6 — ssoLogin / registerInApp 并发建号（加固）

现状：`find user → (无则) insert`——并发同 email（SSO 双请求 / 两处注册同一邮箱）
→ 唯一键冲突 23505 → 409 竞态。

**方案**：`insert ... onConflict('email', false)`（DO NOTHING）+ 无返回行时再查
（upsert 语义）：

```ts
const rows = await sql.query.insert(USERS_TABLE)
  .values({...})
  .onConflict('email')      // DO NOTHING（memory-sql 已支持——onConflict 路径）
  .returning('id', 'email', 'name', 'role', 'tenant')
  .run()
const user = rows.length ? rows[0] : (await findUserByEmail(normalized))!
```

- memory-sql onConflict 语义已验证（memory-semantics.test：唯一冲突 DO NOTHING
  → 跳过行；insert affectedRows 计数）；
- 真库 pg 编译需确认 onConflict 生成 `ON CONFLICT (email) DO NOTHING`；
- **注意**：onConflict 回退路径返回的 user 可能缺 name（先到者数据）——可接受：
  先到者数据为准（幂等）。

### 测试

- 并发 2× ssoLogin 同 email → 都成功且同一 user.id（非 409）；
- registerInApp 并发同 email（open app）→ 都 201（成员幂等已 guard——members
  insert 有先查 guard + PK 冲突时 409；**并发成员 insert 竞态**：两请求同时
  findMemberRole none → 双 insert → 后者 23505 → 409——**也一并 onConflict 化**或
  捕获 23505 幂等吞掉。优先级：低——记录待办，执行时视测试覆盖决定）。

---

## 7. 测试计划（按项目纪律——修复即契约测试）

### 新增/修改测试（user.test.ts + user-multitenant.test.ts）

| 测试 | 锁定 |
| --- | --- |
| refresh 保留 role（app 双路径） | B1 |
| 角色变更刷新生效 / 成员移除降级平台态 | B1 |
| 并发同 refresh 双请求 → 恰 1×200+1×401 | B2（Promise.all 即可——原子后无窗口） |
| 过期 token 二次 refresh 均 401 | B2 |
| verifyPassword 调用计数（不存在邮箱/SSO 也 1 次） | B3（打桩 password.ts 导出——模块注入点：index.ts 从 password.ts import——测试可 `mock` 或包装 sql exec 侧？**实现细节**：index.ts 接受内部参数？避免过度设计——用 `node:test` mock 模块（`mock.module`）或把 timing 拉平做成 password.ts 的 `verifyWithDummy` 回调注入——执行时定） | B3 |
| listAppsFor 查询次数 = 1（wrapper 计数 exec） | B4 |
| 密码 >1024 → 400 | B5 |
| register 带 role → null（若采纳） | B5 |
| ssoLogin 并发同 email 幂等 | B6 |

### 回归

- `node --env-file=.env --test --test-concurrency=2 'src/server/user/*.test.ts'`（10s 时限——现状 1.6s）
- 全量 `npm run test:server`（src/server 全部——契约面——DB 测试看 docker 状态）
- `npm run test:client`（consumer 面——auth 中间件共享 token 协议——token.ts 未动则快）

---

## 8. 执行顺序与验收

| 步骤 | 内容 | 验收 |
| --- | --- | --- |
| 0 | 复现脚本归档（`_tmp-*.mts` 已跑——不提交） | 三缺陷实证输出记录在案 |
| 1 | ~~实现验证~~ **已完成**：JOIN 对象式 on 列-列比较 ✅ / update-returning 原子消费 ✅（mini 脚本实测） | 已结论：方案照执行 |
| 2 | Patch 1：B1 + B2（refresh 原子消费 + role 恢复）——一处代码两块 | 新增测试绿 + 旧 refresh 测试绿 |
| 3 | Patch 2：B3（timing 拉平） | 调用计数测试绿 |
| 4 | Patch 3：B4（JOIN） | 计数测试绿 + 行为等价 |
| 5 | Patch 4：B5（密码上限/role 决策）+ B6（onConflict 幂等） | 按决策执行 |
| 6 | 全量回归（test:server + test:client） | 零引入（R-03 纪律：git diff 前后类型错误对比） |

**每个 Patch 独立可提交**——小步快跑；每步先红（新增测试先复现/锁定再修）。

---

## 9. 已知边界（诚实裁剪）

- 不引入 OAuth/邮箱验证（已有 createToken + setPassword 底层 API——文档不变）；
- 不做 argon2/PBKDF2 迁移（scrypt 参数已入哈希串——未来可升级——记录在案）；
- 不做 refresh token 家族追踪（rotation 链——单调令牌已够——重放即 401）；
- `ssoLogin` 无 appId 时无成员创建（现行为保留）；
- 会话清理（expired sessions 垃圾回收）不在本计划（DB 层定时任务——后续项）。

---

## 10. 执行实录（2027-XX——全部交付）

| Patch | 内容 | 测试 | 状态 |
| --- | --- | --- | --- |
| 1 | B1（refresh 恢复 role——成员表权威 + 降级平台态）+ B2（原子 UPDATE...RETURNING 消费即撤销——重放竞态根治；删除路由补 logout 双写） | B1×4 + B2×2 | ✅ |
| 2 | B3（dummy scrypt 拉平——不存在/SSO 无密码账号同耗时；`user-timing.test.ts` mock 计数锁定——`test:server` 加 `--experimental-test-module-mocks`） | B3×1 | ✅ |
| 3 | B4（listAppsFor JOIN 单查询——N+1 消除）+ B5（密码上限 1024 + 三端点收口 validatePassword；自赋 role 忽略——B5.2）+ B6（ssoLogin/registerInApp onConflict 建号幂等 + member PK 冲突 DO NOTHING） | B4×1 + B5×2 + B6×2 | ✅ |

**验收**：用户目录 49 测试全绿；`npm run test:server` 429/429；`npm run test:client`
376/376；`tsc --noEmit` 零错误；时间拉平实证（1ms→~30ms 同级）。

**测试期间修正**：① B1 降级测试自身笔误（`.json()` 后取 `.status`——实现正确）；
② user.test.ts 重构时 refresh describe 缺闭合 `})`（SyntaxError——已修）；
③ multitenant B4 计数 executor 的 `as any` 在参数列表内箭头后不被 strip 器接受
（改 G12 同款具名函数模式）。

**决策记录**：B5.2 采纳推荐路径（自助注册入库 role 恒 null——无消费者传
input.role——apps/agent-platform/src/routes/auth.ts register 调用实证）。
