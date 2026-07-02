import { Router, page, h, ref, computed, setDefaultLayout } from '@weifuwujs/ui'

// ── Global layout nav ──────────────────────────────────────────
setDefaultLayout((content, ctx) => `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>weifuwu UI</title>
  <link rel="stylesheet" href="/_ui/weifuwu-ui.css"/>
</head>
<body>
  <nav class="wui-nav">
    <a href="/" class="wui-nav-brand">weifuwu</a>
    <a href="/" class="wui-nav-item">Home</a>
    <a href="/api/ping" class="wui-nav-item">API</a>
  </nav>
  <main class="wui-max-w-lg" style="margin:24px auto;padding:0 16px">
    ${content}
  </main>
  <script defer src="/_ui/weifuwu-ui.js"></script>
</body>
</html>`)

// ── Pages ──────────────────────────────────────────────────────

const home = page(() => {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)

  return h('div', { class: 'wui-card', style: 'text-align:center;padding:32px;margin-top:40px' },
    h('h1', null, 'weifuwu UI'),
    h('p', { style: 'color:var(--wui-text-secondary);margin-bottom:16px' },
      'Reactive counter — no build step, no VDOM',
    ),
    h('div', { class: 'wui-flex wui-justify-center wui-gap-2', style: 'margin-bottom:12px' },
      h('button', { class: 'wui-btn', onclick: () => count.value-- }, '-'),
      h('span', { style: 'font-size:32px;font-weight:700;min-width:48px;text-align:center' }, count),
      h('button', { class: 'wui-btn wui-btn--primary', onclick: () => count.value++ }, '+'),
    ),
    h('div', { style: 'font-size:14px;color:var(--wui-text-secondary)' },
      'Doubled: ', doubled,
    ),
  )
})

// ── Routes ──────────────────────────────────────────────────────

export const app = new Router()
  .get('/', home)
  .get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))
