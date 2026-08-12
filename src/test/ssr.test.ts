/**
 * 服务端 SSR 字符串遍历器测试 — ctx.ui.ssr / ssrToString
 *
 * 覆盖：
 *   - 同步组件 / async 工厂组件 → HTML
 *   - async 工厂数据进 HTML（服务端 await）
 *   - 事件/ref 剥离、文本转义、class/style 序列化
 *   - Fragment / Portal 内联、innerHTML、void 标签
 *   - ctx.data 预取 → dataStore 收集 → serializeData(__DATA__)
 *   - 嵌套组件、多 async 组件
 */

import { describe, it } from 'node:test'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, Fragment, createPortal } from '../ui-dom/vnode.ts'
import { ssrToString, serializeData, renderSsr } from '../ui-dom/vdom/ssr.ts'

function ssr(Comp: any, props: any = {}, ctx: any = {}, opts: any = {}): Promise<string> {
  return ssrToString(Comp, props, ctx, opts).then(s => s.toString())
}

describe('SSR 字符串遍历器', () => {
  it('同步组件 → HTML', async () => {
    const Cmp = async (_init: any) => (props: any) => h('p', { class: 'greet' }, `hi ${props.name}`)
    const html = await ssr(Cmp, { name: 'Alice' })
    assert.equal(html, '<p class="greet">hi Alice</p>')
  })

  it('async 组件 → await 工厂 → 数据进 HTML', async () => {
    const Profile = async (_init: any, ctx: any) => {
      const user = await Promise.resolve({ name: 'Bob' })
      return (props: any) => h('div', {}, `user:${user.name}`)
    }
    const html = await ssr(Profile)
    assert.equal(html, '<div>user:Bob</div>')
  })

  it('async 组件内 ctx.data.get → 预取并进 HTML', async () => {
    const data = new Map<string, unknown>()
    const Page = async (_init: any, ctx: any) => {
      const post = await ctx.data.get('/api/posts/1', async () => ({ title: 'SSR 标题' }))
      return () => h('article', {}, h('h1', {}, post.title))
    }
    const html = await ssr(Page, {}, {}, { data })
    assert.equal(html, '<article><h1>SSR 标题</h1></article>')
    assert.deepEqual(data.get('/api/posts/1'), { title: 'SSR 标题' })
  })

  it('serializeData → __DATA__ 脚本（转义 <）', () => {
    const data = new Map([['/api/a', { x: '<script>' }]])
    const script = serializeData(data)
    // JSON.stringify 原样保留 / 与 >；< 被替换为 \u003c 防 XSS
    assert.equal(script, '<script>window.__DATA__={"/api/a":{"x":"\\u003cscript>"}};</script>')
  })

  it('事件/ref 剥离', async () => {
    const Cmp = async (_init: any) => () =>
      h('button', { onClick: () => {}, onInput: () => {}, ref: (el: any) => {} }, '点我')
    const html = await ssr(Cmp)
    assert.equal(html, '<button>点我</button>')
  })

  it('文本转义（XSS）', async () => {
    const Cmp = async (_init: any) => () => h('div', {}, '<script>alert(1)</script> & "quoted"')
    const html = await ssr(Cmp)
    assert.equal(html, '<div>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;</div>')
  })

  it('class 对象 / style 对象序列化', async () => {
    const Cmp = async (_init: any) => () =>
      h('div', { class: { active: true, hidden: false }, style: { color: 'red', padding: 4 } }, 'x')
    const html = await ssr(Cmp)
    assert.equal(html, '<div class="active" style="color:red;padding:4px">x</div>')
  })

  it('Fragment / Portal 内联', async () => {
    const Cmp = async (_init: any) => () =>
      h('div', {},
        h(Fragment, {}, h('span', {}, 'a'), h('span', {}, 'b')),
        createPortal(h('aside', {}, 'portal-content')),
      )
    const html = await ssr(Cmp)
    // 数组项默认 key 全显（规则表 §3——Fragment 内部 span 是 Fragment 的数组项）
    assert.equal(html, '<div><span data-wf-key="0">a</span><span data-wf-key="1">b</span><aside>portal-content</aside></div>')
  })

  it('innerHTML 原样输出（跳过 children）', async () => {
    const Cmp = async (_init: any) => () =>
      h('div', { innerHTML: '<b>rich</b>', children: h('i', {}, 'ignored') })
    const html = await ssr(Cmp)
    assert.equal(html, '<div><b>rich</b></div>')
  })

  it('void 标签自闭合', async () => {
    const Cmp = async (_init: any) => () =>
      h('div', {}, h('br', {}), h('img', { src: '/a.png', alt: 'x' }))
    const html = await ssr(Cmp)
    assert.equal(html, '<div><br data-wf-key="0"><img data-wf-key="1" src="/a.png" alt="x"></div>')
  })

  it('布尔/空值属性', async () => {
    const Cmp = async (_init: any) => () =>
      h('input', { disabled: true, required: false, placeholder: null })
    const html = await ssr(Cmp)
    assert.equal(html, '<input disabled>')
  })

  it('嵌套：async 工厂包含同步子组件 + 多 async 组件', async () => {
    const Inner = async (_init: any) => (props: any) => h('b', {}, props.label)
    const A = async () => {
      const a = await Promise.resolve('AAA')
      return () => h('span', {}, a)
    }
    const B = async () => {
      const b = await Promise.resolve('BBB')
      return () => h('span', {}, b)
    }
    const Root = async (_init: any, ctx: any) => {
      const title = await Promise.resolve('T')
      return () =>
        h('section', {}, h('h1', {}, title), h(A, {}), h(Inner, { label: 'in' }), h(B, {}))
    }
    const html = await ssr(Root)
    // 数组项 key 全落 DOM：元素项（h1 data-wf-key） + 组件项穿透到输出（A/Inner/B 的输出节点）
    assert.equal(html, '<section><h1 data-wf-key="0">T</h1><span data-wf-key="1">AAA</span><b data-wf-key="2">in</b><span data-wf-key="3">BBB</span></section>')
  })

  it('服务端 ctx shim：selfId 请求级隔离 + 组件可渲染', async () => {
    const Cmp = async (_init: any, ctx: any) => {
      const count = 1
      ctx.ui.selfId('stats')
      return () => h('div', {}, `count=${count}`)
    }
    const html = await ssr(Cmp)
    assert.equal(html, '<div>count=1</div>')
  })

  it('数组子节点', async () => {
    const Cmp = async (_init: any) => () =>
      h('ul', {}, [h('li', {}, '1'), h('li', {}, '2')])
    const html = await ssr(Cmp)
    assert.equal(html, '<ul><li data-wf-key="0">1</li><li data-wf-key="1">2</li></ul>')
  })

  it('组件返回 null / 条件渲染', async () => {
    const Maybe = async (_init: any) => (props: any) => (props.show ? h('p', {}, 'yes') : null)
    const html = await ssr(Maybe, { show: false })
    assert.equal(html, '')
    const html2 = await ssr(Maybe, { show: true })
    assert.equal(html2, '<p>yes</p>')
  })

  it('async 工厂抛错 → 错误传播（调用方可捕获）', async () => {
    const Bad = async () => {
      throw new Error('factory boom')
    }
    await assert.rejects(() => ssr(Bad), /factory boom/)
  })
})

// ── P-6：SSR 数据驱动并行取数（renderFn await 数据——Promise.all 并行） ──
test('SSR: 数据驱动组件数组并行取数（最慢组件延迟而非总和）', async () => {
  const active = { count: 0, max: 0 }
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
  const dataCard = (label: string, ms: number) => async (_init: any, ctx: any) =>
    async () => {
      active.count++
      active.max = Math.max(active.max, active.count)
      await delay(ms)
      active.count--
      return h('div', { class: 'card' }, label)
    }
  const Page = async (_init: any, ctx: any) =>
    async () => h('div', {}, [
      h(await dataCard('A', 30), {}),
      h(await dataCard('B', 30), {}),
      h(await dataCard('C', 30), {}),
    ])
  const t0 = Date.now()
  const html = await renderSsr(h(Page, {}), {} as any)
  const dt = Date.now() - t0
  assert.equal(html.includes('A') && html.includes('B') && html.includes('C'), true, '三个卡片都渲染')
  assert.ok(active.max >= 3, `并发峰值 ≥3（并行取数；实际 ${active.max}）`)
  assert.ok(dt < 80, `耗时 < 80ms（串行 90ms——实际 ${dt}ms）`)
})
