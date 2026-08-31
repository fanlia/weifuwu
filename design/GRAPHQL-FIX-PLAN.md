# GRAPHQL-FIX-PLAN — src/server/graphql.ts + make-executable-schema.ts 优化修复计划

> GraphQL HTTP 层（createGraphqlRouter）与自研 makeExecutableSchema 的缺陷修复计划。
> **关键缺陷均已实证**（真 HTTP 复现脚本——node --test 风格 wire 断言）。
>
> 基线：graphql.test.ts 3 测试 + make-executable-schema.test.ts 6 测试 = 9 全绿
> （~160ms——纯内存直跑——无外部依赖）。

---

## 0. 缺陷清单总览

| ID | 严重度 | 缺陷 | 实证 |
| --- | --- | --- | --- |
| G1 | **安全（P1）** | **深度限制可被 fragment 绕过**——`queryDepth` 只 walk OperationDefinition 字面嵌套——fragment 展开后的真实深度不计——`maxDepth` 防护形同虚设（查询复杂度 DoS 防护缺口） | 复现：maxDepth=3，fragment 链展开深度 11 → **200**（限制被绕） |
| G2 | **协议（P2）** | **resolver 执行错误一律 400**——graphql-over-http 规范：执行错误（field 级——errors 带 `path` + 部分 data）应 **200**；400 只给请求级错误（parse/validation）——客户端无法区分「查询写错」与「数据源坏了」 | 复现：resolver 抛错 → 400 + errors 带 `path: ["boom"]` + data 部分存在 |
| G3 | **韧性（P2）** | **错误面不统一**——① `options.context` 抛错在 try 外 → HTML 500 `{"error":"Internal Server Error"}` + 控制台堆栈（非 GraphQL 错误文档格式）② SDL 语法错误（buildSchema 抛）→ 无捕获 → 路由层非 JSON 错误响应 | 复现：context 抛错 → status 500 + HTML 文档（GraphQL 错误格式应为 `{errors:[...]}`） |
| G4 | **性能（P2）** | **schema 每请求全量重建**——字符串 SDL 场景每个 GET/POST 都 `buildSchema` + resolvers 字段绑定——热路径纯开销（大 SDL 线性放大） | 实测：20 类型 SDL 0.55ms/次（1000 次 549ms）；缓存路径近零 |
| G5 | **信息面（P3）** | GET `variables` JSON 语法错误 → 返回 `Missing query`（误导——真实错误被吞） | 代码审读（parseParamsFromGet catch → null——确定性） |
| G6 | **HTTP 语义（P3）** | POST 不检查 Content-Type——任意类型都当 JSON 解析（失败 → `Missing query`）——graphql-over-http 规范：非 application/json 应 415 | 代码审读（parseParamsFromPost 无内容类型检查——确定性） |

---

## 1. G1 — 深度限制 fragment 绕过（P1——确证）

### 根因

`queryDepth`（graphql.ts）：

```ts
function queryDepth(doc: DocumentNode): number {
  let max = 0
  function walk(node: any, depth: number) {   // 只走 selectionSet 递归
    if (depth > max) max = depth
    if (node.selectionSet) {
      for (const sel of node.selectionSet.selections) walk(sel, depth + 1)
    }
  }
  for (const def of doc.definitions) {           // 只看 OperationDefinition
    if (def.kind === 'OperationDefinition') walk(def, 0)
  }
  return max
}
```

fragment spread（`...F1`）没有 selectionSet——walk 不展开。**fragment 链合法展开后的真实嵌套深度不计**。

**复现**（maxDepth=3）：

```graphql
query { a { b { ...F1 } } }          # 字面深度 3 ≤ 3 → 通过
fragment F1 on B { c { d { ...F2 } } }
fragment F2 on D { e { f { ...F3 } } }
fragment F3 on F { g { h { i { hello } } } }
```

→ **status 200**（实际执行深度 11——限制被绕）。

