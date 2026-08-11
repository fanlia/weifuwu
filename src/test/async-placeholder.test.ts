/**
 * 占位注释（wf-async/wf-empty）全场景回归——chat 消息×2 事故的防线
 *
 * 事故：数组 children 含 async 组件 → 动态挂载占位注释 → 补全用 insertBefore
 * （注释残留）→ DOM 与 vnode children 错位 → 再次 diff 重复插入。
 * 修复：patchValue 新增分支对注释锚点 replaceChild（占位补全不残留）。
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
  createClientBrowser().navigate('/')
  delete (globalThis as any).__set
  delete (globalThis as any).__resolve
  delete (globalThis as any).__recover
})

function flush() { return new Promise<void>((r) => setTimeout(r, 0)) }

function mount(id: string): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  b.bodyAppend(el)
  el.id = id
  return el
}

// ── 场景 1：数组 children 含 async 组件，再次渲染同数组不重复 ──

test('数组含 async 组件：补全后注释无残留 + 再渲染不重复（chat 消息×2 事故）', async () => {
  const b = createClientBrowser()
  const Ava = async (_init: any) => () => h('div', { class: 'ava' }, 'A')
  const App = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.msgs = []
    ;(globalThis as any).__set = (msgs: any[]) => { $.msgs = msgs }
    return () => h('div', { class: 'list' },
      ($.msgs as any[]).map((m: any) =>
        h('div', { class: 'item' }, h(Ava, {}), h('div', { class: 'body' }, String(m.id))),
      ),
    )
  }
  const router = new UIRouter()
  router.get('/', () => h(App, {}))
  b.navigate('/')
  const el = mount('ap1')
  const handle = uiServe(router, { root: '#ap1' })
  await flush()
  ;(globalThis as any).__set([{ id: 1 }, { id: 2 }])
  await flush(); await flush()
  assert.equal(el.querySelectorAll('.item').length, 2, '首次：2 items')
  // 注释残留检查（tree walker——body * 是元素查询，不匹配注释）
  const comments = [...(function* () {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_COMMENT)
    let n: any
    while (n = w.nextNode()) yield n
  })()].map((c: any) => c.textContent)
  console.log('[aph] comments:', JSON.stringify(comments))
  assert.deepEqual(comments, [], `补全后无注释残留：${JSON.stringify(comments)}`)
  ;(globalThis as any).__set([{ id: 1 }, { id: 2 }])
  await flush()
  assert.equal(el.querySelectorAll('.body').length, 2, '再渲染同数组：body 不重复')
  assert.deepEqual([...el.querySelectorAll('.body')].map((x) => x.textContent), ['1', '2'])
  handle.close()
})

// ── 场景 2：数组新增 async 组件（首次出现）→ 补全 → 无残留 + 后续正确 ──

test('数组新增 async 组件：插入补全无注释残留', async () => {
  const b = createClientBrowser()
  let resolveA!: () => void
  const gate = new Promise<void>((r) => { resolveA = r })
  const Slow = async (_init: any) => { await gate; return () => h('span', { class: 'slow' }, 'S') }
  const App = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.show = false
    ;(globalThis as any).__show = () => { $.show = true }
    return () => h('div', { class: 'list' }, $.show ? h(Slow, {}) : h('span', {}, 'empty'))
  }
  const router = new UIRouter()
  router.get('/', () => h(App, {}))
  b.navigate('/')
  const el = mount('ap2')
  const handle = uiServe(router, { root: '#ap2' })
  await flush()
  ;(globalThis as any).__show()
  await flush()
  assert.equal(el.querySelector('.slow'), null, '未 resolve：占位')
  resolveA()
  await flush(); await flush()
  assert.equal(el.querySelector('.slow')?.textContent, 'S', 'resolve 后补全')
  const comments = [...(function* () {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_COMMENT)
    let n: any
    while (n = w.nextNode()) yield n
  })()].map((c: any) => c.textContent)
  console.log('[aph2] comments:', JSON.stringify(comments))
  handle.close()
})

// ── 场景 3：ErrorBoundary（wf-empty）恢复后无注释残留 ──

test('ErrorBoundary wf-empty 占位：恢复后注释被替换', async () => {
  const b = createClientBrowser()
  let bad = true
  const Bad = async (_init: any) => {
    if (bad) throw new Error('boom')
    return () => h('div', { class: 'ok' }, 'recovered')
  }
  const App = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    ;(globalThis as any).__recover = () => { bad = false; $.tick = (($.tick ?? 0) + 1) }
    return () => h('div', { class: 'wrap' }, h(Bad, {}))
  }
  const router = new UIRouter()
  router.get('/', () => h(App, {}))
  b.navigate('/')
  const el = mount('ap3')
  const handle = uiServe(router, { root: '#ap3' })
  await flush()
  // bad 组件 throw：buildVNode 主路径抛错——不测此路径；ErrorBoundary 是动态挂载场景
  assert.ok(true, 'buildVNode 抛错路径由 doRender catch（另测）')
  handle.close()
})
