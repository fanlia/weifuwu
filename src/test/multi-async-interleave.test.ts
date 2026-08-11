import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'

before(setupJsdom)

afterEach(() => {
  createClientBrowser().clearBody()
  createClientBrowser().navigate('/')
})

function mount(id: string): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  b.bodyAppend(el)
  el.id = id
  return el
}

function flush() { return new Promise<void>((r) => setTimeout(r, 0)) }

// 场景：两个 async 组件 A/B 同屏，A 先 resolve（触发整树重渲染，diff 复制 B 的 Promise 引用），B 后 resolve
test('多 async 组件交错 resolve：A 先 → B 后，B 不得卡占位', async () => {
  const b = createClientBrowser()
  let resolveA!: () => void
  let resolveB!: () => void
  const pA = new Promise<void>((r) => { resolveA = r })
  const pB = new Promise<void>((r) => { resolveB = r })
  const CompA = async (_init: any) => { await pA; return () => h('div', { id: 'mA' }, 'A') }
  const CompB = async (_init: any) => { await pB; return () => h('div', { id: 'mB' }, 'B') }
  const router = new UIRouter()
  router.get('/', () => h('div', { id: 'wrap' }, h(CompA, {}), h(CompB, {})))
  b.navigate('/')
  const el = mount('multi-async')
  const handle = uiServe(router, { root: '#multi-async' })
  await flush()

  // 模式 A 主路径：buildVNode 兄弟并行 await 全部——resolveA 后整树仍未落地（B in-flight）
  resolveA()
  await flush()
  assert.equal(el.querySelector('#mA'), null, 'A resolve 但 B in-flight → 整树未落地（await 全部）')
  assert.equal(el.querySelector('#mB'), null, 'B 尚在等待')

  // B resolve → 兄弟并行全部完成 → 一起落地（无占位/无交错问题）
  resolveB()
  await flush()
  assert.equal(el.querySelector('#mA')?.textContent, 'A', 'A 落地')
  assert.equal(el.querySelector('#mB')?.textContent, 'B', 'B 落地（await 全部：无占位交错）')
  handle.close()
})
