import { html, raw, wfuwVersion } from 'weifuwu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (body: string, ctx: any) {
  const themeVal = ctx.theme?.value || 'system'
  const resolvedTheme = themeVal === 'dark' ? 'dark' : 'light'
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
        <script defer src="/__wfw/js/alpine.min.js?v=${wfuwVersion}"></script>
        <script src="/__wfw/js/weifuwu-ui.js?v=${wfuwVersion}"></script>
        <script id="__wf-i18n" type="application/json">
          ${raw(JSON.stringify(messages))}
        </script>
        ${ctx.flash?.value
          ? raw(
              `<script id="__wf-flash" type="application/json">${JSON.stringify({ message: ctx.flash.value })}</script>`,
            )
          : ''}
        <style>
          body { margin: 0; }
        </style>
      </head>
      <body data-locale="${locale}">
        ${raw(body)}
        <div id="__wf-toast-container" style="position:fixed;bottom:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;"></div>
      </body>
    </html>`
}
