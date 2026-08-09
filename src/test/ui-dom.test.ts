/**
 * weifuwu/ui-dom 独立测试 — UIRouter + VDOM（完全独立于 src/client）
 *
 * 验证：
 *   - serveUI 绑定根节点 + URL 驱动渲染（req = window.location）
 *   - handler = async (location, ctx) => VNode（res = VNode）
 *   - ctx.params/query 注入
 *   - $ 路由实例绑定（赋值重渲染，data 缓存命中）
 *   - 中间件链（layout 包装 children）
 *   - 子路由挂载 use(prefix, sub)
 *   - 404
 */

import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { UIRouter, serveUI, h, createReactiveState } from '../ui-dom/index.ts'
import type { UIHandler, UIMiddleware } from '../ui-dom/index.ts'

before(setupJsdom)

afterEach(() => {
  document.body.innerHTML = ''
  window.history.pushState(null, '', '/')
})

function mount(id: string): HTMLDivElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.id = id
  return el
}

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

test('serveUI 渲染 handler 的 VNode 到根节点（res = VNode）', async () => {
  const ui = new UIRouter()
  ui.get('/home', () => h('div', { id: 'home' }, '首页'))
  window.history.pushState(null, '', '/home')
  const el = mount('ui-root')
  serveUI(ui, { root: '#ui-root' })
  await flush()
  assert.equal(el.querySelector('#home')?.textContent, '首页')
})

test('handler 是 async：ctx.data.get 取数 → VNode', async () => {
  const ui = new UIRouter()
  ui.get('/users/:id', async (location, ctx) => {
    const user = await ctx.ui.data.get(`/api/users/${ctx.params.id}`, async () => ({ name: '张三' }))
    return h('div', { id: 'user' }, `用户: ${(user as any).name}`)
  })
  window.history.pushState(null, '', '/users/42')
  const el = mount('ui-async')
  serveUI(ui, { root: '#ui-async' })
  await flush()
  assert.equal(el.querySelector('#user')?.textContent, '用户: 张三')
  assert.equal(ui.ctx.params.id, '42', 'params 在 ctx')
})