### 修复方案（fragment 展开 + 防循环）

```ts
/** Count max nesting depth of a GraphQL query——fragment 展开计入（G1） */
function queryDepth(doc: DocumentNode): number {
  // fragment name → 定义（先收集）
  const fragments = new Map<string, FragmentDefinitionNode>()
  for (const def of doc.definitions) {
    if (def.kind === 'FragmentDefinition') fragments.set(def.name.value, def)
  }
  let max = 0
  // visited：fragment 循环防御（validate NoFragmentCycles 已拦——深度计算再兜底）
  function walk(node: { kind: string; selectionSet?: ... }, depth: number, visited: Set<string>) {
    if (depth > max) max = depth
    if (node.kind === 'FragmentSpread') {
      const name = node.name.value
      if (visited.has(name)) return           // 循环：跳过（已计入深度上限）
      const frag = fragments.get(name)
      if (!frag) return                        // 未知 fragment：validate 会报——深度计算忽略
      const v = new Set(visited); v.add(name)
      walk(frag.selectionSet, depth, v)        // 展开：fragment 内容按当前深度接续
      return
    }
    if (node.selectionSet) {
      for (const sel of node.selectionSet.selections) walk(sel, depth, visited)
    }
  }
  for (const def of doc.definitions) {
    if (def.kind === 'OperationDefinition') walk(def, 0, new Set())
  }
  return max
}
```

要点：
- fragment spread 处**原地展开**（当前深度接续——分片深度与内联一致）
- visited 集防循环（NoFragmentCycles 之外的深度计算防御——不依赖 validate 顺序）
- 深度审查顺序不变（parse → depth → validate——快速拒绝先于完整验证）

### 测试

1. **fragment 链展开超限 → 400**（复现查询原样入库——旧代码 200 必挂红线）
2. 内联深查询保持拒绝（回归——现有语义不破）
3. 循环 fragment（虽然 validate 会拒——queryDepth 不抛——防御断言）

---

## 2. G2 — 执行错误 status 语义（P2——确证）

### 根因

```ts
return Response.json(result, { status: result.errors ? 400 : 200 })
```

graphql-over-http（2024）：400 仅用于请求级错误（parse/validation——errors 无 `path`）；
**field 执行错误**（resolver 抛错——errors 带 `path`、data 部分成功）应 **200**。

**复现**：`{ boom }` resolver 抛错 → 400 + `{"errors":[{"message":"resolver crashed","path":["boom"]}],"data":{"boom":null}}`。

### 修复方案

```ts
// 请求级错误（parse/validation）400；执行错误（field 级——有 path）200（规范：部分结果语义）
const requestLevel = result.errors?.some((e: any) => !e.path)
return Response.json(result, { status: requestLevel ? 400 : 200 })
```

- 无 errors → 200（不变）
- 验证错误 → errors 无 path → 400（不变——现有 maxDepth>0 路径已显式 validate 先行）
- 执行错误 → 200 + path（新——规范正确）

### 测试

1. resolver 抛错 → **200** + errors[0].path 存在 + data 部分（旧代码 400 必挂红线）
2. validation 错误（未定义字段）→ 400 保持（回归）
3. maxDepth 超限 → 400 保持（回归）

---

## 3. G3 — 错误面统一（P2——确证）

### 根因

```ts
const contextValue = options.context ? await options.context(req, ctx) : ctx   // try 外！
```

① context 抛错 → 路由层 catch → HTML 500 + 控制台堆栈——**不是 GraphQL 错误文档格式**
② `buildSchemaFromOptions`（SDL 语法错误）在 getSchema 内无保护——消费端错误面非 JSON

### 修复方案

