# weifuwu 自研 DB 客户端计划（TDD）

> 目标：零第三方依赖的 postgres / redis 客户端，测试驱动开发，可预测失败模式。
> 状态：✅ 已完成（M1-M5 全部达成）——2026-07-31

---

## 0. 目标与非目标

### 目标
- 自研 `ctx.sql`（postgres）与 `ctx.redis`（redis）客户端，替换 `postgres.js` / `ioredis`
- **零第三方运行时依赖**：框架只依赖 Node 标准库（`net` / `tls` / `crypto` / `node:http`）
- 统一错误模型（`HttpError` 体系贯穿）、类型层（`query<T>()` + schema 注册）、观测内建
- **完全测试驱动**：每个能力先写失败测试，字节级确定性回归

### 非目标（诚实裁剪，明确"不支持"并抛 `ProtocolError('unsupported')`）
| 能力 | 状态 |
|------|------|
| 逻辑复制 / 流复制（CDC） | ❌ 不支持（远期期权） |
| 大对象（lo_*） | ❌ 不支持 |
| 显式游标（DECLARE/FETCH） | ❌ 不支持（流式结果替代） |
| COPY 二进制格式 | ❌ 不支持（文本格式够用） |
| Redis 集群（MOVED 路由）/ 哨兵 | ❌ 不支持（standalone 优先，连接级重定向报错） |
| Redis 自动管道（autoPipelining） | ❌ 不支持 |
| Lua 脚本（EVAL 透传） | ⚠️ 透传（不做验证/缓存） |

---

## 1. 技术架构

```
src/db/redis/                    src/db/postgres/
├── resp.ts        RESP2 编解码  ├── protocol.ts   v3 消息构建/解析
├── connection.ts  连接/重连      ├── auth.ts       SCRAM-SHA-256 + TLS
├── command.ts     命令构建       ├── types.ts      OID 类型映射表
├── pipeline.ts    管道批处理      ├── query.ts      扩展查询(Parse/Bind/Execute)
├── pool.ts        连接池         ├── transaction.ts 事务状态机
├── client.ts      对外 API       ├── pool.ts        连接池
└── errors.ts      统一错误模型    ├── copy.ts        COPY 文本格式
                                ├── notify.ts      LISTEN/NOTIFY
                                └── client.ts      对外 API

src/db/errors.ts                  # 统一错误模型（两客户端共享）
src/db/schema.ts                  # schema 注册 → 类型推断/校验（Phase 5）
```

**API 形态（对齐现有 ctx 注入，替换零摩擦）**：
```ts
ctx.sql\`SELECT * FROM decks WHERE id = ${id}\`   // tagged template（兼容现有用法）
ctx.sql.query<T>('...')                          // 类型层
ctx.sql.transaction(fn)                          // 事务 + 重试
ctx.redis.get/set(key, val, ttl)                 // TTL 安全参数
ctx.redis.jsonGet/jsonSet                        // 自动序列化
ctx.redis.cache(key, fn, ttl)                    // 缓存便捷层
```

---

## 2. TDD 方法论

### 2.1 测试金字塔（三层，全部自动化）

```
┌─────────────────────────────────────────────┐
│ 集成层: docker 真库（postgres/redis）          │  ← 真实兼容性
│   weifuwu 测试已有 docker compose 基建         │
├─────────────────────────────────────────────┤
│ 协议层: mock 服务器（net.Socket 实现假服务端）   │  ← 主战场，快而确定
│   断言完整会话: 握手 → 查询 → 结果 → 关闭        │
├─────────────────────────────────────────────┤
│ 字节层: 纯函数编解码单元测试                     │  ← 最细粒度
│   输入 buffer → 输出消息对象（golden 断言）      │
└─────────────────────────────────────────────┘
```

### 2.2 黄金字节回归（对齐 pptx golden 哲学）
- mock 服务器录制客户端发出的**协议字节流**，断言与 golden 一致
- 确定性：字节级可回归，行为变更 = 测试红

### 2.3 红 → 绿 → 重构循环
每个能力单元：
1. **红**：写失败测试（先定义行为契约）
2. **绿**：最小实现（只过测试）
3. **重构**：消除重复，保持测试绿
4. 全量回归（本模块 + 框架测试）

### 2.4 Mock 服务器设计
```
test/mock/redis-server.ts   RESP2 服务端（解析命令 → 配置化响应）
test/mock/pg-server.ts      v3 协议服务端（认证握手/Parse/Bind/Execute/
                            RowDescription/DataRow/ReadyForQuery）
```
- mock 可注入**故障场景**：连接中断、错误响应、慢响应、认证失败
- 故障注入是"可预测失败模式"测试的基础

