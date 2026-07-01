import { html } from '../../../ssr/html.ts'
export default function (ctx: { params: Record<string, string> }) {
  return html`<h1>${ctx.params.slug ?? 'default'}</h1>`
}