```ts
// getSchema：构建错误统一 JSON（服务端配置错误 → 500 + GraphQL 错误文档）
async function getSchema(req, ctx): Promise<{ options; schema }> {
  const options = await handler(req, ctx)
  try {
    const schema = buildSchemaFromOptions(options)
    return { options, schema }
  } catch (err) {
    throw new GraphHttpError(500, err instanceof Error ? err.message : String(err))
  }
}

// executeQuery：context 构造纳入错误面
let contextValue: unknown
try {
  contextValue = options.context ? await options.context(req, ctx) : ctx
} catch (err) {
  return Response.json({ errors: [{ message: ... }] }, { status: 500 })
}
```

- 错误文档统一 `{ errors: [{ message }] }`（GraphQL 规范形状——与 G2 判定共用）
- context 失败 500（不泄漏堆栈——message 即 error.message——调用方控制面）

### 测试

1. context 抛错 → 500 + `{ errors: [...] }`（旧代码 HTML——红线）
2. SDL 语法错误 → 500 + 错误文档（JSON 面）

---

## 4. G4 — schema 缓存（P2——性能）

### 根因

`getSchema` 每请求 `buildSchemaFromOptions`——字符串 SDL 场景 = 每次请求全量
`buildSchema` + resolver 绑定（0.55ms/次——20 类型实测；SDL 增大线性放大）。

### 修复方案（安全缓存——双键）

```ts
/** G4：缓存——key 按 resolvers 对象 identity（WeakMap——resolver 对象 GC 自动回收——
 *  动态 resolver（每请求新建对象）降级现状（不缓存——安全）——静态 resolver 命中）；
 *  二级 key = SDL 字符串——不同 SDL 各自缓存——FIFO 上限防无界（多租户多 SDL） */
const schemaCache = new WeakMap<object, Map<string, GraphQLSchema>>()
const BARE_CACHE_LIMIT = 64   // 无 resolver 场景：sdl → bare schema——FIFO
const bareCache = new Map<string, GraphQLSchema>()

function buildSchemaFromOptions(options: GraphQLOptions): GraphQLSchema {
  if (typeof options.schema !== 'string') return options.schema
  const resolvers = options.resolvers
  if (!resolvers) {
    const hit = bareCache.get(options.schema)
    if (hit) return hit
    const built = buildSchema(options.schema)
    if (bareCache.size >= BARE_CACHE_LIMIT) {
      const first = bareCache.keys().next().value   // FIFO 淘汰
      if (first !== undefined) bareCache.delete(first)
    }
    bareCache.set(options.schema, built)
    return built
  }
  let bySdl = schemaCache.get(resolvers)
  if (!bySdl) { bySdl = new Map(); schemaCache.set(resolvers, bySdl) }
  const hit = bySdl.get(options.schema)
  if (hit) return hit
  const built = makeExecutableSchema({ typeDefs: options.schema, resolvers })
  if (bySdl.size >= BARE_CACHE_LIMIT) {
    const first = bySdl.keys().next().value
    if (first !== undefined) bySdl.delete(first)
  }
  bySdl.set(options.schema, built)
  return built
}
```

**缓存安全论证**（不引入跨请求污染——前 3 方案对比见 §7 决策记录）：
- resolver 绑定发生在**缓存后的 schema 对象**上——schema 与 resolvers 对象一一配对
  （WeakMap 键 = resolvers 对象 identity）——不同 resolver 对象永不共享 schema 对象
- 静态 resolvers（模块级常量——主流）→ 永久命中；handler 每请求新建 resolvers →
  每请求 miss → **行为与现状完全一致**（无正确性风险——只是不赚性能）
- 未知 type/字段（要忽略的宽松语义）在 makeExecutableSchema 内已处理——缓存不改变语义

### 测试

1. **同 SDL + 同 resolvers 两次请求 → buildSchema 只一次**（可观测：resolver 函数计数
   或 SDL 字符串构造计数——用「第二次请求替换 resolver 函数→ 结果用新函数」断言
   缓存与 resolver 配对正确——防污染）
