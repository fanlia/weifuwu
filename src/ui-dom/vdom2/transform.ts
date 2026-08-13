/**
 * transform — children/属性转化规则单一源（design 归档 阶段 0）
 *
 * 可推导性 by construction（design/vdom-transform-rules.md）：所有 children 形态判定与
 * 属性通道判定收敛到此单一模块——buildVNode / renderValue / patchChildren / renderSsr /
 * hydrateVNode 全部调用，禁止各路径各自实现形态判定（同一语义多套实现 = 漂移 = 转化分叉）。
 */
import type { VNode, VNodeChild } from '../vnode.ts'
import { Fragment, Portal } from '../vnode.ts'
import type { BrowserEnv } from '../types.ts'

/** wf-hole 值摘要（占位内容可见可审计：false/null/undefined/true/对象摘要/bad-vnode） */
export function holeDetail(v: unknown): string {
  if (v === false) return 'false'
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (v === true) return 'true'
  if (typeof v === 'object') {
    try {
      const s = JSON.stringify(v)
      const d = s != null && s.length > 80 ? s.slice(0, 80) + '…' : (s ?? '')
      return `object ${d}`
    } catch {
      return `object ${Object.prototype.toString.call(v)}`
    }
  }
  return `bad-vnode type=${typeof v}`
}

