# 四状态机完整重构 + 集成测试计划（route / lifecycle / x2y / KEY_DIFFERS）

> 状态：**✅ 全部完成**（2026-12）——Phase 1-6 全部落地，全量 1777 测试全绿
> 四状态机核心代码成型 + trace 完整可观测 + 集成测试 T1-T7 通过 + demo bug 修复
> （3 轮搜索序列 0 渲染错误）+ renderComp 状态机化（最后一个分派型 if/else 收敛）

## 1. 目标

联合 **UIRouter + uiServe** 对四个状态机（route / lifecycle / x2y / KEY_DIFFERS）做**完整的集成测试**——
让 trace 打印的状态日志**完整、清晰、正确地反映 vdom 所有阶段的信息**——验证「真正的完成了四状态机代码重构」。

```
验收：任何一次渲染/导航，trace 都能完整复现：
  [route]      导航状态转换（idle → navigating → settled）
  [lifecycle]  每个组件的完整生命周期（fresh → built → pruned/disposed → 重建）
  [x2y]        每次 diff 转换分派（oldKind → newKind）
  [key]        每次数组 diff 策略（unkeyed / keyed / mixed）
```

## 2. 前置：四状态机重构完成清单

### 2.1 route 状态机（Phase 1——已完成）
- [x] `route.ts`：idle / navigating / settled + ROUTE_TRANSITIONS 查表
- [x] createRouteController（实例级）+ serve.ts renderPath 接入（Start/Done/Error）
- [x] R1-R5 单元测试

### 2.2 lifecycle 状态机（Phase 1-2——基本完成，待补全）
- [x] `lifecycle.ts`：fresh / building / built / pruned / disposed + TRANSITIONS 查表
- [x] build.ts：组件 BUILD_START/DONE/PRUNE + native/Fragment/Portal BUILD_DONE
- [x] registry.ts：callRefCleanupFor 整树 DISPOSE
- [x] canReuse（I3 统一复用检查——含 _child 树深检查）
- [x] 复用路径接入：build 剪枝 / V3-3a 短路 / compToComp 三态 skip
- [ ] **L7（待补）**：route 与 lifecycle 联动（导航时旧树批量 dispose + 新树批量 build）

### 2.3 x2y 转化状态机（已有——待审查）
- [x] `TRANSITIONS[oldKind][newKind]` 9×9 矩阵 + vdom2-matrix 测试
- [ ] 审查：转换函数内部是否有 if/else 分派漏网（Phase 3）

### 2.4 KEY_DIFFERS key 状态机（已有——待审查）
- [x] `KEY_DIFFERS[unkeyed|keyed|mixed]` + 三场景测试
- [ ] 审查：diffUnkeyed/diffKeyed 内部分派收敛（Phase 3）

## 3. trace 完整性要求（每个状态机的信息规格）

### 3.1 route 阶段（trace.ts 已加 'route'）
```
[vdom:route] idle --NAVIGATE_START--> navigating path=/a
[vdom:route] navigating --NAVIGATE_DONE--> settled path=/a
[vdom:route] navigating --NAVIGATE_ERROR--> idle path=/bad（失败）
```
规格：状态 + 事件 + 路径——每次导航的完整轨迹。

### 3.2 lifecycle 阶段（需要升级——当前无组件上下文）
```
[vdom:lifecycle] PageA(_wf_0) [d0] fresh --BUILD_START--> building
[vdom:lifecycle] PageA(_wf_0) [d0] building --BUILD_DONE--> built
[vdom:lifecycle] Button(_wf_3) [d2] built --DISPOSE--> disposed
[vdom:lifecycle] PageA(_wf_0) [d0] disposed --BUILD_START--> building（重建）
```
规格：**组件名 + 实例 id + 深度 + 状态转换**——每个组件的完整轨迹可追溯。
待办：transition() 接收 vnode 上下文（组件名/id/depth）——Phase 4。

### 3.3 x2y 阶段（待补 'x2y' 阶段或并入 diff）
```
[vdom:x2y] comp --compToComp--> comp PageA(_wf_0)
[vdom:x2y] native --toOther--> native <div>（异类型替换）
```
规格：oldKind → 转换名 → newKind + 目标描述。

### 3.4 key 阶段（已有——并入 diff 日志）
```
[vdom:diff] key-mode=keyed / unkeyed / mixed
```
规格：每次 patchChildren 的数组策略。

