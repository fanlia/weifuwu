/**
 * edit.ts — 预览页编辑的 AI 能力
 *
 * - rewriteSlide:   AI 重写单页（扩写 / 精简 / 换说法）
 * - relayoutSlide:  AI 单页换版式（信息保持，仅改结构）
 *
 * 契约：输入/输出均为 SlideData 单页；layout 约束由 prompt + 校验保证。
 */

import type { ChatMessage } from '../ai/types.ts'
import type { DeepSeekClient } from '../ai/deepseek.ts'
import type { SlideData } from '../pptx/components/layouts.ts'

export type RewriteMode = 'expand' | 'condense' | 'rephrase'

const REWRITE_SYSTEM = `你是 PPT 页面内容作者。重写给定页面，保持 layout 和 title 语义不变，只输出 JSON 对象，不要任何其他文字。

模式要求：
- expand:   扩写 — 内容更详细、更具体，points 可到 5 条
- condense: 精简 — 突出核心，points 压缩到 3 条以内，每条更短
- rephrase: 换说法 — 表达方式焕新，意思不变，保留信息量

输出与输入相同 layout 的完整 JSON（所有字段齐全：title/points/subtitle/stats 等）。`

const RELAYOUT_SYSTEM = `你是 PPT 页面排版师。把页面内容转换为目标版式，保持信息完整、不编造数据，只输出 JSON 对象，不要任何其他文字。

版式转换规则：
- bullets → twoColumn: 要点拆分为左右两栏（leftPoints/rightPoints），补 leftTitle/rightTitle 概括
- twoColumn → bullets: 合并左右栏要点为 points
- bullets → data: 从要点提炼 3-4 个统计项 {label, value, delta}（value 用短数值或短句）
- data → bullets: 统计项转为要点
- 任何转换都不得改变 title 原意

输出目标版式的完整 JSON schema（cover/section/thanks 不参与转换）。`

function extractObject(content: string): string {
  let t = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('输出中没有 JSON 对象')
  return t.slice(start, end + 1)
}

/** 校验重写后的单页：layout 不变、title 非空 */
function checkSlide(s: SlideData, expectedLayout: string, label: string): void {
  if (s.layout !== expectedLayout) throw new Error(`${label}: layout 被改变 (${s.layout})`)
  if (!s.title?.trim()) throw new Error(`${label}: 缺少 title`)
  if ((s as any).points !== undefined && (!Array.isArray((s as any).points) || (s as any).points.some((p: unknown) => typeof p !== 'string'))) {
    throw new Error(`${label}: points 非法`)
  }
}

async function attempt(msgs: ChatMessage[], client: DeepSeekClient): Promise<SlideData> {
  const res = await client.chat({ messages: msgs, temperature: 0.7, max_tokens: 1024 })
  const content = res.choices[0]?.message?.content ?? ''
  return JSON.parse(extractObject(content)) as SlideData
}

/** AI 重写单页 */
export async function rewriteSlide(slide: SlideData, mode: RewriteMode, client: DeepSeekClient): Promise<SlideData> {
  const user = `页面内容（JSON）：\n${JSON.stringify(slide)}\n\n要求：${mode}。`
  const attemptOnce = async (hint?: string): Promise<SlideData> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: REWRITE_SYSTEM },
      { role: 'user', content: user },
    ]
    if (hint) {
      messages.push({ role: 'assistant', content: hint }, { role: 'user', content: '上次输出不合法。请重新只输出符合原 layout 的 JSON 对象。' })
    }
    const out = await attempt(messages, client)
    checkSlide(out, slide.layout, `重写失败`)
    return out
  }
  try {
    return await attemptOnce()
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err)
    try {
      return await attemptOnce(hint)
    } catch (err2) {
      throw new Error(`AI 重写失败: ${err2 instanceof Error ? err2.message : err2}`)
    }
  }
}

/** AI 单页换版式（cover/section/thanks 不允许转换） */
export async function relayoutSlide(slide: SlideData, targetLayout: string, client: DeepSeekClient): Promise<SlideData> {
  if (!['bullets', 'twoColumn', 'data'].includes(targetLayout)) {
    throw new Error(`目标版式不支持: ${targetLayout}`)
  }
  if (slide.layout === targetLayout) return slide
  if (!['bullets', 'twoColumn', 'data'].includes(slide.layout)) {
    throw new Error(`当前版式不支持转换: ${slide.layout}`)
  }

  const user = `页面内容（JSON）：\n${JSON.stringify(slide)}\n\n目标版式：${targetLayout}。`
  const attemptOnce = async (hint?: string): Promise<SlideData> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: RELAYOUT_SYSTEM },
      { role: 'user', content: user },
    ]
    if (hint) {
      messages.push({ role: 'assistant', content: hint }, { role: 'user', content: '上次输出不合法。请重新只输出目标版式的 JSON 对象。' })
    }
    const out = await attempt(messages, client)
    if (out.layout !== targetLayout) throw new Error(`layout 未转换为 ${targetLayout}`)
    checkSlide(out, targetLayout, `换版式失败`)
    return out
  }
  try {
    return await attemptOnce()
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err)
    try {
      return await attemptOnce(hint)
    } catch (err2) {
      throw new Error(`AI 换版式失败: ${err2 instanceof Error ? err2.message : err2}`)
    }
  }
}
