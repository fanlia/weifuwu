# ui-dom 实施计划 — 独立 UIRouter + VDOM（定稿架构落地）

> **状态（2026-10）**：基础已就绪（8 测试绿，零依赖 src/client）。本计划补齐定稿架构的剩余能力，按依赖排序。
> 目标：交互子组件（两阶段 + $ 组件级重渲染）→ VDOM diff 完善 → 浏览器冒烟 → hydration/SSR 落地。
> 纪律：开发期只跑 ui-dom 测试（完全独立），全量测试不动。

## 现状（已实现）

| 能力 | 状态 |
|------|------|
| UIRouter：use 中间件/子路由 + get + notFound + serve + serveUI | ✅ |
| handler = async (location, ctx) => vnode（$ 路由实例级） | ✅ |
| ctx.params/query 注入 + ctx.ui.data 缓存 | ✅ |
| 中间件链洋葱（layout 包装 children） | ✅ |
| VDOM：renderValue 挂载 / patchValue 增量 diff | ✅（基础） |
| createReactiveState 深度 Proxy + __watch | ✅ |

## 缺口与计划

### D1 — 组件级重渲染（交互子组件，核心缺口）

**问题**：handler 返回的 VNode 树里，交互子组件（`(initProps, ctx) => (props) => vnode`）的 `ctx.ui.$()` 赋值不触发组件自身重渲染——`renderComponent` 只 mount 一次，无 re-render 机制。定稿架构"交互 = 子组件（$ 响应式）"未落地。

**方案**：
1. 独立 `registry.ts`：组件实例管理（id 分配 + vnode 注册 + dirty 集合）
2. `createUi`（ui-dom 版）：组件级 `$()` 绑定——$ 赋值 → dirty(该组件 id)
3. `renderComponent`：组件 mount 时注册 id，$ dirty 时**重调该组件 render 函数 → patchValue 局部更新**
4. 组件 ctx：`childCtx = Object.create(ctx)` + `_selfId`（对齐定稿的组件级 $ 绑定）

**验证**：新测试——子组件 $ 赋值 → 组件 DOM 局部更新（父 handler 不重跑）；多子组件独立重渲染。

### D2 — VDOM diff 完善（keyed children + 属性）

**问题**：patchValue 目前按位置对齐 children，无 keyed diff；属性 patch 无 style 差异清除。

**方案**：
1. `patchKeyedChildren`：key 匹配 + 移动/移除/新增（列表场景）
2. `patchProps`：style 对象 diff（移除消失键）、事件移除、`className` 处理
3. Fragment `_childNodes` 记录（多节点范围对齐）

**验证**：新测试——keyed 列表重排不重建；style 变化 diff；事件切换。

### D3 — 浏览器冒烟（独立 demo）

**问题**：ui-dom 未在真实浏览器验证（jsdom 已过）。

**方案**：
1. `apps/ui-dom-demo/server.ts`（纯 ui 中间件 + SPA fallback）
2. `main.tsx`：UIRouter + handler + layout 中间件 + 子路由 + 交互组件
3. agent-browser 冒烟：URL 导航 / $ 交互 / 子路由 / 404

**验证**：agent-browser 实测（outerHTML + 点击 + 导航断言）。

### D4 — hydration / SSR 落地

**问题**：ui-dom 无 SSR 输出（renderSsr 是 src/client 的，不共享）。

**方案**：
1. `renderHtml(vnode)`：ui-dom 版 VNode → HTML 字符串（SSR 落地中间件）
2. `serveUI` hydrate 支持：收养服务端 HTML + 接线事件

**验证**：新测试——renderHtml 输出正确 HTML；hydrate 收养不重建。

### D5 — 完善/文档

- 独立 JSX 命名空间（ui-dom 的 tsx 支持，不冲突 client）
- design/ui-architecture.md 验收记录
- README/docs 的 ui-dom 入口（成熟后）

## 优先级

```
D1（组件重渲染）── 核心缺口，D2/D3 依赖其交互能力
D2（diff 完善）── 独立，列表/样式场景
D3（浏览器冒烟）── 依赖 D1/D2
D4（SSR/hydration）── 独立，D3 后
D5（收尾）── 全部后
```

## 验收记录

（每阶段完成后填写）
