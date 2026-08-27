/**
 * vdom core — node（单节点处理——类型判定/分类——独立文件）
 *
 * 规则（设计规则 §4.0——children 值域协议 + 非法输入分类）：
 * - text：string/number → 文本节点
 * - hole：null/undefined/boolean → 空洞占位锚（hole.ts——占位法——长度恒定）
 * - array：VNodeChild[] → 隐式 Fragment（children.ts 展开）
 * - element：string type → 元素节点
 * - fragment：Fragment 符号（`<></>`——与数组同义）
 * - component：函数 type → 两阶段组件（工厂 + renderFn）
 * - invalid：对象/数字 type/未知 Symbol → 诊断占位 + warn（hole.ts——不崩溃不静默）
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import { isFragment } from './fragment.ts'
import { isHole, isInvalid } from './hole.ts'

export type NodeKind =
  | 'text' | 'hole' | 'array' | 'element'
  | 'fragment' | 'component' | 'invalid'

/** 单节点分类（唯一判定点——各消费方共用）
 *  **空字符串 = 空洞（2026-08——编码唯一性——映射歧义歼灭）**：'' 文本
 *  节点在 DOM 可见性上 = 无——但客户端 createText('') 生成空文本节点、
 *  HTML 序列化（commandToHtml escapeHtml('') → 空串）不产任何节点——
 *  同一 children 值两套物理表示——SSR 吸收文本流错位（实证：
 *  `{cond ? 'x' : ''}` 的 '' 槽位——吸收把整个 demo 面 div 当多余节点
 *  跳过——inputnumber 页吸收耗尽 failed）——统一归空洞（锚注释——
 *  双端同构——与 false/null/undefined 同类） */
export function kindOf(v: VNodeChild): NodeKind {
  if (v === '') return 'hole'
  if (typeof v === 'string' || typeof v === 'number') return 'text'
  if (isHole(v)) return 'hole'
  if (Array.isArray(v)) return 'array'
  if (typeof (v as VNode).type === 'string') return 'element'
  if (isFragment(v as VNode)) return 'fragment'
  if (typeof (v as VNode).type === 'function') return 'component'
  if (isInvalid(v)) return 'invalid'
  return 'invalid'
}

/** 文本值提取（text kind——string/number 统一字符串化） */
export function textOf(v: VNodeChild): string | null {
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  return null
}

/** **渲染级空洞判定（2026-08——判定点收敛——单一实现源）**：
 *  null/undefined/boolean/''（'' 归 kindOf hole——编码唯一性）——
 *  build/diff/transform/SSR 四端渲染分类唯一判定点——禁止模块内手写
 *  `=== null || === undefined || typeof === 'boolean'`（''→hole 曾只改
 *  kindOf——diffSlot typeof 快路径分裂——双 bug 实证）——渲染空洞语义
 *  一律经本函数 */
export function isHoleKind(v: VNodeChild): boolean {
  return kindOf(v) === 'hole'
}

/** **渲染级文本判定**（kindOf 语义——'' 是 hole 不是文本——文本快路径
 *  与 setText 目标判定统一——diffSlot ''↔text 转换回归的机制防线） */
export function isTextKind(v: VNodeChild): boolean {
  return kindOf(v) === 'text'
}