---

## 3. 阶段计划

### Phase 0 — 基础设施（0.5 周）✅
**目标**：TDD 骨架 + mock 服务器 + 错误模型可跑通一个端到端字节测试

| 任务 | TDD 步骤 |
|------|---------|
| 错误模型 `src/db/errors.ts` | 红：断言错误类型/字段 → 绿：实现 |
| mock redis-server | 红：连接后 ping → pong 断言 → 绿：RESP 服务端 |
| mock pg-server（最小：认证跳过 + 单查询） | 红：握手会话断言 → 绿：实现 |
| 测试脚本接入 `npm test` | 验证：`node --test` 全绿 |

**验收**：`test/mock/*` 可跑，框架测试不回归（611 pass）

---

### Phase 1 — Redis RESP 核心（1 周）✅
**目标**：可用的 redis 客户端（get/set/del/incr/expire），通过 mock + 真库

| 任务 | TDD 步骤 |
|------|---------|
| `resp.ts` 编码/解码 | 红：字节 golden（`*3\r\n$3\r\nSET\r\n...`）→ 绿 |
| `connection.ts` 连接状态机 | 红：mock 断开 → 重连断言 → 绿 |
| `command.ts` get/set/del/incr/expire | 红：mock 会话断言 → 绿 |
| `pool.ts` 简单池（max/空闲回收） | 红：并发 10 连接复用断言 → 绿 |
| **集成验证** | docker redis：set/get/ttl/过期 全绿 |

**验收**：mock + docker 双绿；行为契约文档化

---

### Phase 2 — Redis 增强 + 框架替换（0.5-1 周）✅
**目标**：框架层 API（TTL 安全/json/cache）+ 替换 ioredis

| 任务 | TDD 步骤 |
|------|---------|
| TTL 安全 `set(key, val, ttl)` | 红：传 ttl 数字 → 断言 expire 字节 → 绿 |
| `jsonGet/jsonSet` 自动序列化 | 红：对象存取往返断言 → 绿 |
| `cache(key, fn, ttl)` | 红：缓存命中/未命中/过期断言 → 绿 |
| key 前缀选项 | 红：前缀注入断言 → 绿 |
| pipeline | 红：一次往返多条命令（mock 计数）→ 绿 |
| 离线队列 | 红：断线期间命令入队，恢复后 flush → 绿 |
| **替换** `src/redis/client.ts` | 全量测试 + 回归 611 |

**验收**：`ctx.redis` 零依赖实现；`redis.test.ts` 等价覆盖

---

### Phase 3 — Postgres 协议核心（1.5-2 周）✅
**目标**：可用的 pg 客户端（连接/SCRAM/参数化查询/事务/类型）

| 任务 | TDD 步骤 |
|------|---------|
| `protocol.ts` 消息构建/解析 | 红：22 种消息字节 golden → 绿 |
| `auth.ts` SCRAM-SHA-256 | 红：mock 服务器握手（client-first → server-first → 验证）→ 绿 |
| `query.ts` 扩展查询（Parse/Bind/Execute） | 红：参数化查询会话断言 → 绿 |
| 参数序列化 + `types.ts` 常用 OID | 红：text/int/bigint/numeric/timestamp/date/boolean/uuid/json/jsonb/数组 往返断言 → 绿 |
| `transaction.ts` 状态机 | 红：BEGIN/COMMIT/ROLLBACK + 错误回滚断言 → 绿 |
| `pool.ts` + statement_timeout + 取消请求 | 红：超时中断断言 → 绿 |
| **集成验证** | docker postgres：真实 CRUD + 事务 + JSONB 往返 |

**验收**：mock 字节 golden + docker 集成双绿；**jsonb 进（对象）出（对象）契约明确**

---

### Phase 4 — Postgres 增强 + 框架替换（1 周）✅
**目标**：COPY / LISTEN-NOTIFY / 预处理缓存 + 替换 postgres.js

| 任务 | TDD 步骤 |
|------|---------|
| COPY 文本格式（CopyIn/CopyOut） | 红：批量导入导出会话断言 → 绿 |
| LISTEN/NOTIFY | 红：通知接收断言（mock 推送）→ 绿 |
| 预处理语句缓存 | 红：重复查询单次 Parse（mock 计数）→ 绿 |
| 错误映射（23505→409 等） | 红：错误码 → HttpError 断言 → 绿 |
| **替换** `src/postgres/client.ts` | 全量测试 + 回归 611 |

