/**
 * vdom v2 — uiSsrV2 验证（v1 uiSsr vs v2 uiSsrV2——HTML 完全相等）
 *
 * 缺口 1/3：SSR 完整——v2 引擎渲染 + 两遍/预取/__DATA__ 机制
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { UIRouter } from '../../client/vdom/core/router.ts'
import { uiSsr } from '../../client/vdom/core/ssr/index.ts'
import { uiSsrV2 } from '../../client/vdom/core/v2/ssr.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

test('SSR v2：简单页（router + 组件——HTML 相等）', async () => {
  const Comp: any = (_p: any, _c: any) => () => h('div', { class: 'c' }, [
    h('h1', {}, '标题'),
    h('p', {}, '内容'),
  ])
  const App: any = (_p: any, _c: any) => () => h('main', {}, [h(Comp, {}), h('footer', {}, '脚')])
  const router = new UIRouter()
  router.get('/', (_req: any, ctx: any) => ctx.stream(h(App, {})))
  const v1 = await uiSsr(router, '/', { title: 't1' })
  const v2 = await uiSsrV2(router, '/', { title: 't1' })
  assert.equal(v2, v1, 'v1/v2 SSR HTML 必须完全相等')
})

test('SSR v2：多态页（keyed/空洞/事件 props——HTML 相等）', async () => {
  const App: any = (_p: any, _c: any) => () => h('div', {}, [
    h('span', { key: 'a', 'data-k': '1' }, 'A'),
    null,
    h('button', { onClick: () => {} }, '点'),
    h('ul', {}, ['x', 'y'].map((s, i) => h('li', { key: i }, s))),
  ])
  const router = new UIRouter()
  router.get('/x', (_req: any, ctx: any) => ctx.stream(h(App, {})))
  const v1 = await uiSsr(router, '/x', { title: 't2' })
  const v2 = await uiSsrV2(router, '/x', { title: 't2' })
  assert.equal(v2, v1)
})
