/**
 * vdom core/field — events（事件通道——**事件代理**）
 *
 * 设计（2026-12 用户决策——事件代理）：
 * - **事件表**（EventRegistry——nodeId → event → handler）——setProp 事件
 *   写入表（**不直接 addEventListener**——prev 解绑由表替换取代——
 *   重复绑定根治天然）
 * - **根代理**：document 捕获阶段监听（动态注册——首次绑定某事件类型）——
 *   portal（#__wf_portal 在 body 下）可达——不冒泡事件（scroll/
 *   mouseenter）捕获可达
 * - **分发**（模拟冒泡语义——vdom3 同款）：e.target 向上祖先链——
 *   data-wf-id 查表——currentTarget 还原绑定元素（组件库依赖）——
 *   handler 内 stopPropagation（cancelBubble）停止向上——与原生冒泡一致
 * - **监听器数量 O(事件类型)** vs O(N)（列表/表格场景）——动态节点天然
 *   （增删无需绑定/解绑——查表）
 * - 生命周期：remove/done 清理表（子树前缀）；dispose 移除全部根监听
 *
 * 规则（设计规则 §6.4）：on + 大写判定（once/only 不误判）；事件名小写化；
 * 非函数值 warn + 跳过。
 */

/** 事件注册表 + 根代理（per serve 实例——document 捕获监听） */
export class EventRegistry {
  private table = new Map<string, Map<string, EventListener>>()
  private rootTypes = new Set<string>()
  private doc: Document
  private dispatchBound: (e: Event) => void
  /** 容器过滤（portal 独立通道——事件仅分发容器内 target——
   *  独立 applier 的节点 id 与主树同路径（root.0.x）——document 捕获时
   *  主树按钮祖先链命中独立表（onRemove 误触发——toast 多条 bug 实证）） */
  private container?: HTMLElement | null

  constructor(doc: Document, container?: HTMLElement | null) {
    this.doc = doc
    this.container = container
    this.dispatchBound = this.dispatch.bind(this)
  }

  /** 事件注册（代理写入——不直接绑定） */
  set(nodeId: string, event: string, handler: unknown): void {
    if (typeof handler !== 'function') {
      // 非函数值守卫（设计规则 §6.4：warn + 跳过——不中断渲染管线）
      console.warn(`[vdom] 事件 ${event} 非函数值被跳过（node ${nodeId}）——期望函数，实际 ${typeof handler}`)
      return
    }
    let m = this.table.get(nodeId)
    if (!m) {
      m = new Map()
      this.table.set(nodeId, m)
    }
    m.set(event, handler as EventListener)
    this.ensureRoot(event)
  }

  get(nodeId: string, event: string): EventListener | undefined {
    return this.table.get(nodeId)?.get(event)
  }

  /** 子树清理（id 前缀匹配——remove/done 卸载指令） */
  remove(nodeId: string): void {
    for (const id of [...this.table.keys()]) {
      if (id === nodeId || id.startsWith(nodeId + '.')) this.table.delete(id)
    }
  }

  /** 根监听动态注册（document 捕获——首次绑定某事件类型——portal 可达） */
  private ensureRoot(event: string): void {
    if (this.rootTypes.has(event)) return
    this.doc.addEventListener(event, this.dispatchBound, { capture: true } as never)
    this.rootTypes.add(event)
  }

  /** 分发（模拟冒泡——target 向上祖先链查表——currentTarget 还原——
   *  handler 内 stopPropagation 停止向上） */
  private dispatch(e: Event): void {
    // **容器过滤**（portal 独立通道）：target 不在容器内（主树元素）——跳过
    // （避免独立注册表被主树事件误命中——id 同路径冲突）
    if (this.container) {
      const t = e.target as Element | null
      if (t && !this.container.contains(t)) return
    }
    if (e.type === 'contextmenu' && (window as any).__dbgEvt) {
      const el0 = e.target as Element | null
      const all = [...this.table.entries()].map(([k, v]) => k + ':' + [...v.keys()].join('+')).join(' | ')
      console.error('[dbg-evt-dispatch]', 'target:', el0?.getAttribute('data-wf-id'), 'ALL:', all.slice(0, 400))
    }
    let el = e.target as Element | null
    if (el && el.nodeType === 3) el = el.parentElement
    while (el) {
      // closest 优化：跳过无 data-wf-id 的中间层
      if (!el.hasAttribute?.('data-wf-id')) {
        const idEl = el.closest?.('[data-wf-id]')
        if (idEl && idEl !== el) {
          el = idEl
          continue
        }
      }
      const id = el.getAttribute?.('data-wf-id')
      if (id) {
        const handler = this.table.get(id)?.get(e.type)
        if (handler) {
          // currentTarget 还原为绑定元素（代理监听在 document——
          // 组件库 e.currentTarget 取触发元素）
          try {
            Object.defineProperty(e, 'currentTarget', { value: el, configurable: true })
          } catch { /* 原生只读属性——尽力而为 */ }
          try {
            handler(e)
          } catch (err) {
            console.error('[vdom] 事件 handler:', err) // handler 失败隔离
          }
          // stopPropagation（cancelBubble）后停止向上——与原生冒泡一致
          if ((e as Event & { cancelBubble?: boolean }).cancelBubble) return
        }
      }
      el = el.parentElement
    }
  }

  /** 卸载清理（移除全部根监听 + 清表） */
  dispose(): void {
    for (const t of this.rootTypes) {
      this.doc.removeEventListener(t, this.dispatchBound, { capture: true } as never)
    }
    this.rootTypes.clear()
    this.table.clear()
  }
}

/** 事件 prop 判定（on + 大写——`once`/`only` 不误判） */
export const EVENT_RE = /^on[A-Z]/

/** 事件名解析（onClick → click；非事件返回 null） */
export function eventName(key: string): string | null {
  if (!EVENT_RE.test(key)) return null
  return key.slice(2).toLowerCase()
}
