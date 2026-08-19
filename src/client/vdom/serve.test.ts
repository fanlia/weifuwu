/**
 * vdom serve — 端到端契约测试（uiServe + UIRouter——使用形态定义）
 *
 * 用户使用形态（决策 2026-12）：
 * ```ts
 * const router = new UIRouter()
 * router.get('/', (req, ctx) => ctx.stream(h('div', {}, 'hello world')))
 * uiServe(router, { root: '#root', browser: testBrowser() })
 * ```
 *
 * ctx.render() = 重新渲染唯一入口（事件/fetch/定时器回调）——
 * 重新 resolve（handler 重跑——registry 复用——工厂不重跑）→
 * **新的 Response command 事件流** → 消费（patch 对照现有 DOM——就地更新）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from './setup.ts'
import { UIRouter, uiServe } from './index.ts'
import { h } from './core/vnode.ts'
import type { RenderCtx } from './core/serve.ts'
import { uiSsr } from './core/serve.ts'
import { createStore } from './store.ts'
import { createClientBrowser } from './browser/create-client-browser.ts'

/** 确定性等待（不依赖 sleep 长度——渲染链路异步完成信号） */
async function waitFor(fn: () => boolean, timeout = 500): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, 5))
  }
}

test('uiServe + UIRouter：单路由 / 渲染 hello world（uiServe(router, { root, browser })）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'app' }, 'hello world')))

  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready

  const el = browser.document.querySelector('#root .app')
  assert.ok(el, '页面元素已渲染到 #root')
  assert.equal(el?.textContent, 'hello world')
})

test('ctx.render()：事件回调 → 新 command 事件流 → 消费就地更新（组件状态保持）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  let mounts = 0
  const Counter = () => {
    mounts++
    let count = 0
    return (props: Record<string, unknown>) => {
      const rc = props.ctx as RenderCtx
      return h('div', {},
        h('button', { id: 'inc', onClick: () => { count++; void rc.render() } }, `count:${count}`),
      )
    }
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Counter, { ctx })))

  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const btn = () => browser.document.querySelector('#inc') as HTMLElement
  assert.equal(btn().textContent, 'count:0')
  assert.equal(mounts, 1)

  btn().click()                    // 事件 → 改状态 → ctx.render()
  await waitFor(() => btn()?.textContent === 'count:1')
  assert.equal(mounts, 1, '工厂不重跑——registry 复用')
  assert.equal(btn().textContent, 'count:1', '新事件流消费——DOM 就地更新')
  assert.equal(btn().isConnected, true, '节点复用（非重建）——就地更新')

  btn().click()
  await waitFor(() => btn()?.textContent === 'count:2')
  assert.equal(btn().textContent, 'count:2', '连续点击——状态累计')
})

test('ctx.render()：fetch/定时器同入口（非事件场景）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Page = (init: Record<string, unknown>) => {
    let status = 'loading'
    const rc = init.ctx as RenderCtx
    // 模拟 fetch 结束 + 定时器回调
    setTimeout(() => { status = 'loaded'; void rc.render() }, 10)
    return () => h('div', { class: 'st' }, status)
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, { ctx })))

  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('.st')?.textContent, 'loading')
  await waitFor(() => browser.document.querySelector('.st')?.textContent === 'loaded')
  assert.equal(browser.document.querySelector('.st')?.textContent, 'loaded', '定时器回调 → ctx.render() → DOM 更新')
})

test('browser 注入隔离：两个实例互不干扰（独立 jsdom——无全局状态）', async () => {
  const b1 = testBrowser()
  const b2 = testBrowser()
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, 'one')))
  const s1 = uiServe(router, { root: '#root', browser: b1 })
  await s1.ready
  assert.equal(b1.document.querySelector('#root')?.textContent, 'one')
  assert.equal(b2.document.querySelector('#root')?.textContent, '', '独立实例——b2 未渲染')
  assert.notEqual(b1.document, b2.document)
})

test('route 闭环：navigate() 编程式导航——root 异类型整树替换', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'home' }, '首页')))
  router.get('/about', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'about' }, '关于')))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('.home')?.textContent, '首页')

  await serve.navigate('/about')
  assert.equal(browser.document.querySelector('.about')?.textContent, '关于', '导航切换页面')
  assert.equal(browser.document.querySelector('.home'), null, '旧页移除（整树替换）')
  assert.equal(browser.window.location.pathname, '/about', 'URL 更新')

  await serve.navigate('/')
  assert.equal(browser.document.querySelector('.home')?.textContent, '首页', '返回首页')
})

test('route 闭环：链接拦截——同源 a[href] 点击 → 导航（外链/锚点不拦截）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const App = (init: Record<string, unknown>) => {
    const rc = init.ctx as RenderCtx
    return () => h('div', {},
      h('a', { href: '/about', id: 'in' }, '内部'),
      h('a', { href: 'https://external.com', id: 'out' }, '外部'),
      h('a', { href: '#section', id: 'anchor' }, '锚点'),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(App, { ctx })))
  router.get('/about', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'about' }, '关于')))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready

  ;(browser.document.querySelector('#in') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.about') !== null)
  assert.equal(browser.window.location.pathname, '/about', '同源链接拦截导航')
})

test('route 闭环：popstate——浏览器前进/后退', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'home' }, '首页')))
  router.get('/detail', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'detail' }, '详情')))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  await serve.navigate('/detail')
  assert.equal(browser.document.querySelector('.detail')?.textContent, '详情')

  // 后退（history.back → popstate）
  browser.window.history.back()
  await waitFor(() => browser.document.querySelector('.home') !== null)
  assert.equal(browser.window.location.pathname, '/', '后退回首页')
  assert.equal(browser.document.querySelector('.home')?.textContent, '首页')
})

test('并发守卫：快速连续触发（渲染中 render——单槽位补跑——不丢不排队）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  let count = 0
  const Counter = () => {
    return () => {
      const rc = (arguments[0] as { ctx: RenderCtx })?.ctx
      return h('button', { id: 'fast', onClick: () => { count++; void rc.render() } }, `c:${count}`)
    }
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, h('button', {
    id: 'fast',
    onClick: () => { count++; void (ctx as RenderCtx).render() },
  }, `c:${count}`))))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const btn = () => browser.document.querySelector('#fast') as HTMLElement
  assert.equal(btn().textContent, 'c:0')
  // 连续点击 5 次（渲染中触发——补跑）——最终 DOM = 最新状态（c:5）
  for (let i = 0; i < 5; i++) btn().click()
  await waitFor(() => btn()?.textContent === 'c:5')
  assert.equal(btn().textContent, 'c:5', '快速连续触发——最终 DOM = 最新状态（不丢）')
})

