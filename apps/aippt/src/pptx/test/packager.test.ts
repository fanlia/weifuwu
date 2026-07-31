import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSlide } from '../renderXml.ts'
import { h } from '../vnode.ts'
import { buildPptx } from '../packager.ts'
import { unzip, assertWellFormedXml } from './helpers.ts'

function sampleDeck() {
  return [
    renderSlide(
      h('slide', { bg: '#0F172A' },
        h('text', { x: 1, y: 2.4, w: 11.3, h: 1.2, fontSize: 40, bold: true, color: '#FFFFFF' }, 'AI PPT 生成引擎'),
        h('text', { x: 1, y: 3.7, w: 11.3, fontSize: 16, color: '#94A3B8' }, '可部署 · 可编程 · 可批量 · 可证明'),
      ),
    ),
    renderSlide(
      h('slide', {},
        h('text', { x: 0.6, y: 0.4, w: 9, fontSize: 28, bold: true, color: '#0F172A' }, '核心观点'),
        h('bullets', { x: 0.6, y: 1.5, w: 12, fontSize: 16, points: ['自研 pptx-vdom 引擎', '确定性输出，可字节级回归', '三层测试防线'] }),
      ),
    ),
  ]
}

test('buildPptx: 生成完整可解包的 pptx', () => {
  const buf = buildPptx(sampleDeck())
  const map = unzip(buf)

  // 必备文件齐全
  for (const name of [
    '[Content_Types].xml',
    '_rels/.rels',
    'ppt/presentation.xml',
    'ppt/_rels/presentation.xml.rels',
    'ppt/slideMasters/slideMaster1.xml',
    'ppt/slideLayouts/slideLayout1.xml',
    'ppt/theme/theme1.xml',
    'ppt/slides/slide1.xml',
    'ppt/slides/slide2.xml',
    'ppt/slides/_rels/slide1.xml.rels',
  ]) {
    assert.ok(map.has(name), `缺少 ${name}`)
  }

  // slides 内容
  const s1 = map.get('ppt/slides/slide1.xml')!.toString()
  assert.ok(s1.includes('<a:t>AI PPT 生成引擎</a:t>'))
  const s2 = map.get('ppt/slides/slide2.xml')!.toString()
  assert.ok(s2.includes('<a:t>自研 pptx-vdom 引擎</a:t>'))

  // presentation.xml 含两个 slide 引用
  const pres = map.get('ppt/presentation.xml')!.toString()
  assert.equal((pres.match(/<p:sldId /g) ?? []).length, 2)

  // rels 含两个 slide 关系
  const rels = map.get('ppt/_rels/presentation.xml.rels')!.toString()
  assert.equal((rels.match(/\/slide" Target="slides\/slide/g) ?? []).length, 2)

  // content-types 含两个 slide Override
  const ct = map.get('[Content_Types].xml')!.toString()
  assert.equal((ct.match(/presentationml.slide\+xml/g) ?? []).length, 2)
})

test('buildPptx: 所有 XML 文件语法合法（无裸属性）', () => {
  const map = unzip(buildPptx(sampleDeck()))
  for (const [name, data] of map) {
    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      assertWellFormedXml(data.toString(), name)
    }
  }
})

test('buildPptx: 确定性 — 两次生成字节一致（黄金测试基础）', () => {
  const a = buildPptx(sampleDeck())
  const b = buildPptx(sampleDeck())
  assert.deepEqual(a, b)
})

test('buildPptx: 空 deck 抛错', () => {
  assert.throws(() => buildPptx([]), /至少需要 1 页/)
})

test('buildPptx: 中文文本在 XML 中正确（UTF-8 完整）', () => {
  const buf = buildPptx([
    renderSlide(h('slide', {}, h('text', { x: 0, y: 0 }, '中文测试：价格 ¥100 < 预算 & 合理'))),
  ])
  const s1 = unzip(buf).get('ppt/slides/slide1.xml')!.toString()
  assert.ok(s1.includes('<a:t>中文测试：价格 ¥100 &lt; 预算 &amp; 合理</a:t>'))
})