test('$ 路由实例绑定：赋值重渲染，data 缓存命中（外层只一次）', async () => {
  let fetchCount = 0
  const ui = new UIRouter()
  ui.get('/counter', async (location, ctx) => {
    const data = await ctx.ui.data.get('/api/counter', async () => {
      fetchCount++
      return { title: '计数器' }
    })
    const $ = ctx.ui.$()
    $.count = $.count ?? 0
    return h('div', {},
      h('span', { id: 'count' }, String($.count)),
      h('button', {
        id: 'inc',
        onClick: () => { $.count = $.count + 1 },
      }, '+'),
    )
  })
  window.history.pushState(null, '', '/counter')
  const el = mount('ui-counter')
  serveUI(ui, { root: '#ui-counter' })
  await flush()
  assert.equal(el.querySelector('#count')?.textContent, '0')
  assert.equal(fetchCount, 1, '首次取数一次')

  // 点击 → $ 赋值 → 重渲染（data 缓存命中，不重取数）
  ;(el.querySelector('#inc') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#count')?.textContent, '1', '$ 赋值重渲染')
  assert.equal(fetchCount, 1, '重渲染不重取数（外层只使用一次）')
})

test('中间件链：layout 包装 children（两阶段）', async () => {
  const ui = new UIRouter()
  const Shell: UIMiddleware = async (location, ctx, children) => {
    return async (loc, c) => {
      const child = await children(loc, c)
      return h('div', { id: 'shell' }, h('nav', { id: 'nav' }, '导航'), child)
    }
  }
  ui.use(Shell)
  ui.get('/page', () => h('div', { id: 'page' }, '内容'))
  window.history.pushState(null, '', '/page')
  const el = mount('ui-layout')
  serveUI(ui, { root: '#ui-layout' })
  await flush()
  assert.ok(el.querySelector('#shell'), 'layout 包装')
  assert.ok(el.querySelector('#nav'), 'layout 内导航')
  assert.ok(el.querySelector('#page'), '页面在 layout 内（children）')
})

test('子路由挂载 use(prefix, subRouter)', async () => {
  const admin = new UIRouter()
  admin.get('/users', () => h('div', { id: 'admin-users' }, '用户管理'))
  const ui = new UIRouter()
  ui.use('/admin', admin)
  window.history.pushState(null, '', '/admin/users')
  const el = mount('ui-sub')
  serveUI(ui, { root: '#ui-sub' })
  await flush()
  assert.equal(el.querySelector('#admin-users')?.textContent, '用户管理')
})

test('404 notFound', async () => {
  const ui = new UIRouter()
  ui.get('/', () => h('div', {}, 'home'))
  ui.notFound(() => h('div', { id: 'nf' }, '404'))
  window.history.pushState(null, '', '/nonexistent')
  const el = mount('ui-nf')
  serveUI(ui, { root: '#ui-nf' })
  await flush()
  assert.equal(el.querySelector('#nf')?.textContent, '404')
})

test('createReactiveState 独立（$ 深度响应式）', () => {
  let notified = 0
  const state = createReactiveState(() => notified++)
  state.a = 1
  state.obj = { x: 0 }
  state.obj.x = 5   // 深度赋值
  assert.equal(notified, 3, '赋值 + 深层赋值都触发')
  const unsub = state.__watch(() => notified++)
  state.b = 2
  assert.equal(notified, 5, '赋值触发主回调 + 订阅者')
  unsub()
  state.c = 3
  assert.equal(notified, 6, '退订后仅主回调（+1），订阅者不再通知')
})

test('VDOM diff：patchValue 增量更新（同结构不重建）', async () => {
  const ui = new UIRouter()
  let renderCount = 0
  ui.get('/diff', async (location, ctx) => {
    renderCount++
    const $ = ctx.ui.$()
    $.n = $.n ?? 0
    return h('div', { id: 'd' },
      h('span', { id: 'n' }, String($.n)),
    )
  })
  window.history.pushState(null, '', '/diff')
  const el = mount('ui-diff')
  serveUI(ui, { root: '#ui-diff' })
  await flush()
  const span1 = el.querySelector('#n')
  assert.equal(span1?.textContent, '0')

  // 触发重渲染（$ 赋值）
  const $ = (ui.ctx.ui.$() as any)
  $.n = 1
  await flush()
  const span2 = el.querySelector('#n')
  assert.equal(span2?.textContent, '1')
  assert.equal(span1, span2, '同结构 span 复用（diff 不重建）')
})

// ═══════════════════════════════════════════════════════
// D1 — 组件级重渲染（交互子组件 $ 响应式）
// ═══════════════════════════════════════════════════════

test('交互子组件 $ 赋值 → 组件局部重渲染（父 handler 不重跑）', async () => {
  let handlerRuns = 0
  const ui = new UIRouter()
  // 交互子组件（两阶段 + 组件级 $）
  const Counter = (initProps: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.count = 0
    return (props: any) => h('div', { id: `counter-${props.id}` },
      h('span', { id: `n-${props.id}` }, String($.count)),
      h('button', { id: `inc-${props.id}`, onClick: () => { $.count = $.count + 1 } }, '+'),
    )
  }
  ui.get('/counters', async (location, ctx) => {
    handlerRuns++
    const $ = ctx.ui.$()   // 路由实例级 $（handler 层）
    $.loaded = $.loaded ?? true
    return h('div', { id: 'page' },
      h(Counter, { id: 'a' }),
      h(Counter, { id: 'b' }),
    )
  })
  window.history.pushState(null, '', '/counters')
  const el = mount('ui-comp')
  serveUI(ui, { root: '#ui-comp' })
  await flush()
  assert.equal(el.querySelector('#n-a')?.textContent, '0')
  assert.equal(el.querySelector('#n-b')?.textContent, '0')
  assert.equal(handlerRuns, 1, 'handler 首次跑一次')

  // 点击 counter-a → 组件级 $ 赋值 → 仅 counter-a 重渲染
  ;(el.querySelector('#inc-a') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#n-a')?.textContent, '1', 'counter-a 更新')
  assert.equal(el.querySelector('#n-b')?.textContent, '0', 'counter-b 不更新（独立）')
  assert.equal(handlerRuns, 1, 'handler 不重跑（组件级局部重渲染）')
})

// ═══════════════════════════════════════════════════════
// D2 — keyed diff + style 属性 diff
// ═══════════════════════════════════════════════════════

test('keyed 列表重排：同 key 项复用 DOM（不重建），顺序移动', async () => {
  const ui = new UIRouter()
  ui.get('/list', async (location, ctx) => {
    const $ = ctx.ui.$()
    $.items = $.items ?? [{ id: 'a', v: 'A' }, { id: 'b', v: 'B' }, { id: 'c', v: 'C' }]
    return h('ul', { id: 'list' },
      ...($.items as any[]).map((it: any) =>
        h('li', { key: it.id, id: `li-${it.id}` }, `${it.v}`)
      ),
    )
  })
  window.history.pushState(null, '', '/list')
  const el = mount('ui-keyed')
  serveUI(ui, { root: '#ui-keyed' })
  await flush()
  const liA = el.querySelector('#li-a')
  const liB = el.querySelector('#li-b')
  assert.ok(liA && liB)

  // 重排：b 移到最前（keyed 移动，不重建）
  const $ = (ui.ctx.ui.$() as any)
  $.items = [{ id: 'b', v: 'B' }, { id: 'a', v: 'A' }, { id: 'c', v: 'C' }]
  await flush()
  const order = [...el.querySelectorAll('#list li')].map(n => n.id)
  assert.deepEqual(order, ['li-b', 'li-a', 'li-c'], 'keyed 移动顺序')
  assert.equal(el.querySelector('#li-a'), liA, 'li-a 复用不重建')
  assert.equal(el.querySelector('#li-b'), liB, 'li-b 复用不重建')
})

test('keyed 列表增删：移除消失 key，新增新 key', async () => {
  const ui = new UIRouter()
  ui.get('/crud', async (location, ctx) => {
    const $ = ctx.ui.$()
    $.items = $.items ?? [{ id: 'a' }, { id: 'b' }]
    return h('div', { id: 'crud' },
      ...($.items as any[]).map((it: any) => h('span', { key: it.id, id: `s-${it.id}` })),
    )
  })
  window.history.pushState(null, '', '/crud')
  const el = mount('ui-crud')
  serveUI(ui, { root: '#ui-crud' })
  await flush()
  assert.ok(el.querySelector('#s-a'))
  assert.ok(el.querySelector('#s-b'))

  // 移除 a，新增 d
  const $ = (ui.ctx.ui.$() as any)
  $.items = [{ id: 'b' }, { id: 'd' }]
  await flush()
  assert.ok(!el.querySelector('#s-a'), 'a 移除')
  assert.ok(el.querySelector('#s-b'), 'b 保留')
  assert.ok(el.querySelector('#s-d'), 'd 新增')
})

test('style diff：消失的 style 键被清除', async () => {
  const ui = new UIRouter()
  ui.get('/style', async (location, ctx) => {
    const $ = ctx.ui.$()
    $.show = $.show ?? true
    return h('div', { id: 'sty', style: $.show ? { display: 'block', color: 'red' } : { color: 'red' } }, 'x')
  })
  window.history.pushState(null, '', '/style')
  const el = mount('ui-style')
  serveUI(ui, { root: '#ui-style' })
  await flush()
  const div = el.querySelector('#sty') as HTMLElement
  assert.equal(div.style.display, 'block')
  assert.equal(div.style.color, 'red')

  // show=false → style 无 display → 应清除
  const $ = (ui.ctx.ui.$() as any)
  $.show = false
  await flush()
  assert.equal(div.style.display, '', 'display 被清除')
  assert.equal(div.style.color, 'red', 'color 保留')
})

// ═══════════════════════════════════════════════════════
// D4 — SSR（renderHtml）+ hydration（收养服务端 HTML）
// ═══════════════════════════════════════════════════════

test('renderHtml：VNode → HTML 字符串（SSR 落地）', async () => {
  const { renderHtml } = await import('../ui-dom/ssr.ts')
  // 组件（两阶段）SSR
  const Badge = (_init: any, ctx: any) => (props: any) => h('span', { class: `badge-${props.variant}` }, props.label)
  // 元素 + 属性（class/style/事件剔除）+ children
  const html = renderHtml(
    h('div', { id: 'app', class: 'shell' },
      h('h1', {}, '标题'),
      h(Badge, { variant: 'primary', label: '新' }),
      h('p', { style: { color: 'red', marginTop: '4px' }, onClick: () => {} }, '文本 & <转义>'),
      h('input', { type: 'text', value: 'x', disabled: true }),
    ),
    {},
  )
  assert.ok(html.includes('<div id="app" class="shell">'), '根元素')
  assert.ok(html.includes('<h1>标题</h1>'), '文本')
  assert.ok(html.includes('<span class="badge-primary">新</span>'), '组件 SSR')
  assert.ok(html.includes('style="color:red;margin-top:4px"'), 'style 序列化')
  assert.ok(!html.includes('onClick') && !html.includes('onclick'), '事件不 SSR')
  assert.ok(html.includes('文本 &amp; &lt;转义&gt;'), '文本转义')
  assert.ok(html.includes('<input type="text" value="x" disabled>'), 'boolean 属性')
  assert.ok(!html.includes('undefined'), '无 undefined 泄漏')
})

test('serveUI hydrate：收养服务端 HTML，不重建 DOM', async () => {
  const pre = h('div', { id: 'hyd-page' },
    h('h2', {}, 'SSR 标题'),
    h('button', { id: 'hyd-btn' }, '点击'),
    h('span', { id: 'hyd-n' }, '0'),
  )
  const { renderHtml } = await import('../ui-dom/ssr.ts')
  const el = mount('ui-hyd')
  el.innerHTML = renderHtml(pre)

  const ui = new UIRouter()
  ui.get('/hyd', (location, ctx) => {
    const $ = ctx.ui.$()
    $.n = $.n ?? 0
    return h('div', { id: 'hyd-page' },
      h('h2', {}, 'SSR 标题'),
      h('button', { id: 'hyd-btn', onClick: () => { $.n = $.n + 1 } }, `点击`),
      h('span', { id: 'hyd-n' }, String($.n)),
    )
  })
  window.history.pushState(null, '', '/hyd')
  serveUI(ui, { root: '#ui-hyd', hydrate: true })
  await flush()

  // 服务端已有元素未被重建（同一引用）
  assert.equal(el.querySelector('#hyd-page')?.textContent, 'SSR 标题点击0', '收养后内容完整')
  // 事件已接线：点击按钮 → $ 重渲染
  ;(el.querySelector('#hyd-btn') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#hyd-n')?.textContent, '1', 'hydrate 后事件可用（$ 重渲染）')
})



