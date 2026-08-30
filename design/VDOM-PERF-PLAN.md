# VDOM 性能升级计划（2027-09——admin 全量渲染 59s 实证驱动）

> **✅ 已完成归档（2027-09）**：波次 1/1b/2/3 + 防线契约全交付——提交
> `f7efb140`（三表索引化）`0a44da69`（ref 回退索引化）\
> `9bf0687e`（e2e-perf 防线契约）`fb565eb6`（同步收集 + React 对照）——
> 验收：admin 全量卸载 59s→310ms（190x）；10k 基线 113→81ms；React 19
> 对照 mount 0.83x/update 0.96x；契约 57-100/场景 6-12/ui 61 全绿；tsc 0——
> 实施实录见本文 §4 演进记录 + §6 React 对照；判负记录（removeTree/\
> data-wf-id 按需写）见 §6。
>
> 触发：用户决策「/admin 租户表全量渲染（不截断/不分页）」——以 vdom 核心层
> 性能升级根治（而非应用层规避）。仓库纪律：核心层修复惠及全部组件。
> **诚实基线**：全量 1604 行 = 1622 tr / 12976 td / 3248 button / ~160k 节点——
> 从 /admin 切走（卸载）实测 **59s**（Long Task）——超线性（200 行时 1.15s——
> ×8 数据 → ×50 时间——O(N²) 特征）。

---

## 1. 实证画像（浏览器内——真实消费端）

| 场景 | 规模 | 耗时 | 结论 |
|---|---|---|---|
| 引擎命令流（contract v2-lifecycle） | 10k 节点 build+diff | **113ms** | 生成端（build/diff）**快**——非瓶颈 |
| admin 页渲染（全量） | 160k 节点 | 页面可出（数秒） | mount 线性——可接受 |
| admin → agents 切换（200 行时代） | 20k 节点 | 1.15s（Long Task 1153ms） | 卸载超线性 |
| admin → agents 切换（全量 1604 行） | 160k 节点 | **59s**（Long Task 59172ms） | **O(N²) 实锤** |

**归因**：×8 数据 → ×50 时间（线性应为 ×8）——符合 O(N²)。候选点全部在
**消费端**（proc*）：

```
procRemove（processors.ts:215）：
  const prefix = cmd.id + '.'
  for (const id of [...applier.nodes.keys()])      ← 每次 remove 全量扫 nodes（160k）
    if (id.startsWith(prefix)) ...
  16k 条 remove × 160k 节点 = 2.6B 次 startsWith    ← 主元凶
```

次要（记入波次 2——同族）：
```
procInsert ref 组件 id 回退（processors.ts:155）：ref 指向 compId 时全量扫
  nodes 找前缀最后命中（每插入 O(N)——仅 ref=组件 id 路径——常规列表不触发）
remapSubtree（patch/index.ts:76）：nodes/事件/registry 三表前缀全量扫描
  （仅 keyed move 触发——每次 O(N)——keyed 大列表移动场景）
```

---

## 2. 优化矩阵（按 ROI 排序——实证驱动——无场景证据不造抽象）

| # | 面 | 机制 | 复杂度 | 收益 | 波次 |
|---|---|---|---|---|---|
| P1 | **procRemove 子树索引** | nodes 表之外维护 `childIds: Map<父id, Set<子id>>`——remove 时 DFS 收集子树 O(k)——替换前缀全量扫描 | O(N²)→O(N) | **59s → 目标 <2s** | 1 |
| P2 | procInsert ref 组件 id 回退索引化 | 同一 childIds——ref=compId 时取子空间「最后前缀命中」= 索引末项 | O(N)→O(k) | 流式列表 ref 路径 | 2 |
| P3 | remapSubtree 三表索引联动 | 迁移时同搬 childIds（顺带）；三表全量扫描本身保留（move 低频） | 不变 | 消除与新索引的漂移 | 2 |
| P4 | done.full touched 清理 | 复用索引只扫未 touched 子树（当前全量一次——线性——低优先） | 不变 | 边缘 | 3 |
| P5 | 事件代理（16k 事件单监听） | 已有 document 捕获代理 → 无需优化（实证过） | — | 判负 | — |
| P6 | Table/Button 组件层 | 组件实例数 = 渲染数——全量场景本质成本——组件级优化面（keyed columns 等） | — | 场景证据不足——**判负**（不造抽象） | — |

**P1 细节**（单一实现源——index.ts 持有索引——processors 消费）：
- `registerChild(parent, id)`：procInsert 成功后登记（幂等 Set）
- `collectDesc(id)`：DFS 收集子树（含自身）——O(k)
- 维护点：insert（登记）/ remove（收集+删除）/ remapSubtree（前缀迁移）/
  reset（清空）——**id 前缀依赖是防御兜底——索引是主路径——两表强一致**
- **父键语义**：按 cmd.parent 字符串（组件逻辑父也可能是键——与 DOM 树
  不同构——但 id 空间逻辑树一致——collectDesc 从自身出发——不受影响）
- 防御保留：`nodes.get(id)` 不符时仍走旧兜底（注释历史 bug 场景——索引
  未覆盖的路径显式降级——不允许静默）

## 3. 验收（each 波次）

