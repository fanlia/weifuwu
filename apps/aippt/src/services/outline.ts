/**
 * outline.ts — 两步生成管线（大纲 → 内容）的 AI 编排层
 *
 * 阶段 1: generateOutline  主题 → LLM → 大纲（每页 layout + title + 要点摘要）
 * 阶段 2: completeDeck     确认后的大纲 → LLM 分批 → 完整 deck（可流式回调进度）
 *
 * LLM 边界不变：只产 JSON，validateDeck/validateOutline 是硬守卫。
 */

import type { ChatMessage } from '../ai/types.ts'
import type { DeepSeekClient } from '../ai/deepseek.ts'
import { validateDeck, type DeckData, type SlideData } from '../pptx/components/layouts.ts'

export interface GenerateOptions {
  topic: string
  pages?: number
  style?: string
  language?: 'zh' | 'en'
  audience?: string
}

// ── 大纲数据结构 ─────────────────────────────────────────

export interface OutlineItem {
  layout: SlideData['layout']
  title: string
  /** 要点摘要（bullets/twoColumn 用，供用户确认方向） */
  points?: string[]
  subtitle?: string
  number?: number
}

export interface Outline {
  title: string
  theme: string
  slides: OutlineItem[]
}

const LAYOUTS = new Set(['cover', 'section', 'bullets', 'twoColumn', 'data', 'thanks'])

/** 大纲校验（阶段 1 输出守卫） */
export function validateOutline(outline: unknown): asserts outline is Outline {
  if (typeof outline !== 'object' || outline === null) throw new Error('validateOutline: outline 必须是对象')
  const o = outline as Record<string, any>
  if (!Array.isArray(o.slides) || o.slides.length === 0) throw new Error('validateOutline: slides 必须是非空数组')
  for (const [i, s] of o.slides.entries()) {
    if (typeof s !== 'object' || s === null || !LAYOUTS.has(s.layout)) {
      throw new Error(`validateOutline: slides[${i}] layout 非法: ${String(s?.layout)}`)
    }
    if (typeof s.title !== 'string' || s.title.trim() === '') {
      throw new Error(`validateOutline: slides[${i}] 缺少非空 title`)
    }
  }
}

const STYLE_NAMES: Record<string, string> = {
  corporate: '商务（稳重、专业、蓝白）',
  minimal: '极简（黑白灰、大量留白）',
  tech: '科技（深色底、青蓝色）',
  academic: '学术（紫色、沉稳）',
  vibrant: '活力（玫红、年轻）',
}

/** 从 LLM 输出中提取 JSON（剥 markdown 代码块） */
export function extractJson(text: string): string {
  let t = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('输出中没有 JSON 对象')
  return t.slice(start, end + 1)
}

function buildUserPrompt(opts: GenerateOptions, extra?: string): string {
  const pages = Math.min(Math.max(opts.pages ?? 8, 5), 15)
  const style = opts.style ?? 'corporate'
  const lang = opts.language ?? 'zh'
  return [
    `主题：${opts.topic}`,
    `页数：${pages} 页`,
    `风格：${STYLE_NAMES[style] ?? style}（theme 字段填 "${style}"）`,
    `语言：${lang === 'zh' ? '中文' : 'English'}`,
    opts.audience ? `受众：${opts.audience}` : null,
    extra ? `补充要求：${extra}` : null,
    '',
    '请输出演示文稿内容 JSON。',
  ].filter(Boolean).join('\n')
}

// ── 阶段 1：大纲生成 ─────────────────────────────────────

/** 文档模式截断上限（字符） */
export const MAX_DOC_CHARS = 4000

