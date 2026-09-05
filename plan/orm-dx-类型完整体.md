# orm 开发者体验（DX）优化——类型完整体 + 契约真守卫（✅ 完成——2027-xx）

> **终态**：W1-W3 全波次闭环交付——单表类型复活（satisfies 29+1 表）· 跨表
> typedQuery 推导（纯类型面——运行时零成本）· 类型契约真守卫（typecheck:tests
> 0 错——CI 可挂一行）。**实证抓 3 个真 bug**：redis/ast.ts stringifyCommand
> 返回类型（签名错 3+ 年）· sandboxes updated_at 三单源漏列（真库写不存在列会
> 炸）· RosterMember roleLabel vs role_label 键不一致（运行时永远 undefined）。
> as unknown as 35→2（登记 2 处——跨表/动态 schema 判负面）——目标面达成。

> 一句话目标：**让 orm 的"类型安全"名副其实**——平台 35 处 `as unknown as` +
> 24 处 `Record<string, any>` 的主体是 orm 查询行类型断言；探针实证根因 =
> **platform SHAPES 的 `: ZodRawShape` 注解把字段类型扩展成 `ZodType<unknown>`
> （Infer 全坍缩）** + tsconfig excludes 测试文件（现有 tsd 断言是死代码）+ 跨表
> JOIN 无类型推导。三者闭环：单表类型复活（一行声明式修复）→ 跨表 typedQuery
> 推导 → 类型契约真守卫（CI 可挂）。

## 现状探针（2027-xx 一次性脚本读数——锚点）

| 指标 | 数字 |
| --- | --- |
| 平台 orm 调用面 | **223** 处（`query.from` 159 · `tables()` 工厂 74 · `.run()` 360）|
| 类型断言 | **`as unknown as` 35 处 · `Record<string, any>` 24 处**——样本 95%+ 是 orm 行类型（messages×4/knowledge×2/chat×6/agent-runner×3/manager×5/stats×3/byok/embedding）|
| JOIN | **94 处 / 19 文件**（routes 9 + services 10）——跨表查询全是无类型 Row |
| where 形态 | 对象式 166 · and/or/not 组合 183（双风格并存）· 算子分布 eq 353/lt 117/gte 19/ne 19/in 33/ilike 2/like 3/isNull 8 |
| 单表类型 | `tables() → OrmTable<typeof SHAPES[K]>`——**但 SHAPES 显式注解 ZodRawShape → 字段 Infer 全 unknown**（探针 P4：注解版全 unknown vs `as const` 版 string/enum 精确——实锤）|
| 类型契约守卫 | **tsconfig exclude `src/server/**/*.test.ts`**——orm.test.ts:289 的 tsd 断言（@ts-expect-error）**当前不生效（死代码）**——"类型安全"无 CI 防线 |
| ops.* 时间算子 | 64 处（已普及——`monthStart/nowAgo/now`）|
| 收口面消费 | transaction 0 · paginate 0 · exists 1（框架有面——平台未用）|
| 表达式魔法键 | 直写 0（全走 ops 包装 ✓）|
| 全表清空 | 仅 seed.mjs 哨兵 notIn（dev 工具）——`delete/update 必须 where` 护栏已全平台贯彻 |
| memory 列校验 | 已有（W1 未知列报错带合法列清单——`memory-sql: 未知列 'x'——t 合法列：...`）|

**根因链**（探针 P4 实证）：
```
platform shapes.ts: const agents: ZodRawShape = {...}
  → 字段类型被扩展为 ZodType<unknown>（ZodRawShape = Record<string, ZodType>）
  → RowOf/Infer 全 unknown
  → tables() 单表行类型 = { [field]: unknown }
  → 开发者被迫 as unknown as / Record<string, any>（35+24）
```

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| ✅ W1 | **类型契约真守卫**（b85438ee）：新建 `tsconfig.test.json`（include src + src/server/**/*.test.ts——与构建 tsconfig 隔离）· `npm run typecheck:tests`（CI 可挂）· 现有 orm.test.ts tsd 断言复活跑一遍（可能暴露真实类型错——按报错修） | typecheck:tests 0 错 + CI 挂点 · 现有断言全部真实生效（改错一个值 → 红）|

#### W1 实录（2027-xx）

