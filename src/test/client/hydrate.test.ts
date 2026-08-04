/**
 * weifuwu/client hydration 测试 — 游标收养模式
 *
 * 用 ssrToString 生成服务端 HTML → jsdom 容器 → mount({ hydrate: true })
 * 验证：
 *   - DOM 收养（不重建）：hydrate 前后元素引用相同
 *   - 事件接线：服务端剥离的事件在 hydrate 后可用
 *   - async 工厂 hydration：__DATA__ 种子 → await 工厂 → 数据渲染 → 收养
 *   - 后续 dirty 正常：hydrate 后 $ 状态变化 → patch
 *   - 文本 mismatch 就地修正；收尾清理残留节点
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { h, asyncComponent } from '../../client/vnode.ts'
import { ssrToString } from '../../ui/ssr.ts'

before(setupJsdom)

const { createApp } = await import('../../client/app.ts')

/** 生成服务端 HTML（同步组件或 async 工厂） */
async function serverHtml(Comp: any, props: any = {}, serverCtx: any = {}) {
  const safe = await ssrToString(Comp, props, serverCtx)
  return safe.toString()
}

/** 构造容器 + 服务端 HTML → hydrate mount，返回容器与 app */
async function hydrateMount(Comp: any, props: any = {}, serverCtx: any = {}) {
  const html = await serverHtml(Comp, props, serverCtx)
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.innerHTML = html
  const app = createApp()
  await app.mount(el, Comp, { hydrate: true })
  return { el, app }
}

function flush(): Promise<void> {
  return new Promise(r => setTimeout(r, 0))
}

