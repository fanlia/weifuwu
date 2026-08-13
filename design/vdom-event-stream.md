# vdom 事件流：状态机观测协议（2026-12）

> 目标：vdom 流程透明可测可控可日志——**状态机管"转换"，事件总线管"观测"，
> sink 管"输出"，audit 管"校验"**。执行层（DOM/坐标计算）不进事件流。

## 1. 事件协议（`src/ui-dom/vdom2/events.ts`）

```ts
interface VdomEvent {
  session: string    // 渲染会话 R{n}——一次 renderOne/renderPath = 一棵事件树
  machine: VdomMachine  // route | lifecycle | x2y | keys | pos | render | build | mount | diff
  nodeId: string | null // 关联 vnode _id（实例级追溯）
  component: string | null
  from: string       // 旧状态/旧 kind
  event: string      // 触发事件/转换名
  to: string         // 新状态/新 kind
  payload?: unknown  // 结构化附加数据（可惰性函数——高频路径零字符串成本）
  level?: VdomLevel  // console sink 门控（复用 trace 开关）
  ts: number
}
```

**sink 架构**（多路输出，生产零开销——emit 首行检查）：
- `console`：人类可读（复用 trace 阶段开关，格式兼容旧 trace）
- `ring`：最近 500 条（`__vdom_events(n, filter)` 查询——事故现场可追溯）
- `collect`：测试断言（`makeEventCollector()`）
- `audit`：不变量校验器（订阅事件流而非事后遍历）

**session 管理**：`beginSession/endSession`（renderOne/renderPath 入口/出口），
期间所有 emit 继承当前 session——一次渲染 = 一棵事件树，可整体导出/回放。

## 2. 状态机分层

```
ctx.ui.render()
 └─ render 调度状态机（per-id 串行链 + PARENT 事件）
     ├─ 树内组件      → PARENT=MOUNTED（_parentNode 原地）
     ├─ 根组件        → PARENT=ROOT（portal 壳/关闭渲染经 rootEl）
     ├─ 构建中自渲染  → PARENT=SKIP_BUILDING（父树构建承载——正常）
     └─ built 无定位  → PARENT=SKIP_DETACHED（挂载信息断裂——audit 报错）
     ├─ buildVNode ── lifecycle 状态机（fresh→building→built/pruned/disposed）
     └─ patchValue ── x2y（类型转换）× keys（数组策略）× pos（位置转换 + INSERT）
```

## 3. 事故 → 事件断言映射表（防复发清单）

| # | 事故 | 事件断言（machine/event/to/payload） | 状态 |
|---|---|---|---|
| 1 | stray 兄弟树（rootEl fallback） | render/PARENT：非 building 非根组件必须 ≠ SKIP_DETACHED | ✅ audit + 测试 |
| 2 | 卡片自 dispose（两阶段契约违反） | audit/CONTRACT_VIOLATION：新树数组出现 disposed vnode（复用旧对象） | ✅ 检测 + 集成测试 |
| 3 | 连续 append 串位 | pos/INSERT：`insertedBefore` 不得指向本次 diff 已插入的节点 | ✅ 测试 |
| 4 | 提交按钮消失（空洞错位） | pos/HOLE_FILL：占位按数组下标 replaceChild（childNodes 与数组同构） | ✅ 测试 |
| 5 | Fragment 夹兄弟串位 | pos/INSERT：插入点不得越过 fragment 边界（不指向已插入项） | ✅ 测试 |
| 6 | 剪枝空壳（dispose 后复用） | lifecycle：PRUNE 时旧 vnode 不得是 disposed（canReuse 已拦——事件见证） | ✅ canReuse + 事件 |
| 7 | 快速连续导航竞态 | route：转换序列必须满足转换表（非法 → to=? 事件） | ✅ 测试 |
| 8 | 并发渲染互相踩 patch | render：per-id 串行链——同 id 不并发（排队合并补跑） | ✅ 链式实现 |
| 9 | dispose 丢 nodeId | lifecycle/DISPOSE：必须携带真实实例 id | ✅ 修复 |
| 10 | 构建中自渲染（onAnchorChange） | render/PARENT=SKIP_BUILDING：跳过且不 fallback rootEl | ✅ 修复 + 测试 |

## 4. 不变量 audit（`src/ui-dom/vdom2/audit.ts`）

`installMountInvariantAudit()` 订阅 render/PARENT 事件——`SKIP_DETACHED`（built/pruned
无定位）在**转换瞬间** `console.error`（`__WF_VDOM_AUDIT` 开启时），替代事后
`auditTree` 整树遍历的盲区。

## 5. 明确不覆盖（独立防线）

| 面 | 事故 | 防线 |
|---|---|---|
| 属性语义 | draggable enumerated / style 只设不删 / once 误判事件 | transform.ts 通道单一源 + 属性测试 |
| 组件契约 | 内联 ref / 受控输入焦点 | 组件纪律（§5.1/§5.3）+ useControlledInput |
| 外部时序 | 弹层 0-rect / SSR mismatch | usePopupPosition 防护 + dev 检测 |

事件流是**决策记录**——同步、纯；外部异步时序（scroll/rect/IO）需"动作完成"
事件辅助诊断，根治靠防护逻辑本身。
