/**
 * weifuwu/office/docx — docx ↔ ODES DocState 双向转换（前端/服务端通用——零依赖）
 *
 * 参考算法：office2json（unzip → XML 树 → 路径提取 w:body → w:p → w:r → w:t），
 * 增强提取到 ODES IR（）：
 * - 段落属性：pStyle → h1/h2/h3、jc → 对齐（裁剪：样式名映射子集）
 * - 内联格式：rPr b/i/u → marks（区间）
 * - 表格：w:tbl → Editor 表格 embed 快照（HTML 复用现有模型）
 * - 图片：w:drawing r:embed → rels → media → data url → img embed
 *
 * 导出（DocState → minimal docx）：VNode 组件化（OOXML 也是 VNode——与前端
 * "VNode → DOM"同构）→ vnodeToXml → store ZIP。块级 embed（pre/hr）打断段落。
 *
 * 前端可用（无需后端）：ZIP 解压走 DecompressionStream（浏览器/Node 18+）；
 * base64 跨环境（Buffer 守卫/atob）。诚实裁剪：分节/页眉页脚/域代码/批注
 * 不导入；http 图片导出裁剪（warning）。
 */

import { readZip, writeZip } from './zip.ts'
import { allText, child, children, parseXml } from './xml.ts'
import { vnodeToXml } from './xml-serialize.ts'
import { h } from '../vdom/index.ts'
import type { VNode, VNodeChild } from '../vdom/index.ts'
import type { DocState, EmbedSpan } from '../components/Editor/model/types.ts'
import { EMBED_CHAR } from '../components/Editor/model/types.ts'

// ── 共享工具 ────────────────────────────────────────────────────────────────

const escHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** base64 → Uint8Array（跨环境——浏览器 atob / Node Buffer） */
export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'))
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Uint8Array → base64（跨环境） */
export function bytesToBase64(u8: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64')
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
  return btoa(bin)
}

/** 样式名 → 块类型（裁剪：仅常见映射；未知样式 → 段落） */
const STYLE_TO_KIND: Record<string, 'h1' | 'h2' | 'h3'> = {
  Heading1: 'h1', Heading2: 'h2', Heading3: 'h3',
  heading1: 'h1', heading2: 'h2', heading3: 'h3',
  title: 'h1', Title: 'h1',
}

/** 对齐映射 */
const JC_TO_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  center: 'center', right: 'right', left: 'left', both: 'left', distribute: 'left',
}

// ── 导入：docx → DocState ──────────────────────────────────────────────────

export interface DocxImportResult {
  doc: DocState
  /** 裁剪提示（不可映射内容——诚实不静默） */
  warnings: string[]
}