### 3.5 全局 API（Phase 4）
```
__vdom_dump()      —— 全树生命周期快照（含路由状态）
__vdom_inspect(id) —— 单组件 + 子树快照
__vdom_lc(id?)     —— 生命周期时间线（全组件或单组件）
```

## 4. 集成测试矩阵（UIRouter + uiServe × 四状态机）

测试文件：`src/test/vdom-lifecycle-integration.test.ts`

场景：UIRouter 两个页面（/a → PageA 组件，/b → PageB 组件）+ uiServe 挂载。

| # | 场景 | route 断言 | lifecycle 断言 | x2y/key 断言 | DOM/registry 断言 |
|---|---|---|---|---|---|
| T1 | 首帧挂载 /a | idle→navigating→settled | PageA 树全 built | 首帧 renderValue | PageA DOM 渲染、registry 有 PageA |
| T2 | 导航 A→B | settled→navigating→settled | PageA 树全 disposed、PageB 树全 built | 转换分派正确 | A DOM 移除、B DOM 渲染、registry A 注销 |
| T3 | 返回 B→A | 同上 | PageA 重建（disposed→building→built） | — | A 重新渲染 |
| T4 | 快速连续 A→B→A | 中间态正确（过期丢弃） | 无泄漏（无残留 disposed 复用） | — | 最终页面 = A、registry 干净 |
| T5 | 导航 404 | navigating→idle（ERROR） | 旧树 disposed | — | 错误页渲染 |
| T6 | handle.close | — | 整树 disposed | — | registry 清空 |

**trace 验证**：每个测试收集 console.log——断言四个阶段的日志序列完整正确
（route 转换序列、每个组件的 lifecycle 轨迹、x2y 分派、key 模式）。

## 5. 关键测试点（全连接——组件全生命周期）

```
① 挂载：fresh → building → built（首帧）
② 导航卸载：built → disposed（旧页整树）
③ 导航挂载：fresh → building → built（新页整树）
④ 返回重建：disposed → building → built（实例重建）
⑤ 卸载清理：disposed + registry 注销 + DOM 移除 + ref 清理
⑥ 状态一致性：route settled ⟺ 新树全 built；route navigating ⟺ 过渡中
```

## 6. 实施顺序（先重构 + trace + 测试，后修复）

```
✅ Phase 1：route 状态机（route.ts + R1-R5）
✅ Phase 2：lifecycle 补全（native/Fragment + canReuse + 复用路径接入）
✅ Phase 4：trace 升级（lifecycle 带组件上下文 + __vdom_dump/__vdom_lc + 全局 API）
✅ Phase 5：集成测试 T1-T7（联合 UIRouter + uiServe——抓到 2 个真实缺口并修复）：
   - comp→comp 异类型未 dispose（T2）→ 修：typeSame false → toOther
   - serve 快速导航竞态（T4）→ 修：onPopState 去掉 currentPath 判断
✅ Phase 3：x2y / KEY_DIFFERS 审查——renderComp 状态机化（RENDER_COMP[lifecycle] 查表——
   最后一个分派型 if/else 收敛：fresh/building 抛错、disposed 占位兜底、built/pruned 正常渲染）
✅ Phase 5b：demo bug（Button not built——portal 内容独立 dispose 打破「父非 disposed ⟹
   子树全非 disposed」）——修复：① renderPortal 补 _parentVNode 链 ② renderComp 状态机化
   （disposed → 占位兜底 + warn——父树下一轮 canReuse 深检查拒绝 → 重建）——
   demo 3 轮搜索序列 0 渲染错误（agent-browser 实测）
✅ Phase 6：if/else 收敛审计——分派型 if/else 全部收敛到四状态机查表
```

## 7. 验收标准

```
1. 四状态机代码重构完成——查表分派、无分派型 if/else 漏网
2. trace 完整复现任何渲染/导航的所有阶段（route/lifecycle/x2y/key）
3. T1-T6 集成测试全绿——每个组件的全生命周期被验证
4. 用集成测试 + trace 复现当前 bug，定位到具体状态机缺口
5. 全量测试绿（含既有 1747 + 新增集成测试）
```

## 8. 与当前 bug 的关系（明确）

- **先忘记修复**——本计划只做：重构完成 + trace 完整 + 集成测试充分
- 当前 bug（DemoDrawer 剪枝复用 disposed 组件）**留给集成测试暴露**——T2/T4 导航场景
  大概率复现——用完整 trace 定位到「dispose 与剪枝缓存的时序缺口」
- 定位后，修复方案在状态机框架内闭环（dispose 传播 / canReuse 语义补全）
