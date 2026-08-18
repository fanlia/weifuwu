/**
 * weifuwu/components/Editor/model/html — HTML ⇄ DocState 序列化
 *
 * 只认 Editor 格式子集（诚实裁剪）：p/div/h1-3/blockquote/ul/ol（块）、
 * b/strong/i/em/u/a（内联）、img/table/hr（embed 快照——内部不解析）、
 * text-align（inline style 或 wf-text-* class）。未知标签降级取文本。
 *
 * parse 需要 DOM（DOMParser）——浏览器环境全局可用；测试注入 jsdom document。
 */

import type { DocState, MarkSpan, BlockProp, EmbedSpan, BlockKind, Align } from './types.ts'
import { EMBED_CHAR } from './types.ts'
import { segmentStarts, blockPropAt } from './apply.ts'

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI',
  // 未知块级（HTML flow content）——按 p 处理（段边界 + 降级取文本）
  'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'PRE', 'FIGURE', 'FORM',
])
const MARK_TAGS: Record<string, { type: MarkSpan['type']; href?: boolean }> = {
  B: { type: 'b' },
  STRONG: { type: 'b' },
  I: { type: 'i' },
  EM: { type: 'i' },
  U: { type: 'u' },
  A: { type: 'link', href: true },
}
const EMBED_TAGS: Record<string, EmbedSpan['type']> = { IMG: 'img', TABLE: 'table', HR: 'hr', PRE: 'pre' }
const ALIGN_CLASSES: Record<string, Align> = {
  'wf-text-center': 'center',
  'wf-text-right': 'right',
  'wf-text-left': 'left',
}

function alignOf(el: Element): Align | undefined {
  const inline = (el as HTMLElement).style?.textAlign
  if (inline) return inline as Align
  for (const c of el.classList ?? []) {
    if (ALIGN_CLASSES[c]) return ALIGN_CLASSES[c]
  }
  return undefined
}

/** 段起点（当前 text.length）——文本追加统一经此（保证段边界正确） */
class ParseState {
  text = ''
  marks: MarkSpan[] = []
  embeds: EmbedSpan[] = []
  blockProps: BlockProp[] = []
  embedSeq = 0

  /** 追加文本（含 \n 则后续段起点自然派生） */
  append(s: string): void {
    this.text += s
  }

  /** 块开始（若当前文本非空且未以 \n 结尾 → 补段分隔） */
  blockBoundary(): void {
    if (this.text.length > 0 && this.text[this.text.length - 1] !== '\n') this.text += '\n'
  }
}

function walk(node: Node, st: ParseState, listKind: 'ul' | 'ol' | null): void {
  if (node.nodeType === 3) {
    st.append(node.nodeValue ?? '')
    return
  }
  if (node.nodeType !== 1) return
  const el = node as Element
  const tag = el.tagName

  // 嵌入（img/table/hr）——占位符 + 快照（id 唯一——parse 计数器）
  if (EMBED_TAGS[tag]) {
    const at = st.text.length
    st.append(EMBED_CHAR)
    st.embeds.push({ id: `p${st.embedSeq++}`, at, type: EMBED_TAGS[tag], html: el.outerHTML })
    return
  }

  // 列表容器：标记 kind，递归子项
  if (tag === 'UL' || tag === 'OL') {
    for (const child of Array.from(el.childNodes)) walk(child, st, tag === 'UL' ? 'ul' : 'ol')
    return
  }

  // 块级：段边界 + 块属性
  if (BLOCK_TAGS.has(tag)) {
    st.blockBoundary()
    const start = st.text.length
    let kind: BlockKind = 'p'
    if (tag === 'H1') kind = 'h1'
    else if (tag === 'H2') kind = 'h2'
    else if (tag === 'H3') kind = 'h3'
    else if (tag === 'BLOCKQUOTE') kind = 'quote'
    else if (tag === 'LI' && listKind) kind = listKind
    const align = alignOf(el)
    if (kind !== 'p' || align) {
      st.blockProps.push({ start, kind, ...(align ? { align } : {}) })
    }
    for (const child of Array.from(el.childNodes)) walk(child, st, listKind)
    return
  }

  // 内联标记（b/i/u/a）——区间包裹
  if (MARK_TAGS[tag]) {
    const { type, href } = MARK_TAGS[tag]
    const start = st.text.length
    for (const child of Array.from(el.childNodes)) walk(child, st, listKind)
    const end = st.text.length
    if (end > start) {
      st.marks.push({
        start, end, type,
        ...(href ? { href: (el as HTMLAnchorElement).getAttribute('href') ?? '' } : {}),
      })
    }
    return
  }

  // 其他（span/未知）——透明递归（取文本）
  for (const child of Array.from(el.childNodes)) walk(child, st, listKind)
}

