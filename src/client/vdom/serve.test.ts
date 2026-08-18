/**
 * vdom serve — 端到端契约测试（uiServe + UIRouter——使用形态定义）
 *
 * 用户使用形态（决策 2026-12）：
 * ```ts
 * const router = new UIRouter()
 * router.get('/', (req) => new Response(renderToStream(h('div', {}, 'hello world'))))
 * uiServe(router, { root: '#root' })
 * ```
 *
 * 公共面：h/jsx、uiServe、UIRouter（index.ts）——renderToStream 为 core 内部
 * 渲染入口（页面作者经 ctx/后续公共面决策暴露——本测试经 core 直取）。
 */

import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { UIRouter, uiServe } from './index.ts'
import { h } from './core/vnode.ts'
import { renderToStream } from './core/render.ts'
import { commandResponse } from './core/router.ts'

before(setupJsdom)

afterEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
})

test('uiServe + UIRouter：单路由 / 渲染 hello world（uiServe(router, { root: "#root" })）', async () => {
  const router = new UIRouter()
  router.get('/', () => commandResponse(renderToStream(h('div', { class: 'app' }, 'hello world'))))

  const serve = uiServe(router, { root: '#root' })
  await serve.ready

  const el = document.querySelector('#root .app')
  assert.ok(el, '页面元素已渲染到 #root')
  assert.equal(el?.textContent, 'hello world')
})
