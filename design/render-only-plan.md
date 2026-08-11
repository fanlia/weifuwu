# render-only 方案 — 取消 ctx.ui.$() / ctx.ui.dirty()（确定性渲染）

> **状态（2026-08）**：✅ **v1 引擎完全退役——v2（vdom）全面接管**。
> 1700 测试全绿 + typecheck 通过；`ctx.ui.$()`/`ctx.ui.dirty()` 全仓零残留。
> 顶层 v1 引擎文件（render/diff/serve/ui/hydration/ssr/reactive/registry）已删除；
> 后端遗留 ui/ssr.ts 删除；公开入口 index.ts 切 vdom 导出。
>
> 目标：渲染触发收敛为唯一原语 `ctx.ui.render()`，
> 状态回归普通 JS 对象（`let` / `createStore`），消灭「隐式触发」的调试地狱
> （§4.5 selfId 错位、§4.6 `__watch`、保护期、Proxy 边界——§4.0 理念的逻辑终点）。
>
> 原则：**每一步保持测试全绿**；组件库迁移对 v1/vdom 均兼容（`render()` 两边都有）。

## 动机：确定性

现状渲染触发分散在：`$` 赋值（Proxy trap）、`dirty`、`render`、hooks 自动 dirty、
保护期忽略、三态 skip——「会不会渲染」是运行期框架决策，不可静态推导。

render-only 唯一规则：**渲染只发生在 `render()` 调用处**。行为可静态推导、
渲染函数纯化（同一输入 → 同一输出）、测试无 mock 盲区、SSR 一致。

## 最终 API 面

| 原语 | 状态 |
|------|------|
| `ctx.ui.render()` | ✅ 保留——**闭包绑定当前组件**（无参 = 自身；`['id']` = 跨组件） |
| `ctx.ui.dirty()` | ❌ 删除（v2 中与 render 等价——同 fire-and-forget async） |
| `ctx.ui.$()` | ❌ 删除（无自动渲染通道） |
| `ctx.ui.useExternal(store)` | 🆕 订阅共享状态（变化 → 自身重渲染，unmount 自动退订） |
| `createStore(init)` | 🆕 共享状态工厂（state 普通对象 + subscribe + set/update/notify） |
| 组件内部状态 | `let x` + 事件里 `ctx.ui.render()`（组件库已有模式，推广到业务层） |

## 关键设计

### 1. render() 闭包绑定（修 §4.5 selfId 错位）

现状 `render` 依赖 `this._selfId`（childCtx 原型链 + 重挂载错位——JSONViewer 根因）。
改为 `mountAsyncComponent` 创建 childUi 时**闭包捕获 id**：

```ts
childUi.render = () => scheduler.render([vnode._id])   // 无 this 陷阱
```

### 2. scheduler 收敛

```
v2 现状：dirty()/render()（等价）→ renderByIds → 防重入 + isMounting 保护 + _rendering 标记
render-only：render(ids) → renderByIds → 防重入 + _render 守卫
```

- `isMounting` 保护删除（无 $ 赋值自动触发通道；mount 期订阅回调被 `_render` 守卫天然拦下）
- `_rendering` 标记删除（state.ts 删除后无用）
- 防重入保留（渲染中触发 → 丢一次请求——隐式合并，§4.0 禁批处理路线的替代）

### 3. useExternal + createStore（共享状态唯一原语）

```ts
interface ExternalStore<T> {
  state: T
  subscribe(cb: () => void): () => void
}

// hooks（mount 注册，unmount 自动退订）
function useExternal(this, store) {
  const id = this._selfId                        // 或闭包 id
  const unsub = store.subscribe(() => scheduler.render([id]))
  onComponentUnmountFor(registry, id, unsub)
  return store.state                             // 渲染期读最新值
}

// 工厂（state 是普通对象，非 Proxy——无响应式引擎）
function createStore<T extends object>(init: T) {
  const state = { ...init }
  const subs = new Set<() => void>()
  const notify = () => subs.forEach(cb => cb())
  return {
    state,
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb) },
    set(partial) { Object.assign(state, partial); notify() },
    update(fn) { fn(state); notify() },
    notify,
  }
}
```

SSR shim：`useExternal = (store) => store.state`（只读不订阅）。

### 4. hooks 自动 dirty 保留，内部改 render

`useMedia`/`useInView`/`useScrollPosition` 等是**事件驱动**（浏览器事件 → 重渲染），
与 $ 的「赋值自动」不同——保留合理。内部 `env.dirty()` → `env.render()`。

