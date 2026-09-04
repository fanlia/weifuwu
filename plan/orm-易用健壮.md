# orm 易用健壮优化（2027-xx）

> 在 orm 收敛态（`0261e964`——零 SQL 兜底）上补「健壮」：两端行为一致性 +
> 失败显式化；「易用」：样板收口 + 列定义文档化。动机 = 探索中发现的结构面
> 弱点（下面探针读数锚定）——不是臆想。

## 现状探针（先读数——2027-xx 数字锚点）

```
[memory] 未知列 where → 静默返回 []    （恒 false——静默空结果）
[memory] 未知列 select → 返回 [{}]     （静默丢列——与真库 42703 行为不一致）
```

- **P1 头号缺口**：列错 = 静默错误（memory 空结果/丢列）——业务表现「列表空了/
  审批不通」——排查成本极高；真库同查询 → 42703 → 400 报错——**两端不一致**
- P2：`memoryAdapter` 无 `transaction`（orm.transaction 对 memory = no-op 直跑——
  无回滚）；`MemorySql.snapshot()/restore()` 已存在（`memory-sql.ts:469/488`）——
  回滚能力已有，缺接线
- P3：`compile-fuzz.test.ts` 值面算子（mergeAppend/mergeInc/now/nowInterval/colRef）
  零覆盖（grep 0）——fuzz 1310 对基线只覆盖合法域（列/值从已知集生成）——
  合法域内等价 ≠ 合法域外行为（P1 正是域外缺口——校验器职责非对账器）
- P4：平台多查合并手工样板 14 处 Map/Set 惯用法（messages.ts 三查合并等）——
  标量子查询判负后的正解样板——**模式多样**（Map/Set/逐条判定三种形态）
- P5：列定义双语法并存——`shapes.ts` 用 `f.req/f.pk/f.now`（28 处）vs
  `tables.ts` 用 `.meta({notNull:true})`（161 处）——互相可读可写，无统一正门

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | **未知列校验（两端一致报错）**：memory 建表记列集——where/select/orderBy/groupBy/having 列引用校验（别名拆 `.` 后段、`*` 放行、RawSql 跳过）→ ProtocolError 带合法列清单；table 层 `toDbCol` 未知列 → ValidationError（shape 白名单 + 列清单提示） | 契约：memory 未知列 where/select → 报错（带列清单）；table 层同断言；平台全量测试绿（无合法但未注册列） |
| W2 | **memory 事务快照回滚**：`memoryAdapter.transaction` = snapshot → fn → catch restore + 重抛（引擎已备 snapshot/restore——只接线） | 契约：事务内失败 → 外观察不到部分写入 |
| W3 | **fuzz 值面算子补对账**：compile-fuzz 生成器加 mergeAppend（jsonb 追加随机值）/mergeInc（随机 n）——确定值域；now/interval/colRef 时间敏感不进 fuzz（契约已覆盖） | fuzz 对账样本 ≥ 1310+200 新对 0 不等价 |
| W4 | **平台测试 memory 接入**（用户定案大方向）：`postgres({ memory: true })` 或等价入口——46 文件内存跑（AST 直执行零 wire） | 平台测试全绿 15-30s（零 docker）；audit-orm 0 执行面 |

## 判负记录

- **不做多查合并收口 API**（`batch()`/`joinGroups()`）：P4 三种形态（Map/Set/
  逐条判定）——抽象 = 创造第四个模式而非收口第 14 处——**替代**：文档化
  「主查 + 组查 Map 合并」惯用法（audit 示范写法进 docs）——**推翻条件**：
  出现第 3 个「主查 + 姓名映射」同构（对齐 audit 两查模式——单一形态可收口）
- **不做列定义语法统一**（rename `.meta({notNull:true})` → `f.req` 机械替换
  161 处）：两语法是**合理分工**——tables.ts 是 DDL 声明面（meta 直写贴 DDL
  语义——列型/默认/NOT NULL 全写一处）；shapes.ts 是 API 校验面（f 语义化）——
  **替代**：docs 写明分工（正门=meta 声明面/f 校验面）——推翻条件：出现
  第三处混用面或新人反馈读不懂
- **不做 `insertOne()` 自动 returning**：平台 insert 全自带业务生成 id
  （`f.pk` DEFAULT 仅兜底）——DB 生成面只有 created_at——收益感知不成立——
  推翻条件：出现「插后必须取 DB 生成值」的场景（超 2 处）

## 执行实录（边做边记）

（待 W1 起——探针重定位/波次结果/回归数字）

## 验收标准

- [ ] W1：契约 2 条（memory/table 列校验报错+列清单）+ 平台全绿（无合法列误伤）
- [ ] W2：契约 1 条（事务回滚）+ memory-pg-platform 回归绿
- [ ] W3：fuzz 新对 0 不等价 + 基线不回归
- [ ] W4：平台 46 文件内存跑全绿 + 时间读数登记
- [ ] 全量回归门：契约+场景+showcase+server+shared + audit 七线 exit 0 + tsc 0
- [ ] 判负 3 条登记齐全 + 生效规则并入 docs/server.md（数据库章节）
