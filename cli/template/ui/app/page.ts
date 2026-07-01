import { html, raw } from 'weifuwu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (ctx: any) {
  const t = ctx.i18n?.t || ((k: string) => k)
  const locale = ctx.i18n?.locale || 'en'
  const btnLang = locale === 'zh-CN' ? 'en' : 'zh-CN'
  const langLabel = btnLang === 'zh-CN' ? '中文' : 'EN'

  return html`<div x-data="{ open: false }">
    <nav class="wu-flex wu-items-center wu-justify-between wu-p-4 wu-border-bottom">
      <strong class="wu-text-lg">weifuwu</strong>
      <div class="wu-flex wu-gap-sm wu-items-center">
        <!-- Theme toggle (Alpine store) -->
        <button data-wf-theme="dark" class="wu-btn wu-btn-sm"
                @click="$store.theme.toggle()"
                x-text="$store.theme.value === 'dark' ? '☀️' : '🌙'">🌙</button>
        <!-- Lang toggle (Alpine store) -->
        <button data-wf-lang="${btnLang}" class="wu-btn wu-btn-sm"
                @click="$store.i18n.switch($store.i18n.locale === 'zh-CN' ? 'en' : 'zh-CN')">${raw(langLabel)}</button>
      </div>
    </nav>

    <section class="wu-p-4" style="max-width: 640px; margin: 80px auto; text-align: center;">
      <h1 class="wu-text-2xl" style="margin-bottom: 8px;"
          x-text="$store.i18n.t('title')">${t('title')}</h1>
      <p class="wu-text-secondary wu-text-md" style="margin-bottom: 32px;">
        Pure Node.js, no build step
      </p>

      <div class="wu-flex wu-justify-center wu-gap-md">
        <button class="wu-btn wu-btn-primary" @click="open = !open"
                x-text="$store.i18n.t('cta')">${t('cta')}</button>
        <a href="/chat" class="wu-btn wu-btn-secondary"
           x-text="$store.i18n.t('chat')">${t('chat')}</a>
        <a href="https://weifuwu.dev" class="wu-btn" target="_blank"
           x-text="$store.i18n.t('docs')">${t('docs')}</a>
      </div>

      <div x-show="open" class="wu-card" style="margin-top: 24px; text-align: left;"
           x-text="$store.i18n.t('demo')">${t('demo')}</div>
    </section>

    <!-- Flash message (Alpine store) -->
    <template x-teleport="body">
      <div x-show="$store.flash.show" x-transition
           class="wu-toast wu-toast-info" style="position:fixed;top:16px;right:16px;z-index:9999;"
           x-text="$store.flash.message"
           @click="$store.flash.clear()"></div>
    </template>
  </div>`
}
