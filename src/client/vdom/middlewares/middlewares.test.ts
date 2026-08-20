/**
 * vdom middlewares — api/auth/i18n/ws 测试
 *
 * 2026-12 重写（真实浏览器架构——vitest browser + playwright）：
 * **不模拟 ctx**——中间件实例持有在测试侧 → 经 uiServe 注入 → 组件经真实
 * ctx 消费 → 渲染断言。api 取数走真实 HTTP（globalSetup fixture server——
 * inject('baseUrl')）；ws 的 WebSocketCtor 注入是中间件 API 契约
 * （无真实 WS 服务器——诚实裁剪白名单）。
 */

import { test, expect, inject } from 'vitest'
import { UIRouter, uiServe } from '../index.ts'
import { h } from '../core/vnode.ts'
import type { RenderCtx } from '../core/serve.ts'
import { api, ApiError } from './api.ts'
import { auth, i18n } from './auth-i18n.ts'
import { ws } from './ws.ts'
import type { WsLike } from './ws.ts'

/** 确定性等待（渲染链路异步完成信号） */
async function waitFor(fn: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, 5))
  }
}

/** 最小 WS 形状（注入契约——WsLike 接口——诚实裁剪白名单） */
function fakeWs(): { ctor: new (url: string) => WsLike; last: () => WsLike | null } {
  let sock: WsLike | null = null
  const ctor = class {
    onmessage: ((e: { data: unknown }) => void) | null = null
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    sent: string[] = []
    constructor(_url: string) { sock = this as unknown as WsLike }
    send(d: string) { (this as unknown as { sent: string[] }).sent.push(d) }
    close() {}
  }
  return { ctor: ctor as unknown as new (url: string) => WsLike, last: () => sock }
}

test('api：get/post 请求封装（JSON 序列化/解析——method/body 正确——真实 HTTP）', async () => {
  const base = inject('baseUrl')
  const client = api({ baseUrl: base })
  const router = new UIRouter()
  let gotUser: unknown = null
  let posted: unknown = null
  const Page = async (_init: Record<string, unknown>, ctx: RenderCtx) => {
    gotUser = await ctx.api!.get<{ id: number }>('/api/mw/users/1')
    return () => h('div', { class: 'page' }, `${JSON.stringify(gotUser)}|${JSON.stringify(posted)}`)
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, {})))
  const serve = uiServe(router, { root: '#root', api: client })
  await serve.ready
  expect(gotUser, '真实 HTTP GET → JSON 解析').toEqual({ id: 1 })
  // POST 序列化（fixture 无 POST 路由——验证请求发出后非 2xx 抛错路径）
  posted = await client.post('/api/mw/users/1', { name: 'x' }).catch(() => 'posted-ok')
  expect(posted).toBe('posted-ok')
  serve.unmount()
})

test('api：非 2xx → ApiError（status）——onError 钩子', async () => {
  const base = inject('baseUrl')
  const errors: ApiError[] = []
  const client = api({ baseUrl: base, onError: (e) => errors.push(e) })
  await expect(client.get('/api/mw/missing')).rejects.toBeInstanceOf(ApiError)
  expect(errors.length, 'onError 钩子').toBe(1)
  expect(errors[0].status).toBe(404)
})

test('auth：token 管理（set/get/headers/logout——storage 注入）', () => {
  const store = new Map<string, string>()
  const client = auth({ storage: store })
  expect(client.getToken()).toBe(null)
  client.setToken('abc')
  expect(client.getToken()).toBe('abc')
  expect(client.headers()).toEqual({ authorization: 'Bearer abc' })
  client.logout()
  expect(client.getToken(), 'logout → null').toBe(null)
  expect(client.headers()).toEqual({})
})

test('auth：经 uiServe 注入 → 组件经 ctx 消费渲染（按钮驱动 setToken/logout）', async () => {
  const client = auth({ storage: new Map() })
  const router = new UIRouter()
  const Page = (_init: Record<string, unknown>, ctx: RenderCtx) => {
    return () => h('div', {},
      h('span', { id: 'tok' }, ctx.auth!.getToken() ?? 'null'),
      h('button', { id: 'set', onClick: () => { ctx.auth!.setToken('abc'); ctx.render() } }, '登录'),
      h('button', { id: 'out', onClick: () => { ctx.auth!.logout(); ctx.render() } }, '退出'),
      h('span', { id: 'hd' }, JSON.stringify(ctx.auth!.headers())),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, {})))
  const serve = uiServe(router, { root: '#root', auth: client })
  await serve.ready
  expect(document.querySelector('#tok')?.textContent).toBe('null')
  ;(document.querySelector('#set') as HTMLElement).click()
  await waitFor(() => document.querySelector('#tok')?.textContent === 'abc')
  expect(document.querySelector('#tok')?.textContent, 'setToken → 重渲染').toBe('abc')
  expect(document.querySelector('#hd')?.textContent, 'headers 注入').toBe('{"authorization":"Bearer abc"}')
  ;(document.querySelector('#out') as HTMLElement).click()
  await waitFor(() => document.querySelector('#tok')?.textContent === 'null')
  expect(document.querySelector('#tok')?.textContent, 'logout → 清空').toBe('null')
  serve.unmount()
})

test('i18n：t 插值 + locale 切换（缺失 key 返回 key——不静默——经 ctx 消费）', async () => {
  const i = i18n({ locale: 'zh', messages: { zh: { hello: '你好，{name}' }, en: { hello: 'Hello, {name}' } } })
  const router = new UIRouter()
  const Page = (_init: Record<string, unknown>, ctx: RenderCtx) => {
    return () => h('div', {},
      h('span', { id: 'hello' }, ctx.i18n!.t('hello', { name: '世界' })),
      h('span', { id: 'miss' }, ctx.i18n!.t('missing')),
      h('button', { id: 'en', onClick: () => { ctx.i18n!.setLocale('en'); ctx.render() } }, 'EN'),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, {})))
  const serve = uiServe(router, { root: '#root', i18n: i })
  await serve.ready
  expect(document.querySelector('#hello')?.textContent).toBe('你好，世界')
  expect(document.querySelector('#miss')?.textContent, '缺失 key 返回 key').toBe('missing')
  ;(document.querySelector('#en') as HTMLElement).click()
  await waitFor(() => document.querySelector('#hello')?.textContent === 'Hello, 世界')
  expect(document.querySelector('#hello')?.textContent, 'setLocale → 重渲染').toBe('Hello, 世界')
  serve.unmount()
})

test('ws：消息订阅（WebSocketCtor 注入——JSON 解析——退订）', () => {
  const fw = fakeWs()
  const client = ws({ WebSocketCtor: fw.ctor })
  const got: unknown[] = []
  const unsub = client.onMessage((d) => got.push(d))
  client.connect('ws://x')
  fw.last()?.onmessage?.({ data: '{"k":1}' })
  expect(got).toEqual([{ k: 1 }])
  client.send({ a: 2 })
  expect((fw.last() as unknown as { sent: string[] }).sent[0]).toBe('{"a":2}')
  unsub()
  fw.last()?.onmessage?.({ data: '{"k":2}' })
  expect(got.length, '退订后不再接收').toBe(1)
  client.close()
})
