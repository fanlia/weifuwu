# 两阶段组件模型

```tsx
const MyComp: Component = async (initProps, ctx) => {   // ── mount（只一次）
  let count = initProps.initial ?? 0                    // 状态初始化/订阅/定时器
  return async (props) => {                             // ── render（每次渲染）
    return h('button', { onClick: () => { count++; ctx.ui.render() } }, count)
  }
}
```

## 职责表

| 阶段 | 职责 | 可访问 | 事件函数 |
|------|------|--------|---------|
| mount | 初始化状态/订阅/定时器/稳定引用回调 | initProps、ctx、mount let、稳定 handle | 只依赖稳定引用 → mount 定义（零重绑） |
| render | 读最新 props/派生数据/输出视图 | 最新 props、mount 闭包、ctx | 依赖最新 props → render 内定义（重绑是正确性要求） |
| ref | DOM 持有/第三方初始化/清理 | el 或 null | **必须 mount 作用域定义**（内联 ref 每渲染新函数 → ref(null) 反复触发） |

## 铁律

1. **renderFn 强制异步**（`async (props) => Promise<VNode>`）——两阶段都可 await
2. **渲染只发生在 render() 调用处**——状态是普通对象（let/createStore），无 $ Proxy
3. **工厂按实例执行**——数据必须走 ctx.data（自带缓存+并发合并）
4. mount 捕获的 initProps 不得用于渲染（必须用渲染期 props）
5. 初始状态必须确定性（禁 window.innerWidth 之类直接初始化 → SSR mismatch）

## 相关

- 状态存放：`let` + render()（内部）/ createStore + useExternal（共享）
- 完整纪律：AGENTS.md §3/§4

