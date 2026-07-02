import { Router } from '@weifuwujs/core'
import { page, h, ref, computed, when, shell } from '@weifuwujs/ui'

export const app = new Router()

// ── Shell (global layout) ──

app.use(shell(({ head, content, bridge }) => `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${head.title || 'weifuwu UI'}</title>
  <meta name="description" content="${head.description || ''}"/>
  <link rel="stylesheet" href="/_ui/weifuwu-ui.css"/>
</head>
<body>
  <nav class="wui-nav">
    <a href="/" class="wui-nav-brand">weifuwu</a>
    <a href="/" class="wui-nav-item">Home</a>
    <a href="/counter" class="wui-nav-item">Counter</a>
  </nav>
  <main class="wui-max-w-lg" style="margin:24px auto;padding:0 16px">
    ${content}
  </main>
  <script id="__wui-data" type="application/json">${JSON.stringify(bridge)}</script>
  <script defer src="/_ui/weifuwu-ui.js"></script>
</body>
</html>`))

// ── Pages ──

const home = page((ctx) => {
  ctx.head = { title: 'weifuwu UI', description: 'Full-stack web framework' }
  return h('div', { class: 'wui-card', style: 'text-align:center;padding:32px;margin-top:40px' },
    h('h1', null, 'weifuwu UI'),
    h('p', { style: 'color:var(--wui-text-secondary)' },
      'No build step, no VDOM, no bundle.',
    ),
  )
})

const counter = page(() => {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)
  const showCounter = ref(false)

  return h('div', { class: 'wui-card', style: 'padding:32px;margin-top:40px' },
    h('h2', null, 'Reactive counter'),
    h('div', { class: 'wui-flex wui-justify-center wui-gap-2', style: 'margin-bottom:12px' },
      h('button', { class: 'wui-btn', onclick: () => count.value-- }, '-'),
      h('span', { style: 'font-size:32px;font-weight:700;min-width:48px;text-align:center' }, count),
      h('button', { class: 'wui-btn wui-btn--primary', onclick: () => count.value++ }, '+'),
    ),
    h('p', { style: 'color:var(--wui-text-secondary)' }, 'Doubled: ', doubled),

    h('hr'),
    h('button', { class: 'wui-btn', onclick: () => showCounter.value = !showCounter.value },
      'Toggle detail',
    ),
    when(showCounter, () => h('p', { class: 'wui-card', style: 'padding:12px;margin-top:8px' },
      'Conditional content via when()',
    )),
  )
})

// ── Routes ──

app.get('/', home)
app.get('/counter', counter)
app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))
