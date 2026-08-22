/**
 * vdom core2 — dom（vnode ⟷ DOM 双向转换——核心公理 A1/A2 的实现）
 *
 * 范围（本步——结构级转换——**不考虑 id/事件/函数面**）：
 * - A1 编码：vnode → Node[]（统一序列——展开区间语义：text/hole/element
 *   返回单节点数组——组件/数组展开返回多项——组件执行工厂 + renderFn 后
 *   输出递归）
 * - A2 逆向：Node → vnode（结构恢复——Text → text；wf-hole 注释 → hole；
 *   Element → element vnode——props 从 attributes 恢复（字符串面））
 * - 保真范围（已知语义——后续 encode 步骤以 data-wf-props 全保真）：
 *   ① 字符串属性完全保真；number/bool 经 String() 字符串化（类型变化）
 *   ② props.style 对象 → cssText 字符串（kebab-case）——逆向为字符串
 *   ③ 事件/函数值跳过（函数表后续）；ref 跳过
 *   ④ 组件 round-trip 到**展开结构**（组件函数不可序列化——A2 对
 *      可序列化面成立——展开区间语义）
 * - 单射 A3：同位置的异 vnode → 结构可区分的 DOM（结构断言测试锁定）
 *
 * 消费面（后续步骤）：renderToDom（build 用本函数 + id 注入）/
 * absorb（dom2vnode 反推 SSR 结构）。
 */

import type { UIContext } from '../context/UIContext.ts'
import { classify, childrenOf, invalidDiagnostic, h, type Component, type VNode, type VNodeChild } from './vnode.ts'

/** DOM 工厂最小接口（创建面——正向编码只依赖这三个——测试可注入 fake） */
export interface DomFactory {
  createTextNode(text: string): Text
  createComment(text: string): Comment
  createElement(tag: string): Element
}

/** 空洞锚注释标记（值编码——逆向恢复原始 vnode 状态——同构不变量） */
export const HOLE_NULL = 'wf-hole: null'
export const HOLE_TRUE = 'wf-hole: true'
export const HOLE_FALSE = 'wf-hole: false'
export const HOLE_INVALID = 'wf-hole: invalid'
export const FRAG_START = 'wf-hole: fragment-start'
export const FRAG_END = 'wf-hole: fragment-end'
export const HOLE_SPLIT = 'wf-hole: split'

/** 文本项分隔锚（**数组内连续文本边界——array 是节点类型——任何层不
 *  允许 merge/concat——'a','b' 与 'ab' 是不同节点——连续文本之间插分隔
 *  锚——逆向逐段恢复——渲染/解析端 split 锚本身无 vnode 语义（纯分隔）） */
export function splitMark(): string {
  return HOLE_SPLIT
}

/** hole 值 → 注释标记（null/true/false——undefined 归一 null） */
export function holeMark(value: null | boolean): string {
  return value === null ? HOLE_NULL : value ? HOLE_TRUE : HOLE_FALSE
}

/** 注释内容 → 标记语义（hole 值 / invalid / fragment 边界 / 非标记） */
export type HoleMark =
  | { kind: 'hole'; value: null | boolean }
  | { kind: 'invalid' }
  | { kind: 'fragStart' }
  | { kind: 'fragEnd' }
  | { kind: 'none' }

export function parseHoleMark(comment: string): HoleMark {
  switch (comment) {
    case HOLE_NULL: return { kind: 'hole', value: null }
    case HOLE_TRUE: return { kind: 'hole', value: true }
    case HOLE_FALSE: return { kind: 'hole', value: false }
    case HOLE_INVALID: return { kind: 'invalid' }
    case FRAG_START: return { kind: 'fragStart' }
    case FRAG_END: return { kind: 'fragEnd' }
    default: return { kind: 'none' }
  }
}

