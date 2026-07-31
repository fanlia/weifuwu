import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateDeck, generateOutline, generateOutlineFromDoc, completeDeck, extractJson, validateOutline, MAX_DOC_CHARS, type Outline } from './outline.ts'
import type { ChatResponse } from '../ai/types.ts'

/** 构造 mock DeepSeek 客户端（不调真实 API） */
function mockClient(contents: string[]): any {
  let i = 0
  return {
    chat: async (): Promise<ChatResponse> => {
      const content = contents[Math.min(i++, contents.length - 1)]
      return { id: 'mock', model: 'mock', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }
    },
  }
}

const validDeck = JSON.stringify({
  title: '测试',
  theme: 'corporate',
  slides: [
    { layout: 'cover', title: '测试主题' },
    { layout: 'bullets', title: '要点', points: ['一', '二', '三'] },
    { layout: 'thanks', title: '谢谢观看' },
  ],
})

// ── 一键路径（v0.1 保留）──────────────────────────────

test('extractJson: 剥 markdown 代码块', () => {
  assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}')
  assert.equal(extractJson('好的，这是结果：\n{"slides":[]}\n希望有帮助'), '{"slides":[]}')
  assert.throws(() => extractJson('没有 JSON'), /没有 JSON 对象/)
})

test('generateDeck: 正常生成（mock）', async () => {
  const deck = await generateDeck({ topic: '测试', pages: 5 }, mockClient([validDeck]))
  assert.equal(deck.title, '测试')
  assert.equal(deck.slides.length, 3)
  assert.equal(deck.theme, 'corporate')
})

test('generateDeck: 非法输出自动重试一次后成功', async () => {
  const deck = await generateDeck({ topic: '测试' }, mockClient(['抱歉我不能生成', validDeck]))
  assert.equal(deck.title, '测试')
})

test('generateDeck: 两次都失败则抛错', async () => {
  const client = mockClient(['垃圾', '还是垃圾'])
  await assert.rejects(() => generateDeck({ topic: '测试' }, client), /AI 生成失败/)
})

test('generateDeck: 页数被限制在 5-15', async () => {
  const calls: any[] = []
  const client = {
    chat: async (params: any): Promise<ChatResponse> => {
      calls.push(params)
      return { id: 'm', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: validDeck }, finish_reason: 'stop' }] }
    },
  }
  await generateDeck({ topic: 'x', pages: 100 }, client)
  await generateDeck({ topic: 'x', pages: 1 }, client)
  const prompts = calls.map((c) => c.messages[1].content as string)
  assert.ok(prompts[0].includes('页数：15 页'))
  assert.ok(prompts[1].includes('页数：5 页'))
})

// ── 阶段 1：大纲生成 ──────────────────────────────────

const validOutline = JSON.stringify({
  title: '大纲主题',
  theme: 'corporate',
  slides: [
    { layout: 'cover', title: '主标题', subtitle: '副标题' },
    { layout: 'bullets', title: '要点页', points: ['摘要一', '摘要二'] },
    { layout: 'thanks', title: '谢谢观看' },
  ],
})

test('validateOutline: 合法/非法', () => {
  assert.doesNotThrow(() => validateOutline(JSON.parse(validOutline)))
  assert.throws(() => validateOutline({ slides: [] }), /slides 必须是非空数组/)
  assert.throws(() => validateOutline({ slides: [{ layout: 'xxx', title: 'a' }] }), /layout 非法/)
  assert.throws(() => validateOutline({ slides: [{ layout: 'cover' }] }), /缺少非空 title/)
})

test('generateOutline: 正常生成', async () => {
  const outline = await generateOutline({ topic: '测试', pages: 6 }, mockClient([validOutline]))
  assert.equal(outline.title, '大纲主题')
  assert.equal(outline.slides.length, 3)
  assert.equal(outline.slides[0].layout, 'cover')
})

test('generateOutline: 非法输出重试', async () => {
  const outline = await generateOutline({ topic: 'x' }, mockClient(['不是JSON', validOutline]))
  assert.equal(outline.title, '大纲主题')
})

// ── 从文档生成 ──────────────────────────────────────────

test('generateOutlineFromDoc: 正常提炼', async () => {
  const outline = await generateOutlineFromDoc(
    '这是一份关于新能源市场的调研文档，其中提到市场规模持续扩大，主要增长动力来自政策支持和技术进步，竞争格局正在变化。',
    { pages: 5 },
    mockClient([validOutline]),
  )
  assert.equal(outline.title, '大纲主题')
  assert.equal(outline.slides.length, 3)
})

