# orm-协议AST化（2026-09）

> 一句话目标：**协议层从 SQL 文本改为 ORM AST**——删 sql-parser 全链
> （parser/unsafe/tag/MemoryPostgresServer 线协议替身）——DB 操作**封闭、可控、
> 健壮**。
>
> 动机（消费证据）：sql-parser 967 行例外不封闭——CHECK 列内/LEFT JOIN/
> ALTER DEFAULT/DO 块/多列 ON CONFLICT——今天全量回归又抓「列内 CHECK 崩」
> （01-auth——`role TEXT NOT NULL CHECK (...)`——`期望 ) 得到 CHECK`）。
> parser 是 bug **类**（修一个出下一个）；orm 的目标 = 让 DB 操作封闭。
> 策略前端同构（vdom 13 命令 NDJSON）：「开放文本面 → 封闭 AST 面——测试与
> 实现共享同一协议」的前端复刻（前端契约层零浏览器 ↔ DB 契约层零 wire）。

## 现状探针（2026-09-04 读数）

| 面 | 读数 | 备注 |
| --- | --- | --- |
| 平台测试 SQL 面 | **28 文件 · 126 调用点**（INSERT 27/SELECT 13/UPDATE 6/DELETE 6/CREATE 3/DROP 1）| 播种+直连断言 |
| 平台 schema.sql 播种 | 8 文件 | `unsafe(schema)`——事实源已卸任（shapes-alignment 已切声明式）|
| 平台业务 whereRaw | 6 处 | 全 `DATE_TRUNC('month', NOW())` 月面——`ops.monthStart()` 可替 |
| 平台 `/api/test/sql` | 1 端点 | ui testDb 代理播种面（WF_TEST_HOOKS）|
| 框架 parser 契约 | query-language.test 364 行 / compile-fuzz 1000 对（compile→parse→exec round-trip）| 随 parser 消亡（git 历史承接）|
| 协议层 | postgres-server.ts 676 行 + servers.test 198 行 + client.test（PgPool idle_timeout）+ memory-pg-platform 86 行 | wire 金丝雀——随文本面消亡 |
| 框架测试 unsafe 播种 | 13 文件 | 重写 AST 面 |
| 业务 SQL 模板 | **350→0**（audit-orm 0）| 测试面是最后 SQL 残留 |
| db 域基线 | 126 tests · 125 pass（1 skip）| 回归门锚点 |

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | **DDL AST 化**：`compileSchemaDdl(mod): DdlQuery[]` + `ddlToSql(stmts)`（真库单向输出）；memory `migrateModule` 直 `executeDdl`（零 parse）；defaultVals 编码面（`{__now}`）统一；等价契约（`ddlToSql(compileSchemaDdl(m))` 与旧字符串面逐字相等）| db 域 126 绿 + 平台 24 表建库绿 + 等价契约绿 |
| W2 | **平台播种/断言 AST 化**：126 点 → orm.query；8 文件 schema.sql → `migrateModule(AGENT_PLATFORM_SCHEMA)`；6 whereRaw → `monthStart()` 算子；v2 ALTER 字符串 → 扩展列声明模块；`/api/test/orm`（Query JSON）替代 `/api/test/sql` + ui testDb 切 AST | 平台非 ui 309 绿 + ui 155 绿；平台 src+test SQL 面计数 0 |
| W3 | **框架 SQL 文本面删净**：`mw.sql` 删、MemorySql 文本壳删（tag/unsafe）、`sql-parser.ts` 删、`whereRaw` 删（builder+exec）、`MemoryPostgresServer`/postgres-server 删、契约处置（servers.test 删 / client.test docker-gated / memory-pg-platform 改 compileQuery SQL 形状静态契约 / query-language+compile-fuzz 重写 AST 面对账）| 全库 grep parser/unsafe/tag/sql 模板零引用；db 域绿（无 parser 依赖）|
| W4 | **审计 + 全量回归 + 收尾**：audit-orm 升级 `src+test` 双范围 0；docs/server.md 数据库章节生效规则（AST 协议层）；plan 收尾 | audit 0 + 五域全绿 + root tsc 0 + 计划归档 |

