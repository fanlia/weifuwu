# VDOM-CORE-EXCELLENCE-PLAN——vdom 内核全面优化计划（第四阶段·2027-10）
> **✅ 六波次全收官（2027-10）**：A `2b8ea1ad`（fuzz 扩容 1310 对 + 修复 move Post 规格错位/重建物理残留 2 内核缺陷）· B `9d3f7ef5`（audit:vdom 六红线哨兵）· C `37132aea`（popup 定位契约 8 + AGENTS 清单收敛）· D `fa224db1`（error-counter 去重计数 + render-health errors 轴——自愈不可消音）· E `8ca65cdf`（diff.ts 纯移动拆解——diffV2Node 165→102 行——契约保护修正抽取错误）· F（reducer 回放 4 + 命令流规模基线——收官）
> 终态防线：契约 417/417 · 场景 123/123 · showcase 320/320 · audit:all 七线 exit 0
> 已知缺口（登记）：keyed 组件顺移状态丢失（输出锚物理 move 方案——后续波次）

> **定位**：vdom 是 weifuwu/client 的核心引擎——所有组件/应用的质量上限。
> 本计划把前三阶段（组件验证 → 交互完整性 → client 全面优化）沉淀的方法论
> 反哺内核：**防线扩容 → 缺陷模式哨兵 → 空白补全 → 错误路径 → 结构治理 →
> 可观测回放** 六波次。
>
> **方法借鉴（三阶段经验映射）**：
> - 阶段 1 五步协议（现状核查→修复→真实验证→固化→清单更新）→ 每波次照搬
> - 阶段 2 哨兵红线 + 基线登记制 → vdom 历史缺陷案例机制化（G9/G10/G11）
> - 阶段 3 判负文化 + 增量追加模式 → 启发式不可用就判负；测试只补缺口不覆盖
>
> **现状基线（2027-10 侦察）**：
> - 强项：状态机 7 维度全覆盖 ✅ · 对账四层（Sim/devVerify/auditDom/fuzz）✅
>   · 流化收官（OBSERVABLE-COMPLETE）✅ · 性能防线（PERF-PLAN）✅
>   · observable 19 算子全测 ✅
> - 弱项：fuzz 规模缩水（AGENTS 记载 1200 静态+300 组件对——现存 2×200）
>   · diff.ts 786 行（diffV2Node 165 行/diffKeyedV2 142 行）
>   · hooks/env.ts 四 hook 未测（AGENTS 已知空白）· popup-manager 562 行
>     契约层薄 · R1 自愈语义无计数哨兵 · testing.ts 不变量无强制哨兵

---

## 1. 波次 A：对账防线扩容（最高优先——恢复历史防线规模）

**实证**：fuzz-robust 现存 2×200 对（D2/D4）——AGENTS 记载历史规模
1200 静态 + 300 组件——防线退化（历史成果未守住）。G9 重复 key 歼灭、
G10 removalParent、G11 可变输出等修复全靠 fuzz 暴露——规模 = 捕获力。

- A1 fuzz 规模恢复：静态树 1200 对 + 组件树 300 对（分测试文件拆分
  runtime——node:test 并发——守住 ~10s 契约层预算）
- A2 fuzz 生成器扩维：① 锚点（空洞）穿插概率 ② keyed 组件 key 池
  含特殊字符（`.`/`%`——keyedId 转义回归面）③ 组件输出形态随机化
  （vnode/hole/array 互变——G11 面）④ Fragment 嵌套深度 3+
- A3 seed 池扩展：固定种子 [11, 99, 2026, 31] + 新增 8 个（历史实证
  seed 优先入库——回归资产）
- 验收：fuzz 规模 1500 对全绿 + reconcile G9-G11 回归段完整（3 案例
  注释引用 seed/场景可追溯）

## 2. 波次 B：缺陷模式哨兵（vdom 版 audit——阶段 2 经验平移）

**实证**：历史内核缺陷（G9 重复 key/G10 removalParent 错位/G11 可变
输出/单锚 remove/`!== null` 判定/startsWith 裸前缀）都是「模式级」的
——组件层 audit:interactivity 证明：模式可 grep、可机制化、可红线。

- B1 `scripts/audit-vdom.mjs`——六红线（grep + 人工甄别豁免登记）：
  ① `!== null` 判定 lastOutput（null 纪律——4 处遗漏实证——必须
  `!== undefined`）② 单锚 remove（`procRemove|emitRemove` 单 id 非
  区间——removeVNodeTree 单一实现源）③ `startsWith(` 裸前缀 id 匹配
  （keyedId 转义回归——须用索引/转义工具）④ `PATHS[name].map` 类
  裸索引访问（A4 同款——renderFn 崩溃面）⑤ setTimeout/setInterval
  在渲染路径（effect-guard 已运行时守卫——静态面补齐）⑥ 空字符串
  双语义（isHoleKind/isTextKind 外的 `''` 判定点——编码唯一性红线）
- B2 案例库：六红线各配契约锁定案例（reconcile/契约测试——修复
  历史 + 防回潮双向）
- 验收：audit:vdom exit 0 + package.json 挂载 + 案例库 6 条全绿

## 3. 波次 C：hooks 契约补全（已知空白清零——增量追加模式）

**实证**：AGENTS「已知边界」自认 useTween/useReducedMotion/
useVisualViewport/useDrag 未测（headless 无 reduced-motion 偏好）；
popup-manager 562 行参数矩阵主要靠场景层——契约层薄（引擎面回归
成本高）。

