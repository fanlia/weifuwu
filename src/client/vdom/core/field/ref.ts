/**
 * vdom core/field — ref 通道（**全局注册表管理**——对齐事件代理模式）
 *
 * 纪律（AGENTS §5.1）：带清理逻辑的 ref 必须定义在 mount 作用域——
 * ref 函数引用变化时旧 ref(null) 被调用（diff 重绑定）。
 *
 * **RefRegistry**（全局注册表——统一管理——与 EventRegistry 同构）：
 * - set(id, fn, prev?)：注册（prev 旧引用先退 null——diff 重绑）
 * - mount(id, el)：**挂载完成触发**（insert 后/ref 指令——查表 fn(el)——
 *   未挂载注册自动挂起（insert 时查表触发——无需独立 pending 表））
 * - unmount(id)：**卸载**（ref(null) 子树——前缀匹配——表删除）
 * - remap(oldPrefix, newPrefix)：move 前缀重映射
 * - dispose：卸载清理
 *
 * 生命周期整合：ref 指令（insert 后——已挂载——set + mount）；
 * setProp ref（diff 更新——已挂载立即——未挂载等 insert）；remove/done →
 * unmount（ref(null)）；move → remap。
 */

export const REF_KEY = 'ref'

/** ref 应用（el 挂载 / null 卸载——prev 引用变化先退旧） */
export function applyRef(el: HTMLElement | null, value: unknown, prev?: unknown): void {
  const prevFn = typeof prev === 'function' ? prev : null
  const nextFn = typeof value === 'function' ? value : null
  if (prevFn && prevFn !== nextFn) prevFn(null)
  if (nextFn && nextFn !== prevFn) nextFn(el)
}

/** ref 全局注册表（per serve 实例——挂载/卸载查表触发） */
export class RefRegistry {
  private refs = new Map<string, unknown>()

  /** 注册（prev 旧引用先退 null——diff 重绑；已注册同 id 覆盖——不重复触发） */
  set(id: string, fn: unknown, prev?: unknown): void {
    if (prev && prev !== fn && typeof prev === 'function') {
      try { (prev as (el: null) => void)(null) } catch (e) { console.error('[vdom] ref prev:', e) }
    }
    this.refs.set(id, fn)
  }

  /** 挂载完成触发（insert 后/ref 指令——查表 fn(el)） */
  mount(id: string, el: HTMLElement): void {
    const fn = this.refs.get(id)
    if (typeof fn === 'function') {
      try { (fn as (e: HTMLElement) => void)(el) } catch (e) { console.error('[vdom] ref mount:', e) }
    }
  }

  /** 卸载（ref(null) 子树——前缀匹配——表删除） */
  unmount(id: string): void {
    for (const [rid, fn] of [...this.refs]) {
      if (rid === id || rid.startsWith(id + '.')) {
        if (typeof fn === 'function') {
          try { (fn as (el: null) => void)(null) } catch (e) { console.error('[vdom] ref unmount:', e) }
        }
        this.refs.delete(rid)
      }
    }
  }

  /** move 前缀重映射（节点移动——id 路径变化——表跟随） */
  remap(oldPrefix: string, newPrefix: string): void {
    for (const [rid, fn] of [...this.refs]) {
      if (rid === oldPrefix || rid.startsWith(oldPrefix + '.')) {
        this.refs.delete(rid)
        this.refs.set(newPrefix + rid.slice(oldPrefix.length), fn)
      }
    }
  }

  /** 卸载清理（serve unmount） */
  dispose(): void {
    this.refs.clear()
  }
}
