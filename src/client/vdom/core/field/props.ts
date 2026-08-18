/**
 * vdom core — property 通道（DOM property——setAttribute 无法表达的面）
 *
 * 规则（AGENTS §4.0 属性三通道）：
 * - value/checked/selected/disabled 等 → `el[key] = value`（property——
 *   setAttribute('value') 不更新输入值/勾选态）
 * - 白名单判断（PROPERTY_KEYS）——其余走 attribute 通道
 * - ref 特殊通道 → ref.ts（独立文件——挂载/卸载回调）
 */

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

/** property 应用（值直接赋给 DOM 节点属性） */
export function applyProperty(el: HTMLElement, key: string, value: unknown): void {
  ;(el as any)[key] = value
}
