import { html, raw } from '../../../../ssr/html.ts'
export default function (body: string, ctx: any) {
  const cssLink = ctx.css ? raw(`<link rel="stylesheet" href="${ctx.css.url}">`) : ''
  return html`<!DOCTYPE html>
    <html>
      <head>
        ${cssLink}
      </head>
      <body>
        ${raw(body)}
      </body>
    </html>`
}