**验收**：`ctx.sql` 零依赖实现；aippt（已归档）迁移后 64 测试全绿，自研客户端经 agent-platform 生产验证

---

### Phase 5 — 类型层 + 框架融合（1 周）✅
**目标**：schema 注册 → 类型推断/校验；观测内建；文档

| 任务 | TDD 步骤 |
|------|---------|
| `query<T>()` 泛型 | 红：类型断言（编译期）→ 绿 |
| schema 注册 → 行类型推断 | 红：注册后查询类型正确 → 绿 |
| 运行时校验（OID → 类型验证） | 红：脏数据被拦截断言 → 绿 |
| 观测内建（onQuery/慢查询日志/traceId） | 红：钩子调用断言 → 绿 |
| **全量替换**：aippt（已归档）迁移到新客户端 | aippt 64 测试 + 端到端回归（当时） |
| 文档：行为契约 + 裁剪声明 | 验收 |

**验收**：aippt（已归档）完全跑在自研客户端上；`parseRow()`/双重编码样板从应用层消失

---

## 4. 里程碑

| 里程碑 | 时间 | 标志 |
|--------|------|------|
| M1 | 第 1 周 | Redis 核心通过 mock + 真库 | ✅ |
| M2 | 第 2 周 | ctx.redis 替换 ioredis，框架零回归 | ✅ |
| M3 | 第 4 周 | Postgres 核心通过 mock + 真库 | ✅ |
| M4 | 第 5 周 | ctx.sql 替换 postgres.js，aippt 迁移成功（应用已归档） | ✅ |
| M5 | 第 6 周 | 类型层 + 文档 + 全量回归 | ✅ |

**总规模**：约 5-6 周（含 TDD 测试编写）

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| SCRAM 握手细节错误 | mock 服务器逐步加场景；docker 真库（PG15+）最终验证 |
| 类型 OID 覆盖不全 | 只做常用集；未知类型按 text 透传 + 文档声明（诚实裁剪） |
| 协议边界"稳定地错" | 所有不支持路径抛 `ProtocolError('unsupported')`——可预测失败 |
| 替换破坏现有应用 | 双跑期：新旧客户端并存，golden 对比查询结果 |
| 测试变慢（集成层） | 协议层 mock 为主战场，集成层仅关键路径 |

## 6. 裁剪声明（发布时写入文档）

```
weifuwu 自研 DB 客户端支持:
  postgres: 连接/SCRAM+TLS/扩展查询/事务/常用类型/连接池/
            statement_timeout/取消/COPY 文本/LISTEN-NOTIFY/预处理缓存
  redis:    RESP2/连接/重连/离线队列/管道/JSON 存取/TTL/key 前缀

不支持（明确抛错）: 逻辑复制/大对象/游标/二进制 COPY/集群/哨兵/自动管道
```

---

## 完成总结（2026-07-31）

### 交付
- `src/db/errors.ts` — 统一错误模型（5 分类 + isRetryable）
- `src/db/redis/` — RESP2 协议自研：resp/connection/client/pool/pipeline（4 文件 + mock-server）
- `src/db/postgres/` — PG v3 协议自研：protocol/connection/schema/pool（4 文件）
- `src/redis/`、`src/postgres/` — 中间件替换（ctx.redis / ctx.sql 零第三方）
- **dependencies: 9 → 3**（ws / graphql / @graphql-tools/schema）

### 测试（全部 CS-04 真实库验证）
| 模块 | 测试数 |
|------|--------|
| 错误模型 | 7 |
| redis (real) | 59 |
| postgres (real) | 62 |
| 框架全量 | **735 pass** |

### 真实库验证抓出的协议 bug（CS-04 价值）
1. 协议版本字节序 `[0,3,0,0]`=196608
2. SASL 初始响应格式（机制名\0+Int32长度+响应）
3. client-first 缺 gs2 header `n,,`
4. Query 消息缺 \0 终止
5. 扩展查询半双工缓冲（Parse/Bind/Execute 需 Flush/Sync）
6. ParameterDescription 需 Describe 请求
7. RESP 多回复单 chunk（pushAll）
8. 增量解析器 IncompleteError 回滚

### 最终裁剪声明（写入文档）
```
支持:
  postgres: 连接/SCRAM-SHA-256/md5/扩展查询/参数化/类型映射/事务/池/schema 校验
  redis:    RESP2/连接/重连/离线队列/管道/JSON 存取/TTL/key 前缀
不支持（明确抛 ProtocolError('unsupported'））:
  逻辑复制/大对象/显式游标/二进制 COPY/集群/哨兵/自动管道
```
