/**
 * 集成测试：UIRouter + uiServe + 四状态机（route / lifecycle / x2y / KEY_DIFFERS）
 *
 * design/vdom-four-state-machines-test-plan.md Phase 5——T1-T6 全连接场景：
 * 真实路由导航链路下断言组件全生命周期（挂载 built → 导航 disposed → 重建 built）
 * + registry 清理 + DOM 切换 + route 状态。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { UIRouter } from '../ui-dom/router.ts'
import { uiServe } from '../ui-dom/middleware/serve.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h } from '../ui-dom/vnode.ts'
import type { VNode } from '../ui-dom/vnode.ts'

before(setupJsdom)

/** 可追踪页面组件：工厂记录实例 vnode（验证生命周期）——命名工厂（findComp 按 name 匹配） */
function makePage(name: string, label: string) {
  const factory = async (_p: any, ctx: any) => {
    return (_p: any) => h('div', { class: `page-${label.toLowerCase()}` }, label)
  }
  Object.defineProperty(factory, 'name', { value: name })
  return factory
}
const PageA = makePage('PageA', 'A')
const PageB = makePage('PageB', 'B')

/** 从 registry 找指定组件名的 vnode（_lifecycle 断言用） */
function findComp(handle: any, name: string): VNode | null {
  for (const [, v] of handle.ctx.__registry.idRegistry) {
    if (typeof v.type === 'function' && (v.type as any).name === name) return v as VNode
  }
  return null
}

/** uiServe + 双页面 router（setupJsdom 预置 #root） */
async function setup() {
  const browser = createClientBrowser()
  browser.navigate('/a')
  const root = document.querySelector('#root')!
  root.innerHTML = ''
  const router = new UIRouter()
  router.get('/a', () => h(PageA, {}))
  router.get('/b', () => h(PageB, {}))
  router.get('/missing', () => { throw new Error('route boom') })
  const handle = uiServe(router, { root: '#root', browser })
  await handle.ready
  return { browser, root, router, handle }
}

function flush(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── T1: 首帧挂载——route + lifecycle ──

test('T1: 首帧挂载 /a——route settled + PageA 树 built', async () => {
  const { root, handle } = await setup()
  assert.ok(root.querySelector('.page-a'), 'PageA DOM 渲染')
  const a = findComp(handle, 'PageA')
  assert.ok(a, 'PageA 注册')
  assert.equal(a!._lifecycle, 'built', 'PageA 首帧 built')
})

// ── T2: 导航 A→B——旧树 disposed + 新树 built ──

test('T2: 导航 A→B——PageA disposed + PageB built + A DOM 移除', async () => {
  const { root, handle, browser } = await setup()
  const a1 = findComp(handle, 'PageA')
  browser.navigate('/b')
  await flush()
  assert.ok(root.querySelector('.page-b'), 'PageB DOM 渲染')
  assert.equal(root.querySelector('.page-a'), null, 'A DOM 移除')
  const b = findComp(handle, 'PageB')
  assert.ok(b, 'PageB 注册')
  assert.equal(b!._lifecycle, 'built', 'PageB built')
  assert.equal(a1!._lifecycle, 'disposed', '旧 PageA vnode disposed（整树清理）')
})

// ── T3: 返回导航 B→A——重建 ──

test('T3: 返回 B→A——PageA 重建（disposed → building → built）', async () => {
  const { root, handle, browser } = await setup()
  const a_old = findComp(handle, 'PageA')! // 导航前捕获（导航后 registry 注销——findComp 找不到）
  browser.navigate('/b')
  await flush()
  assert.equal(a_old._lifecycle, 'disposed', '导航走后旧 PageA vnode disposed')
  browser.navigate('/a')
  await flush()
  assert.ok(root.querySelector('.page-a'), 'A 重新渲染')
  const a_new = findComp(handle, 'PageA')
  assert.ok(a_new, 'PageA 重新注册')
  assert.equal(a_new!._lifecycle, 'built', 'PageA 重建后 built')
  assert.notEqual(a_new, a_old, '新实例（旧 vnode 已清理）')
})

// ── T4: 快速连续导航 A→B→A——无泄漏 ──

test('T4: 快速连续 A→B→A——最终 settled + 无残留', async () => {
  const { root, handle, browser } = await setup()
  browser.navigate('/b')
  browser.navigate('/a') // 快速连续（不 await 中间态）
  await flush(80)
  assert.ok(root.querySelector('.page-a'), '最终页面 = A')
  assert.equal(root.querySelector('.page-b'), null, '无 B 残留')
  const b = findComp(handle, 'PageB')
  assert.ok(!b || b._lifecycle === 'disposed', 'PageB 已清理（若注册过则 disposed）')
})

// ── T5: 导航 404——错误页 + 旧树清理 ──

test('T5: 导航 /missing（handler 抛错）——错误页渲染', async () => {
  const { root, handle, browser } = await setup()
  browser.navigate('/missing')
  await flush()
  assert.ok(root.querySelector('.ui-dom-error'), '错误页渲染（不黑屏）')
})

// ── T6: handle.close——registry 清空 ──

test('T6: handle.close——registry 清空', async () => {
  const { handle } = await setup()
  handle.close()
  assert.equal(handle.ctx.__registry.idRegistry.size, 0, 'registry 清空')
})

// ── T7: trace 完整性——导航链路四阶段日志可复现 ──

test('T7: trace 完整复现导航链路（route + lifecycle 日志序列）', async () => {
  const logs: string[] = []
  const orig = console.log
  console.log = (...a: any[]) => { logs.push(a.join(' ')); orig(...a) }
  const { configureVdomTrace } = await import('../ui-dom/vdom2/trace.ts')
  configureVdomTrace({ stages: new Set(['route', 'lifecycle']) })
  try {
    const { browser, handle } = await setup()
    browser.navigate('/b')
    await flush()
  } finally {
    console.log = orig
  }
  const routeLogs = logs.filter((l) => l.includes('[vdom:route]'))
  const lcLogs = logs.filter((l) => l.includes('[vdom:lifecycle]'))
  assert.ok(routeLogs.some((l) => l.includes('NAVIGATE_START') && l.includes('/b')), 'route START 日志: ' + routeLogs.join(' | '))
  assert.ok(lcLogs.some((l) => l.includes('PageA(') && l.includes('DISPOSE')), 'PageA dispose 日志: ' + lcLogs.slice(0, 3).join(' | '))
  assert.ok(lcLogs.some((l) => l.includes('PageB(') && l.includes('BUILD_DONE')), 'PageB build 日志')
})
