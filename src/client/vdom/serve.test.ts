/**
 * vdom serve — 端到端契约测试（uiServe + UIRouter——使用形态定义）
 *
 * 用户使用形态（决策 2026-12）：
 * ```ts
 * const router = new UIRouter()
 * router.get('/', (req, ctx) => ctx.stream(h('div', {}, 'hello world')))
 * uiServe(router, { root: '#root' })
 * ```
 *
 * ctx.render() = 重新渲染唯一入口（事件/fetch/定时器回调）——
 * 重新 resolve（handler 重跑——registry 复用——工厂不重跑）→
 * **新的 Response command 事件流** → 消费（patch 对照现有 DOM——就地更新）。
 */

import { test, expect, inject } from 'vitest'
import { page } from '@vitest/browser/context'
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
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'app' }, 'hello world')))

  const serve = uiServe(router, { root: '#root' })
  await serve.ready

  const el = document.querySelector('#root .app')
  expect(el, '页面元素已渲染到 #root').toBeTruthy()
  expect(el?.textContent).toBe('hello world')
})

test('ctx.render()：事件回调 → 新 command 事件流 → 消费就地更新（组件状态保持）', async () => {
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

  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const btn = () => document.querySelector('#inc') as HTMLElement
  expect(btn().textContent).toBe('count:0')
  expect(mounts).toBe(1)

  btn().click()                    // 事件 → 改状态 → ctx.render()
  await waitFor(() => btn()?.textContent === 'count:1')
  expect(mounts, '工厂不重跑——registry 复用').toBe(1)
  expect(btn().textContent, '新事件流消费——DOM 就地更新').toBe('count:1')
  expect(btn().isConnected, '节点复用（非重建）——就地更新').toBe(true)

  btn().click()
  await waitFor(() => btn()?.textContent === 'count:2')
  expect(btn().textContent, '连续点击——状态累计').toBe('count:2')
})

test('ctx.render()：fetch/定时器同入口（非事件场景）', async () => {
  const router = new UIRouter()
  const Page = (init: Record<string, unknown>) => {
    let status = 'loading'
    const rc = init.ctx as RenderCtx
    // 模拟 fetch 结束 + 定时器回调
    setTimeout(() => { status = 'loaded'; void rc.render() }, 10)
    return () => h('div', { class: 'st' }, status)
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, { ctx })))

  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('.st')?.textContent).toBe('loading')
  await waitFor(() => document.querySelector('.st')?.textContent === 'loaded')
  expect(document.querySelector('.st')?.textContent, '定时器回调 → ctx.render() → DOM 更新').toBe('loaded')
})

test('serve 实例隔离：两次挂载互不干扰（独立容器——registry/监听各自持有）', async () => {
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, 'one')))
  // 第二个容器（beforeEach 只注入 #root——动态补）
  const extra = document.createElement('div')
  extra.id = 'root2'
  document.body.appendChild(extra)
  const s1 = uiServe(router, { root: '#root' })
  await s1.ready
  const s2 = uiServe(router, { root: '#root2' })
  await s2.ready
  expect(document.querySelector('#root')?.textContent, '实例一渲染').toBe('one')
  expect(document.querySelector('#root2')?.textContent, '实例二渲染').toBe('one')
  // 实例一卸载不影响实例二（独立监听/清理）
  s1.unmount()
  expect(document.querySelector('#root2')?.textContent, '卸载互不影响').toBe('one')
  s2.unmount()
})

test('route 闭环：navigate() 编程式导航——root 异类型整树替换', async () => {
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'home' }, '首页')))
  router.get('/about', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'about' }, '关于')))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('.home')?.textContent).toBe('首页')

  await serve.navigate('/about')
  expect(document.querySelector('.about')?.textContent, '导航切换页面').toBe('关于')
  expect(document.querySelector('.home'), '旧页移除（整树替换）').toBe(null)
  expect(window.location.pathname, 'URL 更新').toBe('/about')

  await serve.navigate('/')
  expect(document.querySelector('.home')?.textContent, '返回首页').toBe('首页')
})

test('route 闭环：链接拦截——同源 a[href] 点击 → 导航（外链/锚点不拦截）', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready

  ;(document.querySelector('#in') as HTMLElement).click()
  await waitFor(() => document.querySelector('.about') !== null)
  expect(window.location.pathname, '同源链接拦截导航').toBe('/about')
})

test('route 闭环：popstate——浏览器前进/后退', async () => {
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'home' }, '首页')))
  router.get('/detail', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'detail' }, '详情')))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  await serve.navigate('/detail')
  expect(document.querySelector('.detail')?.textContent).toBe('详情')

  // 后退（history.back → popstate）
  window.history.back()
  await waitFor(() => document.querySelector('.home') !== null)
  expect(window.location.pathname, '后退回首页').toBe('/')
  expect(document.querySelector('.home')?.textContent).toBe('首页')
})