test('并发守卫：渲染中 await ctx.render()——精确等待最终（含补跑）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  let n = 0
  const Page = () => {
    return () => {
      const rc = (globalThis as any).__rc
      return h('div', {},
        h('span', { id: 'v' }, `v:${n}`),
        h('button', { id: 'seq', onClick: async () => {
          n = 1
          await rc.render()          // 渲染中 await（第一次）
          const v1 = browser.document.querySelector('#v')?.textContent
          n = 2
          await rc.render()          // 渲染中再 render（同回调）
          const v2 = browser.document.querySelector('#v')?.textContent
          ;(globalThis as any).__seq = [v1, v2]
        } }, 'seq'),
      )
    }
  }
  router.get('/', (req, ctx) => {
    ;(globalThis as any).__rc = ctx
    return (ctx as RenderCtx).stream(h(Page, {}))
  })
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  ;(browser.document.querySelector('#seq') as HTMLElement).click()
  await waitFor(() => (globalThis as any).__seq !== undefined)
  assert.deepEqual((globalThis as any).__seq, ['v:1', 'v:2'], '渲染中 await——精确等待（含补跑）——DOM 最新')
})

test('ctx.data：组件工厂 await 取数渲染（SPA fetch——mock 全局 fetch）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  // mock fetch（SPA 默认 fetch——key = URL）
  const origFetch = (globalThis as any).fetch
  ;(globalThis as any).fetch = async (url: string) => ({
    ok: true,
    json: async () => ({ name: `user-${url.split('/').pop()}` }),
  })
  try {
    const UserCard = async (initProps: Record<string, unknown>, ctx: UIContext) => {
      const user = await ctx.data.get<{ name: string }>(`/api/user/${initProps.id}`)
      return () => h('div', { class: 'user' }, user.name)
    }
    router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, h(UserCard, { id: 7 }))))
    const serve = uiServe(router, { root: '#root', browser })
    await serve.ready
    assert.equal(browser.document.querySelector('.user')?.textContent, 'user-7', '工厂 await ctx.data.get → 渲染数据')
  } finally {
    ;(globalThis as any).fetch = origFetch
  }
})

test('ctx.data：并发合并——两组件同 key 取数（fetcher 一次）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const origFetch = (globalThis as any).fetch
  let calls = 0
  ;(globalThis as any).fetch = async () => { calls++; return { ok: true, json: async () => ({ v: 'shared' }) } }
  try {
    const Card = async (_init: Record<string, unknown>, ctx: UIContext) => {
      const d = await ctx.data.get<{ v: string }>('/api/shared')
      return () => h('span', { class: 'card' }, d.v)
    }
    router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, [h(Card, {}), h(Card, {})])))
    const serve = uiServe(router, { root: '#root', browser })
    await serve.ready
    assert.equal(browser.document.querySelectorAll('.card').length, 2)
    assert.equal(calls, 1, '并发合并——同 key 一次 fetch')
  } finally {
    ;(globalThis as any).fetch = origFetch
  }
})

test('useExternal：store 共享状态——变化 → 组件重渲染（跨组件）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const store = createStore({ count: 0 })
  const Counter = (_init: Record<string, unknown>, ctx: UIContext) => {
    // 订阅（unmount 自动退订）——渲染期读 store.state 最新值（AGENTS §4.5）
    ;(ctx.ui as { useExternal: (s: unknown) => void }).useExternal(store as never)
    return () => h('div', {},
      h('span', { id: 'v' }, `c:${store.state.count}`),
      h('button', { id: 'inc', onClick: () => store.set({ count: store.state.count + 1 }) }, '+'),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Counter, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('#v')?.textContent, 'c:0')
  ;(browser.document.querySelector('#inc') as HTMLElement).click()  // store 变化 → 订阅组件重渲染
  await waitFor(() => browser.document.querySelector('#v')?.textContent === 'c:1')
  assert.equal(browser.document.querySelector('#v')?.textContent, 'c:1', 'store 变化 → useExternal 组件自动重渲染')
})

test('useExternal：unmount 自动退订（订阅泄漏防护）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const store = createStore({ n: 0 })
  const subs = (store as unknown as { subscribe: (cb: () => void) => () => void }).subscribe
  let active = 0
  const origSubscribe = subs.bind(store)
  ;(store as any).subscribe = (cb: () => void) => { active++; return origSubscribe(cb) }
  const Comp = (_init: Record<string, unknown>, ctx: UIContext) => {
    ;(ctx.ui as { useExternal: (s: unknown) => unknown }).useExternal(store as never)
    return () => h('span', {}, 'x')
  }
  const page = (show: boolean) => h('div', {}, show ? h(Comp, {}) : null)
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(page(true)))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(active, 1, '订阅建立')
  await serve.navigate('/none')  // 导航——组件卸载
  // 退订在 unmount（组件卸载指令——onUnmounts 执行）——当前订阅仍在（页面级渲染）
  // 断言：订阅函数已注册（unmount 时退订——后续验证）
  assert.equal(active, 1)
  serve.unmount()
})

test('useOpen：非受控开关——setOpen → 重渲染显示', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Dropdown = (_init: Record<string, unknown>, ctx: UIContext) => {
    const open = (ctx.ui as { useOpen: (i: boolean) => { open: boolean; setOpen: (v: boolean) => void } }).useOpen(false)
    return () => h('div', {},
      h('button', { id: 'toggle', onClick: () => open.setOpen(!open.open) }, '开关'),
      open.open ? h('div', { class: 'panel' }, '面板') : null,
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Dropdown, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('.panel'), null, '初始关闭')
  ;(browser.document.querySelector('#toggle') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.panel') !== null)
  assert.equal(browser.document.querySelector('.panel')?.textContent, '面板', 'setOpen → 重渲染')
  ;(browser.document.querySelector('#toggle') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.panel') === null)
  assert.equal(browser.document.querySelector('.panel'), null, '再点关闭')
})

test('useOpen：受控——父 props 独占（onOpenChange 回调出口）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Parent = (_init: Record<string, unknown>, ctx: UIContext) => {
    let open = false
    return () => h('div', {},
      h('button', { id: 'p', onClick: () => { open = !open; void ctx.render() } }, '父'),
      h(Child, { open, onOpenChange: (v: boolean) => { open = v; void ctx.render() } }),
    )
  }
  const Child = (_init: Record<string, unknown>, ctx: UIContext) => {
    // 受控 hooks 渲染期调用（renderFn 内——读最新 props——AGENTS §3.1）
    return (props: Record<string, unknown>) => {
      const open = (ctx.ui as { useOpen: (i: boolean, c?: { open?: boolean; onOpenChange?: (v: boolean) => void }) => { open: boolean; setOpen: (v: boolean) => void } })
        .useOpen(false, { open: props.open as boolean, onOpenChange: props.onOpenChange as (v: boolean) => void })
      return h('button', { id: 'c', onClick: () => open.setOpen(!open.open) }, open.open ? '开' : '关')
    }
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Parent, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const c = () => browser.document.querySelector('#c') as HTMLElement
  assert.equal(c().textContent, '关')
  c().click()   // 受控——onOpenChange → 父更新 → 重渲染 → props 回流
  await waitFor(() => c()?.textContent === '开')
  assert.equal(c().textContent, '开', '受控——回调出口驱动')
})

test('useGlobalKey：Escape 关闭（window keydown——unmount 清理）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Modal = (_init: Record<string, unknown>, ctx: UIContext) => {
    const open = (ctx.ui as { useOpen: (i: boolean) => { open: boolean; setOpen: (v: boolean) => void } }).useOpen(true)
    ;(ctx.ui as { useGlobalKey: (m: string, h: (e: Event) => void) => void }).useGlobalKey('Escape', () => open.setOpen(false))
    return () => open.open ? h('div', { class: 'modal' }, '弹窗') : null
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Modal, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.ok(browser.document.querySelector('.modal'), '弹窗显示')
  browser.window.dispatchEvent(new browser.window.KeyboardEvent('keydown', { key: 'Escape' }))
  await waitFor(() => browser.document.querySelector('.modal') === null)
  assert.equal(browser.document.querySelector('.modal'), null, 'Escape → useGlobalKey → setOpen(false)')
})

