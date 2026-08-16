/**
 * weifuwu/office/xml-serialize — VNode 树 → XML 字符串（服务端 OOXML 生成）
 *
 * 架构（与前端 "VNode → DOM" 同构——"OOXML 也是写 VNode"）：
 *   DocState → VNode 树（h()——vdom3 纯数据结构，零 DOM 依赖）
 *   → vnodeToXml（本模块）→ ZIP 打包
 *
 * 序列化约定（仅输出 XML 子集——与 vdom3 渲染管线解耦）：
 * - type: string = 元素名（含命名空间前缀——w:p、a:graphic 等原样输出）
 * - props: 字符串值 = XML 属性；number/boolean 字符串化；key/children 排除
 * - children: 字符串 = 文本（转义）；VNode = 子元素；数组 = 序列
 * - 空元素 → 自闭合 <w:b/>（OOXML 合法——MS Word 接受）
 * - 函数/symbol type、事件 props（on*）→ 抛错（诚实——序列化器不支持）
 */

import type { VNode, VNodeChild } from '../ui-dom/vdom3/types.ts'

const escXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const VOID = new Set(['w:br', 'w:cr', 'w:tab', 'w:b', 'w:i', 'w:u'])

function isTextChild(c: VNodeChild): c is string | number {
  return typeof c === 'string' || typeof c === 'number'
}

function serializeNode(v: VNode): string {
  if (typeof v.type !== 'string') {
    throw new Error(`xml-serialize: 不支持的 VNode type（OOXML 生成只用字符串元素名）: ${String(v.type)}`)
  }
  const name = v.type
  const { children, ...rest } = v.props ?? {}
  // 属性（字符串值——排除 key/children/事件）
  let attrs = ''
  for (const [k, val] of Object.entries(rest)) {
    if (k === 'key' || val == null) continue
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      attrs += ` ${k}="${escXml(String(val))}"`
    } else {
      throw new Error(`xml-serialize: 属性 ${k} 值必须为字符串/数字/布尔（OOXML 属性无对象）`)
    }
  }
  // children（单值或数组——嵌套数组展开；null/false 占位忽略——XML 无此语义）
  const list = Array.isArray(children) ? children : (children == null ? [] : [children])
  const flat: VNodeChild[] = []
  const flatten = (xs: VNodeChild[]): void => {
    for (const c of xs) {
      if (Array.isArray(c)) flatten(c as unknown as VNodeChild[])
      else flat.push(c)
    }
  }
  flatten(list)
  if (flat.length === 0) {
    if (VOID.has(name)) return `<${name}${attrs}/>`
    // 非 void 空元素——显式闭合（Office 某些解析器对自闭合段落敏感）
    return `<${name}${attrs}></${name}>`
  }
  let inner = ''
  for (const c of flat) {
    if (isTextChild(c)) inner += escXml(String(c))
    else if (c == null || c === false || c === true) { /* 占位忽略 */ }
    else inner += serializeNode(c)
  }
  return `<${name}${attrs}>${inner}</${name}>`
}

export function vnodeToXml(v: VNode | VNodeChild, xmlDecl = true): string {
  const body = isTextChild(v) || v == null || typeof v === 'boolean'
    ? (isTextChild(v) ? escXml(String(v)) : '')
    : serializeNode(v)
  return xmlDecl ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}` : body
}

/** 便捷：把 VNode 树序列化为 OOXML 部件 XML（名称检查由调用方保证） */
export function vnodeToXmlDecl(v: VNode): string {
  return vnodeToXml(v, true)
}