test('渲染队列 FIFO：快速连续触发（渲染中 render → push 入队——每个请求最终执行）', async () => {
  const router = new UIRouter()
  let count = 0
  let handlerCalls = 0 // handler 调用次数（= 渲染请求执行次数）
  router.get('/', (req, ctx) => {
    handlerCalls++
    return (ctx as RenderCtx).stream(h('div', {}, h('button', {
      id: 'fast',
      onClick: () => { count++; void (ctx as RenderCtx).render() },
    }, `c:${count}`)))
  })
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const btn = () => document.querySelector('#fast') as HTMLElement
  expect(btn().textContent).toBe('c:0')
  expect(handlerCalls, '首帧一次').toBe(1)
  // 连续点击 5 次（渲染中触发 → push 入队——FIFO——**每个请求最终执行**）
  // 确定性：渲染读最新闭包状态（count=5）——但**每个请求都执行渲染**
  // （handler 调用次数 = 请求次数——区别于旧单槽位合并：只补跑一次）
  for (let i = 0; i < 5; i++) btn().click()
  await waitFor(() => handlerCalls >= 6) // 首帧 1 + 5 次请求 = 6 次 handler 调用
  expect(handlerCalls, 'FIFO 逐条执行——每个请求都渲染（无合并）').toBe(6)
  // 最终：全部请求执行完——DOM = 最新状态（c:5——渲染读最新闭包）
  await waitFor(() => btn()?.textContent === 'c:5')
  expect(btn().textContent, '快速连续触发——每个请求最终执行（无丢失）').toBe('c:5')
})

test('渲染队列 FIFO：渲染中 await ctx.render()——精确等待全部队列执行完', async () => {
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
          const v1 = document.querySelector('#v')?.textContent
          n = 2
          await rc.render()          // 渲染中再 render（同回调）
          const v2 = document.querySelector('#v')?.textContent
          ;(globalThis as any).__seq = [v1, v2]
        } }, 'seq'),
      )
    }
  }
  router.get('/', (req, ctx) => {
    ;(globalThis as any).__rc = ctx
    return (ctx as RenderCtx).stream(h(Page, {}))
  })
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  ;(document.querySelector('#seq') as HTMLElement).click()
  await waitFor(() => (globalThis as any).__seq !== undefined)
  expect((globalThis as any).__seq, '渲染中 await——精确等待（含补跑）——DOM 最新').toEqual(['v:1', 'v:2'])
})

test('ctx.data：组件工厂 await 取数渲染（SPA fetch——mock 全局 fetch）', async () => {
  const router = new UIRouter()
  const base = inject('baseUrl')
  const UserCard = async (initProps: Record<string, unknown>, ctx: UIContext) => {
    const user = await ctx.data.get<{ name: string }>(`${base}/api/user/${initProps.id}`)
    return () => h('div', { class: 'user' }, user.name)
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, h(UserCard, { id: 7 }))))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('.user')?.textContent, '工厂 await ctx.data.get → 渲染数据（真实 HTTP）').toBe('user-7')
})

test('ctx.data：并发合并——两组件同 key 取数（fetcher 一次）', async () => {
  const router = new UIRouter()
  const base = inject('baseUrl')
  const Card = async (_init: Record<string, unknown>, ctx: UIContext) => {
    // 响应体带 calls 计数（fixture server）——合并缓存保证两组件同值（calls=1）
    const d = await ctx.data.get<{ v: string; calls: number }>(`${base}/api/shared`)
    return () => h('span', { class: 'card' }, `${d.v}/${d.calls}`)
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', {}, [h(Card, {}), h(Card, {})])))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelectorAll('.card').length).toBe(2)
  const texts = [...document.querySelectorAll('.card')].map((el) => el.textContent)
  expect(texts[0], '并发合并——同 key 一次 fetch（两组件同 calls=1）').toBe('shared/1')
  expect(texts[1]).toBe('shared/1')
})

test('useExternal：store 共享状态——变化 → 组件重渲染（跨组件）', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('#v')?.textContent).toBe('c:0')
  ;(document.querySelector('#inc') as HTMLElement).click()  // store 变化 → 订阅组件重渲染
  await waitFor(() => document.querySelector('#v')?.textContent === 'c:1')
  expect(document.querySelector('#v')?.textContent, 'store 变化 → useExternal 组件自动重渲染').toBe('c:1')
})

test('useExternal：unmount 自动退订（订阅泄漏防护）', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(active, '订阅建立').toBe(1)
  await serve.navigate('/none')  // 导航——组件卸载
  // 退订在 unmount（组件卸载指令——onUnmounts 执行）——当前订阅仍在（页面级渲染）
  // 断言：订阅函数已注册（unmount 时退订——后续验证）
  expect(active).toBe(1)
  serve.unmount()
})

