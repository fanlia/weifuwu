import { html, raw } from '../../../../ssr/html.ts'
export default function (body: string) {
  return html`<!DOCTYPE html>
    <html>
      <body>
        ${raw(body)}
      </body>
    </html>`
}
