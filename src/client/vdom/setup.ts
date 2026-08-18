/**
 * vdom 测试环境 — testBrowser()（浏览器环境注入——零全局污染）
 *
 * 设计（2026-12）：uiServe(router, { root, browser })——环境即依赖注入——
 * 测试不再需要 before(setupJsdom)——每个测试独立 jsdom 实例（隔离更干净）：
 *
 * ```ts
 * import { testBrowser } from './setup.ts'
 * const browser = testBrowser()
 * const serve = uiServe(router, { root: '#root', browser })
 * assert.equal(browser.document.querySelector('#root .app')?.textContent, 'hello world')
 * ```
 */

import { JSDOM } from 'jsdom'
import type { Browser } from './browser/Browser.ts'

/** 测试浏览器实例（独立 JSDOM——不污染 globalThis——测试间天然隔离） */
export function testBrowser(): Browser {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  })
  return {
    window: dom.window as unknown as Window,
    document: dom.window.document,
  }
}
