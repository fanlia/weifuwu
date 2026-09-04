# shape+operator 数据层终局（2026-09）

> 一句话：以 **shape（zod 超集）单源** + **operator（每库算子包同契约）** 重构
> weifuwu 数据层——查询面彻底 DSL 化（语义单源·类型安全·注入免疫）·测试面
> MemoryOrm（DSL→MemorySql AST·无 wire 无 parser）·GraphQL 一键生成（接入
> 框架内置链路）。动机：平台 157 处字符串 SQL（builder 0 处）·47 处 ctx.appId
> 手写过滤·MemoryPostgresServer 解析面无穷补丁（判负"完全支持 PG"）·
> drizzle+zod 行业验证（对照：Prisma codegen 依赖链·drizzle 形状与库耦合）。

## 现状探针（先读数——锚点）

- platform：`pg.sql\`\`` 模板 **157 处**（builder 0）·schema.sql **410 行**（23 表·
  DO 块 1·ENUM 1·pgvector 1·REFERENCES ~8·部分索引 2）·`ctx.appId` 手写过滤 **47 处**
- 平台查询复杂度：无 CTE/窗口/递归/DISTINCT ON（JOIN 70·RETURNING 46·FILTER 20·
  ILIKE 2·`::int` 80·`::vector` 10·ON CONFLICT 3·jsonb 5）
- MemoryPostgresServer/MemorySql 支持面探针：W1 前置 9 处 FAIL → 补齐后 **9/9 PASS**
  （DO 块/EXTENSION/CREATE TYPE/vector 列/REFERENCES/部分索引/ivfflat 索引/ALTER/
  vector 值）·memory-semantics 契约 **15/15**
- 框架内置 GraphQL：`graphql ^16` + 自研 makeExecutableSchema（嵌套 resolver）+
  createGraphqlRouter（maxDepth/timeout/graphiql/context）·契约 ✓
- 框架查询面现状：builder 79 处（user 系统 41）·字符串 10 处**全为 migrate DDL**

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | **MemoryPostgresServer 平台面**（已完成：DO 块/EXTENSION/CREATE TYPE/`::`cast/DELETE RETURNING/多语句拆分/VALUES 逗号感知）——剩余：wire 端到端契约固化 | 契约：schema.sql 整文件跑通（wire）+ 平台查询面采样（count FILTER/RETURNING/JOIN/子查询/::cast）——探针 9/9 → 进测试套件 |
| W2 | **shape 基座**（src/server/db/shape.ts）：zod 超集核心（uuid/text/int/float/bool/enum/datetime/json/vector/array/object/union/discriminatedUnion）+ db 元数据挂 meta（primaryKey/unique/notNull/default/defaultRandom/defaultNow/references/softDelete 标记）+ 变体派生（insert/select/updateSchema） | 契约 ~18：形状解析校验/元数据读取/变体派生/多态判别联合 · tsc 0 |
| W3 | **operator 契约 + memory 算子包**：Contract（ColRef/算子树 26 核心：eq ne gt gte lt lte inArray notInArray between like ilike contains startsWith endsWith isNull isNotNull and or not regex）+ JSON 算子（hasKey 等）· 类型收窄（ColRef<T>/算子×列类型编译期白名单）· memory 算子包 = DSL→MemorySql AST 翻译（复用执行引擎） | 契约：算子树执行终态断言（内存表）· 编译期类型断言（非法列/非法类型/非法算子组合——tsd 风格文件）· fuzz 对账（DSL 轨 vs 字符串轨内存执行等价——≥200 对） |
| W4 | **平台试点模块（departments 端到端）**：shape 定义 + 查询/写入 DSL 化 + API 校验 shape.parse + 租户 scope 试点（ctx.appId 注入自动化） | departments 全部测试绿（现有 UI 不破）+ DSL 契约增量·旧 SQL 面同路保留 |
| W5 | **pg 算子包（AST→SQL 生成）**：参数化 $n·方言注意点（RETURNING/upsert/ILIKE）=参照世界对账 | fuzz 对账：memory 参照世界 vs PG 模拟世界终态等价（≥200 对·≥5 种子）·server 层全绿 |
| W6 | **gqlFromShape**（纯函数：shape→SDL 字符串——类型/枚举/Filter 输入/sort/分页/Query+Mutation·resolver 桥=filter 参数→算子树——复用 W3）接内置链路（makeExecutableSchema+createGraphqlRouter） | 契约：SDL 快照断言 + resolver 执行（graphql.test 面）· 深度限制/超时走内置 |
| W7 | **平台全量迁移**（波次化：survey→agents→messages→审计→监控…每模块 DSL 化+测试绿）· API 校验 shape 化（手写 if 消亡）· 列表查询 filter 化（ILIKE 搜索面收编）· 租户 scope/软删钩子注册 | 平台 463 全绿（测试代码不改——双跑：真栈/Memory）·手写 if 校验清零（盘点核对） |
| W8 | **全量回归 + 归档** | 契约+场景+showcase+server+shared+平台 全绿·tsc 0·audit 七线·计划归档 |

