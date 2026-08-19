/**
 * weifuwu/office/pptx — pptx ↔ ODES DeckState 双向转换（前端/服务端通用——零依赖）
 *
 * 参考算法：office2json（ppt/slides/slideN.xml → p:sld → p:cSld → p:spTree →
 * p:sp → p:txBody → a:p → a:r → a:t），增强提取到 ODES IR：
 * - 多幻灯片：slideN.xml 全量（office2json 只取文本——ODES 保留结构）
 * - shape 几何：p:xfrm（a:off x/y + a:ext cx/cy——EMU → px：/9525）
 * - shape 类型：p:sp（文本/图形——p:prstGeom prst）/ p:pic（图片）
 * - 文本：txBody → 段落拼接（a:br 换行）
 *
 * 导出（DeckState → minimal pptx）：slideN.xml（spTree 结构）+ presentation.xml
 * + rels + contentTypes——store ZIP（VNode 组件化）。裁剪：动画/母版/备注/主题。
 */

import { readZip, writeZip } from './zip.ts'
import { allText, child, children, parseXml } from './xml.ts'
import { vnodeToXml } from './xml-serialize.ts'
import { h } from '../vdom/index.ts'
import type { VNode } from '../vdom/index.ts'
import type { DeckState, ShapeKind, SlideShape } from '../components/OfficeEditor/model/types.ts'

const EMU_PER_PX = 9525 // EMU → px（96dpi：914400/inch ÷ 96）

// ── 读：pptx → DeckState ────────────────────────────────────────────────────

export interface PptxImportResult {
  deck: DeckState
  warnings: string[]
}

export async function pptxToDeck(u8: Uint8Array): Promise<PptxImportResult> {
  const files = await readZip(u8)
  const warnings: string[] = []
  const decoder = new TextDecoder()

  // slideN.xml 全部（正则匹配 ppt/slides/slideN.xml）
  const slideKeys = [...files.keys()]
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => {
      const na = Number(/slide(\d+)/.exec(a)?.[1] ?? 0)
      const nb = Number(/slide(\d+)/.exec(b)?.[1] ?? 0)
      return na - nb
    })

  const slides: DeckState['slides'] = []
  for (const key of slideKeys) {
    const root = parseXml(decoder.decode(files.get(key)!))
    const sld = root.name === 'p:sld' ? root : child(root, 'p:sld')
    const cSld = sld ? child(sld, 'p:cSld') : null
    const spTree = cSld ? child(cSld, 'p:spTree') : null
    const _cSld = cSld ?? null
    const shapes: SlideShape[] = []
    if (spTree) {
      // p:sp（文本/图形）+ p:pic（图片）
      for (const sp of children(spTree, 'p:sp')) {
        const shape = spToShape(sp)
        if (shape) shapes.push(shape)
      }
      for (const pic of children(spTree, 'p:pic')) {
        const shape = picToShape(pic)
        if (shape) shapes.push(shape)
      }
    } else {
      warnings.push(`${key} 缺少 spTree（裁剪：空幻灯片）`)
    }
    slides.push({ shapes, layout: undefined })
  }
  if (slides.length === 0) throw new Error('pptx: 无幻灯片（非 pptx？）')

  return {
    deck: { slides, activeSlide: 0, size: { w: 960, h: 540 } },
    warnings,
  }
}

function xfrmOf(n: any): { x: number; y: number; w: number; h: number } | null {
  const spPr = child(n, 'p:spPr')
  const xfrm = child(n, 'p:xfrm') ?? child(n, 'a:xfrm') ?? (spPr ? child(spPr, 'a:xfrm') : null)
  if (!xfrm) return null
  const off = child(xfrm, 'a:off')
  const ext = child(xfrm, 'a:ext')
  return {
    x: off ? Math.round(Number(off.attrs.x ?? 0) / EMU_PER_PX) : 0,
    y: off ? Math.round(Number(off.attrs.y ?? 0) / EMU_PER_PX) : 0,
    w: ext ? Math.round(Number(ext.attrs.cx ?? 0) / EMU_PER_PX) : 100,
    h: ext ? Math.round(Number(ext.attrs.cy ?? 0) / EMU_PER_PX) : 40,
  }
}

function spToShape(sp: any): SlideShape | null {
  const geo = xfrmOf(sp)
  if (!geo) return null
  const nvSpPr = child(sp, 'p:nvSpPr')
  const id = nvSpPr ? child(nvSpPr, 'p:cNvPr')?.attrs.id ?? 'sp' : 'sp'
  // 类型：prstGeom（rect/line 等）
  let kind: ShapeKind = 'text'
  const spPr = child(sp, 'p:spPr')
  const prstGeom = spPr ? child(spPr, 'a:prstGeom') : null
  const prst = prstGeom?.attrs.prst
  if (prst === 'line') kind = 'line'
  else if (prst) kind = 'rect' // 有几何（rect/椭圆/三角…）→ 图形；无几何 = 文本
  // 文本
  const txBody = child(sp, 'p:txBody')
  let text = ''
  if (txBody) {
    text = children(txBody, 'a:p').map((p) => allText(p)).join('\n').trim()
  }
  return {
    id: String(id), kind,
    ...geo,
    props: text ? { text } : undefined,
  }
}

