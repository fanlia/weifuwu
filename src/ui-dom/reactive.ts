/**
 * weifuwu/ui-dom 响应式状态 — 完全独立（不依赖 src/client）
 *
 * 深度 Proxy：任意层级属性赋值自动触发 notify（重渲染）。
 * handler 里的 ctx.ui.$() 用它——$ 赋值 → 重渲染（ctx.data 缓存命中 + $ 复用）
 */

/** 响应式状态容器 */
export type ReactiveState = Record<string, any> & {
  /** 订阅状态变更；返回退订函数（UIRouter 用它观察 $ 触发重渲染） */
  __watch: (cb: () => void) => () => void
}

/** 创建响应式状态：$.x = val → notify() */
export function createReactiveState(notify: () => void): ReactiveState {
  const watchers = new Set<() => void>()
  const proxyCache = new WeakMap<object, any>()

  const reactive = (target: any): any => {
    if (target === null || typeof target !== 'object') return target
    if (proxyCache.has(target)) return proxyCache.get(target)

    const proxy = new Proxy(target, {
      set(t, key, value) {
        const old = Reflect.get(t, key)
        if (old === value) return true
        Reflect.set(t, key, value)
        notify()
        for (const w of watchers) w()
        return true
      },
      get(t, key) {
        const value = Reflect.get(t, key)
        if (typeof value === 'object' && value !== null) return reactive(value)
        return value
      },
      deleteProperty(t, key) {
        if (Reflect.has(t, key)) {
          Reflect.deleteProperty(t, key)
          notify()
          for (const w of watchers) w()
        }
        return true
      },
    })
    proxyCache.set(target, proxy)
    return proxy
  }

  const root = reactive({})
  Object.defineProperty(root, '__watch', {
    value: (cb: () => void) => {
      watchers.add(cb)
      return () => { watchers.delete(cb) }
    },
    writable: false,
    enumerable: false,
  })
  return root as ReactiveState
}
