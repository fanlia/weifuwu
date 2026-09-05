# orm 开发者体验（DX）优化——类型完整体 + 契约真守卫（2027-xx）

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
| W1 | **类型契约真守卫**：新建 `tsconfig.test.json`（include src + src/server/**/*.test.ts——与构建 tsconfig 隔离）· `npm run typecheck:tests`（CI 可挂）· 现有 orm.test.ts tsd 断言复活跑一遍（可能暴露真实类型错——按报错修） | typecheck:tests 0 错 + CI 挂点 · 现有断言全部真实生效（改错一个值 → 红）|
| W2 | **单表类型复活（根因修复）**：platform SHAPES `: ZodRawShape` 注解 → `satisfies ZodRawShape`（23 表全模式——字段字面量类型保留）· `tables()` 行类型恢复（string/enum/date→string 精确——jsonb 列 unknown 诚实）· 平台 35+24 断言主体移除（tsc 报错面 = 精准清单——编译器指出所有"列不存在/值类型不符"隐患） | 平台 tsc 0 · as unknown as 归零或 5 内（判负：真需要处登记）· typecheck:tests 绿 |
| W3 | **跨表 typedQuery**：`createTypedQuery<TSchema>(orm, schema)`（纯类型面——运行时 = orm.query 零成本）· 表/alias 解析（`from('kb_chunks kc')` + join 链 alias 累积）· 列解析（裸列→主表·`alias.col`→alias 表·`col AS alias`→键别名）· 行类型 = select 列 Infer 映射 + aggregate/vectorScore as 键并入 · 未知列/未知 alias 编译期红 · 契约：tsd 断言 6+（列拼错/别名错/AS 别名/join 后裸列歧义?——W3 探针定） | tsd 断言绿 · query-language/orm 运行时契约全绿 · 平台试点（chat 知识检索/messages 会话）类型化——as unknown 删除 |
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
