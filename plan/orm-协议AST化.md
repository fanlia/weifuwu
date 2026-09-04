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

## 验收标准

```
□ src+test 全库零 sql 模板 / unsafe / parser 引用（audit-orm 双范围 0）
□ 平台非 ui 46 文件 309 绿 + ui 45 文件 155 绿（零 docker）
□ db 域 126 绿（无 parser 依赖）+ root tsc 0
□ 计划收尾：AST 协议层规则并入 docs/server.md 数据库章节
```