## 判负记录（可被新论证推翻）

- **DDL/迁移面保留 SQL**：判负 DSL 化（drizzle-kit 级迁移引擎——22 表 DDL 有界且不随
  查询增长——迁移=运维面）。推翻条件：schema 变更频率成为痛点（探针实证）。
- **"完全支持 PG SQL"**：判负等价重写 PG 引擎（pg_mem 多年未达·pg_regress 1 万+ 断言
  无内存实现跑过）——替代：收敛面（我们代码的 SQL 集——波次迭代·诊断边界明确报错）。
- **GraphQL 执行器自研（原判负·已撤销）**：框架已内置 graphql^16+makeExecutableSchema
  +createGraphqlRouter——生成器=纯函数（SDL+resolver 描述）——输出即内置输入——集成零成本。
- **Mongo/SQLite 算子包**：需求驱动——当前无需求不预建（契约预留·实现面=算子包注册）。
- **zod 全功能面**：核心子集裁剪（async/深层 transform 不追——应用层校验面够）。
- **drizzle 级投影递归推断**：裁剪——投影=形状 API（Agent.pick(...)——类型自动·零体操）。

## 执行实录（边做边记）

- W1 探针重定位：初判缺口 9 → 多语句拆分修复后实际 1（多语句是探针写法）——
  真实缺口=DO 块/EXTENSION/CREATE TYPE/`::`cast/DELETE RETURNING/VALUES 逗号——全部补齐。
- W1 完成态：sql-parser.ts（DO 预截取/CREATE TYPE/EXTENSION/cast/DELETE RETURNING/
  splitCommas/CHECK 表级约束/JOIN on+投影别名/stripAlias 前缀匹配/INTERVAL 毫秒偏移/
  聚合投影 COUNT FILTER）· memory-sql.ts（splitStatements·enums·JOIN 执行已备/修正
  别名断链）· query.ts（DdlQuery 扩展·aggregate.filter）——探针 9/9 · memory-semantics
  15/15 · **wire 契约 memory-pg-platform.test.ts 7/7（schema 整文件+平台查询面采样）**·
  server 761/761 · tsc 0。
