import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSlide, esc, colorVal } from '../renderXml.ts'
import { h } from '../vnode.ts'

test('esc: XML 转义', () => {
  assert.equal(esc('a<b>&c"d\'e'), 'a&lt;b&gt;&amp;c&quot;d&apos;e')
})

test('colorVal: 颜色归一化', () => {
  assert.equal(colorVal('#6366f1'), '6366F1')
  assert.equal(colorVal('6366f1'), '6366F1')
})

test('renderSlide: 基础文本 slide 结构正确', () => {
  const { xml } = renderSlide(
    h('slide', { bg: '#ffffff' },
      h('text', { x: 0.5, y: 0.4, w: 9, h: 0.9, fontSize: 28, bold: true, color: '#111827' }, 'Hello 你好'),
    ),
  )
  // 根元素与命名空间
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'))
  assert.ok(xml.includes('<p:sld xmlns:a='))
  // 背景
  assert.ok(xml.includes('<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>'))
  // 坐标英寸→EMU：0.5in = 457200
  assert.ok(xml.includes('<a:off x="457200" y="365760"/>'))
  // 字号 28pt → sz=2800
  assert.ok(xml.includes('<a:rPr sz="2800" b="1" lang="zh-CN">'))
  // 中文字体注入
  assert.ok(xml.includes('<a:ea typeface="Microsoft YaHei"/>'))
  // 文本与转义
  assert.ok(xml.includes('<a:t>Hello 你好</a:t>'))
  // 元素 id 从 2 开始（spTree 的 nvGrpSpPr 是 1）
  assert.ok(xml.includes('id="2"'))
})

test('renderSlide: 文本转义生效', () => {
  const { xml } = renderSlide(h('slide', {}, h('text', { x: 0, y: 0 }, 'a < b & c')))
  assert.ok(xml.includes('<a:t>a &lt; b &amp; c</a:t>'))
})

test('renderSlide: rect + 居中文本', () => {
  const { xml } = renderSlide(
    h('slide', {},
      h('rect', { x: 1, y: 1, w: 3, h: 1, fill: '#6366F1', color: '#ffffff', fontSize: 16, bold: true }, '按钮'),
    ),
  )
  assert.ok(xml.includes('<a:prstGeom prst="rect">'))
  assert.ok(xml.includes('<a:solidFill><a:srgbClr val="6366F1"/></a:solidFill>'))
  assert.ok(xml.includes('ctr')) // 居中
  assert.ok(xml.includes('<a:t>按钮</a:t>'))
})

test('renderSlide: bullets 逐条 bullet 段落', () => {
  const { xml } = renderSlide(
    h('slide', {},
      h('bullets', { x: 0.5, y: 1.5, w: 9, points: ['第一点', '第二点'] }),
    ),
  )
  assert.equal((xml.match(/<a:buChar char="•"/g) ?? []).length, 2)
  assert.ok(xml.includes('<a:t>第一点</a:t>'))
  assert.ok(xml.includes('<a:t>第二点</a:t>'))
  // 悬挂缩进
  assert.ok(xml.includes('marL="285750" indent="-285750"'))
})

test('renderSlide: 线条元素', () => {
  const { xml } = renderSlide(h('slide', {}, h('line', { x1: 0.5, y1: 0.5, x2: 5, y2: 0.5, color: '#E5E7EB', weight: 1.5 })))
  assert.ok(xml.includes('<p:cxnSp>'))
  assert.ok(xml.includes('<a:prstGeom prst="line">'))
  assert.ok(xml.includes('w="19050"')) // 1.5pt 线宽
})

test('renderSlide: 组件递归', () => {
  const Header = (props: any) => h('text', { x: 0.5, y: 0.3, w: 9, fontSize: props.size }, props.title)
  const { xml } = renderSlide(h('slide', {}, h(Header, { title: '章节标题', size: 32 })))
  assert.ok(xml.includes('<a:t>章节标题</a:t>'))
  assert.ok(xml.includes('sz="3200"'))
})

test('renderSlide: 未知元素抛错（受控子集约束）', () => {
  assert.throws(() => renderSlide(h('slide', {}, h('div', {}) as any)), /未知元素/)
})

test('renderSlide: 确定性 — 同一 VNode 两次渲染字节一致', () => {
  const vnode = h('slide', { bg: '#fff' }, h('text', { x: 1, y: 1 }, 'fixed'))
  assert.equal(renderSlide(vnode).xml, renderSlide(vnode).xml)
})

test('renderSlide: 组件返回数组（多元素）', () => {
  const TwoTexts = () => [
    h('text', { x: 0, y: 0, w: 4 }, 'A'),
    h('text', { x: 5, y: 0, w: 4 }, 'B'),
  ]
  const { xml } = renderSlide(h('slide', {}, h(TwoTexts, {})))
  assert.ok(xml.includes('<a:t>A</a:t>'))
  assert.ok(xml.includes('<a:t>B</a:t>'))
})

test('renderSlide: image 元素产出 p:pic + 图片注册', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' // 1x1 红点 png
  const { xml, images } = renderSlide(
    h('slide', {},
      h('image', { x: 1, y: 1, w: 2, h: 0.5, src: `data:image/png;base64,${png}` }),
    ),
  )
  assert.ok(xml.includes('<p:pic>'))
  assert.ok(xml.includes('<a:blip r:embed="rId2"/>'))
  assert.ok(xml.includes('name="Picture 2"'))
  assert.equal(images.length, 1)
  assert.equal(images[0].name, 'image1.png')
  assert.equal(images[0].data.length, 70)
})

test('renderSlide: 多 slide 图片索引全局唯一', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const s1 = renderSlide(h('slide', {}, h('image', { src: png })), 0)
  const s2 = renderSlide(h('slide', {}, h('image', { src: png })), 1)
  assert.equal(s1.images[0].name, 'image1.png')
  assert.equal(s2.images[0].name, 'image2.png')
  assert.equal(s1.images[0].relId, 'rId2')
  assert.equal(s2.images[0].relId, 'rId3')
})
