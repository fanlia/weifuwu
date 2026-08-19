/**
 * weifuwu/office/xlsx — xlsx ↔ ODES WorkbookState 双向转换（前端/服务端通用——零依赖）
 *
 * 参考算法：office2json（sheet1.xml → sheetData → row → c{t,v} + sharedStrings），
 * 增强提取到 ODES IR（design/office-events-plan.md）：
 * - 多 sheet：workbook.xml（sheet 名 + rId）→ rels → 各 sheetN.xml
 * - 单元格引用：c@r（A1——office2json 丢弃——ODES 必须）
 * - 类型：c@t（s=shared/n=number/b=bool/f=formula）→ SheetCell.kind
 * - 公式：f 元素（公式字符串保留——不计算——服务端导出重算）
 * - 行高/列宽/样式索引：裁剪（v1——诚实：不读不写）
 *
 * 导出（WorkbookState → minimal xlsx）：共享字符串表去重 + sheetData XML +
 * store ZIP（VNode 组件化——OOXML 也是 VNode）。
 */

import { readZip, writeZip } from './zip.ts'
import { allText, child, children, parseXml } from './xml.ts'
import { vnodeToXml } from './xml-serialize.ts'
import { h } from '../vdom/index.ts'
import type { VNode } from '../vdom/index.ts'
import type { SheetCell, SheetState, WorkbookState } from '../components/OfficeEditor/model/types.ts'

// ── 读：xlsx → WorkbookState ────────────────────────────────────────────────

export interface XlsxImportResult {
  workbook: WorkbookState
  warnings: string[]
}

export async function xlsxToWorkbook(u8: Uint8Array): Promise<XlsxImportResult> {
  const files = await readZip(u8)
  const warnings: string[] = []
  const decoder = new TextDecoder()

  const workbookXml = files.get('xl/workbook.xml')
  if (!workbookXml) throw new Error('xlsx: 缺少 xl/workbook.xml（非 xlsx？）')
  const wbRoot = parseXml(decoder.decode(workbookXml))

  // sheet 列表：workbook.xml sheets → { name, rId }
  const sheetMeta: Array<{ name: string; rId: string }> = []
  const sheetsEl = child(wbRoot, 'sheets')
  if (sheetsEl) {
    for (const s of children(sheetsEl, 'sheet')) {
      sheetMeta.push({ name: s.attrs.name ?? `Sheet${sheetMeta.length + 1}`, rId: s.attrs['r:id'] ?? '' })
    }
  }

  // rels：rId → sheet 路径
  const pathByRid = new Map<string, string>()
  const relsXml = files.get('xl/_rels/workbook.xml.rels')
  if (relsXml) {
    const rels = parseXml(decoder.decode(relsXml))
    for (const rel of children(rels, 'Relationship')) {
      const target = rel.attrs.Target ?? ''
      if (target.startsWith('worksheets/')) pathByRid.set(rel.attrs.Id ?? '', `xl/${target}`)
    }
  }

  // sharedStrings：index → 文本
  const shared: string[] = []
  const ssXml = files.get('xl/sharedStrings.xml')
  if (ssXml) {
    const ss = parseXml(decoder.decode(ssXml))
    const sst = ss.name === 'sst' ? ss : child(ss, 'sst') // root 即 sst（无 document 包装）
    if (sst) {
      for (const si of children(sst, 'si')) {
        const ts = children(si, 't')
        shared.push(ts.length > 0 ? ts.map((t) => allText(t)).join('') : allText(si))
      }
    }
  }

  const sheets: SheetState[] = []
  for (let i = 0; i < sheetMeta.length; i++) {
    const meta = sheetMeta[i]
    const path = pathByRid.get(meta.rId) ?? `xl/worksheets/sheet${i + 1}.xml`
    const sheetXml = files.get(path)
    if (!sheetXml) { warnings.push(`sheet ${meta.name} 部件缺失（${path}）`); continue }
    const sheet = parseSheet(decoder.decode(sheetXml), shared, warnings)
    sheets.push({ ...sheet, name: meta.name })
  }
  if (sheets.length === 0) {
    // 兜底：sheet1 直接读
    const sheetXml = files.get('xl/worksheets/sheet1.xml')
    if (sheetXml) sheets.push({ ...parseSheet(decoder.decode(sheetXml), shared, warnings), name: 'Sheet1' })
    else throw new Error('xlsx: 无可用工作表')
  }

  return { workbook: { sheets, activeSheet: 0 }, warnings }
}

function parseSheet(xml: string, shared: string[], warnings: string[]): SheetState {
  const root = parseXml(xml)
  const sheetData = child(root, 'sheetData')
  const cells = new Map<string, SheetCell>()
  let cols = 1
  if (sheetData) {
    for (const row of children(sheetData, 'row')) {
      for (const c of children(row, 'c')) {
        const ref = (c.attrs.r ?? '').toUpperCase()
        const t = c.attrs.t
        const fEl = child(c, 'f')
        const vEl = child(c, 'v')
        const raw = vEl ? allText(vEl) : ''
        let cell: SheetCell
        if (fEl) {
          // 公式：公式字符串保留——值可缓存（v 存在时）
          cell = { kind: 'f', value: raw, formula: allText(fEl) }
        } else if (t === 's') {
          const idx = Number(raw)
          cell = { kind: 's', value: Number.isFinite(idx) && shared[idx] != null ? shared[idx] : raw }
        } else if (t === 'b') {
          cell = { kind: 'b', value: raw === '1' || raw === 'true' }
        } else if (t === 'n' || raw !== '') {
          const n = Number(raw)
          cell = Number.isFinite(n) && raw !== '' ? { kind: 'n', value: n } : { kind: 's', value: raw }
        } else {
          cell = { kind: 's', value: '' }
        }
        if (ref) {
          cells.set(ref, cell)
          const col = colIndexOf(ref)
          if (col + 1 > cols) cols = col + 1
        } else {
          warnings.push('单元格缺少 r 引用——跳过')
        }
      }
    }
  }
  return { name: '', cols, cells }
}