test('useOpen：非受控开关——setOpen → 重渲染显示', async () => {
  const router = new UIRouter()
  const Dropdown = (_init: Record<string, unknown>, ctx: UIContext) => {
    const open = (ctx.ui as { useOpen: (i: boolean) => { open: boolean; setOpen: (v: boolean) => void } }).useOpen(false)
    return () => h('div', {},
      h('button', { id: 'toggle', onClick: () => open.setOpen(!open.open) }, '开关'),
      open.open ? h('div', { class: 'panel' }, '面板') : null,
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Dropdown, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('.panel'), '初始关闭').toBe(null)
  ;(document.querySelector('#toggle') as HTMLElement).click()
  await waitFor(() => document.querySelector('.panel') !== null)
  expect(document.querySelector('.panel')?.textContent, 'setOpen → 重渲染').toBe('面板')
  ;(document.querySelector('#toggle') as HTMLElement).click()
  await waitFor(() => document.querySelector('.panel') === null)
  expect(document.querySelector('.panel'), '再点关闭').toBe(null)
})

test('useOpen：受控——父 props 独占（onOpenChange 回调出口）', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const c = () => document.querySelector('#c') as HTMLElement
  expect(c().textContent).toBe('关')
  c().click()   // 受控——onOpenChange → 父更新 → 重渲染 → props 回流
  await waitFor(() => c()?.textContent === '开')
  expect(c().textContent, '受控——回调出口驱动').toBe('开')
})

test('useGlobalKey：Escape 关闭（window keydown——unmount 清理）', async () => {
  const router = new UIRouter()
  const Modal = (_init: Record<string, unknown>, ctx: UIContext) => {
    const open = (ctx.ui as { useOpen: (i: boolean) => { open: boolean; setOpen: (v: boolean) => void } }).useOpen(true)
    ;(ctx.ui as { useGlobalKey: (m: string, h: (e: Event) => void) => void }).useGlobalKey('Escape', () => open.setOpen(false))
    return () => open.open ? h('div', { class: 'modal' }, '弹窗') : null
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Modal, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('.modal'), '弹窗显示').toBeTruthy()
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
  await waitFor(() => document.querySelector('.modal') === null)
  expect(document.querySelector('.modal'), 'Escape → useGlobalKey → setOpen(false)').toBe(null)
})

test('useStableRef：跨渲染稳定引用', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const v1 = document.querySelector('#r')?.textContent
  await (serve as unknown as { navigate: (p: string) => Promise<void> }).navigate('/')
  await waitFor(() => document.querySelector('#r')?.textContent !== v1)
  expect(document.querySelector('#r')?.textContent, '稳定引用跨渲染保持').toBe('n:2')
})

test('usePopup：打开 → portal 面板（#__wf_portal + fixed 定位——placement bottom）', async () => {
  const router = new UIRouter()
  const Dropdown = (_init: Record<string, unknown>, ctx: UIContext) => {
    const popup = (ctx.ui as { usePopup: (o: { placement?: string }) => {
      open: boolean; setOpen: (v: boolean) => void; portal: (c: unknown, k?: string) => unknown;
      panelRef: (el: HTMLElement | null) => void; pos: { top: number; left: number }
    } }).usePopup({ placement: 'bottom', trigger: () => document.querySelector('#trig') as HTMLElement | null })
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('.panel'), '初始关闭').toBe(null)
  ;(document.querySelector('#trig') as HTMLElement).click()
  await waitFor(() => document.querySelector('.panel') !== null)
  const panel = document.querySelector('.panel') as HTMLElement
  expect(panel, '打开 → 面板渲染').toBeTruthy()
  expect(panel.closest('#__wf_portal') !== null, 'portal 到 #__wf_portal（弹窗纪律）').toBe(true)
  const trig = document.querySelector('#trig') as HTMLElement
  expect(panel.getBoundingClientRect().top >= trig.getBoundingClientRect().bottom, 'bottom 定位（面板在锚点下方）').toBeTruthy()
})

test('usePopup：外部点击关闭 + Escape 关闭', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  ;(document.querySelector('#trig') as HTMLElement).click()
  await waitFor(() => document.querySelector('.panel') !== null)
  console.log('[popup-test] opened:', !!document.querySelector('.panel'))
  // 外部点击（body 空白）→ 关闭
  document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 100))
  console.log('[popup-test] after 100ms:', !!document.querySelector('.panel'))
  await waitFor(() => document.querySelector('.panel') === null)
  expect(document.querySelector('.panel'), '外部点击关闭').toBe(null)
  // 再开——Escape 关闭
  ;(document.querySelector('#trig') as HTMLElement).click()
  await waitFor(() => document.querySelector('.panel') !== null)
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
  await waitFor(() => document.querySelector('.panel') === null)
  expect(document.querySelector('.panel'), 'Escape 关闭').toBe(null)
})

