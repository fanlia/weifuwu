/**
 * vdom core — style 通道（复杂面独立处理）
 *
 * 规则（设计规则 §4.0/§6.4——style diff 只设不删已修）：
 * - 对象应用：el.style[k] = v——**undefined/null/false → 清空**（防残留——
 *   条件显隐组件 display: undefined 残留旧 none）
 * - 字符串直通：setAttribute('style', str)
 * - 数字自动单位：width/height/margin... → px（UNITLESS 白名单无单位——
 *   zIndex/opacity/lineHeight/fontWeight/flex 系）
 * - CSS 变量（--x 前缀）→ setProperty（el.style['--x'] 赋值无效）
 */

/** 无单位属性白名单（数字原样——React 同规则） */
export const UNITLESS_KEYS = new Set([
  'zIndex', 'opacity', 'lineHeight', 'zoom', 'fontWeight', 'order', 'flex',
  'flexGrow', 'flexShrink', 'flexBasis', 'animationIterationCount',
  'orphans', 'widows', 'columns', 'columnCount', 'columnGap',
  'counterIncrement', 'counterReset', 'aspectRatio', 'scale', 'rotate',
])

/** 单值应用（kebab/camelCase 键——CSS 变量走 setProperty） */
export function applyStyleValue(el: HTMLElement, key: string, value: unknown): void {
  if (value === undefined || value === null || value === false) {
    if (key.startsWith('--')) el.style.removeProperty(key)
    else ;(el.style as any)[key] = ''
    return
  }
  if (key.startsWith('--')) {
    el.style.setProperty(key, String(value))
    return
  }
  if (typeof value === 'number' && !UNITLESS_KEYS.has(key)) {
    value = `${value}px`
  }
  ;(el.style as any)[key] = String(value)
}

/** style 应用（对象/字符串——整体替换语义） */
export function applyStyle(el: HTMLElement, style: unknown): void {
  if (typeof style === 'string') {
    el.setAttribute('style', style)
    return
  }
  if (style && typeof style === 'object') {
    // **整体替换**（设计规则 §6.4 回归）：style 对象 = 组件声明的完整样式——
    // 先清空旧值（键消失不残留——display 残留事故——`{ display: 'block' }`
    // → `{}` 旧 display 不清理——条件显隐失效）——再逐键设置
    el.style.cssText = ''
    for (const [k, v] of Object.entries(style)) {
      applyStyleValue(el, k, v)
    }
  }
}
