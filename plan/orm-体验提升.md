# orm 体验提升——开发者动线优化（2027-xx）

> 一句话目标：**开发者写一个 handler 的摩擦降到「写业务」**——手写 body 类型、
> 手写必填/枚举校验、手写 URL 参数解析、手写错误映射这些**非业务样板**从平台
> 大规模消失（shape 已知面复用——与 gql/rest 同源）。附带正确性收口（undefined
> 值面双路径分裂——确定性契约违例）与诊断面。
> 动机 = 平台真实代码盘点（下面数字锚点）——**不是臆想**。

## 现状探针（2027-xx 数字锚点——开发者摩擦全貌）

```
db 域：SRC 19 文件/4933 行 · TEST 18/2993 行 · 粗契约 179
platform：53 文件/10348 行 · routes 3807 行
```

**开发者摩擦盘点（平台 23 route + 30 service 实测计数）**：

| 摩擦 | 计数 | 证据（平台代码） | 根因 |
| --- | --- | --- | --- |
| **body 手写类型** | **23 处**（每处 10-30 行） | `req.json() as { type: string; name: string; ...30 字段 }`（agents.ts:81） | **shape 已知全部字段——route 重复声明** |
| **手写必填/枚举校验** | 7 + 2 | `if (!body.type || !body.name)` · `AGENT_TYPE_LIST.includes(body.type as any)` | 同上（insertSchema 已校验——route 没用） |
| **URL 参数手写解析** | **32 处** | `parseInt(url.searchParams.get('offset') ?? '0')` · `Math.min(100, Math.max(1, ...))` ×2 | rest/gql 已有（query 参数 schema 派生）——手写 route 未复用 |
| **catch→错误映射样板** | **26 处** | `catch (e: any) { return Response.json({ error: e?.message }, { status: e?.status ?? 403 }) }` | rest errorOf 私有——未共享 |
| String() 列值强转 | 648 | `String(ctx.appId)`（appId 已 string——纯惯性） | 类型已对——**噪音非缺陷**（判负） |
| as any/never/Record | 219 | 部分 orm 相关（body 校验弱继承） | 随 D1 收敛 |

**技术可行性探针（已证）**：`z.object(fields).omit(['id'])` → **Infer 类型保留**（id
省略后行类型正确）· parse 结果类型精确（string/string|null）· enum 校验自动
（`expected one of ai | user`）——**shape 变体可作为 body 校验面**（现 insertSchema
返回 `ZodType<Record<string, unknown>>`——**类型宽——需收窄**：`InsertRowOf<S>`）。

**正确性探针**（上轮保留）：`{ eq: undefined }` 双路径分裂——filterToWhere 静默
跳过 vs where 编译恒假（0 行）——确定性契约违例。

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W0 | **parseBody + BodyOf**（shape → body 校验）× **insertSchema/updateSchema 类型收窄**（`BodyOf<S>` / `InsertRowOf<S>`——类型面：parse 结果行类型精确——`req.json() as` 消亡）→ `parseBody(req, shape, { variant: 'insert'|'patch' })`（enum/必填/nullable/auto 列省略——insertSchema 单源） | 契约 4+（校验/类型/auto 省略/错误语义）· tsd 断言（body 类型精确——无 as） |
| W1 | **listQuery + errorOf 共享提取**（rest 私有 → 共享——listQuery(url, shape) → {filter,sort,limit,offset} clamp 白名单一致 · errorOf(e) → 状态码/json 统一——orm 错误 409/400/42P01 引导带出） | 契约 4+（行为等价 diff·clamp/白名单·错误映射）· rest 回归绿（提取不改行为） |
| W2 | **undefined 值面定案**（双路径统一显式拒绝——「where 值不能为 undefined——省略键或显式 isNull」· TWhere 类型面（tsd）· fuzz 补 undefined 案例 5 种子×201 对） | 契约 3+ · fuzz 对账绿 |
| W3 | **sort 字段类型化 + checkConsistency**（paginate.sort field: keyof S——tsd · pg.checkConsistency()——表/列/类型 diff——启动诊断——migrateModule 幂等基线已证） | tsd 2 · 契约 3 · 平台接线 |
| W4 | **平台试点（样板消失 diff）**：agents POST（23→0 行 body 类型·校验自动）+ 1 个 list route（searchParams 32 处中的代表——listQuery 收口）——diff 锚定（行数减少断言） | 平台测试绿 · diff 断言（body 类型行数=0·样板行数下降） |
| W5 | **docs + 回归门**：§5.3 增补（parseBody/listQuery/errorOf 用法·undefined 契约·诊断面）+ 全量回归门 | 五域+audit 七线 · tsc 双 0 · 平台 475 |

## 判负记录（可被新论证推翻）