- 首跑测试域 **220 错** → 清零：29 测试文件修复（mock ctx 逃逸 any / ShapeDef
  `as never` 链拆除（8+6 处）· `mem.tag` 消亡引用删除（W3c 死代码）·
  `applySchema` 多余 name 字段删（SchemaModule 无 name）· email send 参数面
  (`string|string[]`) · 中间件 next 回调签名（`undefined as never`——保留
  原 2 参运行时语义）· `String` 遮蔽（ai-agent city）· `hooked` 闭包 never）
- **守卫面实证的真修复**：`redis/ast.ts` `stringifyCommand` 返回签名
  `string`→`Uint8Array`——RESP 字节编码语义（旧签名错 3+ 年——构建面
  exclude 掩盖；测试域被 import 链检查才暴露）
- **tsd 断言生效验证**（负向）：orm.test.ts `eq(Agent.c.appId, 123)`
  删 @ts-expect-error → 红（1 错）· 恢复 → 绿
- **断言失效实证（登记 W2/W3 修复面）**：`z.enum(['ai','user'])` 无 as const →
  推断 `ZodEnum<[string, string]>` → Infer=string——`eq(type, 'robot')` 无编译
  错——原 '@ts-expect-error' 断言为死代码——W 修复面：enum 签名推断增强
  （`readonly string[]` + 元组保序）或 as const 纪律
- **aggregate 键缺口（登记 W3）**：`count('*', 'all')` 等聚合键不在
  `RowOf<S>` 行类型——测试断言面 12 处 `(r as any)`——W3 typedQuery 的
  行类型 = select 列 Infer + aggregate/vectorScore AS 键并入
- **CI 挂点判负**：仓库无 CI 基础设施（无 .github/workflows）——不引人
  GitHub Actions（超出现状）——`typecheck:tests` 已入 package.json——
  未来 CI 一行可挂；推翻条件：CI 基建出现时纳入
- 回归门（W1 波次）：server **796/796** · 契约 **433/433** · 构建 tsc **0** ·
  typecheck:tests **0**
| ✅ W2 | **单表类型复活（根因修复）**（56666c63+a2341aae）：platform SHAPES `: ZodRawShape` 注解 → `satisfies ZodRawShape`（29 表全模式——字段字面量类型保留）· `tables()` 行类型恢复（string/enum/date→string 精确——jsonb 列 unknown 诚实）· 平台 35+24 断言主体移除（tsc 报错面 = 精准清单——编译器指出所有"列不存在/值类型不符"隐患） | 平台 tsc 0 · as unknown as 归零或 5 内（判负：真需要处登记）· typecheck:tests 绿 |

#### W2 实录（2027-xx）

- **转换面**：29 表 `: ZodRawShape` → `satisfies ZodRawShape`（字符级大括号
  配对脚本——`}}` 双闭合陷阱实录：首脚本行级深度错位（函数调用 `})` 干扰）
  + 平台 orm.ts weifuwuAppMembers 第 30 表同式（类型一致性）
- **行类型复活验证**（探针）：`agents` 行 name=string · model=string|null
  （nullable 语义保留）· jsonb=unknown（诚实）· **未知列编译期红**
- **as unknown as 35→4**：RowOf/Row 精确后 25 处断言直接删除编译过（多余
  断言实证）· manager.ts SandboxRow 行类型派生（RowOf<SHAPES.sandboxes>——
  手动接口双写删除）+ 6 处查询绑表（orm.table 注册面——registry 幂等
  零成本）· video-gen.ts VideoTaskRow 同派生 + status switch default 兜底
  （enum 坍缩 string——诚实面）· **判负保留 4 处**：RosterMember×2
  （跨表 join 手动接口——W3 typedQuery 修复面）· video-gen row
  （ensureVideoTasksTable 动态 schema）· stats.ts ctx（非行面）