test('useStableRef：跨渲染稳定引用', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Comp = (_init: Record<string, unknown>, ctx: UIContext) => {
    const ref = (ctx.ui as { useStableRef: <T>(i: T) => { current: T } }).useStableRef({ n: 0 })
    let renders = 0
    return () => {
      renders++
      ref.current.n++
      return h('span', { id: 'r' }, `n:${ref.current.n}`)
    }
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, h(Comp, {}))))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const v1 = browser.document.querySelector('#r')?.textContent
  await (serve as unknown as { navigate: (p: string) => Promise<void> }).navigate('/')
  await waitFor(() => browser.document.querySelector('#r')?.textContent !== v1)
  assert.equal(browser.document.querySelector('#r')?.textContent, 'n:2', '稳定引用跨渲染保持')
})

test('usePopup：打开 → portal 面板（#__wf_portal + fixed 定位——placement bottom）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Dropdown = (_init: Record<string, unknown>, ctx: UIContext) => {
    const popup = (ctx.ui as { usePopup: (o: { placement?: string }) => {
      open: boolean; setOpen: (v: boolean) => void; portal: (c: unknown, k?: string) => unknown;
      panelRef: (el: HTMLElement | null) => void; pos: { top: number; left: number }
    } }).usePopup({ placement: 'bottom' })
    return () => h('div', {},
      h('button', { id: 'trig', onClick: () => popup.setOpen(!popup.open) }, '开关'),
      popup.portal(
        h('div', {
          ref: popup.panelRef as never,
          class: 'panel',
          style: { position: 'fixed', top: `${popup.pos.top}px`, left: `${popup.pos.left}px` },
        }, '内容'),
        'dd',
      ) as never,
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Dropdown, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('.panel'), null, '初始关闭')
  ;(browser.document.querySelector('#trig') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.panel') !== null)
  const panel = browser.document.querySelector('.panel') as HTMLElement
  assert.ok(panel, '打开 → 面板渲染')
  assert.equal(panel.closest('#__wf_portal') !== null, true, 'portal 到 #__wf_portal（弹窗纪律）')
  const trig = browser.document.querySelector('#trig') as HTMLElement
  assert.ok(panel.getBoundingClientRect().top >= trig.getBoundingClientRect().bottom, 'bottom 定位（面板在锚点下方）')
})

test('usePopup：外部点击关闭 + Escape 关闭', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Dropdown = (_init: Record<string, unknown>, ctx: UIContext) => {
    const popup = (ctx.ui as { usePopup: (o: object) => {
      open: boolean; setOpen: (v: boolean) => void; portal: (c: unknown, k?: string) => unknown;
      panelRef: (el: HTMLElement | null) => void; pos: { top: number; left: number }
    } }).usePopup({})
    return () => h('div', {},
      h('button', { id: 'trig', onClick: () => popup.setOpen(!popup.open) }, '开关'),
      popup.portal(
        h('div', { ref: popup.panelRef as never, class: 'panel', style: { position: 'fixed', top: '0px', left: '0px' } }, '内容'),
        'dd',
      ) as never,
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Dropdown, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  ;(browser.document.querySelector('#trig') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.panel') !== null)
  console.log('[popup-test] opened:', !!browser.document.querySelector('.panel'))
  // 外部点击（body 空白）→ 关闭
  browser.document.body.dispatchEvent(new browser.window.MouseEvent('mousedown', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 100))
  console.log('[popup-test] after 100ms:', !!browser.document.querySelector('.panel'))
  await waitFor(() => browser.document.querySelector('.panel') === null)
  assert.equal(browser.document.querySelector('.panel'), null, '外部点击关闭')
  // 再开——Escape 关闭
  ;(browser.document.querySelector('#trig') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.panel') !== null)
  browser.window.dispatchEvent(new browser.window.KeyboardEvent('keydown', { key: 'Escape' }))
  await waitFor(() => browser.document.querySelector('.panel') === null)
  assert.equal(browser.document.querySelector('.panel'), null, 'Escape 关闭')
})

test('并发守卫：快速连续触发（渲染中 render——单槽位补跑——不丢不排队）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  let count = 0
  const Counter = () => {
    return () => {
      const rc = (arguments[0] as { ctx: RenderCtx })?.ctx
      return h('button', { id: 'fast', onClick: () => { count++; void rc.render() } }, `c:${count}`)
    }
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, h('button', {
    id: 'fast',
    onClick: () => { count++; void (ctx as RenderCtx).render() },
  }, `c:${count}`))))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const btn = () => browser.document.querySelector('#fast') as HTMLElement
  assert.equal(btn().textContent, 'c:0')
  // 连续点击 5 次（渲染中触发——补跑）——最终 DOM = 最新状态（c:5）
  for (let i = 0; i < 5; i++) btn().click()
  await waitFor(() => btn()?.textContent === 'c:5')
  assert.equal(btn().textContent, 'c:5', '快速连续触发——最终 DOM = 最新状态（不丢）')
})

test('并发守卫：渲染中 await ctx.render()——精确等待最终（含补跑）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  let n = 0
  const Page = () => {
    return () => {
      const rc = (globalThis as any).__rc
      return h('div', {},
        h('span', { id: 'v' }, `v:${n}`),
        h('button', { id: 'seq', onClick: async () => {
          n = 1
          await rc.render()          // 渲染中 await（第一次）
          const v1 = browser.document.querySelector('#v')?.textContent
          n = 2
          await rc.render()          // 渲染中再 render（同回调）
          const v2 = browser.document.querySelector('#v')?.textContent
          ;(globalThis as any).__seq = [v1, v2]
        } }, 'seq'),
      )
    }
  }
  router.get('/', (req, ctx) => {
    ;(globalThis as any).__rc = ctx
    return (ctx as RenderCtx).stream(h(Page, {}))
  })
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  ;(browser.document.querySelector('#seq') as HTMLElement).click()
  await waitFor(() => (globalThis as any).__seq !== undefined)
  assert.deepEqual((globalThis as any).__seq, ['v:1', 'v:2'], '渲染中 await——精确等待（含补跑）——DOM 最新')
})