function picToShape(pic: any): SlideShape | null {
  const geo = xfrmOf(pic)
  if (!geo) return null
  const nvPicPr = child(pic, 'p:nvPicPr')
  const id = nvPicPr ? child(nvPicPr, 'p:cNvPr')?.attrs.id ?? 'pic' : 'pic'
  return { id: String(id), kind: 'image', ...geo, props: { imageUrl: '#' } }
}

// ── 写：DeckState → pptx ───────────────────────────────────────────────────

export interface PptxExportResult {
  data: Uint8Array
  warnings: string[]
}

export function deckToPptx(deck: DeckState): PptxExportResult {
  const warnings: string[] = []
  const slideParts: Array<{ path: string; xml: string }> = []
  const slideRels: VNode[] = []
  const slideIds: VNode[] = []
  const slideCount = Math.max(1, deck.slides.length)

  deck.slides.forEach((slide, si) => {
    const shapesVNode: VNode[] = []
    slide.shapes.forEach((shape, i) => {
      const id = 2 + i
      const x = Math.round(shape.x * EMU_PER_PX)
      const y = Math.round(shape.y * EMU_PER_PX)
      const wPx = Math.round(shape.w * EMU_PER_PX)
      const hPx = Math.round(shape.h * EMU_PER_PX)
      if (shape.kind === 'image') {
        // 图片：占位矩形（图片二进制导出裁剪——诚实 warning）
        warnings.push(`shape ${shape.id} 图片导出裁剪（v1 无媒体二进制）`)
        shapesVNode.push(h('p:pic', { key: `pic${i}` },
          h('p:nvPicPr', {},
            h('p:cNvPr', { id, name: `pic${i}` }),
            h('p:cNvPicPr'),
          ),
          h('p:blipFill', {}, h('a:blip', { 'r:embed': 'rIdPlaceholder' })),
          h('p:spPr', {}, xfrmVNode(x, y, wPx, hPx)),
        ))
        return
      }
      // 几何：line → line；rect/图形 → rect；text → 不写 prstGeom（导入据此区分）
      const prst = shape.kind === 'line' ? 'line' : shape.kind === 'rect' ? 'rect' : null
      const txBody = shape.props?.text
        ? h('p:txBody', {},
          ...shape.props.text.split('\n').map((line, li) =>
            h('a:p', { key: `p${li}` }, h('a:r', {}, h('a:t', {}, line)))),
        )
        : null
      shapesVNode.push(h('p:sp', { key: `sp${i}` },
        h('p:nvSpPr', {},
          h('p:cNvPr', { id, name: `shape${i}` }),
          h('p:cNvSpPr'),
        ),
        h('p:spPr', {},
          xfrmVNode(x, y, wPx, hPx),
          ...(prst ? [h('a:prstGeom', { prst }, h('a:avLst'))] : []),
        ),
        ...(txBody ? [txBody] : []),
      ))
    })
    const slideVNode = h('p:sld',
      {
        xmlns: 'http://schemas.openxmlformats.org/presentationml/2006/main',
        'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      },
      h('p:cSld', {}, h('p:spTree', {},
        h('p:nvGrpSpPr', {},
          h('p:cNvPr', { id: 1, name: '' }),
          h('p:cNvGrpSpPr'),
          h('p:nvPr'),
        ),
        h('p:grpSpPr', {}, xfrmVNode(0, 0, 9144000, 5143500)),
        ...shapesVNode,
      )),
    )
    slideParts.push({ path: `ppt/slides/slide${si + 1}.xml`, xml: vnodeToXml(slideVNode) })
    slideRels.push(h('Relationship', {
      Id: `rId${si + 1}`,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
      Target: `slides/slide${si + 1}.xml`,
    }))
    slideIds.push(h('p:sldId', { id: 256 + si, 'r:id': `rId${si + 1}` }))
  })

  const presentationVNode = h('p:presentation',
    {
      xmlns: 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    },
    h('p:sldIdLst', {}, ...slideIds),
    h('p:sldSz', { cx: 9144000, cy: 5143500 }),
    h('p:notesSz', { cx: 6858000, cy: 9144000 }),
  )

  const presRels = vnodeToXml(h('Relationships',
    { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
    ...slideRels,
  ))

  const rootRels = vnodeToXml(h('Relationships',
    { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
    h('Relationship', {
      Id: 'rId1',
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
      Target: 'ppt/presentation.xml',
    }),
  ))

  const contentTypes = vnodeToXml(h('Types',
    { xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types' },
    h('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }),
    h('Default', { Extension: 'xml', ContentType: 'application/xml' }),
    h('Override', { PartName: '/ppt/presentation.xml', ContentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml' }),
    ...deck.slides.map((_, i) => h('Override', {
      PartName: `/ppt/slides/slide${i + 1}.xml`,
      ContentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
    })),
  ))

  const encoder = new TextEncoder()
  const files = new Map<string, Uint8Array>([
    ['[Content_Types].xml', encoder.encode(contentTypes)],
    ['_rels/.rels', encoder.encode(rootRels)],
    ['ppt/presentation.xml', encoder.encode(vnodeToXml(presentationVNode))],
    ['ppt/_rels/presentation.xml.rels', encoder.encode(presRels)],
  ])
  for (const part of slideParts) files.set(part.path, encoder.encode(part.xml))

  return { data: writeZip(files), warnings }
}

function xfrmVNode(x: number, y: number, wPx: number, hPx: number): VNode {
  return h('a:xfrm', {},
    h('a:off', { x, y }),
    h('a:ext', { cx: wPx, cy: hPx }),
  )
}