- W1 抓包实录（根因链）：sql(圆括号调用把模板当字符串（strings[0]=首字符）→ 破案浪费
  半天——一切探针/日志先验字符串形态；JOIN 两坑（on 剥别名/stripAlias 无条件剥——
  前缀匹配才剥）；断言错（插入行无 state——active=0 语义正确）。
- 判负补记：WHERE 子查询（平台业务 0 处——仅迁移 DO 块——迁移面真栈）——不补。

## W2 执行实录（shape 基座）

- `src/shared/zod.ts`：自研 zod 子集（ZodType 家族 14 类·meta 挂载·infer/parse/safeParse·
  discriminatedUnion 多态）·`src/server/db/shape.ts`（shape 包装：table/fields/dbFields/pkField/
  insertSchema（省略 auto 列——default random/now）/updateSchema（全 optional）/f 快捷装饰）
- 契约 zod.test.ts 12/12（基础校验/错误路径/类型收窄 tsd 式/meta/变体/多态/装饰）
- 过程坑：node strip-only 不支持 parameter properties（批量改字段+赋值）·ZodError 忘赋值
  issues·z.uuid 工厂缺·isAuto 条件（default 即 auto——不论 pk）·import 路径
- server 761/761 · 契约 433/433 · tsc 0

## W3 执行实录（operator 契约 + memory 算子包）

- `src/server/db/ops.ts`：算子组（drizzle 式）——值算子（eq/ne/gt/gte/lt/lte/inArray/
  notInArray/between）·字符串（like/ilike/contains/startsWith/endsWith——escapeLike
  %/_ 转义）·空值（isNull/isNotNull）·组合（and/or/not——单键取反/复合 NOT 判负）
- 设计定案：算子产 WhereExpr（复用 MemorySql 已验证执行面——零新执行代码）·
  ColRef<T> phantom 类型收窄（eq 值绑定列类型·ilike 仅 string 列）·形状驱动列引用
  表（cols()/ShapeCols<S>）
- 配套修：likeToRegExp 支持 \% / \_ 转义（PG ESCAPE 语义——escapeLike 依赖）；
  query-builder select('*') → cols=undefined（全列投影修复——既有 bug）
- fuzz 对账：DSL（ops→WhereExpr）vs 字符串轨（SQL→parser）同 MemSql 引擎·
  5 种子×200 对=1000 对终态等价 ✓（op=7 between 参数化传参漏项曾误报——测试修）
- server 768/768（+7）· 契约 433 · tsc 0

## W4 执行实录（departments 试点——平台真实表端到端）

- 试点 `src/server/db/departments-pilot.test.ts` 8/8（wire 全链路：shape 对准
  schema.sql departments 真实表 → ops → compileWhere 参数化 → postgres client →
  MemoryPostgresServer → MemorySql——与平台真库路径同构）
- 覆盖：shape 元数据对准 · insert 校验/默认省略 · 租户 scope（跨租户不可见）·
  列表（eq+ilike+and+orderBy/limit）· update 部分切换 · 多对多 join（eqCol 列对列）·
  escapeLike round-trip（%/_ 字面量）· inArray/and/or 组合
- **真实 bug 修复链（试点暴露——引擎级）**：
  1. 内存引擎缺**字面量 DEFAULT 注入**（DEFAULT FALSE/0/'x'——列缺省语义对齐真库）
     ——ColumnDef.defaultVal + TableMeta.defaultVals（含快照/恢复）
  2. parseDefaultLiteral（DEFAULT 字面量保守解析——不碰 JSON/表达式——evalValue 炸点）
  3. **LIMIT 参数化**（平台面普遍 LIMIT $n——parser 只认数字）
  4. **UPDATE SET 参数类型推断**（paramTypesFromSql——布尔/数字参数 wire 字符串化
     →行值污染——SET+WHERE 双列回退）
  5. shape 变体 **parse 填充 undefined 键**（部分更新把全键 SET NULL 破坏行）——
     cleanUndefined transform（insert/update 变体内化清洗）
  6. query-builder select('*') 全列投影（W3 发现同修）
- server 776/776 · 契约 433/433 · 平台 449+14skip · tsc 0

## W5 执行实录（pg 算子包审计——萎缩为对账验证）

- 判负成立：pg 算子包无需新建（compileWhere 全算子覆盖——W4 试点隐式验证）
- 新增 compile-fuzz.test.ts 2/2：compileQuery 编译 SQL 回解析（parallel path）
  vs AST 直执行——1000 对终态等价（5 种子×200 对）+ isNull/contains 转义 round-trip
- fuzz 抓到真 bug：**BETWEEN 编译回解析断裂**（WHERE 顶层 AND 拆分把
  `BETWEEN $1 AND $2` 拆散）——修：normalizeBetween（col BETWEEN lo AND hi →
  (col >= lo AND col <= hi) 括号组正规化——顶层分割保护）
- server 778/778 · 契约 433/433 · tsc 0

## 验收标准

```
□ 探针数据齐全（上表锚点——量子化）
□ 每波次独立验收（红/绿可判定）
□ 判负记录写了为什么
□ 执行实录记录结果数字
□ 全量回归门绿（契约+场景+showcase+server+shared+平台 · tsc 0 · audit 七线）
□ 规则并入 docs/server.md + AGENTS.md（收尾时）
```
