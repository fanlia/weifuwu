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

/**
 * aria-* 枚举语义属性布尔归一（ReasoningBlock CDD 实证——v1 修复 v2 迁移丢失——回归补）
 *
 * aria-* 是枚举语义属性（同 draggable）——boolean 必须显式 'true'/'false'：
 * boolean attribute 空字符串分支会把 aria-expanded: true 落成 aria-expanded=""
 * （读屏语义 = false——可访问性失效）；v === false 被移除同属错误
 * （aria-expanded=false 与无属性语义不同面——状态不可丢失）。
 * **单一实现源**：客户端 applyAttribute 与 SSR attrsToHtml 共用本判定。
 *
 * @returns 'true' / 'false'（命中 aria 布尔）或 null（非 aria 布尔——走原分支）
 */
export function ariaBoolValue(key: string, value: unknown): string | null {
  if (!key.startsWith('aria-') || typeof value !== 'boolean') return null
  return value ? 'true' : 'false'
}

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
  // aria-* 枚举语义属性（布尔归一——必须在 false removeAttribute 分支之前——
  // aria-expanded=false 是有效状态不可移除）
  const ariaBool = ariaBoolValue(key, value)
  if (ariaBool !== null) {
    el.setAttribute(key, ariaBool)
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