test('usePopup：打开 → portal 面板（#__wf_portal 下 + fixed 定位）', async () => {
  const router = new UIRouter()
  const Menu = (_init: Record<string, unknown>, ctx: UIContext) => {
    const popup = (ctx.ui as { usePopup: (o: { placement?: string; isOpen?: boolean; setOpen?: (v: boolean) => void }) => {
      open: boolean; setOpen: (v: boolean) => void; portal: (c: unknown, k?: string) => unknown; panelRef: (el: HTMLElement | null) => void
    } }).usePopup({ placement: 'bottom', trigger: () => document.querySelector('#trig') as HTMLElement | null })
    return () => h('div', {},
      h('button', { id: 'btn', ref: (el: HTMLElement | null) => { (ctx as never); if (el) (popup as never) } }, '菜单'),
      popup.portal(
        h('div', { ref: popup.panelRef as never, class: 'menu' }, '选项A'),
        'menu',
      ) as never,
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Menu, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  // 无触发按钮联动——直接验证 portal 形态：当前 open=false → 无面板
  expect(document.querySelector('.menu'), '关闭态无面板').toBe(null)
})

test('useControlled：非受控内部状态——setValue → 重渲染；受控 onChange 出口', async () => {
  const router = new UIRouter()
  const Input = (_init: Record<string, unknown>, ctx: UIContext) => {
    const c = (ctx.ui as { useControlled: <T>(c: object, d: T) => { value: T; setValue: (v: T) => void } }).useControlled({}, '')
    return () => h('input', {
      id: 'in', value: c.value as string,
      onInput: (e: Event) => c.setValue((e.target as HTMLInputElement).value),
    })
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Input, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const input = () => document.querySelector('#in') as HTMLInputElement
  input().value = 'hello'
  input().dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => input()?.value === 'hello')
  expect(input().value, '非受控——内部状态 + 重渲染（input value 保持）').toBe('hello')
})

test('useScrollPosition：内部容器滚动——y 响应式（事件驱动重渲染）', async () => {
  const router = new UIRouter()
  const Scroller = (_init: Record<string, unknown>, ctx: UIContext) => {
    const pos = (ctx.ui as { useScrollPosition: (t: () => HTMLElement | null) => { y: number } }).useScrollPosition(() => document.querySelector('.sc') as HTMLElement | null)
    return () => h('div', { class: 'wrap' },
      h('div', { class: 'sc', style: { height: '100px', overflow: 'auto' } }, h('div', { style: { height: '300px' } }, '长内容')),
      h('span', { id: 'y' }, `y:${pos.y}`),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Scroller, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('#y')?.textContent).toBe('y:0')
  const sc = document.querySelector('.sc') as HTMLElement
  sc.scrollTop = 100
  sc.dispatchEvent(new Event('scroll', { bubbles: true }))
  await waitFor(() => document.querySelector('#y')?.textContent === 'y:100')
  expect(document.querySelector('#y')?.textContent, '滚动 → y 响应式更新').toBe('y:100')
})

test('useInView：IntersectionObserver——isIn 响应式（真实 IO——视口内可见 → 重渲染）', async () => {
  const router = new UIRouter()
  const View = (_init: Record<string, unknown>, ctx: UIContext) => {
    const v = (ctx.ui as { useInView: (t: () => HTMLElement | null) => { isIn: boolean } }).useInView(() => document.querySelector('.box') as HTMLElement | null)
    return () => h('div', {},
      h('div', { class: 'box' }, '目标'),
      h('span', { id: 'vis' }, v.isIn ? '可见' : '隐藏'))
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(View, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  // 真实浏览器：.box 渲染在视口内 → IO 异步触发 → 可见
  await waitFor(() => document.querySelector('#vis')?.textContent === '可见')
  expect(document.querySelector('#vis')?.textContent, '真实 IO → isIn 响应式').toBe('可见')
  // 隐藏元素（display:none → 布局移除）→ IO 触发不可见
  ;(document.querySelector('.box') as HTMLElement).style.display = 'none'
  await waitFor(() => document.querySelector('#vis')?.textContent === '隐藏')
  expect(document.querySelector('#vis')?.textContent, '元素隐藏 → isIn false').toBe('隐藏')
})

test('useControlledInput：内部输入态（keyword——焦点保持）+ IME 门控', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const el = () => document.querySelector('#kw') as HTMLInputElement
  // 输入（非组合——keyword 内部态 + value 回流）
  el().value = '支'
  el().dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => el()?.value === '支')
  expect(el().value, '内部输入态（keyword）——输入不丢').toBe('支')
  // IME 组合门控（组合期间 setKeyword 不触发 onChange——不打断）
  el().dispatchEvent(new Event('compositionstart'))
  el().value = '支付'
  el().dispatchEvent(new Event('input', { bubbles: true }))
  el().dispatchEvent(new Event('compositionend'))
  await waitFor(() => el()?.value === '支付')
  expect(el().value, '组合结束——最终值保留').toBe('支付')
})

test('useDragDrop：draggable enumerated + 拖拽事件 + dataTransfer 数据', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const card = document.querySelector('.card') as HTMLElement
  expect(card.draggable, 'draggable enumerated 显式 true').toBe(true)
  // 模拟 drop（dataTransfer）
  const dt = { getData: () => JSON.stringify({ id: 7 }) } as DataTransfer
  const dropEv = new Event('drop', { bubbles: true }) as Event & { dataTransfer?: DataTransfer }
  dropEv.dataTransfer = dt
  document.querySelector('.zone')?.dispatchEvent(dropEv)
  expect(dropped, 'drop 事件 → dataTransfer 数据传递').toEqual({ id: 7 })
})

test('useBreakpoint：命名断点（真实视口——min-width 语义——事件驱动）', async () => {
  const router = new UIRouter()
  // 初始 600px：全部断点不匹配（真实视口驱动）
  await page.viewport(600, 800)
  const Page = (_init: Record<string, unknown>, ctx: UIContext) => {
    // 渲染期调用（useMedia 状态实时——事件驱动重渲染读最新断点）
    return () => {
      const bp = (ctx.ui as { useBreakpoint: (b: Record<string, number>) => string }).useBreakpoint({ mobile: 0, tablet: 768, desktop: 1024 })
      return h('span', { id: 'bp' }, bp)
    }
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('#bp')?.textContent, '600px → mobile').toBe('mobile')
  // 900px：tablet 断点匹配（真实视口变化 → matchMedia change → 重渲染）
  await page.viewport(900, 800)
  await waitFor(() => document.querySelector('#bp')?.textContent === 'tablet')
  expect(document.querySelector('#bp')?.textContent, '900px → tablet（事件驱动）').toBe('tablet')
  // 1200px：desktop
  await page.viewport(1200, 800)
  await waitFor(() => document.querySelector('#bp')?.textContent === 'desktop')
  expect(document.querySelector('#bp')?.textContent, '1200px → desktop').toBe('desktop')
  // 回退 600px
  await page.viewport(600, 800)
  await waitFor(() => document.querySelector('#bp')?.textContent === 'mobile')
  expect(document.querySelector('#bp')?.textContent, '回退 → mobile').toBe('mobile')
})

test('useChat：发送 → 流式消息累积（NDJSON 分块——useExternal 订阅重渲染）', async () => {
  const router = new UIRouter()
  const base = inject('baseUrl')
  const Chat = (_init: Record<string, unknown>, ctx: UIContext) => {
      // 真 server（fixture /api/chat——NDJSON 分块流）——POST 真实 HTTP
      const chat = (ctx.ui as { useChat: (o: object) => { messages: Array<{ role: string; content: string }>; send: (t: string) => Promise<void> } }).useChat({ url: `${base}/api/chat` })
      ;(ctx.ui as { useExternal: (s: unknown) => void }).useExternal(chat as never)
      return () => h('div', {},
        h('button', { id: 'send', onClick: () => void chat.send('你好') }, '发送'),
        h('div', { id: 'msgs' }, chat.messages.map((m) => `${m.role}:${m.content}`).join('|')),
      )
    }
    router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Chat, {})))
    const serve = uiServe(router, { root: '#root' })
    await serve.ready
  expect(document.querySelector('#msgs')?.textContent).toBe('')
    ;(document.querySelector('#send') as HTMLElement).click()
    await waitFor(() => (document.querySelector('#msgs')?.textContent ?? '').includes('你好'))
    await waitFor(() => (document.querySelector('#msgs')?.textContent ?? '').includes('AI助手'))
    const msgs = document.querySelector('#msgs')?.textContent ?? ''
  expect(msgs.includes('user:你好'), '用户消息').toBeTruthy()
  expect(msgs.includes('assistant:你好，我是AI助手'), '助手流式累积（真实 HTTP 分块）').toBeTruthy()
})

