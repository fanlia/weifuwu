import { html, raw } from 'weifuwu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (ctx: any) {
  const t = ctx.i18n?.t || ((k: string) => k)
  // Theme/language buttons: show opposite (click to switch)
  const themeVal = ctx.theme?.value || 'system'
  const btnTheme = themeVal === 'dark' ? 'light' : 'dark'
  const btnIcon = btnTheme === 'dark' ? '🌙' : '☀️'
  const locale = ctx.i18n?.locale || 'en'
  const btnLang = locale === 'zh-CN' ? 'en' : 'zh-CN'
  const langLabel = btnLang === 'zh-CN' ? '中文' : 'EN'

  return html`<div wu-data='${raw(JSON.stringify({ open: false }))}'>
    <nav class="wu-flex wu-items-center wu-justify-between wu-p-4 wu-border-bottom">
      <strong class="wu-text-lg">weifuwu</strong>
      <div class="wu-flex wu-gap-sm wu-items-center">
        <button wu-theme="${btnTheme}" class="wu-btn wu-btn-sm">${raw(btnIcon)}</button>
        <button wu-lang="${btnLang}" class="wu-btn wu-btn-sm" wu-text-key="lang">${raw(langLabel)}</button>
      </div>
    </nav>

    <section class="wu-p-4" style="max-width: 640px; margin: 80px auto; text-align: center;">
      <h1 class="wu-text-2xl" style="margin-bottom: 8px;" wu-text-key="title">${t('title')}</h1>
      <p class="wu-text-secondary wu-text-md" style="margin-bottom: 32px;">
        Pure Node.js, no build step
      </p>

      <div class="wu-flex wu-justify-center wu-gap-md">
        <button class="wu-btn wu-btn-primary" wu-on="click: open = !open" wu-text-key="cta">${t('cta')}</button>
        <a href="https://weifuwu.dev" class="wu-btn" target="_blank" wu-text-key="docs">${t('docs')}</a>
      </div>

      <div wu-show="open" class="wu-card" style="margin-top: 24px; text-align: left;" wu-text-key="demo">
        ${t('demo')}
      </div>
    </section>
  </div>`
}