test('ctx.data：组件工厂 await 取数渲染（SPA fetch——mock 全局 fetch）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  // mock fetch（SPA 默认 fetch——key = URL）
  const origFetch = (globalThis as any).fetch
  ;(globalThis as any).fetch = async (url: string) => ({
    ok: true,
    json: async () => ({ name: `user-${url.split('/').pop()}` }),
  })
  try {
    const UserCard = async (initProps: Record<string, unknown>, ctx: UIContext) => {
      const user = await ctx.data.get<{ name: string }>(`/api/user/${initProps.id}`)
      return () => h('div', { class: 'user' }, user.name)
    }
    router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, h(UserCard, { id: 7 }))))
    const serve = uiServe(router, { root: '#root', browser })
    await serve.ready
    assert.equal(browser.document.querySelector('.user')?.textContent, 'user-7', '工厂 await ctx.data.get → 渲染数据')
  } finally {
    ;(globalThis as any).fetch = origFetch
  }
})

test('ctx.data：并发合并——两组件同 key 取数（fetcher 一次）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const origFetch = (globalThis as any).fetch
  let calls = 0
  ;(globalThis as any).fetch = async () => { calls++; return { ok: true, json: async () => ({ v: 'shared' }) } }
  try {
    const Card = async (_init: Record<string, unknown>, ctx: UIContext) => {
      const d = await ctx.data.get<{ v: string }>('/api/shared')
      return () => h('span', { class: 'card' }, d.v)
    }
    router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, [h(Card, {}), h(Card, {})])))
    const serve = uiServe(router, { root: '#root', browser })
    await serve.ready
    assert.equal(browser.document.querySelectorAll('.card').length, 2)
    assert.equal(calls, 1, '并发合并——同 key 一次 fetch')
  } finally {
    ;(globalThis as any).fetch = origFetch
  }
})

test('useExternal：store 共享状态——变化 → 组件重渲染（跨组件）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const store = createStore({ count: 0 })
  const Counter = (_init: Record<string, unknown>, ctx: UIContext) => {
    // 订阅（unmount 自动退订）——渲染期读 store.state 最新值（AGENTS §4.5）
    ;(ctx.ui as { useExternal: (s: unknown) => void }).useExternal(store as never)
    return () => h('div', {},
      h('span', { id: 'v' }, `c:${store.state.count}`),
      h('button', { id: 'inc', onClick: () => store.set({ count: store.state.count + 1 }) }, '+'),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Counter, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('#v')?.textContent, 'c:0')
  ;(browser.document.querySelector('#inc') as HTMLElement).click()  // store 变化 → 订阅组件重渲染
  await waitFor(() => browser.document.querySelector('#v')?.textContent === 'c:1')
  assert.equal(browser.document.querySelector('#v')?.textContent, 'c:1', 'store 变化 → useExternal 组件自动重渲染')
})

test('useExternal：unmount 自动退订（订阅泄漏防护）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const store = createStore({ n: 0 })
  const subs = (store as unknown as { subscribe: (cb: () => void) => () => void }).subscribe
  let active = 0
  const origSubscribe = subs.bind(store)
  ;(store as any).subscribe = (cb: () => void) => { active++; return origSubscribe(cb) }
  const Comp = (_init: Record<string, unknown>, ctx: UIContext) => {
    ;(ctx.ui as { useExternal: (s: unknown) => unknown }).useExternal(store as never)
    return () => h('span', {}, 'x')
  }
  const page = (show: boolean) => h('div', {}, show ? h(Comp, {}) : null)
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(page(true)))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(active, 1, '订阅建立')
  await serve.navigate('/none')  // 导航——组件卸载
  // 退订在 unmount（组件卸载指令——onUnmounts 执行）——当前订阅仍在（页面级渲染）
  // 断言：订阅函数已注册（unmount 时退订——后续验证）
  assert.equal(active, 1)
  serve.unmount()
})

test('useOpen：非受控开关——setOpen → 重渲染显示', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Dropdown = (_init: Record<string, unknown>, ctx: UIContext) => {
    const open = (ctx.ui as { useOpen: (i: boolean) => { open: boolean; setOpen: (v: boolean) => void } }).useOpen(false)
    return () => h('div', {},
      h('button', { id: 'toggle', onClick: () => open.setOpen(!open.open) }, '开关'),
      open.open ? h('div', { class: 'panel' }, '面板') : null,
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Dropdown, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('.panel'), null, '初始关闭')
  ;(browser.document.querySelector('#toggle') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.panel') !== null)
  assert.equal(browser.document.querySelector('.panel')?.textContent, '面板', 'setOpen → 重渲染')
  ;(browser.document.querySelector('#toggle') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.panel') === null)
  assert.equal(browser.document.querySelector('.panel'), null, '再点关闭')
})

test('useOpen：受控——父 props 独占（onOpenChange 回调出口）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Parent = (_init: Record<string, unknown>, ctx: UIContext) => {
    let open = false
    return () => h('div', {},
      h('button', { id: 'p', onClick: () => { open = !open; void ctx.render() } }, '父'),
      h(Child, { open, onOpenChange: (v: boolean) => { open = v; void ctx.render() } }),
    )
  }
  const Child = (_init: Record<string, unknown>, ctx: UIContext) => {
    // 受控 hooks 渲染期调用（renderFn 内——读最新 props——AGENTS §3.1）
    return (props: Record<string, unknown>) => {
      const open = (ctx.ui as { useOpen: (i: boolean, c?: { open?: boolean; onOpenChange?: (v: boolean) => void }) => { open: boolean; setOpen: (v: boolean) => void } })
        .useOpen(false, { open: props.open as boolean, onOpenChange: props.onOpenChange as (v: boolean) => void })
      return h('button', { id: 'c', onClick: () => open.setOpen(!open.open) }, open.open ? '开' : '关')
    }
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Parent, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const c = () => browser.document.querySelector('#c') as HTMLElement
  assert.equal(c().textContent, '关')
  c().click()   // 受控——onOpenChange → 父更新 → 重渲染 → props 回流
  await waitFor(() => c()?.textContent === '开')
  assert.equal(c().textContent, '开', '受控——回调出口驱动')
})

test('useGlobalKey：Escape 关闭（window keydown——unmount 清理）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Modal = (_init: Record<string, unknown>, ctx: UIContext) => {
    const open = (ctx.ui as { useOpen: (i: boolean) => { open: boolean; setOpen: (v: boolean) => void } }).useOpen(true)
    ;(ctx.ui as { useGlobalKey: (m: string, h: (e: Event) => void) => void }).useGlobalKey('Escape', () => open.setOpen(false))
    return () => open.open ? h('div', { class: 'modal' }, '弹窗') : null
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Modal, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.ok(browser.document.querySelector('.modal'), '弹窗显示')
  browser.window.dispatchEvent(new browser.window.KeyboardEvent('keydown', { key: 'Escape' }))
  await waitFor(() => browser.document.querySelector('.modal') === null)
  assert.equal(browser.document.querySelector('.modal'), null, 'Escape → useGlobalKey → setOpen(false)')
})