function colIndexOf(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref)
  if (!m) return 0
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return col - 1
}

// ── 写：WorkbookState → xlsx ───────────────────────────────────────────────

export interface XlsxExportResult {
  data: Uint8Array
  warnings: string[]
}

export function workbookToXlsx(wb: WorkbookState): XlsxExportResult {
  const warnings: string[] = []

  // 共享字符串收集（kind='s' 去重）
  const shared: string[] = []
  const sharedIndex = new Map<string, number>()
  const collectShared = (v: string): number => {
    let idx = sharedIndex.get(v)
    if (idx == null) { idx = shared.length; shared.push(v); sharedIndex.set(v, idx) }
    return idx
  }

  // sheet 部件（VNode——OOXML 也是 VNode）
  const sheetParts: Array<{ path: string; xml: string }> = []
  const sheetRels: VNode[] = []
  const sheetsVNode: VNode[] = []
  wb.sheets.forEach((sheet, si) => {
    const cellsVNode: VNode[] = []
    const rows = new Map<number, Array<{ ref: string; cell: SheetCell }>>()
    let maxCol = sheet.cols
    for (const [ref, cell] of sheet.cells) {
      const { row, col } = refToRowCol(ref)
      if (col + 1 > maxCol) maxCol = col + 1
      const list = rows.get(row) ?? []
      list.push({ ref, cell })
      rows.set(row, list)
    }
    const sortedRows = [...rows.keys()].sort((a, b) => a - b)
    for (const r of sortedRows) {
      const cs = rows.get(r)!.sort((a, b) => refToRowCol(a.ref).col - refToRowCol(b.ref).col)
      const cNodes: VNode[] = []
      for (const { ref, cell } of cs) {
        if (cell.kind === 'f' && cell.formula) {
          cNodes.push(h('c', { r: ref, t: 'f' }, h('f', {}, cell.formula), h('v', {}, String(cell.value ?? ''))))
        } else if (cell.kind === 's') {
          cNodes.push(h('c', { r: ref, t: 's' }, h('v', {}, String(collectShared(String(cell.value))))))
        } else if (cell.kind === 'b') {
          cNodes.push(h('c', { r: ref, t: 'b' }, h('v', {}, cell.value ? '1' : '0')))
        } else if (cell.kind === 'n') {
          cNodes.push(h('c', { r: ref, t: 'n' }, h('v', {}, String(cell.value))))
        } else {
          cNodes.push(h('c', { r: ref, t: 's' }, h('v', {}, String(collectShared(String(cell.value))))))
        }
      }
      cellsVNode.push(h('row', { r: r + 1 }, ...cNodes))
    }
    const sheetVNode = h('worksheet',
      { xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main' },
      h('sheetData', {}, ...cellsVNode),
    )
    sheetParts.push({ path: `xl/worksheets/sheet${si + 1}.xml`, xml: vnodeToXml(sheetVNode) })
    sheetRels.push(h('Relationship', {
      Id: `rId${si + 1}`,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
      Target: `worksheets/sheet${si + 1}.xml`,
    }))
    sheetsVNode.push(h('sheet', { name: sheet.name, 'sheetId': si + 1, 'r:id': `rId${si + 1}` }))
  })

  const workbookVNode = h('workbook',
    {
      xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    },
    h('sheets', {}, ...sheetsVNode),
  )

  const sharedStringsVNode = h('sst',
    { xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', count: shared.length, uniqueCount: shared.length },
    ...shared.map((s, i) => h('si', { key: `si${i}` }, h('t', {}, s))),
  )

  const wbRelsVNode = h('Relationships',
    { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
    ...sheetRels,
    h('Relationship', {
      Id: `rId${wb.sheets.length + 1}`,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings',
      Target: 'sharedStrings.xml',
    }),
  )

  const contentTypes = vnodeToXml(h('Types',
    { xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types' },
    h('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }),
    h('Default', { Extension: 'xml', ContentType: 'application/xml' }),
    h('Override', { PartName: '/xl/workbook.xml', ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' }),
    ...wb.sheets.map((_, i) => h('Override', {
      PartName: `/xl/worksheets/sheet${i + 1}.xml`,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
    })),
    h('Override', { PartName: '/xl/sharedStrings.xml', ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml' }),
  ))

  const rootRels = vnodeToXml(h('Relationships',
    { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
    h('Relationship', {
      Id: 'rId1',
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
      Target: 'xl/workbook.xml',
    }),
  ))

  const encoder = new TextEncoder()
  const files = new Map<string, Uint8Array>([
    ['[Content_Types].xml', encoder.encode(contentTypes)],
    ['_rels/.rels', encoder.encode(rootRels)],
    ['xl/workbook.xml', encoder.encode(vnodeToXml(workbookVNode))],
    ['xl/_rels/workbook.xml.rels', encoder.encode(vnodeToXml(wbRelsVNode))],
    ['xl/sharedStrings.xml', encoder.encode(vnodeToXml(sharedStringsVNode))],
  ])
  for (const part of sheetParts) files.set(part.path, encoder.encode(part.xml))

  return { data: writeZip(files), warnings }
}

function refToRowCol(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return { row: 0, col: 0 }
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: Number(m[2]) - 1, col: col - 1 }
}
