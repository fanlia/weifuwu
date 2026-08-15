/**
 * vdom3 ssr — 服务端事件流生成（dry-run——不创建 DOM）
 *
 * 差异化能力（可移植执行记录）：服务端执行组件（buildVNode）→ 生成渲染事件流
 * （NODE_CREATE/PROP_UPDATE/INSERT/TEXT_CREATE——自包含指令）→ 序列化传输 →
 * 客户端 replay(events, root) 重建 DOM——**零 DOM 猜测**（事件流自带全部指令）。
 *
 * 与 vdom2 SSR（HTML 字符串 + hydrate 游标收养）的本质区别：
 *  - vdom2：服务端序列化 HTML → 客户端解析 + 游标匹配（DOM 结构猜测）
 *  - vdom3：服务端生成事件流 → 客户端重放（精确增量——无猜测）
 */

import type { VNode, V3Event } from './types.ts'
import { Fragment, childrenOf } from './types.ts'
import { buildVNode } from './build.ts'
import { stream } from './events.ts'

/** 服务端渲染 → 事件流（dry-run：只生成指令，不创建 DOM——可传输/回放） */
export async function renderToEvents(vnode: VNode): Promise<V3Event[]> {
  // 组件构建（异步工厂/renderFn——COMP_MOUNT 事件进全局流）——用克隆（构建产物）
  const built = await buildVNode(vnode, {})
  // 树遍历生成 DOM 指令（dry-run——id 本地分配）
  const events: V3Event[] = []
  let uid = 0
  const nextId = () => `s${++uid}`
  const ts = Date.now()

  const walk = (v: VNode, parentId: string): void => {
    // 组件：输出 _child（已 build）
    if (typeof v.type === 'function') {
      const out = (v as any)._child ?? childrenOf(v)[0] ?? null
      if (out && typeof out === 'object' && !Array.isArray(out)) walk(out, parentId)
      return
    }
    if (v.type === Fragment) {
      for (const c of childrenOf(v)) if (c && typeof c === 'object' && !Array.isArray(c)) walk(c as VNode, parentId)
      return
    }
    // native
    const id = nextId()
    events.push({ type: 'NODE_CREATE', id, tag: v.type as string, ts })
    for (const [k, val] of Object.entries(v.props ?? {})) {
      if (k === 'key' || k === 'children') continue
      if (typeof val === 'function') continue // 事件/动态——不序列化（客户端需绑定）
      if (val != null && val !== false) events.push({ type: 'PROP_UPDATE', target: id, key: k, value: val, prev: '', ts })
    }
    events.push({ type: 'INSERT', parent: parentId, child: id, ref: null, ts })
    for (const c of childrenOf(v)) {
      if (typeof c === 'string' || typeof c === 'number') {
        const tid = nextId()
        events.push({ type: 'TEXT_CREATE', id: tid, value: String(c), ts })
        events.push({ type: 'INSERT', parent: id, child: tid, ref: null, ts })
      } else if (c && typeof c === 'object' && !Array.isArray(c)) {
        walk(c as VNode, id)
      }
    }
  }
  walk(built, 'root')
  return events
}

/**
 * 流式渲染：服务端逐事件推送（AsyncGenerator）→ 客户端逐事件应用
 * ——TTFB 后首帧渐进（根节点先到 → 内容逐块）——vdom2 无法做到（HTML 需完整）
 */
export async function* renderToEventStream(vnode: VNode): AsyncGenerator<V3Event> {
  // 组件构建（await 工厂/renderFn）
  const built = await buildVNode(vnode, {})
  let uid = 0
  const nextId = () => `s${++uid}`
  const ts = Date.now()

  const walk = function* (v: VNode, parentId: string): Generator<V3Event> {
    if (typeof v.type === 'function') {
      const out = (v as any)._child ?? childrenOf(v)[0] ?? null
      if (out && typeof out === 'object' && !Array.isArray(out)) yield* walk(out, parentId)
      return
    }
    if (v.type === Fragment) {
      for (const c of v.children ?? []) if (c && typeof c === 'object' && !Array.isArray(c)) yield* walk(c as VNode, parentId)
      return
    }
    const id = nextId()
    yield { type: 'NODE_CREATE', id, tag: v.type as string, ts }
    for (const [k, val] of Object.entries(v.props ?? {})) {
      if (k === 'key' || k === 'children') continue
      if (typeof val === 'function') continue
      if (val != null && val !== false) yield { type: 'PROP_UPDATE', target: id, key: k, value: val, prev: '', ts }
    }
    yield { type: 'INSERT', parent: parentId, child: id, ref: null, ts }
    for (const c of childrenOf(v)) {
      if (typeof c === 'string' || typeof c === 'number') {
        const tid = nextId()
        yield { type: 'TEXT_CREATE', id: tid, value: String(c), ts }
        yield { type: 'INSERT', parent: id, child: tid, ref: null, ts }
      } else if (c && typeof c === 'object' && !Array.isArray(c)) {
        yield* walk(c as VNode, id)
      }
    }
  }
  yield* walk(built, 'root')
}

/** 事件流 → HTML 字符串（首帧序列化——SEO/爬虫/首帧；客户端用事件流重建——零 DOM 猜测） */
export function eventsToHtml(events: V3Event[]): string {
  // 折叠：NODE_CREATE（id→tag）+ PROP_UPDATE（target→attrs）+ TEXT_CREATE（id→text）
  // → INSERT 树遍历输出 HTML
  const tags = new Map<string, string>()
  const attrs = new Map<string, Map<string, unknown>>()
  const texts = new Map<string, string>()
  for (const e of events) {
    if (e.type === 'NODE_CREATE') tags.set(e.id, e.tag)
    else if (e.type === 'PROP_UPDATE') {
      const m = attrs.get(e.target) ?? new Map()
      if (e.value == null || e.value === false) m.delete(e.key)
      else m.set(e.key, e.value)
      attrs.set(e.target, m)
    } else if (e.type === 'TEXT_CREATE') texts.set(e.id, e.value)
  }
  const childrenOf = new Map<string, string[]>()
  for (const e of events) {
    if (e.type === 'INSERT') {
      const arr = childrenOf.get(e.parent) ?? []
      arr.push(e.child)
      childrenOf.set(e.parent, arr)
    }
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const emit = (id: string): string => {
    const tag = tags.get(id)
    if (tag) {
      const a = attrs.get(id)
      const attrStr = a
        ? [...a.entries()]
            .filter(([k, v]) => typeof v !== 'function' && k !== 'data-v3-id' && k !== 'key' && k !== 'ref')
            .map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')
        : ''
      const kids = (childrenOf.get(id) ?? []).map(emit).join('')
      return `<${tag}${attrStr}>${kids}</${tag}>`
    }
    return esc(texts.get(id) ?? '')
  }
  return (childrenOf.get('root') ?? []).map(emit).join('')
}

/** 序列化（传输——事件流 JSON 化） */
export function serializeEvents(events: V3Event[]): string {
  return JSON.stringify(events)
}

/** 反序列化 */
export function deserializeEvents(json: string): V3Event[] {
  return JSON.parse(json) as V3Event[]
}

export { stream }
