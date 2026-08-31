/**
 * 契约测试基建——最小 fake DOM（v2 serve 级测试用——零依赖手写）
 *
 * 覆盖面 = v2 serve/CommandApplier 实际触达的 DOM 子集：
 * - 元素：createElement/createTextNode/appendChild/insertBefore/remove/
 *   setAttribute/getAttribute/textContent/firstChild/nextSibling/parentNode
 * - style：`el.style[k]=v` / cssText / setProperty / removeProperty
 * - 事件：addEventListener/removeEventListener（收集——测试可手动派发）
 * - 文档：querySelector('#root') / addEventListener
 * - window：popstate 监听 / history.pushState/replaceState（location 同步）/
 *   performance.now / requestAnimationFrame（可控 fire——停摆模拟）
 *
 * W1（VDOM-STREAM-FIX-PLAN）：v2 serve 级契约——重渲染落地性逐环断言。
 */

export class FakeStyle {
  private props = new Map<string, string>()
  setProperty(k: string, v: string): void { this.props.set(k, v) }
  removeProperty(k: string): void { this.props.delete(k) }
  getProperty(k: string): string | undefined { return this.props.get(k) }
  /** `el.style[k] = v` 赋值面（applyStyleValue 直落——kebab 键经代理时键名为原文） */
  setItem(k: string, v: string): void { this.props.set(k, v) }
  getItem(k: string): string | undefined { return this.props.get(k) }
  get cssText(): string {
    return [...this.props].map(([k, v]) => `${k}: ${v}`).join('; ')
  }
  set cssText(v: string) {
    if (v === '') { this.props.clear(); return }
    for (const part of v.split(';').filter(Boolean)) {
      const [k, val] = part.split(':')
      if (k && val) this.props.set(k.trim(), val.trim())
    }
  }
  constructor() {
    // **代理（style[k]=v 直落——2027-XX 升级）**：applyStyleValue 的
    // `(el.style as any)[key] = v` 赋值/读取直进 props（与真实 CSSStyleDeclaration
    // 同构——cssText 派生自 props——清空/键消失可观测）
    return new Proxy(this, {
      get: (t, k) => {
        if (typeof k !== 'string' || k in t) return (t as any)[k]
        return t.props.has(k) ? (t.props.get(k) as unknown) : ''
      },
      set: (t, k, v) => {
        if (typeof k !== 'string' || k in t) { (t as any)[k] = v; return true }
        if (v === '' || v === undefined || v === null) t.props.delete(k)
        else t.props.set(k, String(v))
        return true
      },
    })
  }
}

export class FakeNode {
  nodeType = 1
  childNodes: FakeNode[] = []
  parentNode: FakeNode | null = null
  textContent = ''
  value = ''
  listeners = new Map<string, Array<(e?: unknown) => void>>()

  /** 连接性（procInsert 幂等 skip / parentOf 父链解析依赖——真实 DOM 语义：在树中=有父） */
  get isConnected(): boolean {
    return this.parentNode !== null
  }

  get firstChild(): FakeNode | null { return this.childNodes[0] ?? null }
  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null
    const sibs = this.parentNode.childNodes
    const i = sibs.indexOf(this)
    return sibs[i + 1] ?? null
  }
  appendChild(child: FakeNode): FakeNode {
    if (child.parentNode) child.parentNode.removeChildNode(child)
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }
  insertBefore(child: FakeNode, ref: FakeNode | null): FakeNode {
    if (child.parentNode) child.parentNode.removeChildNode(child)
    child.parentNode = this
    if (!ref) { this.childNodes.push(child); return child }
    const i = this.childNodes.indexOf(ref)
    if (i === -1) this.childNodes.push(child)
    else this.childNodes.splice(i, 0, child)
    return child
  }
  /** 内部：从父摘除（不触发事件清理——applier 层负责） */
  removeChildNode(child: FakeNode): void {
    const i = this.childNodes.indexOf(child)
    if (i !== -1) { this.childNodes.splice(i, 1); child.parentNode = null }
  }
  remove(): void { this.parentNode?.removeChildNode(this) }
  addEventListener(type: string, fn: (e?: unknown) => void): void {
    let arr = this.listeners.get(type)
    if (!arr) { arr = []; this.listeners.set(type, arr) }
    arr.push(fn)
  }
  removeEventListener(type: string, fn: (e?: unknown) => void): void {
    const arr = this.listeners.get(type)
    if (!arr) return
    const i = arr.indexOf(fn)
    if (i !== -1) arr.splice(i, 1)
  }
  dispatch(type: string, e?: unknown): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(e)
  }
}