export async function docxToDoc(u8: Uint8Array): Promise<DocxImportResult> {
  const files = await readZip(u8)
  const warnings: string[] = []
  const documentXml = files.get('word/document.xml')
  if (!documentXml) throw new Error('docx: 缺少 word/document.xml（非 docx？）')

  // rels：rId → media 路径
  const mediaByRid = new Map<string, string>()
  const relsXml = files.get('word/_rels/document.xml.rels')
  if (relsXml) {
    const rels = parseXml(new TextDecoder().decode(relsXml))
    for (const rel of children(rels, 'Relationship')) {
      const target = rel.attrs.Target ?? ''
      if (target.startsWith('media/')) mediaByRid.set(rel.attrs.Id ?? '', `word/${target}`)
    }
  }

  const root = parseXml(new TextDecoder().decode(documentXml))
  const body = child(root, 'w:body')
  if (!body) throw new Error('docx: 缺少 w:body')

  // ── 段落与表格流 → text + blockProps + marks + embeds ──
  let text = ''
  const blockProps: DocState['blockProps'] = []
  const marks: DocState['marks'] = []
  const embeds: EmbedSpan[] = []
  let embedSeq = 0

  const pushText = (s: string): void => { text += s }

  for (const el of body.children) {
    if (el.name === 'w:p') {
      // 段落属性
      let kind: DocState['blockProps'][number]['kind'] | null = null
      let align: 'left' | 'center' | 'right' | undefined
      const pPr = child(el, 'w:pPr')
      if (pPr) {
        const pStyle = child(pPr, 'w:pStyle')
        if (pStyle?.attrs['w:val'] && STYLE_TO_KIND[pStyle.attrs['w:val']]) {
          kind = STYLE_TO_KIND[pStyle.attrs['w:val']]
        }
        const jc = child(pPr, 'w:jc')
        if (jc?.attrs['w:val'] && JC_TO_ALIGN[jc.attrs['w:val']]) {
          align = JC_TO_ALIGN[jc.attrs['w:val']]
        }
      }
      const start = text.length
      // runs：文本 + 格式 + 图片 + 段内表格（ODES embed 语义——占位符在段内）
      for (const childEl of el.children) {
        if (childEl.name === 'w:r') {
          const r = childEl
          const rPr = child(r, 'w:rPr')
          const b = !!rPr && !!child(rPr, 'w:b')
          const i = !!rPr && !!child(rPr, 'w:i')
          const u = !!rPr && !!child(rPr, 'w:u')
          if (children(r, 'w:br').length > 0) {
            pushText('\n') // 段内换行 → 段落分隔（ODES 语义——诚实裁剪）
          }
          const tEl = child(r, 'w:t')
          if (tEl) {
            const t = allText(tEl)
            pushText(t)
            if (b) marks.push({ start: text.length - t.length, end: text.length, type: 'b' })
            if (i) marks.push({ start: text.length - t.length, end: text.length, type: 'i' })
            if (u) marks.push({ start: text.length - t.length, end: text.length, type: 'u' })
          }
          // 图片（w:drawing / w:pict）
          const drawing = child(r, 'w:drawing') ?? child(r, 'w:pict')
          if (drawing) {
            const embedId = findEmbedId(drawing)
            const mediaPath = embedId ? mediaByRid.get(embedId) : undefined
            if (mediaPath && files.has(mediaPath)) {
              const data = files.get(mediaPath)!
              const mime = dataUrlMime(mediaPath)
              const html = `<img src="data:${mime};base64,${bytesToBase64(data)}" alt="">`
              embeds.push({ id: `d${embedSeq++}`, at: text.length, type: 'img', html })
              pushText(EMBED_CHAR)
            } else {
              warnings.push(`图片 r:embed=${embedId ?? '?'} 未找到（裁剪：外部图片不支持）`)
            }
          }
        } else if (childEl.name === 'w:tbl') {
          // 段内表格（导出路径生成）→ 表格 embed
          const html = tblToHtml(childEl)
          embeds.push({ id: `d${embedSeq++}`, at: text.length, type: 'table', html })
          pushText(EMBED_CHAR)
        }
      }
      // 段落结束
      pushText('\n')
      if (kind || align) {
        const bp: DocState['blockProps'][number] = { start, kind: kind ?? 'p' }
        if (align) bp.align = align
        blockProps.push(bp)
      }
    } else if (el.name === 'w:tbl') {
      const html = tblToHtml(el)
      embeds.push({ id: `d${embedSeq++}`, at: text.length, type: 'table', html })
      pushText(EMBED_CHAR)
      pushText('\n')
    } else if (el.name === 'w:sectPr') {
      // 节属性（导出路径自带 pgSz/pgMar——正文语义保留；复杂分节裁剪不提示）
    }
  }

  return {
    doc: { text, blockProps, marks, embeds },
    warnings,
  }
}

function findEmbedId(drawing: XmlNodeLike): string | null {
  const walk = (n: XmlNodeLike): string | null => {
    if (n.attrs?.['r:embed']) return n.attrs['r:embed']
    for (const c of n.children ?? []) {
      const found = walk(c)
      if (found) return found
    }
    return null
  }
  return walk(drawing)
}

interface XmlNodeLike {
  name?: string
  attrs?: Record<string, string>
  children?: XmlNodeLike[]
  text?: string
}

function dataUrlMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const m: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }
  return m[ext] ?? 'image/png'
}

/** w:tbl → Editor 表格 embed html */
function tblToHtml(tbl: XmlNodeLike): string {
  const rows = (tbl.children ?? []).filter((c) => c.name === 'w:tr')
  if (rows.length === 0) return '<table class="wf-editor-table"><tbody></tbody></table>'
  let out = '<table class="wf-editor-table"><tbody>'
  for (const tr of rows) {
    out += '<tr>'
    for (const tc of (tr.children ?? []).filter((c) => c.name === 'w:tc')) {
      const cellText = (tc.children ?? []).filter((c) => c.name === 'w:p')
        .map((p) => (p.children ?? []).filter((c) => c.name === 'w:r')
          .map((r) => (r.children ?? []).filter((c) => c.name === 'w:t').map((t) => allText2(t)).join(''))
          .join('')).join('')
      out += `<td>${escHtml(cellText)}</td>`
    }
    out += '</tr>'
  }
  out += '</tbody></table>'
  return out
}