### 5. useChat 重构

现状：handle 挂在父组件 `$` 上（`$.chat = ctx.ui.useChat(...)`），45 处 `state.*` 操作。
重构：内部普通状态 + 订阅表，handle 带 `subscribe`（可被 useExternal 订阅）：

```ts
function useChat(opts, ctx): UseChatState & ChatApi & { subscribe(cb): unsub } {
  const state = { messages: [], ... }
  const subs = new Set<() => void>()
  const notify = () => subs.forEach(cb => cb())
  // 每个数据到达点：state.x = ...; notify()
  return { ...state, send, stop, retry, clear, approve, dispose, subscribe(cb) { ... } }
}
```

- `__watch` 类型/实现删除（§4.6 整节退役）
- AiChat：`ctx.ui.useExternal(initProps.chat)` 替代 `__watch` 手动订阅 + ref 退订

## 实施阶段（每步测试全绿）

| 阶段 | 内容 | 验证 | 状态 |
|------|------|------|------|
| 1 引擎 | scheduler 收敛（dirty→render 内部统一）+ mount 闭包绑定 + 新增 useExternal/createStore | vdom 测试 | ✅ |
| 2 hooks | HookEnv dirty→render 语义统一 + useAsync 改普通对象 + 测试迁移 | hooks 测试 | ✅ |
| 3 共享 | useChat 重构（subscribe + notify）+ AiChat 迁移（useExternal）+ v1 ui.ts/testing 适配 | use-chat/AiChat 测试 | ✅ |
| 4 组件库 | 11 组件 `$` → `let` + `render()`（Select/Tabs/Accordion/Calendar/Tree/JSONViewer/AutoComplete/Toast/Notification/Transfer/Cascader）+ 顶层 ui-dom/中间件 + 测试改交互驱动 | 组件测试 | ✅ |
| 5 apps | components-demo / layouts-demo / agent-platform（13 页面）/ ui-router-demo 全部 `$` 迁移（普通对象 + 函数级 render） | typecheck | ✅ |
| 6 清理 | **vdom 引擎删 `$`/`dirty`/`state.ts`**；HookEnv 删 dirty/$；vdom 测试改 render 驱动 | 全量 + typecheck | ✅ |
| 7 弹窗收敛 | **vdom/middlewares 删除**——弹窗中间件移入 components 各组件内部；mountCommand 移入 vdom/mount.ts；顶层 Confirm/Toast/Notification re-export components | 全量 | ✅ |
| 8 v1 退役 | **顶层 v1 引擎全删**（render/diff/serve/ui/hydration/ssr/reactive/registry + 后端 ui/ssr）；公开入口 index.ts 切 vdom；组件测试迁 vdom 辅助（mountToDom/patchToDom）；v1 特有测试删/迁；vdom 补事件/Portal patch/ref 清理/错误兜底等缺口 | 全量 + typecheck（1700） | ✅ |
| 7 全量 | 全量测试 + typecheck（≤15s 预算） | npm test | ✅（1801 全绿） |

**附带修复**：vdom `patchProps` 事件函数引用变化时未移除旧 handler（重复绑定累积——
render-only 推广后每次重渲染都是新函数，必爆）——已修 + 测试。

## 影响面

- 组件库 13 组件（Cascader/Accordion/Calendar/JSONViewer/Tree/AutoComplete/Toast/
  Select/Notification/Tabs/Transfer + Confirm 相关）+ 111 个测试文件（mock $）
- middlewares（toast/confirm 内部 `$` → `let` + `render`）
- hooks（media/popup/stable/input 的 dirty → render）
- useChat（45 处 state 操作 + handle 形状）
- types.ts（`__watch` 删除、useExternal 类型）、testing.ts（createTestCtx mock）
- v1（顶层 render.ts/diff.ts）**不动**——组件库迁移用 `render()` 对 v1/vdom 均兼容

## 风险与对策

| 风险 | 对策 |
|------|------|
| 高频多 render 同步执行 | 防重入（渲染中丢请求）+ 写者控制 notify 频率（流式每 N token） |
| 漏调 render()（新错误源） | 现象清晰（点击无反应）+ code review 可查（事件里有无 render） |
| 组件库迁移破坏交互 | 每批组件迁移后跑对应测试 + agent-browser 抽查弹层/树/输入 |
| useChat 形状变更破坏调用方 | handle 保持 `UseChatState & ChatApi` 形状，只增 `subscribe` |
