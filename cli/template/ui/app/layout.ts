import { html, raw, assetScripts } from 'weifuwu'

export default function(body: string, ctx: any) {
  // Theme: resolve at server from cookie, override 'system' on client
  const themeVal = ctx.theme?.value || 'system'
  const resolvedTheme = themeVal === 'dark' ? 'dark' : 'light'

  const themeScript = raw(`<script>
!function(){
var t=(document.cookie.match(/(?:^|;\s*)theme=([^;]+)/)||[])[1]||'system';
if(t==='system')t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme',t);
}()
</script>`)

  // i18n: set lang attribute
  const lang = ctx.i18n?.locale || 'en'

  // CSS: include compiled stylesheet
  const cssLink = ctx.css?.url
    ? raw(`<link rel="stylesheet" href="${ctx.css.url}">`)
    : ''

  return html`<!DOCTYPE html>
<html lang="${lang}" data-theme="${resolvedTheme}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${themeScript}
  <style>
    /* Force dark mode when data-theme is set */
    [data-theme="dark"] body {
      background-color: #030712 !important;
      color: #f3f4f6 !important;
    }
  </style>
  ${assetScripts()}
  ${cssLink}
</head>
<body class="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
  ${raw(body)}
</body>
</html>`
}
