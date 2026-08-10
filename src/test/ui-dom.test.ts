/**
 * weifuwu/ui-dom 测试 — UIRouter（纯路由）+ uiServe（渲染运行时）
 *
 * 定稿架构验证：
 *   - uiServe(router, {root}) 装配点：路由已注册 → serve 监听 URL → 渲染
 *   - handler = async (location, ctx) => vnode（$ 有效）
 *   - ctx.params/query 注入；ctx.data 缓存
 *   - 渲染运行时复制自 client（registry/createUi 局部实例隔离）
 *   - weifuwu/components 复用（路径 B 核心验证）
 */

import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'
import type { UIHandler, UIMiddleware, WfuiContext } from '../ui-dom/index.ts'

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

// ═══════════════════════════════════════════════════════
// 基础：handler 渲染 / data 缓存 / $ 路由实例
// ═══════════════════════════════════════════════════════

test('uiServe 渲染 handler 的 VNode 到根节点（res = VNode）', async () => {
  const router = new UIRouter()
  router.get('/home', () => h('div', { id: 'home' }, '首页'))
  window.history.pushState(null, '', '/home')
  const el = mount('ui-root')
  const handle = uiServe(router, { root: '#ui-root' })
  await flush()
  assert.equal(el.querySelector('#home')?.textContent, '首页')
  handle.close()
})

