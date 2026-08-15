/**
 * vdom2/dom-trace — DOM 写操作实时追踪（vdom → DOM 层完全可观测）
 *
 * 缺口：diff 对 DOM 做了什么（appendChild/insertBefore/removeChild/replaceChild/
 * setAttribute/removeAttribute）没有事件——事故时只知道"vnode 变了"不知道"DOM 动了什么"。
 *
 * 机制：`__WF_DOM_TRACE` 开启时 hook Node.prototype / Element.prototype 写方法——
 * 每次写操作发射 machine=dom 事件（ring 记录全程；console sink 由 trace 开关门控）。
 * 事件字段：op（写操作）、target（被写元素描述）、parent（父节点描述）、ref、
 * session（当前渲染会话——diff 期间写入自动关联）。
 *
 * 卸载函数返回（测试/关闭时恢复原型）。
 */
import { emit, currentSession } from './events.ts'

/** 元素/节点摘要（tag#id.class[data-wf-key][data-wf-id]——DOM 定位） */
function nodeDesc(n: Node | null, max = 40): string {
  if (!n) return 'null'
  if (n.nodeType === 1) {
    const el = n as Element
    const parts = [el.tagName.toLowerCase()]
    if (el.id) parts.push('#' + el.id)
    const cls = String(el.className || '').split(' ').filter(Boolean).slice(0, 2)
    if (cls.length) parts.push('.' + cls.join('.'))
    const k = el.getAttribute?.('data-wf-key')
    if (k) parts.push(`@${k}`)
    const id = el.getAttribute?.('data-wf-id')
    if (id) parts.push(`(${id})`)
    return parts.join('').slice(0, max)
  }
  if (n.nodeType === 8) return `<!--${(n.nodeValue ?? '').slice(0, 20)}-->`
  if (n.nodeType === 3) return `"${(n.textContent ?? '').slice(0, 12)}"`
  return `#${n.nodeType}`
}

/** DOM 写追踪开关（__WF_DOM_TRACE——audit 开启时自动安装；独立可开） */
export function domTraceEnabled(): boolean {
  return !!((globalThis as Record<string, unknown>)?.__WF_DOM_TRACE)
}

let installed = false

/** 安装 DOM 写追踪（幂等——audit/uiServe 初始化时调用；返回卸载函数） */
export function installDomTrace(): () => void {
  if (installed) return () => {}
  installed = true
  type AnyFn = (...a: any[]) => any
  const ops: Array<{ proto: any; name: string; describe: (...a: any[]) => { target: string; parent: string; ref?: string } }> = [
    { proto: Node.prototype, name: 'appendChild', describe: (el: Node, node: Node) => ({ parent: nodeDesc(el), target: nodeDesc(node) }) },
    { proto: Node.prototype, name: 'insertBefore', describe: (el: Node, node: Node, ref: Node | null) => ({ parent: nodeDesc(el), target: nodeDesc(node), ref: nodeDesc(ref) }) },
    { proto: Node.prototype, name: 'removeChild', describe: (el: Node, node: Node) => ({ parent: nodeDesc(el), target: nodeDesc(node) }) },
    { proto: Node.prototype, name: 'replaceChild', describe: (el: Node, node: Node, old: Node) => ({ parent: nodeDesc(el), target: nodeDesc(node), ref: 'replace ' + nodeDesc(old) }) },
    { proto: Element.prototype, name: 'setAttribute', describe: (el: Element, key: string, val: string) => ({ parent: nodeDesc(el), target: key, ref: `=${String(val).slice(0, 30)}` }) },
    { proto: Element.prototype, name: 'removeAttribute', describe: (el: Element, key: string) => ({ parent: nodeDesc(el), target: key }) },
  ]
  const originals = new Map<string, AnyFn>()
  for (const op of ops) {
    const orig = op.proto[op.name] as AnyFn
    if (typeof orig !== 'function') continue
    originals.set(op.name, orig)
    op.proto[op.name] = function (this: any, ...args: any[]) {
      if (domTraceEnabled()) {
        try {
          const d = op.describe(this, ...args)
          emit({
            session: currentSession(), machine: 'dom', nodeId: null, component: null,
            from: op.name, event: 'WRITE', to: '',
            payload: () => ({ ...d, ts: Date.now() }), level: 'trace', ts: Date.now(),
          })
        } catch { /* 描述失败不影响写操作 */ }
      }
      return orig.apply(this, args as any)
    }
  }
  return () => {
    installed = false
    for (const [name, orig] of originals) {
      const proto = (name.startsWith('set') || name.startsWith('remove') ? Element.prototype : Node.prototype) as any
      proto[name] = orig
    }
    originals.clear()
  }
}
