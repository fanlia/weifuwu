/**
 * pptx-vdom renderXml.ts — VNode → slide XML（纯函数、确定性）
 *
 * 质量职责（集中在这里解决一次）：
 * - OOXML 元素顺序严格符合规范（PowerPoint 校验敏感）
 * - XML 转义（& < > " '）
 * - 中文 ea 字体注入（a:ea typeface）
 * - 颜色归一化（#RRGGBB → RRGGBB 大写）
 * - 英寸 → EMU（1in = 914400 EMU）
 */

import type { PptxVNode } from './vnode.ts'

const EMU_PER_INCH = 914400
const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

const emu = (n: number) => Math.round(n * EMU_PER_INCH)

/** XML 转义 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 颜色归一化：#6366f1 → 6366F1；6366f1 → 6366F1 */
export function colorVal(c: string): string {
  return c.replace(/^#/, '').toUpperCase()
}

/** 默认西文/中文/复杂文种字体 */
const LATIN_FONT = 'Arial'
const EA_FONT = 'Microsoft YaHei'

// ── run 属性（a:rPr）────────────────────────────────────
function rPr(props: { fontSize?: number; bold?: boolean; color?: string; fontFace?: string }): string {
  const sz = props.fontSize ? ` sz="${Math.round(props.fontSize * 100)}"` : ''
  const b = props.bold ? ` b="1"` : ''
  const lang = ' lang="zh-CN"'
  let inner = ''
  if (props.color) {
    inner += `<a:solidFill><a:srgbClr val="${colorVal(props.color)}"/></a:solidFill>`
  }
  inner += `<a:latin typeface="${esc(props.fontFace ?? LATIN_FONT)}"/>`
  inner += `<a:ea typeface="${esc(EA_FONT)}"/>`
  inner += `<a:cs typeface="${esc(props.fontFace ?? LATIN_FONT)}"/>`
  return `<a:rPr${sz}${b}${lang}>${inner}</a:rPr>`
}

// ── 段落（a:p）──────────────────────────────────────────
function paragraph(
  text: string,
  props: { fontSize?: number; bold?: boolean; color?: string; align?: string; bullet?: boolean; fontFace?: string },
): string {
  const algn = props.align && props.align !== 'left' ? ` algn="${props.align}"` : ''
  let pPr = ''
  if (props.bullet) {
    // bullet 缩进：marL/indent 为 EMU（0.3125in 悬挂缩进）
    pPr = `<a:pPr${algn} marL="285750" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>`
  } else {
    pPr = `<a:pPr${algn}/>`
  }
  return `<a:p>${pPr}<a:r>${rPr(props)}<a:t>${esc(text)}</a:t></a:r></a:p>`
}

/** 按 \n 拆成多段（OOXML 换行 = 新段落，a:t 内的字面换行不生效） */
function splitLines(text: string): string[] {
  return text.split('\n')
}

// ── 文本框（p:sp + txBody）──────────────────────────────
function textboxShape(
  id: number,
  props: Record<string, any>,
  paragraphs: { text: string; bullet?: boolean }[],
): string {
  const x = emu(props.x ?? 0)
  const y = emu(props.y ?? 0)
  const w = emu(props.w ?? 9)
  const h = emu(props.h ?? 0.5)
  const anchor = props.valign === 'middle' ? ' anchor="ctr"' : props.valign === 'bottom' ? ' anchor="b"' : ''
  const bodyPr =
    `<a:bodyPr wrap="square"${anchor} lIns="91440" tIns="45720" rIns="91440" bIns="45720"><a:noAutofit/></a:bodyPr>`
  const pPrProps = { fontSize: props.fontSize, bold: props.bold, color: props.color, align: props.align, fontFace: props.fontFace }
  const ps = paragraphs
    .flatMap((p) => splitLines(p.text).map((line, i) => ({ text: line, bullet: p.bullet && i === 0 })))
    .map((p) => paragraph(p.text, { ...pPrProps, bullet: p.bullet }))
    .join('')
  const fill = props.fill ? `<a:solidFill><a:srgbClr val="${colorVal(props.fill)}"/></a:solidFill>` : ''
  const ln = props.lineColor
    ? `<a:ln w="${Math.round((props.lineWidth ?? 1) * 12700)}"><a:solidFill><a:srgbClr val="${colorVal(props.lineColor)}"/></a:solidFill></a:ln>`
    : ''
  return (
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${ln}</p:spPr>` +
    `<p:txBody>${bodyPr}<a:lstStyle/>${ps}</p:txBody>` +
    `</p:sp>`
  )
}

// ── 形状（矩形/椭圆等，可含文本）────────────────────────
function shapeElement(id: number, kind: string, props: Record<string, any>, text?: string): string {
  const x = emu(props.x ?? 0)
  const y = emu(props.y ?? 0)
  const w = emu(props.w ?? 1)
  const h = emu(props.h ?? 1)
  const prst = kind === 'ellipse' ? 'ellipse' : kind === 'roundedRect' ? 'roundRect' : 'rect'
  const avLst = kind === 'roundedRect' ? `<a:avLst><a:gd name="adj" fmla="val ${Math.round((props.radius ?? 0.1) * 100000)}"/></a:avLst>` : `<a:avLst/>`
  const fill = props.fill ? `<a:solidFill><a:srgbClr val="${colorVal(props.fill)}"/></a:solidFill>` : ''
  const ln = props.lineColor
    ? `<a:ln w="${Math.round((props.lineWidth ?? 1) * 12700)}"><a:solidFill><a:srgbClr val="${colorVal(props.lineColor)}"/></a:solidFill></a:ln>`
    : ''
  const txBody = text
    ? `<p:txBody><a:bodyPr wrap="square" anchor="ctr" lIns="45720" tIns="18288" rIns="45720" bIns="18288"><a:noAutofit/></a:bodyPr><a:lstStyle/>${splitLines(text)
        .map((line) =>
          paragraph(line, {
            fontSize: props.fontSize ?? 12,
            bold: props.bold,
            color: props.color,
            align: 'center',
          }),
        )
        .join('')}</p:txBody>`
    : `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>`
  return (
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="${id}" name="${kind[0].toUpperCase()}${kind.slice(1)} ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="${prst}">${avLst}</a:prstGeom>${fill}${ln}</p:spPr>` +
    txBody +
    `</p:sp>`
  )
}

// ── 线条（p:cxnSp）──────────────────────────────────────
function lineElement(id: number, props: Record<string, any>): string {
  const x1 = emu(props.x1 ?? 0)
  const y1 = emu(props.y1 ?? 0)
  const x2 = emu(props.x2 ?? 1)
  const y2 = emu(props.y2 ?? 1)
  const flipH = x2 < x1 ? ' flipH="1"' : ''
  const flipV = y2 < y1 ? ' flipV="1"' : ''
  const xfrm =
    `<a:xfrm${flipH}${flipV}><a:off x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}"/>` +
    `<a:ext cx="${Math.abs(x2 - x1)}" cy="${Math.abs(y2 - y1)}"/></a:xfrm>`
  const ln =
    `<a:ln w="${Math.round((props.weight ?? 1) * 12700)}"><a:solidFill><a:srgbClr val="${colorVal(props.color ?? '#9CA3AF')}"/></a:solidFill></a:ln>`
  return (
    `<p:cxnSp>` +
    `<p:nvCxnSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>` +
    `<p:spPr>${xfrm}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${ln}</p:spPr>` +
    `</p:cxnSp>`
  )
}

// ── 元素分发（intrinsic 标签 → XML）─────────────────────
function renderElement(vnode: PptxVNode, idGen: () => number): string {
  const { type, props } = vnode
  const id = idGen()
  const children = props.children

  switch (type) {
    case 'text': {
      // 文本：props.text 或 children（字符串/字符串数组=多段；VNode 数组忽略）
      const texts: string[] = []
      if (props.text != null) texts.push(String(props.text))
      else if (typeof children === 'string' || typeof children === 'number') texts.push(String(children))
      else if (Array.isArray(children)) {
        for (const c of children) {
          if (typeof c === 'string' || typeof c === 'number') texts.push(String(c))
        }
      }
      return textboxShape(id, props, texts.map((t) => ({ text: t })))
    }
    case 'bullets': {
      const points: string[] = Array.isArray(props.points) ? props.points : []
      if (points.length === 0 && Array.isArray(children)) {
        for (const c of children) {
          if (typeof c === 'string' || typeof c === 'number') points.push(String(c))
        }
      }
      return textboxShape(id, props, points.map((t) => ({ text: t, bullet: true })))
    }
    case 'rect':
    case 'roundedRect':
    case 'ellipse': {
      const text = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined
      return shapeElement(id, type, props, text)
    }
    case 'line':
      return lineElement(id, props)
    default:
      throw new Error(`pptx-vdom: 未知元素 <${String(type)}>（引擎只支持受控 intrinsic 子集）`)
  }
}

/** 递归展开组件 + children，产出 shape XML 片段 */
function renderTree(node: any, idGen: () => number): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') {
    // 裸文本：默认按 text 元素渲染（无定位 → 左上角）
    return renderElement({ type: 'text', props: { children: String(node) } }, idGen)
  }
  if (Array.isArray(node)) {
    return node.map((n) => renderTree(n, idGen)).join('')
  }
  if (typeof node.type === 'function') {
    const out = node.type(node.props)
    return renderTree(out, idGen)
  }
  if (typeof node.type === 'string') {
    return renderElement(node as PptxVNode, idGen)
  }
  throw new Error('pptx-vdom: 非法节点')
}

/**
 * 渲染完整 slide XML。
 * @param root  slide 根 VNode（type: 'slide'）
 */
export function renderSlide(root: PptxVNode): string {
  if (root.type !== 'slide') {
    throw new Error('pptx-vdom: renderSlide 需要 <slide> 根节点')
  }
  const { props } = root
  let id = 1
  const idGen = () => ++id
  const shapes = renderTree(props.children, idGen)
  const bg = props.bg ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${colorVal(props.bg)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` : ''

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">` +
    `<p:cSld>${bg}` +
    `<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    shapes +
    `</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
    `</p:sld>`
  )
}