/** HTML → DocState（doc 可注入——jsdom 测试；浏览器默认全局） */
export function parseHtml(html: string, doc?: Document): DocState {
  const d = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!d) return { text: '', blockProps: [], marks: [], embeds: [] }
  const holder = d.createElement('div')
  holder.innerHTML = html
  const st = new ParseState()
  for (const child of Array.from(holder.childNodes)) walk(child, st, null)
  st.marks.sort((a, b) => a.start - b.start || a.end - b.end)
  st.blockProps.sort((a, b) => a.start - b.start)
  st.embeds.sort((a, b) => a.at - b.at)
  // 尾部空段折叠（HTML 解析产物：孤儿 </p>/尾空块——模型空段 = 空文本）
  if (st.text.endsWith('\n')) st.text = st.text.slice(0, -1)
  return { text: st.text, blockProps: st.blockProps, marks: st.marks, embeds: st.embeds }
}

// ── 序列化 ─────────────────────────────────────────────────────────────

const MARK_TAG: Record<MarkSpan['type'], string> = { b: 'b', i: 'i', u: 'u', link: 'a' }
const BLOCK_TAG: Record<BlockKind, string> = {
  p: 'p', h1: 'h1', h2: 'h2', h3: 'h3', quote: 'blockquote', ul: 'li', ol: 'li',
}

/** 段内容渲染：marks 边界切分 + 标签包裹 + embed 还原 */
function renderSegment(doc: DocState, start: number, end: number): string {
  if (start >= end) return ''
  // 段内 mark 边界点（start/end + 相交 mark 的边界）
  const bounds = new Set<number>([start, end])
  const active: MarkSpan[] = []
  for (const m of doc.marks) {
    if (m.end <= start || m.start >= end) continue
    bounds.add(Math.max(start, m.start))
    bounds.add(Math.min(end, m.end))
    active.push(m)
  }
  const pts = [...bounds].sort((a, b) => a - b)
  let out = ''
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i]
    const e = pts[i + 1]
    if (e <= s) continue
    const segText = doc.text.slice(s, e)
    // 该片覆盖的 marks（按固定顺序 b > i > u > link 嵌套避免交错）
    const covers = active.filter((m) => m.start <= s && m.end >= e)
    const order: MarkSpan['type'][] = ['b', 'i', 'u', 'link']
    const ordered = order
      .map((t) => covers.find((m) => m.type === t))
      .filter((m): m is MarkSpan => !!m)
    let body = ''
    for (let k = 0; k < segText.length; k++) {
      const ch = segText[k]
      if (ch === EMBED_CHAR) {
        const emb = doc.embeds.find((x) => x.at === s + k)
        body += emb ? emb.html : ''
      } else {
        body += ch
      }
    }
    for (const m of ordered.slice().reverse()) {
      const tag = MARK_TAG[m.type]
      body = m.type === 'link' ? `<${tag} href="${escapeAttr(m.href ?? '')}">${body}</${tag}>` : `<${tag}>${body}</${tag}>`
    }
    out += body
  }
  return out
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** DocState → HTML（块标签 + 对齐 + marks + embeds；相邻 ul/ol 段合并列表） */
export function serializeHtml(doc: DocState): string {
  if (doc.text === '') return ''
  const segs = segmentStarts(doc.text)
  let out = ''
  let openList: 'ul' | 'ol' | null = null
  for (let i = 0; i < segs.length; i++) {
    const start = segs[i]
    const end = i + 1 < segs.length ? segs[i + 1] - 1 : doc.text.length
    const prop = blockPropAt(doc, start)
    const kind = prop?.kind ?? 'p'
    const align = prop?.align
    const body = renderSegment(doc, start, end)
    const alignAttr = align ? ` style="text-align:${align}"` : ''
    if (kind === 'ul' || kind === 'ol') {
      if (openList !== kind) {
        if (openList) out += `</${openList}>`
        openList = kind
        out += `<${kind}>`
      }
      out += `<li${alignAttr}>${body}</li>`
    } else {
      if (openList) { out += `</${openList}>`; openList = null }
      out += `<${BLOCK_TAG[kind]}${alignAttr}>${body}</${BLOCK_TAG[kind]}>`
    }
  }
  if (openList) out += `</${openList}>`
  return out
}

/** 往返幂等校验辅助：parse → serialize → parse 不再变化 */
export function normalizeHtml(html: string, doc?: Document): string {
  return serializeHtml(parseHtml(html, doc))
}