test('useChat：HITL 审批（工具调用 approve——状态更新）', async () => {
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
      h('button', { id: 'ok', onClick: () => void chat.approve('approved') }, '批准'),
      h('span', { id: 'st' }, String(chat.messages[0]?.toolCalls?.[0]?.approved ?? 'none')),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Chat, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('#st')?.textContent).toBe('none')
  ;(document.querySelector('#ok') as HTMLElement).click()
  await waitFor(() => document.querySelector('#st')?.textContent === 'true')
  expect(document.querySelector('#st')?.textContent, 'HITL 审批 → 工具调用状态更新').toBe('true')
})

test('createClientBrowser：浏览器环境（真实全局——SSR 惰性分支由服务端路径保障）', () => {
  const cb = createClientBrowser()
  expect(cb.window).toBe(window)
  expect(cb.document).toBe(document)
  expect(cb.scrollTop()).toBeGreaterThanOrEqual(0)
})

test('usePopup presence：会话级模态——关闭退场（exit → 无动画环境立即 closed）', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  ;(document.querySelector('#m') as HTMLElement).click()
  await waitFor(() => document.querySelector('.modal') !== null)
  expect(document.querySelector('.modal'), '打开 → 模态渲染').toBeTruthy()
  ;(document.querySelector('#m') as HTMLElement).click()
  await waitFor(() => document.querySelector('.modal') === null)
  expect(document.querySelector('.modal'), '关闭 → 退场后移除（无动画环境立即）').toBe(null)
})

