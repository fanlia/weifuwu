/**
 * WordCloud 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（W1/W2 波次）：
 * - 空态：words 空/全零权重 → wf-wordcloud-empty（无 SVG）
 * - 字数=输入数：text 元素数 = 正权重词数（0 权重过滤）
 * - 字号映射：权重线性 → [minFontSize, maxFontSize]（全等权重 → 全 maxFontSize）
 * - 零重叠：textLength 已知 → 词矩形（含 padding）两两不相交
 * - 确定性：同输入两跑 → 布局字节一致（SSR≡SPA 的依据——纯函数无 DOM API）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WordCloud, layoutWords, estimateWordWidth } from './WordCloud.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

const WORDS = [
  { word: 'weifuwu', weight: 10 },
  { word: '组件库', weight: 8 },
  { word: 'vdom', weight: 6 },
  { word: '命令流', weight: 4 },
  { word: 'SSR', weight: 2 },
  { word: '词云', weight: 1 },
]

interface TextEl {
  x: number; y: number; size: number; textLength: number; text: string
}

function extractTexts(h: { cmds: any[] }): TextEl[] {
  // 文本 = 独立 createText 命令（非 text 元素 children）——双流 DFS 序配对
  const texts: TextEl[] = []
  const vals = h.cmds.filter((c) => c.op === 'createText').map((c: any) => c.value)
  let vi = 0
  for (const c of h.cmds) {
    if (c.op === 'create' && c.tag === 'text') {
      texts.push({
        x: Number((c.attrs as any).x), y: Number((c.attrs as any).y),
        size: Number((c.attrs as any)['font-size']),
        textLength: Number((c.attrs as any).textLength),
        text: String(vals[vi] ?? ''),
      })
      vi++
    }
  }
  return texts
}

/** 浮点容差（布局连续浮点运算——边界相接尾差 ~1e-13——几何判定标准做法） */
const EPS = 1e-6

test('空态：words 空 → wf-wordcloud-empty 无 SVG', async () => {
  const h = await mount(WordCloud, { words: [] })
  const ct = createTable(h.cmds)
  const texts = [...ct.values()].filter((c) => c.tag === 'text')
  assert.equal(texts.length, 0, '无 text 元素')
  const empty = [...ct.values()].find((c) => c.tag === 'div' && String(c.attrs?.class ?? '').includes('wf-wordcloud-empty'))
  assert.ok(empty, '空态 div 存在')
})

test('字数=输入数（0 权重过滤）', async () => {
  const h = await mount(WordCloud, { words: [...WORDS, { word: '零权重', weight: 0 }] })
  const texts = extractTexts(h)
  assert.equal(texts.length, WORDS.length, 'text 数 = 正权重词数')
})

test('字号映射：权重线性（高权重→大字号）+ 全等权重同尺寸', async () => {
  const h = await mount(WordCloud, { words: WORDS })
  const texts = extractTexts(h)
  const byWeight = (w: string) => WORDS.find((x) => x.word === w)!.weight
  const sorted = [...texts].sort((a, b) => byWeight(b.text) - byWeight(a.text))
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i - 1].size >= sorted[i].size, `权重降序尺寸非增: ${sorted[i - 1].text}(${sorted[i - 1].size}) >= ${sorted[i].text}(${sorted[i].size})`)
  }
  const maxEl = sorted[0]
  const minEl = sorted[sorted.length - 1]
  assert.equal(maxEl.size, 32, '最高权重 → maxFontSize')
  assert.equal(minEl.size, 12, '最低权重 → minFontSize')
  // 全等权重
  const h2 = await mount(WordCloud, { words: WORDS.map((w) => ({ word: w.word, weight: 5 })) })
  const sizes = new Set(extractTexts(h2).map((t) => t.size))
  assert.deepEqual([...sizes], [32], '全等权重 → 全 maxFontSize')
})

test('零重叠：textLength 已知 → 词矩形（含 padding）两两不相交', async () => {
  const h = await mount(WordCloud, { words: WORDS })
  const texts = extractTexts(h)
  const padding = 4
  const rects = texts.map((t) => ({
    word: t.text,
    l: t.x - (t.textLength + padding * 2) / 2,
    r: t.x + (t.textLength + padding * 2) / 2,
    t: t.y - t.size * 0.8,
    b: t.y + t.size * 0.2,
  }))
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]; const b = rects[j]
      const overlap = a.l < b.r - EPS && b.l < a.r - EPS && a.t < b.b - EPS && b.t < a.b - EPS
      assert.ok(!overlap, `零重叠: "${a.word}"(${i}) vs "${b.word}"(${j})——`)
    }
  }
})

test('确定性：同输入两跑 → 布局一致（SSR≡SPA 依据）', () => {
  const a = layoutWords(WORDS, { width: 480, maxFontSize: 32, minFontSize: 12, padding: 4 })
  const b = layoutWords(WORDS, { width: 480, maxFontSize: 32, minFontSize: 12, padding: 4 })
  assert.deepEqual(a, b, '纯函数确定性')
})

test('estimateWordWidth：CJK 全宽 / ASCII 0.62 系数', () => {
  assert.equal(estimateWordWidth('ab', 10), 12.4, 'ASCII 2×10×0.62')
  assert.equal(estimateWordWidth('词云', 10), 20, 'CJK 2×10×1.0')
})
