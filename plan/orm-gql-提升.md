# orm gql 提升——declaration-实现一致性 × 可用面补全（2027-xx）

> 一句话目标：**数据面 shape 单源 → 协议面（gql/rest）声明式暴露**——消除
> 「SDL 声明 vs resolver 实现」不一致与「声明了但无行为」不透明点，补全可用面
> （分页 total/enum filter/vector 列），平台试点（第二消费者入库）。

## 设计前提（分层纪律——架构约束）

> 正常分层：**HTTP client ←→ graphql/restful（协议面）←→ handler（业务面）←→ orm（数据面）**。
> 自动生成**不是绕过 handler**，是 **handler 默认实现的生成器**：

| 层 | 可自动派生 | 说明 |
| --- | --- | --- |
| 协议面（SDL/路由表/参数 schema） | ✅ | shape 投影——Hasura/postgraphile 路径成立 |
| handler——样板默认（解析→校验→租户→orm→响应→错误） | ✅ | 平台 45 route 的重叠部分 |
| handler——业务（权限/事务/编排/响应定制） | ❌ 手写 | 覆盖/钩子接缝在生成面之上 |

- **判别标准**（一票）：_「除了 参数→orm→响应 还有别的行为吗？」有 → 手写；没有 → 生成_
- **接缝三级**：字段/resolver 覆盖（gql）· 路由钩子 before/after（rest）· 整体手写（事务编排）
- **安全一等公民**：租户自动注入（单源）· 敏感列 fieldPolicy(hidden)——声明一次三面生效

## 命名契约（一个词一个概念——先定名再动工）

| 概念 | 命名 | 现状 |
| --- | --- | --- |
| 数据面 | `shape`（f/z） | ✓ 已有 |
| 代码内查询面 | `orm.table` / `typedQuery` | ✓ 已有 |
| GraphQL 面 | `orm.gql(Table)` + `gqlFromShape(shapeDef, opts)` | ✓ 已有 |
| RESTful 面 | `orm.rest(Table)` + `restFromShape(shapeDef, opts)` | ➕ 新（对称） |
| filter→WhereExpr 桥 | `filterToWhere(filter, shapeDef)` | ⚠️ 提取（现 gql 私有 whereFrom——三面共享一处） |
| 字段策略 | `fieldPolicy`（`hidden?: string[]` 首版——敏感列豁免） | ➕ 新 |

**规则**：① 入口对称 `orm.<协议小写词>` ② 生成器对称 `<协议>FromShape` ③ `create*` 构造对象 / `*FromShape` 派生协议面——不混用 ④ 协议短名（gql/rest）仅用于 orm 入口与生成器；HTTP 层协议中间件全称（graphql()/ui()/ws()——一层一个风格）。

## 设计目标（体验预演——波次验收心智锚）

> **「定义数据形状 → 选一个动词（table/gql/rest）→ 写你的业务」——其余（校验、分页、租户、错误、类型、文档、安全列）是框架的承诺。**
> 最大提升不是省代码，而是**信任**：schema 说的与实际行为一致（I1-I5 修完）、声明了就有行为、敏感列不可见、租户漏不了。
> 边界判别一句话：_「除了参数→orm→响应还有别的行为吗？」有 → 手写；没有 → 生成。_（学习完整个框架的时间：十分钟。）

*gqlFromShape 链路（shape→SDL+resolvers→app.graphql）与
> W1-W5 已确立的确定性原则对齐**——消除「SDL 声明 vs resolver 实现」不一致
> 与「声明了但无行为」不透明点，补全可用面（分页 total/enum filter/vector 列），
> 平台试点（第二消费者——框架能力通用性验证）。**探针实证**（2027-xx）：
> 读 gql-from-shape.ts(278) + graphql.ts(392) + make-executable-schema.ts(40)
> + 三组契约测试，逐行核对声明面/实现面/消费端。

## 现状探针（先读数——锚点）

