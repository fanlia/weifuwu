/**
 * weifuwu/components/Editor/model/apply — 事件应用（文档 = fold(事件流)）
 *
 * applyEdit(doc, ev) 纯函数：任意事件 → 新 DocState（不可变）。
 * 所有 offset 平移在单一入口维护（marks/blockProps/embeds/caret 同步——
 * 防止各路径各自修补的漂移）。段结构查找用二分（undo/redo 高频路径）。
 */

import type { DocState, EditEvent, BlockProp, MarkSpan, EmbedSpan, BlockKind, Align, MarkType } from './types.ts'
import { EMBED_CHAR } from './types.ts'

// ── 段结构派生（text 按 \n 分段——块属性只认段起点） ────────────────────

/** 所有段起点（升序；空文档 = [0]——单空段） */
export function segmentStarts(text: string): number[] {
  const starts: number[] = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1)
  }
  return starts
}

/** 最后一个 <= pos 的段起点（二分——O(log n)） */
export function segmentStartAt(text: string, pos: number, starts?: number[]): number {
  const s = starts ?? segmentStarts(text)
  let lo = 0
  let hi = s.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (s[mid] <= pos) lo = mid
    else hi = mid - 1
  }
  return s[lo]
}

/** 位置 pos 所属段的块属性（默认 p/null） */
export function blockPropAt(doc: DocState, pos: number): BlockProp | null {
  const s = segmentStartAt(doc.text, pos)
  for (const b of doc.blockProps) {
    if (b.start === s) return b
    if (b.start > s) break
  }
  return null
}

// ── 偏移平移（单入口——所有区间数据统一走这里） ────────────────────────

