/**
 * 创建响应式状态容器：深度 Proxy，任意层级属性赋值自动触发 dirty。
 *
 * 纯 JS（无 DOM），客户端（ctx.ui.$()）与服务端（SSR ctx shim）共用。
 */

export function createReactiveState(dirty: () => void): Record<string, any> {
  const proxyCache = new WeakMap()

  const reactive = (target: any): any => {
    if (target === null || typeof target !== 'object') return target

    // 相同底层对象返回同一 Proxy 实例，保证引用稳定、减少 GC
    if (proxyCache.has(target)) return proxyCache.get(target)

    const proxy = new Proxy(target, {
      set(target, key, value) {
        const old = Reflect.get(target, key)
        if (old === value) return true
        Reflect.set(target, key, value)
        dirty()
        return true
      },
      get(target, key) {
        const value = Reflect.get(target, key)
        // 返回深度包装的 Proxy，确保深层赋值也能触发 dirty
        if (typeof value === 'object' && value !== null) return reactive(value)
        return value
      },
      deleteProperty(target, key) {
        if (Reflect.has(target, key)) {
          Reflect.deleteProperty(target, key)
          dirty()
        }
        return true
      },
    })

    proxyCache.set(target, proxy)
    return proxy
  }

  return reactive({})
}
