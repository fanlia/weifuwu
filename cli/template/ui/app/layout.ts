import { html, raw, assetScripts } from 'weifuwu'

export default function(body: string, ctx: any) {
  // Theme: read from ctx at server, resolve system on client
  const themeVal = ctx.theme?.value || 'system'
  const isDark = themeVal === 'dark' || (themeVal === 'system' && false)
  const htmlClass = isDark ? 'dark' : ''
  const themeScript = raw(`<script>
!function(){
var t=(document.cookie.match(/(?:^|;\s*)theme=([^;]+)/)||[])[1]||'system';
if(t==='system')t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
document.documentElement.classList.toggle('dark',t==='dark');
}()
</script>`)

  // i18n: set lang attribute
  const lang = ctx.i18n?.locale || 'en'

  // CSS: include compiled stylesheet
  const cssLink = ctx.css?.url
    ? raw(`<link rel="stylesheet" href="${ctx.css.url}">`)
    : ''

  return html`<!DOCTYPE html>
<html lang="${lang}" class="${htmlClass}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${themeScript}
  ${assetScripts()}
  ${cssLink}
</head>
<body class="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
  ${raw(body)}
</body>
</html>`
}
