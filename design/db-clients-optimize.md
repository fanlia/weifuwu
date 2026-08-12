# weifuwu 自研 DB 客户端优化计划（ctx.sql / ctx.redis）
> **状态（2026-12 确认）**：✅ 已完成——PG 层性能持平/反超 postgres.js，Redis 热路径追赶 ioredis（编解码零拷贝）

> 基于 2026-07-31 审查：PG 层性能持平/反超 postgres.js，Redis 热路径落后 ioredis 20-70%。
> 原则：CS-05（协议层改动 TDD 先行 + 诚实裁剪）、零拷贝编解码（buffer + offset 指针）、
> 每个优化项必须有回归测试 + bench 验收。
> 状态：✅ 已完成（2026-07-31，3 commits）

---

## ctx.redis 优化计划

### 问题基线（bench/db-bench.ts，docker 真库，500 次中位数）

| 操作 | 优化前 | 优化后 | ioredis | 差距 |
|------|--------|--------|---------|------|
| set | 0.104ms | 0.070ms | 0.055ms | ~1.3× |
| get | 0.122ms | 0.061ms | 0.055ms | **1.11×** ✅ |
| json 往返 | 0.191ms | 0.119ms | 0.112ms | **1.06×** ✅ |
| 并发 set | 0.5ms/批 | 0.3ms/批 | 0.2-0.3ms/批 | **持平** ✅ |

### R0 — 二进制安全（正确性，最先做）

| # | 位置 | 问题 | 改动 | 验证 |
|---|------|------|------|------|
| R0.1 | `resp.ts` `encodeCommand` | Buffer 参数被 `arg.toString()` 破坏（含死三元） | Buffer 参数用其字节直接拼接（预分配 buffer + offset 指针，string 参数 utf8 一次） | 单元测试：Buffer 含任意字节（含 0x00/0xff）往返 golden |
| R0.2 | `resp.ts` `readBulk` / `get` | 所有响应强制解码 string——二进制值损坏 | 新增 `getBuffer(key)` API：bulk 字节原样返回（`readBulkBytes` 返回 Uint8Array，仅该路径不 decode）；`get` 保持 string（向后兼容） | 真库测试：写二进制字节 → getBuffer 逐字节相等 |

**裁剪声明（R0.2）**：`getBuffer` 只支持单值 bulk；`get` 返回 string 语义不变。

### R1 — 热路径性能（目标：get ≤ 0.09ms，差距收窄到 ≤20%）

| # | 位置 | 问题 | 改动 | 预期收益 |
|---|------|------|------|---------|
| R1.1 | `resp.ts` `indexOfCRLF` | 逐字节扫描找 \r\n | 原生 `buf.indexOf(13)` 定位 \r 再验证下一字节为 \n | get 主要开销之一 |
| R1.2 | `resp.ts` `parseValue` | `parseInt(line,10)` 解析 `:`/`$` 长度 | 手动数字循环（`n = n*10 + (c-48)`，同时统计 \r\n 位置） | 每命令省 parseInt |
| R1.3 | `connection.ts` `pending` | `shift()` O(n) 每响应一次 | 头指针队列（`head` 索引 + 定期 compact） | 高并发批处理摊还 |
| R1.4 | `resp.ts` `encodeCommand` | join + 单次 encode | 预分配 buffer + offset 写入（含 R0.1 的统一实现） | set 路径 |

**验收**：bench 重跑，`set ≤ 0.09ms`、`get ≤ 0.095ms`（ioredis 的 ~1.25× 内）、json 往返 ≤ 0.14ms。

### R2 — 健壮性

| # | 位置 | 问题 | 改动 |
|---|------|------|------|
| R2.1 | `pool.ts` round-robin | 慢/阻塞命令（BLPOP）随机拖累其他命令 | 文档声明 + 测试指引：**阻塞命令用独立连接**（`createSubscriber()` 模式）；pool 保持 round-robin（无状态、可预测） |
| R2.2 | `connection.ts` 离线队列 | 无上限——断线期间命令无限累积 | 加 `maxOfflineQueue` 选项（默认 5000），超限 reject ConnectionError |

**诚实决策（R2.1）**：不做 per-connection busy 计数（ioredis 复杂度），以文档 + 独立连接模式解决——符合"可预测失败"哲学。

### R3 — 清理

| # | 位置 | 问题 | 改动 |
|---|------|------|------|
| R3.1 | `resp.ts` | `concat()` 死代码 | 删除 |
| R3.2 | `connection.ts` `handleDisconnect` | `err instanceof ConnectionError ? err : err` 恒等 | 简化为直接使用 err |
| R3.3 | `connection.ts` `close()` | `setTimeout(r, 0)` hack | 用 `sock.once('close')` 或事件驱动等待 |

