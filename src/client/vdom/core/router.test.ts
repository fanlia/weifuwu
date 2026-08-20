/**
 * vdom core — router 测试（UIRouter——Trie 匹配/params 注入 ctx）
 *
 * 契约：静态段优先 → :param → * 通配（shared Trie）；params 注入
 * ctx.params（对齐后端 Object.assign）；Request 零修改；notFound 兜底。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { UIRouter, frontRequest } from './router.ts'
import type { UIContext } from '../context/UIContext.ts'

function ctx(): UIContext {
  return { params: {} } as UIContext
}

test('匹配：静态段优先于 :param（shared Trie 语义）', async () => {
  const router = new UIRouter()
  router.get('/users/me', (req, c) => new Response('me'))
  router.get('/users/:id', (req, c) => new Response(`id:${c.params?.id}`))
  const r1 = await router.resolve(frontRequest('/users/me'), ctx())
  expect(await r1.text(), '静态优先').toBe('me')
  const r2 = await router.resolve(frontRequest('/users/42'), ctx())
  expect(await r2.text(), ':param 匹配').toBe('id:42')
})

test('params 注入 ctx（Request 零修改——对齐后端）', async () => {
  const router = new UIRouter()
  let seenReq: Request | null = null
  let seenParams: Record<string, string> | null = null
  router.get('/posts/:year/:slug', (req, c) => {
    seenReq = req
    seenParams = c.params ?? null
    return new Response('ok')
  })
  const c = ctx()
  await router.resolve(frontRequest('/posts/2026/hello-world'), c)
  expect(seenParams, 'params 在 ctx').toEqual({ year: '2026', slug: 'hello-world' })
  expect((seenReq as unknown as Record<string, unknown>).params, 'Request 零修改').toBe(undefined)
  expect(c.params?.year, '调用方 ctx 同步').toBe('2026')
})

test('通配 *：catch-all（params["*"] = 剩余段）', async () => {
  const router = new UIRouter()
  router.get('/static/*', (req, c) => new Response(`rest:${c.params?.['*'] ?? ''}`))
  const res = await router.resolve(frontRequest('/static/js/app.js'), ctx())
  expect(await res.text()).toBe('rest:js/app.js')
})

test('通配兜底：精确无匹配 → 通配（SPA catch-all）', async () => {
  const router = new UIRouter()
  router.get('/dashboard/overview', () => new Response('overview'))
  router.get('*', () => new Response('spa-shell'))
  const res = await router.resolve(frontRequest('/dashboard'), ctx())
  expect(await res.text(), '纯前缀节点回退通配').toBe('spa-shell')
})

test('notFound 兜底 + 未注册 404', async () => {
  const router = new UIRouter()
  router.get('/x', () => new Response('x'))
  router.notFound(() => new Response('not-found', { status: 404 }))
  const r1 = await router.resolve(frontRequest('/nope'), ctx())
  expect(r1.status).toBe(404)
  expect(await r1.text()).toBe('not-found')
  const r2 = new UIRouter()
  const res = await r2.resolve(frontRequest('/x'), ctx())
  expect(res.status, '无 notFound → 空 404').toBe(404)
})

test('params 每次渲染替换（不残留旧路由键）', async () => {
  const router = new UIRouter()
  router.get('/users/:id', () => new Response('u'))
  const c = ctx()
  await router.resolve(frontRequest('/users/1'), c)
  expect(c.params).toEqual({ id: '1' })
  // 无参路由——params 替换为空（不残留 id）
  router.get('/', () => new Response('home'))
  await router.resolve(frontRequest('/'), c)
  expect(c.params, '无参路由 params 清空（不残留）').toEqual({})
})

test('query 注入 ctx（对齐后端 Object.fromEntries(searchParams)）', async () => {
  const router = new UIRouter()
  let seen: Record<string, string> | null = null
  router.get('/search', (req, c) => {
    seen = c.query ?? null
    return new Response('ok')
  })
  const c = ctx()
  await router.resolve(frontRequest('/search?q=vdom&page=2'), c)
  expect(seen, 'query 解析到 ctx').toEqual({ q: 'vdom', page: '2' })
  expect(c.query?.q, '调用方 ctx 同步').toBe('vdom')
  // 无 query 路由——替换为空（不残留旧 query）
  await router.resolve(frontRequest('/search'), c)
  expect(c.query, '无 query 时清空（不残留）').toEqual({})
})