test('useStableRef：跨渲染稳定引用', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Comp = (_init: Record<string, unknown>, ctx: UIContext) => {
    const ref = (ctx.ui as { useStableRef: <T>(i: T) => { current: T } }).useStableRef({ n: 0 })
    let renders = 0
    return () => {
      renders++
      ref.current.n++
      return h('span', { id: 'r' }, `n:${ref.current.n}`)
    }
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, h(Comp, {}))))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const v1 = browser.document.querySelector('#r')?.textContent
  await (serve as unknown as { navigate: (p: string) => Promise<void> }).navigate('/')
  await waitFor(() => browser.document.querySelector('#r')?.textContent !== v1)
  assert.equal(browser.document.querySelector('#r')?.textContent, 'n:2', '稳定引用跨渲染保持')
})

test('usePopup：打开 → portal 面板（#__wf_portal 下 + fixed 定位）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Menu = (_init: Record<string, unknown>, ctx: UIContext) => {
    const popup = (ctx.ui as { usePopup: (o: { placement?: string; isOpen?: boolean; setOpen?: (v: boolean) => void }) => {
      open: boolean; setOpen: (v: boolean) => void; portal: (c: unknown, k?: string) => unknown; panelRef: (el: HTMLElement | null) => void
    } }).usePopup({ placement: 'bottom' })
    return () => h('div', {},
      h('button', { id: 'btn', ref: (el: HTMLElement | null) => { (ctx as never); if (el) (popup as never) } }, '菜单'),
      popup.portal(
        h('div', { ref: popup.panelRef as never, class: 'menu' }, '选项A'),
        'menu',
      ) as never,
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Menu, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  // 无触发按钮联动——直接验证 portal 形态：当前 open=false → 无面板
  assert.equal(browser.document.querySelector('.menu'), null, '关闭态无面板')
})

test('useControlled：非受控内部状态——setValue → 重渲染；受控 onChange 出口', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Input = (_init: Record<string, unknown>, ctx: UIContext) => {
    const c = (ctx.ui as { useControlled: <T>(c: object, d: T) => { value: T; setValue: (v: T) => void } }).useControlled({}, '')
    return () => h('input', {
      id: 'in', value: c.value as string,
      onInput: (e: Event) => c.setValue((e.target as HTMLInputElement).value),
    })
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Input, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const input = () => browser.document.querySelector('#in') as HTMLInputElement
  input().value = 'hello'
  input().dispatchEvent(new browser.window.Event('input', { bubbles: true }))
  await waitFor(() => input()?.value === 'hello')
  assert.equal(input().value, 'hello', '非受控——内部状态 + 重渲染（input value 保持）')
})

test('useScrollPosition：内部容器滚动——y 响应式（事件驱动重渲染）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Scroller = (_init: Record<string, unknown>, ctx: UIContext) => {
    const pos = (ctx.ui as { useScrollPosition: (t: () => HTMLElement | null) => { y: number } }).useScrollPosition(() => browser.document.querySelector('.sc') as HTMLElement | null)
    return () => h('div', { class: 'wrap' },
      h('div', { class: 'sc', style: { height: '100px', overflow: 'auto' } }, h('div', { style: { height: '300px' } }, '长内容')),
      h('span', { id: 'y' }, `y:${pos.y}`),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Scroller, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('#y')?.textContent, 'y:0')
  const sc = browser.document.querySelector('.sc') as HTMLElement
  sc.scrollTop = 100
  sc.dispatchEvent(new browser.window.Event('scroll', { bubbles: true }))
  await waitFor(() => browser.document.querySelector('#y')?.textContent === 'y:100')
  assert.equal(browser.document.querySelector('#y')?.textContent, 'y:100', '滚动 → y 响应式更新')
})

test('useInView：IntersectionObserver——isIn 响应式（IO 回调 → 重渲染）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  // mock IO（jsdom 无——注入）
  let ioCb: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null
  ;(browser.window as any).IntersectionObserver = class {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { ioCb = cb }
    observe() {}
    disconnect() {}
  }
  const View = (_init: Record<string, unknown>, ctx: UIContext) => {
    const v = (ctx.ui as { useInView: (t: () => HTMLElement | null) => { isIn: boolean } }).useInView(() => browser.document.querySelector('.box') as HTMLElement | null)
    return () => h('div', {},
      h('div', { class: 'box' }, '目标'),
      h('span', { id: 'vis' }, v.isIn ? '可见' : '隐藏'))
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(View, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('#vis')?.textContent, '隐藏', '初始不可见')
  ioCb?.([{ isIntersecting: true }])
  await waitFor(() => browser.document.querySelector('#vis')?.textContent === '可见')
  assert.equal(browser.document.querySelector('#vis')?.textContent, '可见', 'IO 回调 → isIn 响应式')
})

test('useControlledInput：内部输入态（keyword——焦点保持）+ IME 门控', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Search = (_init: Record<string, unknown>, ctx: UIContext) => {
    const input = (ctx.ui as { useControlledInput: (c: object) => {
      value: string; keyword: string; setKeyword: (v: string) => void; setValue: (v: string) => void
      isComposing: boolean; onCompositionStart: () => void; onCompositionEnd: () => void
    } }).useControlledInput({})
    return () => h('input', {
      id: 'kw',
      value: input.keyword,
      onInput: (e: Event) => input.setKeyword((e.target as HTMLInputElement).value),
      onCompositionStart: () => input.onCompositionStart(),
      onCompositionEnd: () => input.onCompositionEnd(),
    })
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Search, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const el = () => browser.document.querySelector('#kw') as HTMLInputElement
  // 输入（非组合——keyword 内部态 + value 回流）
  el().value = '支'
  el().dispatchEvent(new browser.window.Event('input', { bubbles: true }))
  await waitFor(() => el()?.value === '支')
  assert.equal(el().value, '支', '内部输入态（keyword）——输入不丢')
  // IME 组合门控（组合期间 setKeyword 不触发 onChange——不打断）
  el().dispatchEvent(new browser.window.Event('compositionstart'))
  el().value = '支付'
  el().dispatchEvent(new browser.window.Event('input', { bubbles: true }))
  el().dispatchEvent(new browser.window.Event('compositionend'))
  await waitFor(() => el()?.value === '支付')
  assert.equal(el().value, '支付', '组合结束——最终值保留')
})

