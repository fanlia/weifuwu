import { html, raw, wfuwVersion } from 'weifuwu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (body: string, ctx: any) {
  // Theme
  const themeVal = ctx.theme?.value || 'system'
  const resolvedTheme = themeVal === 'dark' ? 'dark' : 'light'

  // i18n
  const locale = ctx.i18n?.locale || 'en'
  const messages = ctx.i18n?.messages || {}

  return html`<!DOCTYPE html>
    <html lang="${locale}" data-theme="${resolvedTheme}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>weifuwu</title>
        <link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css?v=${wfuwVersion}" />
        <script src="/__wfw/js/htmx.min.js?v=${wfuwVersion}"></script>
        <script src="/__wfw/js/weifuwu-ui.js?v=${wfuwVersion}"></script>
        <script id="__wfw-i18n" type="application/json">
          ${raw(JSON.stringify(messages))}
        </script>
        ${ctx.flash?.value
          ? raw(
              `<script id="__wfw-flash" type="application/json">${JSON.stringify(ctx.flash.value)}</script>`,
            )
          : ''}
        <style>
          body {
            margin: 0;
          }
        </style>
      </head>
      <body data-locale="${locale}">
        ${raw(body)}
      </body>
    </html>`
}
