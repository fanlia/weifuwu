# vdom 四状态机架构（route / lifecycle / x2y / KEY_DIFFERS）

> 状态：**实施中**（2026-12）
> 背景：demo 搜索序列暴露「dispose 掏空旧树但 build 剪枝按引用误判可用」——
> 多路径复用旧树各自判断有效性 → 生命周期状态机是统一状态源，根治此 bug 类别。

## 1. 架构总览（从上到下）

```
┌────────────────────────────────────────────────────────┐
│ ① 路由状态机（route）——页面级·宏观                     │
│    idle → navigating → settled                          │
│    NAVIGATE_START / NAVIGATE_DONE / NAVIGATE_ERROR      │
├────────────────────────────────────────────────────────┤
│ ② 节点状态机（lifecycle）——vnode 级·微观               │
│    fresh → building → built → pruned → disposed         │
│    BUILD_START / BUILD_DONE / PRUNE / DISPOSE           │
├────────────────────────────────────────────────────────┤
│ ③ 转化状态机（x2y）——diff 转换分派                     │
│    TRANSITIONS[oldKind][newKind]（已实现）              │
├────────────────────────────────────────────────────────┤
│ ④ key 状态机（KEY_DIFFERS）——数组 diff 策略分派        │
│    KEY_DIFFERS[KeyMode]（已实现）                       │
└────────────────────────────────────────────────────────┘
```

**统一架构模式**：状态定义 + 事件 + 转换表 + 查表分派——机制透明、可维护、可 trace。
**统一原则**：分派逻辑走查表（状态 × 事件 → 行为）；值判断（props 相等/null/tag 匹配）保留条件。

## 2. 路由状态机（route.ts——新建）

```ts
type RouteLifecycle = 'idle' | 'navigating' | 'settled'
type RouteEvent = 'NAVIGATE_START' | 'NAVIGATE_DONE' | 'NAVIGATE_ERROR'

const ROUTE_TRANSITIONS: Record<RouteLifecycle, Partial<Record<RouteEvent, RouteLifecycle>>> = {
  idle:       { NAVIGATE_START: 'navigating' },
  navigating: { NAVIGATE_DONE: 'settled', NAVIGATE_ERROR: 'idle' },
  settled:    { NAVIGATE_START: 'navigating' },
}
```

职责：页面级导航状态。协调器在 navigate 时：
- `NAVIGATE_START` → 旧树全部 DISPOSE（节点状态机）→ 新树 buildVNode
- `NAVIGATE_DONE` → settled（新树渲染挂载完成）
- `NAVIGATE_ERROR` → idle（导航失败回退）

## 3. 节点生命周期状态机（lifecycle.ts——已实现，补全 native）

```ts
type Lifecycle = 'fresh' | 'building' | 'built' | 'pruned' | 'disposed'
type LifecycleEvent = 'BUILD_START' | 'BUILD_DONE' | 'PRUNE' | 'DISPOSE'

const TRANSITIONS = {
  fresh:    { BUILD_START: 'building', BUILD_DONE: 'built', PRUNE: 'pruned', DISPOSE: 'disposed' },
  building: { BUILD_DONE: 'built', DISPOSE: 'disposed' },
  built:    { BUILD_START: 'building', PRUNE: 'pruned', DISPOSE: 'disposed' },
  pruned:   { BUILD_START: 'building', PRUNE: 'pruned', DISPOSE: 'disposed' },
  disposed: { BUILD_START: 'building' }, // 重建
}
```

- 组件：fresh → building（异步工厂 await）→ built
- **native/Fragment/Portal：fresh → built（同步递归构建，无中间态——BUILD_DONE 直接）**
- 所有 vnode 统一生命周期（native 也标记——audit 可校验整棵树）

**五条不变量**：
| # | 不变量 | 强制点 |
|---|---|---|
| I1 | diff 只处理 built/pruned——fresh/building/disposed 出现在 diff newInput = 违反 | audit：patchValue 入口 |
| I2 | dispose 整树递归——父 disposed ⟹ 子树全 disposed | callRefCleanupFor 递归 |
| I3 | 所有复用路径检查生命周期——统一 `canReuse(oldV)` | 剪枝/短路/skip/引用复用 |
| I4 | dispose 后引用清理——disposed 组件 `_child` 引用清空 | dispose 调用方统一清 |
| I5 | 重建——disposed → BUILD_START → 工厂重跑 | build 组件分支 |

## 4. 转化状态机（x2y——已实现）

`TRANSITIONS[oldKind][newKind]`（9×9 全量组合，vdom2-matrix.test.ts 验证）——
同类型递归 patch / 异类型 toOther（renderValue + removeOldOutput）。

## 5. key 状态机（KEY_DIFFERS——已实现）

`KEY_DIFFERS[keyMode]`——unkeyed（位置）/ keyed（内容）/ mixed（prepPos 降级 keyed）。
key 业务身份声明协议：框架不生成身份 key；无 key = 位置身份；混合由 pos: 显式接管。

## 6. 协同流程（导航全链路）

```
navigate('/b')
  → ROUTE：NAVIGATE_START → navigating
  → 旧树：LIFECYCLE DISPOSE × N（整树）
  → 新树：buildVNode → LIFECYCLE fresh → building → built × N
  → diff ：KEY_DIFFERS[mode] → x2y[oldKind][newKind]（转换内校验 LIFECYCLE——canReuse）
  → ROUTE：NAVIGATE_DONE → settled
```

## 7. trace（组件视角可观测）

```
[vdom:route]  NAVIGATE_START /a → /b
[vdom:lifecycle] PageA(_wf_0) [d0] built --DISPOSE--> disposed
[vdom:lifecycle] PageB(_wf_5) [d0] fresh --BUILD_DONE--> built
[vdom:route]  NAVIGATE_DONE

全局 API（audit/trace 开启时）：
  __vdom_dump()      —— 全树生命周期快照（含路由状态）
  __vdom_inspect(id) —— 单组件 + 子树快照（registry 反查 _wf_N）
  __vdom_lc(id?)     —— 生命周期时间线（全组件或单组件）
URL：?vdom_trace=lifecycle:Button / lifecycle@_wf_12 / ?vdom_dump=1
```

## 8. 全连接测试

```
① 导航 A→B：旧树全 disposed + 新树全 built + registry 干净 + DOM 干净
② 快速连续 A→B→A：无泄漏、无中间态残留
③ 导航 404：错误页 + 旧树清理
④ 四状态机矩阵（route × lifecycle × x2y × key）
⑤ 搜索序列回归（demo：Section null→恢复多轮 0 渲染错误）
```

## 9. 实施阶段（从上到下）

```
Phase 1：路由状态机（route.ts）——RouteLifecycle + ROUTE_TRANSITIONS + 协调器 + router 接入
Phase 2：节点生命周期补全——native/Fragment/Portal 构建状态 + dispose 统一 + canReuse
Phase 3：转化/key 状态机审查——x2y / KEY_DIFFERS if/else 漏网收敛
Phase 4：四状态机协同 + trace——route 阶段 + 全树 dump + 时间线
Phase 5：全连接测试——vdom-route-lifecycle.test.ts + 搜索序列回归
Phase 6：if/else 收敛审计——分派型 if/else → 状态机（audit 基线）
```

## 10. 验收标准

1. 全量测试绿（含四状态机矩阵 + 全连接测试）
2. demo 搜索序列 + 导航链路 0 渲染错误
3. trace 可观察完整链路（route + lifecycle 时间线）
4. 无分派型 if/else 漏网（audit 审计基线）
5. 四状态机查表驱动——新行为 = 加状态/加转换/加表项
