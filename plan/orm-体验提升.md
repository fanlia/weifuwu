# orm 体验提升——价值面一致性 × 类型化收口 × 诊断面（2027-xx）

> 一句话目标：**在 orm 收敛态（gql/rest 双面 + 状态机确定性）上做「健壮/好用/易用」三轴收口**——
> ① 消除**已实证的不一致**（undefined 值面双路径分裂——确定性契约违例）② **类型化补齐**
> （sort 字段编译期防护——where 值面先例已有）③ **诊断面**（schema 漂移运行时检测——
> 平台新增列忘补 shape 启动即红）④ **平台样板再收口**（手写分页/app_id 过滤甄别）。
> 动机 = 探针读数锚定（下面数字）——不是臆想。

## 现状探针（2027-xx 数字锚点）

```
db 域：SRC 19 文件/4933 行 · TEST 18 文件/2993 行 · 粗契约 179
platform：53 文件/10348 行——手写 app_id 过滤 14 文件 · count+limit 手写分页 2 文件
类型摩擦：as any/never/Record 219 处 · String() 列值强转 648 处（典型 String(ctx.appId)——undefined 掩码）
```

**P0（头号——确定性契约违例·已实证）**：`{ eq: undefined }` **双路径行为分裂**：

| 路径 | 行为（探针实测） | 问题 |
| --- | --- | --- |
| `filterToWhere`（gql/rest/paginate） | `val === undefined → continue`——**键静默跳过**（返回全量——过滤被静默放宽） | 调用方 bug 被吞——与 I1 eq:null 同类（静默即罪） |
| `where` 直传（query builder） | 编译为恒假——**0 行**（非放宽非报错——静默错数） | 同输入两语义——**确定性契约直接违例** |

`insert` 的 undefined 已被 zod 校验（探针：`name: expected string` ✓）——**唯一缺的是 where/filter 值面**。

**P1（重定位——原「错误面」大部分已到位）**：
- memory 未知列：`SELECT 未知列 'bogus'——pt 合法列：id, name` **已带列清单** ✓
- 未注册表：`表 nope 未注册（……orm.table 先行注册）` **已带引导** ✓
- 唯一冲突 23505→409 真库映射已在 client.ts ✓
- **剩余缺口**：真库 42703 英文消息无列清单（memory 有）——判负登记（可操作性已够）

**P2（类型化缺口）**：`paginate.sort: { field: string }[]`——field 宽字符串——平台曾踩
`sort 'created_at'` 运行时红（W5 记录）；`WhereFieldOf` 值面列型绑定先例已有
（typed-query.ts）——**sort 字段类型化是对称补全**（`keyof S`——拼写错编译期红）。

**P3（诊断面缺口）**：migrateModule 幂等 ✓（探针）——但**迁移后无人看**——平台 24 表
shape/DDL 漂移只有静态审计（check:shapes——CI 挂）——**运行时诊断面缺席**（开发期
改动忘同步 → 查询时才 42P01）。

**P4（平台样板残留）**：count+limit 手写分页 2 文件（departments/audit——需甄别：
聚合保留/纯 list 收口）· app_id 手写 14 文件（join/聚合合理——单表面甄别收口）。

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W0 | **undefined 值面定案**：`where/filter` 值 `undefined` 显式拒绝（统一错误消息「where 值不能为 undefined——省略键或显式 isNull」）——双路径行为一致（filterToWhere 不再静默跳过·where 不再恒假）；类型面（TWhere 值面 undefined 编译错——tsd 断言）；fuzz 补 undefined 案例（5 种子×201 对） | 契约 3+（filter 直测/where 直传/gql 面）· fuzz 对账绿 · tsd |
| W1 | **sort 字段类型化**：`paginate.sort: { field: keyof S }[]`（WhereFieldOf 先例——编译期防拼写错）——ctxTable/table 双面 · tsd 断言 · 平台兼容验证（2 处 paginate field 均属 shape 列） | tsd 2 断言 · 平台 tsc 0 |
| W2 | **checkConsistency 运行时诊断**：`pg.checkConsistency()`（表/列集/类型 diff——migrateModule 后显式检查——启动警告/debug 面）+ 契约（新增列忘补 shape → 诊断红） | 契约 3（表缺/列缺/类型漂移）· 平台 server.ts 启动接线（POSTGRES_MEMORY 与真库双面） |
| W3 | **平台样板收口（甄别）**：audit.ts count+limit → paginate（diff 验证——行数/排序等价）；14 文件 app_id 分类（单表面 2-3 处收口 ctxTable 试点——join/聚合保留 query——判负登记） | 平台测试绿 · diff 断言 · app_id 过滤计数下降登记 |
| W4 | **docs + 回归门**：§5.3 增补（undefined 契约/一致性诊断/sort 类型化·P1 重定位记录）+ 全量回归门 | 五域+audit 七线 · tsc 双 0 · 平台 475 |

## 判负记录（可被新论证推翻）

- **查询日志/Debug 开关**：不做——热路径成本 + 无真实排查场景（当前错误面已带
  列清单/引导——排查成本已可控）；推翻：出现需 SQL 级排查的线上问题
- **pg 错误码全表中文化映射**：不做——高频三件套（23505/23503/42703）已映射——
  消息可操作性够；推翻：平台出现非 english 不理解的错误码场景
- **迁移版本化框架（migration 文件/时间戳）**：不做——migrateModule 幂等声明式
  + checkConsistency 诊断已覆盖「漂移发现」；版本化是重工程（零消费）；推翻：
  平台出现需要历史演进迁移（数据搬运）的场景
- **memory 并发语义增强**：不做——单线程无交错已声明（诚实标注）；推翻：多
  worker 共享 memory 场景出现
- **query 兜底面深度类型化（values/where 字面量收窄）**：不做——typed-query/
  ctxTable 面已有类型化（先例）；query 面是动态兜底（设计如此）；推翻：平台有
  query 面拼错列名的实例（P0 运行时拒绝已兜住）
- **平台 app_id 14 文件全量 ctxTable 化**：不做——join/聚合必须 query 面（设计
  边界）；只收口**单表**读写面；推翻：出现纯单表 list 仍手写 app_id 的实例
- **String() 648 处专项清理**：不做——多数是 uuid 值传参的显式化（非 orm 缺陷——
  AppCtx 类型面是平台侧）；登记观察；推翻：出现 String(undefined) 进库的实例

## 执行实录（边做边记）

（待 W0 起填——探针重定位/波次结果/回归数字）

## 验收标准

- [ ] W0：双路径一致契约（filterToWhere 显式拒绝 + where 显式拒绝）· fuzz undefined 案例绿 · tsd 断言 1
- [ ] W1：sort field 类型化 tsd 断言 2 · 平台 tsc 0（兼容验证）
- [ ] W2：checkConsistency 契约 3 · 平台启动接线（警告面——不阻塞启动）
- [ ] W3：audit.ts 收口 diff 等价 · app_id 手写过滤计数下降（待基线重测）
- [ ] W4：docs §5.3 增补 · 框架全量（契约 433+ 增量 · 场景 123 · server 840+）· showcase 328 · audit:all 七线 · tsc 双 0 + typecheck:tests 0 · 平台 475
