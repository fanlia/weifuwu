/**
 * vdom 测试环境 setup（独立实现——不复用 ui-dom）
 *
 * 每个测试文件开头调用：
 * ```ts
 * import { setupJsdom } from './setup.ts'
 * before(setupJsdom)
 * ```
 */

import { JSDOM } from 'jsdom'

let _setup = false

export function setupJsdom(): void {
  if (_setup || typeof document !== 'undefined') return
  _setup = true

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  })

  const win = dom.window as any
  const g = globalThis as any

  // 跳过 JS 内置对象（不覆盖 globalThis 已有的）
  const builtins = new Set([
    'Array', 'Object', 'String', 'Number', 'Boolean', 'Function', 'Promise',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Date', 'RegExp', 'Error',
    'JSON', 'Math', 'Reflect', 'Proxy', 'BigInt', 'parseInt', 'parseFloat',
    'isNaN', 'isFinite', 'globalThis', 'structuredClone',
  ])

  for (const k of Object.getOwnPropertyNames(win)) {
    if (builtins.has(k) || k === 'window' || k === 'self' || k === 'top' || k === 'parent') continue
    try { g[k] = win[k] } catch { /* 只读属性跳过 */ }
  }
  g.window = g
  g.self = g
}
