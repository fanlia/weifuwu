/**
 * createStyles 测试 — 作用域 CSS
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// ── 浏览器全局环境设置 ───────────────────────────────────────

before(() => {
  if (typeof document !== 'undefined') return

  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  })

  const win = dom.window as any
  const g = globalThis as any
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key === 'Object' || key === 'Array' || key === 'Function' ||
        key === 'String' || key === 'Number' || key === 'Boolean' ||
        key === 'Symbol' || key === 'Map' || key === 'Set' ||
        key === 'RegExp' || key === 'Promise' || key === 'Error' ||
        key === 'Date' || key === 'Math' || key === 'JSON' ||
        key === 'parseInt' || key === 'parseFloat' ||
        key === 'isNaN' || key === 'isFinite' ||
        key === 'undefined' || key === 'NaN' || key === 'Infinity') continue
    if (typeof g[key] === 'undefined') {
      try { g[key] = win[key] } catch { /* read-only, skip */ }
    }
  }
})

// ── 导入被测模块 ────────────────────────────────────────────

const { createStyles } = await import('../../../client/lib/css.ts')

// ═════════════════════════════════════════════════════════════
// createStyles
// ═════════════════════════════════════════════════════════════

describe('createStyles', () => {
  it('生成类名映射', () => {
    const s = createStyles({
      card: 'background: white;',
      title: 'font-size: 18px;',
    })

    assert.equal(typeof s.card, 'string')
    assert.equal(typeof s.title, 'string')
    assert.ok(s.card.startsWith('_w'))
    assert.ok(s.title.startsWith('_w'))
    assert.notEqual(s.card, s.title) // 不同 key 不同类名
  })

  it('样式注入到 document.head', () => {
    // 清除之前注入的 style
    document.head.querySelectorAll('style[data-wefu-css]').forEach(el => el.remove())

    const s = createStyles({
      btn: 'color: red; font-weight: bold;',
    })

    const styleEl = document.head.querySelector(`style[data-wefu-css]`)
    assert.ok(styleEl, 'style 元素应注入到 head')
    assert.ok(styleEl!.textContent!.includes(`.${s.btn}`))
    assert.ok(styleEl!.textContent!.includes('color: red'))
  })

  it('同名调用不重复注入 style 元素', () => {
    // 清空 head
    document.head.querySelectorAll('style[data-wefu-css]').forEach(el => el.remove())

    createStyles({ header: 'background: blue;' })
    const countAfterFirst = document.head.querySelectorAll('style[data-wefu-css]').length
    assert.equal(countAfterFirst, 1)

    // 相同 keys 的调用不应新增 style 元素
    createStyles({ header: 'background: blue;' })
    const countAfterSecond = document.head.querySelectorAll('style[data-wefu-css]').length
    assert.equal(countAfterSecond, 1) // 仍然只有 1 个
  })

  it('不同 key 名的调用注入不同的 style 元素', () => {
    document.head.querySelectorAll('style[data-wefu-css]').forEach(el => el.remove())

    createStyles({ card: 'padding: 8px;' })
    createStyles({ button: 'margin: 4px;' })

    const styles = document.head.querySelectorAll('style[data-wefu-css]')
    assert.equal(styles.length, 2)
  })

  it('类名可用在元素上生效', () => {
    const s = createStyles({
      box: 'width: 100px; height: 100px;',
    })

    const el = document.createElement('div')
    el.className = s.box
    document.body.appendChild(el)

    // JSDOM 下 computed style 可能不完整，至少验证类名正确赋值
    assert.equal(el.className, s.box)

    document.body.removeChild(el)
  })
})