/** 字段值包裹：含空白/引号/等号 → 双引号（用户可读 + 可解析——单一格式，规则表 §1） */
function quoteIfNeeded(s: string): string {
  return /[\s"=]/.test(s) ? `"${s.replace(/"/g, "'")}"` : s
}

/** 统一 wf-hole 标记（规则表 §1——全部 wf-hole 同一格式，用户直接读 DOM 注释可懂）：
 *  - 占位  `wf-hole: type=hole value=false key=0 id=_wf_5`
 *  - 边界  `wf-hole: type=fragment-start key="0" id="_wf_5"` / `wf-hole: type=fragment-end key="0"`
 *  - 诊断  `wf-hole: type=hole value="object {...}"`（value 承载内容）
 *  字段：type 必写（hole/fragment-start/fragment-end）；value/key/id 有则写。
 *  前缀恒为 `wf-hole:`——diff/audit/hydrate 的占位判断（startsWith）不随格式演进变化 */
export function holeMarkup(opts: { type: string; value?: unknown; key: string | null; id: string | null; fid: string | null }): string {
  const parts = [`type=${opts.type}`]
  if (opts.value !== undefined) parts.push(`value=${quoteIfNeeded(holeDetail(opts.value))}`)
  if (opts.key != null) parts.push(`key=${quoteIfNeeded(opts.key)}`)
  if (opts.id != null) parts.push(`id=${quoteIfNeeded(opts.id)}`)
  if (opts.fid != null) parts.push(`fid=${quoteIfNeeded(opts.fid)}`)
  return `wf-hole: ${parts.join(' ')}`
}

/** 解析 wf-hole 注释字段（type/key/depth/id/value——统一格式，单一解析点） */
export function parseHoleMarkup(nodeValue: string): Record<string, string> {
  const out: Record<string, string> = {}
  const body = nodeValue.startsWith('wf-hole: ') ? nodeValue.slice('wf-hole: '.length) : nodeValue
  // 字段：token 或 "引号值"（value 可能含空格——双引号包裹）
  const re = /([a-z]+)=("(?:[^"]*)"|[^\s]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    out[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1) : m[2]
  }
  return out
}

/** children 项分类（规则表 §1）——唯一判定，消费方只调函数不写判定 */
export type ChildKind =
  | 'text'        // string/number
  | 'hole'        // false/null/undefined/true（占位）
  | 'native'      // 原生元素
  | 'component'   // 组件
  | 'fragment'    // Fragment 节点
  | 'portal'      // Portal 节点
  | 'array'       // 数组项（≡ 隐式 Fragment）
  | 'invalid'     // 非法（非 VNode 对象 / 非法 type）——诊断占位

export function classifyChild(c: VNodeChild): ChildKind {
  if (c == null || typeof c === 'boolean') return 'hole'
  if (typeof c === 'string' || typeof c === 'number') return 'text'
  if (Array.isArray(c)) return 'array'
  const t = (c as VNode).type
  if (typeof t === 'string') return 'native'
  if (typeof t === 'function') return 'component'
  if (t === Fragment) return 'fragment'
  if (t === Portal) return 'portal'
  return 'invalid'
}

/** 非法 type 判定（组件/原生/Fragment/Portal 之外——数字/未知 Symbol/缺失 → 诊断占位） */
export function isInvalidVNodeType(t: unknown): boolean {
  return typeof t !== 'string' && typeof t !== 'function' && t !== Fragment && t !== Portal
}

/** 数组上下文：无渲染值（false/null/true）→ 占位（规则表 §1——childNodes 与数组同构） */
export function isHoleChild(c: VNodeChild): boolean {
  return c == null || typeof c === 'boolean'
}

/** 数组项 key 规范化（key 业务身份声明协议——design 归档）：显式 key 仅字符串化（统一字符串）；
 *  无 key 项保持 null（框架不生成身份 key——位置身份由 patch 的 prepPos 显式接管混合数组）。
 *  文本/占位值豁免。原地写入 vnode.key（声明规则，非隐藏 magic） */
export function ensureArrayKeys(children: VNodeChild[]): void {
  for (let i = 0; i < children.length; i++) {
    const c = children[i]
    if (c != null && typeof c === 'object' && !Array.isArray(c)) {
      const v = c as VNode
      if (v.key !== null) v.key = String(v.key)
    }
  }
}

/** 事件 prop 判定：on + 大写字母（React 约定）——排除 once/only 等 on 开头非事件属性 */
export const EVENT_RE = /^on[A-Z]/
/** 捕获变体：onClickCapture → click + {capture:true}（规则表 §2：捕获变体明确支持，非静默） */
const CAPTURE_RE = /^on[A-Z].*Capture$/

/** 事件类型 + 捕获标志（onClick → click；onClickCapture → click + capture）——单一实现 */
export function eventTarget(key: string): { type: string; capture: boolean } {
  const capture = CAPTURE_RE.test(key)
  return { type: (capture ? key.slice(2, -7) : key.slice(2)).toLowerCase(), capture }
}

/** enumerated value-based 白名单（规则表 §2）：空字符串解析为 false——必须显式 'true'/'false'。
 *  对照 HTML 规范 enumerated 属性表：value-based 类（draggable/contenteditable/spellcheck/translate） */
export const ENUMERATED_VALUE_BASED = new Set(['draggable', 'contenteditable', 'spellcheck', 'translate'])

/** CSS 无单位属性（数字不加 px）——其余数字样式属性必须加 px（规则表 §2 UNITLESS 白名单） */
export const UNITLESS_PROPS = new Set([
  'zIndex', 'opacity', 'lineHeight', 'fontWeight', 'fontSizeAdjust', 'flex', 'flexGrow', 'flexShrink',
  'order', 'zoom', 'aspectRatio', 'gridRow', 'gridColumn', 'scale', 'rotate', 'animationIterationCount',
  'columnCount', 'fillOpacity', 'strokeOpacity', 'stopOpacity', 'floodOpacity',
])



/** 属性通道分类（单一判定源——setProp/patchProps/x2html 共用；规则表 §2 属性三通道）：
 *  - enumerated ：value-based 枚举属性（draggable 等——空字符串解析为 false，必须显式 'true'/'false'）
 *  - class      ：class/className（字符串/对象形态）
 *  - style      ：style（字符串/对象形态）
 *  - ref        ：ref 回调（挂载调用 el / 卸载调用 null）
 *  - event      ：on + 大写（onClick/onClickCapture——事件通道）
 *  - value      ：input/select value（property）
 *  - indeterminate：checkbox 半选态（property——attribute 解析为 false）
 *  - innerHTML  ：innerHTML 内容（存在则 children 不渲染）
 *  - aria       ：aria-* 语义属性（boolean 必须显式 'true'/'false'）
 *  - default    ：其余——property + attribute 双写 */
export type PropChannel =
  | 'enumerated' | 'class' | 'style' | 'ref' | 'event'
  | 'value' | 'indeterminate' | 'innerHTML' | 'aria' | 'default'

/** 属性通道判定（key 分类——值判断留在各通道处理函数内，规则表 §2） */
export function propChannelOf(key: string): PropChannel {
  if (ENUMERATED_VALUE_BASED.has(key)) return 'enumerated'
  if (key === 'class' || key === 'className') return 'class'
  if (key === 'style') return 'style'
  if (key === 'ref') return 'ref'
  if (EVENT_RE.test(key)) return 'event'
  if (key === 'value') return 'value'
  if (key === 'indeterminate') return 'indeterminate'
  if (key === 'innerHTML') return 'innerHTML'
  if (key.startsWith('aria-')) return 'aria'
  return 'default'
}

type SetPropFn = (el: Element, key: string, value: any) => void

/** 默认通道：property + attribute 双写（value===false 跳过；value===true → 空字符串 attribute） */
function setPropDefault(el: Element, key: string, value: any): void {
  if (value === false) return
  if (value === true) {
    el.setAttribute(key, '')
    return
  }
  try {
    ;(el as unknown as Record<string, unknown>)[key] = value
    if (el.getAttribute(key) !== String(value)) el.setAttribute(key, String(value))
  } catch {
    el.setAttribute(key, String(value))
  }
}

/** 属性设置状态机表（通道 → 设置行为——setProp 查表分派，无 if/else 通道链） */
export const PROP_SETTERS: Record<PropChannel, SetPropFn> = {
  /** enumerated value-based：即使 false 也显式写 'true'/'false'（空字符串解析为 false——
   *  draggable 事故；规则表 §2：显式可预期，不依赖「不设 = 默认值」的隐式行为） */
  enumerated: (el, key, value) => { el.setAttribute(key, value ? 'true' : 'false') },
  /** class：对象形态 → classList 逐项；字符串 → attribute */
  class: (el, key, value) => {
    if (value === false) return
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) if (v) el.classList.add(k)
    } else {
      el.setAttribute('class', String(value))
    }
  },
  /** style：字符串 → attribute；对象 → style 属性逐项（null 删除 / CSS 变量 setProperty / 数字加 px） */
  style: (el, key, value) => {
    if (value === false) return
    if (typeof value === 'string') el.setAttribute('style', value)
    else {
      const st = (el as HTMLElement).style
      for (const [k, v] of Object.entries(value)) {
        if (v == null) { (st as unknown as Record<string, string>)[k] = '' }  // null/undefined → 删除样式属性（§6.4 style 只设不删修复）
        else if (k.startsWith('--')) { st.setProperty(k, String(v)) }  // CSS 变量必须 setProperty（st['--x']=v 静默失败——--wf-cols 事故，v1 处理）
        else if (typeof v === 'number' && !UNITLESS_PROPS.has(k)) { (st as unknown as Record<string, string>)[k] = `${v}px` }  // 数字加 px（top/left/width 等——无单位值被浏览器忽略 → 坐标丢失）
        else (st as unknown as Record<string, string>)[k] = String(v)
      }
    }
  },
  /** ref：挂载调用 el（ref 错误隔离——用户 ref 抛错不中断渲染管线） */
  ref: (el, key, value) => {
    if (typeof value === 'function') {
      try { value(el) } catch (e) { console.error('[weifuwu] ref error', e) }
    }
  },
  /** event：addEventListener（类型守卫：非函数值不抛错——warn + 跳过） */
  event: (el, key, value) => {
    if (value === false) return
    const { type, capture } = eventTarget(key)
    if (typeof value !== 'function') {
      console.warn(`[weifuwu] event prop ${key} expects a function, got ${typeof value} — ignored`)
      return
    }
    el.addEventListener(type, value, capture ? { capture: true } : {})
  },
  /** value：input/select property */
  value: (el, key, value) => {
    if (value === false) return
    ;(el as HTMLInputElement).value = value
  },
  /** indeterminate：checkbox 半选态——property 而非 attribute（setAttribute('indeterminate','')
   *  解析为 false（同 draggable 枚举坑）；el.indeterminate = true 才有效） */
  indeterminate: (el, key, value) => {
    if (value === false) return
    ;(el as HTMLInputElement).indeterminate = !!value
  },
  /** innerHTML：内容直接写（存在则 children 不渲染——与 diff 同一判断） */
  innerHTML: (el, key, value) => {
    if (value === false) return
    el.innerHTML = String(value ?? '')
  },
  /** aria-*：boolean → 显式 'true'/'false'（aria-expanded="" 解析为非标准值）；非 boolean → 默认通道 */
  aria: (el, key, value) => {
    if (value === false) return
    if (typeof value === 'boolean') {
      el.setAttribute(key, value ? 'true' : 'false')
      return
    }
    setPropDefault(el, key, value)
  },
  /** 默认通道：property + attribute */
  default: setPropDefault,
}

/** 属性设置（查表分派——PROP_SETTERS[propChannelOf(key)]） */
export function setProp(el: Element, key: string, value: any): void {
  if (value == null) return
  PROP_SETTERS[propChannelOf(key)](el, key, value)
}

/** 占位内容（规则表 §1——wf-hole 内容可见可审计：false/null/undefined/true/对象摘要/bad-vnode） */
/** 创建占位节点（数组上下文的无渲染值 → 注释节点，childNodes 与数组同构——规则表 §1） */
export function createHole(browser: BrowserEnv, v: unknown): Node | null {
  return browser.createComment(holeMarkup({ type: 'hole', value: v, key: null, id: null, fid: null }))
}

/** 递归渲染（同步——组件必须已构建） */