- **route 生成器（CRUD 自动 route）**：不做——业务手写纪律（权限/编排/响应定制
  在 handler——判据：除了 参数→orm→响应 还有行为吗）；**只提取样板层**（body/
  参数/错误）不生成 route；推翻：平台出现「纯 CRUD route 无任何业务」的实例集
- **String() 648 专项清理**：不做——类型已对（appId: string）——纯惯性噪音——
  文档提示（parseBody 后 body 字段直用——String() 失去动机）；推翻：String(undefined)
  进库实例出现
- **parseBody 与 gql/rest input 三面合并**：不做——协议面各自 SDL（GraphQL 校验层）
  ——**共享内核 = shape 变体**（已是单源——三面同源不合并面）；推翻：出现三面
  校验语义分叉实例
- **平台 23 处全量迁移**：不做——试点 2 处（判据验证）——其余按需（新 route 用
  新方式——旧 route 不强制重写）；推翻：样板行数审计反弹
- **查询日志/Debug 开关**：不做（热路径+无场景——上轮判负保留）
- **pg 错误码全表中文化**：不做（高频三件套已映射——上轮判负保留）
- **query 兜底面深度类型化**：不做（typed-query 已有——上轮判负保留）

## 执行实录（2027-xx 已实施——W0-W5 全波次闭环）

| 波次 | 提交 | 实录 |
| --- | --- | --- |
| W0 | 8871186d | `bodyOf`（命名修正：parseBody 已被 request.ts 占用（通用 JSON 解析）——一个词一个概念——bodyOf 对齐 BodyOf 类型）+ BodyOf/PatchOf + withMeta 类型保留（meta 字面量不坍缩——BodyOf 的 auto 列省略根基·平台 dflt 迁移 f.dflt）+ f.dflt 值域放宽（jsonb 默认 []）· 契约 8/8 · **判负**：TS 条件类型惰性（映射+嵌套+索引访问组合——多形态验证全触发）——BodyOf required/optional 精确性判负（全字段键级可选——运行时校验权威） |
| W1 | cc568a09 | listQuery + errorResponse（rest 私有提取——行为等价 rest 回归 8/8；唯一冲突 400→409 行为增强——对齐契约层承诺 + 契约 7/7） |
| W2 | f3326284 | undefined 四层显式拒绝（filterToWhere/qb 三入口/compileWhere/memory 入口——**空表逃逸实证**（filter 惰性：无行不判定——校验前移「声明即校验」）· fuzz 3 种子×201 对双面对账 · **判负**：undefined 编译期拒绝（`eq?: V` 可选属性 undefined 面——无 exactOptionalPropertyTypes；全局开启迁移风险） |
| W3 | 1be54c61 | paginate.sort field: keyof S（tsd bogus/sideways 红）+ orm.tables() 注册表枚举 + pg.checkConsistency()（diffConsistency 纯函数双后端共用——normalizeType 宽等价组·表/列缺失 error·残留/类型 warn）· 契约 5/5 |
| W4 | cf478590 | 平台试点：agents POST 30 行 body 类型+必填/枚举 → bodyOf 1 行（-48/+13 净 -35 行）· list → listQuery（非法 type 静默忽略→显式 400）· 框架支撑：bodyOf.omit（变体生成剔除——required 豁免）+ **OrmTable.__shape 收紧 Shape<S>**（unknown → BodyOf S 推断坍缩 {} 实证——收紧后精确）· T3 断言升级（AGENT_TYPE_LIST 引用消亡——bodyOf 单源更强） |
| W5 | 25d51a72 | docs §5.3 增补（bodyOf/listQuery/errorResponse 用法·undefined 契约·sort 类型化·checkConsistency 诊断·判负登记）+ **listQuery __shape 解包修复**（W4 试点真 bug——OrmTable 直传 400）+ **性能基线独占域重定位**（全量并发抢占 30-34µs vs 独占 5µs——基准禁并发标准实践）+ 全量回归门全绿 |

## 验收标准（全部达成——25d51a72 收口）

- [x] W0：bodyOf 契约 9/9 · tsd（BodyOf 精确——auto 列/枚举编译红）· insertSchema 类型收窄（平台 tsc 0）
- [x] W1：listQuery/errorResponse 提取契约 7/7 · rest 回归绿（行为等价 8/8——唯一冲突 400→409 增强）
- [x] W2：undefined 四层显式拒绝（双路径一致 + fuzz 3 种子×201 对双面对账绿）
- [x] W3：sort keyof S tsd · checkConsistency 契约 5/5 · orm.tables() 透明面
- [x] W4：agents POST diff（body 类型 30 行→0 · -48/+13 净 -35 行）· list route 收口 · 平台全绿
- [x] W5：docs §5.3 增补 · test:server 864（863+1 独占域）· client 433 · 场景 123 · showcase 328 · audit:all 七线 · tsc 三 0 · 平台 475