## 判负记录

- **不做「SQL 面契约保留」**：parser 删除后无面可测——SQL 面契约随面消亡
  （契约资产 = git 历史承接——历史 bug 实录仍是财富）
- **不做「MemoryPostgresServer 改 AST 载荷协议」**：业务零 PgPool 直连（全走
  orm）——替身无消费者——判负（推翻条件：未来出现「必须走 PG v3 客户端
  的集成面」测试）
- **fuzz 对账降级**（诚实标注）：parser 时代 compile→parse→exec round-trip
  消亡——SQL 生成正确性改**静态契约**（compileQuery/ddlToSql 字符串形状
  断言——封闭单向输出）+ 真库验证保留 docker-gated 域
- **Redis 侧保留**：`MemoryRedisServer`（RESP）命令面本身封闭、无 parser——
  不在本计划范围（redis 无 orm——命令面即协议）
- **不做 whereRaw 保留**：6 处月统计面全部 `ops.monthStart()` 覆盖——抽象
  坍塌（推翻条件：出现无法算子表达且非月面 whereRaw 场景——判负登记）

## 执行实录

（边做边记——探针重定位/波次结果/回归数字）

- W1 探针：`compileSchemaDDL` 消费者 = client.ts ×2 + shapes-alignment.test ×1
  （事实源读法）——W1 全切后 compileSchemaDDL 字符串面删除
- W2 探针：126 点分布（INSERT 27/SELECT 13/UPDATE 6/DELETE 6/CREATE 3/DROP 1）
  ——schema.sql 8 文件——whereRaw 6 处（全 month 面——monthStart 覆盖）
- W2 收尾实录（本批）：
  - **13 ui 测试文件**播种/断言 → `buildQuery().toQuery()` AST 面（`testDb.query`
    → `/api/test/orm`——Query JSON 传输——协议层 = AST）；`shared.ts` SQL 网关面
    删净（seedSql/send/unsafe/tag/array——端点已删零引用——`/api/test/sql` 全库 0）
  - **6 whereRaw 月面 → `ops.monthStart()`**（plan/chat/quota-alert/agents/stats×2——
    admin.ts 先例同款 `{ gte: ops.monthStart() }`）——平台 src whereRaw 清零
  - **memory-sql IF NOT EXISTS 补列语义**：已存在表只补缺列（不覆盖列集）——
    跨模块扩展（weifuwu-users 建表 + 平台 APP_EXT 补列）对齐真库
  - **框架协议面暴露**：`orm.execute(q)` + `buildQuery()/toQuery()`（Query 纯数据可
    序列化——构建无执行面 throw 守卫）
  - 回归数字：**平台非 ui 465 绿（0 fail · 14 skip=docker 专项）· ui 155/155 绿**
    （首跑 6 fail 实证为残留进程级联污染——杀净后全绿）· 平台/框架 tsc 0
  - **顺带修复（预存缺陷——HEAD 即存在）**：
    - `orm.test.ts` wire 面模块级**挂起**（`pool.runMigration` 前缺 `pool.migrate()`
      ——`_weifuwu_migrations` 不存在 → SELECT 42P01——memory 面 isMigrated 有容错、
      wire 面无）——补前置后 23/23
    - `D1 复合冲突目标` fixture 走文本面：parser 对表级 `UNIQUE (a,b)` **跳读丢弃**
      （列 579-586 skip 分支——parseColumnDef 的表级分支是死代码）——复合 groups
      永不落地——改 `compileSchemaDdl`（uniques 组）AST 面——db 域 **236/236**
  - 留底：`scripts/seed.mjs`（dev 工具——非 src+test 面）随 W3 `mw.sql` 删除一并
    迁移（unsafe 2 处——`npm run seed` 播种面）
