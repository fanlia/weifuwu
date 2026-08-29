/**
 * vdom core — property 通道（DOM property——setAttribute 无法表达的面）
 *
 * 规则（设计规则 §4.0 属性三通道）：
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

/** property 应用（值直接赋给 DOM 节点属性）
 *  **undefined 分区语义（2027-08——v2 直连 + v1 JSON 编解码等价对齐）**：
 *  - value 类（value/defaultValue/innerHTML/textContent/defaultChecked——DOM
 *    现值是唯一来源——§5.3 非受控）→ 不写（保持现值——防 "undefined" 污染
 *    ——SearchInput 非受控实证）
 *  - 布尔态（disabled/checked/selected/readOnly/multiple/required/…）→
 *    false（解绑——Transfer 移到右侧按钮 disabled 残留实证——v1 JSON 丢
 *    undefined 值同样落到本函数——分区语义两引擎一致）
 *  - 其余 → 不写（保守） */
export function applyProperty(el: HTMLElement, key: string, value: unknown): void {
  if (value === undefined) {
    if (BOOL_PROPERTY_KEYS.has(key)) { (el as any)[key] = false; return }
    return
  }
  ;(el as any)[key] = value
}

/** 布尔态属性（undefined = 解绑——false） */
const BOOL_PROPERTY_KEYS = new Set([
  'disabled', 'checked', 'selected', 'multiple', 'readOnly', 'required',
  'indeterminate', 'muted', 'paused', 'open', 'autofocus', 'draggable', 'hidden',
])