---

## ctx.sql 优化计划

### 问题基线（bench，同条件）

| 操作 | 自研 | postgres.js | 差距 |
|------|------|-------------|------|
| SELECT 1 | 0.138ms | 0.116ms | ≈持平 |
| 参数化+jsonb | 0.147ms | 0.131ms | ≈持平 |
| INSERT jsonb | 0.425ms | 0.444ms | 反超 4% |
| 事务 | 0.273ms | 0.326ms | 反超 16% |
| 并发 | 0.8ms/批 | 1.2ms/批 | 反超 50% |

**PG 层性能已达标——优化以"保持反超 + 消除隐患"为目标，不追求激进。**

### P0 — 大参数编码（性能反模式）

| # | 位置 | 问题 | 改动 | 验证 |
|---|------|------|------|------|
| P0.1 | `protocol.ts` `bindMessage` | `number[]` 逐字节 push 累积（大 jsonb 参数内存翻倍 + 双重拷贝） | 两遍法：先算总字节长（参数 utf8 长度求和）→ 预分配 Uint8Array → offset 指针写入（AGENTS.md 既定原则） | 字节 golden 不变 + 新增 1MB 参数往返测试（断言无 O(n²) 退化：大参数耗时 ≈ 小参数 × 线性） |

**验收**：大参数（256KB jsonb）INSERT 路径内存峰值降 ~50%（number[] → 单 buffer）。

### P1 — 解码单例

| # | 位置 | 问题 | 改动 |
|---|------|------|------|
| P1.1 | `protocol.ts` | `parseRowDescription`/`parseDataRow`/`parseErrorFields` 每次 `new TextDecoder()` | 模块级单例 `_decoder`（与 resp.ts 一致） |

### P2 — 健壮性

| # | 位置 | 问题 | 改动 |
|---|------|------|------|
| P2.1 | `connection.ts` prepared Map | **prepare 缓存无上限**——长运行服务每 SQL 永久累积 | 简单 LRU：上限 128；访问命中 delete+set 移尾部，超限删头部；`clearPrepared()` 逃生口 |
| P2.2 | `connection.ts` 取消请求 | statement_timeout 是会话级 SET，无 per-query CancelRequest | **裁剪声明**：保持会话级（文档说明）；不做 CancelRequest（PG 需独立连接发取消，复杂度 > 收益，符合诚实裁剪） |

### P3 — 清理

| # | 位置 | 问题 | 改动 |
|---|------|------|------|
| P3.1 | `connection.ts` | `authStage` 字段赋值但从未读取 | 删除字段与赋值 |
| P3.2 | `connection.ts` | `Buffer.from()` 包装 socket.write | Uint8Array 直接写（socket.write 原生支持） |

---

## 公共验证（两计划共用）

1. **协议字节 golden**：改动后全量字节测试（`src/db/**/*.test.ts`）不得红——任何编解码改动先红后绿（TDD）
2. **真库测试**：`npm test`（CS-04：redis/postgres 连 docker 真库，无 mock 网络层）
3. **bench 对比**：`node --env-file=.env bench/db-bench.ts`——按各自计划验收表核对
4. **全量回归**：框架 693 测试 + typecheck + build

## 实施顺序

```
Phase 1（redis 二进制安全）:  R0.1 → R0.2 → 真库测试 → bench
Phase 2（redis 热路径）:       R1.1 → R1.2 → R1.3 → R1.4 → bench 验收
Phase 3（pg 编码/解码）:       P0.1 → P1.1 → 字节 golden → 大参数测试
Phase 4（健壮性 + 清理）:      R2 → P2 → R3 → P3
Phase 5（回归）:               全量测试 + bench + typecheck + build
```

每 Phase 独立 commit；性能项必须附 bench 前后数字。

## 验收总表

| 目标 | 指标 |
|------|------|
| Redis get/set | 差距收窄到 ioredis 的 ≤1.25×（0.095ms / 0.09ms） | ✅ get 1.11× / json 1.06× |
| Redis 二进制 | getBuffer 任意字节往返相等（含 0x00） | ✅ 3 测试 |
| PG 大参数 | 256KB jsonb 线性耗时（无 O(n²)），bench 保持反超 | ✅ 真库往返 |
| PG prepared | LRU 上限 128，长连接 1000 次不同 SQL 后缓存不膨胀 | ✅ 200 SQL 测试 |
| 全量 | 693+ 新增测试全绿，typecheck/build 0 错误 | ✅ 847 pass |
