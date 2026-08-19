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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from './setup.ts'
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
    assert.equal(typeof (pub as Record<string, unknown>)[name], 'function', `${name} 应为函数`)
  }
  // createRoot 不导出（UIRouter 唯一入口）
  assert.equal((pub as Record<string, unknown>).createRoot, undefined, 'createRoot 不导出')
  // 结构符号：createPortal/Portal 禁导出（X-S1 S9.4——usePopup 内部机制）
  assert.equal((pub as Record<string, unknown>).createPortal, undefined)
  assert.equal((pub as Record<string, unknown>).Portal, undefined)
  // **组件消费白名单（P2 组件库迁移——2026-XX 决策）**：Fragment（JSX
  // 多根符号——Skeleton/Markdown 用）、createClientBrowser（浏览器环境
  // 工厂——组件 19 处）、AppMiddleware（命令式中间件类型——Confirm/
  // Toast/Notification）——非引擎符号——组件库必要面
  assert.equal(typeof (pub as Record<string, unknown>).Fragment, 'symbol', 'Fragment 白名单（组件消费）')
  assert.equal(typeof (pub as Record<string, unknown>).createClientBrowser, 'function', 'createClientBrowser 白名单')
})

test('S2 jsx-runtime 子路径：jsx/jsxs/jsxDEV/Fragment（`<></>` 编译目标）', () => {
  assert.equal(typeof jsxrt.jsx, 'function')
  assert.equal(typeof jsxrt.jsxs, 'function')
  assert.equal(typeof jsxrt.jsxDEV, 'function')
  assert.ok(typeof jsxrt.Fragment === 'symbol')
})

test('A1 端到端冒烟（公共面全链路）：uiServe + ctx.stream 渲染 hello world', async () => {
  const browser = testBrowser()
  const router = new pub.UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(pub.h('div', { class: 'app' }, 'hello world')))
  const serve = pub.uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('#root .app')?.textContent, 'hello world')
})

test('A2 组件渲染 + 交互（公共面）：事件 → ctx.render() → 精准更新', async () => {
  const browser = testBrowser()
  const router = new pub.UIRouter()
  let count = 0
  const Counter = (_init: Record<string, unknown>, ctx: UIContext) => {
    const onInc = () => { count++; void ctx.render() } // 工厂层稳定引用（§3.1）
    return () => pub.h('button', { id: 'c', onClick: onInc }, `c:${count}`)
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(pub.h(Counter, {})))
  const serve = pub.uiServe(router, { root: '#root', browser })
  await serve.ready
  assert.equal(browser.document.querySelector('#c')?.textContent, 'c:0')
  ;(browser.document.querySelector('#c') as HTMLElement).click()
  await waitFor(() => browser.document.querySelector('#c')?.textContent === 'c:1')
  assert.equal(browser.document.querySelector('#c')?.textContent, 'c:1')
})

test('R1 导航（公共面）：navigate 切换路由——root 异类型整树替换', async () => {
  const browser = testBrowser()
  const router = new pub.UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(pub.h('div', { class: 'home' }, '首页')))
  router.get('/detail', (req, ctx) => (ctx as RenderCtx).stream(pub.h('div', { class: 'detail' }, '详情')))
  const serve = pub.uiServe(router, { root: '#root', browser })
  await serve.ready
  await serve.navigate('/detail')
  await waitFor(() => browser.document.querySelector('.detail') !== null)
  assert.equal(browser.document.querySelector('.detail')?.textContent, '详情')
  assert.equal(browser.document.querySelector('.home'), null, '旧页移除')
})

test('R2 SSR（core 面）：同一 router 同一 handler → HTML 文档', async () => {
  const router = new pub.UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(pub.h('div', { class: 'app' }, 'SSR')))
  const html = await uiSsr(router, '/', { title: 'SSR 页' })
  assert.ok(html.startsWith('<!DOCTYPE html>'))
  assert.ok(html.includes('<div class="app">SSR</div>'))
})

// ── 组件库迁移试点（无 hooks 组件——vdom 引擎渲染验证——零改动兼容） ──

test('试点：Button（ui-dom 组件——无 hooks）——vdom 引擎渲染 + 交互', async () => {
  const { Button } = await import('../components/Button/Button.ts')
  const browser = testBrowser()
  const router = new pub.UIRouter()
  let clicks = 0
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(
    pub.h(Button, { variant: 'primary', id: 'btn', onClick: () => { clicks++ } }, '点击'),
  ))
  const serve = pub.uiServe(router, { root: '#root', browser })
  await serve.ready
  const btn = browser.document.querySelector('#btn') as HTMLElement
  assert.ok(btn, 'Button 渲染')
  assert.equal(btn.textContent, '点击')
  assert.ok(btn.classList.contains('wf-btn--primary'), '组件样式类（variant）')
  assert.equal(btn.type, 'button')
  btn.click()
  assert.equal(clicks, 1, '事件透传（ui-dom 组件 onClick → vdom 事件绑定）')
})

test('试点：Button + ctx.i18n 注入（组件读 i18n 面——middlewares 注入）', async () => {
  const { Button } = await import('../components/Button/Button.ts')
  const browser = testBrowser()
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
  const serve = pub.uiServe(router, { root: '#root', browser, i18n: i18nObj as never })
  await serve.ready
  const btn = browser.document.querySelector('#lb') as HTMLElement
  assert.equal(btn?.textContent?.trim(), '提交中', '组件读 ctx.i18n（loading 文案）')
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
  const browser = testBrowser()
  const serve = pub.uiServe(router, { root: '#root', browser })
  await serve.ready
  // 导航到带参路由
  await serve.navigate('/users/42')
  await waitFor(() => browser.document.querySelector('#p')?.textContent === '42')
  assert.equal(browser.document.querySelector('#p')?.textContent, '42', 'ctx.params.id 注入')
  // Request 零修改（原生对象——无 params/path 扩展）
  assert.equal((seenReq as unknown as Record<string, unknown>).params, undefined, 'Request 无 params 扩展')
  assert.equal((seenReq as unknown as Record<string, unknown>).path, undefined, 'Request 无 path 扩展')
  assert.equal(seenParams?.id, '42', 'params 在 ctx')
})
