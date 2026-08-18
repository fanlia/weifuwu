/**
 * vdom core — node（单节点处理——类型判定/分类——独立文件）
 *
 * 规则（AGENTS §4.0——children 值域协议 + 非法输入分类）：
 * - text：string/number → 文本节点
 * - hole：null/undefined/boolean → 空洞占位锚（hole.ts——占位法——长度恒定）
 * - array：VNodeChild[] → 隐式 Fragment（children.ts 展开）
 * - element：string type → 元素节点
 * - fragment：Fragment 符号（`<></>`——与数组同义）
 * - portal：Portal 符号（usePopup 内部机制）
 * - component：函数 type → 两阶段组件（工厂 + renderFn）
 * - invalid：对象/数字 type/未知 Symbol → 诊断占位 + warn（hole.ts——不崩溃不静默）
 */

import type { VNode, VNodeChild } from './vnode.ts'
import { isFragment } from './fragment.ts'
import { isPortal } from './portal.ts'
import { isHole, isInvalid } from './hole.ts'

export type NodeKind =
  | 'text' | 'hole' | 'array' | 'element'
  | 'fragment' | 'portal' | 'component' | 'invalid'

/** 单节点分类（唯一判定点——各消费方共用） */
export function kindOf(v: VNodeChild): NodeKind {
  if (typeof v === 'string' || typeof v === 'number') return 'text'
  if (isHole(v)) return 'hole'
  if (Array.isArray(v)) return 'array'
  if (typeof (v as VNode).type === 'string') return 'element'
  if (isFragment(v as VNode)) return 'fragment'
  if (isPortal(v as VNode)) return 'portal'
  if (typeof (v as VNode).type === 'function') return 'component'
  if (isInvalid(v)) return 'invalid'
  return 'invalid'
}

/** 文本值提取（text kind——string/number 统一字符串化） */
export function textOf(v: VNodeChild): string | null {
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  return null
}
