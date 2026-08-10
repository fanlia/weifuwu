# ui-dom 优化计划

> **状态（2026-10）**：基础能力齐备（嵌套路由/组件重渲染/SSR/hydration/keyed，19 测试绿 + 冒烟）。
> 本计划按优先级消除真实缺口（诊断测试为证），先修 P0（正确性），再 P1/P2（性能/健壮性）。

## 诊断依据（实测）

| # | 症状 | 证据 |
|---|------|------|
| O1 | 连续 3 次 `$` 赋值触发 2 次渲染（应 1 次）；**慢 handler 期间赋值被 `_rendering` 保护丢弃**（丢更新） | `renderCount 1→2`（诊断测试） |
| O2 | 导航卸载组件后 registry 不清理（泄漏） | `registry A=1 → B=1`（诊断测试） |
| O3 | async handler 竞态：慢请求晚到覆盖新页面 | 无序号/取消机制（代码审查） |
| O4 | `flatten(_routes)` 每次渲染重编译正则 | `flatten()` 在 `_renderAsync`/`_handle` 内 |
| O5 | hydrate 组件分支 `renderComponent` 重建 DOM（非收养） | `hydrateValue` 组件分支审查 |
| O6 | `ctx.ui.data` 无失效 API；无 `__DATA__` SSR 序列化对接 | 代码审查 |
| O7 | handler 抛错 → `_renderAsync` 无 catch → 页面黑屏 | 代码审查 |
| O8 | `class`/`className` 未统一；枚举属性（draggable）空串语义 | `setProp`/`patchProps` 审查 |
| O9 | VNode 内部字段（_refNode/_ctx/_id…）泄漏到公共类型；组件无泛型 | `types.ts` 审查 |

## P0 — 正确性（先做）

### O1 微任务批量调度（丢更新 + 性能）

**现状**：`$` 赋值 → notify → 同步 `_render()`/`_renderComponents()`；`_rendering` 保护期**丢弃** dirty。

**方案**：
1. 调度器：`_scheduleRender()` —— `_pending` 标志 + `queueMicrotask` 合并同微任务多次赋值
2. 渲染保护期 dirty → **排队**（渲染循环结束后若队列非空继续 flush，直到稳定）
3. `_renderComponents` 与 `_renderAsync` 共用同一调度（合并为一次微任务）
4. 验证：连续 3 赋值 = 1 渲染；慢 handler（async fetch）期间赋值 → 微任务后正确渲染不丢

### O2 生命周期清理（内存泄漏）

**现状**：组件卸载（patchValue 移除/重建/导航）不调 `registry.delete`——id/vnode/dirty 无限增长；卸载组件的 `$` 赋值 dirty 渲染孤儿。

**方案**：
1. `patchValue` 组件分支：**不同组件替换** 与 **children 移除** 时递归注销组件子树（`registry.delete(id)`）
2. ref prop 支持：`ref={el => ...}` 挂载/卸载回调（卸载 = 注销点，AGENTS.md §5.1 纪律）
3. 验证：导航卸载后 registry 减 1；卸载组件 $ 赋值不报错不渲染孤儿

### O3 竞态防护（stale response）

**现状**：`_renderAsync` 无序号——快导航时慢的旧 handler 结果晚到覆盖新页面。

**方案**：
1. `_renderSeq` 递增；落地前校验 `seq === _renderSeq`（stale 丢弃）
2. 验证：慢 handler（500ms）+ 快速导航 → 旧结果不落地

## P1 — 性能/健壮性

### O4 路由匹配预编译

`_compileRoutes()` 构造期缓存（注册后 invalidate）；渲染复用缓存 flat——避免每次渲染重编正则。

### O5 hydration 组件收养

`hydrateValue` 组件分支：mount（注册 $）后**递归 hydrate 内部 VNode**（而非 renderComponent 新建 DOM 替换服务端输出）。

### O6 ctx.data 完善

`delete(key)`/`clear()` 失效；`renderHtml` 输出 `__DATA__`（工厂取数序列化）+ hydrate 时 `ctx.data` 预填命中（对齐 uiServe 的三场景适配）。

### O7 错误边界

`_renderAsync` try/catch → 显示错误页（`ErrorBoundary` 中间件或默认 500 页），不黑屏。

## P2 — 打磨

### O8 属性系统
- `class`/`className` 归一；`style` 数字自动 px；枚举属性（draggable/contenteditable）显式 true/false 字符串

### O9 类型
- VNode 内部字段抽 `InternalVNode`（公共 VNode 不泄漏）；`Component<P, C>` 泛型（FS-02）；ctx 注入 C 编译期保证

## 优先级与依赖

```
P0：O1（调度）→ O2（生命周期）→ O3（竞态）     [正确性，O1 是 O2 前置]
P1：O4 → O5 → O6 → O7                          [性能/健壮性，独立]
P2：O8 → O9                                    [打磨]
```

## 验收记录

（每项完成后填写：测试 + 冒烟）
