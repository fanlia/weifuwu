# orm 覆盖补全——理论矩阵 × 现实场景交叉（2027-xx）

> 一句话目标：**ORM 已经覆盖了什么、还缺什么——用「理论能力面 × 平台实际用法」
> 交叉定位缺口**，按价值/成本排序收口。探针实证（2027-xx /tmp/orm-coverage-probe
> + /tmp/orm-gap2.py）：平台 src 66 文件全部 orm 调用面统计。

## 探针实录（现实场景面——锚点）

| 模式 | 文件数（平台 src） | 备注 |
| --- | --- | --- |
| update/set | 48 | 大量使用 |
| limit/offset | 33 | **分页无 count 双查**（audit.ts 手写 limit+offset——列表总数拿不到）|
| delete/where | 32 | 防护面正常 |
| insert+returning | 22 | |
| onConflict（upsert）| 5 | 使用面健康 |
| groupBy | 3 | 聚合正常 |
| vectorScore | 5 | pgvector 面 |
| merge 编码（__inc/__now/__interval/__colRef/__jsonbAppend/__monthStart）| 各 4-5 | 表达式面全在用 |
| **transaction** | **0** | **16 个多写文件无一处事务**——原子性无保障 |
| **paginate（count+list 双查）** | **0** | 列表接口手写两查或只 limit |
| **tenant（withCtx 租户 scope）** | **0** | **45 处手写 `app_id: { eq: ... }` 过滤**（漏写 = 越权）|
| softDelete | 0 | 平台无软删需求（sandbox 手动 terminated_at 已覆盖）|
| jsonb 键值查询 | 0 | 无需求 |
| sqlEscape（rawSql/unsafe）| 0 | **零逃生舱**——协议 AST 面闭环 ✓ |
| z.enum 列 | 2 文件 | 无 as const → `ZodEnum<[string,...]>` 坍缩（W2/W3 已登记）|
| `(row) as any` | 10 | 类型面残余（W2/W3 后回潮面——非 orm 主路径）|

## 理论覆盖矩阵（ORM 应有能力 → 现状）

| 能力 | 框架面 | 平台使用 | 缺口判定 |
| --- | --- | --- | --- |
| CRUD/JOIN/聚合/分组/算子/upsert | ✅ | 充分 | 无缺口 |
| 错误码映射（23505→409）| ✅ | 使用 | 无缺口 |
| **租户自动 scope** | ✅ `withCtx/OrmTenant` 已实现（orm.ts:69——注释写明「平台 47 处手写 app_id 过滤收口」）| ❌ **0 使用**——postgres()/memory 中间件**从未接线** tenant 配置；45 处手写 where | **大缺口**（安全语义 + 样板）|
| **事务** | ✅ `transaction(fn(tx: Orm))` + tx.table 派生（契约测试已有）| ❌ **0 使用**——16 多写文件（survey 提交/agent 创建/消息链/webhook）| **中缺口**（原子性）|
| **enum 列类型** | ⚠️ 坍缩（ZodEnum<[string,string]>）| 消费端字面量检查失效 | **中缺口**（W2/W3 登记的修复面）|
| **分页** | ✅ paginate（count+list 双查）已有契约 | ❌ 手写 limit/offset + 无 count | 小缺口（体验）|
| 子查询 in/exists | ✅ 面已存在（query.ts:193）| exists 1 | 无缺口（不扩）|
| 软删 | meta 面 | 不需要 | 判负（无需求）|
| jsonb 值类型化 | 判负（ZodJson=unknown）| 无误用实证 | **维持判负**（推翻条件：jsonb 误用成真 bug 源）|
| 乐观锁/version | 无 | versions 是快照表 | 判负（无并发冲突实证）|
| 审计自动字段 | 无 | audit_logs 手动写 | 判负（手动面已覆盖）|

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | **租户 scope 接线**（安全第一）：框架 postgres()/memory 中间件 options 支持 `tenant: { field, valueCtx }`——请求级 `ctx.orm = orm.withCtx(ctx)`；契约测试（scope 自动注入 select/insert/update/delete——显式 where 覆盖? 语义探针定——**默认并集**：显式传 app_id 时保留显式（不双写冲突））；平台 server.ts 接线（field: 'app_id' · valueCtx: ctx.appId）+ 45 处手写 where 试点删（先 5-8 处核心：messages/chat/agents）| 契约绿 · 平台试点 + 越权漏写防护语义 · 全量回归 |
| W2 | **事务面平台收口**：试点 2-3 个真多写场景（survey 提交（3 写）/agent 创建/sandbox 重建链）——`tx.table(name)` 派生复用（registry——免 shapeDef）；契约补强（memory no-op 面标注 + 真库面已有）| 平台试点原子化 · 契约绿 |
| W3 | **enum 类型收窄**（登记修复面）：z.enum 签名推断增强（`readonly string[]` 元组保序——不破调用方）或 as const 纪律——契约 tsd 断言（eq(type,'robot') 红）；平台 enum 列消费端字面量回归 | typecheck:tests 绿 · 平台 tsc 0 |
| W4 | **分页收口 + 文档 + 回归**：audit/routes 列表试点 paginate（count 双查）；docs/server.md §5.3 tenant/transaction/paginate 用法；全量回归门 | 五域+七线+平台 451+155 · tsc 双 0 |

## 判负记录（可被新论证推翻）

- **jsonb 值类型化**：维持前判负——无读写误用 bug 实证（推翻条件：出现 jsonb 误用 runtime bug 案例）
- **软删统一面**：平台无需求（sandbox 手动 terminated_at 模式已覆盖；terminated = 逻辑删）
- **乐观锁/version 并发控制**：无并发写冲突实证（versions 快照是审计面非并发面）——推翻条件：双编辑覆盖事故
- **in/子查询 builder 面扩展**：框架 exists/in 面已存在——不扩疆
- **审计字段自动填充（created_by）**：手动面已覆盖 audit_logs——收益低

## 探针记录（方法论）

- `/tmp/orm-coverage-probe.mjs`——文件级模式覆盖统计（48 update/33 limit/32 delete/22 returning）
- `/tmp/orm-gap2.py`——平台 src 66 文件精确计数（transaction 0 · paginate 0 · tenant 0 · appId where 45 · escape 0）
- 关键实证：**withCtx 面注释承认缺口**（「平台 47 处手写 app_id 过滤收口」——写而未接线）；postgres() 构造 `createOrm(adapter, undefined)`（client.ts:66——无 tenant）；平台 server.ts 中间件栈无 tenant 配置