2. 不同 SDL → 各自解析（缓存键正确）
3. 每请求新 resolvers 对象 → 行为正确（降级路径——不缓存也能跑）
4. resolver 替换后第二次请求使用新 resolver（同键缓存不串 resolver——关键防污染断言）

---

## 5. G5 + G6 — 信息面 + HTTP 语义（P3）

### G5 GET variables 语法错误 → 具体错误

```ts
// parseParamsFromGet：JSON.parse 失败 → 返回区分对象（不再吞成 null → 'Missing query'）
if (variablesStr) {
  try { variables = JSON.parse(variablesStr) }
  catch { return { error: 'Invalid variables JSON' } as ... }
}
// 路由层：params.error → 400 具体信息
```

### G6 POST Content-Type 检查

```ts
// parseParamsFromPost 前：content-type 必须 application/json（+ 允许 charset）
const ct = req.headers.get('content-type') ?? ''
if (!ct.includes('application/json')) {
  return Response.json({ errors: [{ message: 'Unsupported Media Type: expected application/json' }] }, { status: 415 })
}
```

（graphql-over-http：415 for unsupported media type——GET 无 body 不受影响）

### 测试

1. GET `?query={hello}&variables=not-json` → 400 + `Invalid variables JSON`（旧代码
   `Missing query`——误导红线）
2. POST text/plain → 415（旧代码 400 `Missing query`）
3. 正常 POST application/json（含 charset）→ 200（回归——不误杀）

---

## 6. 测试计划总表

| # | 测试 | 文件 | 断言核心 |
| --- | --- | --- | --- |
| T1 | fragment 链展开超限 → 400 | graphql.test.ts | G1 红线（旧代码 200） |
| T2 | 内联深查询 400 回归 | graphql.test.ts | 深度限制不破 |
| T3 | fragment 循环不抛 | graphql.test.ts | 防御性 |
| T4 | resolver 抛错 → 200 + path | graphql.test.ts | G2 红线（旧代码 400） |
| T5 | validation 错误 → 400 回归 | graphql.test.ts | 请求级语义保持 |
| T6 | context 抛错 → 500 + errors 文档 | graphql.test.ts | G3 红线 |
| T7 | SDL 语法错误 → 500 JSON | graphql.test.ts | G3 面 |
| T8 | 同 SDL 缓存命中 + resolver 配对 | graphql.test.ts | G4 防污染 |
| T9 | 不同 SDL 各自缓存 | graphql.test.ts | G4 键正确 |
| T10 | GET variables 坏 JSON 具体错误 | graphql.test.ts | G5 |
| T11 | POST 非 JSON → 415 | graphql.test.ts | G6 |
| T12 | charset 后缀正常 | graphql.test.ts | G6 不误杀 |

回归：`npm run typecheck` + graphql 测试全绿 + `npm run test:server`（全库）。

---

## 7. 决策记录（方案对比 + 判负）

| 项 | 决策 | 理由 |
| --- | --- | --- |
| G4 缓存键方案对比 | **WeakMap(resolvers 对象) + 二级 SDL Map**（选中） | 方案 A「裸 schema 缓存 + 每请求绑定」——绑定修改缓存的裸 schema → 跨请求 resolver 污染（B 请求覆盖 A 的绑定）——**否决**；方案 B「SDL 字符串 → schema 全局 Map」——resolvers 不同时同 SDL 共享 schema → 同污染——**否决**；方案 C（选中）——resolver 配对隔离 + WeakMap 自动回收 + 每请求新 resolver 对象降级现状——**安全且零风险** |
| G1 visited 防御 | 做 | 深度计算不依赖 validate 顺序（深度检查先于 validate——循环 fragment 在 depth 计算时不炸） |
| 双重 parse（maxDepth>0 时 parse 两次） | **判负（不做）** | parse 是 O(query 长度)——小查询无感；改用 execute 低层 API 重构组合面大（variables coercion/别名处理的回归风险）——收益 < 风险 |
| 超时后 resolver 取消 | **判负（边界记录）** | GraphQL 执行无原生取消——resolver 内部需自行响应；Promise.race 已接住 rejection（无 unhandledRejection）——执行继续浪费是边界（文档明示：长 resolver 用队列/自己检查） |
| GraphiQL CSP header | **判负（记录）** | 页面本身从 esm.sh 加载第三方——CSP 精确白名单收益边际（信任决策已作出）；端点是服务端 pathname（非用户注入） |
| graphiqlHTML 提取独立文件 | **判负（记录）** | 纯代码组织——一次交付一次性收益——少动原则 |
| G2 status 变更兼容性 | **做（规范优先）** | graphql-over-http 规范明确；（errors[].path 存在 = 部分数据= 200）——客户端可按 errors 判断失败——不依赖 status 400 |