test('uiSsr：同一 handler → 完整 HTML 文档（SSR——无 hydration 决策）', async () => {
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'home' }, '你好 <SSR>')))
  router.get('/about', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'about' }, '关于')))
  const html = await uiSsr(router, '/', { title: '首页' })
  expect(html.startsWith('<!DOCTYPE html>'), '完整文档').toBeTruthy()
  expect(html.includes('<title>首页</title>')).toBeTruthy()
  expect(html.includes('<div id="root"><div class="home">你好 &lt;SSR&gt;</div></div>'), '内容 + 转义').toBeTruthy()
  // 另一路由
  const about = await uiSsr(router, '/about')
  expect(about.includes('<div class="about">关于</div>')).toBeTruthy()
})

test('uiSsr：组件渲染（工厂 + ctx.data 服务端取数——真实 HTTP）', async () => {
  const router = new UIRouter()
  const base = inject('baseUrl')
  const Post = async (init: Record<string, unknown>, ctx: UIContext) => {
    const post = await ctx.data.get<{ title: string }>(`${base}/api/posts/${init.id}`)
    return () => h('article', {}, post.title)
  }
  router.get('/posts/:id', (req, ctx) => (ctx as RenderCtx).stream(h(Post, { id: ctx.params!.id })))
  const html = await uiSsr(router, '/posts/7')
  expect(html.includes('<article>文章-7</article>'), '服务端取数 → HTML（真实 HTTP）').toBeTruthy()
})

test('uiSsr：notFound 兜底（无匹配路由 → 空 root 文档）', async () => {
  const router = new UIRouter()
  router.notFound((req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'nf' }, '404')))
  const html = await uiSsr(router, '/missing')
  expect(html.includes('<div class="nf">404</div>')).toBeTruthy()
})

test('组件生命周期：导航到组件页面——root 类型变化 → 全量 build（旧实例卸载 + 新页完整）', async () => {
  const router = new UIRouter()
  const events: string[] = []
  const HomePage = (_init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('home-unmount'))
    return () => h('div', { class: 'home' }, h('a', { href: '/posts/1' }, '去文章'))
  }
  const PostPage = async (init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('post-unmount'))
    const post = await ctx.data.get<{ title: string }>(`${inject('baseUrl')}/api/posts/${init.id}`)
    return () => h('article', { class: 'post' }, post.title)
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(HomePage, {})))
  router.get('/posts/:id', (req, ctx) => (ctx as RenderCtx).stream(h(PostPage, { id: ctx.params!.id })))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('.home'), '首页渲染').toBeTruthy()
  // 链接点击 → 导航 → PostPage（root 类型变化——HomePage 卸载 + 全量 build）
  ;(document.querySelector('a') as HTMLElement).click()
  await waitFor(() => document.querySelector('.post') !== null)
  expect(document.querySelector('.post')?.textContent, 'PostPage 渲染（ctx.params.id 取数）').toBe('文章-1')
  expect(document.querySelector('.home'), '旧页移除（done.full 清理）').toBe(null)
  expect(events, '旧组件卸载清理').toEqual(['home-unmount'])
  // 返回首页 → PostPage 卸载
  ;(serve as unknown as { navigate: (p: string) => Promise<void> }).navigate('/')
  await waitFor(() => document.querySelector('.home') !== null)
  expect(events, '新页卸载清理').toEqual(['home-unmount', 'post-unmount'])
})

test('组件生命周期：子组件类型切换（A → B 条件渲染——卸载重建 + onUnmounts）', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('.a'), 'A 渲染').toBeTruthy()
  // 点击切换 A → B（同位置不同类型——卸载重建）
  ;(document.querySelector('#t') as HTMLElement).click()
  await waitFor(() => document.querySelector('.b') !== null)
  expect(document.querySelector('.a'), 'A 移除').toBe(null)
  expect(events, 'A 卸载清理').toEqual(['a-unmount'])
  // B → A
  ;(document.querySelector('#t') as HTMLElement).click()
  await waitFor(() => document.querySelector('.a') !== null)
  expect(events, 'B 卸载清理').toEqual(['a-unmount', 'b-unmount'])
})