| 项 | 判据 |
|---|---|
| 契约层 | 全量 `npm run test`（contract）绿——diff/keyed/reconcile/fuzz 1200+300 |
| 场景层 | e2e-reconcile 真实 DOM 对账绿（id 唯一/兄弟连续/投影完整） |
| 浏览器实测 | admin 全量 1604 行 → 切走 ≥ **10x**（59s → <6s）；同 200 行时代 1.15s → <300ms |
| 回归 | test:ui 61/61；tsc 0 |
| 防线 | 性能契约 v2-lifecycle 10k <2s/<500ms 保持 |

## 4. 演进记录

- **2027-09 波次 2（P2——已完成）**：procInsert ref 组件 id 回退索引化——
  原实现 nodes 插入序全量前缀扫描（O(N)——chat avatar 每插 O(N)）→ childIds
  DFS + 插入序 seq（O(k)）——兜底保留（索引未覆盖旧树——防御降级）——
  等价性证明：seq 单调递增 = 原「nodes Map 最后前缀命中 = 最新插入」语义；
  remap 不迁移 seq（插入序语义与 id 路径无关）。验证：admin 切换保持 312ms
  （无回归）；chat.test 9/9（流式滚动/工具占位——ref 路径）；契约 100/100；
  场景 12/12；tsc 0
- **2027-09 波次 2（P3——顺带完成）**：remapSubtree 的 childIds/byChild
  前缀迁移（P1 实施时已联动——keyed move 后续 remove 索引一致）——三表
  全量扫描本身保留（move 低频——场景证据不足不预优化）
- **2027-09 波次 1（已完成——commit f7efb140）**：
  - P1 procRemove 子树索引（childIds/byChild——O(N²)→O(k) DFS）
  - P1b **事件表/ref 表单删 O(1)**（removeOne/unmountOne——原 remove/unmount
    也是全量前缀扫描 × 16k 条 = 双倍 O(N²)——实测节点索引后仍 15.3s——
    三表索引化后 **310ms**）
  - 实测：admin 全量 1604 行切走 **59172ms → 310ms（190 倍）**——唯一长
    任务 310ms；页面 3s 内就绪；契约 88/88 + 场景 12/12 + ui 61/61 绿；tsc 0
- （历史）2027-08：全量 1292 行 2.4s 卡死 → 应用层截断 200（本计划撤销——用户决策全量）

### 波次 3（待场景证据——不预造）
- P4 done.full touched 清理复用索引（当前全量一次——线性——仅重复 done
  场景受益——无实证触发）——**判负门槛**：若出现 done 多次调用场景（导航
  快切）再索引化
- P6 Table/Button 组件层（组件实例数 = 渲染数——全量场景本质成本——无
  场景证据——继续判负）

## 5. 防线契约（防回归）

- **场景层 e2e-perf.test.ts**（2027-09——波次 1/2 后补）：6000 行 × 4 节点
  （24000 节点 + 6000 事件绑定）——卸载 <2s + 更新 diff <1s + id 对账零违例
  ——旧 O(N²) 代码数学预期 14s+（2.9 亿次 startsWith）——必挂——
  实测（新代码）：卸载 135ms / 更新 199ms
- 契约层 v2-lifecycle 性能基线（10k 节点 build<2s/diff<500ms）保留

## 6. React 19 对照基准（2027-09——真实生产框架对比）

**方法与公平性**（bench/react-compare/——React 19.2.8 vs weifuwu——同构
6000 行 × 4 节点 + **同一份 components.css 280KB**）：

| 指标 | React 19 | weifuwu | React/wf | 结论 |
|---|---|---|---|---|
| mount | 776ms | 933ms | 0.83x | 接近（差距 20%） |
| unmount | 48ms | 160ms | **0.30x** | 真实差距 |
| update | 200ms | 208ms | 0.96x | **持平** |
| remount | 738ms | 904ms | 0.82x | 接近 |

**关键教训（教训机制化——避免误判）**：① 首次对比无 CSS 对齐——React
「快 3.3x」假象——**CDP (program) 64.7% 是 CSS 布局**（双端同等承担——
对齐后差距 3.3x → 1.2x）——**性能对比必须同负载**；② CDP Profiler 采样
必须按 profile.samples（nodes 是函数定义数——非样本）——脚本 bug 教训。

**差距归因（CDP）**：mount/unmount 无单点热靴（最高 0.5%）——分布式
线性成本——unmount 剩余差距 = 命令粒度（React fiber 递归一次提交 vs
逐元素 remove 命令 + 每节点簿记）——**批命令（removeTree）收益评估
~70ms/场景且用户感知面无触发（admin 310ms 已无感）——判负延后**。

**已完成优化（本轮）**：
- renderV2Node 同步收集重构——v2 流全部同步完成（工厂/渲染同步）——
  每节点 fromArray+concatObs（48000 流对象/6000 行）→ 单数组收集 + 外层
  单 fromArray——外部 Observable 形态/管线纪律（原子性在 toArray/周期层）
  不变——10k 基线 113ms → **81ms**（-28%）

| 优化波次 | 内容 | 实测 |
|---|---|---|
| 波次 1/1b | 消费端三表索引化（procRemove O(N²)→O(k)） | admin 59s→310ms |
| 波次 2 | procInsert ref 回退索引化 | chat 流 ref 路径 O(N)→O(k) |
| 波次 3 | renderV2Node 同步收集（流对象 48000→1/树） | 10k 基线 113→81ms |
| **判负** | removeTree 批命令（13→14 命令协议——Sim/verify/断言迁移） | 收益 ~70ms 无用户感知场景 |
| **判负** | data-wf-id 按需写入（事件节点才写——双语义风险） | 收益 ~20ms 风险大 |