test('generateOutlineFromDoc: 超长内容截断保护', async () => {
  const long = '文档内容 '.repeat(1000) // 6000+ 字符
  assert.ok(long.length > MAX_DOC_CHARS)
  const calls: any[] = []
  const client = {
    chat: async (params: any): Promise<ChatResponse> => {
      calls.push(params)
      return { id: 'm', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: validOutline }, finish_reason: 'stop' }] }
    },
  }
  const outline = await generateOutlineFromDoc(long, {}, client)
  assert.equal(outline.title, '大纲主题')
  const prompt = calls[0].messages[1].content as string
  assert.ok(prompt.includes('已截断'), 'prompt 应包含截断提示')
  assert.ok(prompt.length < long.length, 'prompt 应短于原文')
})

test('generateOutlineFromDoc: 非法输出重试', async () => {
  const outline = await generateOutlineFromDoc('足够长的文档内容 '.repeat(30), {}, mockClient(['垃圾', validOutline]))
  assert.equal(outline.title, '大纲主题')
})

// ── 阶段 2：分批完整生成 ──────────────────────────────

const outline: Outline = {
  title: '分批测试',
  theme: 'tech',
  slides: [
    { layout: 'cover', title: '主标题' },
    { layout: 'bullets', title: '要点一', points: ['a', 'b'] },
    { layout: 'section', number: 1, title: '章节' },
    { layout: 'bullets', title: '要点二' },
    { layout: 'thanks', title: '谢谢观看' },
  ],
}

// mock：每个批返回对应页的完整内容
function batchMockClient(): any {
  return {
    chat: async (params: any): Promise<ChatResponse> => {
      const user = params.messages[params.messages.length - 1].content as string
      const m = user.match(/生成第 (\d+)-(\d+) 页/)
      const start = Number(m?.[1] ?? 1)
      const end = Number(m?.[2] ?? 1)
      const slides = []
      for (let i = start; i <= end; i++) {
        const item = outline.slides[i - 1]
        if (item.layout === 'cover') slides.push({ layout: 'cover', title: item.title, subtitle: '完整副标题', meta: '分享人 | 2025' })
        else if (item.layout === 'section') slides.push({ layout: 'section', number: item.number, title: item.title, subtitle: '章节说明' })
        else if (item.layout === 'bullets') slides.push({ layout: 'bullets', title: item.title, points: ['完整要点一', '完整要点二', '完整要点三'] })
        else slides.push({ layout: 'thanks', title: '谢谢观看', subtitle: '感谢聆听' })
      }
      return { id: 'm', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(slides) }, finish_reason: 'stop' }] }
    },
  }
}

test('completeDeck: 分批生成完整 deck 且逐批回调', async () => {
  const batches: number[] = []
  const deck = await completeDeck(outline, batchMockClient(), (p) => batches.push(p.index))
  assert.equal(deck.title, '分批测试')
  assert.equal(deck.theme, 'tech')
  assert.equal(deck.slides.length, 5)
  // layout 顺序与大纲一致
  assert.deepEqual(deck.slides.map((s) => s.layout), outline.slides.map((s) => s.layout))
  // 5 页 → batch=2 → 3 批: index 2,4,5
  assert.deepEqual(batches, [2, 4, 5])
  // bullets 页有完整 points
  const b = deck.slides[1]
  assert.equal(b.layout, 'bullets')
  assert.ok((b as any).points.length >= 3)
  // cover 补全
  assert.ok((deck.slides[0] as any).subtitle)
})

test('completeDeck: 批次 layout 与大纲不一致时报错', async () => {
  const badClient = {
    chat: async (): Promise<ChatResponse> => {
      // 返回错误的 layout
      const slides = [{ layout: 'data', title: '错页' }, { layout: 'data', title: '错页2' }]
      return { id: 'm', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(slides) }, finish_reason: 'stop' }] }
    },
  }
  await assert.rejects(() => completeDeck(outline, badClient), /layout 与大纲不一致/)
})

test('completeDeck: 非法大纲直接拒绝', async () => {
  await assert.rejects(() => completeDeck({ title: 'x', theme: 'tech', slides: [] } as any, batchMockClient()), /slides 必须是非空数组/)
})

// ── 模板注入 ──────────────────────────────────────────

test('generateDeck/generateOutline: 模板骨架注入 prompt', async () => {
  const calls: any[] = []
  const client = {
    chat: async (params: any): Promise<ChatResponse> => {
      calls.push(params)
      return { id: 'm', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: validDeck }, finish_reason: 'stop' }] }
    },
  }
  await generateDeck({ topic: 'x', template: 'product-launch' }, client)
  const prompt = calls[0].messages[1].content as string
  assert.ok(prompt.includes('模板结构（严格遵循）'), 'prompt 应包含模板结构')
  assert.ok(prompt.includes('产品发布') || prompt.includes('cover 封面'), 'prompt 应包含模板骨架内容')
})

test('generateDeck: 无模板不注入', async () => {
  const calls: any[] = []
  const client = {
    chat: async (params: any): Promise<ChatResponse> => {
      calls.push(params)
      return { id: 'm', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: validDeck }, finish_reason: 'stop' }] }
    },
  }
  await generateDeck({ topic: 'x' }, client)
  assert.ok(!(calls[0].messages[1].content as string).includes('模板结构'))
})