**链路现状（全通）**：
- `orm.gql(Table)`（orm.ts——`sql: () => ormBase` 绑定）→ `gqlFromShape`
  （SDL 生成 + resolver 桥——filter→WhereExpr 复用 query.ts 契约）
  → `app.graphql()`（graphql.ts——schema/context/maxDepth/timeout/graphiql
  ——**T1-T12 契约已硬化**：深度防护/缓存/错误语义/GraphiQL）
  → `makeExecutableSchema`（自研 40 行——替代 @graphql-tools/schema；
  **@graphql-tools/* 已降为 devDep；graphql ^16 仍为运行时 dep**）
- 契约：gql-from-shape.test 7 测试（SDL 快照/insert+filter 算子/租户 scope/
  排序分页/update+delete/校验面/and 组合）+ graphql.test 13 + makeExe.test 4

**消费端（关键读数）**：
- showcase demo-backend 1 处 `app.graphql`（hello/add 手写 schema——
  **非 orm.gql 链**）
- **agent-platform 0 消费**（grep 全平台 src 无 gql/graphql 使用）
- 平台 SHAPES 仅被 gql-from-shape.test 引用（契约测试播种面）

**声明-实现不一致（逐行核对实证——提升核心依据）**：

| # | 不一致点 | 证据 | 定案 |
| --- | --- | --- | --- |
| I1 | filter `{ eq: null }` 被吞（`val === null → continue`——eq:null 不可达）| 与 O1 矛盾（`{ eq: null }` = IS NULL 双端已定）| **修**：eq:null 编译 isNull（对齐 O1 语义） |
| I2 | sort SDL 声明 `[SortInput!]`（数组）但 resolver 只取 `sort[0]` | 声明-实现不一致（声明了但无行为=不透明）| **修**：实现多字段排序链（SQL orderBy 链） |
| I3 | 租户面双源：gqlFromShape `opts.tenant` vs createOrm `tenant`（两套配置——orm.gql 绑定面不带 tenant——resolver 走 base query 无 scope）| 与「租户自动注入仅 ctxTable」不一致——**gql 面可绕过租户隔离**| **修**：orm.gql 自动派生 tenant（createOrm.tenant → gql opts.tenant——单源） |
| I4 | enum 列无可过滤面（filterable 只含 4 标量——enum 列不生成 Filter——agents.type 无法过滤）| 数据面缺口（典型查询面）| **修**：enum 列 Filter（eq/ne/in/notIn/isNull——值面 GraphQL enum） |
| I5 | vector 列从 SDL 消失（zodToGql 不认识 ZodVector→null——字段静默跳过）| 不透明（字段缺失无提示）| **修**：[Float!] 面（Infer=number[] 对齐） |

**判负候选（低值/无消费者——诚实记录）**：json 字段标量化（String 序列化
维持——平台 12 jsonb 列但 0 gql 消费）；uuid→ID 标量（String 面契约化——
迁移无收益）；关系面（JOIN/嵌套——typedQuery 集成复杂度高——无消费者）；
subscription（无场景）；connection 分页（简单 rows+total 对齐 paginate——
判负 CURSOR 形态）。

## 波次（每波次闭环：实现→契约→回归门→commit）

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W0 | **命名契约 + 共享地基**：docs §5.4 命名表（gql/rest 对称入口 + filterToWhere/fieldPolicy 定名）· `filterToWhere` 提取（gql 私有 whereFrom→共享——三面一处实现）· `fieldPolicy.hidden` 首版（敏感列豁免——gql 接线）| 命名表文档化 · gql 契约回归绿（filterToWhere 提取行为等价）· hidden 契约（SDL 不出现/不返回） |
| W1 | **一致性收口**：I1 eq:null→isNull（O1 对齐）· I2 sort 多字段链（SDL 数组真实化）· I3 orm.gql 自动派生 tenant（createOrm.tenant 单源——gql 面不可绕过租户）| gql 契约 5+（eq:null 双端/多字段排序顺序/租户自动注入） |
| W2 | **enum filter + vector 字段面**：I4 enum 列 Filter（GraphQL enum 值面）· I5 vector→[Float!]（number[] 对齐）| 契约（enum filter 算子集/vector 列 SDL 呈现） |
| W3 | **分页 total**：`xxxListPage(filter, sort, limit, offset): Page`（rows+total——count 单查同 where/scope——与 paginate 对齐）；list 保持向后兼容 | 契约（total 计数/scope 隔离下的 total） |
| W4 | **REST 生成器**：`restFromShape` + `orm.rest`（5 路由：list/one/insert/update/delete——参数 schema 从 shape 派生+limit clamp+枚举白名单·404/204 语义·hidden 字段策略·hooks 接缝 before/after）| rest 契约（路由矩阵/参数校验/错误语义/hooks） |
| W5 | **平台试点（第二消费者）**：/api/gql 挂 orm.gql（agents 单表）+ REST 试点 1 个纯 CRUD 表迁移（diff 验证样板消除——业务 route 零改动）| 试点测试绿（gql 查询+租户隔离断言 · rest 前后 diff）· 五域回归 |
| W6 | **docs + 回归门**：docs/server.md §5.4 完整（三面用法/命名表/分层纪律/边界判别/判负清单）+ 全量回归门 | 五域+audit 七线 · tsc 双 0 |

## 判负记录（可被新论证推翻）

- **json 字段标量化**：不做——维持 String 序列化（平台 12 jsonb 列 0 gql
  消费——无消费者；推翻条件：平台出现 gql 消费 jsonb 列的查询）
- **uuid→ID 标量**：不做——String 面已契约化（迁移破坏旧契约无收益）
- **关系面（JOIN/嵌套对象）**：不做——typedQuery 集成（join 类型化）复杂度
  高且无消费者；推翻条件：出现跨表 gql 查询需求
- **connection/cursor 分页**：不做——简单 rows+total 对齐 paginate（W3）——
  无游标分页场景（数据量级 <10^4）
- **subscription**：不做——无场景（ws 中间件已有订阅面——gql 订阅无消费者）
- **graphql 运行依赖移除（自研执行器）**：不做——graphql ^16 是生态成熟
  包（自研执行器判负——成本/正确性风险远超收益）；登记为已知外部依赖
  （与 esbuild/ws 同级——非四类核心内存化矩阵范围内）

## 执行实录（边做边记）

（空——波次执行时填写：探针重定位/波次结果/回归数字）

## 验收标准（全部满足才收尾）

- [ ] 命名契约文档化（docs §5.4——对称入口/生成器/共享层命名表）
- [ ] I1-I5 全部定案（实现 4 项 + 判负登记——不透明归零）
- [ ] filterToWhere 三面共享（gql 提取后行为等价——契约回归绿）
- [ ] gql 契约新增 ≥ 10 断言（W1-W3 契约绿）
- [ ] rest 契约（W4——路由矩阵/参数校验/错误语义/hooks/hidden）
- [ ] 平台试点端到端绿（gql 查询+租户隔离断言 · rest 样板削减 diff）
- [ ] 五域回归 + audit 七线 exit 0 + tsc 双 0
- [ ] docs §5.4 完整（三面用法/分层纪律/边界判别/判负清单）

## ✅ 执行实录（2027-xx——波次闭环记录）

### W0（42608aca）— W1（6ed744b3）— W2（f022345c）— W3（00023089）
- W0：`filterToWhere` 提取（gql 私有 whereFrom → 共享——行为等价——7/7 绿）·
  fieldPolicy.hidden 首版 · docs §5.4 命名表
- W1：I1 `{eq:null}`→`{isNull:true}`（O1 判空单源——filter 桥）· I2 sort 多字段
  链真实化（SDL `[SortInput!]` 数组——memory 已支持多字段——测试期望曾写反）·
  I3 orm.gql 自动派生 createOrm.tenant（显式 opts 优先——gql 面不可绕过租户）
- W2：I4 enum/literal 列 Filter（GraphQL enum 值面）· I5 vector→`[Float!]`
  （zodToGql 认识 ZodVector——旧版静默跳过已修）
- W3：`xxxListPage`（rows+total——count 单查同 where/scope——listResolver 共享单源）

### W4（4e269054）— restFromShape
- 5 路由 + query 参数 schema 派生 + limit clamp + 枚举白名单 + 404/204 +
  hidden + hooks（before*/after*）+ 租户 scope（ctxTable 自动隔离——跨租户 404）