- **W2 实证抓真 bug**：sandboxes 表 `updated_at` **三单源漏列**（schema.sql/
  tables.ts/shapes.ts 都没有——但 manager 11 处读写：reconcile 自愈写
  `.set({updated_at})` + 停止超时 `row.updated_at` 读——**真库运行时写不
  存在的列会炸**——memory 引擎宽容掩盖（POSTGRES_MEMORY=1 测试面）——
  设计意图明显（全文件都在更新它）→ 补列：三单源 + 存量库
  `ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
  NOT NULL DEFAULT NOW()（schema.sql）——shape-check 24 表对齐绿
- 回归门：平台 **451/451**（14 skip docker）· shape 对齐 24 表 · audit-orm
  三域 0 · 平台 tsc 0 · typecheck:tests 0
| ✅ W3 | **跨表 typedQuery**（dd0bf7a8）：`createTypedQuery<TSchema>(orm, schema)`（纯类型面——运行时 = orm.query 零成本）· 表/alias 解析（`from('kb_chunks kc')` + join 链 alias 累积）· 列解析（裸列→主表·`alias.col`→alias 表）· 行类型 = select 列 Infer 映射 + aggregate/vectorScore as 键并入 · 未知列/未知 alias 编译期红 · 契约：tsd 断言 8+ | tsd 断言绿 · query-language/orm 运行时契约全绿 · 平台试点（embedding 知识检索/chat 同事名单/messages 会话）类型化——as unknown 删除 |

#### W3 实录（2027-xx）

- **类型机制实证**（/tmp/w3 探针 4 版收敛）：模板字面量解析（Split/AddAlias）·
  ColShape 泛型退化 → **两层 extends 展开**（OutOf<Z>——Z[K] extends
  ZodType<infer O>）通过 · 行类型 = `SelRow`（列名去 alias 前缀——`kc.id`
  → `id`——mapped as 键）· 未知列/未知 alias → never → 编译红 ·
  ColRefs 白名单约束 select/where 键（'zz.id' 红）
- **API 面**：`createTypedQuery(orm, schema)`（schema = 表名→shape 注册表）·
  TSelect（join/select/where/聚合/vectorScore/orderBy/limit/run/one）——
  运行时 TQB 类纯转发（Proxy 不必要——方法清单转发；node strip-only
  不支持参数属性——显式字段构造）
- **判负（探针定）**：`col AS alias` 键别名不做（平台 0 消费——聚合/vectorScore
  的 as 参数面已覆盖键别名）· where 值×列类型不做（z.enum 坍缩——W1 登记）·
  and/or 组合内层键不校验（外层白名单覆盖主要场景）
- **平台试点（as unknown as 35→2）**：embedding.ts 知识检索（kb_chunks kc
  join kb_documents kd + vectorScore——r.id: string · r.similarity: number
  精确）· chat.ts RosterMember 跨表 join · messages.ts 返回行断言删
  （W2 面顺带）——**试点抓真 bug**：RosterMember.roleLabel 键与查询列
  role_label 不一致——**运行时永远 undefined**（角色标签从未注入
  systemPrompt——P0-2 名单缺陷）——role_label 对齐 + persona.test fixture
  同步（4/4 绿恢复）
- **剩 2 处登记**：video-gen row（ensureVideoTasksTable 动态 schema——
  列存在性调用方保证）· stats.ts ctx（非行面）
- 回归门：框架 **801/801**（+5 typed-query）· 契约 **433/433** · 平台
  **451/451**（14 skip docker）· tsc 双 0 · dist 重建（平台经 dist 引框架）
| W4 | **回归 + 文档 + 收尾**：docs/server.md §5 补 typedQuery 用法 + SHAPES satisfies 纪律（平台 shapes 指南）· audit 补类型断言守卫?（判负登记见下）· 全量回归门 | 五域 + audit 七线 + 平台 451+155 全绿 · tsc 双 0 · 计划收尾 |

## 判负记录（可被新论证推翻）

- **不做 SHAPES 全量改字段名 camelCase**：`f.col` 列名映射面已存在——但字段名=列名决策（platform-orm-迁移.md P0）不可逆（改动面 23 表×1000+ 引用）——本项目只做类型复活（零语义变化）
- **不做 where 算子×列类型白名单**（number 列禁 ilike 等）：探针 like/ilike 仅 5 处（全 string 列——合法）——消费未成规模——判负（推翻条件：出现非法算子组合运行时错误案例）
- **不做 tsd 包依赖**（expectTypeOf 库）：沿用项目 @ts-expect-error 惯例（orm.test.ts 先例——W1 守卫面下真实生效即可）
- **不做 transaction/paginate 收口新面**：框架已有面（transaction/paginate/exists）——平台 0 消费——验收不扩疆（登记：平台若出现多写事务场景复用既有面）
- **不做 jsonb 列值类型化**：ZodJson=unknown 是诚实既有语义——需 per-field 注解——收益/成本比低（推翻条件：jsonb 读写误用成为实际 bug 源）

## 执行实录

（边做边记——探针重定位/波次结果/回归数字）

- 探针 P0-P4（本计划前置——/tmp/probe-ormdx*.mjs + /tmp/probe-orm/p4.ts）：
  - orm 调用 223 · JOIN 94/19 文件 · as unknown 35 · Record<any> 24 · where 对象 166/组合 183
  - **P4 根因实锤**：`const s: ZodRawShape = {...}` → Infer 全 unknown；`as const`（或 satisfies）→ 精确。platform SHAPES 是注解版——tables() 行类型已坍缩
  - tsconfig exclude 测试文件——orm.test.ts tsd 断言当前不生效（@ts-expect-error 未被检查）
  - ops 64 处普及 · 魔法键直写 0 · transaction/paginate 0 · memory 列校验（含合法列清单）已有

## 验收标准

```
□ typecheck:tests（含测试文件的类型检查）CI 可挂——0 错
□ platform SHAPES satisfies 化——tables() 行类型复活（tsc 层面 string/enum 精确）
□ 平台 as unknown as / Record<string, any> 主体清零（判负登记 5 内）
□ typedQuery tsd 契约 6+ 断言绿（列拼错/别名错编译期红）
□ 全量回归门：契约 433 + 场景 123 + showcase 328 + server 796 + shared 25 +
  平台 451+155 + audit 七线 + tsc 双 0