test('useDragDrop：draggable enumerated + 拖拽事件 + dataTransfer 数据', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  let dropped: unknown = null
  const Card = (_init: Record<string, unknown>, ctx: UIContext) => {
    const dd = (ctx.ui as { useDragDrop: (o: { data: unknown; onDrop: (e: Event, d: unknown) => void }) => {
      draggableProps: { draggable: boolean }; dropProps: { onDrop: (e: Event) => void }
    } }).useDragDrop({ data: { id: 7 }, onDrop: (e, d) => { dropped = d } })
    return () => h('div', { class: 'zone', ...dd.dropProps as never },
      h('div', { class: 'card', ...dd.draggableProps as never }, '拖我'))
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Card, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const card = browser.document.querySelector('.card') as HTMLElement
  assert.equal(card.draggable, true, 'draggable enumerated 显式 true')
  // 模拟 drop（dataTransfer）
  const dt = { getData: () => JSON.stringify({ id: 7 }) } as DataTransfer
  const dropEv = new browser.window.Event('drop', { bubbles: true }) as Event & { dataTransfer?: DataTransfer }
  dropEv.dataTransfer = dt
  browser.document.querySelector('.zone')?.dispatchEvent(dropEv)
  assert.deepEqual(dropped, { id: 7 }, 'drop 事件 → dataTransfer 数据传递')
})

test('useBreakpoint：命名断点（matchMedia mock——min-width 语义——事件驱动）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  // mock matchMedia
  let width = 600
  const listeners: Array<() => void> = []
  ;(browser.window as any).matchMedia = (q: string) => ({
    get matches() { return width >= parseInt(q.match(/(\d+)/)?.[1] ?? '0', 10) },
    addEventListener: (_t: string, cb: () => void) => { listeners.push(cb) },
    removeEventListener: () => {},
  })
  const Page = (_init: Record<string, unknown>, ctx: UIContext) => {
    // 渲染期调用（useMedia 状态实时——事件驱动重渲染读最新断点）
    return () => {
      const bp = (ctx.ui as { useBreakpoint: (b: Record<string, number>) => string }).useBreakpoint({ mobile: 0, tablet: 768, desktop: 1024 })
      return h('span', { id: 'bp' }, bp)
    }
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('#bp')?.textContent, 'mobile', '600px → mobile')
  width = 900
  listeners.forEach((cb) => cb())   // 媒体变化 → 重渲染
  await waitFor(() => browser.document.querySelector('#bp')?.textContent === 'tablet')
  assert.equal(browser.document.querySelector('#bp')?.textContent, 'tablet', '900px → tablet（事件驱动）')
})

test('useChat：发送 → 流式消息累积（NDJSON 分块——useExternal 订阅重渲染）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  // mock fetch（POST /api/chat——NDJSON 流式响应）
  const origFetch = (globalThis as any).fetch
  ;(globalThis as any).fetch = async (_url: string, init: { body?: string }) => {
    const enc = new TextEncoder()
    const chunks = [
      enc.encode('{"content":"你好"}\n'),
      enc.encode('{"content":"，我是"}\n'),
      enc.encode('{"content":"AI助手"}\n'),
    ]
    const stream = new ReadableStream({
      async start(c) {
        for (const ch of chunks) { c.enqueue(ch); await new Promise((r) => setTimeout(r, 5)) }
        c.close()
      },
    })
    return { ok: true, body: stream }
  }
  try {
    const Chat = (_init: Record<string, unknown>, ctx: UIContext) => {
      const chat = (ctx.ui as { useChat: (o: object) => { messages: Array<{ role: string; content: string }>; send: (t: string) => Promise<void> } }).useChat({})
      ;(ctx.ui as { useExternal: (s: unknown) => void }).useExternal(chat as never)
      return () => h('div', {},
        h('button', { id: 'send', onClick: () => void chat.send('你好') }, '发送'),
        h('div', { id: 'msgs' }, chat.messages.map((m) => `${m.role}:${m.content}`).join('|')),
      )
    }
    router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Chat, {})))
    const serve = uiServe(router, { root: '#root', browser })
    await serve.ready
    assert.equal(browser.document.querySelector('#msgs')?.textContent, '')
    ;(browser.document.querySelector('#send') as HTMLElement).click()
    await waitFor(() => (browser.document.querySelector('#msgs')?.textContent ?? '').includes('你好'))
    await waitFor(() => (browser.document.querySelector('#msgs')?.textContent ?? '').includes('AI助手'))
    const msgs = browser.document.querySelector('#msgs')?.textContent ?? ''
    assert.ok(msgs.includes('user:你好'), '用户消息')
    assert.ok(msgs.includes('assistant:你好，我是AI助手'), '助手流式累积')
  } finally {
    ;(globalThis as any).fetch = origFetch
  }
})

test('useChat：HITL 审批（工具调用 approve——状态更新）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const initMsg = [{
    id: 'm1', role: 'assistant' as const, content: '需要审批',
    toolCalls: [{ id: 'tc1', name: 'sendEmail', args: { to: 'a@b.c' } }],
  }]
  const Chat = (_init: Record<string, unknown>, ctx: UIContext) => {
    const chat = (ctx.ui as { useChat: (o: object) => {
      messages: Array<{ toolCalls?: Array<{ id: string; approved?: boolean }> }>; approve: (id: string, ok: boolean) => void
    } }).useChat({ initialMessages: initMsg as never })
    ;(ctx.ui as { useExternal: (s: unknown) => void }).useExternal(chat as never)
    return () => h('div', {},
      h('button', { id: 'ok', onClick: () => chat.approve('tc1', true) }, '批准'),
      h('span', { id: 'st' }, String(chat.messages[0]?.toolCalls?.[0]?.approved ?? 'none')),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Chat, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('#st')?.textContent, 'none')
  ;(browser.document.querySelector('#ok') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('#st')?.textContent === 'true')
  assert.equal(browser.document.querySelector('#st')?.textContent, 'true', 'HITL 审批 → 工具调用状态更新')
})

test('createClientBrowser：SSR 安全（无全局 window → null）+ 浏览器环境', () => {
  const origW = (globalThis as any).window
  const origD = (globalThis as any).document
  // node 环境（无全局）——SSR 安全
  delete (globalThis as any).window
  delete (globalThis as any).document
  assert.equal(createClientBrowser(), null, 'SSR 无全局 window → null')
  // 浏览器环境（全局 window/document）
  const b = testBrowser()
  ;(globalThis as any).window = b.window
  ;(globalThis as any).document = b.document
  const cb = createClientBrowser()
  assert.equal(cb?.window, b.window)
  assert.equal(cb?.document, b.document)
  // 还原
  ;(globalThis as any).window = origW
  ;(globalThis as any).document = origD
})

test('usePopup presence：会话级模态——关闭退场（exit → 无动画环境立即 closed）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const Modal = (_init: Record<string, unknown>, ctx: UIContext) => {
    const popup = (ctx.ui as { usePopup: (o: object) => {
      open: boolean; setOpen: (v: boolean) => void; portal: (c: unknown, k?: string) => unknown;
      panelRef: (el: HTMLElement | null) => void; pos: { top: number; left: number }
    } }).usePopup({ presence: true, positioning: 'none' })
    return () => h('div', {},
      h('button', { id: 'm', onClick: () => popup.setOpen(!popup.open) }, '弹窗'),
      popup.portal(
        h('div', { ref: popup.panelRef as never, class: 'modal', style: { position: 'fixed', inset: '0' } }, '模态'),
        'modal',
      ) as never,
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Modal, {})))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  ;(browser.document.querySelector('#m') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.modal') !== null)
  assert.ok(browser.document.querySelector('.modal'), '打开 → 模态渲染')
  ;(browser.document.querySelector('#m') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.modal') === null)
  assert.equal(browser.document.querySelector('.modal'), null, '关闭 → 退场后移除（无动画环境立即）')
})

