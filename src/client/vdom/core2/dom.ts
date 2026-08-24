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
import { classify, childrenOf, invalidDiagnostic, h, textMarks, type Component, type VNode, type VNodeChild } from './vnode.ts'

/** DOM 工厂最小接口（创建面——正向编码只依赖这三个——测试可注入 fake） */
export interface DomFactory {
  createTextNode(text: string): Text
  createComment(text: string): Comment
  createElement(tag: string): Element
}

/** 空洞锚注释标记（值编码——逆向恢复原始 vnode 状态——同构不变量） */
export const HOLE_NULL = 'wf-hole: null'
export const HOLE_UNDEFINED = 'wf-hole: undefined'
export const HOLE_TRUE = 'wf-hole: true'
export const HOLE_FALSE = 'wf-hole: false'
export const TEXT_NUMBER = 'wf-hole: text-number'
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

/** hole 值 → 注释标记（null/undefined/true/false——**值全保真**——
 *  undefined 独立标记（不再归一 null——A3）） */
export function holeMark(value: null | boolean | undefined): string {
  if (value === null) return HOLE_NULL
  if (value === undefined) return HOLE_UNDEFINED
  return value ? HOLE_TRUE : HOLE_FALSE
}

/** 注释内容 → 标记语义（hole 值 / invalid / fragment 边界 / 非标记） */
export type HoleMark =
  | { kind: 'hole'; value: null | boolean | undefined }
  | { kind: 'textNumber' }
  | { kind: 'invalid' }
  | { kind: 'fragStart' }
  | { kind: 'fragEnd' }
  | { kind: 'none' }

export function parseHoleMark(comment: string): HoleMark {
  switch (comment) {
    case HOLE_NULL: return { kind: 'hole', value: null }
    case HOLE_UNDEFINED: return { kind: 'hole', value: undefined }
    case HOLE_TRUE: return { kind: 'hole', value: true }
    case HOLE_FALSE: return { kind: 'hole', value: false }
    case TEXT_NUMBER: return { kind: 'textNumber' }
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

// ── 属性类型保真（number/bool 歧义歼灭——2027-02） ──
//
// 问题：属性值经 HTML 属性面全部字符串化——`{ count: 42 }` 逆向成
// `{ count: '42' }`——number/bool 类型丢失（歧义）。
// 方案：**data-wf-types 内部标记**——非字符串属性的类型表 JSON 编码——
// 逆向读取后还原类型并删除标记（内部标记不进入 vnode 面）。
// 范围（本次）：number/boolean/bigint 属性——字符串属性零开销（不在表）。
// 文本面（children 里的 number）不在本次——文本节点无属性可挂——
// 后续 data-wf-props 全保真步骤处理。

export const WF_TYPES = 'data-wf-types'
export const WF_STYLE = 'data-wf-style'

export type PropTypeName = 'number' | 'boolean' | 'bigint'

/** 非字符串属性类型表（null = 全部字符串——零开销） */
export function encodePropTypes(props: Record<string, unknown>): Record<string, PropTypeName> | null {
  const types: Record<string, PropTypeName> = {}
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || k === 'ref' || k === WF_TYPES) continue
    if (typeof v === 'number') types[k] = 'number'
    else if (typeof v === 'boolean') types[k] = 'boolean'
    else if (typeof v === 'bigint') types[k] = 'bigint'
  }
  return Object.keys(types).length > 0 ? types : null
}

/** style 对象 → JSON（**逆向全保真**——含 number 值——如 fontSize: 14——
 *  比 cssText 字符串保真更强——null = 无对象） */
export function encodeStyle(style: Record<string, unknown>): string | null {
  return Object.keys(style).length > 0 ? JSON.stringify(style) : null
}

/** 逆向解码（读 data-wf-style → 还原 style 对象 → **删除内部标记**——
 *  就地修改——无标记时 style 保持字符串面（cssText——手写 HTML 兼容）） */
export function decodeStyle(props: Record<string, unknown>): void {
  const t = props[WF_STYLE]
  if (typeof t !== 'string') return
  delete props[WF_STYLE]
  try {
    props.style = JSON.parse(t) as Record<string, unknown>
  } catch {
    // 非法 JSON——容错（style 保持字符串面）
  }
}

/** 逆向解码（读 data-wf-types → 还原类型 → **删除内部标记**——就地修改） */
export function decodePropTypes(props: Record<string, unknown>): void {
  const t = props[WF_TYPES]
  if (typeof t !== 'string') return
  delete props[WF_TYPES]
  let types: Record<string, PropTypeName>
  try {
    types = JSON.parse(t) as Record<string, PropTypeName>
  } catch {
    return // 非法类型表——容错忽略（属性保留原样）
  }
  for (const [k, ty] of Object.entries(types)) {
    if (typeof props[k] !== 'string') continue
    if (ty === 'number') props[k] = Number(props[k] as string)
    else if (ty === 'boolean') props[k] = (props[k] as string) === 'true'
    else if (ty === 'bigint') props[k] = BigInt(props[k] as string)
  }
}

