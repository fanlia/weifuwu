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

import type { VNode, V3Event, V3Ctx } from './types.ts'
import { Fragment, childrenOf } from './types.ts'
import { buildVNode } from './build.ts'
import { stream, ev } from './events.ts'

/** 服务端渲染 → 事件流（dry-run：只生成指令，不创建 DOM——可传输/回放） */
export async function renderToEvents(vnode: VNode): Promise<V3Event[]> {
  // 组件构建（异步工厂/renderFn——COMP_MOUNT 事件进全局流）——用克隆（构建产物）
  const built = await buildVNode(vnode, {} as V3Ctx)
  // 树遍历生成 DOM 指令（dry-run——id 本地分配）
  const events: V3Event[] = []
  let uid = 0
  const nextId = () => `s${++uid}`
  const ts = Date.now()

  const walk = (v: VNode, parentId: string): void => {
    // 组件：输出 _child（已 build）
    if (typeof v.type === 'function') {
      const out = v._child ?? childrenOf(v)[0] ?? null
      if (out && typeof out === 'object' && !Array.isArray(out)) walk(out, parentId)
      return
    }
    if (v.type === Fragment) {
      for (const c of childrenOf(v)) {
        // 锚点法：每槽位恒一锚（与客户端 genSlot 同构——[锚, 内容]）
        const aid = nextId()
        events.push(ev('node', 'create', aid, { kind: 'anchor' }))
        events.push(ev('node', 'insert', aid, { parent: parentId, ref: null }))
        if (c == null || c === false || c === true) {
          // 空洞 = 只有锚
        } else if (typeof c === 'string' || typeof c === 'number') {
          // 文本子节点（Fragment 包裹的文本——renderInline default 分支）
          const tid = nextId()
          events.push(ev('text', 'create', tid, { value: String(c) }))
          events.push(ev('node', 'insert', tid, { parent: parentId, ref: null }))
        } else if (c && typeof c === 'object' && !Array.isArray(c)) {
          walk(c as VNode, parentId)
        }
      }
      return
    }
    // native
    const id = nextId()
    events.push(ev('node', 'create', id, { tag: v.type as string }))
    // data-v3-id 输出（hydration 吸收标记——客户端 create 时覆盖为客户端 id 空间）
    events.push(ev('prop', 'update', id, { key: 'data-v3-id', value: id, prev: '' }))
    for (const [k, val] of Object.entries(v.props ?? {})) {
      if (k === 'key' || k === 'children') continue
      if (typeof val === 'function') continue // 事件/动态——不序列化（客户端需绑定）
      if (val != null && val !== false) events.push(ev('prop', 'update', id, { key: k, value: val, prev: '' }))
    }
    events.push(ev('node', 'insert', id, { parent: parentId, ref: null }))
    for (const c of childrenOf(v)) {
      // 锚点法：每槽位恒一锚（与客户端 genSlot 同构——[锚, 内容]）
      const aid = nextId()
      events.push(ev('node', 'create', aid, { kind: 'anchor' }))
      events.push(ev('node', 'insert', aid, { parent: id, ref: null }))
      if (c == null || c === false || c === true) {
        // 空洞 = 只有锚
      } else if (typeof c === 'string' || typeof c === 'number') {
        const tid = nextId()
        events.push(ev('text', 'create', tid, { value: String(c) }))
        events.push(ev('node', 'insert', tid, { parent: id, ref: null }))
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
  const built = await buildVNode(vnode, {} as V3Ctx)
  let uid = 0
  const nextId = () => `s${++uid}`
  const ts = Date.now()

  const walk = function* (v: VNode, parentId: string): Generator<V3Event> {
    if (typeof v.type === 'function') {
      const out = v._child ?? childrenOf(v)[0] ?? null
      if (out && typeof out === 'object' && !Array.isArray(out)) yield* walk(out, parentId)
      return
    }
    if (v.type === Fragment) {
      for (const c of v.children ?? []) if (c && typeof c === 'object' && !Array.isArray(c)) yield* walk(c as VNode, parentId)
      return
    }
    const id = nextId()
    yield ev('node', 'create', id, { tag: v.type as string })
    yield ev('prop', 'update', id, { key: 'data-v3-id', value: id, prev: '' })
    for (const [k, val] of Object.entries(v.props ?? {})) {
      if (k === 'key' || k === 'children') continue
      if (typeof val === 'function') continue
      if (val != null && val !== false) yield ev('prop', 'update', id, { key: k, value: val, prev: '' })
    }
    yield ev('node', 'insert', id, { parent: parentId, ref: null })
    for (const c of childrenOf(v)) {
      // 锚点法：每槽位恒一锚
      const aid = nextId()
      yield ev('node', 'create', aid, { kind: 'anchor' })
      yield ev('node', 'insert', aid, { parent: id, ref: null })
      if (c == null || c === false || c === true) {
        // 空洞 = 只有锚
      } else if (typeof c === 'string' || typeof c === 'number') {
        const tid = nextId()
        yield ev('text', 'create', tid, { value: String(c) })
        yield ev('node', 'insert', tid, { parent: id, ref: null })
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
  const holes = new Set<string>()
  for (const e of events) {
    if (e.entity === 'node' && e.action === 'create') {
      const pl = e.payload as { tag: string; kind?: string }
      if (pl.kind === 'hole' || pl.kind === 'anchor') holes.add(e.target!)
      else tags.set(e.target!, pl.tag)
    }
    else if (e.entity === 'prop' && e.action === 'update') {
      const pl = e.payload as { key: string; value: unknown }
      const m = attrs.get(e.target!) ?? new Map()
      if (pl.value == null || pl.value === false) m.delete(pl.key)
      else if (pl.key === 'style' && typeof pl.value === 'object' && !Array.isArray(pl.value)) m.set(pl.key, styleToCss(pl.value as Record<string, unknown>))
      else m.set(pl.key, pl.value)
      attrs.set(e.target!, m)
    } else if (e.entity === 'text' && e.action === 'create') texts.set(e.target!, (e.payload as { value: string }).value)
  }
  const childrenOf = new Map<string, string[]>()
  for (const e of events) {
    if (e.entity === 'node' && e.action === 'insert') {
      const pl = e.payload as { parent: string }
      const arr = childrenOf.get(pl.parent) ?? []
      arr.push(e.target!)
      childrenOf.set(pl.parent, arr)
    }
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const emit = (id: string): string => {
    if (holes.has(id)) return '<!--wf-anchor-->'
    const tag = tags.get(id)
    if (tag) {
      const a = attrs.get(id)
      const attrStr = a
        ? [...a.entries()]
            // data-v3-id 保留（hydration 吸收标记——服务端 id 客户端覆盖为客户端 id 空间）
            .filter(([k, v]) => typeof v !== 'function' && k !== 'key' && k !== 'ref')
            .map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')
        : ''
      const kids = (childrenOf.get(id) ?? []).map(emit).join('')
      return `<${tag}${attrStr}>${kids}</${tag}>`
    }
    return esc(texts.get(id) ?? '')
  }
  return (childrenOf.get('root') ?? []).map(emit).join('')
}

/** style 对象 → cssText（camelCase → kebab-case——事件流消费端共用：SSR + replay） */
export function styleToCss(val: Record<string, unknown>): string {
  return Object.entries(val)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`).join(';')
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
