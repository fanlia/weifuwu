/**
 * transform — children/属性转化规则单一源（design/vdom-consistency-plan.md 阶段 0）
 *
 * 可推导性 by construction（design/vdom-transform-rules.md）：所有 children 形态判定与
 * 属性通道判定收敛到此单一模块——buildVNode / renderValue / patchChildren / renderSsr /
 * hydrateVNode 全部调用，禁止各路径各自实现形态判定（同一语义多套实现 = 漂移 = 转化分叉）。
 */
import type { VNode, VNodeChild } from '../vnode.ts'
import { Fragment, Portal } from '../vnode.ts'

/** 占位内容（规则表 §1——wf-hole 内容可见可审计：false/null/undefined/true/对象摘要/bad-vnode） */
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

/** 数组项必有 key（规则表 §3）：无显式 key 的元素/组件项赋默认下标 key（数组原始下标含占位位置，
 *  统一字符串）；文本/占位值豁免。原地写入 vnode.key（声明规则，非隐藏 magic） */
export function ensureArrayKeys(children: VNodeChild[]): void {
  for (let i = 0; i < children.length; i++) {
    const c = children[i]
    if (c != null && typeof c === 'object' && !Array.isArray(c)) {
      const v = c as VNode
      if (v.key === undefined) v.key = String(i)
      else v.key = String(v.key)
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
