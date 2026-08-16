/**
 * weifuwu/components/Editor/model/dom — offset ↔ DOM 桥
 *
 * doc.text 的 offset 与 contentEditable DOM 的双向映射：
 * - 文本节点：按 nodeValue.length 累加
 * - 嵌入元素（IMG/TABLE/HR）：占位符 1 个 offset（与模型 embeds 对应）
 * - **块级元素边界：计 1 个 \n**（模型段分隔——serialize 输出块标签，
 *   \n 无 DOM 文本节点——不计数则 offset 偏 1（真实事故：AI 选区替换错位））
 *
 * 前提：DOM 内容 = serialize(doc) 的渲染（文本 + 嵌入 + 块结构对应）。
 */

/** 嵌入元素判定（与 html.ts EMBED_TAGS 一致） */
export function isEmbedElement(el: Element): boolean {
  const t = el.tagName
  return t === 'IMG' || t === 'TABLE' || t === 'HR'
}

/** 块级元素（模型 \n 段边界——serialize 输出这些标签；ul/ol 容器不算——li 是段） */
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI'])

type ContentItem =
  | { kind: 'text'; node: Text; text: string }
  | { kind: 'embed'; node: Element }
  | { kind: 'boundary'; node: Element }

/** 内容序列（前序：块边界 → 文本 → 嵌入——按模型 offset 顺序） */
function* contentItems(root: HTMLElement, seen: { v: boolean }): Generator<ContentItem> {
  const w = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n: Node | null = w.nextNode() // 跳过 root
  while (n) {
    if (n.nodeType === 3) {
      const text = String(n.nodeValue ?? '')
      if (text.length > 0) {
        seen.v = true
        yield { kind: 'text', node: n as Text, text }
      }
    } else if (n.nodeType === 1) {
      const el = n as Element
      if (isEmbedElement(el)) {
        seen.v = true
        yield { kind: 'embed', node: el }
      } else if (BLOCK_TAGS.has(el.tagName)) {
        // 块边界：非文档首个块计 1（\n）；块内内容由 walker 继续展开
        if (seen.v) yield { kind: 'boundary', node: el }
      }
      // 其他元素（ul/ol/内联）：不计数——walker 展开子节点
    }
    n = w.nextNode()
  }
}

/** 子树内容长度（文本 + embed + 块边界——seen 跟踪是否已有内容决定首块无边界） */
function subtreeLen(node: Node, seen: { v: boolean }): number {
  if (node.nodeType === 3) {
    const len = String(node.nodeValue ?? '').length
    if (len > 0) seen.v = true
    return len
  }
  if (node.nodeType !== 1) return 0
  const el = node as Element
  if (isEmbedElement(el)) { seen.v = true; return 1 }
  let acc = 0
  if (BLOCK_TAGS.has(el.tagName)) {
    if (seen.v) acc += 1 // 块边界 \n（非首个块）
    seen.v = true
  }
  for (const c of el.childNodes) acc += subtreeLen(c, seen)
  return acc
}

/** 元素容器内前 index 个子节点的累计长度（容器 offset = 子节点索引时） */
function childLenBefore(el: Element, index: number): number {
  const seen = { v: false }
  let acc = 0
  let i = 0
  for (const c of el.childNodes) {
    if (i >= index) break
    acc += subtreeLen(c, seen)
    i++
  }
  return acc
}

/** 单项长度（含边界） */
function itemLen(item: ContentItem, acc: { current: number }): number {
  if (item.kind === 'text') return item.text.length
  if (item.kind === 'embed') return 1
  // boundary：\n 计 1——但"首个块"由 contentItems 的 seen 控制（无 boundary）
  acc.current += 1
  return 1
}

/** 定位容器（文本节点/嵌入/块元素）到 root 起点的累计 offset */
function offsetOfContainer(root: HTMLElement, container: Node, containerOffset: number): number {
  // 容器即 root（Range 包围整棵子树）——按子节点索引计算
  if (container === root) return childLenBefore(root, containerOffset)
  const seen = { v: false }
  let acc = 0
  for (const item of contentItems(root, seen)) {
    if (item.node === container) {
      if (item.kind === 'text') return acc + containerOffset
      if (item.kind === 'embed') return acc + containerOffset
      // 块元素容器（Range 边界在块上）——子节点索引偏移
      return acc + childLenBefore(item.node as HTMLElement, containerOffset)
    }
    acc += itemLen(item, { current: 0 })
  }
  return acc
}

/** Range → 文档 offset（相对 root 内容起点） */
export function rangeToOffsets(root: HTMLElement, range: Range): { start: number; end: number } {
  const start = offsetOfContainer(root, range.startContainer, range.startOffset)
  const end = offsetOfContainer(root, range.endContainer, range.endOffset)
  return { start, end }
}

/** 当前选区 → offsets（编辑器内/无 DOM 时返回 null） */
export function selectionOffsets(root: HTMLElement | null): { start: number; end: number } | null {
  if (!root) return null
  const sel = root.ownerDocument.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return null
  return rangeToOffsets(root, range)
}

/** 定位包含目标 offset 的内容项；越界 → 末尾项（clamp） */
function itemAtOffset(root: HTMLElement, target: number): { item: ContentItem; off: number } | null {
  const seen = { v: false }
  let acc = 0
  let last: { item: ContentItem; off: number } | null = null
  for (const item of contentItems(root, seen)) {
    if (item.kind === 'boundary') {
      // \n 只占起始点（offset acc）——结束点归下一项（target=2 应命中块内文本而非边界）
      if (target === acc) return { item, off: 0 }
      acc += 1
      last = { item, off: 1 }
      continue
    }
    const len = itemLen(item, { current: 0 })
    last = { item, off: len }
    if (target <= acc + len) return { item, off: target - acc }
    acc += len
  }
  return last
}

/** offset 区间 → Range（恢复选区；越界时 clamp 到内容末尾） */
export function offsetsToRange(root: HTMLElement, start: number, end: number): Range | null {
  const doc = root.ownerDocument
  const range = doc.createRange()
  const s = itemAtOffset(root, Math.max(0, start))
  const e = itemAtOffset(root, Math.max(0, end))
  if (!s || !e) return null
  placeBoundary(range, s.item, s.off, true)
  placeBoundary(range, e.item, e.off, false)
  return range
}

function placeBoundary(range: Range, item: ContentItem, off: number, isStart: boolean): void {
  const set = isStart ? (range.setStart.bind(range)) : (range.setEnd.bind(range))
  if (item.kind === 'text') {
    set(item.node, Math.min(off, item.text.length))
  } else if (item.kind === 'embed') {
    if (off <= 0) {
      if (isStart) range.setStartBefore(item.node)
      else range.setEndBefore(item.node)
    } else {
      if (isStart) range.setStartAfter(item.node)
      else range.setEndAfter(item.node)
    }
  } else {
    // 块边界（\n）：off 0 = 块前；off 1 = 块后
    if (off <= 0) {
      if (isStart) range.setStartBefore(item.node)
      else range.setEndBefore(item.node)
    } else {
      if (isStart) range.setStartAfter(item.node)
      else range.setEndAfter(item.node)
    }
  }
}

/** offsets → 选区（focus + 设置） */
export function setSelectionOffsets(root: HTMLElement | null, start: number, end: number): void {
  if (!root) return
  const range = offsetsToRange(root, start, end)
  if (!range) return
  const sel = root.ownerDocument.getSelection()
  if (!sel) return
  root.focus()
  sel.removeAllRanges()
  sel.addRange(range)
}