function allText2(n: XmlNodeLike): string {
  if (!n.children || n.children.length === 0) return n.text ?? ''
  let out = n.text ?? ''
  for (const c of n.children) out += allText2(c)
  return out
}

// ── 导出：DocState → docx ──────────────────────────────────────────────────

export interface DocxExportResult {
  data: Uint8Array
  warnings: string[]
}

export function docToDocx(doc: DocState): DocxExportResult {
  const warnings: string[] = []
  const media = new Map<string, Uint8Array>()
  const rels: VNode[] = []

  // OOXML 也是 VNode——声明式描述（与前端 VNode → DOM 同构）
  const documentVNode = h('w:document',
    {
      'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'xmlns:wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'xmlns:pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    }, h('w:body', {},
      buildBody(doc, media, rels, warnings),
      h('w:sectPr', {},
        h('w:pgSz', { 'w:w': 11906, 'w:h': 16838 }),
        h('w:pgMar', { 'w:top': 1440, 'w:right': 1440, 'w:bottom': 1440, 'w:left': 1440 }),
      ),
    ),
  )
  const documentXml = vnodeToXml(documentVNode)

  const relsXml = vnodeToXml(h('Relationships',
    { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
    h('Relationship', {
      Id: 'rId1',
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
      Target: 'styles.xml',
    }),
    ...rels,
  ))

  const stylesXml = vnodeToXml(h('w:styles',
    { 'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' },
    h('w:docDefaults', {}, h('w:rPrDefault', {}, h('w:rPr', {}, h('w:sz', { 'w:val': 22 })))),
    h('w:style', { 'w:type': 'paragraph', 'w:default': '1', 'w:styleId': 'Normal' }, h('w:name', { 'w:val': 'Normal' })),
    h('w:style', { 'w:type': 'paragraph', 'w:styleId': 'Heading1' },
      h('w:name', { 'w:val': 'heading 1' }), h('w:basedOn', { 'w:val': 'Normal' }),
      h('w:rPr', {}, h('w:b'), h('w:sz', { 'w:val': 36 }))),
    h('w:style', { 'w:type': 'paragraph', 'w:styleId': 'Heading2' },
      h('w:name', { 'w:val': 'heading 2' }), h('w:basedOn', { 'w:val': 'Normal' }),
      h('w:rPr', {}, h('w:b'), h('w:sz', { 'w:val': 28 }))),
    h('w:style', { 'w:type': 'paragraph', 'w:styleId': 'Heading3' },
      h('w:name', { 'w:val': 'heading 3' }), h('w:basedOn', { 'w:val': 'Normal' }),
      h('w:rPr', {}, h('w:b'), h('w:sz', { 'w:val': 24 }))),
  ))

  const contentTypes = vnodeToXml(h('Types',
    { xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types' },
    h('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }),
    h('Default', { Extension: 'xml', ContentType: 'application/xml' }),
    h('Default', { Extension: 'png', ContentType: 'image/png' }),
    h('Default', { Extension: 'jpeg', ContentType: 'image/jpeg' }),
    h('Override', { PartName: '/word/document.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' }),
    h('Override', { PartName: '/word/styles.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml' }),
  ))

  const rootRels = vnodeToXml(h('Relationships',
    { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
    h('Relationship', {
      Id: 'rId1',
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
      Target: 'word/document.xml',
    }),
  ))

  const encoder = new TextEncoder()
  const files = new Map<string, Uint8Array>([
    ['[Content_Types].xml', encoder.encode(contentTypes)],
    ['_rels/.rels', encoder.encode(rootRels)],
    ['word/document.xml', encoder.encode(documentXml)],
    ['word/_rels/document.xml.rels', encoder.encode(relsXml)],
    ['word/styles.xml', encoder.encode(stylesXml)],
  ])
  for (const [path, data] of media) files.set(path, data)

  return { data: writeZip(files), warnings }
}

function buildBody(
  doc: DocState,
  media: Map<string, Uint8Array>,
  rels: VNode[],
  warnings: string[],
): VNode[] {
  const out: VNode[] = []

  const kindAt = (pos: number): { kind: string; align?: string } | null => {
    const bp = doc.blockProps.find((b) => b.start === pos)
    if (!bp) return null
    return { kind: bp.kind === 'p' ? '' : bp.kind === 'h1' ? 'Heading1' : bp.kind === 'h2' ? 'Heading2' : 'Heading3', align: bp.align }
  }

  const paraRuns = (start: number, end: number): VNode[] => {
    const runs: VNode[] = []
    const marks = doc.marks
      .filter((m) => m.start >= start && m.end <= end && (m.start < m.end))
      .sort((a, b) => a.start - b.start || a.end - b.end)
    let cur = start
    const segs: Array<{ from: number; to: number; ms: typeof marks }> = []
    for (const m of marks) {
      if (m.start > cur) segs.push({ from: cur, to: Math.min(m.start, end), ms: [] })
      cur = Math.max(cur, m.start)
      if (m.end <= end) { segs.push({ from: m.start, to: m.end, ms: [m] }); cur = m.end }
    }
    if (cur < end) segs.push({ from: cur, to: end, ms: [] })
    for (const seg of segs) {
      const txt = doc.text.slice(seg.from, seg.to)
      if (!txt) continue
      const rPr: VNodeChild[] = []
      for (const m of seg.ms) {
        if (m.type === 'b') rPr.push(h('w:b'))
        else if (m.type === 'i') rPr.push(h('w:i'))
        else if (m.type === 'u') rPr.push(h('w:u'))
        else if (m.type === 'link') { rPr.push(h('w:u'), h('w:color', { 'w:val': '0563C1' })) }
      }
      runs.push(rPr.length > 0
        ? h('w:r', {}, h('w:rPr', {}, ...rPr), h('w:t', { 'xml:space': 'preserve' }, txt))
        : h('w:r', {}, h('w:t', { 'xml:space': 'preserve' }, txt)))
    }
    return runs
  }

  const para = (start: number, end: number, hasEmbeds: VNode[]): VNode => {
    const style = kindAt(start)
    const pPr: VNodeChild[] = []
    if (style) {
      if (style.kind) pPr.push(h('w:pStyle', { 'w:val': style.kind }))
      if (style.align) pPr.push(h('w:jc', { 'w:val': style.align }))
    }
    const runs = [...paraRuns(start, end), ...hasEmbeds]
    return pPr.length > 0 ? h('w:p', {}, h('w:pPr', {}, ...pPr), ...runs) : h('w:p', {}, ...runs)
  }

  // 扫描：段起点 → 段内 items（embed vnode——文本由 para 内部生成）
  let segStart = 0
  const items: Array<{ at: number; kind: 'inline' | 'block'; vnode: VNode }> = []
  const segEndRef = { current: 0 }
  const pushSeg = (): void => {
    if (items.length === 0) {
      if (segStart < segEndRef.current) out.push(para(segStart, segEndRef.current, []))
      else out.push(para(segStart, segStart, []))
      return
    }
    let pendingStart = segStart
    let inline: VNode[] = []
    for (const it of items) {
      if (it.kind === 'block') {
        out.push(para(pendingStart, it.at, inline))
        inline = []
        out.push(it.vnode)
        pendingStart = it.at + 1
      } else {
        inline.push(it.vnode)
      }
    }
    out.push(para(pendingStart, segEndRef.current, inline))
  }

  const embeds = [...doc.embeds].sort((a, b) => a.at - b.at)
  let ei = 0
  for (;;) {
    const nl = doc.text.indexOf('\n', segStart)
    const segEnd = nl < 0 ? doc.text.length : nl
    segEndRef.current = segEnd
    items.length = 0
    while (ei < embeds.length && embeds[ei].at < segEnd) {
      const e = embeds[ei]
      const v = embedVNode(e, media, rels, warnings)
      if (v) items.push({ at: e.at, kind: e.type === 'pre' || e.type === 'hr' ? 'block' : 'inline', vnode: v })
      ei++
    }
    pushSeg()
    if (nl < 0) break
    segStart = segEnd + 1
    // 尾部空段（text 以 \n 结尾）不输出——ODES 语义 1 段 = 1 个 w:p
    if (segStart >= doc.text.length) break
  }
  return out
}

function embedVNode(
  e: EmbedSpan,
  media: Map<string, Uint8Array>,
  rels: VNode[],
  warnings: string[],
): VNode {
  if (e.type === 'img') {
    const m = /src="data:([^;]+);base64,([^"]+)"/.exec(e.html)
    if (m) {
      const idx = media.size + 1
      const rid = `rIdImg${idx + 1}`
      const ext = m[1].includes('png') ? 'png' : m[1].includes('jpeg') || m[1].includes('jpg') ? 'jpeg' : 'png'
      const path = `word/media/image${idx}.${ext}`
      media.set(path, base64ToBytes(m[2]))
      rels.push(h('Relationship', {
        Id: rid,
        Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
        Target: `media/image${idx}.${ext}`,
      }))
      return h('w:r', {}, h('w:drawing', {}, h('wp:inline', { distT: 0, distB: 0, distL: 0, distR: 0 },
        h('wp:extent', { cx: 1371600, cy: 1371600 }),
        h('wp:docPr', { id: idx, name: `image${idx}` }),
        h('a:graphic', {}, h('a:graphicData', { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
          h('pic:pic', {},
            h('pic:nvPicPr', {},
              h('pic:cNvPr', { id: idx, name: `image${idx}` }),
              h('pic:cNvPicPr'),
            ),
            h('pic:blipFill', {},
              h('a:blip', { 'r:embed': rid }),
              h('a:stretch', {}, h('a:fillRect')),
            ),
            h('pic:spPr', {},
              h('a:xfrm', {}, h('a:off', { x: 0, y: 0 }), h('a:ext', { cx: 1371600, cy: 1371600 })),
              h('a:prstGeom', { prst: 'rect' }, h('a:avLst')),
            ),
          ),
        )),
      )))
    }
    warnings.push('图片 embed 非 data url——导出裁剪（http 图片需服务端下载）')
    return h('w:p')
  }
  if (e.type === 'table') return tblEmbedVNode(e)
  if (e.type === 'hr') {
    return h('w:p', {}, h('w:pPr', {}, h('w:pBdr', {}, h('w:bottom', { 'w:val': 'single', 'w:sz': 6 }))))
  }
  if (e.type === 'pre') {
    // pre embed → 段内 runs + w:br 换行（w:p 嵌套不合法——诚实；等宽格式裁剪）
    const text = preText(e.html)
    const lines = text.split('\n')
    const runs: VNode[] = []
    lines.forEach((l, i) => {
      if (i > 0) runs.push(h('w:r', { key: `br${i}` }, h('w:br')))
      runs.push(h('w:r', { key: `l${i}` }, h('w:t', { 'xml:space': 'preserve' }, l)))
    })
    return h('w:p', { key: 'pre' }, ...runs)
  }
  warnings.push(`embed 类型 ${e.type} 导出裁剪`)
  return h('w:p')
}

function preText(html: string): string {
  const m = /<pre[^>]*>([\s\S]*)<\/pre>/.exec(html)
  return m ? m[1].replace(/<[^>]+>/g, '') : ''
}

/** 表格 embed html → w:tbl VNode（Editor 生成的规整 HTML——xml 解析器兼容） */
function tblEmbedVNode(e: EmbedSpan): VNode {
  try {
    const root = parseXml(e.html)
    const tbody = child(root, 'tbody') ?? root
    return h('w:tbl', {},
      h('w:tblPr', {}, h('w:tblW', { 'w:w': 0, 'w:type': 'auto' })),
      ...children(tbody, 'tr').map((tr, ri) =>
        h('w:tr', { key: `r${ri}` },
          ...children(tr, 'td').map((tc, ci) =>
            h('w:tc', { key: `c${ci}` },
              h('w:tcPr', {}, h('w:tcW', { 'w:w': 0, 'w:type': 'auto' })),
              h('w:p', {}, h('w:r', {}, h('w:t', { 'xml:space': 'preserve' }, allText(tc)))),
            ),
          ),
        ),
      ),
    )
  } catch {
    return h('w:p', {}, h('w:r', {}, h('w:t', {}, '[表格（导出裁剪——格式无法解析）]')))
  }
}
