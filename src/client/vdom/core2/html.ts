/**
 * vdom core2 — html（vnode → HTML 字符串——A1 编码的字符串形式）
 *
 * 与 vnode2dom 互为独立实现——**双实现互证**（A1 唯一性公理的可执行
 * 验证：同一 vnode 的 DOM 结构与 HTML 字符串必须表示同一结构——fake
 * DOM 序列化对照测试锁定）。
 *
 * 规则（与 vnode2dom 同语义——同一保真范围）：
 *  - text → HTML 转义文本；hole → `<!--wf-hole-->` 锚注释
 *  - element → `<tag attrs>children</tag>`——void 元素自闭合
 *  - component → 工厂 + renderFn 展开 → 输出递归
 *  - array → 各项拼接（无包裹层——区间语义）
 *  - invalid → warn + `<!--wf-invalid-->`（不崩溃不静默）
 *  - props：序列化面（string/number/boolean → k="v"；style 对象 → cssText）
 *    ——事件/函数跳过；key/children/ref 排除——与 vnode2dom 同规则
 */

import type { UIContext } from '../context/UIContext.ts'
import { classify, childrenOf, invalidDiagnostic, h, textMarks, type Component, type VNode, type VNodeChild } from './vnode.ts'
import { HOLE_NULL, HOLE_INVALID, HOLE_SPLIT, TEXT_NUMBER, FRAG_START, FRAG_END, holeMark, parseHoleMark, serializeAttrs, decodePropTypes, decodeStyle } from './dom.ts'

/** HTML void 元素（无闭标签——自闭合） */
const VOID_TAGS = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'])

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** HTML 转义（文本与属性值同一转义——属性含引号） */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ESC[m]!)
}

/**
 * vnode → HTML 字符串（组件展开可 await——与 vnode2dom 对称签名）
 */
export async function vnode2html(v: VNodeChild, ctx?: UIContext): Promise<string> {
  const c = classify(v)
  switch (c.kind) {
    case 'text':
      // **number 文本前置 text-number 标记（类型保真——A3）**
      if (typeof c.value === 'number') return `<!--${TEXT_NUMBER}-->${escapeHtml(String(c.value))}`
      return escapeHtml(c.value)
    case 'hole':
      return `<!--${holeMark(c.value)}-->`
    case 'element':
      return element2html(c.v, ctx)
    case 'component': {
      // 组件展开（两阶段——与 vnode2dom 同语义——展开区间）
      const renderFn = await (c.v.type as Component)(c.v.props, ctx ?? ({} as UIContext))
      const out = await renderFn(c.v.props)
      return vnode2html(out, ctx)
    }
    case 'array': {
      // 数组边界标记（start/end——逆向恢复数组结构——嵌套递归）——
      // **连续 string 之间插 split 分隔锚（textMarks 统一规则——不 merge）
      //  ——number 文本的 tn 标记在文本自身（text case 自插）**
      let s = `<!--${FRAG_START}-->`
      const marks = textMarks(c.items)
      let mi = 0
      for (let i = 0; i < c.items.length; i++) {
        while (mi < marks.length && marks[mi]!.index === i) {
          s += `<!--${HOLE_SPLIT}-->`
          mi += 1
        }
        s += await vnode2html(c.items[i]!, ctx)
      }
      return s + `<!--${FRAG_END}-->`
    }
    case 'invalid': {
      console.warn(`[core2] 非法子节点——${invalidDiagnostic(c.v)}`)
      return `<!--${HOLE_INVALID}-->`
    }
  }
}

/** 元素序列化（开标签 + 属性 + children + 闭标签——void 自闭合） */
async function element2html(v: VNode, ctx?: UIContext): Promise<string> {
  const tag = v.type as string
  const attrs: string[] = []
  for (const [k, val] of Object.entries(serializeAttrs(v.props))) {
    attrs.push(`${k}="${escapeHtml(String(val))}"`)
  }
  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : ''
  const children = childrenOf(v)
  if (children.length === 0) {
    return VOID_TAGS.has(tag) ? `<${tag}${attrStr}/>` : `<${tag}${attrStr}></${tag}>`
  }
  let inner = ''
  const marks = textMarks(children)
  let mi = 0
  for (let i = 0; i < children.length; i++) {
    // **连续 string 文本 → split 分隔锚（元素 children 同样保真——不 merge）**
    while (mi < marks.length && marks[mi]!.index === i) {
      inner += `<!--${HOLE_SPLIT}-->`
      mi += 1
    }
    inner += await vnode2html(children[i]!, ctx)
  }
  return `<${tag}${attrStr}>${inner}</${tag}>`
}

// ── 逆向：DOM string → vnode（A2 的字符串形式——与 vnode2html 互证） ──

/** HTML 实体还原（与 escapeHtml 互逆） */
export function unescapeHtml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_m, e: string) => (
    e === 'amp' ? '&' : e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : "'"
  ))
}