/** 从文档提炼大纲（复用 OUTLINE_SYSTEM schema，仅 user prompt 不同） */
export async function generateOutlineFromDoc(
  content: string,
  opts: GenerateOptions,
  client: DeepSeekClient,
): Promise<Outline> {
  const pages = Math.min(Math.max(opts.pages ?? 8, 5), 15)
  const style = opts.style ?? 'corporate'
  const lang = opts.language ?? 'zh'
  const trimmed =
    content.length > MAX_DOC_CHARS
      ? content.slice(0, MAX_DOC_CHARS) + '\n\n…（内容过长已截断，仅基于前 4000 字提炼）'
      : content

  const userPrompt = [
    `请根据以下文档内容提炼 PPT 大纲（保留核心论点与结构，忽略冗长细节）：`,
    `---`,
    trimmed,
    `---`,
    `页数：${pages} 页`,
    `风格：${STYLE_NAMES[style] ?? style}（theme 字段填 "${style}"）`,
    `语言：${lang === 'zh' ? '中文' : 'English'}`,
    opts.audience ? `受众：${opts.audience}` : null,
    '',
    '输出大纲 JSON。',
  ].filter(Boolean).join('\n')

  const attempt = async (hint?: string): Promise<Outline> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: DOC_OUTLINE_SYSTEM },
      { role: 'user', content: userPrompt },
    ]
    if (hint) {
      messages.push(
        { role: 'assistant', content: hint },
        { role: 'user', content: '上次输出不符合大纲 schema（slides 每项必须含 layout 字段）。请重新严格按 schema 只输出 JSON 对象。' },
      )
    }
    const res = await client.chat({ messages, temperature: 0.7, max_tokens: 2048, response_format: { type: 'json_object' } })
    const out = res.choices[0]?.message?.content ?? ''
    const outline = JSON.parse(extractJson(out)) as unknown
    validateOutline(outline)
    return outline
  }
  try {
    return await attempt()
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err)
    try {
      return await attempt(hint)
    } catch (err2) {
      throw new Error(`文档大纲生成失败: ${err2 instanceof Error ? err2.message : err2}`)
    }
  }
}

/** 文档模式专用 system：强 schema 约束（LLM 对文档输入容易跑偏回 title/bullets 结构） */
const DOC_OUTLINE_SYSTEM = `你是专业的演示文稿策划师。根据用户提供的文档内容提炼 PPT 大纲，只输出 JSON，不要任何其他文字。

JSON schema（严格遵循，slides 每项**必须**有 layout 字段）:
{
  "title": "演示文稿标题",
  "theme": "corporate | minimal | tech | academic | vibrant",
  "slides": [
    { "layout": "cover", "title": "主标题", "subtitle": "副标题一句话" },
    { "layout": "section", "number": 1, "title": "章节标题", "subtitle": "章节说明" },
    { "layout": "bullets", "title": "页面标题", "points": ["要点摘要1", "要点摘要2"] },
    { "layout": "twoColumn", "title": "页面标题", "points": ["左栏方向", "右栏方向"] },
    { "layout": "data", "title": "页面标题" },
    { "layout": "thanks", "title": "谢谢观看" }
  ]
}

规则：
1. 从文档提炼核心论点组织页面；第 1 页 cover，最后一页 thanks，每 3-5 页插一个 section。
2. layout 只能取 cover/section/bullets/twoColumn/data/thanks 之一，不能使用其他字段名（如 bullets/title 单独出现是非法的）。
3. 每页 title 不超过 14 字；points 只写方向摘要（2-3 条、每条 ≤ 10 字）。
4. theme 字段必须与用户指定的风格一致。
5. 忽略文档的冗长细节，保留结构性观点；不要编造文档中没有的数据。`

