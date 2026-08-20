/**
 * vdom contract — 公共面契约测试（vdom 验收标准——对外接口锁定）
 *
 * 决策（2026-12）：对外接口只有 **h/jsx、uiServe、UIRouter**——
 * createRoot 不导出（UIRouter 唯一应用入口）；uiSsr 不单独导出
 * （uiServe 双端一体——SSR 面经 core）；结构符号内化
 * （createPortal/Fragment/Portal 不导出——数组 = 隐式 Fragment——
 * `<></>` 经 jsx-runtime 子路径）。
 *
 * 本文件 = 公共面验收（替换 ui-dom 时对外接口不变——组件库/应用零改动）。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import * as pub from './index.ts'
import * as jsxrt from './jsx-runtime.ts'
import { uiSsr } from './core/serve.ts'
import type { RenderCtx } from './core/serve.ts'

async function waitFor(fn: () => boolean, timeout = 500): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, 5))
  }
}

test('S1 公共面导出集：h/jsx/jsxs/jsxDEV/uiServe/UIRouter + 组件消费白名单', () => {
  for (const name of ['h', 'jsx', 'jsxs', 'jsxDEV', 'uiServe', 'UIRouter']) {
  expect(typeof (pub as Record<string, unknown>)[name], `${name} 应为函数`).toBe('function')
  }
  // createRoot 不导出（UIRouter 唯一入口）
  expect((pub as Record<string, unknown>).createRoot, 'createRoot 不导出').toBe(undefined)
  // 结构符号：createPortal/Portal 禁导出（X-S1 S9.4——usePopup 内部机制）
  expect((pub as Record<string, unknown>).createPortal).toBe(undefined)
  expect((pub as Record<string, unknown>).Portal).toBe(undefined)
  // **组件消费白名单（P2 组件库迁移——2026-XX 决策）**：Fragment（JSX
  // 多根符号——Skeleton/Markdown 用）、createClientBrowser（浏览器环境
  // 工厂——组件 19 处）、AppMiddleware（命令式中间件类型——Confirm/
  // Toast/Notification）——非引擎符号——组件库必要面
  expect(typeof (pub as Record<string, unknown>).Fragment, 'Fragment 白名单（组件消费）').toBe('symbol')
  expect(typeof (pub as Record<string, unknown>).createClientBrowser, 'createClientBrowser 白名单').toBe('function')
})

test('S2 jsx-runtime 子路径：jsx/jsxs/jsxDEV/Fragment（`<></>` 编译目标）', () => {
  expect(typeof jsxrt.jsx).toBe('function')
  expect(typeof jsxrt.jsxs).toBe('function')
  expect(typeof jsxrt.jsxDEV).toBe('function')
  expect(typeof jsxrt.Fragment === 'symbol').toBeTruthy()
})

test('A1 端到端冒烟（公共面全链路）：uiServe + ctx.stream 渲染 hello world', async () => {
  const router = new pub.UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(pub.h('div', { class: 'app' }, 'hello world')))
  const serve = pub.uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('#root .app')?.textContent).toBe('hello world')
})

test('A2 组件渲染 + 交互（公共面）：事件 → ctx.render() → 精准更新', async () => {
  const router = new pub.UIRouter()
  let count = 0
  const Counter = (_init: Record<string, unknown>, ctx: UIContext) => {
    const onInc = () => { count++; void ctx.render() } // 工厂层稳定引用（§3.1）
    return () => pub.h('button', { id: 'c', onClick: onInc }, `c:${count}`)
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(pub.h(Counter, {})))
  const serve = pub.uiServe(router, { root: '#root' })
  await serve.ready
  expect(document.querySelector('#c')?.textContent).toBe('c:0')
  ;(document.querySelector('#c') as HTMLElement).click()
  await waitFor(() => document.querySelector('#c')?.textContent === 'c:1')
  expect(document.querySelector('#c')?.textContent).toBe('c:1')
})

test('R1 导航（公共面）：navigate 切换路由——root 异类型整树替换', async () => {
  const router = new pub.UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(pub.h('div', { class: 'home' }, '首页')))
  router.get('/detail', (req, ctx) => (ctx as RenderCtx).stream(pub.h('div', { class: 'detail' }, '详情')))
  const serve = pub.uiServe(router, { root: '#root' })
  await serve.ready
  await serve.navigate('/detail')
  await waitFor(() => document.querySelector('.detail') !== null)
  expect(document.querySelector('.detail')?.textContent).toBe('详情')
  expect(document.querySelector('.home'), '旧页移除').toBe(null)
})

test('R2 SSR（core 面）：同一 router 同一 handler → HTML 文档', async () => {
  const router = new pub.UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(pub.h('div', { class: 'app' }, 'SSR')))
  const html = await uiSsr(router, '/', { title: 'SSR 页' })
  expect(html.startsWith('<!DOCTYPE html>')).toBeTruthy()
  expect(html.includes('<div class="app">SSR</div>')).toBeTruthy()
})

// ── 组件库迁移试点（无 hooks 组件——vdom 引擎渲染验证——零改动兼容） ──

test('试点：Button（ui-dom 组件——无 hooks）——vdom 引擎渲染 + 交互', async () => {
  const { Button } = await import('../components/Button/Button.ts')
  const router = new pub.UIRouter()
  let clicks = 0
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(
    pub.h(Button, { variant: 'primary', id: 'btn', onClick: () => { clicks++ } }, '点击'),
  ))
  const serve = pub.uiServe(router, { root: '#root' })
  await serve.ready
  const btn = document.querySelector('#btn') as HTMLElement
  expect(btn, 'Button 渲染').toBeTruthy()
  expect(btn.textContent).toBe('点击')
  expect(btn.classList.contains('wf-btn--primary'), '组件样式类（variant）').toBeTruthy()
  expect(btn.type).toBe('button')
  btn.click()
  expect(clicks, '事件透传（ui-dom 组件 onClick → vdom 事件绑定）').toBe(1)
})

test('试点：Button + ctx.i18n 注入（组件读 i18n 面——middlewares 注入）', async () => {
  const { Button } = await import('../components/Button/Button.ts')
  const router = new pub.UIRouter()
  const i18nState = { locale: 'zh', setLocale() {}, t: (k: string) => k } as never
  ;(i18nState as never)
  const i18nObj = {
    locale: 'zh',
    setLocale() {},
    t: (k: string) => k,
    components: { Button: { loading: '提交中' } },
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(
    pub.h(Button, { loading: true, id: 'lb' }, 'x'),
  ))
  const serve = pub.uiServe(router, { root: '#root', i18n: i18nObj as never })
  await serve.ready
  const btn = document.querySelector('#lb') as HTMLElement
  expect(btn?.textContent?.trim(), '组件读 ctx.i18n（loading 文案）').toBe('提交中')
})

test('S3 路由参数：注入 ctx.params（对齐后端 Object.assign(ctx.params)——Request 零修改）', async () => {
  const router = new pub.UIRouter()
  let seenReq: Request | null = null
  let seenParams: Record<string, string> | null = null
  router.get('/users/:id', (req, ctx) => {
    seenReq = req
    seenParams = ctx.params ?? null
    return (ctx as RenderCtx).stream(pub.h('div', { id: 'p' }, String(ctx.params?.id)))
  })
  const serve = pub.uiServe(router, { root: '#root' })
  await serve.ready
  // 导航到带参路由
  await serve.navigate('/users/42')
  await waitFor(() => document.querySelector('#p')?.textContent === '42')
  expect(document.querySelector('#p')?.textContent, 'ctx.params.id 注入').toBe('42')
  // Request 零修改（原生对象——无 params/path 扩展）
  expect((seenReq as unknown as Record<string, unknown>).params, 'Request 无 params 扩展').toBe(undefined)
  expect((seenReq as unknown as Record<string, unknown>).path, 'Request 无 path 扩展').toBe(undefined)
  expect(seenParams?.id, 'params 在 ctx').toBe('42')
})