/** 解析游标 */
interface P {
  s: string
  i: number
}

const ATTR_RE = /([\w-]+)="([^"]*)"/g

/** 开标签解析（规范子集：属性值已转义——无裸 '>'——indexOf 安全） */
function parseOpenTag(p: P): { tag: string; props: Record<string, unknown>; selfClose: boolean } {
  const end = p.s.indexOf('>', p.i)
  const body = p.s.slice(p.i + 1, end)
  p.i = end + 1
  const selfClose = body.endsWith('/')
  const tagBody = selfClose ? body.slice(0, -1) : body
  const sp = tagBody.indexOf(' ')
  const tag = (sp < 0 ? tagBody : tagBody.slice(0, sp)).toLowerCase()
  const props: Record<string, unknown> = {}
  if (sp >= 0) {
    ATTR_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = ATTR_RE.exec(tagBody.slice(sp + 1))) !== null) {
      props[m[1]!] = unescapeHtml(m[2]!)
    }
  }
  return { tag, props, selfClose }
}

/** 节点序列解析（递归——遇 stopTag 闭标签返回；inArray = 数组上下文——
 *  遇 fragEnd 返回（匹配的数组结束）） */
function parseNodes(p: P, stopTag?: string, inArray = false): VNodeChild[] {
  const out: VNodeChild[] = []
  let pendingNumber = false // text-number 标记 → 下一文本段 Number 化
  while (p.i < p.s.length) {
    const lt = p.s.indexOf('<', p.i)
    if (lt < 0) {
      const t = p.s.slice(p.i)
      if (t) out.push(pendingNumber ? Number(unescapeHtml(t)) : unescapeHtml(t))
      p.i = p.s.length
      break
    }
    if (lt > p.i) {
      const t = p.s.slice(p.i, lt)
      if (t) out.push(pendingNumber ? Number(unescapeHtml(t)) : unescapeHtml(t))
      pendingNumber = false
    }
    // 注释（标记——hole 值/数组边界/诊断）
    if (p.s.startsWith('<!--', lt)) {
      const end = p.s.indexOf('-->', lt + 4)
      const c = p.s.slice(lt + 4, end)
      const m = parseHoleMark(c)
      if (m.kind === 'fragStart') {
        // 数组上下文（递归到匹配 fragEnd——嵌套数组逐层）
        p.i = end + 3
        out.push(parseNodes(p, undefined, true))
        pendingNumber = false
        continue
      }
      if (m.kind === 'fragEnd') {
        p.i = end + 3
        if (inArray) return out // 数组结束——返回（调用方收集）
        pendingNumber = false
        continue // 顶层多余 end——容错忽略
      }
      if (m.kind === 'hole') { out.push(m.value); pendingNumber = false }
      else if (m.kind === 'textNumber') { pendingNumber = true }
      else if (m.kind === 'invalid') { out.push(null); pendingNumber = false } // 诊断锚——hole 占位
      p.i = end + 3
      continue
    }
    // 闭标签（容错：不匹配则忽略——规范输入由生成器保证配对；数组
    // 上下文里闭标签同样终止——数组内嵌元素先于数组结束闭合）
    if (p.s.startsWith('</', lt)) {
      const end = p.s.indexOf('>', lt + 2)
      const tag = p.s.slice(lt + 2, end).trim()
      p.i = end + 1
      if (stopTag !== undefined && tag === stopTag) return out
      continue
    }
    // 开标签（先对齐游标到 '<'——parseOpenTag 内部推进）
    p.i = lt
    const { tag, props, selfClose } = parseOpenTag(p)
    decodePropTypes(props) // 类型表还原（number/bool——内部标记删除）
    decodeStyle(props) // style 对象还原（JSON 全保真——内部标记删除）
    if (selfClose || VOID_TAGS.has(tag)) {
      out.push(h(tag, props))
      continue
    }
    const children = parseNodes(p, tag)
    out.push(children.length === 0 ? h(tag, props) : h(tag, props, ...children))
  }
  return out
}

/**
 * DOM string → vnode（A2 逆向——规范子集解析——与 vnode2html 互逆）：
 *  text（转义还原）/ `<!--wf-hole: 值-->` → hole 值 / `<!--wf-hole:
 *  fragment-start/end-->` → 数组（嵌套恢复）/ `<tag attrs>children</tag>`
 *  → element / 自闭合 → 无 children
 *  **返回单值归一**（R2 对称性）：单节点序列 → 单值；多/零节点 → 数组
 *  （vnode2html 的顶层输出要么单节点要么带锚数组——R2 恒等）
 */
export function html2vnode(html: string): VNodeChild {
  const items = parseNodes({ s: html, i: 0 })
  return items.length === 1 ? items[0]! : items
}
