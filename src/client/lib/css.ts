/**
 * weifuwu/client scoped CSS — 组件级作用域样式
 *
 * createStyles 将 CSS-in-JS 对象转换为带唯一类名的映射，
 * 样式自动注入 <head>，仅在组件根元素挂载时生效。
 *
 * ```tsx
 * import { createStyles } from 'weifuwu/client'
 *
 * const s = createStyles({
 *   card: 'background: white; border-radius: 8px; padding: 16px;',
 *   title: 'font-size: 18px; font-weight: bold; color: #333;',
 * })
 *
 * function Card({ title, children }) {
 *   return (
 *     <div class={s.card}>
 *       <h2 class={s.title}>{title}</h2>
 *       {children}
 *     </div>
 *   )
 * }
 * ```
 */

let _counter = 0
const _injected = new Set<string>()

/**
 * 从 CSS-in-JS 对象生成作用域类名。
 *
 * @param styles 键 → CSS 规则字符串的映射
 * @returns 键 → 唯一类名的映射（如 { card: '_w_1', title: '_w_2' }）
 *
 * 生成的 `<style>` 自动注入 document.head，后续同名调用不重复注入。
 */
export function createStyles<T extends Record<string, string>>(styles: T): Record<keyof T, string> {
  const prefix = `_w`
  const keys = Object.keys(styles)
  const result = {} as Record<keyof T, string>
  const rules: string[] = []

  for (const key of keys) {
    _counter++
    const className = `${prefix}${_counter}`
    result[key as keyof T] = className
    rules.push(`.${className} { ${styles[key]} }`)
  }

  const styleId = `_w_${keys.join('_')}`
  if (!_injected.has(styleId)) {
    _injected.add(styleId)
    const style = document.createElement('style')
    style.setAttribute('data-wefu-css', styleId)
    style.textContent = rules.join('\n')
    if (document.head) {
      document.head.appendChild(style)
    }
  }

  return result
}
