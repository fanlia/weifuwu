# render-only 状态

> 唯一规则：**渲染只发生在 `ctx.ui.render()` 调用处**。状态是普通 JS 对象——
> 行为可静态推导（代码审查看事件回调里有无 render() 即可验证渲染逻辑）。

## 三通道

| 场景 | 写法 | 触发 |
|------|------|------|
| 组件内部状态 | `let count` + 改后 `ctx.ui.render()` | 显式调用 |
| 跨组件共享 | `createStore(init)` + `ctx.ui.useExternal(store)` | store.set/update/notify 自动 |
| 跨组件精准刷新 | mount 时 `ctx.ui.selfId('name')` → 任意处 `ctx.ui.render(['name'])` | 显式调用 |

```tsx
// 内部状态
const Counter = (_init, ctx) => {
  let count = 0
  return (props) => h('button', {
    onClick: () => { count++; ctx.ui.render() },
  }, count)
}

// 共享状态（模块级单例）
const store = createStore({ user: null })
const UserBadge = (_init, ctx) => {
  const s = ctx.ui.useExternal(store)   // 订阅：变化 → 自身重渲染
  return (props) => h('span', {}, s.state.user?.name ?? '未登录')
}
store.set({ user })                      // 任何位置 → 订阅组件自动重渲染
```

## 不需要渲染的状态

`let el` / `let timerId` 等内部缓存——改后**不**调 render()（参考 AGENTS.md §4.1 表）。

## hooks（事件驱动——非赋值自动）

useMedia/useInView/useChat 等是浏览器事件驱动重渲染——与"赋值自动"本质不同，保留合理。

## 历史教训

v1 的 $ Proxy 在重挂载场景捕获的 selfId 与当前实例错位 → 交互静默失效。
render-only 根治：render() 闭包绑定组件 id——无 this/selfId 错位。

