# orm gql 提升——declaration-实现一致性 × 可用面补全（2027-xx）

> 一句话目标：**gqlFromShape 链路（shape→SDL+resolvers→app.graphql）与
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
| W1 | **一致性收口**：I1 eq:null→isNull（filter 桥——O1 对齐）· I2 sort 多字段链（SDL 数组真实化）· I3 orm.gql 自动派生 tenant（createOrm.tenant 单源——gql 面不可绕过租户）| gql 契约 5+（eq:null 双端/多字段排序顺序/租户自动注入） |
| W2 | **enum filter + vector 字段面**：I4 enum 列 Filter（GraphQL enum 值面）· I5 vector→[Float!]（number[] 对齐）| 契约（enum filter 算子集/vector 列 SDL 呈现） |
| W3 | **分页 total**：`xxxListPage(filter, sort, limit, offset): Page`（rows+total——count 单查同 where/scope——与 paginate 对齐）；list 保持向后兼容 | 契约（total 计数/scope 隔离下的 total） |
| W4 | **平台试点（第二消费者）**：/api/gql 挂 orm.gql（agents 单表——字段面与 REST 对齐）+ 端到端（SDL 挂载/租户 scope 上下文贯通/校验错误 GraphQL 错误面）| 平台试点测试绿（查询+租户隔离断言）· 五域回归 |
| W5 | **docs + 回归门**：docs/server.md §5.4（gqlFromShape 用法/边界/判负清单）+ 全量回归门 | 五域+audit 七线 · tsc 双 0 |

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

- [ ] I1-I5 全部定案（实现 4 项 + 判负登记 1 项及以上——不透明归零）
- [ ] gql 契约新增 ≥ 10 断言（W1-W3 各波次契约绿）
- [ ] 平台试点 /api/gql 端到端绿（查询 + 租户隔离断言）
- [ ] 五域回归 + audit 七线 exit 0 + tsc 双 0
- [ ] docs §5.4（用法/边界/判负清单）
