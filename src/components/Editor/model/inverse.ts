/**
 * weifuwu/components/Editor/model/inverse — 事件逆操作（undo 基元）
 *
 * 任意事件 → 逆事件（与 vdom3 events.ts inverse() 同构）。不变量：
 * applyEdit(applyEdit(doc, ev), inverseEdit(ev)) === doc。
 */

import type { DocState, EditEvent, EmbedSpan, BlockProp } from './types.ts'
import { EMBED_CHAR } from './types.ts'

/** 逆操作可能产生多个事件（text-delete 覆盖 embed → 恢复条目需补 embed-insert） */
export type InverseResult = EditEvent | EditEvent[]

/** 文本的段起点相对偏移（\n 分段——恢复文本的段属性显式重置用） */
function segmentOffsetsOf(text: string): number[] {
  const out = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') out.push(i + 1)
  }
  return out
}

/** 恢复文本的段属性重置事件：显式 block-set（含默认 p 清除——rederive 的
 *  上下文继承会污染恢复段（合并段属性错误继承）——真实事故：ai-apply 逆操作
 *  恢复多段文本时继承 h2 而非原属性）。removedBlocks 命中 → 恢复原属性。
 *  段起点必须按**含占位符**的 restoredText 计算（占位符剔除会改变段起点偏移——
 *  36 → 35——block-set 只认段起点）——调用方保证在 embed 恢复后应用（最终
 *  结构与原文档一致——段起点 = 原起点）。 */
function restoreSegmentProps(at: number, restoredText: string, removedBlocks: BlockProp[]): EditEvent[] {
  return segmentOffsetsOf(restoredText).map((off) => {
    const abs = at + off
    const prop = removedBlocks.find((b) => b.start === abs)
    return {
      type: 'block-set',
      start: abs,
      kind: prop?.kind ?? 'p',
      align: prop?.align ?? null,
      prev: null,
    } as EditEvent
  })
}

/**
 * 逆操作（undo 审计/验证用——生产 undo 走 commit 快照）。
 * doc 可选：text-insert/ai-apply 的逆需要操作后文档提取区间内段属性
 * （text-delete 校验要求——无 doc 时跳过（不精确——仅审计场景））。
 */
export function inverseEdit(ev: EditEvent, doc?: DocState): InverseResult {
  switch (ev.type) {
    case 'text-insert':
      return {
        type: 'text-delete', at: ev.at, len: ev.text.length, removed: ev.text,
        removedEmbeds: [],
        removedBlocks: doc
          ? doc.blockProps.filter((b) => b.start >= ev.at && b.start <= ev.at + ev.text.length)
          : [],
      }
    case 'text-delete': {
      // 恢复文本（剔除占位符——\uFFFC 只经 embed-insert 写入）+ 恢复被删区间内
      // 的 embed 条目 + 段属性显式重置（rederive 继承会污染恢复段）。
      // 位置重算：第 i 个占位符插入点 = 原位置 - i（其前已有 i 个占位符从纯文本
      // 中剔除——插入后逐个补回，偏移随已恢复数回移）
      const clean = ev.removed.replaceAll(EMBED_CHAR, '')
      const evs: EditEvent[] = [{ type: 'text-insert', at: ev.at, text: clean }]
      ev.removedEmbeds
        .slice()
        .sort((a, b) => a.at - b.at)
        .forEach((e) => {
          // 插入位置 = 原位置：clean 坐标（原位置 - i 个已剔除占位符）+
          // 已插入 i 个占位符——两者抵消
          evs.push({ type: 'embed-insert', at: e.at, embed: e })
        })
      // 段属性重置最后应用（最终结构含占位符——段起点 = 原起点；
      // 按含占位符文本计算段起点——clean 文本起点会错位）
      evs.push(...restoreSegmentProps(ev.at, ev.removed, ev.removedBlocks))
      return evs
    }
    case 'mark-apply':
      // 快照式逆操作：绝对恢复操作前区间（mark 区间收缩不可逆——
      // on=false 会破坏原区间——mark-restore 精确还原；prev 需 doc 提取操作后区间）
      return {
        type: 'mark-restore',
        mark: ev.mark,
        spans: ev.prev,
        prev: doc ? doc.marks.filter((m) => m.type === ev.mark) : [],
      }
    case 'mark-restore':
      // 再逆需要操作后区间（doc 上下文提取——无 doc 时用 prev 兜底）
      return {
        type: 'mark-restore',
        mark: ev.mark,
        spans: ev.prev,
        prev: doc ? doc.marks.filter((m) => m.type === ev.mark) : ev.prev,
      }
    case 'block-set':
      return {
        type: 'block-set',
        start: ev.start,
        kind: ev.prev?.kind ?? 'p',
        align: ev.prev?.align ?? null,
        prev: ev.kind === 'p' && !ev.align ? null : { start: ev.start, kind: ev.kind, ...(ev.align ? { align: ev.align } : {}) },
      }
    case 'embed-insert':
      return { type: 'embed-delete', at: ev.at, embed: ev.embed }
    case 'embed-delete':
      return { type: 'embed-insert', at: ev.at, embed: ev.embed }
    case 'ai-apply': {
      // 对称替换：revised → original（start 不变，end 移到 original 后）
      // original 可能含嵌入占位符（AI 替换区间含图片）——剔除后由 embed-insert 恢复；
      // 被删段属性同样恢复（removedBlocks——原段起点在恢复文本中仍有效）
      const start = ev.start
      const end = start + ev.revised.length
      const evs: EditEvent[] = [{
        type: 'ai-apply',
        start,
        end,
        original: ev.revised,
        revised: ev.original.replaceAll(EMBED_CHAR, ''),
        removedEmbeds: [],
        removedBlocks: doc
          ? doc.blockProps.filter((b) => b.start >= start && b.start <= end)
          : [],
      }]
      // 恢复文本段属性显式重置（rederive 继承污染修复）——放最后：
      // embed 恢复后最终结构 = 原文档——按含占位符 original 计算段起点
      // （clean 文本段起点错位——占位符剔除偏移）——block-set 只认段起点
      ev.removedEmbeds
        .slice()
        .sort((a, b) => a.at - b.at)
        .forEach((e) => {
          // 插入位置 = 原位置（clean 坐标补偿与已插入占位符抵消）
          evs.push({ type: 'embed-insert', at: e.at, embed: e })
        })
      evs.push(...restoreSegmentProps(start, ev.original, ev.removedBlocks))
      return evs
    }
  }
}

/** commit 的逆（事件逆序 + 各自逆操作展开——undo 应用顺序） */
export function inverseCommit(events: EditEvent[]): EditEvent[] {
  return events.slice().reverse().flatMap((ev) => {
    const inv = inverseEdit(ev)
    return Array.isArray(inv) ? inv : [inv]
  })
}

export { EMBED_CHAR }
export type { EmbedSpan }
