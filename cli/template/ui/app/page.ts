import { html, raw } from 'weifuwu'

export default function (ctx: any) {
  const t = ctx.i18n?.t || ((k: string) => k)
  const themeVal = ctx.theme?.value || 'system'
  const btnTheme = themeVal === 'dark' ? 'light' : 'dark'
  const btnIcon = btnTheme === 'dark' ? '🌙' : '☀️'
  const locale = ctx.i18n?.locale || 'en'
  const btnLang = locale === 'zh-CN' ? 'en' : 'zh-CN'
  const langLabel = btnLang === 'zh-CN' ? '中文' : 'EN'

  return html`
  <div>
    <nav class="wu-flex wu-items-center wu-justify-between wu-p-4 wu-border-bottom">
      <strong class="wu-text-lg">weifuwu</strong>
      <div class="wu-flex wu-gap-sm wu-items-center">
        <button data-wf-theme="${btnTheme}" class="wu-btn wu-btn-sm">${raw(btnIcon)}</button>
        <button data-wf-lang="${btnLang}" class="wu-btn wu-btn-sm">${raw(langLabel)}</button>
      </div>
    </nav>

    <section class="wu-p-4" style="max-width: 640px; margin: 80px auto; text-align: center;">
      <h1 class="wu-text-2xl" style="margin-bottom: 8px;" wu-text-key="title">${t('title')}</h1>
      <p class="wu-text-secondary wu-text-md" style="margin-bottom: 32px;">Pure Node.js, no build step</p>

      <div class="wu-flex wu-justify-center wu-gap-md">
        <button class="wu-btn wu-btn-primary"
                onclick="var el=document.getElementById('demo-card');el.style.display=el.style.display==='none'?'block':'none'"
                wu-text-key="cta">${t('cta')}</button>
        <a href="/chat" class="wu-btn wu-btn-secondary" wu-text-key="chat">${t('chat')}</a>
        <a href="https://weifuwu.dev" class="wu-btn" target="_blank" wu-text-key="docs">${t('docs')}</a>
      </div>

      <div style="margin-top: 24px;">
        <button class="wu-btn wu-btn-sm" onclick="wfFetch('/api/ping').then(function(r){document.getElementById('ping-result').textContent=r})">Ping API</button>
        <code id="ping-result" style="display:inline-block;margin-left:12px;font-size:14px;"></code>
      </div>

      <div id="demo-card" style="display:none;margin-top:24px;" class="wu-card" style="text-align:left;" wu-text-key="demo">
        ${raw(t('demo'))}
      </div>
    </section>

    <div id="__wf-toast-container" style="position:fixed;bottom:16px;right:16px;z-index:9999;"></div>
  </div>`
}
