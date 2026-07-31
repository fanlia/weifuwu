import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rewriteSlide, relayoutSlide } from './edit.ts'
import type { ChatResponse } from '../ai/types.ts'
import type { SlideData } from '../pptx/components/layouts.ts'

function mockClient(contents: string[]): any {
  let i = 0
  return {
    chat: async (): Promise<ChatResponse> => {
      const content = contents[Math.min(i++, contents.length - 1)]
      return { id: 'm', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }
    },
  }
}

const bulletsSlide: SlideData = {
  layout: 'bullets',
  title: '核心优势',
  points: ['速度快', '成本低'],
}

test('rewriteSlide: 扩写保留 layout 和 title', async () => {
  const out = JSON.stringify({ layout: 'bullets', title: '核心优势', points: ['速度快，秒级生成', '成本低，几分钱一份', '质量高，可回归'] })
  const slide = await rewriteSlide(bulletsSlide, 'expand', mockClient([out]))
  assert.equal(slide.layout, 'bullets')
  assert.equal(slide.title, '核心优势')
  assert.ok((slide as any).points.length === 3)
})

test('rewriteSlide: 输出改变 layout 时报错并重试', async () => {
  const bad = JSON.stringify({ layout: 'data', title: '核心优势', stats: [] })
  const good = JSON.stringify({ layout: 'bullets', title: '核心优势', points: ['更快'] })
  const slide = await rewriteSlide(bulletsSlide, 'condense', mockClient([bad, good]))
  assert.equal(slide.layout, 'bullets')
})

test('rewriteSlide: 两次都失败抛错', async () => {
  const bad = JSON.stringify({ layout: 'data', title: 'x', stats: [] })
  await assert.rejects(() => rewriteSlide(bulletsSlide, 'expand', mockClient([bad, bad])), /AI 重写失败/)
})

test('relayoutSlide: bullets → twoColumn 信息保留', async () => {
  const out = JSON.stringify({
    layout: 'twoColumn',
    title: '核心优势',
    leftTitle: '体验',
    leftPoints: ['速度快'],
    rightTitle: '成本',
    rightPoints: ['成本低'],
  })
  const slide = await relayoutSlide(bulletsSlide, 'twoColumn', mockClient([out]))
  assert.equal(slide.layout, 'twoColumn')
  assert.equal((slide as any).leftPoints.length, 1)
  assert.equal((slide as any).rightPoints.length, 1)
})

test('relayoutSlide: 目标未转换时报错', async () => {
  const wrong = JSON.stringify({ layout: 'bullets', title: 'x', points: [] })
  await assert.rejects(() => relayoutSlide(bulletsSlide, 'twoColumn', mockClient([wrong])), /未转换为/)
})

test('relayoutSlide: 不支持的目标版式抛错', async () => {
  await assert.rejects(() => relayoutSlide(bulletsSlide, 'cover', mockClient([])), /目标版式不支持/)
  await assert.rejects(() => relayoutSlide(bulletsSlide, 'thanks', mockClient([])), /目标版式不支持/)
})

test('relayoutSlide: cover 页不可转换', async () => {
  const cover: SlideData = { layout: 'cover', title: '封面' }
  await assert.rejects(() => relayoutSlide(cover, 'bullets', mockClient([])), /当前版式不支持转换/)
})

test('relayoutSlide: 同版式直接返回', async () => {
  const slide = await relayoutSlide(bulletsSlide, 'bullets', mockClient([]))
  assert.deepEqual(slide, bulletsSlide)
})
