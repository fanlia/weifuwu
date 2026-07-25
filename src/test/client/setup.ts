/**
 * weifuwu/client 测试环境 setup
 *
 * 在每个测试文件开头调用：
 * ```ts
 * import { setupJsdom } from './setup.ts'
 * setupJsdom()
 * ```
 *
 * 提供 JSDOM 浏览器全局环境，供 jsx-runtime / signal 等模块使用。
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
    'Object', 'Array', 'Function', 'String', 'Number', 'Boolean',
    'Symbol', 'Map', 'Set', 'RegExp', 'Promise', 'Error',
    'Date', 'Math', 'JSON',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'undefined', 'NaN', 'Infinity',
    'BigInt', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
  ])

  for (const key of Object.getOwnPropertyNames(win)) {
    if (builtins.has(key)) continue
    if (typeof g[key] === 'undefined') {
      try { g[key] = win[key] } catch { /* read-only property, skip */ }
    }
  }
}
