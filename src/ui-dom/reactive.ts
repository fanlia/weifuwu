/**
 * 创建响应式状态容器：深度 Proxy，任意层级属性赋值自动触发 dirty。
 *
 * 纯 JS（无 DOM），客户端（ctx.ui.$()）与服务端（SSR ctx shim）共用。
 */

import { uiLog } from './debug.ts'

export function createReactiveState(dirty: () => void): Record<string, any> {
  const _debugSets = new Map<string, number>()
  const _dbg = (key: string, label: string) => {
    const n = (_debugSets.get(key) ?? 0) + 1
    _debugSets.set(key, n)
    if (n <= 5 || n % 100 === 0) uiLog(label, key + ' count=' + n, { throttle: 100 })
  }
  const proxyCache = new WeakMap()
  // 多消费者订阅：同一状态被父组件（$）与子组件（AiChat 等共享 handle）同时观察
  const watchers = new Set<() => void>()

  const reactive = (target: any): any => {
    if (target === null || typeof target !== 'object') return target

// 内置集合类型（Set/Map）：Proxy 包装 + 方法 bind 到原始 target——
    // 直接调用 set.add()/map.set() 也会触发 dirty（DiffView 教训：
    // 深度 Proxy 包装 Set 后 Set.prototype.has 的 this 绑定被破坏 → TypeError）
    if (target instanceof Set || target instanceof Map) {
      if (proxyCache.has(target)) return proxyCache.get(target)
      // 变异方法（add/delete/clear/set）触发 dirty；只读方法（has/get/size/
      // keys/values/forEach）不触发（保持只读查询零副作用）
      const MUTATING = target instanceof Set
        ? new Set(['add', 'delete', 'clear'])
        : new Set(['set', 'delete', 'clear'])
      const proxy = new Proxy(target, {
        get(t, prop) {
          const v = Reflect.get(t, prop)
          // 方法 bind 到原始 target（保持 this 正确——DiffView 教训：
          // Proxy 包装 Set 后 Set.prototype.has this 绑定被破坏）
          if (typeof v === 'function') {
            if (!MUTATING.has(String(prop))) return v.bind(t)
            return (...args: unknown[]) => {
              const result = v.apply(t, args)
              dirty()
              for (const w of watchers) w()
              return result
            }
          }
          return v
        },
        set(t, key, value) {
          Reflect.set(t, key, value)
          _dbg(String(key), 'set')
          dirty()
          for (const w of watchers) w()
          return true
        },
      })
      proxyCache.set(target, proxy)
      return proxy
    }

    // Date/RegExp 等不可变语义内置类型：返回原引用（不包装——无嵌套赋值）
    if (target instanceof Date || target instanceof RegExp) return target

    // 相同底层对象返回同一 Proxy 实例，保证引用稳定、减少 GC
    if (proxyCache.has(target)) return proxyCache.get(target)

    const proxy = new Proxy(target, {
      set(target, key, value) {
        const old = Reflect.get(target, key)
        if (old === value) return true
        Reflect.set(target, key, value)
        dirty()
        for (const w of watchers) w()
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
          for (const w of watchers) w()
        }
        return true
      },
    })

    proxyCache.set(target, proxy)
    return proxy
  }

  const root = reactive({})
  // 订阅状态变更（返回退订函数）。内部 API：子组件共享父 $ 时用它驱动自身重渲染
  Object.defineProperty(root, '__watch', {
    value: (cb: () => void) => {
      watchers.add(cb)
      return () => { watchers.delete(cb) }
    },
    writable: false,
    enumerable: false,
  })
  return root
}
