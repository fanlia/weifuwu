import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateDeck, extractJson } from './outline.ts'
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
  // 第一次输出非法（纯文本），第二次合法
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
