/**
 * uiServe 级集成测试——完整应用链路（router + 中间件 + 组件 + renderPath + renderer）
 *
 * 与引擎级测试的差异：真实 uiServe（不 mock renderer/ctx.ui）——首帧 → 组件事件 →
 * SPA 导航全流程在 jsdom 跑通，观测事件流（RENDER_REQUEST/lifecycle/dom）。
 *
 * 场景：
 * 1. 首帧渲染 + 组件 fetch 回调 rerender（消息加载）
 * 2. SPA 导航（popstate）→ 旧树 dispose + 新页渲染
 * 3. 导航期间构建期渲染请求（pending 补跑——Bug #3 的 uiServe 级复现）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'
import { __resetVdomEvents, __vdom_events } from '../ui-dom/vdom2/events.ts'

before(setupJsdom)
const browser = createClientBrowser()

function flush(ms = 60): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 页面组件（模拟 Chat）：工厂发起"fetch"（setTimeout 模拟）→ 完成后 rerender 加载消息 */
function ChatPage(_init: any, ctx: any) {
  const $: any = { msgs: [] as string[], loaded: false }
  setTimeout(() => {
    $.msgs = ['m1', 'm2']
    $.loaded = true
    void ctx.ui.render()
  }, 0)
  return async () => h('div', { class: 'chat-page' }, [
    h('div', { class: 'msgs' }, $.msgs.map((m: string) => h('div', { key: m, class: 'msg-item' }, m))),
    h('div', { class: 'loaded' }, $.loaded ? 'LOADED' : '...'),
  ])
}

function OtherPage(_init: any, _ctx: any) {
  return async () => h('div', { class: 'other-page' }, 'OTHER')
}

function setupApp(initialPath: string) {
  // setupJsdom 的 HTML 已含 #root——直接用（重复创建会命中 querySelector 第一个）
  const root = document.getElementById('root')!
  root.innerHTML = ''
  // jsdom location 设置（uiServe 读 browser.pathname()）
  window.history.pushState(null, '', initialPath)
  const router = new UIRouter()
  router.get('/chat', () => h(ChatPage, {}), { title: 'chat' })
  router.get('/other', () => h(OtherPage, {}), { title: 'other' })
  const handle = uiServe(router, { root: '#root' })
  return { root, router, handle }
}

test('uiServe 首帧 + fetch 回调：消息加载 + 事件流完整（RENDER_REQUEST→MOUNTED→dom/WRITE）', async () => {
  __resetVdomEvents()
  const { root, handle } = setupApp('/chat')
  await handle.ready
  await flush(40)

  // DOM：消息加载（fetch 回调 rerender 生效）
  assert.equal(root.querySelectorAll('.msg-item').length, 2, '消息加载（2 条）')
  assert.ok(root.querySelector('.loaded')?.textContent === 'LOADED', 'fetch 后状态落地')
  // 事件流：uiServe 首帧 + 组件 rerender 可追溯
  const reqs = __vdom_events(500, { event: 'RENDER_REQUEST' } as any)
  const uiServeReqs = reqs.filter((e) => e.from === 'uiServe')
  const compReqs = reqs.filter((e) => e.from === 'component' && e.component === 'ChatPage')
  assert.equal(uiServeReqs.length, 1, 'uiServe 首帧渲染请求可追溯')
  assert.ok(compReqs.length >= 1, '组件 fetch 回调 rerender 可追溯（component 来源）')
  // 生命周期：ChatPage built → 无违规
  const violations = __vdom_events(500).filter((e) => ['SKIP_ORPHAN', 'SKIP_DETACHED', 'CONTRACT_VIOLATION'].includes(e.event))
  assert.deepEqual(violations, [], '无渲染违规')
  handle.close()
  root.innerHTML = ''
})

test('uiServe SPA 导航：popstate → 旧树 dispose + 新页渲染', async () => {
  __resetVdomEvents()
  const { root, handle } = setupApp('/chat')
  await handle.ready
  await flush(40)
  assert.ok(root.querySelector('.chat-page'), 'Chat 页渲染')

  // SPA 导航（browser.navigate → pushState + popstate）
  await browser.navigate('/other')
  await flush(60)

  assert.ok(root.querySelector('.other-page'), 'Other 页渲染')
  assert.ok(!root.querySelector('.chat-page'), 'Chat 页移除')
  // 旧树 dispose 可追溯
  const disposes = __vdom_events(500, { machine: 'lifecycle' } as any).filter((e) => e.component === 'ChatPage' && e.event === 'DISPOSE')
  assert.equal(disposes.length, 1, 'ChatPage dispose（导航清理）')
  handle.close()
  root.innerHTML = ''
})

test('uiServe 导航期间构建期渲染请求：pending 补跑（Bug #3 复现——消息不丢失）', async () => {
  __resetVdomEvents()
  const { root, handle } = setupApp('/other')
  await handle.ready
  await flush(30)
  assert.ok(root.querySelector('.other-page'), '初始 Other 页')

  // 导航到 /chat——ChatPage 构建期 setTimeout rerender（fetch 完成回调）
  await browser.navigate('/chat')
  await flush(80) // renderPath 完成 + flushPending 补跑

  assert.equal(root.querySelectorAll('.msg-item').length, 2, '导航后消息加载（构建期渲染请求不丢失——pending 补跑）')
  assert.ok(root.querySelector('.loaded')?.textContent === 'LOADED', 'fetch 状态落地')
  // 无孤儿（构建期请求被 pending 吸收而非 SKIP_ORPHAN 丢弃）
  const orphans = __vdom_events(500).filter((e) => e.event === 'SKIP_ORPHAN')
  assert.deepEqual(orphans, [], '无孤儿误判')
  handle.close()
  root.innerHTML = ''
})
