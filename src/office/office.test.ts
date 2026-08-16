/**
 * office/docx 双向转换测试（参考算法 office2json——自研零依赖实现）：
 * - 往返：DocState → docx（导出）→ DocState（导入）——文本/块/marks/表格/图片
 * - 真实 docx 读取：office2json 测试样本 test.docx（外部参照——仅手工验证用）
 * - ZIP 读写往返
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readZip, writeZip, crc32 } from './zip.ts'
import { parseXml } from './xml.ts'
import { docToDocx, docxToDoc } from './docx.ts'
import type { DocState } from '../components/Editor/model/types.ts'
import { EMBED_CHAR } from '../components/Editor/model/types.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function concatU8(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

describe('office/zip（自研容器——零依赖）', () => {
  test('writeZip → readZip 往返（store 无压缩 + CRC32）', async () => {
    const files = new Map([
      ['word/document.xml', encoder.encode('<w:document>你好</w:document>')],
      ['[Content_Types].xml', encoder.encode('<?xml version="1.0"?><Types/>')],
      ['word/media/image1.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])],
    ])
    const zip = writeZip(files)
    // CRC32 已知值验证（'123456789' → 0xCBF43926）
    assert.equal(crc32(encoder.encode('123456789')), 0xcbf43926)
    const back = await readZip(zip)
    assert.equal(back.size, 3)
    assert.equal(decoder.decode(back.get('word/document.xml')), '<w:document>你好</w:document>')
    assert.equal(back.get('word/media/image1.png')![0], 0x89)
    // 中文文件名
    const zip2 = writeZip(new Map([['测试/文件.txt', encoder.encode('ok')]]))
    const back2 = await readZip(zip2)
    assert.equal(back2.get('测试/文件.txt')![0], 0x6f)
  })

  test('readZip：deflate 压缩路径（真实 docx——method 8 + DecompressionStream）', async () => {
    const zlib = await import('node:zlib')
    // 手工构造 deflate 压缩的 ZIP（writeZip 是 store——这里验证 method 8 解压）
    const name = 'word/document.xml'
    const nameBytes = encoder.encode(name)
    const xml = '<w:document>压缩内容测试</w:document>'
    const data = zlib.deflateRawSync(encoder.encode(xml))
    const crc = crc32(encoder.encode(xml))
    const hdr = new Uint8Array(30)
    const dv = new DataView(hdr.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 8, true) // method 8
    dv.setUint32(14, crc, true)
    dv.setUint32(18, data.length, true)
    dv.setUint32(22, encoder.encode(xml).length, true)
    dv.setUint16(26, nameBytes.length, true)
    const local = concatU8(hdr, nameBytes, data)
    const chdr = new Uint8Array(46)
    const cdv = new DataView(chdr.buffer)
    cdv.setUint32(0, 0x02014b50, true)
    cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true); cdv.setUint16(8, 0, true)
    cdv.setUint16(10, 8, true) // method: deflate
    cdv.setUint32(16, crc, true)
    cdv.setUint32(20, data.length, true)
    cdv.setUint32(24, encoder.encode(xml).length, true)
    cdv.setUint16(28, nameBytes.length, true)
    cdv.setUint32(42, 0, true)
    const central = concatU8(chdr, nameBytes)
    const eocd = new Uint8Array(22)
    const edv = new DataView(eocd.buffer)
    edv.setUint32(0, 0x06054b50, true)
    edv.setUint16(8, 1, true); edv.setUint16(10, 1, true)
    edv.setUint32(12, central.length, true)
    edv.setUint32(16, local.length, true)
    const zip = concatU8(local, central, eocd)
    const back = await readZip(zip)
    assert.equal(decoder.decode(back.get('word/document.xml')), xml, 'deflate 解压正确')
  })

  test('readZip：损坏输入抛错（诚实——非静默）', async () => {
    await assert.rejects(() => readZip(new Uint8Array([1, 2, 3])), /EOCD/)
  })

  test('parseXml：元素树 + 属性 + 文本 + 自闭合 + 指令', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="ns"><w:p><w:r><w:t xml:space="preserve">你好&amp;世界</w:t></w:r></w:p><w:empty/></w:document>`
    const root = parseXml(xml)
    assert.equal(root.name, 'w:document')
    assert.equal(root.attrs['xmlns:w'], 'ns')
    const p = root.children.find((c) => c.name === 'w:p')!
    const t = p.children.find((c) => c.name === 'w:r')!.children.find((c) => c.name === 'w:t')!
    assert.equal(t.text, '你好&世界')
    assert.equal(root.children.some((c) => c.name === 'w:empty'), true)
  })
})

describe('office/docx（docx ↔ ODES DocState——参考 office2json 算法）', () => {
  test('往返：文本 + 标题 + 对齐 + 粗斜体 marks', async () => {
    const doc: DocState = {
      text: '标题行\n正文开始，这里**粗体**测试\n',
      blockProps: [
        { start: 0, kind: 'h1' },
        { start: 4, kind: 'p', align: 'center' },
      ],
      marks: [{ start: 13, end: 15, type: 'b' }],
      embeds: [],
    }
    const exp = docToDocx(doc)
    const imp = await docxToDoc(exp.data)
    assert.equal(imp.doc.text, doc.text, '文本往返')
    assert.deepEqual(imp.doc.blockProps, doc.blockProps, '块属性往返')
    assert.deepEqual(imp.doc.marks, doc.marks, 'marks 往返')
    assert.equal(imp.warnings.length, 0)
  })

  test('往返：表格 embed（w:tbl ↔ 表格 html 快照）', async () => {
    const doc: DocState = {
      text: `表前文字\n${EMBED_CHAR}\n表后\n`,
      blockProps: [],
      marks: [],
      embeds: [{
        id: 't1', at: 5, type: 'table',
        html: '<table class="wf-editor-table"><tbody><tr><td>功能</td><td>状态</td></tr><tr><td>预览</td><td>✅</td></tr></tbody></table>',
      }],
    }
    const exp = docToDocx(doc)
    const imp = await docxToDoc(exp.data)
    assert.equal(imp.doc.embeds.length, 1, '表格 embed 往返')
    const tbl = imp.doc.embeds[0]
    assert.equal(tbl.type, 'table')
    assert.ok(tbl.html.includes('<td>功能</td>'), '单元格内容保留')
    assert.ok(tbl.html.includes('<td>✅</td>'))
    assert.ok(!imp.doc.text.includes('功能'), '表格文本不泄漏到正文')
  })

  test('往返：图片 embed（data url → media → w:drawing → data url）', async () => {
    // 1x1 png
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    const doc: DocState = {
      text: `图：${EMBED_CHAR}\n`,
      blockProps: [],
      marks: [],
      embeds: [{
        id: 'i1', at: 2, type: 'img',
        html: `<img src="data:image/png;base64,${png.toString('base64')}" alt="">`,
      }],
    }
    const exp = docToDocx(doc)
    const zip = await readZip(exp.data)
    assert.ok(zip.has('word/media/image1.png'), 'media 文件写入')
    const imp = await docxToDoc(exp.data)
    assert.equal(imp.doc.embeds.length, 1)
    const img = imp.doc.embeds[0]
    assert.ok(img.html.includes('data:image/png;base64,'), '图片 data url 往返')
    assert.ok(!img.html.includes('http'), '无外部 url')
  })

  test('往返：pre 代码块 → 每行一段（格式裁剪——文本保留）', async () => {
    const doc: DocState = {
      text: `${EMBED_CHAR}\n`,
      blockProps: [],
      marks: [],
      embeds: [{
        id: 'p1', at: 0, type: 'pre',
        html: '<pre class="wf-editor-pre">const a = 1\nconst b = 2</pre>',
      }],
    }
    const exp = docToDocx(doc)
    const imp = await docxToDoc(exp.data)
    assert.ok(imp.doc.text.includes('const a = 1'), 'pre 文本保留')
    assert.ok(imp.doc.text.includes('const b = 2'))
  })

  test('导入：样式名/对齐映射 + 空段落 + 裁剪 warning', async () => {
    // 手工构造 document.xml（真实 docx 读取在 office2json 样本验证——见下）
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>一级标题</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>居中粗斜</w:t></w:r></w:p>` +
      `<w:p/>` +
      `<w:sectPr/>` +
      `</w:body></w:document>`
    const files = new Map([
      ['word/document.xml', encoder.encode(xml)],
      ['[Content_Types].xml', encoder.encode('<?xml version="1.0"?><Types/>')],
    ])
    const zip = writeZip(files)
    const imp = await docxToDoc(zip)
    assert.equal(imp.doc.text, '一级标题\n居中粗斜\n\n', '段落文本 + 空段落')
    assert.deepEqual(imp.doc.blockProps, [
      { start: 0, kind: 'h1' },
      { start: 5, kind: 'p', align: 'center' },
    ])
    assert.equal(imp.doc.marks.length, 2, '粗斜 marks')
  })

  test('导出格式：document.xml 可被自研解析器解析（OOXML 规整）', async () => {
    const doc: DocState = {
      text: '第一段\n第二段\n',
      blockProps: [{ start: 4, kind: 'p', align: 'right' }],
      marks: [{ start: 4, end: 6, type: 'u' }],
      embeds: [],
    }
    const exp = docToDocx(doc)
    const zip = await readZip(exp.data)
    const xml = decoder.decode(zip.get('word/document.xml')!)
    const root = parseXml(xml)
    assert.equal(root.name, 'w:document')
    const body = root.children.find((c) => c.name === 'w:body')!
    const ps = body.children.filter((c) => c.name === 'w:p')
    assert.equal(ps.length, 2)
    const p2 = ps[1]
    assert.ok(p2.children.some((c) => c.name === 'w:pPr' && c.children.some((j) => j.name === 'w:jc')), '对齐保留')
    const t = ps[1].children.filter((c) => c.name === 'w:r')
    assert.ok(t.some((r) => r.children.some((x) => x.name === 'w:rPr')), 'u mark 保留')
  })
})
