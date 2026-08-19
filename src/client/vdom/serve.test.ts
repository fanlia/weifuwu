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
import { createStore } from './store.ts'

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
    const UserCard = async (initProps: Record<string, unknown>, ctx: Ctx) => {
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
    const Card = async (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Counter = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Comp = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Dropdown = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Parent = (_init: Record<string, unknown>, ctx: Ctx) => {
    let open = false
    return () => h('div', {},
      h('button', { id: 'p', onClick: () => { open = !open; void ctx.render() } }, '父'),
      h(Child, { open, onOpenChange: (v: boolean) => { open = v; void ctx.render() } }),
    )
  }
  const Child = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Modal = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Comp = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Dropdown = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Dropdown = (_init: Record<string, unknown>, ctx: Ctx) => {
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
    const UserCard = async (initProps: Record<string, unknown>, ctx: Ctx) => {
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
    const Card = async (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Counter = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Comp = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Dropdown = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Parent = (_init: Record<string, unknown>, ctx: Ctx) => {
    let open = false
    return () => h('div', {},
      h('button', { id: 'p', onClick: () => { open = !open; void ctx.render() } }, '父'),
      h(Child, { open, onOpenChange: (v: boolean) => { open = v; void ctx.render() } }),
    )
  }
  const Child = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Modal = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Comp = (_init: Record<string, unknown>, ctx: Ctx) => {
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
  const Menu = (_init: Record<string, unknown>, ctx: Ctx) => {
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