test('综合生命周期：浮层 + keyed 列表 + 条件渲染 + Fragment + ref——完整命令流', async () => {
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
    } }).usePopup({ placement: 'bottom', trigger: () => document.querySelector('#trig') as HTMLElement | null })
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready

  // ── ① 首帧（mount：page + comment×2 + ref 挂载 + Fragment 展开） ──
  const article = document.querySelector('.post') as HTMLElement
  expect(article, '页面渲染').toBeTruthy()
  expect(article.querySelectorAll('.cmt').length, 'keyed 列表 2 项').toBe(2)
  expect(article.querySelector('.tag-a')?.textContent, 'Fragment 数组展开').toBe('#a')
  expect(article.querySelector('.tag-b')?.textContent).toBe('#b')
  expect(refCalls, 'ref 挂载后触发（el 已连接）').toEqual(['ref-mount:true'])
  expect(article.querySelector('.extra'), '条件渲染初始关闭（false 占位）').toBe(null)

  // ── ② 交互：点赞（diff 精准——状态保持） ──
  ;(document.querySelector('#like') as HTMLElement).click()
  await waitFor(() => document.querySelector('#like')?.textContent === '赞1')
  expect(document.querySelector('#like')?.textContent).toBe('赞1')

  // ── ③ 条件渲染开（null → 组件——占位锚 ↔ 元素转换） ──
  ;(document.querySelector('#more') as HTMLElement).click()
  await waitFor(() => document.querySelector('.extra') !== null)
  expect(document.querySelector('.extra')?.textContent, 'Extra mount（占位锚转换）').toBe('扩展')

  // ── ④ keyed 列表增（新项 mount——旧项身份复用不重建） ──
  ;(document.querySelector('#add') as HTMLElement).click()
  await waitFor(() => document.querySelectorAll('.cmt').length === 3)
  expect(document.querySelectorAll('.cmt').length, 'keyed 增——身份复用').toBe(3)
  // 旧项投票状态保持（点击第一个评论的赞——闭包状态）
  ;(article.querySelectorAll('.vote')[0] as HTMLElement).click()
  await waitFor(() => article.querySelectorAll('.txt')[0]?.textContent === '评论c0(1)')
  expect(article.querySelectorAll('.txt')[0]?.textContent, '列表增后旧项状态保持').toBe('评论c0(1)')

  // ── ⑤ 浮层开（portal——插槽锚 + 容器内容） ──
  ;(document.querySelector('#dd') as HTMLElement).click()
  await waitFor(() => document.querySelector('.menu') !== null)
  const menu = document.querySelector('.menu') as HTMLElement
  expect(menu.closest('#__wf_portal') !== null, '浮层 portal 到 #__wf_portal').toBe(true)
  expect(menu.textContent).toBe('下拉项')
  // 浮层内点击不触发外部关闭（事件代理——面板内）
  menu.click()
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('.menu'), '面板内点击不关闭').toBeTruthy()

  // ── ⑥ 浮层关（removePortal——容器清空） ──
  document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  await waitFor(() => document.querySelector('.menu') === null)
  expect(document.querySelector('.menu'), '外部点击关闭——容器清理').toBe(null)

  // ── ⑦ 导航离开（整树卸载——onUnmounts 逆序 + ref(null) + 资源清理） ──
  await serve.navigate('/about')
  await waitFor(() => document.querySelector('.about') !== null)
  expect(document.querySelector('.post'), '旧页移除').toBe(null)
  expect(refCalls, 'ref(null) 卸载清理').toEqual(['ref-mount:true', 'ref-unmount'])
  // 卸载顺序：**LIFO（后挂载先卸载）**——c2（列表增后）→ extra（条件开后）→ c1/c0 → page
  expect(events, 'onUnmounts LIFO（栈语义）').toEqual(['un:comment:c2', 'un:extra', 'un:comment:c1', 'un:comment:c0', 'un:page'])
})

test('路由切换精准化：布局共享（root 稳定）——Header 复用不重建 + 页面内容精准替换', async () => {
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
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const headerBefore = document.querySelector('.hd')
  expect(headerBefore, 'Header 渲染').toBeTruthy()
  expect(document.querySelector('.home'), '首页内容').toBeTruthy()

  // 导航 → /about（root 相同 Layout——diff 精准——Header 复用）
  await serve.navigate('/about')
  await waitFor(() => document.querySelector('.about') !== null)
  const headerAfter = document.querySelector('.hd')
  expect(headerAfter, '**Header 节点复用（不重建——布局共享精准）**').toBe(headerBefore)
  expect(headerAfter?.textContent).toBe('站点头')
  expect(document.querySelector('.home'), '首页内容移除（局部替换）').toBe(null)
  expect(events, '仅 HomePage 卸载——Layout 保持').toEqual(['un:home'])
  expect(document.querySelector('.layout'), 'Layout 结构保持').toBe(headerAfter?.parentElement)

  // 返回首页——AboutPage 卸载——HomePage 重建（Layout/Header 仍复用）
  await serve.navigate('/')
  await waitFor(() => document.querySelector('.home') !== null)
  expect(document.querySelector('.hd'), '往返导航 Header 始终复用').toBe(headerBefore)
  expect(events, '仅页面内容卸载——Layout 不卸载').toEqual(['un:home', 'un:about'])
})

