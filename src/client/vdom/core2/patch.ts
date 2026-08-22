/**
 * vdom core2 — patch（事件消费——CRUD 四原语——id → DOM 节点表）
 *
 * 职责：事件应用（apply 流正向 / reverse 流逆序——可逆性契约的执行端）
 * ——nodes 表（id → Node）+ 幂等防御（create 同形复用/已挂载 skip）——
 * **区间语义**：delete 按 id 前缀级联（A1 id 规则下安全——key 注入
 * 防御见 id.ts）。
 *
 * create 原子（创建 + 挂载一体——parent/ref 在事件内——ref=null =
 * 容器头部）；update 三态（text/attrs 整体替换/move）；read 无副作用
 * （查询面——diff 对照基础）。
 *
 * 本步为测试基座（fake DOM 注入——同 vnode2dom 的 DomFactory）——真实
 * 浏览器消费端（场景层）后续同构实现。
 */

import type { Event } from './command.ts'
import { HOLE_NULL, HOLE_TRUE, HOLE_FALSE, HOLE_INVALID, HOLE_SPLIT, FRAG_START, FRAG_END } from './dom.ts'

/** 最小节点面（fake/真实 DOM 的共同结构——消费端只依赖这些） */
export interface DomNode {
  nodeType: number
  parentNode: DomNode | null
  childNodes: DomNode[]
  textContent: string | null
  appendChild(c: DomNode): DomNode
  remove(): void
  setAttribute?(n: string, v: string): void
  removeAttribute?(n: string): void
  tagName?: string
  attributes?: { name: string; value: string }[]
}

/** 事件应用器（nodes 表——id → 节点——前缀级联删除） */
export class EventApplier {
  nodes = new Map<string, DomNode>()
  /** 本流已创建 id（流结束清理未触及——delete 显式后此表可简化） */
  touched = new Set<string>()
  /** 根容器（'root' id 指向） */
  root: DomNode
  private createEl: (tag: string) => DomNode
  private createText: (v: string) => DomNode
  private createComment: (v: string) => DomNode

  constructor(root: DomNode, factory: {
    createElement(tag: string): DomNode
    createTextNode(v: string): DomNode
    createComment(v: string): DomNode
  }) {
    this.root = root
    this.createEl = factory.createElement
    this.createText = factory.createTextNode
    this.createComment = factory.createComment
  }

  /** 父解析（'root' → 根容器；节点表；组件逻辑父回退——逐段截断） */
  parentOf(parent: string): DomNode | null {
    if (parent === 'root') return this.root
    const direct = this.nodes.get(parent)
    if (direct) return direct
    const segs = parent.split('.')
    for (let i = segs.length - 1; i > 0; i--) {
      const p = segs.slice(0, i).join('.')
      if (p === 'root') return this.root
      const n = this.nodes.get(p)
      if (n) return n
    }
    return null
  }

  /** 子树记录清理（前缀级联——区间语义） */
  private clearSubtree(id: string): void {
    for (const k of [...this.nodes.keys()]) {
      if (k === id || k.startsWith(id + '.')) this.nodes.delete(k)
    }
  }

  /** 挂载（ref=null = **顺序构建语义——append 尾部**（core2 转换流：旧
   *  侧先删——容器空或 ref 链定位——create 原子顺序创建）；ref 失效 →
   *  尾部容错） */
  private attach(el: DomNode, parent: string, ref: string | null): void {
    const p = this.parentOf(parent)
    if (!p || el.parentNode) return // 幂等（isConnected 语义）
    if (ref) {
      const prev = this.nodes.get(ref) ?? null
      const idx = prev ? p.childNodes.indexOf(prev) : -1
      if (idx >= 0) { p.childNodes.splice(idx + 1, 0, el); el.parentNode = p; return }
      p.appendChild(el)
      return
    }
    p.appendChild(el)
  }

  /** 应用单条事件（幂等防御——合法流零猜测） */
  apply(ev: Event): void {
    switch (ev.op) {
      case 'create': {
        this.touched.add(ev.id)
        const ex = this.nodes.get(ev.id)
        switch (ev.payload.kind) {
          case 'text': {
            if (ex && ex.nodeType === 3) { if (ex.textContent !== ev.payload.value) ex.textContent = ev.payload.value; break }
            const t = this.createText(ev.payload.value)
            this.nodes.set(ev.id, t)
            this.attach(t, ev.parent, ev.ref)
            break
          }
          case 'hole': {
            if (ex && ex.nodeType === 8) break
            const v = ev.payload.value
            const mark = v === 'start' ? FRAG_START : v === 'end' ? FRAG_END
              : v === 'split' ? HOLE_SPLIT : v === 'invalid' ? HOLE_INVALID
              : v === true ? HOLE_TRUE : v === false ? HOLE_FALSE : HOLE_NULL
            const c = this.createComment(mark)
            this.nodes.set(ev.id, c)
            this.attach(c, ev.parent, ev.ref)
            break
          }
          case 'element': {
            if (ex && ex.nodeType === 1 && ex.tagName?.toLowerCase() === ev.payload.tag) break // 同形复用
            const el = this.createEl(ev.payload.tag)
            for (const [k, v] of Object.entries(ev.payload.attrs)) el.setAttribute?.(k, String(v))
            this.nodes.set(ev.id, el)
            this.attach(el, ev.parent, ev.ref)
            break
          }
        }
        break
      }
      case 'read': {
        // 查询面（diff 对照——无 DOM 副作用）
        break
      }
      case 'update': {
        const el = this.nodes.get(ev.id)
        if (!el) return
        if ('text' in ev.patch) {
          if (el.nodeType === 3) el.textContent = ev.patch.text
        } else if ('attrs' in ev.patch) {
          if (el.nodeType === 1) {
            // 属性整体替换（style 纪律——键消失不残留）
            for (const [k, v] of Object.entries(ev.patch.attrs)) el.setAttribute?.(k, String(v))
          }
        } else if ('move' in ev.patch) {
          const p = el.parentNode
          if (p) { const i = p.childNodes.indexOf(el); if (i >= 0) p.childNodes.splice(i, 1); el.parentNode = null }
          this.attach(el, ev.patch.move.parent, ev.patch.move.ref)
        }
        break
      }
      case 'delete': {
        const el = this.nodes.get(ev.id)
        if (el) el.remove()
        this.clearSubtree(ev.id)
        break
      }
    }
  }

  /** 应用事件序列（reverse 流调用方先 reverse()——整体逆序） */
  applyAll(events: Event[]): void {
    for (const e of events) this.apply(e)
  }
}
