/**
 * vdom serve — 端到端契约测试（uiServe + UIRouter——使用形态定义）
 *
 * 用户使用形态（决策 2026-12）：
 * ```ts
 * const router = new UIRouter()
 * router.get('/', () => commandResponse(renderToStream(h('div', {}, 'hello world'))))
 * uiServe(router, { root: '#root', browser: testBrowser() })
 * ```
 *
 * 环境即依赖注入——**无需 before(setupJsdom)**——每个测试独立 jsdom 实例
 * （零全局污染）；公共面：h/jsx、uiServe、UIRouter（index.ts）——
 * renderToStream/commandResponse 为 core 内部渲染入口（测试直取）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from './setup.ts'
import { UIRouter, uiServe } from './index.ts'
import { h } from './core/vnode.ts'
import { renderToStream } from './core/build.ts'
import { commandResponse } from './core/router.ts'

test('uiServe + UIRouter：单路由 / 渲染 hello world（uiServe(router, { root: "#root", browser })）', async () => {
  const browser = testBrowser()
  const router = new UIRouter()
  router.get('/', () => commandResponse(renderToStream(h('div', { class: 'app' }, 'hello world'))))

  const serve = uiServe(router, { root: '#root', browser })
  await serve.ready

  const el = browser.document.querySelector('#root .app')
  assert.ok(el, '页面元素已渲染到 #root')
  assert.equal(el?.textContent, 'hello world')
})

test('browser 注入隔离：两个实例互不干扰（独立 jsdom——无全局状态）', async () => {
  const b1 = testBrowser()
  const b2 = testBrowser()
  const router = new UIRouter()
  router.get('/', () => commandResponse(renderToStream(h('div', {}, 'one'))))
  const s1 = uiServe(router, { root: '#root', browser: b1 })
  await s1.ready
  assert.equal(b1.document.querySelector('#root')?.textContent, 'one')
  assert.equal(b2.document.querySelector('#root')?.textContent, '', '独立实例——b2 未渲染')
  assert.notEqual(b1.document, b2.document)
})