- W3 探针（读数——消费者清册）：
  - `unsafe` 引用 **146 行 / 14 文件**——测试面 130（memory-semantics 51 /
    user-multitenant 21 / query-language 16 / orm.test 14 / compile-fuzz 12 /
    ops.test 10 / user.test 3 / messager 1 / schema-ast 1）；src 面 15（client.ts
    mw.sql 10 + memory-sql 3 + postgres-server 1）+ seed.mjs 2 + showcase demo 1
  - parser 引用：memory-sql（文本壳）+ 3 测试文件（deadlock-fuzz / ops.test /
    query-language——全是 parser 契约——随面消亡或重写 AST 面对账）
  - whereRaw：query.ts（接口+compile）/ query-builder（3 方法）/ memory-sql（exec）/
    orm.ts（CHAIN 清单）——全链路删（4 文件联动）；平台 src 已 0（W2 清）
  - MemoryPostgresServer：postgres-server.ts + server.ts/index.ts 导出 + 3 测试
    （servers / memory-pg-platform / departments-pilot / orm.test wire 段）——
    wire 面删后 orm.test/departments-pilot 转 memory 直执行（判负已定）
  - W3 断言方向：db 域测试 fixture 全切 AST 面（mem.executeDdl/executeQuery + orm.query）
    ——文本面契约（query-language/compile-fuzz/servers）重写或删除
- **W3a 完成（whereRaw 全链删——已提交 d6f7441e）**：
  - 删除：builder 3 方法（query-builder）/ 3 接口声明 / orm CHAIN 项 / memory
    resolveRawWhere + matchWhereExpr raw 分支（parseWhereToExpr 依赖面）/ compileWhere
    顶层+算子值 raw 分支 / mergeWhere raw 检查 / WhereField 联合剔除 RawSql
  - 保留：RawSql 数据面（merge 值/select 列/join on——interpRaw 无 parser 依赖）
  - 判负生效：推翻条件「无法算子表达且非月面」未出现（平台 6 处全 monthStart 覆盖）
  - 测试处置：query-language 3 处（raw 编译删·双 raw AND 改结构化 where 合并·
    时间窗改 nowAgo）/ memory-semantics 4 处（E2 三测改 monthStart/结构化·
    __raw 豁免删）——删除 3 测（raw 编译/坏 raw/__raw 豁免）
  - 数字：db 域 233/233 · 平台非 ui 451 绿（14 skip docker）· 全库 `.whereRaw(` 零引用
    · tsc 0
- **W3b 完成（MemoryPostgresServer 消亡——已提交）**：
  - 删除：postgres-server.ts（676 行）/ servers.test（198）/ test-servers（41——零消费者）
    / server.ts+index.ts 导出
  - 契约处置：connection.test + client.test（2 describe）→ 真库 gate（RUN_DOCKER_TESTS=1
    + DATABASE_URL——与 sandbox 同口径）；protocol.test 保留（纯编解码单元——零服务器）
  - 重写：memory-pg-platform → memory 引擎 + compileQuery SQL 形状静态契约（FILTER
    参数序先于 WHERE——诚实锁定）；departments-pilot / gql-from-shape / orm.test wire
    段 → MemorySql.applySchema + createMemoryOrm 直执；orm.test 2 wire 测删 1 换内存
  - 数字：src/server 全域 **800/800** · db 域 209/209 · tsc 0
  - 判负兑现：wire 金丝雀随文本面消亡（PgPool client 协议契约转真库 gate——推翻
    条件未触发：业务零 PgPool 直连确证）

## 验收标准

```
□ src+test 全库零 sql 模板 / unsafe / parser 引用（audit-orm 双范围 0）
□ 平台非 ui 46 文件 309 绿 + ui 45 文件 155 绿（零 docker）
□ db 域 126 绿（无 parser 依赖）+ root tsc 0
□ 计划收尾：AST 协议层规则并入 docs/server.md 数据库章节
```