/** style 对象 → cssText（camelCase → kebab-case——本步保真到字符串面） */
export function styleString(style: Record<string, unknown>): string {
  return Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${String(v)}`)
    .join(';')
}

/**
 * vnode → DOM（A1 编码——结构转换——统一返回 Node[]：
 *  单节点类型 → [node]；组件/数组 → 展开多项——区间语义）
 * @param ctx 组件工厂上下文（组件展开需要——无组件可省略）
 */
export async function vnode2dom(v: VNodeChild, doc: DomFactory, ctx?: UIContext): Promise<Node[]> {
  const c = classify(v)
  switch (c.kind) {
    case 'text':
      return [doc.createTextNode(c.value)]
    case 'hole':
      return [doc.createComment(holeMark(c.value))]
    case 'element':
      return [await element2dom(c.v, doc, ctx)]
    case 'component': {
      // 组件展开（两阶段——工厂 = mount 一次 + renderFn = 每次渲染——
      // 输出递归——展开区间——A1 对组件的"唯一对应"）
      const renderFn = await (c.v.type as Component)(c.v.props, ctx ?? ({} as UIContext))
      const out = await renderFn(c.v.props)
      return vnode2dom(out, doc, ctx)
    }
    case 'array': {
      // 数组边界锚（start/end 注释——逆向恢复数组结构——嵌套递归）——
      // **连续文本项之间插 split 分隔锚（array 节点类型——文本边界保真——
      //  不 merge——逆向逐段恢复）**
      const out: Node[] = [doc.createComment(FRAG_START)]
      let prevText = false
      for (const item of c.items) {
        if (prevText && typeof item === 'string') out.push(doc.createComment(HOLE_SPLIT))
        out.push(...(await vnode2dom(item, doc, ctx)))
        prevText = typeof item === 'string' || typeof item === 'number'
      }
      out.push(doc.createComment(FRAG_END))
      return out
    }
    case 'invalid': {
      // 诊断占位（不崩溃不静默——core1 纪律）——空序列（无 DOM 实体）
      console.warn(`[core2] 非法子节点——${invalidDiagnostic(c.v)}`)
      return []
    }
  }
}

/** 元素编码（createElement + props 序列化面 + children 递归） */
async function element2dom(v: VNode, doc: DomFactory, ctx?: UIContext): Promise<Element> {
  const el = doc.createElement(v.type as string)
  for (const [k, val] of Object.entries(v.props)) {
    if (k === 'children' || k === 'key' || k === 'ref') continue
    if (typeof val === 'function') continue // 事件/函数面——函数表后续
    if (k === 'style' && val !== null && typeof val === 'object') {
      el.setAttribute('style', styleString(val as Record<string, unknown>))
    } else if (val !== null && val !== undefined) {
      el.setAttribute(k, String(val))
    }
  }
  for (const child of childrenOf(v)) {
    for (const n of await vnode2dom(child, doc, ctx)) el.appendChild(n)
  }
  return el
}

/**
 * DOM → vnode（A2 逆向——结构恢复——单节点入口）：
 *  Text → text（值 = textContent）；wf-hole 注释 → hole（null）；
 *  Element → element vnode（props 从 attributes 恢复——字符串面——
 *  style 为字符串——tagName 小写化保真）
 */
export function dom2vnode(node: Node): VNodeChild {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType === 8) {
    // 注释——标记解析：hole 值恢复（null/true/false——值保真）；数组
    // 边界/其他注释由 dom2vnodeAll 处理——单节点版本归 hole
    const m = parseHoleMark((node as Comment).textContent ?? '')
    if (m.kind === 'hole') return m.value
    return null
  }
  const el = node as Element
  const props: Record<string, unknown> = {}
  for (const attr of el.attributes) {
    props[attr.name] = attr.value
  }
  const children = Array.from(el.childNodes).map(dom2vnode)
  return children.length === 0
    ? h(el.tagName.toLowerCase(), props)
    : h(el.tagName.toLowerCase(), props, ...children)
}

/** DOM 序列 → vnode 序列（组件展开区间的逆向——逐节点恢复——数组边界
 *  锚栈式解析：fragment-start → 新数组上下文；fragment-end → 收栈） */
export function dom2vnodeAll(nodes: Iterable<Node>): VNodeChild[] {
  const out: VNodeChild[] = []
  const stack: VNodeChild[][] = []
  const target = (): VNodeChild[] => (stack.length > 0 ? stack[stack.length - 1]! : out)
  for (const node of nodes) {
    if (node.nodeType === 8) {
      const m = parseHoleMark((node as Comment).textContent ?? '')
      if (m.kind === 'fragStart') { stack.push([]); continue }
      if (m.kind === 'fragEnd') {
        const items = stack.pop()!
        target().push(items)
        continue
      }
      if (m.kind === 'hole') { target().push(m.value); continue }
      if (m.kind === 'invalid') { target().push(null); continue }
      // split/其他注释——忽略（split 纯分隔——前后文本段独立 push）
      continue
    }
    target().push(dom2vnode(node))
  }
  return out
}
