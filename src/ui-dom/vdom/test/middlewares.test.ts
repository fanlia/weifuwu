/**
 * vdom 命令式中间件测试——toast / confirm（vdom 引擎驱动）
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../test/client/setup.ts'
import { createClientBrowser } from '../../browser.ts'
import { UIRouter, h } from '../../index.ts'
import { uiServe } from '../serve.ts'
import { toast } from '../middlewares/toast.ts'
import { confirm } from '../middlewares/confirm.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
})

function mount(id: string): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = id
  return el
}

const tick = () => new Promise<void>((r) => setTimeout(r, 10))

// ── 1. toast：命令式显示 + 自动消失 ──

test('vdom toast: 命令式显示 + $ 驱动渲染', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('ct1')
  const App = async (_init: any, ctx: any) => {
    ;(globalThis as any).__showToast = () => ctx.toast('Hello Toast', 'success')
    return () => h('div', {}, 'app')
  }
  const router = new UIRouter()
  router.use(toast())
  router.get('/', () => h(App, {}))
  const handle = uiServe(router, { root: '#ct1' })
  await handle.ready
  await tick()
  ;(globalThis as any).__showToast()
  await tick(); await tick()
  const toastEl = document.querySelector('.wf-toast')
  assert.ok(toastEl, 'toast 出现')
  assert.ok(toastEl?.textContent?.includes('Hello Toast'))
  // 自动消失（duration 默认 3000——测试设短一点）
  handle.close()
})

// ── 2. toast 自定义 duration 自动消失 ──

test('vdom toast: 自动消失', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('ct2')
  const App = async (_init: any, ctx: any) => {
    ;(globalThis as any).__show = () => ctx.toast('bye', 'info', 50)
    return () => h('div', {}, 'app')
  }
  const router = new UIRouter()
  router.use(toast())
  router.get('/', () => h(App, {}))
  const handle = uiServe(router, { root: '#ct2' })
  await handle.ready
  await tick()
  ;(globalThis as any).__show()
  await tick()
  assert.ok(document.querySelector('.wf-toast'), '出现')
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(document.querySelector('.wf-toast'), null, '自动消失')
  handle.close()
})

// ── 3. confirm：resolve(true/false) ──

test('vdom confirm: 确认 → resolve(true)，取消 → resolve(false)', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('ct3')
  let result: boolean | undefined
  const App = async (_init: any, ctx: any) => {
    ;(globalThis as any).__ask = async () => { result = await ctx.confirm('确定删除？') }
    return () => h('div', {}, 'app')
  }
  const router = new UIRouter()
  router.use(confirm())
  router.get('/', () => h(App, {}))
  const handle = uiServe(router, { root: '#ct3' })
  await handle.ready
  await tick()
  ;(globalThis as any).__ask()
  await tick(); await tick()
  // Modal 出现在 portal
  const modal = document.querySelector('#__wf_portal .wf-modal')
  assert.ok(modal, 'modal 出现')
  assert.ok(modal?.textContent?.includes('确定删除？'))
  // 点确定
  const confirmBtn = [...modal!.querySelectorAll('button')].find((btn) => btn.textContent?.includes('确定'))
  confirmBtn?.click()
  await tick(); await tick()
  assert.equal(result, true, 'resolve(true)')
  // 容器已清理
  await new Promise((r) => setTimeout(r, 650))
  assert.equal(document.querySelector('.wf-confirm-host'), null, '容器清理')
  handle.close()
})

test('vdom confirm: 取消 → resolve(false)', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('ct4')
  let result: boolean | undefined
  const App = async (_init: any, ctx: any) => {
    ;(globalThis as any).__ask = async () => { result = await ctx.confirm('确认？') }
    return () => h('div', {}, 'app')
  }
  const router = new UIRouter()
  router.use(confirm())
  router.get('/', () => h(App, {}))
  const handle = uiServe(router, { root: '#ct4' })
  await handle.ready
  await tick()
  ;(globalThis as any).__ask()
  await tick(); await tick()
  const modal = document.querySelector('#__wf_portal .wf-modal')
  assert.ok(modal)
  const cancelBtn = [...modal!.querySelectorAll('button')].find((btn) => btn.textContent?.includes('取消'))
  cancelBtn?.click()
  await tick(); await tick()
  assert.equal(result, false, 'resolve(false)')
  handle.close()
})