- C1 env.ts 四 hook：mock matchMedia/visualViewport/PointerEvent
  ——getter 语义 + 直落分支 + 退订清理（契约级——零浏览器）
- C2 popup-manager 参数矩阵契约化：placement 四方向计算/mask 开关/
  trapFocus 焦点环/presence 退场时序——命令流级断言（复用
  component-harness——浮层 mini-root 渲染链已验证可测）
- C3 增量追加纪律：先 `git show HEAD` 查旧断言面——只补缺口
  （批次 9 教训——重写覆盖丢资产）
- 验收：hooks 空白归零（AGENTS「已知边界」清单收敛）+ popup 契约
  ≥8 条

## 4. 波次 D：错误路径与恢复语义（「自愈不可掩盖错误」）

**实证**：R1 熔断（renderFn throw → hole 降级 → 重试自愈）+ A4 Icon
防御（降级循环刷日志实证）——自愈是容错不是消音。阶段 3 D1 经验：
错误计数 0 为基线、非 0 现形。

- D1 R1 恢复语义契约：熔断 → 影子树重置 → 下一拍全量 build 的
  命令流断言（重试恰一次/不重复 mount/不残留段表）
- D2 错误计数哨兵：renderFn 错误 → console.warn 恰一次（去重——
  循环刷日志禁）+ dev 模式错误计数暴露（接 render-health 第四轴
  `errors`——快照字段）
- D3 async-guard 栈豁免语义：事件回调期合法/工厂期违例边界锁定
  （effect-guard 现有 6 测试扩——异步边界矩阵）
- 验收：契约 ≥6 条新锁 + render-health snapshot 含 errors 字段
  （dev）+ 循环刷日志回归案（Icon 类）不再复现

## 5. 波次 E：diff.ts 结构治理（判负缓行——缝隙测试优先）

**实证**：diffV2Node 165 行 / diffKeyedV2 142 行——复杂度集中。
但内核重构风险极高——历史全部语义修复（G9-G11）都在这两个函数的
分支缝隙里。**对账器保护下纯移动重构才做；语义改动一律判负**。

- E1 分支覆盖清单：diffV2Node/diffKeyedV2/transformV2 逐分支盘点
  （transition 6×6/keyed 五分支/输出特判）→ 缺口补契约（先测后动）
- E2 纯移动拆解：diffV2Node 的 keyed 子段抽 `diffKeyedChildrenV2`
  （已有同名概念——对齐 v1 命名）——仅移动不改语义——fuzz 全绿
  + 对账零 diff 为验收
- E3 语义重构判负：分支合并/范式升级类——除非 fuzz 捕获新 bug
  否则不动（收益判负记录在案——不造仪式重构）
- 验收：E1 清单零缺口 + E2 拆解后 fuzz 1500 对全绿 + diff.ts
  单函数 ≤100 行（纯移动达成）

## 6. 波次 F：可观测性与回放（流化收益兑现）

**实证**：OBSERVABLE-COMPLETE 落了 machine\$ 模式（AbsorbState/
PopupPhase reducer）——「回放 = 同函数重喂记录流」是定稿纪律但
**回放测试未落地**；applied\$ 可观测但无采样基线。

- F1 reducer 回放测试：AbsorbState failed 流/PopupPhase events\$
  ——记录事件序列 → 重喂同序列 → 状态轨迹全等（回放确定性锁定）
- F2 命令流采样基线：applied\$ 命令数/周期数——契约层基线测试
  （10k 节点 build/diff/applies 三计数——PERF-PLAN 生成端基线对齐）
- F3 render-health 扩维：errors 轴（D2）接入 snapshot——四轴完整
- 验收：回放测试 ≥3 条 + F2 基线测试 + snapshot 四轴

---

## 7. 流程纪律（三阶段沉淀——照搬）

1. **五步协议**：现状核查 → 修复 → 真实验证（playwright/命令流实测）
   → 固化（契约/哨兵）→ 清单更新
2. **增量追加**：写测试前 `git show HEAD:<file>` 查旧断言面——只补缺口
3. **判负文化**：启发式误报 >30% 判负（A3/E1 先例）；重构收益不明判负
   （E3）；判负必须登记（为什么/替代方案）
4. **修复归类**：内核修复必配契约测试；组件层异常先查内核根因
5. **批次节奏**：每波次 1-2 commit（含回归 + 文档更新）——单波次
   收官再进下一波次
6. **全量回归门**：契约 398+/398+ · 场景 123/123 · showcase 320/320 ·
   四 audit（interactivity/theme/api/bundle）exit 0——任何批次末必跑

## 8. 验收判据（红线汇总）

1. fuzz 1500 对全绿（1200 静态 + 300 组件）+ 扩维生成器
2. audit:vdom 六红线 exit 0 + 案例库锁定
3. hooks 空白归零 + popup 契约 ≥8
4. R1 恢复语义锁定 + render-health 四轴（含 errors）
5. diff.ts 纯移动拆解完成（单函数 ≤100 行）+ 语义重构判负记录
6. 回放测试落地（AbsorbState/PopupPhase）+ 命令流采样基线
7. 全量回归门持续绿（任何批次末）

## 9. 执行顺序与依赖

```
A（fuzz 扩容——后续波次的安全网，必须最先）
  └─ B（哨兵——依赖 A 的案例库双保险）
       └─ C（hooks 契约——独立可并行）
            └─ D（错误路径——依赖 C 的 popup 契约脚手架）
                 └─ E（diff 治理——依赖 A 防线 + B 哨兵全绿才动）
                      └─ F（回放——收尾兑现流化收益）
```
