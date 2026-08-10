/**
 * uiSsr 路由级 SSR 中间件测试
 *
 * 覆盖：
 *   - GET 匹配路由 → 自动 SSR 页面（组件渲染 + __DATA__ + bundle script + 模板）
 *   - 未匹配 → next() 交还
 *   - params 注入（组件工厂 ctx.params.slug 可用）
 *   - 非 GET → next()
 *   - title（默认 / 自定义）
 *   - async 工厂组件自动渲染
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { uiSsr } from '../ui/ssr-page.ts'
import { h, asyncComponent } from '../ui-dom/vnode.ts'

const NEXT = () => new Response('NEXT-CALLED', { status: 404 })

function call(mw: ReturnType<typeof uiSsr>, path: string, method = 'GET', ctx: any = {}) {
  return mw(new Request(`http://localhost${path}`, { method }), ctx, NEXT)
}

describe('uiSsr 路由级 SSR', () => {
  it('GET 匹配路由 → 自动 SSR 页面（组件 + __DATA__ + bundle + 模板）', async () => {
    const Page = (_init: any) => () => h('div', { id: 'page' }, 'hello page')
    const mw = uiSsr({
      routes: [{ path: '/about', component: Page, title: '关于' }],
      bundle: '/static/app.js',
      styles: ['/static/style.css'],
    })
    const res = await call(mw, '/about')
    const html = await res.text()
    assert.equal(res.headers.get('Content-Type'), 'text/html; charset=utf-8')
    assert.ok(html.includes('<div id="root"><div id="page">hello page</div></div>'), '组件 SSR 进模板')
    assert.ok(html.includes('<title>关于</title>'), '路由 title 进模板')
    assert.ok(html.includes('window.__DATA__={}'), '__DATA__ 序列化')
    assert.ok(html.includes('<script src="/static/app.js"></script>'), 'bundle 注入')
    assert.ok(html.includes('<link rel="stylesheet" href="/static/style.css">'), 'styles 注入')
  })

  it('未匹配 → next() 交还后续', async () => {
    const mw = uiSsr({ routes: [{ path: '/about', component: () => () => null }] })
    const res = await call(mw, '/api/users')
    assert.equal(res.status, 404)
    assert.equal(await res.text(), 'NEXT-CALLED')
  })

  it('非 GET → next()', async () => {
    const mw = uiSsr({ routes: [{ path: '/about', component: () => () => null }] })
    const res = await call(mw, '/about', 'POST')
    assert.equal(await res.text(), 'NEXT-CALLED')
  })

  it('params 注入：组件工厂 ctx.params.slug 可用', async () => {
    const Page = asyncComponent(async (ctx: any) => {
      const slug = ctx.params.slug
      return (_init: any) => () => h('h1', {}, `post:${slug}`)
    })
    const mw = uiSsr({ routes: [{ path: '/blog/:slug', component: Page }] })
    const res = await call(mw, '/blog/hello-world')
    const html = await res.text()
    assert.ok(html.includes('post:hello-world'), 'params 注入到工厂 ctx')
  })

  it('async 工厂 + ctx.data 预取 → 数据进 HTML + __DATA__', async () => {
    const Page = asyncComponent(async (ctx: any) => {
      const post = await ctx.data.get('/api/post', async () => ({ title: 'T' }))
      return (_init: any) => () => h('article', {}, h('h2', {}, post.title))
    })
    const mw = uiSsr({ routes: [{ path: '/post', component: Page }] })
    const res = await call(mw, '/post')
    const html = await res.text()
    assert.ok(html.includes('<h2>T</h2>'), '预取数据渲染进 HTML')
    assert.ok(html.includes('window.__DATA__={"/api/post":'), '__DATA__ 含预取数据')
  })

  it('自定义 title 函数', async () => {
    const Page = (_init: any) => () => null
    const mw = uiSsr({
      routes: [{ path: '/post/:slug', component: Page }],
      title: ({ params }) => `Post: ${params.slug}`,
    })
    const res = await call(mw, '/post/abc')
    const html = await res.text()
    assert.ok(html.includes('<title>Post: abc</title>'))
  })

  it('自定义模板', async () => {
    const Page = (_init: any) => () => h('p', {}, 'x')
    const mw = uiSsr({
      routes: [{ path: '/x', component: Page }],
      template: (p) => `<custom>${p.html}|${p.title}|${p.bundle}</custom>`,
    })
    const res = await call(mw, '/x')
    const html = await res.text()
    assert.ok(html.startsWith('<custom>'))
    assert.ok(html.includes('<p>x</p>'))
  })

  it('查询参数注入 ctx.route.query', async () => {
    const Page = asyncComponent(async (ctx: any) => {
      const q = ctx.route.query.q
      return (_init: any) => () => h('span', {}, `q=${q}`)
    })
    const mw = uiSsr({ routes: [{ path: '/search', component: Page }] })
    const res = await call(mw, '/search?q=weifuwu')
    const html = await res.text()
    assert.ok(html.includes('q=weifuwu'))
  })

  it('路由组件未声明 → next()', async () => {
    const mw = uiSsr({ routes: [{ path: '/layout-only', layout: () => () => null }] })
    const res = await call(mw, '/layout-only')
    assert.equal(await res.text(), 'NEXT-CALLED')
  })
})
