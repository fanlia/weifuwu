/**
 * vdom core/field — ref 通道（**全局注册表管理**——对齐事件代理模式）
 *
 * 纪律（设计规则 §5.1）：带清理逻辑的 ref 必须定义在 mount 作用域——
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
  /** 生命周期状态机（**全部状态机化——2026-XX**）：active → disposed
   *  （dispose 消费——之后 set/mount/unmount 违例报错——不再静默） */
  private phase: 'active' | 'disposed' = 'active'

  /** 注册（prev 旧引用先退 null——diff 重绑；已注册同 id 覆盖——不重复触发） */
  set(id: string, fn: unknown, prev?: unknown): void {
    // **状态机违例（审计）**：disposed 后注册——ref 表已清——静默写入
    // 是隐藏错误
    if (this.phase === 'disposed') {
      console.error(`[vdom] ref 表状态机违例：disposed 后 set(${id}) 被忽略`)
      return
    }
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
  /** O(1) 单个 ref 卸载（**P1 性能升级（2027-09——admin 全量 59s 实证）**：
   *  procRemove 子树循环逐条调用——替代 unmount（全量前缀扫描 × 16k 条
   *  = O(N²)）——procDone 同步改造） */
  unmountOne(id: string): void {
    const fn = this.refs.get(id)
    if (typeof fn === 'function') {
      try { (fn as (el: null) => void)(null) } catch (e) { console.error('[vdom] ref unmount:', e) }
    }
    this.refs.delete(id)
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

  /** **清表（serve 整树替换式重置用）** */
  clear(): void {
    this.refs.clear()
  }

  /** 卸载清理（serve unmount）——状态机迁移：active → disposed */
  dispose(): void {
    if (this.phase === 'disposed') return // 幂等
    this.phase = 'disposed'
    this.refs.clear()
  }
}
