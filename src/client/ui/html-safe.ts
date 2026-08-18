/**
 * HtmlSafe — 标记"已是安全 HTML"的字符串（SSR 输出/unsafe 用户输入）。
 *
 * ctx.ui.html 的 stringify 对插值默认转义；instanceof HtmlSafe 的值原样内联。
 * 与 ctx.ui.ssr 的产物共用同一类，保证模板内联不二次转义。
 */

export class HtmlSafe {
  value: string
  constructor(value: string) {
    this.value = value
  }
  toString() { return this.value }
}