---

## 8. 执行顺序与验收

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | G1 fragment 深度展开 + T1/T2/T3 | 复现查询 400——旧代码必挂 |
| W2 | G2 status 语义 + G3 错误面 + T4-T7 | resolver 错误 200、context/SDL 错误 JSON 文档 |
| W3 | G4 schema 缓存 + T8/T9 | 缓存命中 + 防污染断言 |
| W4 | G5/G6 + T10-T12 | 具体错误信息 + 415 |
| — | **已知边界（诚实裁剪）**：双 parse 判负；超时后 resolver 不可取消（GraphQL 无原生语义——长任务用队列）；subscription 不支持 HTTP 传输（ws 另行——非本文件面）；无速率限制（rateLimit 中间件是应用编排面） | — |

每波：`npm run typecheck` + graphql 测试 + `npm run test:server` 全库回归。

---

## 9. 执行实录

> 2027-09——**全量交付完成**（W1-W4 一次提交）。

**交付结果**：graphql + make-executable-schema 测试 9 → **22**（新增 13 条）——全部绿色；
`npm run typecheck` 全库通过。

| 波次 | 内容 | 测试 | 备注 |
| --- | --- | --- | --- |
| W1 | queryDepth fragment 展开 + visited 防循环（graphql.ts） | T1（fragment 链 400——旧代码 200）/ T2 / T3 | 复现查询原样入库；**执行中修正**：初版 walk 只处理 node.selectionSet——SelectionSetNode 无 selectionSet 属性——fragment 展开未计数——改为按 kind 分流（SelectionSet 遍历 selections/FragmentSpread 原地展开/其余加深一层） |
| W2 | errors[].path 判定 200/400 + context 错误面 + getSchema 构建保护（withSchema 统一入口） | T4 / T5 / T6 / T7 | 执行错误 200（规范）、validation 400 保持、context/SDL 错误 JSON 文档；**T5 教训**：GraphQL validation 消息大写 `Cannot query`（区分敏感断言） |
| W3 | schema 缓存（WeakMap\<resolvers\> 配对 + sig 快照 + FIFO 64 上限） | T8（函数替换→重建）/ T8b（稳定命中）/ T9（多 SDL 隔离） | **T8/T8b/T9 初版红因测试自身 resolver 缺 Query 包装层**（{hello} vs {Query:{hello}}——绑定级空）——实现无 bug |
| W4 | GET variables 具体错误 + POST 415 + charset 不误杀 | T10 / T11 / T12 | — |

**执行教训汇总**（入库）：
- SelectionSetNode 无 selectionSet 属性——AST 遍历必须按 kind 分流（贪心 node.selectionSet 遍历
  在 fragment 展开路径静默失效——T1 红才现形）
- resolvers map 嵌套层级（{Type:{field}}）写错是测试侧错误——绑定无报错（宽松忽略）——
  **错误面是 null 而非异常**——断言 data 值而非「请求无异常」
- getSchema 编辑残留重复函数（typecheck 现形——TS2393）——编辑交叉验证纪律

**全库回归**：`npm run test:server` 462 基线 + 本计划新增（graphql 内测——无外部依赖）——
提交前完整验证。
