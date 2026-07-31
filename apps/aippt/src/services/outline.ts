/**
 * outline.ts — 主题 → LLM → 语义 JSON（aippt 的 AI 编排层）
 *
 * 这是 LLM 与引擎的唯一边界：
 *   LLM 只产 DeckData（语义 JSON），validateDeck() 是硬守卫——
 *   输出不合法就重试一次，仍失败则报错，绝不把脏数据喂给引擎。
 */

import type { ChatMessage } from '../ai/types.ts'
import type { DeepSeekClient } from '../ai/deepseek.ts'
import { validateDeck, type DeckData } from '../pptx/components/layouts.ts'

export interface GenerateOptions {
  topic: string
  pages?: number
  style?: string
  language?: 'zh' | 'en'
  audience?: string
}

const STYLE_NAMES: Record<string, string> = {
  corporate: '商务（稳重、专业、蓝白）',
  minimal: '极简（黑白灰、大量留白）',
  tech: '科技（深色底、青蓝色）',
  academic: '学术（紫色、沉稳）',
  vibrant: '活力（玫红、年轻）',
}

function systemPrompt(): string {
  return `你是专业的演示文稿策划师。根据用户主题生成 PPT 内容，只输出 JSON，不要任何其他文字。

JSON schema（严格遵循）:
{
  "title": "演示文稿标题",
  "theme": "corporate | minimal | tech | academic | vibrant",
  "slides": [
    { "layout": "cover", "title": "...", "subtitle": "...", "meta": "..." },
    { "layout": "section", "number": 1, "title": "...", "subtitle": "..." },
    { "layout": "bullets", "title": "...", "points": ["...", "..."] },
    { "layout": "twoColumn", "title": "...", "leftTitle": "...", "leftPoints": ["..."], "rightTitle": "...", "rightPoints": ["..."] },
    { "layout": "data", "title": "...", "stats": [{ "label": "...", "value": "...", "delta": "..." }] },
    { "layout": "thanks", "title": "谢谢观看", "subtitle": "..." }
  ]
}

规则：
1. slides 结构：第 1 页 cover；每 3-5 页插一个 section 页；中间以 bullets 为主（约 60%），穿插 twoColumn 和 data；最后一页 thanks。
2. 每页 title 不超过 14 字；points 每页 3-5 条、每条不超过 20 字。
3. data 页 stats 每项 {label, value, delta}，value 用短数值或短句，delta 是环比（如 "↑ 25%"）。
4. theme 字段必须与用户指定的风格完全一致。
5. 内容要具体、有洞察，避免空话套话；数字要合理可信。`
}

/** 从 LLM 输出中提取 JSON 对象（剥 markdown 代码块） */
export function extractJson(text: string): string {
  let t = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('输出中没有 JSON 对象')
  return t.slice(start, end + 1)
}

/**
 * 生成完整 deck 语义 JSON。
 * @param client 已配置的 DeepSeek 客户端
 */
export async function generateDeck(opts: GenerateOptions, client: DeepSeekClient): Promise<DeckData> {
  const pages = Math.min(Math.max(opts.pages ?? 8, 5), 15)
  const style = opts.style ?? 'corporate'
  const lang = opts.language ?? 'zh'

  const userPrompt = [
    `主题：${opts.topic}`,
    `页数：${pages} 页`,
    `风格：${STYLE_NAMES[style] ?? style}（theme 字段填 "${style}"）`,
    `语言：${lang === 'zh' ? '中文' : 'English'}`,
    opts.audience ? `受众：${opts.audience}` : null,
    '',
    '请生成完整的演示文稿内容 JSON。',
  ].filter(Boolean).join('\n')

  const attempt = async (hint?: string): Promise<DeckData> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt },
    ]
    if (hint) {
      messages.push(
        { role: 'assistant', content: hint },
        { role: 'user', content: '上次输出不合法（不是严格 JSON 或不符合 schema）。请重新只输出合法的 JSON 对象，不要任何解释。' },
      )
    }
    const res = await client.chat({ messages, temperature: 0.7, max_tokens: 4096 })
    const content = res.choices[0]?.message?.content ?? ''
    const deck = JSON.parse(extractJson(content)) as unknown
    validateDeck(deck) // 硬守卫
    return deck
  }

  try {
    return await attempt()
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err)
    try {
      return await attempt(hint)
    } catch (err2) {
      throw new Error(`AI 生成失败: ${err2 instanceof Error ? err2.message : err2}`)
    }
  }
}
