/**
 * pptx-vdom packager.ts — slide XML → 完整 .pptx Buffer
 *
 * 模板骨架策略：slideMasters/slideLayouts/theme 等静态文件在模块加载时
 * 读取一次并缓存（不在请求路径做 I/O），运行时只动态生成：
 *   - ppt/slides/slideN.xml（renderXml 产物）
 *   - ppt/slides/_rels/slideN.xml.rels
 *   - ppt/presentation.xml（sldIdLst）
 *   - ppt/_rels/presentation.xml.rels（slide 关系）
 *   - [Content_Types].xml（slide Override）
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipEntries, type ZipEntry } from './zip.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = resolve(__dirname, 'template')

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** 模板静态文件（模块加载时缓存一次） */
const TEMPLATE = new Map<string, string>()
for (const name of [
  '[Content_Types].xml',
  '_rels/.rels',
  'docProps/app.xml',
  'docProps/core.xml',
  'ppt/slideMasters/slideMaster1.xml',
  'ppt/slideMasters/_rels/slideMaster1.xml.rels',
  'ppt/slideLayouts/slideLayout1.xml',
  'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
  'ppt/theme/theme1.xml',
  'ppt/presProps.xml',
  'ppt/viewProps.xml',
  'ppt/tableStyles.xml',
]) {
  TEMPLATE.set(name, readFileSync(resolve(TEMPLATE_DIR, name), 'utf-8'))
}

/** 16:9 画布 EMU */
export const SLIDE_W = 12192000
export const SLIDE_H = 6858000

function slideRels(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="${RELS_NS}">` +
    `<Relationship Id="rId1" Type="${OFFICE_REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `</Relationships>`
  )
}

/** 动态生成 presentation.xml */
function buildPresentationXml(n: number): string {
  const sldIds = Array.from({ length: n }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${2 + i}"/>`).join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="${OFFICE_REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${sldIds}</p:sldIdLst>` +
    `<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/>` +
    `<p:notesSz cx="6858000" cy="9144000"/>` +
    `<p:defaultTextStyle/>` +
    `</p:presentation>`
  )
}

/** 动态生成 presentation.xml.rels */
function buildPresentationRels(n: number): string {
  const rels: string[] = []
  rels.push(`<Relationship Id="rId1" Type="${OFFICE_REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`)
  for (let i = 1; i <= n; i++) {
    rels.push(`<Relationship Id="rId${1 + i}" Type="${OFFICE_REL}/slide" Target="slides/slide${i}.xml"/>`)
  }
  rels.push(
    `<Relationship Id="rId${2 + n}" Type="${OFFICE_REL}/presProps" Target="presProps.xml"/>`,
    `<Relationship Id="rId${3 + n}" Type="${OFFICE_REL}/viewProps" Target="viewProps.xml"/>`,
    `<Relationship Id="rId${4 + n}" Type="${OFFICE_REL}/tableStyles" Target="tableStyles.xml"/>`,
    `<Relationship Id="rId${5 + n}" Type="${OFFICE_REL}/theme" Target="theme/theme1.xml"/>`,
  )
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="${RELS_NS}">${rels.join('')}</Relationships>`
  )
}

/** 动态生成 [Content_Types].xml */
function buildContentTypes(n: number): string {
  const base = TEMPLATE.get('[Content_Types].xml')!
  const slideOverrides = Array.from(
    { length: n },
    (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join('')
  return base.replace('</Types>', slideOverrides + '</Types>')
}

export interface DeckOptions {
  title?: string
}

/**
 * 构建完整 .pptx Buffer。
 * @param slides renderSlide() 的输出数组（每项一页）
 */
export function buildPptx(slides: string[], opts: DeckOptions = {}): Buffer {
  const n = slides.length
  if (n === 0) throw new Error('buildPptx: 至少需要 1 页')

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: Buffer.from(buildContentTypes(n), 'utf-8') },
    { name: '_rels/.rels', data: Buffer.from(TEMPLATE.get('_rels/.rels')!, 'utf-8') },
    { name: 'docProps/app.xml', data: Buffer.from(TEMPLATE.get('docProps/app.xml')!, 'utf-8') },
    { name: 'docProps/core.xml', data: Buffer.from(TEMPLATE.get('docProps/core.xml')!, 'utf-8') },
    { name: 'ppt/presentation.xml', data: Buffer.from(buildPresentationXml(n), 'utf-8') },
    { name: 'ppt/_rels/presentation.xml.rels', data: Buffer.from(buildPresentationRels(n), 'utf-8') },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: Buffer.from(TEMPLATE.get('ppt/slideMasters/slideMaster1.xml')!, 'utf-8') },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: Buffer.from(TEMPLATE.get('ppt/slideMasters/_rels/slideMaster1.xml.rels')!, 'utf-8') },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: Buffer.from(TEMPLATE.get('ppt/slideLayouts/slideLayout1.xml')!, 'utf-8') },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: Buffer.from(TEMPLATE.get('ppt/slideLayouts/_rels/slideLayout1.xml.rels')!, 'utf-8') },
    { name: 'ppt/theme/theme1.xml', data: Buffer.from(TEMPLATE.get('ppt/theme/theme1.xml')!, 'utf-8') },
    { name: 'ppt/presProps.xml', data: Buffer.from(TEMPLATE.get('ppt/presProps.xml')!, 'utf-8') },
    { name: 'ppt/viewProps.xml', data: Buffer.from(TEMPLATE.get('ppt/viewProps.xml')!, 'utf-8') },
    { name: 'ppt/tableStyles.xml', data: Buffer.from(TEMPLATE.get('ppt/tableStyles.xml')!, 'utf-8') },
  ]

  for (let i = 1; i <= n; i++) {
    entries.push({ name: `ppt/slides/slide${i}.xml`, data: Buffer.from(slides[i - 1], 'utf-8') })
    entries.push({ name: `ppt/slides/_rels/slide${i}.xml.rels`, data: Buffer.from(slideRels(), 'utf-8') })
  }

  if (opts.title) {
    const app = entries.find((e) => e.name === 'docProps/app.xml')!
    app.data = Buffer.from(app.data.toString().replace('<Slides>1</Slides>', `<Slides>${n}</Slides>`), 'utf-8')
  }

  return zipEntries(entries)
}