describe('hydration 游标收养', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    delete (globalThis as any).__DATA__
  })

  it('DOM 收养：hydrate 前后元素引用相同（不重建）', async () => {
    const Card = (_init: any) => () =>
      h('div', { class: 'card' }, h('h2', {}, 'Hello'))
    const html = await serverHtml(Card)
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.innerHTML = html
    const cardBefore = el.querySelector('.card') as HTMLElement
    const h2Before = el.querySelector('h2') as HTMLElement
    const textBefore = h2Before.firstChild

    const app = createApp()
    await app.mount(el, Card, { hydrate: true })

    assert.equal(el.querySelector('.card'), cardBefore, 'card 节点应被收养（同一引用）')
    assert.equal(el.querySelector('h2'), h2Before, 'h2 节点应被收养')
    assert.equal(h2Before.firstChild, textBefore, '文本节点应被收养')
    assert.equal(el.querySelector('h2')?.textContent, 'Hello')
    void app
  })

  it('事件接线：服务端剥离的 onClick 在 hydrate 后可用', async () => {
    let clicked = 0
    const Btn = (_init: any, ctx: any) => () =>
      h('button', { id: 'b', onClick: () => { clicked++ } }, 'go')
    const { el } = await hydrateMount(Btn)
    const btn = el.querySelector('#b') as HTMLButtonElement
    assert.ok(btn, '按钮存在')
    btn.click()
    assert.equal(clicked, 1, 'hydrate 后事件已接线')
  })

  it('属性接线：class/style/value 在 hydrate 后正确', async () => {
    const Form = (_init: any) => () =>
      h('div', {},
        h('input', { id: 'i', value: 'abc', class: { on: true, off: false } }),
        h('span', { style: { color: 'red' } }, 'x'),
      )
    const { el } = await hydrateMount(Form)
    const input = el.querySelector('#i') as HTMLInputElement
    assert.equal(input.value, 'abc', '受控 value 属性接线')
    assert.equal(input.className, 'on')
    const span = el.querySelector('span') as HTMLElement
    assert.equal(span.style.color, 'red')
  })

  it('async 工厂 hydration：__DATA__ 种子 → await 工厂 → 数据渲染收养', async () => {
    const Profile = asyncComponent(async (ctx: any) => {
      const user = await ctx.data.get('/api/profile', async () => ({ name: 'fetched' }))
      return (_init: any) => () => h('p', { id: 'p' }, `hi ${user.name}`)
    })
    // 服务端：ctx.data 预取 → HTML 含数据
    const data = new Map<string, unknown>()
    const html = await ssrToString(Profile, {}, {}, { data })
    // 客户端：__DATA__ 种子
    ;(globalThis as any).__DATA__ = Object.fromEntries(data)

    const el = document.createElement('div')
    document.body.appendChild(el)
    el.innerHTML = html.toString()
    const pBefore = el.querySelector('#p') as HTMLElement

    const app = createApp()
    await app.mount(el, Profile, { hydrate: true })
    await flush()

    assert.equal(el.querySelector('#p'), pBefore, 'async 工厂数据渲染后被收养（同一引用）')
    assert.equal(el.querySelector('#p')?.textContent, 'hi SSR-Name'.replace('SSR-Name', (data.get('/api/profile') as any).name))
  })

  it('hydration 后 dirty 正常：$ 状态变化 → patch 更新 DOM', async () => {
    const Counter = (_init: any, ctx: any) => {
      const $ = ctx.ui.$()
      $.n = 0
      return (props: any) =>
        h('div', {},
          h('button', { id: 'inc', onClick: () => { $.n++ } }, '+'),
          h('span', { id: 'val' }, `n=${$.n}`),
        )
    }
    const { el } = await hydrateMount(Counter)
    assert.equal(el.querySelector('#val')?.textContent, 'n=0')
    ;(el.querySelector('#inc') as HTMLButtonElement).click()
    await flush()
    assert.equal(el.querySelector('#val')?.textContent, 'n=1', 'hydrate 后 dirty patch 正常')
  })

  it('ref 接线：hydrate 时 ref(el) 立即调用', async () => {
    let refEl: HTMLElement | undefined
    const WithRef = (_init: any) => () =>
      h('input', { id: 'r', ref: (el: any) => { if (el) refEl = el } })
    const { el } = await hydrateMount(WithRef)
    assert.equal(refEl, el.querySelector('#r'), 'ref 收到被收养的 DOM')
  })

  it('文本 mismatch：就地修正不重建', async () => {
    const P = (_init: any) => () => h('p', {}, 'client text')
    const html = await serverHtml(P)
    const el = document.createElement('div')
    document.body.appendChild(el)
    // 篡改服务端 HTML（模拟数据漂移）
    el.innerHTML = html.replace('client text', 'server text')
    const pBefore = el.querySelector('p') as HTMLElement

    const app = createApp()
    await app.mount(el, P, { hydrate: true })
    assert.equal(el.querySelector('p'), pBefore, '元素收养，不重建')
    assert.equal(el.querySelector('p')?.textContent, 'client text', '文本就地修正')
    void app
  })

  it('收尾清理：服务端有、客户端没有的残留节点被删除', async () => {
    const P = (_init: any) => () => h('div', {}, h('span', {}, 'a'))
    const html = await serverHtml(P)
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.innerHTML = html + '<i>extra-server-only</i>'
    const app = createApp()
    await app.mount(el, P, { hydrate: true })
    assert.equal(el.querySelector('i'), null, '残留节点被清理')
    assert.equal(el.querySelector('span')?.textContent, 'a')
    void app
  })

  it('嵌套组件 + Fragment hydration', async () => {
    const Inner = (_init: any) => (props: any) => h('b', {}, props.label)
    const Outer = (_init: any) => () =>
      h('section', {},
        h('h1', {}, 'title'),
        h(Inner, { label: 'in' }),
        h('div', {}, ['x', 'y'].map(c => h('span', { key: c }, c))),
      )
    const { el } = await hydrateMount(Outer)
    assert.equal(el.querySelector('h1')?.textContent, 'title')
    assert.equal(el.querySelector('b')?.textContent, 'in')
    assert.equal(el.querySelectorAll('span').length, 2)
    assert.equal(el.textContent, 'titleinxy')
  })
})