test('handler async：ctx.data 缓存命中（外层只使用一次）+ params 注入', async () => {
  let fetchCount = 0
  const router = new UIRouter()
  router.get('/users/:id', async (location, ctx) => {
    const user = await ctx.data.get(`/api/users/${ctx.params.id}`, async () => {
      fetchCount++
      return { name: '张三' }
    })
    const $ = ctx.ui.$()
    $.clicks = $.clicks ?? 0
    return h('div', { id: 'user' },
      h('span', { id: 'uname' }, `用户: ${(user as any).name}`),
      h('button', { id: 'uc', onClick: () => { $.clicks++ } }, String($.clicks)),
    )
  })
  window.history.pushState(null, '', '/users/42')
  const el = mount('ui-async')
  const handle = uiServe(router, { root: '#ui-async' })
  await flush()
  assert.equal(el.querySelector('#uname')?.textContent, '用户: 张三')
  assert.equal(fetchCount, 1, '首次取数一次')
  assert.equal(handle.ctx.params.id, '42', 'params 在 ctx')
  // 点击 → $ 重渲染（data 缓存命中，不重取数）
  ;(el.querySelector('#uc') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#uc')?.textContent, '1')
  assert.equal(fetchCount, 1, '重渲染不重取数')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// 中间件链 / 子路由（嵌套 + notFound + params + 段边界）
// ═══════════════════════════════════════════════════════

test('中间件链：layout 包装 children（两阶段）', async () => {
  const router = new UIRouter()
  const Shell: UIMiddleware = async (location, ctx, children) => {
    return async (loc, c) => {
      const child = await children(loc, c)
      return h('div', { id: 'shell' }, h('nav', { id: 'nav' }, '导航'), child)
    }
  }
  router.use(Shell)
  router.get('/page', () => h('div', { id: 'page' }, '内容'))
  window.history.pushState(null, '', '/page')
  const el = mount('ui-layout')
  const handle = uiServe(router, { root: '#ui-layout' })
  await flush()
  assert.ok(el.querySelector('#shell'), 'layout 包装')
  assert.ok(el.querySelector('#page'), '页面在 layout 内')
  handle.close()
})

test('子路由：sub 中间件链 + notFound + 两层嵌套 + params + 段边界', async () => {
  const router = new UIRouter()
  const admin = new UIRouter()
  // sub layout
  admin.use(async (_loc, ctx, children) => {
    return async (loc, c) => {
      const child = await children(loc, c)
      return h('div', { id: 'admin-shell' }, h('h1', {}, '后台'), child)
    }
  })
  const api = new UIRouter()
  api.get('/users/:id', (loc, ctx) => h('div', { id: 'api-user' }, `用户 ${ctx.params.id}`))
  admin.use('/api', api)
  admin.get('/', () => h('div', { id: 'admin-home' }, '后台首页'))
  admin.notFound(() => h('div', { id: 'admin-nf' }, '后台 404'))
  router.use('/admin', admin)
  router.notFound(() => h('div', { id: 'main-nf' }, '主站 404'))

  // 两层嵌套 + params
  window.history.pushState(null, '', '/admin/api/users/7')
  const el = mount('ui-nest')
  const handle = uiServe(router, { root: '#ui-nest' })
  await flush()
  assert.ok(el.querySelector('#admin-shell'), 'sub layout')
  assert.equal(el.querySelector('#api-user')?.textContent, '用户 7', '两层嵌套 + params')
  assert.equal(handle.ctx.params.id, '7')

  // sub notFound（主 app 404 不覆盖）
  window.history.pushState(null, '', '/admin/zzz')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  assert.ok(el.querySelector('#admin-nf'), 'admin notFound')
  assert.ok(!el.querySelector('#main-nf'), '主 app 404 不生效')

  // 主 app 404
  window.history.pushState(null, '', '/elsewhere')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  assert.ok(el.querySelector('#main-nf'), '主 app 404')

  // 段边界：/admin2 不匹配 /admin
  router.get('/admin2', () => h('div', { id: 'admin2' }, 'admin2'))
  window.history.pushState(null, '', '/admin2')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  assert.ok(el.querySelector('#admin2'), '段边界正确')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// ctx.ui 三 API：$ / dirty / render + 组件级重渲染
// ═══════════════════════════════════════════════════════

test('组件级 $：点击只重渲染该组件（父 handler 不重跑）', async () => {
  let handlerRuns = 0
  const router = new UIRouter()
  const Counter = (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.count = 0
    return (props: any) =>
      h('div', {},
        h('span', { id: `n-${props.id}` }, String($.count)),
        h('button', { id: `inc-${props.id}`, onClick: () => { $.count++ } }, '+'),
      )
  }
  router.get('/counters', async (location, ctx) => {
    handlerRuns++
    return h('div', {}, h(Counter, { id: 'a' }), h(Counter, { id: 'b' }))
  })
  window.history.pushState(null, '', '/counters')
  const el = mount('ui-comp')
  const handle = uiServe(router, { root: '#ui-comp' })
  await flush()
  assert.equal(handlerRuns, 1, 'handler 首跑一次')
  ;(el.querySelector('#inc-a') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#n-a')?.textContent, '1', 'counter-a 更新')
  assert.equal(el.querySelector('#n-b')?.textContent, '0', 'counter-b 不动')
  assert.equal(handlerRuns, 1, 'handler 不重跑')
  handle.close()
})

test('ctx.ui.dirty()：闭包 let 手动模式 + render() 同步', async () => {
  const router = new UIRouter()
  const Manual = (_init: any, ctx: any) => {
    let count = 0
    return () => h('button', { id: 'm-btn', onClick: () => { count++; ctx.ui.dirty() } }, String(count))
  }
  router.get('/manual', () => h('div', {}, h(Manual)))
  window.history.pushState(null, '', '/manual')
  const el = mount('ui-manual')
  const handle = uiServe(router, { root: '#ui-manual' })
  await flush()
  ;(el.querySelector('#m-btn') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#m-btn')?.textContent, '1', 'dirty() 重渲染手动状态')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// keyed / style / 事件不累积（回归）
// ═══════════════════════════════════════════════════════

test('keyed 列表重排复用 DOM + style diff + 事件不累积', async () => {
  const router = new UIRouter()
  router.get('/list', async (location, ctx) => {
    const $ = ctx.ui.$()
    $.items = $.items ?? [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    $.show = $.show ?? true
    return h('div', {},
      h('ul', {}, ...($.items as any[]).map((it: any) => h('li', { key: it.id, id: `li-${it.id}` }))),
      h('button', {
        id: 'shuffle',
        onClick: () => { const arr = [...($.items as any[])]; const f = arr.shift()!; arr.push(f); $.items = arr },
      }, '轮转'),
      h('div', { id: 'sty', style: $.show ? { display: 'block' } : { display: undefined } }),
    )
  })
  window.history.pushState(null, '', '/list')
  const el = mount('ui-list')
  const handle = uiServe(router, { root: '#ui-list' })
  await flush()
  const liA = el.querySelector('#li-a')
  ;(el.querySelector('#shuffle') as HTMLElement).click()
  await flush()
  assert.deepEqual([...el.querySelectorAll('li')].map(n => n.id), ['li-b', 'li-c', 'li-a'], 'keyed 重排')
  assert.equal(el.querySelector('#li-a'), liA, 'li-a 复用不重建')
  const $ = handle.ctx.ui.$()
  $.show = false
  await flush()
  assert.equal((el.querySelector('#sty') as HTMLElement).style.display, '', 'style diff 清除')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// SSR + hydrate
// ═══════════════════════════════════════════════════════

test('ssrToString + uiServe hydrate 收养', async () => {
  const { ssrToString } = await import('../ui-dom/ssr.ts')
  const html = await ssrToString(
    (() => () => h('div', { id: 'app' }, h('h1', {}, '标题'), h('span', { onClick: () => {} }, 'x'))) as any,
    {},
    {},
  )
  assert.ok(html.includes('<h1>标题</h1>'), 'SSR HTML')
  assert.ok(!html.includes('onClick'), '事件不 SSR')
  // hydrate 收养
  const el = mount('ui-hyd')
  el.innerHTML = html
  const router = new UIRouter()
  router.get('/hyd', (location, ctx) => {
    const $ = ctx.ui.$()
    $.n = $.n ?? 0
    return h('div', { id: 'app' },
      h('h1', {}, '标题'),
      h('button', { id: 'b', onClick: () => { $.n++ } }, 'x'),
      h('span', { id: 'n' }, String($.n)),
    )
  })
  window.history.pushState(null, '', '/hyd')
  const handle = uiServe(router, { root: '#ui-hyd', hydrate: true })
  await flush()
  assert.equal(el.querySelector('#n')?.textContent, '0', '收养保留服务端内容')
  ;(el.querySelector('#b') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#n')?.textContent, '1', 'hydrate 后事件可用')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// 错误兜底
// ═══════════════════════════════════════════════════════

test('handler 抛错 → 错误页兜底（不黑屏）', async () => {
  const router = new UIRouter()
  router.get('/boom', () => { throw new Error('炸了') })
  window.history.pushState(null, '', '/boom')
  const el = mount('ui-boom')
  const handle = uiServe(router, { root: '#ui-boom' })
  await flush()
  assert.ok(el.querySelector('.ui-dom-error'), '错误页兜底')
  assert.ok(String(el.querySelector('.ui-dom-error')?.textContent).includes('炸了'))
  handle.close()
})


// ═══════════════════════════════════════════════════════
// UIRouter ctx 注入链（对齐后端 app.use——toast/confirm 注入 ctx.xxx）
// ═══════════════════════════════════════════════════════

test('UIRouter.use(AppMiddleware)：ctx 注入链（toast/confirm）', async () => {
  const { toast } = await import('../ui-dom/Toast.ts')
  const { confirm } = await import('../ui-dom/Confirm.ts')
  const router = new UIRouter()
  router.use(toast())
  router.use(confirm())
  router.get('/inj', () => h('div', { id: 'inj-page' }, '注入页'))
  window.history.pushState(null, '', '/inj')
  const el = mount('ui-inj')
  const handle = uiServe(router, { root: '#ui-inj' })
  await flush()
  const ctx = handle.ctx as any
  assert.equal(typeof ctx.toast, 'function', 'ctx.toast 注入')
  assert.equal(typeof ctx.confirm, 'function', 'ctx.confirm 注入')
  // 调用 toast → 命令式渲染（Toast 组件输出到 portal）
  ctx.toast('保存成功', 'success')
  await flush()
  const host = document.querySelector('.wf-toast-host')
  assert.ok(host, 'toast host 渲染')
  const toastEl = document.querySelector('.wf-toast')
  assert.ok(toastEl, 'toast 消息渲染（portal）')
  assert.ok(toastEl?.textContent?.includes('保存成功'), 'toast 消息显示')
  assert.ok(toastEl?.className.includes('wf-toast--success'), 'toast type class')
  handle.close()
})

test('UIRouter.use(AppMiddleware)：自定义注入中间件（ctx.xxx 类型扩展）', async () => {
  const customMw = (ctx: any) => {
    ;(ctx as any).custom = { hello: 'world' }
    return ctx
  }
  const router = new UIRouter()
  router.use(customMw)
  router.get('/c', async (location, ctx: any) => {
    const $ = ctx.ui.$()
    $.v = $.v ?? 0
    return h('div', { id: 'c-page' }, `custom: ${ctx.custom.hello}`)
  })
  window.history.pushState(null, '', '/c')
  const el = mount('ui-c')
  const handle = uiServe(router, { root: '#ui-c' })
  await flush()
  assert.equal(el.querySelector('#c-page')?.textContent, 'custom: world', '自定义注入可用')
  assert.equal((handle.ctx as any).custom.hello, 'world', 'handle.ctx 有注入')
  handle.close()
})


// ═══════════════════════════════════════════════════════
// SSR 落地（ssrPage）+ __DATA__ + hydrate 完整链路
// ═══════════════════════════════════════════════════════

test('ssrPage：SSR 渲染路由页面 → 完整 HTML + __DATA__', async () => {
  const { ssrPage } = await import('../ui-dom/ssr.ts')
  const router = new UIRouter()
  router.get('/users/:id', async (location, ctx) => {
    const user = await ctx.data.get(`/api/users/${ctx.params.id}`, async () => ({ name: '张三' }))
    return h('div', { id: 'user-page' },
      h('h2', {}, `用户 ${ctx.params.id}`),
      h('span', { id: 'uname' }, `姓名: ${(user as any).name}`),
    )
  })
  const result = await ssrPage(router, { url: '/users/42' })
  assert.ok(result.html.includes('用户 42'), 'params 注入 SSR')
  assert.ok(result.html.includes('姓名: 张三'), 'data 预取 SSR')
  assert.ok(result.html.includes('</div>'), 'HTML 结构')
  assert.ok(result.dataScript.includes('__DATA__'), '__DATA__ 脚本')
  assert.ok(result.dataScript.includes('/api/users/42'), '预取数据序列化')
  assert.ok(result.page.includes('<div id="root">'), '完整页面')
  assert.ok(result.page.includes(result.html), 'HTML 内联')
})

test('SSR → hydrate 完整链路：预取数据 __DATA__ 命中 + DOM 收养', async () => {
  const { ssrPage } = await import('../ui-dom/ssr.ts')
  const router = new UIRouter()
  let fetchCount = 0
  router.get('/page', async (location, ctx) => {
    const data = await ctx.data.get('/api/data', async () => {
      fetchCount++
      return { title: 'SSR 页面' }
    })
    return h('div', { id: 'p' }, h('h2', {}, (data as any).title))
  })
  // SSR
  const result = await ssrPage(router, { url: '/page' })
  assert.equal(fetchCount, 1, 'SSR 取数一次')

  // 客户端 hydrate：__DATA__ 种子命中 → 不重取数
  const el = mount('ui-hyd-ssr')
  // 模拟服务端 HTML + __DATA__ 已注入
  el.innerHTML = result.html
  ;(window as any).__DATA__ = JSON.parse(result.dataScript.match(/window\.__DATA__=(.*?);/)?.[1] ?? '{}')
  const client = new UIRouter()
  client.get('/page', async (location, ctx) => {
    const data = await ctx.data.get('/api/data', async () => {
      fetchCount++
      return { title: 'SSR 页面' }
    })
    return h('div', { id: 'p' }, h('h2', {}, (data as any).title))
  })
  window.history.pushState(null, '', '/page')
  const handle = uiServe(client, { root: '#ui-hyd-ssr', hydrate: true })
  await flush()
  assert.equal(el.querySelector('h2')?.textContent, 'SSR 页面', 'hydrate 内容保留')
  assert.equal(fetchCount, 1, 'hydrate 不重取数（__DATA__ 命中）')
  handle.close()
  delete (window as any).__DATA__
})

// ═══════════════════════════════════════════════════════
// confirm / notification 命令式注入冒烟
// ═══════════════════════════════════════════════════════

test('ctx.confirm：命令式确认框（portal + 确定/取消）', async () => {
  const { confirm } = await import('../ui-dom/Confirm.ts')
  const router = new UIRouter()
  router.use(confirm())
  router.get('/cf', () => h('div', {}, '页'))
  window.history.pushState(null, '', '/cf')
  const el = mount('ui-cf')
  const handle = uiServe(router, { root: '#ui-cf' })
  await flush()
  const ctx = handle.ctx as any
  assert.equal(typeof ctx.confirm, 'function', 'ctx.confirm 注入')
  // 触发 confirm
  let result: boolean | null = null
  void ctx.confirm('确定删除？').then(r => { result = r })
  await flush()
  const portal = document.getElementById('__wf_portal')
  const modalText = portal?.textContent ?? ''
  assert.ok(modalText.includes('确定删除？'), '确认框内容（portal Modal）')
  assert.ok(modalText.includes('确定') && modalText.includes('取消'), '确认/取消按钮')
  // 点确定
  const confirmBtn = [...(portal?.querySelectorAll('button') ?? [])].find(b => b.textContent?.includes('确定'))
  ;(confirmBtn as HTMLElement).click()
  await flush()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(result, true, 'confirm resolve true')
  handle.close()
})

test('ctx.notification：命令式通知（portal 渲染）', async () => {
  const { notification } = await import('../ui-dom/Notification.ts')
  const router = new UIRouter()
  router.use(notification())
  router.get('/nf', () => h('div', {}, '页'))
  window.history.pushState(null, '', '/nf')
  const el = mount('ui-nf')
  const handle = uiServe(router, { root: '#ui-nf' })
  await flush()
  const ctx = handle.ctx as any
  assert.equal(typeof ctx.notification, 'function', 'ctx.notification 注入')
  ctx.notification('系统通知', { type: 'success', description: '操作完成' })
  await flush()
  const portal = document.getElementById('__wf_portal')
  const text = portal?.textContent ?? ''
  assert.ok(text.includes('系统通知'), '通知标题')
  assert.ok(text.includes('操作完成'), '通知描述')
  handle.close()
})

test('DBG form submit 事件', async () => {
  const router = new UIRouter()
  let submitted = ''
  router.get('/f', () =>
    h('form', { onSubmit: (e: Event) => { e.preventDefault(); submitted = 'ok' } },
      h('input', { type: 'text', name: 'q' }),
      h('button', { type: 'submit' }, '提交'),
    ))
  window.history.pushState(null, '', '/f')
  const el = mount('ui-form')
  const handle = uiServe(router, { root: '#ui-form' })
  await flush()
  ;(el.querySelector('button') as HTMLElement).click()
  await flush()
  console.log('[dbg-form] after button click, submitted:', submitted)
  ;(el.querySelector('form') as HTMLElement).dispatchEvent(new (window as any).Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  console.log('[dbg-form] after dispatch submit, submitted:', submitted)
  handle.close()
})
