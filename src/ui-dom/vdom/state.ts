/**
 * vdom/state — 响应式状态容器（$ Proxy）
 *
 * `$.x = val` → set trap → dirty 回调（调度层微任务批量重渲染）。
 * 深层对象/数组变异递归代理。mount/render 保护期赋值不触发（setMounting）。
 */

export function createReactiveState(dirty: () => void, opts?: { isMounting?: () => boolean }): Record<string, any> {
  const seen = new WeakMap<object, Record<string, any>>()

  function wrap<T extends object>(target: T): Record<string, any> {
    if (seen.has(target)) return seen.get(target) as Record<string, any>
    const proxy = new Proxy(target, {
      get(t, k, r) {
        const v = Reflect.get(t, k, r)
        // 内建类型（Set/Map 方法绑定原始 target——变异方法触发 dirty）
        if (v instanceof Set) return bindSet(v)
        if (v instanceof Map) return bindMap(v)
        if (v instanceof Date || v instanceof RegExp) return v
        if (v && typeof v === 'object') return wrap(v)
        return v
      },
      set(t, k, v, r) {
        const old = Reflect.get(t, k)
        if (old !== v) {
          Reflect.set(t, k, v, r)
          if (!opts?.isMounting?.()) dirty()
        }
        return true
      },
      deleteProperty(t, k) {
        const had = Reflect.has(t, k)
        if (had) {
          Reflect.deleteProperty(t, k)
          if (!opts?.isMounting?.()) dirty()
        }
        return true
      },
    })
    seen.set(target, proxy)
    return proxy
  }

  function bindSet(set: Set<any>): Set<any> {
    const mutators = ['add', 'delete', 'clear'] as const
    const bound = Object.create(set) as Set<any>
    for (const m of mutators) {
      ;(bound as any)[m] = (...args: any[]) => {
        ;(set as any)[m](...args)
        if (!opts?.isMounting?.()) dirty()
      }
    }
    ;(bound as any).forEach = (cb: any, thisArg?: any) => set.forEach(cb, thisArg)
    ;(bound as any).has = (v: any) => set.has(v)
    ;(bound as any).size = set.size
    return bound
  }

  function bindMap(map: Map<any, any>): Map<any, any> {
    const mutators = ['set', 'delete', 'clear'] as const
    const bound = Object.create(map) as Map<any, any>
    for (const m of mutators) {
      ;(bound as any)[m] = (...args: any[]) => {
        ;(map as any)[m](...args)
        if (!opts?.isMounting?.()) dirty()
      }
    }
    return bound
  }

  return wrap({})
}