export class FakeElement extends FakeNode {
  static nextId = 0
  id = `fe-${++FakeElement.nextId}`
  tag: string
  attrs = new Map<string, string>()
  style = new FakeStyle()

  constructor(tag: string) {
    super()
    this.tag = tag
  }
  /** innerHTML 赋值面（serve resetRoot/unmount 用 `innerHTML = ''` 清树） */
  set innerHTML(v: string) {
    this.childNodes.length = 0
    if (v) this.childNodes.push(new FakeTextNode(v))
  }
  get innerHTML(): string {
    return this.childNodes.map((c) => (c instanceof FakeElement ? c.getFullText() : c.textContent)).join('')
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, String(v))
    if (k === 'id') this.id = String(v)
  }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null }
  /** 全部后代元素（吸收检测 querySelectorAll('*')） */
  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = []
    const walk = (n: FakeNode): void => {
      for (const c of n.childNodes) {
        if (c instanceof FakeElement) {
          if (selector === '*' || c.tag === selector || c.matchesSimple(selector)) out.push(c)
          walk(c)
        }
      }
    }
    walk(this)
    return out
  }
  /** 极简选择器：#id / tag（serve/测试用） */
  matchesSimple(sel: string): boolean {
    if (sel.startsWith('#')) return this.id === sel.slice(1)
    return this.tag === sel
  }
  /** 文本聚合（断言面——元素 textContent = 子树文本拼接） */
  getFullText(): string {
    if (this.nodeType === 3) return this.textContent
    return this.childNodes.map((c) => (c instanceof FakeElement ? c.getFullText() : c.textContent)).join('')
  }
}

export class FakeTextNode extends FakeNode {
  nodeType = 3
  constructor(text: string) { super(); this.textContent = text }
}

export class FakeDocument extends FakeNode {
  createElement(tag: string): FakeElement { return new FakeElement(tag) }
  createTextNode(text: string): FakeTextNode { return new FakeTextNode(text) }
  querySelector(sel: string): FakeElement | null {
    // 测试只挂 #root
    if (sel.startsWith('#') && this.childNodes.length) {
      const find = (n: FakeNode): FakeElement | null => {
        for (const c of n.childNodes) {
          if (c instanceof FakeElement) {
            if (c.id === sel.slice(1)) return c
            const hit = find(c)
            if (hit) return hit
          }
        }
        return null
      }
      return find(this)
    }
    return null
  }
}

export interface FakeHistoryEntry { url: string }

export class FakeWindow extends FakeNode {
  location = { pathname: '/', search: '', href: 'http://localhost/' }
  history = {
    pushState: (_s: unknown, _t: string, url: string) => { this.setLocation(url) },
    replaceState: (_s: unknown, _t: string, url: string) => { this.setLocation(url) },
  }
  performance = { now: () => Date.now() }
  /** rAF 控制：默认停摆模式（测试显式 flush）——真实语义由测试自选 */
  rafQueue: Array<{ id: number; fn: (t: number) => void }> = []
  private rafId = 0
  __DATA__?: Record<string, unknown>
  __WF_DEV__?: boolean

  requestAnimationFrame(fn: (t: number) => void): number {
    const id = ++this.rafId
    this.rafQueue.push({ id, fn })
    return id
  }
  cancelAnimationFrame(id: number): void {
    const i = this.rafQueue.findIndex((r) => r.id === id)
    if (i !== -1) this.rafQueue.splice(i, 1)
  }
  /** 手动触发全部排队的 rAF（模拟浏览器帧——停摆测试不调用它） */
  flushRaf(now = 1000): void {
    const q = [...this.rafQueue]
    this.rafQueue.length = 0
    for (const r of q) r.fn(now)
  }
  setLocation(url: string): void {
    const u = new URL(url, 'http://localhost')
    this.location.pathname = u.pathname
    this.location.search = u.search
    this.location.href = u.href
  }
}