/** 属性序列化（**单一实现源——dom/html/transform 共用**）：字符串化 +
 *  style 对象 → cssText + 非字符串类型表（data-wf-types） */
export function serializeAttrs(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || k === 'ref') continue
    if (typeof v === 'function') continue // 事件/函数面——函数表后续
    if (k === 'style' && v !== null && typeof v === 'object') {
      // style 对象：属性面 cssText（可读/兼容）+ data-wf-style JSON
      //（逆向全保真——含值类型）——内部标记由 decodeStyle 消费
      out[k] = styleString(v as Record<string, unknown>)
      const js = encodeStyle(v as Record<string, unknown>)
      if (js) out[WF_STYLE] = js
    } else if (v !== null && v !== undefined) out[k] = String(v)
  }
  const types = encodePropTypes(props)
  if (types) out[WF_TYPES] = JSON.stringify(types)
  return out
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
      // **number 文本前置 text-number 标记（类型保真——A3）——双节点**
      if (typeof c.value === 'number') {
        return [doc.createComment(TEXT_NUMBER), doc.createTextNode(String(c.value))]
      }
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
      // **连续 string 之间插 split 分隔锚（textMarks 统一规则——array 节点
      //  类型——文本边界保真——不 merge——逆向逐段恢复）——number 文本
      //  的 tn 标记在文本自身（text case 自插）**
      const out: Node[] = [doc.createComment(FRAG_START)]
      const marks = textMarks(c.items)
      let mi = 0
      for (let i = 0; i < c.items.length; i++) {
        while (mi < marks.length && marks[mi]!.index === i) {
          out.push(doc.createComment(HOLE_SPLIT))
          mi += 1
        }
        out.push(...(await vnode2dom(c.items[i]!, doc, ctx)))
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
  for (const [k, val] of Object.entries(serializeAttrs(v.props))) {
    el.setAttribute(k, String(val))
  }
  const kids = childrenOf(v)
  const marks = textMarks(kids)
  let mi = 0
  for (let i = 0; i < kids.length; i++) {
    // **连续 string 文本 → split 分隔锚（元素 children 同样保真——不 merge）**
    while (mi < marks.length && marks[mi]!.index === i) {
      el.appendChild(doc.createComment(HOLE_SPLIT))
      mi += 1
    }
    for (const n of await vnode2dom(kids[i]!, doc, ctx)) el.appendChild(n)
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
    // 注释——标记解析：hole 值恢复（null/undefined/true/false——值保真）；
    // 数组边界/其他注释由 dom2vnodeAll 处理——单节点版本归 hole
    const m = parseHoleMark((node as Comment).textContent ?? '')
    if (m.kind === 'hole') return m.value
    return null
  }
  const el = node as Element
  const props: Record<string, unknown> = {}
  for (const attr of el.attributes) {
    props[attr.name] = attr.value
  }
  decodePropTypes(props) // 类型表还原（number/bool——内部标记删除）
  decodeStyle(props) // style 对象还原（JSON 全保真——内部标记删除）
  // 元素 children 必须走 dom2vnodeAll（栈式）——数组边界锚在元素内部
  // 同样需要恢复（map(dom2vnode) 会把 fragStart/End 注释单节点化 → null——
  // 嵌套数组结构丢失——demo 实证）
  const children = dom2vnodeAll(el.childNodes as Iterable<Node>)
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
  let pendingNumber = false // text-number 标记 → 下一文本段 Number 化
  for (const node of nodes) {
    if (node.nodeType === 8) {
      const m = parseHoleMark((node as Comment).textContent ?? '')
      if (m.kind === 'fragStart') { stack.push([]); pendingNumber = false; continue }
      if (m.kind === 'fragEnd') {
        const items = stack.pop()!
        target().push(items)
        pendingNumber = false
        continue
      }
      if (m.kind === 'hole') { target().push(m.value); pendingNumber = false; continue }
      if (m.kind === 'invalid') { target().push(null); pendingNumber = false; continue }
      if (m.kind === 'textNumber') { pendingNumber = true; continue }
      // split/其他注释——忽略（split 纯分隔——前后文本段独立 push）
      pendingNumber = false
      continue
    }
    if (node.nodeType === 3) {
      const t = node.textContent ?? ''
      target().push(pendingNumber ? Number(t) : t)
      pendingNumber = false
      continue
    }
    pendingNumber = false
    target().push(dom2vnode(node))
  }
  return out
}
