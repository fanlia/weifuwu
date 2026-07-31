// 验证 image 元素端到端：带 logo 的 deck → pptx → LibreOffice
import { writeFileSync, mkdirSync } from 'node:fs'
import { renderSlide } from '../src/pptx/renderXml.ts'
import { h } from '../src/pptx/vnode.ts'
import { buildPptx } from '../src/pptx/packager.ts'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
mkdirSync('dist', { recursive: true })
const buf = buildPptx([
  renderSlide(h('slide', { bg: '#FFFFFF' },
    h('image', { x: 11.9, y: 0.25, w: 1.0, h: 1.0, src: `data:image/png;base64,${png}` }),
    h('text', { x: 0.6, y: 0.5, w: 9, fontSize: 28, bold: true }, '带 Logo 的页面'),
  ), 0),
  renderSlide(h('slide', {},
    h('image', { x: 11.9, y: 0.25, w: 1.0, h: 1.0, src: `data:image/png;base64,${png}` }),
    h('bullets', { x: 0.6, y: 1.5, w: 12, points: ['第二页也有 logo'] }),
  ), 1),
])
writeFileSync('dist/image-demo.pptx', buf)
console.log('dist/image-demo.pptx', buf.length, 'bytes')