const OUTLINE_SYSTEM = `你是专业的演示文稿策划师。根据用户主题先生成 PPT 大纲（结构 + 每页标题 + 要点摘要），只输出 JSON，不要任何其他文字。

JSON schema（严格遵循）:
{
  "title": "演示文稿标题",
  "theme": "corporate | minimal | tech | academic | vibrant",
  "slides": [
    { "layout": "cover", "title": "主标题", "subtitle": "副标题一句话" },
    { "layout": "section", "number": 1, "title": "章节标题", "subtitle": "章节说明" },
    { "layout": "bullets", "title": "页面标题", "points": ["要点摘要1", "要点摘要2"] },
    { "layout": "twoColumn", "title": "页面标题", "points": ["左栏内容方向", "右栏内容方向"] },
    { "layout": "data", "title": "页面标题" },
    { "layout": "thanks", "title": "谢谢观看" }
  ]
}

规则：
1. 第 1 页必须是 cover；每 3-5 页插一个 section；中间以 bullets 为主（约 60%），穿插 twoColumn 和 data；最后一页 thanks。
2. 每页 title 不超过 14 字；points 只写方向性摘要（每页 2-3 条、每条 ≤ 10 字），用于用户确认。
3. theme 字段必须与用户指定的风格一致。
4. 大纲要完整覆盖主题的核心论点，逻辑递进。`

/** 阶段 1：主题 → 大纲 */
export async function generateOutline(opts: GenerateOptions, client: DeepSeekClient): Promise<Outline> {
  const attempt = async (hint?: string): Promise<Outline> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: OUTLINE_SYSTEM },
      { role: 'user', content: buildUserPrompt(opts) },
    ]
    if (hint) {
      messages.push(
        { role: 'assistant', content: hint },
        { role: 'user', content: '上次输出不合法（不是严格 JSON 或不符合大纲 schema）。请重新只输出合法的 JSON 对象。' },
      )
    }
    const res = await client.chat({ messages, temperature: 0.7, max_tokens: 2048, response_format: { type: 'json_object' } })
    const content = res.choices[0]?.message?.content ?? ''
    const outline = JSON.parse(extractJson(content)) as unknown
    validateOutline(outline)
    return outline
  }
  try {
    return await attempt()
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err)
    try {
      return await attempt(hint)
    } catch (err2) {
      throw new Error(`大纲生成失败: ${err2 instanceof Error ? err2.message : err2}`)
    }
  }
}

// ── 阶段 2：分批生成完整内容 ─────────────────────────────

const COMPLETE_SYSTEM = `你是专业的演示文稿内容作者。用户已确认大纲，你要为其中指定的若干页生成完整内容。只输出 JSON 数组，不要任何其他文字。

每页完整内容 schema（数组元素，与请求页一一对应）:
- cover:   { "layout": "cover", "title": "...", "subtitle": "...", "meta": "..." }
- section: { "layout": "section", "number": 1, "title": "...", "subtitle": "..." }
- bullets: { "layout": "bullets", "title": "...", "points": ["..."] }
- twoColumn: { "layout": "twoColumn", "title": "...", "leftTitle": "...", "leftPoints": ["..."], "rightTitle": "...", "rightPoints": ["..."] }
- data:    { "layout": "data", "title": "...", "stats": [{ "label": "...", "value": "...", "delta": "..." }] }
- thanks:  { "layout": "thanks", "title": "谢谢观看", "subtitle": "..." }

规则：
1. layout 与大纲一致，不得改变；title 与大纲标题一致（可微调但保留原意）。
2. bullets 的 points 每页 3-5 条、每条不超过 20 字；twoColumn 左右各 3-4 条。
3. cover 补充 subtitle（一句话副标题）和 meta（如 "分享人：xxx | 2025"）；section 补充 subtitle。
4. data 页 stats 每项 {label, value, delta}，value 用短数值或短句，delta 是环比。
5. 内容要具体、有洞察、数字合理，避免空话套话。`

const BATCH_SIZE = 2

/** 把大纲格式化给 LLM（第 i 页从 1 开始） */
function outlineForPrompt(outline: Outline): string {
  return outline.slides
    .map((s, i) => `${i + 1}. [${s.layout}] ${s.title}${s.points?.length ? ` | 摘要: ${s.points.join('；')}` : ''}`)
    .join('\n')
}