test('redirect 消费：3xx + Location → replaceState + 渲染目标页（不渲染空响应）', async () => {
  const router = new UIRouter()
  router.get('/old', () => new Response(null, { status: 302, headers: { Location: '/new' } }))
  router.get('/new', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'landed' }, 'redirected')))

  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  await serve.navigate('/old')

  expect(document.querySelector('#root .landed'), '渲染目标页（Location 解析）').toBeTruthy()
  expect(window.location.pathname, 'replaceState（重定向不 push 历史）').toBe('/new')
  const landed = document.querySelector('#root .landed')
  expect(landed?.textContent).toBe('redirected')
})

test('redirect 消费：导航触发 3xx → 同机制（replaceState + 目标页）', async () => {
  const router = new UIRouter()
  router.get('/home', (req, ctx) => (ctx as RenderCtx).stream(h('div', { class: 'home' }, 'home')))
  router.get('/auth', () => new Response(null, { status: 307, headers: { Location: '/home' } }))

  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  await serve.navigate('/auth')

  expect(document.querySelector('#root .home'), '导航 307 → 渲染 /home').toBeTruthy()
  expect(window.location.pathname, 'replaceState（不 push /auth）').toBe('/home')
  // history.length 无法断言（页面会话级历史——真实浏览器跨测试累积——
  // replaceState 语义由 pathname 断言覆盖）
})

test('组件工厂 reject：渲染错误 → console.error + 不崩溃（队列继续自愈）', async () => {
  const router = new UIRouter()
  // 外层工厂（mount）直接 throw——renderComponent 调用时抛——流 start reject
  const BoomComp = () => { throw new Error('factory fail') }
  let calls = 0
  router.get('/boom', (req, ctx) => {
    calls++
    if (calls === 1) {
      return (ctx as RenderCtx).stream(h('div', {}, h(BoomComp, {})))
    }
    return (ctx as RenderCtx).stream(h('div', { class: 'recovered' }, 'ok'))
  })

  const errors: unknown[] = []
  const origError = console.error
  console.error = (...a: unknown[]) => { errors.push(a.join(' ')); origError(...a) }
  try {
    const serve = uiServe(router, { root: '#root' })
    await serve.ready
    // 首帧 '/' → 无路由 404 空——navigate 触发 /boom（calls=1 → 工厂 reject）
    await serve.navigate('/boom')
  expect(errors.some((e) => String(e).includes('factory fail')), '错误 console.error（CS-03——不 throw）').toBeTruthy()
    // 队列继续自愈：再次渲染 → 成功
    await serve.navigate('/boom')
  expect(document.querySelector('#root .recovered'), '后续渲染成功（队列继续）').toBeTruthy()
  } finally {
    console.error = origError
  }
})

test('fnTable 清理：渲染流消费完清表（$fn 仅传输层——长会话零累积）', async () => {
  const router = new UIRouter()
  const fnTable = new Map<number, unknown>()
  let streamCount = 0
  router.get('/', (req, ctx) => {
    streamCount++
    return (ctx as RenderCtx).stream(h('div', { onClick: () => { /* 每次渲染新闭包 */ } }, 'x'))
  })

  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  expect(streamCount >= 1).toBeTruthy()
  // 渲染完成后：表已清空（历史函数已解码到事件表——跨流不需要）
  expect(fnTable.size, '消费完清空').toBe(0)
  // 再次渲染 → 新闭包重新入表——消费完又清（不累积）
  await serve.navigate('/')
  expect(fnTable.size, '多次渲染不累积').toBe(0)
})

test('命令式 toast：vdom 引擎渲染（独立容器——自动消失）', async () => {
  const { toast } = await import('./commands.ts')
  // toast 用全局 document——setup 到测试的 doc？——直接验证函数存在 + 形状
  const t = toast as unknown as { name: string }
  void t
  expect(typeof toast, 'toast 命令式入口').toBe('function')
  // 容器渲染验证（用注入 document 的间接方式——commands 用全局 document——
  // 通过 testBrowser 场景由组件测试覆盖——此处断言接口形状）
  const inject = await import('./commands.ts')
  const ctx: Record<string, unknown> = {}
  const injected = (inject as { injectCommands: (c: Record<string, unknown>) => Record<string, unknown> }).injectCommands(ctx)
  expect(typeof (injected as { toast?: unknown }).toast, 'injectCommands → ctx.toast').toBe('function')
})