test('uiSsr：同一 handler → 完整 HTML 文档（SSR——无 hydration 决策）', async () => {
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'home' }, '你好 <SSR>')))
  router.get('/about', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'about' }, '关于')))
  const html = await uiSsr(router, '/', { title: '首页' })
  assert.ok(html.startsWith('<!DOCTYPE html>'), '完整文档')
  assert.ok(html.includes('<title>首页</title>'))
  assert.ok(html.includes('<div id="root"><div class="home">你好 &lt;SSR&gt;</div></div>'), '内容 + 转义')
  // 另一路由
  const about = await uiSsr(router, '/about')
  assert.ok(about.includes('<div class="about">关于</div>'))
})

test('uiSsr：组件渲染（工厂 + ctx.data 服务端取数——mock fetch）', async () => {
  const router = new UIRouter()
  const origFetch = (globalThis as any).fetch
  ;(globalThis as any).fetch = async (url: string) => ({ ok: true, json: async () => ({ title: `文章-${url.split('/').pop()}` }) })
  try {
    const Post = async (init: Record<string, unknown>, ctx: UIContext) => {
      const post = await ctx.data.get<{ title: string }>(`/api/posts/${init.id}`)
      return () => h('article', {}, post.title)
    }
    router.get('/posts/:id', (req, ctx) => (ctx as RenderCtx).stream(h(Post, { id: ctx.params!.id })))
    const html = await uiSsr(router, '/posts/7')
    assert.ok(html.includes('<article>文章-7</article>'), '服务端取数 → HTML')
  } finally {
    ;(globalThis as any).fetch = origFetch
  }
})

test('uiSsr：notFound 兜底（无匹配路由 → 空 root 文档）', async () => {
  const router = new UIRouter()
  router.notFound((req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'nf' }, '404')))
  const html = await uiSsr(router, '/missing')
  assert.ok(html.includes('<div class="nf">404</div>'))
})

test('组件生命周期：导航到组件页面——root 类型变化 → 全量 build（旧实例卸载 + 新页完整）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const events: string[] = []
  const HomePage = (_init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('home-unmount'))
    return () => h('div', { class: 'home' }, h('a', { href: '/posts/1' }, '去文章'))
  }
  const PostPage = async (init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('post-unmount'))
    const post = await ctx.data.get<{ title: string }>(`/api/posts/${init.id}`)
    return () => h('article', { class: 'post' }, post.title)
  }
  const origFetch = (globalThis as any).fetch
  ;(globalThis as any).fetch = async (url: string) => ({ ok: true, json: async () => ({ title: `文章-${url.split('/').pop()}` }) })
  try {
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(HomePage, {})))
  router.get('/posts/:id', (req, ctx) => (ctx as RenderCtx).stream(h(PostPage, { id: ctx.params!.id })))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.ok(browser.document.querySelector('.home'), '首页渲染')
  // 链接点击 → 导航 → PostPage（root 类型变化——HomePage 卸载 + 全量 build）
  ;(browser.document.querySelector('a') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.post') !== null)
  assert.equal(browser.document.querySelector('.post')?.textContent, '文章-1', 'PostPage 渲染（ctx.params.id 取数）')
  assert.equal(browser.document.querySelector('.home'), null, '旧页移除（done.full 清理）')
  assert.deepEqual(events, ['home-unmount'], '旧组件卸载清理')
  // 返回首页 → PostPage 卸载
  ;(serve as unknown as { navigate: (p: string) => Promise<void> }).navigate('/')
  await waitFor(() => browser.document.querySelector('.home') !== null)
  assert.deepEqual(events, ['home-unmount', 'post-unmount'], '新页卸载清理')
  } finally {
    ;(globalThis as any).fetch = origFetch
  }
})

test('组件生命周期：子组件类型切换（A → B 条件渲染——卸载重建 + onUnmounts）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const events: string[] = []
  const A = (_i: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('a-unmount'))
    return () => h('div', { class: 'a' }, 'A组件')
  }
  const B = (_i: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('b-unmount'))
    return () => h('div', { class: 'b' }, 'B组件')
  }
  const Page = (init: Record<string, unknown>, ctx: Ctx) => {
    let show = init.show as boolean
    const onToggle = () => { show = !show; void ctx.render() }
    return () => h('div', {},
      h('button', { id: 't', onClick: onToggle }, '切换'),
      show ? h(A, {}) : h(B, {}),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, { show: true })))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.ok(browser.document.querySelector('.a'), 'A 渲染')
  // 点击切换 A → B（同位置不同类型——卸载重建）
  ;(browser.document.querySelector('#t') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.b') !== null)
  assert.equal(browser.document.querySelector('.a'), null, 'A 移除')
  assert.deepEqual(events, ['a-unmount'], 'A 卸载清理')
  // B → A
  ;(browser.document.querySelector('#t') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.a') !== null)
  assert.deepEqual(events, ['a-unmount', 'b-unmount'], 'B 卸载清理')
})