- **执行实录**：ctxTable 兼容（无 CtxOrm → table——无 scope 语义诚实）·
  POST/PATCH 校验与映射单源（ctxTable 内部——rest 前置 parse 时序错已修——
  注入发生在 parse 后）· 错误 catch → 400 统一 · migrateModule 列需带 meta
  （memory observed 态无 pk 补位——t.pk 仅 declared 设置——测试修正）
- 判负登记：嵌套路由/全算子/批量 upsert（rest 路由是表平面——复杂面手写）

### W5（05983bab）— 平台试点（第二消费者——真实缺口实证）
- **gql 试点**：/api/gql 挂 orm.gql(agents)（hidden: webhook_secret）
  - 试点暴露 3 个真 bug（契约补测后修复）：① isOptional 缺 ZodNullable
    （insert input nullable 列 required 化——agents 20+ 列）② insert 租户
    注入在 parse 后（parse 拒绝缺省 app_id——rest 同型已修 gql 补）③ 租户列
    SDL 声明 required（String!——注入无机会）→ 恒可选
  - 盲区：enum 输出序列化/字面量输入（GraphQL 规范：enum 不带引号）——
    契约层只测 filter（输入面）——先补测再信绿
- **REST 试点**：agents（scope+hidden+CRUD）+ role_templates（全局无租户）
  - 暴露 CtxOrm 缺口：无租户列的表（全局表）注入不存在的列——修复：
    字段不存在 → null（不 scope）——契约补测（tenant-wire 5）
  - **试点判据（诚实登记）**：平台现有路由全是业务聚合（departments/agents
    list——成员计数/最近消息/token 统计）——分层纪律：业务 handler 手写
    ——「纯 CRUD 表迁移」无替换对象（role_templates 表无路由消费：内存常量
    面）——试点 = 验证生成面在真实平台可用；**推翻条件：平台出现纯 CRUD
    新表 → rest 直接生成**
