import { Router, html, raw, theme, i18n, flash, csrf } from '@weifuwujs/core'
import { weifuwuiAssets } from '@weifuwujs/ui'

export const app = new Router()

// ── Middleware ──────────────────────────────────────────────────
app.use(theme().middleware())
app.use(i18n({ dir: './locales' }).middleware())
app.use(flash())
app.use(csrf())
app.use('/_ui', weifuwuiAssets())
app.use('/', theme())
app.use('/', i18n())

// ── Layout ─────────────────────────────────────────────────────
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
    <a href="/showcase" class="wui-nav-item">CSS</a>
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

// ── Home — interactive demo ────────────────────────────────────

app.get('/', (req, ctx) => {
  const t = ctx.i18n?.t || ((k: string) => k)
  return new Response(Layout(html`
    <div class="wui-card" style="text-align:center;padding:48px 24px;margin-top:40px">
      <h1 style="font-size:2rem;font-weight:700;margin-bottom:8px">${t('title')}</h1>
      <p style="color:var(--wui-text-secondary);margin-bottom:24px">${t('subtitle')}</p>

      <!-- Interactive counter (powered by h() + ref) -->
      <div id="counter-demo" class="wui-flex wui-justify-center wui-gap-3" style="margin-bottom:24px"></div>

      <!-- Interactive todo (powered by component() + signal()) -->
      <div id="todo-demo" style="margin-bottom:24px"></div>

      <div style="display:flex;gap:12px;justify-content:center;margin-top:24px">
        <a href="/showcase" class="wui-btn wui-btn--primary">${t('showcase')}</a>
        <a href="/about" class="wui-btn">${t('about')}</a>
      </div>
      <p style="margin-top:24px;font-size:14px;color:var(--wui-text-secondary)">
        ${t('theme')}: ${ctx.theme?.value || 'system'} &middot;
        ${t('locale')}: ${ctx.i18n?.locale || 'en'}
      </p>
    </div>

    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const w = weifuwu

        // ── Counter demo ──
        const count = ref(0)
        reactiveRender(document.getElementById('counter-demo'), () =>
          h('div', { class: 'wui-flex wui-items-center wui-gap-2' },
            h('button', {
              class: 'wui-btn',
              onclick: () => count.value--,
            }, '-'),
            h('span', { style: 'font-size:24px;font-weight:700;min-width:40px;text-align:center' }, count),
            h('button', {
              class: 'wui-btn wui-btn--primary',
              onclick: () => count.value++,
            }, '+'),
            h('span', { class: 'wui-badge wui-badge--info', style: 'margin-left:8px' }, 'ref() + h()'),
          )
        )

        // ── Todo demo ──
        const TodoApp = component(() => {
          const items = signal([])
          const input = signal('')

          function add() {
            if (!input.value.trim()) return
            items.value = [...items.value, { text: input.value, done: false }]
            input.value = ''
          }
          function toggle(i) {
            const next = [...items.value]
            next[i] = { ...next[i], done: !next[i].done }
            items.value = next
          }

          return h('div', { class: 'wui-card', style: 'text-align:left;max-width:360px;margin:0 auto' },
            h('div', { class: 'wui-card__header' }, '📋 ' + weifuwu.i18n.t('todoTitle') || 'Todo'),
            h('div', { class: 'wui-flex wui-gap-2', style: 'margin-bottom:12px' },
              h('input', {
                class: 'wui-input',
                placeholder: weifuwu.i18n.t('todoPlaceholder') || 'Add a todo...',
                value: input,
                oninput: (e) => { input.value = e.target.value },
                onkeydown: (e) => { if (e.key === 'Enter') add() },
              }),
              h('button', { class: 'wui-btn wui-btn--primary', onclick: add }, '+'),
            ),
            h('div', null,
              ...items.value.map((item, i) =>
                h('div', { class: 'wui-flex wui-items-center wui-gap-2', style: 'padding:6px 0' },
                  h('input', { type: 'checkbox', checked: item.done, onchange: () => toggle(i) }),
                  h('span', {
                    style: item.done ? 'text-decoration:line-through;color:var(--wui-text-secondary)' : '',
                  }, item.text),
                )
              )
            ),
            h('div', { style: 'margin-top:8px;font-size:12px;color:var(--wui-text-secondary)' },
              items.value.filter(i => i.done).length + ' / ' + items.value.length + ' done'
            ),
            h('span', { class: 'wui-badge wui-badge--success', style: 'margin-top:8px' }, 'component() + signal()'),
          )
        })

        render(document.getElementById('todo-demo'), () => TodoApp({}))
      })
    </script>
  `, ctx), { headers: { 'content-type': 'text/html' }})
})

// ── Showcase — CSS 组件展示 ────────────────────────────────────

