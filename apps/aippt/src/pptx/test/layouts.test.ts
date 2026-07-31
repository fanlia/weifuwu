import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deckToPptx, validateDeck, type DeckData } from '../components/layouts.ts'
import { unzip, assertWellFormedXml } from './helpers.ts'

const deck: DeckData = {
  title: 'AI PPT 生成引擎',
  theme: 'corporate',
  slides: [
    { layout: 'cover', title: 'AI PPT 生成引擎', subtitle: '可部署 · 可编程 · 可批量 · 可证明' },
    { layout: 'section', number: 1, title: '为什么自研引擎' },
    {
      layout: 'bullets',
      title: '核心观点',
      points: ['自研 pptx-vdom 引擎，零第三方依赖', '确定性输出，可字节级回归', '三层测试防线'],
    },
    {
      layout: 'twoColumn',
      title: '两种模式对比',
      leftTitle: '云 SaaS',
      leftPoints: ['数据在别人服务器', '封闭产品', '按订阅付费'],
      rightTitle: 'aippt',
      rightPoints: ['可私有化部署', 'API/SDK 可编程', '边际成本几分钱'],
    },
    {
      layout: 'data',
      title: '核心指标',
      stats: [
        { label: '生成耗时', value: '5-15 分钟', delta: '↓ 90%' },
        { label: '边际成本', value: '¥0.05', delta: '↓ 99%' },
        { label: '兼容性', value: '4/4', delta: '已实测' },
      ],
    },
    { layout: 'thanks', title: '谢谢观看', subtitle: 'AI 生成的演示文稿' },
  ],
}

test('validateDeck: 合法 deck 通过', () => {
  assert.doesNotThrow(() => validateDeck(deck))
})

test('validateDeck: 非法 deck 抛错', () => {
  assert.throws(() => validateDeck({ slides: [] }), /slides 必须是非空数组/)
  assert.throws(() => validateDeck({ slides: [{ layout: 'cover' }], theme: 'corporate' }), /缺少非空 title/)
  assert.throws(
    () => validateDeck({ slides: [{ layout: 'xxx', title: 'a' }], theme: 'corporate' }),
    /layout 非法/,
  )
  assert.throws(() => validateDeck({ slides: [{ layout: 'bullets', title: 'a', points: [1] }], theme: 'corporate' }), /字符串数组/)
  assert.throws(() => validateDeck({ slides: [{ layout: 'cover', title: 'a' }], theme: 'unknown' }), /未知主题/)
})

test('deckToPptx: 语义 JSON → 完整可解包 pptx', () => {
  const buf = deckToPptx(deck)
  const map = unzip(buf)
  assert.equal(map.size, 26) // 14 模板 + 6 slides + 6 slide rels

  // 6 页 slide
  for (let i = 1; i <= 6; i++) {
    assert.ok(map.has(`ppt/slides/slide${i}.xml`), `缺少 slide${i}`)
  }

  // 内容抽查
  const s1 = map.get('ppt/slides/slide1.xml')!.toString()
  assert.ok(s1.includes('<a:t>AI PPT 生成引擎</a:t>'))
  const s5 = map.get('ppt/slides/slide5.xml')!.toString()
  assert.ok(s5.includes('<a:t>生成耗时</a:t>'))
  const s6 = map.get('ppt/slides/slide6.xml')!.toString()
  assert.ok(s6.includes('<a:t>谢谢观看</a:t>'))

  // 页脚页码
  const s3 = map.get('ppt/slides/slide3.xml')!.toString()
  assert.ok(s3.includes('>3<'))

  // 所有 XML 语法合法
  for (const [name, data] of map) {
    if (name.endsWith('.xml') || name.endsWith('.rels')) assertWellFormedXml(data.toString(), name)
  }
})

test('deckToPptx: 确定性（黄金测试基础）', () => {
  assert.deepEqual(deckToPptx(deck), deckToPptx(deck))
})

test('deckToPptx: 换主题输出不同且合法', () => {
  const techDeck: DeckData = { ...deck, theme: 'tech' }
  const buf = deckToPptx(techDeck)
  const map = unzip(buf)
  const s1 = map.get('ppt/slides/slide1.xml')!.toString()
  // tech 深色背景
  assert.ok(s1.includes('0B1120'))
  assert.notDeepEqual(deckToPptx(deck), buf)
})

test('deckToPptx: 非法 deck 直接抛错（LLM 守卫）', () => {
  assert.throws(() => deckToPptx({ slides: [{ layout: 'cover', title: '' }], theme: 'corporate' } as any), /缺少非空 title/)
})