□ 规则并入 docs/server.md §5 + 平台 shapes 指南
```


## ✅ 验收勾选（W4 终局）

| 验收项 | 结果 |
| --- | --- |
| W1 typecheck:tests 0 错 + CI 挂点 | ✅ 0 错 · 挂点判负登记（无 CI 基建——script 已备）|
| W1 现有断言真实生效 | ✅ 负向验证（删 @ts-expect-error → 红）|
| W2 平台 tsc 0 · as unknown as ≤5 | ✅ 0 错 · 35→2（登记：video-gen 动态 schema · stats ctx 非行面）|
| W2 typecheck:tests 绿 | ✅ |
| W3 tsd 断言绿 | ✅ 8+（跨表行精确/裸列主表/未知列/未知 alias/where 非法列/聚合键）|
| W3 query-language/orm 运行时契约全绿 | ✅ 框架 801（+5 typed-query）· 契约 433 |
| W3 平台试点类型化 | ✅ embedding 知识检索 · chat 同事名单 · messages 会话——as unknown 删除 |
| W4 五域+七线 | ✅ 契约 433 · 场景 123 · showcase 328 · server 801 · shared 37 · audit 七线全绿 · 平台 451+155 · tsc 双 0 · audit-orm 三域 0 |

## W4 实录（2027-xx）

- docs/server.md §5.1 typedQuery 用法 + §5.2 shape satisfies 纪律（禁止
  ZodRawShape 注解——行类型坍缩根因——审计/tsc 面持续捕杀）
- 全量回归门：**五域 1722**（433+123+328+801+37）全绿 · audit 七线
  （semantics/interactivity/vdom/theme/api/bundle/showcase 135 页/227 点击
  零问题）· 平台 **451 + ui 155** · tsc 双 0 · audit-orm 三域 0
- **提交栈**：`b85438ee`(W1) → `56666c63`+`a2341aae`(W2) → `dd0bf7a8`+
  `cedbfb23`(W3) → `152b2c42`(docs) → 本收尾
- **真 bug 修复清单**（守卫面实证——typecheck 的价值证明）：
  1. redis/ast.ts `stringifyCommand` 返回签名 string→Uint8Array（旧签名错 3+年）
  2. sandboxes 表 `updated_at` 三单源漏列（manager 11 处读写——真库写
     不存在列会炸——memory 掩盖）+ 存量库 ALTER ADD COLUMN
  3. RosterMember.roleLabel vs 查询列 role_label（运行时 undefined——角色
     标签从未注入 systemPrompt——P0-2 名单缺陷）
  4. describeVideoTask switch 无 default（enum 坍缩后不穷尽——未知状态
     兜底诚实面）
- **已知边界（诚实）**：z.enum 字面量坍缩（无 as const 时
  ZodEnum<[string,string]>）——W3 后仍是 string 面——修复面 = enum 签名
  推断增强（`readonly string[]` + 元组保序）或 as const 纪律——已入文档
  §5.2 已知边界——可新计划立项
