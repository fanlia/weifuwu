/**
 * vdom core — attribute 通道（可序列化面——create 携带的 attrs / setProp 兜底）
 *
 * 规则（AGENTS §4.0 属性三通道——attribute/property/event）：
 * - class/className → setAttribute('class')
 * - style（对象）→ el.style[k]（undefined/null 清空——防 style diff 只设不删）
 * - enumerated 白名单（draggable/contenteditable/spellcheck）——**空字符串解析
 *   为 false**（Kanban 教训）——显式 'true'/'false'
 * - boolean attribute（disabled/hidden 等）→ setAttribute(key, '')
 * - 其余字符串化 setAttribute；null/undefined/false → removeAttribute
 */

/** enumerated 属性白名单（HTML 规范——空字符串语义非 true） */
export const ENUMERATED_KEYS = new Set(['draggable', 'contenteditable', 'spellcheck'])

/** style 对象应用（undefined/null → 移除——防残留） */
export function applyStyle(el: HTMLElement, style: unknown): void {
  if (typeof style === 'string') {
    el.setAttribute('style', style)
    return
  }
  if (style && typeof style === 'object') {
    for (const [k, v] of Object.entries(style)) {
      if (v === undefined || v === null || v === false) {
        ;(el.style as any).removeProperty?.(k) ?? ((el.style as any)[k] = '')
      } else {
        ;(el.style as any)[k] = v
      }
    }
  }
}

/** attribute 通道——单键应用 */
export function applyAttribute(el: HTMLElement, key: string, value: unknown): void {
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
  if (key === 'style') {
    applyStyle(el, value)
    return
  }
  if (typeof value === 'boolean') {
    // boolean attribute（disabled/hidden/required...）——空字符串 = 存在
    el.setAttribute(key, '')
    return
  }
  el.setAttribute(key, String(value))
}
