/**
 * vdom core — attribute 通道（可序列化面——create 携带的 attrs / setProp 兜底）
 *
 * 规则（设计规则 §4.0 属性三通道——attribute/property/event）：
 * - class/className → setAttribute('class')
 * - style → style.ts（对象应用/数字单位/undefined 清空——独立复杂面）
 * - enumerated 白名单（draggable/contenteditable/spellcheck）——**空字符串解析
 *   为 false**（Kanban 教训）——显式 'true'/'false'
 * - boolean attribute（disabled/hidden 等）→ setAttribute(key, '')
 * - 其余字符串化 setAttribute；null/undefined/false → removeAttribute
 */

/** enumerated 属性白名单（HTML 规范——空字符串语义非 true） */
export const ENUMERATED_KEYS = new Set(['draggable', 'contenteditable', 'spellcheck'])

/** attribute 通道——单键应用 */
export function applyAttribute(el: HTMLElement, key: string, value: unknown): void {
  // **innerHTML/textContent/value 走 property 通道**（setAttribute 不生效
  // ——Editor 首帧 innerHTML / CodeEditor textarea 值——真实 bug——setProp
  // 路径已 property（props.ts PROPERTY_KEYS）——create attrs 路径必须一致——
  // **textarea 的 value 属性无效**（值来自 IDL/children——setAttribute('value')
  // 不设 textarea.value——实测空——input 的 value 属性虽生效但 property 统一）
  if (key === 'innerHTML' || key === 'textContent' || key === 'value') {
    ;(el as any)[key] = value
    return
  }
  if (value === null || value === undefined) {
    el.removeAttribute(key)
    return
  }
  // enumerated 白名单必须先于 boolean 分支——false 也要显式 'false'（
  // 移除会落回 HTML 默认值——contenteditable 默认 inherit ≠ false）
  if (ENUMERATED_KEYS.has(key)) {
    el.setAttribute(key, value ? 'true' : 'false')
    return
  }
  if (value === false) {
    el.removeAttribute(key)
    return
  }
  if (key === 'class' || key === 'className') {
    el.setAttribute('class', String(value))
    return
  }
  if (typeof value === 'boolean') {
    // boolean attribute（disabled/hidden/required...）——空字符串 = 存在
    el.setAttribute(key, '')
    return
  }
  el.setAttribute(key, String(value))
}
