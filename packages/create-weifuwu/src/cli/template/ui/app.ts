import { Router, html, raw, theme, i18n, flash, csrf } from '@weifuwujs/core'
import { weifuwuiAssets } from '@weifuwu/ui'

export const app = new Router()

// ── Middleware ──────────────────────────────────────────────────
app.use(theme().middleware())
app.use(i18n({ dir: './locales' }).middleware())
app.use(flash())
app.use(csrf())

// ── UI assets (serves weifuwu-ui.js + weifuwu-ui.css) ──────────
app.use('/_ui', weifuwuiAssets())

// ── Theme / i18n route switches ────────────────────────────────
app.use('/', theme())
app.use('/', i18n())

// ── Layout — wraps all pages ───────────────────────────────────
function Layout(body: string, ctx: any) {
  const t = ctx.i18n?.t || ((k: string) => k)
  return html`
<!DOCTYPE html>
<html lang="${ctx.i18n?.locale || 'en'}" data-theme="${ctx.theme?.value || 'light'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>weifuwu UI</title>
  <link rel="stylesheet" href="/_ui/weifuwu-ui.css" />
  <script id="__wui-data" type="application/json">${raw(JSON.stringify({
    theme: ctx.theme?.value || 'system',
    locale: ctx.i18n?.locale || 'en',
    messages: ctx.i18n?.messages || {},
  }))}</script>
</head>
<body>
  <nav class="wui-nav">
    <a href="/" class="wui-nav-brand">weifuwu</a>
    <a href="/" class="wui-nav-item">${t('home')}</a>
    <a href="/about" class="wui-nav-item">${t('about')}</a>
    <div style="margin-left:auto;display:flex;gap:12px;align-items:center">
      <a href="/__theme/dark" class="wui-nav-item">🌙</a>
      <a href="/__theme/light" class="wui-nav-item">☀️</a>
      <a href="/__lang/zh-CN" class="wui-nav-item">中文</a>
      <a href="/__lang/en" class="wui-nav-item">EN</a>
    </div>
  </nav>
  <main class="wui-max-w-lg" style="margin:24px auto;padding:0 16px">
    ${raw(body)}
  </main>
  <script defer src="/_ui/weifuwu-ui.js"></script>
</body>
</html>
  `
}

// ── Pages ───────────────────────────────────────────────────────

app.get('/', (req, ctx) => {
  return new Response(Layout(html`
    <div class="wui-card" style="text-align:center;padding:48px 24px;margin-top:40px">
      <h1 style="font-size:2rem;font-weight:700;margin-bottom:8px">${ctx.i18n?.t('title') || 'weifuwu UI'}</h1>
      <p style="color:var(--wui-text-secondary);margin-bottom:24px">${ctx.i18n?.t('subtitle') || 'h() + Signal + CSS — no build step'}</p>
      <div id="app"></div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:24px">
        <a href="/api/ping" class="wui-btn wui-btn--primary">API Ping</a>
        <a href="/about" class="wui-btn">${ctx.i18n?.t('about') || 'About'}</a>
      </div>
      <p style="margin-top:24px;font-size:14px;color:var(--wui-text-secondary)">
        ${ctx.i18n?.t('theme') || 'Theme'}: ${ctx.theme?.value || 'system'} &middot;
        ${ctx.i18n?.t('locale') || 'Locale'}: ${ctx.i18n?.locale || 'en'}
      </p>
    </div>
  `, ctx), { headers: { 'content-type': 'text/html' }})
})

app.get('/about', (req, ctx) => {
  return new Response(Layout(html`
    <div class="wui-card" style="margin-top:40px">
      <div class="wui-card__header">${ctx.i18n?.t('about') || 'About'}</div>
      <p>${ctx.i18n?.t('aboutText') || 'weifuwu UI is built with h() + Signal — a minimal reactive UI layer for weifuwu.'}</p>
    </div>
  `, ctx), { headers: { 'content-type': 'text/html' }})
})

// ── API ─────────────────────────────────────────────────────────

app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))

app.get('/api/hello', () => new Response(html`<p class="wui-alert wui-alert--success">Hello from server!</p>`))
