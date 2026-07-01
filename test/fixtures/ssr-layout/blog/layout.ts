import { html, raw } from '../../../../ssr/html.ts'
export default function (body: string) {
  return html`<nav>Nav</nav>
    <main>${raw(body)}</main>`
}