- **运行时陷阱**：平台经 dist 引框架——**改 src 后必须 build.mjs**（本轮 3 次
  build 教训——dist 只含 index bundle + d.ts——单入口）

### W6（31b976b9）— docs + 回归门 · fix 077d95a3（/api/gql 接线 + 测试泄漏）
- docs §5.4.1-5.4.5（用法/边界判别/三条铁律/判负清单/执行实录）
- **npm test 永不结束根因**（修复）：① server.ts /api/gql 接线在启动路径用
  pg.orm.table（平台注册惰性——route 时 tables(orm)——spawn server 启动即崩
  → 43 ui 文件 × 30s ≈ 21 分钟超时队列 ≫ timeout 900）→ tables(pg.orm)
  先行注册（幂等）② ui/shared.ts 失败路径 kill spawn 子进程 + 清 pid
  （级联防泄漏）③ weifuwu-postgres-1 容器 Exited（docker compose up 恢复）
- typecheck:tests 3 处类型误差（GqlShapeOutput 类型化反噬——直接使用 +
  Handler 双态返回归一）

### 回归门（全绿）
框架 test（**契约 433** + 场景 123 + **server 840**）· showcase **328** ·
audit:all 七线（135 页/227 点击零问题）· audit-orm 双范围 0 · shape 对齐
24 表 · tsc 双 0 + typecheck:tests 0 · **平台 475**（461 过/14 skip docker）
