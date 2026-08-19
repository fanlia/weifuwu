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
  const win = dom.window as unknown as Window
  const doc = win.document
  const scroller = (): Element | null => doc.scrollingElement ?? doc.documentElement
  return {
    window: win,
    document: doc,
    copyText: () => {},
    downloadFile: () => false,
    activeElement: () => doc.activeElement as HTMLElement | null,
    byId: (id) => doc.getElementById(id),
    query: (sel) => doc.querySelector(sel) as HTMLElement | null,
    queryAll: (sel) => doc.querySelectorAll(sel),
    createElement: (tag) => doc.createElement(tag),
    createElementNS: (ns, tag) => doc.createElementNS(ns, tag),
    createDocumentFragment: () => doc.createDocumentFragment(),
    createComment: (text) => doc.createComment(text),
    createTextNode: (text) => doc.createTextNode(text),
    addEventListener: (type, fn, options) => win.addEventListener(type, fn, options),
    removeEventListener: (type, fn, options) => win.removeEventListener(type, fn, options),
    scrollTo: (y) => win.scrollTo(0, y),
    scrollTop: () => scroller()?.scrollTop ?? 0,
    matchMedia: (q) => (typeof win.matchMedia === 'function' ? win.matchMedia(q) : null),
    visualViewport: () => (win as unknown as { visualViewport?: VisualViewport }).visualViewport ?? null,
    scrollingElement: () => scroller(),
    bodyElement: () => doc.body,
    bodyAppend: (el) => doc.body.appendChild(el),
    bodyRemove: (el) => doc.body.removeChild(el),
    clearBody: () => { doc.body.innerHTML = '' },
    event: (type, init) => new (win as unknown as { Event: typeof Event }).Event(type, init),
    rootElement: () => doc.documentElement,
    getSelection: () => win.getSelection(),
    selectionText: () => win.getSelection()?.toString() ?? '',
    storageGet: (key) => { try { return win.localStorage.getItem(key) } catch { return null } },
    storageSet: (key, value) => { try { win.localStorage.setItem(key, value) } catch { /* 忽略 */ } },
    timeout: (fn, ms) => win.setTimeout(fn, ms),
    pathname: () => win.location.pathname,
    setHash: (hash) => { win.location.hash = hash },
    viewportHeight: () => win.innerHeight,
    onFormRestore: (fn) => { fn() },
  }
}

/** 全局 jsdom 初始化（兼容——组件测试迁移期——vdom 测试纪律优先
 *  testBrowser 独立实例——setupJsdom 供既有测试零改动迁移——逐步清理） */
export function setupJsdom(): void {
  if (typeof document !== 'undefined') return
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost', pretendToBeVisual: true,
  })
  const win = dom.window as any
  const g = globalThis as any
  const builtins = new Set([
    'Object', 'Array', 'Function', 'String', 'Number', 'Boolean',
    'Symbol', 'Map', 'Set', 'RegExp', 'Promise', 'Error',
    'Date', 'Math', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'undefined', 'NaN', 'Infinity', 'BigInt', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
  ])
  for (const key of Object.getOwnPropertyNames(win)) {
    if (builtins.has(key)) continue
    if (key in g) continue
    try { g[key] = win[key] } catch { /* 只读全局——跳过 */ }
  }
  g.window = win
  g.document = win.document
  // jsdom getter 属性（ownPropertyNames 不含——显式注入——测试 localStorage 依赖）
  try { g.localStorage = win.localStorage } catch { /* 无——跳过 */ }
  try { g.sessionStorage = win.sessionStorage } catch { /* 无——跳过 */ }
}
