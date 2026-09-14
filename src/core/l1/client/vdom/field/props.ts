/**
 * vdom core — property 通道（DOM property——setAttribute 无法表达的面）
 *
 * 规则（设计规则 §4.0 属性三通道）：
 * - value/checked/selected/disabled 等 → `el[key] = value`（property——
 *   setAttribute('value') 不更新输入值/勾选态）
 * - 白名单判断（PROPERTY_KEYS）——其余走 attribute 通道
 * - ref 特殊通道 → ref.ts（独立文件——挂载/卸载回调）
 */

import { isComposingEl } from './input-sync.ts'

/** property 白名单（DOM 节点属性——非 HTML attribute 语义） */
export const PROPERTY_KEYS = new Set([
  'value', 'checked', 'selected', 'disabled', 'hidden', 'autofocus',
  'defaultValue', 'defaultChecked', 'innerHTML', 'textContent',
  'download', 'indeterminate', 'multiple', 'readOnly', 'required',
  'tabIndex', 'spellcheck', 'draggable', 'scrollTop', 'scrollLeft',
  'volume', 'muted', 'paused', 'playbackRate', 'open',
])

/** 是否走 property 通道 */
export function isPropertyKey(key: string): boolean {
  return PROPERTY_KEYS.has(key)
}

/** property 应用（值直接赋给 DOM 节点属性）
 *  **undefined 分区语义（2027-08——v2 直连 + v1 JSON 编解码等价对齐）**：
 *  - value 类（value/defaultValue/innerHTML/textContent/defaultChecked——DOM
 *    现值是唯一来源——§5.3 非受控）→ 不写（保持现值——防 "undefined" 污染
 *    ——SearchInput 非受控实证）
 *  - 布尔态（disabled/checked/selected/readOnly/multiple/required/…）→
 *    false（解绑——Transfer 移到右侧按钮 disabled 残留实证——v1 JSON 丢
 *    undefined 值同样落到本函数——分区语义两引擎一致）
 *  - 其余 → 不写（保守）
 *  **value 现值比较（2027-09——DOM 脱节修复消费端）**：diff 对表单控件
 *  value 总是发——写前与 DOM 现值比较（同值不上 DOM——打字每键的差集
 *  渲染零副作用）；**IME 组合中跳过**（compositionstart~end——组合期
 *  渲染树 value=组合前——强写打断中文输入法）——组合结束后渲染写回 */
export function applyProperty(el: HTMLElement, key: string, value: unknown): void {
  if (value === undefined) {
    if (BOOL_PROPERTY_KEYS.has(key)) { (el as any)[key] = false; return }
    return
  }
  if (key === 'value' && el.nodeType === 1) {
    const el2 = el as HTMLInputElement
    // 组合中跳过（IME 安全）；现值相同零写（无副作用）
    if ((el as any).ownerDocument && isComposingEl((el as any).ownerDocument as Document, el2)) return
    const cur = (el2 as any).value
    if (cur === value || String(cur) === String(value)) return
  }
  ;(el as any)[key] = value
}

/** 布尔态属性（undefined = 解绑——false） */
const BOOL_PROPERTY_KEYS = new Set([
  'disabled', 'checked', 'selected', 'multiple', 'readOnly', 'required',
  'indeterminate', 'muted', 'paused', 'open', 'autofocus', 'draggable', 'hidden',
])
