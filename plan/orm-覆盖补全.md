# orm 覆盖补全——理论矩阵 × 现实场景交叉（2027-xx）

> 一句话目标：**ORM 已经覆盖了什么、还缺什么——用「理论能力面 × 平台实际用法」
> 交叉定位缺口**，按价值/成本排序收口。探针实证（2027-xx /tmp/orm-coverage-probe
> + /tmp/orm-gap2.py）：平台 src 66 文件全部 orm 调用面统计。

## 确定性原则（2027-xx 用户定调——本计划核心标准）

> **shape 层面要确定性；operator、adapter 同样——行为必须一致、透明。**

- **一致**：同一声明/同一算子，在任何 adapter（memory/真库）、任何路径
  （查询/写入/解码/默认值）行为等价——**不一致即 bug，修复而非登记**
- **透明**：无法一致的（事务 no-op/FK 无约束/vectorScore 浮点精度）显式声明
  （文档+契约标注）；**声明了但无行为 = 不透明 = 必须定案**（实现或移除）
- **单源**：同一逻辑列的声明只允许一处（禁止 DDL 面/形状面双写——enum/vector
  是现有双源违规）
- **审计机制化**：确定性审计进契约（fuzz 盲区实证——`eq:null` 双端分裂
  1310 对 fuzz 未覆盖——生成器不产 null 等值）——盲区补测试

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

## 三层确定性审计（2027-xx 系统排查——不一致/不透明点清单）

### shape 层
| # | 点 | 现状 | 判定 |
| --- | --- | --- | --- |
| S1 | enum 双路径 | zodTypeOf('enum')→TEXT vs columnTypes 覆盖→PG enum（tables.ts enums+columnTypes+shapes z.enum 三处手写）| **违规（单源）**——加枚举值改 3 处 |
| S2 | vector 声明面 | embedding z.json（JSONB 语义）vs tables.ts columnTypes vector(1024) | **违规（双源）**——shape 无法表达 |
| S3 | softDelete meta | f.soft + meta 存在——**零行为**（builder/orm/memory 无自动过滤——grep 全库仅 shape.ts 3 处）| **不透明**——无消费者——判负移除（推翻条件：软删需求出现再实现）|
| S4 | literal/union/discriminatedUnion | zodTypeOf 抛错（显式失败——透明）| 判负（无消费者）|
| S5 | references/FK | DDL 生成 ✓（compileTableDdl）· memory 无 FK 约束（诚实差异）| 透明（文档说明）|
| S6 | 列型覆盖面 | columnTypes 仅 SchemaModule（tables.ts）——SHAPES 无承载 | S1/S2 修复面 |

### operator 层
| # | 点 | 现状 | 判定 |
| --- | --- | --- | --- |
| O1 | **`{ eq: null }`** | 真库编译 `= NULL`（**恒假**）vs memory deepEq 判 **true**——**行为分裂**（query.ts:43 注释称「已移除」但实现未改——约定靠人肉）| **违规（不一致）**——修复：编译 `IS NULL`（双端判空一致）|
| O2 | jsonb 深度等值 | 无算子键对象 → 按值 deepEq（query/memory 同注释语义）| 一致 |
| O3 | like/ilike×列类型 | 编译不拦（判负登记过——5 处全合法）| 判负维持 |
| O4 | in vs 数组歧义 | 已解除（`{ in: [...] }` 形态唯一）| 一致 |
| O5 | merge 编码 | compileMergeVal 单源 + memory 592 行同构 | 一致 |

### adapter 层
| # | 点 | 现状 | 判定 |
| --- | --- | --- | --- |
| A1 | jsonb 解码 | 真库 wire 3802→JSON.parse 恒解码 · memory 仅 columnTypes 已知表解码（观测行键面缺）→ 平台 8 处 `typeof string ? JSON.parse` 容错 | **违规（不一致）**——memory 解码补观测行键面 |
| A2 | vectorScore | 真库 `1-(col<=>vec)` · memory cosineSimilarity——数学等价 | 一致（精度差异透明）|
| A3 | 错误码 | 23505→409 双端 ✓ · 23503 仅真库（FK 无 memory 面）| 透明 |
| A4 | 事务 | memory no-op（标注 ✓）| 透明 |
| A5 | **fuzz 盲区** | 1310 对对账全绿——但生成器不产 `eq:null`/内存解码路径 → O1/A1 未被捕获 | **盲区补测**（确定性审计进 fuzz 生成器）|

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
| W3 | **确定性收口**（原则违规先修——最高优先级）：O1 `{ eq: null }` 语义统一（真库编译改 IS NULL——双端判空一致 + 契约/fuzz 生成器补 null 等值案例——盲区闭合）· A1 memory jsonb 解码补观测行键面（8 处 typeof string 容错删除）· S3 softDelete 判负移除（f.soft+meta——零行为不透明）· fuzz 生成器补确定性案例（eq null/jsonb 解码路径）| 契约绿（含新增 null 案例）· fuzz 对账含盲区 · 平台容错代码删除 |
| W4 | **enum 单源 + vector 声明面**：z.enum 自动产 EnumDecl+columnTypes（加枚举值改一处——S1 修复）· `f.vector(1024)`（Infer=number[]——embedding 类型化 + DDL 单源——S2 修复）；enum 签名推断增强（O 面——eq(type,'robot') tsd 红——W2/W3 登记修复面）| typecheck:tests 绿 · 平台 tsc 0 · DDL 单源审计 |
| W5 | **分页收口 + 文档 + 回归**：audit/routes 列表试点 paginate（count 双查）；docs/server.md §5.3 确定性契约（透明面清单：事务 no-op/FK 无 memory 面/vectorScore 精度）+ tenant/transaction/paginate 用法；全量回归门 | 五域+七线+平台 451+155 · tsc 双 0 |
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
