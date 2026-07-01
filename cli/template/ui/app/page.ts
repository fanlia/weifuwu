import { html, raw } from 'weifuwu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (ctx: any) {
  const t = ctx.i18n?.t || ((k: string) => k)
  const theme = ctx.theme?.value || 'system'
  const locale = ctx.i18n?.locale || 'en'

  return html`<div wu-data='${raw(JSON.stringify({ open: false }))}'>
    <!-- Navbar -->
    <nav class="wu-flex wu-items-center wu-justify-between wu-p-4 wu-border-bottom">
      <strong class="wu-text-lg">weifuwu</strong>
      <div class="wu-flex wu-gap-sm wu-items-center">
        <button wu-theme="${theme === 'dark' ? 'light' : 'dark'}" class="wu-btn wu-btn-sm">
          ${theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button wu-lang="${locale === 'en' ? 'zh-CN' : 'en'}" class="wu-btn wu-btn-sm">
          ${locale === 'en' ? '中文' : 'EN'}
        </button>
      </div>
    </nav>

    <!-- Hero -->
    <section class="wu-p-4" style="max-width: 640px; margin: 80px auto; text-align: center;">
      <h1 class="wu-text-2xl" style="margin-bottom: 8px;">${t('title')}</h1>
      <p class="wu-text-secondary wu-text-md" style="margin-bottom: 32px;">
        Pure Node.js, no build step
      </p>

      <div class="wu-flex wu-justify-center wu-gap-md">
        <button class="wu-btn wu-btn-primary" wu-on="click: open = !open">${t('cta')}</button>
        <a href="https://weifuwu.dev" class="wu-btn" target="_blank"> ${t('docs')} </a>
      </div>

      <!-- Demo: toggled content -->
      <div wu-show="open" class="wu-card" style="margin-top: 24px; text-align: left;">
        ${t('demo')}
      </div>
    </section>
  </div>`
}