app.get('/showcase', (req, ctx) => {
  return new Response(Layout(html`
    <h2 style="margin:24px 0 16px">🎨 CSS Components</h2>

    <!-- Buttons -->
    <div class="wui-card" style="margin-bottom:16px">
      <div class="wui-card__header">Buttons — .wui-btn</div>
      <div class="wui-flex wui-gap-2 wui-flex-wrap">
        <button class="wui-btn">Default</button>
        <button class="wui-btn wui-btn--primary">Primary</button>
        <button class="wui-btn wui-btn--success">Success</button>
        <button class="wui-btn wui-btn--danger">Danger</button>
        <button class="wui-btn wui-btn--ghost">Ghost</button>
        <button class="wui-btn wui-btn--sm">Small</button>
        <button class="wui-btn wui-btn--lg">Large</button>
      </div>
    </div>

    <!-- Card -->
    <div class="wui-card" style="margin-bottom:16px">
      <div class="wui-card__header">Card — .wui-card</div>
      <p>This is a card with header, body, and footer.</p>
      <div class="wui-card__footer" style="display:flex;gap:8px">
        <button class="wui-btn wui-btn--primary">Save</button>
        <button class="wui-btn">Cancel</button>
      </div>
    </div>

    <!-- Badges -->
    <div class="wui-card" style="margin-bottom:16px">
      <div class="wui-card__header">Badges — .wui-badge</div>
      <div class="wui-flex wui-gap-2">
        <span class="wui-badge wui-badge--default">Default</span>
        <span class="wui-badge wui-badge--success">Success</span>
        <span class="wui-badge wui-badge--warning">Warning</span>
        <span class="wui-badge wui-badge--danger">Danger</span>
        <span class="wui-badge wui-badge--info">Info</span>
      </div>
    </div>

    <!-- Alerts -->
    <div class="wui-alert wui-alert--info" style="margin-bottom:8px">ℹ️ This is an info alert.</div>
    <div class="wui-alert wui-alert--success" style="margin-bottom:8px">✅ Operation completed successfully.</div>
    <div class="wui-alert wui-alert--warning" style="margin-bottom:8px">⚠️ Please check your input.</div>
    <div class="wui-alert wui-alert--danger" style="margin-bottom:16px">❌ Something went wrong.</div>

    <!-- Form -->
    <div class="wui-card" style="margin-bottom:16px">
      <div class="wui-card__header">Form — .wui-input / .wui-select</div>
      <label class="wui-label">Name</label>
      <input class="wui-input" placeholder="Enter your name" style="margin-bottom:12px" />
      <label class="wui-label">Role</label>
      <select class="wui-select" style="margin-bottom:12px">
        <option>Developer</option>
        <option>Designer</option>
        <option>Manager</option>
      </select>
      <label class="wui-checkbox" style="margin-bottom:12px">
        <input type="checkbox" checked /> Agree to terms
      </label>
    </div>

    <!-- Table -->
    <div class="wui-card" style="margin-bottom:16px">
      <div class="wui-card__header">Table — .wui-table</div>
      <table class="wui-table">
        <thead>
          <tr><th>Name</th><th>Role</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr><td>Alice</td><td>Admin</td><td><span class="wui-badge wui-badge--success">Active</span></td></tr>
          <tr><td>Bob</td><td>User</td><td><span class="wui-badge wui-badge--default">Inactive</span></td></tr>
          <tr><td>Charlie</td><td>Editor</td><td><span class="wui-badge wui-badge--info">Pending</span></td></tr>
        </tbody>
      </table>
    </div>

    <!-- Tabs -->
    <div class="wui-card" style="margin-bottom:16px">
      <div class="wui-card__header">Tabs — .wui-tabs</div>
      <div class="wui-tabs">
        <button class="wui-tab wui-tab--active">Tab 1</button>
        <button class="wui-tab">Tab 2</button>
        <button class="wui-tab">Tab 3</button>
      </div>
      <p style="margin-top:8px">Tab content goes here.</p>
    </div>
  `, ctx), { headers: { 'content-type': 'text/html' }})
})

// ── About ──────────────────────────────────────────────────────

app.get('/about', (req, ctx) => {
  const t = ctx.i18n?.t || ((k: string) => k)
  return new Response(Layout(html`
    <div class="wui-card" style="margin-top:40px">
      <div class="wui-card__header">${t('about')}</div>
      <p>${t('aboutText')}</p>
      <div style="margin-top:16px">
        <a href="/api/ping" class="wui-btn wui-btn--primary">API Ping</a>
        <a href="/showcase" class="wui-btn" style="margin-left:8px">${t('showcase')}</a>
      </div>
    </div>
  `, ctx), { headers: { 'content-type': 'text/html' }})
})

// ── API ────────────────────────────────────────────────────────

app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))