function shiftMarks(marks: MarkSpan[], at: number, delta: number): MarkSpan[] {
  return marks
    .map((m) => {
      if (m.end <= at) return m
      if (m.start >= at) return { ...m, start: m.start + delta, end: m.end + delta }
      return { ...m, end: m.end + delta } // 区间跨插入点——只延展 end
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

function shiftBlockProps(props: BlockProp[], at: number, delta: number): BlockProp[] {
  return props
    .map((b) => (b.start >= at ? { ...b, start: b.start + delta } : b))
    .sort((a, b) => a.start - b.start)
}

function shiftEmbeds(embeds: EmbedSpan[], at: number, delta: number): EmbedSpan[] {
  return embeds
    .map((e) => (e.at >= at ? { ...e, at: e.at + delta } : e))
    .sort((a, b) => a.at - b.at)
}

/** 复制文档（数组复制——不可变更新基元） */
function copyDoc(doc: DocState): DocState {
  return { text: doc.text, blockProps: doc.blockProps.slice(), marks: doc.marks.slice(), embeds: doc.embeds.slice() }
}

// ── 块属性继承（插入/删除后重新归属——段起点映射到旧文档位置） ──────────

/** 新段起点 s 的属性 = 旧文档位置 min(s, at) 所属段的属性（插入点段内分裂 →
 *  后段继承原段；删除合并 → 取被删前 at 所在段）。二分查找——O(段数·logN)。 */
/** 新段起点 s 的属性 = 旧文档位置的段属性（偏移映射——插入/删除后段归属）：
 *  - s < at：旧文档 s 位置（原段保留）
 *  - at ≤ s < at+insertedLen：插入文本内的段 → 继承插入点 at 所在段（上下文格式）
 *  - s ≥ at+insertedLen：旧文档 s-insertedLen 位置（后续段平移——继承自身） */
function rederiveBlockProps(
  oldText: string, oldProps: BlockProp[],
  newText: string, at: number, insertedLen: number,
): BlockProp[] {
  const oldStarts = segmentStarts(oldText)
  const oldPropsByStart = new Map(oldProps.map((b) => [b.start, b]))
  const out: BlockProp[] = []
  for (const s of segmentStarts(newText)) {
    let ref: number
    if (s < at) ref = s
    else if (s < at + insertedLen) ref = at
    else ref = s - insertedLen
    const seg = segmentStartAt(oldText, ref, oldStarts)
    const p = oldPropsByStart.get(seg)
    if (p) out.push({ ...p, start: s })
  }
  return out.sort((a, b) => a.start - b.start)
}

// ── 事件应用 ───────────────────────────────────────────────────────────

export function applyEdit(doc: DocState, ev: EditEvent): DocState {
  switch (ev.type) {
    case 'text-insert': return insertText(doc, ev.at, ev.text)
    case 'text-delete': return deleteText(doc, ev.at, ev.len, ev.removedEmbeds, ev.removedBlocks)
    case 'mark-apply': return applyMark(doc, ev)
    case 'mark-restore': return restoreMark(doc, ev.mark, ev.spans)
    case 'block-set': return setBlock(doc, ev.start, ev.kind, ev.align ?? null)
    case 'embed-insert': return insertEmbed(doc, ev.at, ev.embed)
    case 'embed-delete': return deleteEmbed(doc, ev.at, ev.embed)
    case 'ai-apply': {
      // 原子组合：删除区间 + 插入修订文本（undo 仍是一步）
      if (doc.text.slice(ev.start, ev.end) !== ev.original) {
        throw new Error(`[editor/model] ai-apply original 与文档不符 (${ev.start},${ev.end})`)
      }
      const actual = doc.embeds.filter((e) => e.at >= ev.start && e.at < ev.end)
      if (actual.length !== ev.removedEmbeds.length ||
          actual.some((e, i) => e.id !== ev.removedEmbeds[i]?.id)) {
        throw new Error('[editor/model] ai-apply removedEmbeds 与文档不符')
      }
      const next = insertText(
        deleteText(doc, ev.start, ev.end - ev.start, ev.removedEmbeds, ev.removedBlocks),
        ev.start, ev.revised,
      )
      // 替换保留段落格式：被删段属性恢复到替换区间内的新段（段起点仍有效时——
      // 引用块整段替换后仍是引用块——rederive 上下文继承会给前段属性）。
      // 限定替换区间：before 既有段不被覆盖（逆操作精确可逆——fuzz 验证）
      return restoreRemovedBlocks(next, ev.removedBlocks, ev.start, ev.start + ev.revised.length)
    }
  }
}

/** 恢复被删段属性到替换区间内：区间内每个段起点匹配自身原属性（redo 重放一致；
 *  新段无匹配则继承 rederive 上下文——AI 多段回复仅首段继承被删段格式） */
function restoreRemovedBlocks(doc: DocState, blocks: BlockProp[], from: number, to: number): DocState {
  if (blocks.length === 0) return doc
  let next = doc
  for (const s of segmentStarts(doc.text)) {
    if (s < from || s >= to) continue
    const b = blocks.find((x) => x.start === s)
    if (b) next = setBlock(next, s, b.kind, b.align ?? null)
  }
  return next
}

/** 应用事件并记录实际效果（ai-apply 返回带 original 校验后的事件——供历史审计） */
export function applyEditChecked(doc: DocState, ev: EditEvent): { doc: DocState; ev: EditEvent } {
  return { doc: applyEdit(doc, ev), ev }
}

/** 删除区间内/边界段起点被覆盖的段属性（含边界——段起点恰在 at+len 时合并吞属性；
 *  逆操作按原段起点恢复——文本恢复后起点仍有效，幂等安全） */
export function removedBlocksOf(doc: DocState, at: number, end: number): BlockProp[] {
  return doc.blockProps.filter((b) => b.start >= at && b.start <= end)
}

function insertText(doc: DocState, at: number, text: string): DocState {
  const len = text.length
  if (len === 0) return doc
  // 占位符只经 embed-insert 写入（保持「条目 ⇄ 占位符」一一对应不变量——
  // 文本层插入 \uFFFC 会破坏 embeds 索引——诚实失败而非静默降级）
  if (text.includes(EMBED_CHAR)) {
    throw new Error('[editor/model] text-insert 禁止含嵌入占位符——用 embed-insert')
  }
  const next = copyDoc(doc)
  next.text = doc.text.slice(0, at) + text + doc.text.slice(at)
  next.marks = shiftMarks(doc.marks, at, len)
  next.embeds = shiftEmbeds(doc.embeds, at, len)
  next.blockProps = rederiveBlockProps(doc.text, doc.blockProps, next.text, at, len)
  return next
}

function deleteText(doc: DocState, at: number, len: number, removedEmbeds: EmbedSpan[] = [], removedBlocks: BlockProp[] = []): DocState {
  if (len <= 0 || at < 0 || at + len > doc.text.length) return doc
  // 一致性校验：事件声明的被删 embeds 必须与文档实际一致（诚实失败）
  const actual = doc.embeds.filter((e) => e.at >= at && e.at < at + len)
  if (actual.length !== removedEmbeds.length ||
      actual.some((e, i) => e.id !== removedEmbeds[i]?.id)) {
    throw new Error('[editor/model] text-delete removedEmbeds 与文档不符')
  }
  const actualBlocks = doc.blockProps.filter((b) => b.start >= at && b.start <= at + len)
  if (actualBlocks.length !== removedBlocks.length ||
      actualBlocks.some((b, i) => b.start !== removedBlocks[i]?.start)) {
    throw new Error('[editor/model] text-delete removedBlocks 与文档不符')
  }
  const next = copyDoc(doc)
  next.text = doc.text.slice(0, at) + doc.text.slice(at + len)
  // marks：不相交平移 / 完全删除 / 左相交收缩 end / 右相交收缩 start / 全覆盖收缩 end
  next.marks = doc.marks
    .flatMap((m): MarkSpan[] => {
      if (m.end <= at) return [m]
      if (m.start >= at + len) return [{ ...m, start: m.start - len, end: m.end - len }]
      if (m.start < at && m.end > at + len) return [{ ...m, end: m.end - len }]
      if (m.start < at) return [{ ...m, end: at }] // 左相交（end 在区间内）
      return [{ ...m, start: at, end: Math.max(at, m.end - len) }] // 右相交/完全在内（filter 收尾）
    })
    .filter((m) => m.end > m.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  // embeds：占位符在删除区间内的移除
  next.embeds = doc.embeds
    .filter((e) => e.at < at || e.at >= at + len)
    .map((e) => (e.at >= at + len ? { ...e, at: e.at - len } : e))
    .sort((a, b) => a.at - b.at)
  next.blockProps = rederiveBlockProps(doc.text, doc.blockProps, next.text, at, -len)
  return next
}

function applyMark(doc: DocState, ev: Extract<EditEvent, { type: 'mark-apply' }>): DocState {
  const { start, end, mark, on, href } = ev
  if (start >= end) return doc
  // prev 一致性校验（创建者从操作前 doc 提取——诚实失败）
  const prevSame = doc.marks.filter((m) => m.type === mark)
  if (prevSame.length !== ev.prev.length || prevSame.some((m, i) => m.start !== ev.prev[i]?.start || m.end !== ev.prev[i]?.end)) {
    throw new Error('[editor/model] mark-apply prev 与文档不符')
  }
  // 移除 [start,end) 内该类型相交区间（收缩/删除）——on=true 时再追加新区间
  const others = doc.marks.filter((m) => m.type !== mark)
  const same = doc.marks
    .filter((m) => m.type === mark)
    .flatMap((m): MarkSpan[] => {
      if (m.end <= start || m.start >= end) return [m]
      const out: MarkSpan[] = []
      if (m.start < start) out.push({ ...m, end: start })
      if (m.end > end) out.push({ ...m, start: end })
      return out
    })
  const merged: MarkSpan[] = on
    ? [...same, { start, end, type: mark, ...(href ? { href } : {}) }]
    : same
  return { ...doc, marks: [...others, ...merged].sort((a, b) => a.start - b.start || a.end - b.end) }
}

/** mark 绝对恢复（快照替换——undo 精确；区间独立不合并——可逆性保证） */
function restoreMark(doc: DocState, mark: MarkType, spans: MarkSpan[]): DocState {
  const others = doc.marks.filter((m) => m.type !== mark)
  return { ...doc, marks: [...others, ...spans].sort((a, b) => a.start - b.start || a.end - b.end) }
}

function setBlock(doc: DocState, start: number, kind: BlockKind, align: Align | null): DocState {
  // 只认段起点（非段起点忽略——调用方负责对齐）
  const seg = segmentStartAt(doc.text, start)
  if (seg !== start) return doc
  const rest = doc.blockProps.filter((b) => b.start !== start)
  const isDefault = kind === 'p' && !align
  const next: BlockProp[] = isDefault
    ? rest
    : [...rest, { start, kind, ...(align ? { align } : {}) }]
  return { ...doc, blockProps: next.sort((a, b) => a.start - b.start) }
}

function insertEmbed(doc: DocState, at: number, embed: EmbedSpan): DocState {
  // 内联实现（不走 insertText——占位符只经此处写入，不触发文本层校验）
  const next = copyDoc(doc)
  next.text = doc.text.slice(0, at) + EMBED_CHAR + doc.text.slice(at)
  next.marks = shiftMarks(doc.marks, at, 1)
  next.embeds = [...shiftEmbeds(doc.embeds, at, 1), { ...embed, at }].sort((a, b) => a.at - b.at)
  next.blockProps = rederiveBlockProps(doc.text, doc.blockProps, next.text, at, 1)
  return next
}

function deleteEmbed(doc: DocState, at: number, embed: EmbedSpan): DocState {
  if (doc.text[at] !== EMBED_CHAR) return doc
  const next = deleteText(doc, at, 1, [embed], removedBlocksOf(doc, at, at + 1))
  next.embeds = next.embeds.filter((e) => e.id !== embed.id)
  return next
}