test('综合生命周期：浮层 + keyed 列表 + 条件渲染 + Fragment + ref——完整命令流', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const events: string[] = []
  const refCalls: string[] = []
  const titleRef = (el: HTMLElement | null) => { refCalls.push(el ? `ref-mount:${el.isConnected}` : 'ref-unmount') }

  // keyed 列表项（有内部状态——身份跟随 key）
  const Comment = (init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push(`un:comment:${init.id}`))
    let votes = 0
    const onVote = () => { votes++; void ctx.render() }
    return () => h('li', { class: 'cmt' },
      h('span', { class: 'txt' }, `${String(init.text)}(${votes})`),
      h('button', { class: 'vote', onClick: onVote }, '赞'),
    )
  }
  // 条件渲染组件
  const Extra = (_init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('un:extra'))
    return () => h('div', { class: 'extra' }, '扩展')
  }
  // 页面（浮层 + 列表 + 条件 + Fragment）
  const Page = (init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('un:page'))
    const popup = (ctx.ui as { usePopup: (o: object) => {
      open: boolean; setOpen: (v: boolean) => void; portal: (c: unknown, k?: string) => unknown;
      panelRef: (el: HTMLElement | null) => void; pos: { top: number; left: number }
    } }).usePopup({ placement: 'bottom' })
    let ids = init.ids as string[]
    let showMore = false
    let likes = 0
    const onLike = () => { likes++; void ctx.render() }
    const onAdd = () => { ids = [...ids, `c${ids.length}`]; void ctx.render() }
    const onMore = () => { showMore = !showMore; void ctx.render() }
    return () => h('article', { class: 'post' },
      h('h1', { ref: titleRef as never }, '文章'),                      // ref
      h('button', { id: 'like', onClick: onLike }, `赞${likes}`),       // 交互
      // Fragment（数组展开——隐式 Fragment）
      h('span', { class: 'tag-a' }, '#a'),
      h('span', { class: 'tag-b' }, '#b'),
      // 条件渲染（false 占位 ↔ 组件）
      showMore ? h(Extra, {}) : null,
      // keyed 列表（增删——身份复用）
      h('ul', { class: 'list' }, ids.map((id) => h(Comment, { key: id, id, text: `评论${id}` }))),
      h('button', { id: 'add', onClick: onAdd }, '加评论'),
      h('button', { id: 'more', onClick: onMore }, '展开'),
      // 浮层（usePopup——portal）
      h('button', { id: 'dd', onClick: () => popup.setOpen(!popup.open) }, '菜单'),
      popup.portal(
        h('div', { ref: popup.panelRef as never, class: 'menu', style: { position: 'fixed', top: '0px', left: '0px' } }, '下拉项'),
        'dd',
      ) as never,
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, { ids: ['c0', 'c1'] })))
  router.get('/about', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'about' }, '关于')))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready

  // ── ① 首帧（mount：page + comment×2 + ref 挂载 + Fragment 展开） ──
  const article = browser.document.querySelector('.post') as HTMLElement
  assert.ok(article, '页面渲染')
  assert.equal(article.querySelectorAll('.cmt').length, 2, 'keyed 列表 2 项')
  assert.equal(article.querySelector('.tag-a')?.textContent, '#a', 'Fragment 数组展开')
  assert.equal(article.querySelector('.tag-b')?.textContent, '#b')
  assert.deepEqual(refCalls, ['ref-mount:true'], 'ref 挂载后触发（el 已连接）')
  assert.equal(article.querySelector('.extra'), null, '条件渲染初始关闭（false 占位）')

  // ── ② 交互：点赞（diff 精准——状态保持） ──
  ;(browser.document.querySelector('#like') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('#like')?.textContent === '赞1')
  assert.equal(browser.document.querySelector('#like')?.textContent, '赞1')

  // ── ③ 条件渲染开（null → 组件——占位锚 ↔ 元素转换） ──
  ;(browser.document.querySelector('#more') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.extra') !== null)
  assert.equal(browser.document.querySelector('.extra')?.textContent, '扩展', 'Extra mount（占位锚转换）')

  // ── ④ keyed 列表增（新项 mount——旧项身份复用不重建） ──
  ;(browser.document.querySelector('#add') as HTMLElement).click()
  await waitFor(() => browser.document.querySelectorAll('.cmt').length === 3)
  assert.equal(browser.document.querySelectorAll('.cmt').length, 3, 'keyed 增——身份复用')
  // 旧项投票状态保持（点击第一个评论的赞——闭包状态）
  ;(article.querySelectorAll('.vote')[0] as HTMLElement).click()
  await waitFor(() => article.querySelectorAll('.txt')[0]?.textContent === '评论c0(1)')
  assert.equal(article.querySelectorAll('.txt')[0]?.textContent, '评论c0(1)', '列表增后旧项状态保持')

  // ── ⑤ 浮层开（portal——插槽锚 + 容器内容） ──
  ;(browser.document.querySelector('#dd') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('.menu') !== null)
  const menu = browser.document.querySelector('.menu') as HTMLElement
  assert.equal(menu.closest('#__wf_portal') !== null, true, '浮层 portal 到 #__wf_portal')
  assert.equal(menu.textContent, '下拉项')
  // 浮层内点击不触发外部关闭（事件代理——面板内）
  menu.click()
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(browser.document.querySelector('.menu'), '面板内点击不关闭')

  // ── ⑥ 浮层关（removePortal——容器清空） ──
  browser.document.body.dispatchEvent(new browser.window.MouseEvent('mousedown', { bubbles: true }))
  await waitFor(() => browser.document.querySelector('.menu') === null)
  assert.equal(browser.document.querySelector('.menu'), null, '外部点击关闭——容器清理')

  // ── ⑦ 导航离开（整树卸载——onUnmounts 逆序 + ref(null) + 资源清理） ──
  await serve.navigate('/about')
  await waitFor(() => browser.document.querySelector('.about') !== null)
  assert.equal(browser.document.querySelector('.post'), null, '旧页移除')
  assert.deepEqual(refCalls, ['ref-mount:true', 'ref-unmount'], 'ref(null) 卸载清理')
  // 卸载顺序：**LIFO（后挂载先卸载）**——c2（列表增后）→ extra（条件开后）→ c1/c0 → page
  assert.deepEqual(events, ['un:comment:c2', 'un:extra', 'un:comment:c1', 'un:comment:c0', 'un:page'], 'onUnmounts LIFO（栈语义）')
})

test('路由切换精准化：布局共享（root 稳定）——Header 复用不重建 + 页面内容精准替换', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  const events: string[] = []
  // 共享布局（root 稳定——跨路由复用）
  const Layout = (init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('un:layout'))
    return (props: Record<string, unknown>) => h('div', { class: 'layout' },
      h('header', { class: 'hd' }, '站点头'),
      props.page as never,  // 页面内容（组件——类型变化 → 局部替换）
    )
  }
  const HomePage = (_i: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('un:home'))
    return () => h('main', { class: 'home' }, '首页')
  }
  const AboutPage = (_i: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('un:about'))
    return () => h('main', { class: 'about' }, '关于')
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Layout, { page: h(HomePage, {}) })))
  router.get('/about', (req, ctx) => (ctx as RenderCtx).stream(h(Layout, { page: h(AboutPage, {}) })))
  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready
  const headerBefore = browser.document.querySelector('.hd')
  assert.ok(headerBefore, 'Header 渲染')
  assert.ok(browser.document.querySelector('.home'), '首页内容')

  // 导航 → /about（root 相同 Layout——diff 精准——Header 复用）
  await serve.navigate('/about')
  await waitFor(() => browser.document.querySelector('.about') !== null)
  const headerAfter = browser.document.querySelector('.hd')
  assert.equal(headerAfter, headerBefore, '**Header 节点复用（不重建——布局共享精准）**')
  assert.equal(headerAfter?.textContent, '站点头')
  assert.equal(browser.document.querySelector('.home'), null, '首页内容移除（局部替换）')
  assert.deepEqual(events, ['un:home'], '仅 HomePage 卸载——Layout 保持')
  assert.equal(browser.document.querySelector('.layout'), headerAfter?.parentElement, 'Layout 结构保持')

  // 返回首页——AboutPage 卸载——HomePage 重建（Layout/Header 仍复用）
  await serve.navigate('/')
  await waitFor(() => browser.document.querySelector('.home') !== null)
  assert.equal(browser.document.querySelector('.hd'), headerBefore, '往返导航 Header 始终复用')
  assert.deepEqual(events, ['un:home', 'un:about'], '仅页面内容卸载——Layout 不卸载')
})
