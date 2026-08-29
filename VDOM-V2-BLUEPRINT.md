# VDOM-V2-BLUEPRINT — vdom 核心完整重构（全 Observable——透明化）

> 2027-08 架构决策（用户）：**vdom 等核心功能完整重构——不能裁剪**。
> 根本动因：补丁模式已多次证明不能根治（复用失败反复出现——应用层掩盖框架
> 根因）。v2 = v1 **全部能力等价** + **一切皆流（透明）**——「复用失败/调度
> 竞态/生命周期泄漏」整类语义消除——**流程透明化**（每层可 tap/回放/快照）。
> 执行：**并行双引擎 + 对账器等价裁决**（v1 平台不停摆——成熟后切换）。

---

## 1. 能力对齐矩阵（v2 必须 100% 等价——零裁剪）

| 面 | v1 机制 | v2 形态 | 等价测试 |
|---|---|---|---|
| 命令流 | 14 种命令（create/createText/createAnchor/insert/move/remove/setText/setProp/ref/unref/mount/unmount/close/done）——完整自足 | **不变**（Observable<Command> 生成——命令语义零改） | 246 契约保留 |
| build | 树递归 → Command[] | **VNodeStream**（惰性事件流——defer/merge） | build.test |
| diff | 树遍历对照（same/children/output/cleanup） | **对照管道**（zip 同位置 ∪ merge keys 身份） | diff/keyed/attrs |
| transform | 6×6 状态迁移表 | 流的状态算子（reducer） | transform 契约 |
| 调度 | renderPhase FIFO + 熔断 | **render$**（buffer+flush 合并——batching） | 调度契约 |
| 生命周期 | onUnmounts 数组 + dispose | **destroy$**（单信号——takeUntil） | lifecycle 契约 |
| 实例复用 | rec 查找（keyedId——bug 温床） | **流段共享**（同 key = 同一订阅段） | component-reuse |
| 组件输出 | 判别联合（vnode/hole/array） | 输出流水（对照 = 流对比） | output 契约 |
| SSR | uiSsr + AbsorbState + html | 吸收 = 流消费（命令流对照） | ssr-adopt |
| 对账器 | Sim/devVerify/auditDom/fuzz | 流视角（命令流回放对账） | reconcile/fuzz |
| 事件/ref | EventRegistry/RefRegistry | 保留（字段面） | events/ref |
| portal | openPopup 内核 | 保留（hooks 面已流化） | popup 场景 |
| keyed | keyedId + 转义 + 重复检测 | 流 merge 的 key 语义（同源） | key/keyed |
| 状态机 | NodeState/CompState 显式表 | 状态 = 流的折叠（scan）——**Post 断言保留** | state-machine |
| 吸收失败回退 | 原子回退 | 流的 catchError → 回退 | e2e-21 |

**完成定义 = 矩阵全绿**（不是「感觉重构完」）。

---

## 2. 五层流管道（透明化的架构）

```
事件流   用户输入/WS/定时器/生命周期        → 单一事件流（可记录/回放）
状态流   状态 = 事件流的折叠（scan/Behavior） → 可重放（时间旅行）
渲染流   VNode 流（defer/merge 惰性）        → 组件挂载/更新/卸载事件
命令流   对照流（zip/merge）→ Observable<Command> → 核心锚点（246 断言）
消费流   proc*（DOM）/ commandToHtml（SSR）/ Sim（对账）——同构三投影
```

**透明三机制（内建——非附加）**：
1. **审计钩子**：每层 `.pipe(tap())`——插桩 = 流的自然操作（v1 需改源码）
2. **流回放**：事件流记录 → 重放（时间旅行——用户报 bug → 回放定位）
3. **快照**：每层 Behavior 当前值（任意时刻完整真相）

**透明验收项**：五层流全部可 tap/可回放/可快照（——是 v2 的验收项）。

---

## 3. 执行阶段（并行 + 对账——范围完整）

### 阶段 1（2-3 周）：核心原型（关键风险验证）
- VNodeStream（vnode 树 → 惰性事件流）
- 对照管道（zip / key merge）
- 调度流（render$ buffer+flush）
- **性能/等价验证**：v1 vs v2 最小场景命令流对比——**慢于 v1 不切换**（守则）
- 交付：`src/client/vdom/core/v2/`（并行目录——不碰 v1）

### 阶段 2（2-3 周）：完整面
- 组件输出流 / destroy$ / SSR 吸收流化 / keyed 同源 / 状态机流折叠
- 对账器流视角 + 246 契约全绿（v2 引擎跑全部）+ 场景 116 绿

### 阶段 3（1-2 周）：切换
- v2 默认 + v1 退役 + 全量回归（246+116+200+289 + tsc 双侧 0）
- 对账器保留（回归照跑）

**总预估：6-8 周**——每阶段独立验收可回退——v1 平台不停摆。

---

## 4. 守则（完整 ≠ 鲁莽）

1. **能力矩阵 = 验收清单**（逐项独立测试绿）
2. **246 契约保留**（命令流断言——v2 产出同构——测试不重写）
3. **对账器/fuzz 裁判**（终态等价——非「感觉对」）
4. **性能基准**（v2 diff ≤ v1——超即回退）
5. **透明验收**（五层可 tap/回放/快照）
6. **不留后置/豁免**（OBSERVABLE-ARCH core 流化后置的教训——本次一次性完整）