/** 生成一批页面的完整内容 */
async function generateBatch(
  outline: Outline,
  start: number,
  batch: OutlineItem[],
  client: DeepSeekClient,
): Promise<SlideData[]> {
  const attempt = async (hint?: string): Promise<SlideData[]> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: COMPLETE_SYSTEM },
      {
        role: 'user',
        content: [
          `演示文稿标题：${outline.title}`,
          `完整大纲：\n${outlineForPrompt(outline)}`,
          `请生成第 ${start + 1}-${start + batch.length} 页的完整内容。严格输出 JSON 数组，元素顺序与这 ${batch.length} 页一一对应。`,
          hint ? `上次输出不合法（${hint}）。请重新只输出合法 JSON 数组。` : '',
        ].filter(Boolean).join('\n'),
      },
    ]
    const res = await client.chat({ messages, temperature: 0.7, max_tokens: 2048, response_format: { type: 'json_object' } })
    const content = res.choices[0]?.message?.content ?? ''
    // 数组输出：直接取 [ ] 边界（extractJson 是对象版，会截断数组）
    const arrStart = content.indexOf('[')
    const arrEnd = content.lastIndexOf(']')
    if (arrStart < 0 || arrEnd <= arrStart) throw new Error('输出中没有 JSON 数组')
    const slides = JSON.parse(content.slice(arrStart, arrEnd + 1)) as SlideData[]
    if (!Array.isArray(slides) || slides.length !== batch.length) {
      throw new Error(`批次页数不符: 期望 ${batch.length}，得到 ${Array.isArray(slides) ? slides.length : '非数组'}`)
    }
    for (const [i, s] of slides.entries()) {
      if (s.layout !== batch[i].layout) throw new Error(`第 ${start + i + 1} 页 layout 与大纲不一致`)
      if (!s.title?.trim()) throw new Error(`第 ${start + i + 1} 页缺少 title`)
    }
    return slides
  }
  try {
    return await attempt()
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err)
    try {
      return await attempt(hint)
    } catch (err2) {
      throw new Error(`第 ${start + 1}-${start + batch.length} 页生成失败: ${err2 instanceof Error ? err2.message : err2}`)
    }
  }
}

export interface CompleteProgress {
  /** 已完成页数（含本批） */
  index: number
  total: number
  /** 本批生成的页面 */
  slides: SlideData[]
}

/**
 * 阶段 2：确认后的大纲 → 分批生成完整 deck。
 * @param onBatch 每批完成后回调（用于 SSE 流式进度）
 */
export async function completeDeck(
  outline: Outline,
  client: DeepSeekClient,
  onBatch?: (progress: CompleteProgress) => void,
): Promise<DeckData> {
  validateOutline(outline)
  const full: SlideData[] = []
  for (let start = 0; start < outline.slides.length; start += BATCH_SIZE) {
    const batch = outline.slides.slice(start, start + BATCH_SIZE)
    const slides = await generateBatch(outline, start, batch, client)
    full.push(...slides)
    onBatch?.({ index: Math.min(start + BATCH_SIZE, outline.slides.length), total: outline.slides.length, slides })
  }
  const deck: DeckData = { title: outline.title, theme: outline.theme, slides: full }
  validateDeck(deck) // 最终守卫
  return deck
}

// ── 一键快速路径（v0.1 保留）──────────────────────────────

const GENERATE_SYSTEM = `你是专业的演示文稿策划师。根据用户主题生成 PPT 内容，只输出 JSON，不要任何其他文字。

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

/** 一键生成（v0.1 快速路径，无大纲确认） */
export async function generateDeck(opts: GenerateOptions, client: DeepSeekClient): Promise<DeckData> {
  const attempt = async (hint?: string): Promise<DeckData> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: GENERATE_SYSTEM },
      { role: 'user', content: buildUserPrompt(opts) },
    ]
    if (hint) {
      messages.push(
        { role: 'assistant', content: hint },
        { role: 'user', content: '上次输出不合法（不是严格 JSON 或不符合 schema）。请重新只输出合法的 JSON 对象，不要任何解释。' },
      )
    }
    const res = await client.chat({ messages, temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } })
    const content = res.choices[0]?.message?.content ?? ''
    const deck = JSON.parse(extractJson(content)) as unknown
    validateDeck(deck)
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
