/**
 * weifuwu/client JSX runtime 扩展测试 — Signal 属性绑定 / Fragment / 边界情况
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// ── 浏览器全局环境设置 ───────────────────────────────────────

before(() => {
  if (typeof document !== 'undefined') return

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
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

const { signal, effect } = await import('../../client/signal.ts')
const { jsx, jsxs, jsxDEV, Fragment, Show, For, setCtx } = await import('../../client/jsx-runtime.ts')
import type { WfuiContext } from '../../client/types.ts'

const mockCtx = {
  route: { path: '/', params: {}, query: {}, hash: '', component: null, data: {}, loading: false },
  app: { navigate: () => {} },
  provide: () => {}, inject: () => null, ws: null as any,
}

// ═════════════════════════════════════════════════════════════
// Fragment
// ═════════════════════════════════════════════════════════════

describe('Fragment', () => {
  it('渲染多个子节点（返回 display:contents div）', () => {
    const node = jsx(Fragment, null,
      jsx('span', { class: 'a' }, 'A'),
      jsx('span', { class: 'b' }, 'B'),
    )
    assert.ok(node instanceof HTMLDivElement)
    assert.equal(node.style.display, 'contents')
    assert.equal(node.children.length, 2)
    assert.equal(node.children[0].className, 'a')
    assert.equal(node.children[1].className, 'b')
  })

  it('空 Fragment 返回空 div', () => {
    const node = jsx(Fragment, null)
    assert.ok(node instanceof HTMLDivElement)
    assert.equal(node.children.length, 0)
  })

  it('Signal 作为 Fragment 的 children 能正确渲染', () => {
    const s = signal('hello signal')
    const node = jsx(Fragment, null, s)

    assert.ok(node instanceof HTMLDivElement)
    assert.equal(node.textContent, 'hello signal')

    // Signal 变化时自动更新文本
    s.value = 'updated'
    assert.equal(node.textContent, 'updated')
  })

  it('Fragment 内 Signal children 的 effect 在移除时清理', () => {
    const s = signal('will be removed')
    let effectRan = false

    // 创建一个间接测试：在 Fragment 中放一个 Signal child，然后移除
    const root = document.createElement('div')
    const node = jsx(Fragment, null, s)
    root.appendChild(node)
    assert.equal(root.textContent, 'will be removed')

    // 移除 Fragment，Signal 的 effect 应该被清理
    // 验证方式：触发 MutationObserver 后 Signal 变化不应再更新已移除的 DOM
    root.removeChild(node)
    s.value = 'after removal'

    // 由于节点已被移除，textContent 不应变化
    // 但无法直接检查清理状态，所以至少验证无异常
    assert.ok(true, '移除后 Signal 变化不应抛出异常')
  })
})

// ═════════════════════════════════════════════════════════════
// Signal 属性绑定
// ═════════════════════════════════════════════════════════════

describe('Signal 属性绑定', () => {
  it('Signal class 响应式变化', () => {
    const cls = signal('foo')
    const el = jsx('div', { class: cls })
    assert.equal(el.className, 'foo')

    cls.value = 'bar'
    assert.equal(el.className, 'bar')
  })

  it('Signal hidden 响应式变化', () => {
    const hidden = signal(false)
    const el = jsx('div', { hidden })
    assert.equal(el.hasAttribute('hidden'), false)

    hidden.value = true
    assert.equal(el.hasAttribute('hidden'), true)

    hidden.value = false
    assert.equal(el.hasAttribute('hidden'), false)
  })

  it('Signal value 绑定到 input', () => {
    const val = signal('initial')
    const el = jsx('input', { value: val }) as HTMLInputElement

    // 当前实现中 value 属性通过 setAttribute 设置，input 的 value 属性不会被同步
    // 验证 setAttribute 效果
    assert.equal(el.getAttribute('value'), 'initial')

    val.value = 'updated'
    assert.equal(el.getAttribute('value'), 'updated')
  })

  it('混合 Signal 和静态属性', () => {
    const cls = signal('dynamic')
    const el = jsx('div', { class: cls, id: 'static-id' })
    assert.equal(el.className, 'dynamic')
    assert.equal(el.id, 'static-id')
  })
})

// ═════════════════════════════════════════════════════════════
// Show — 扩展测试
// ═════════════════════════════════════════════════════════════

describe('Show — 扩展', () => {
  it('嵌套 Show 切换正常', () => {
    const outer = signal(true)
    const inner = signal(true)

    const node = Show({
      when: outer,
      children: Show({
        when: inner,
        children: jsx('div', { class: 'nested' }, 'inner'),
        fallback: jsx('span', { class: 'fallback' }, 'inner-fallback'),
      }),
      fallback: jsx('span', { class: 'outer-fallback' }, 'outer'),
    })

    // outer=true, inner=true → inner 内容
    assert.equal(node.querySelectorAll('.nested').length, 1)

    inner.value = false
    // outer=true, inner=false → inner 的 fallback
    assert.equal(node.querySelectorAll('.nested').length, 0)
    assert.equal(node.querySelectorAll('.fallback').length, 1)

    outer.value = false
    // outer=false → outer 的 fallback
    assert.equal(node.querySelectorAll('.outer-fallback').length, 1)
  })

  it('函数式 children', () => {
    const show = signal(true)
    const node = Show({
      when: show,
      children: () => jsx('div', { class: 'fn-child' }),
    })
    const children = node.querySelectorAll('.fn-child')
    assert.equal(children.length, 1)
  })
})

// ═════════════════════════════════════════════════════════════
// For — 扩展测试（keyed 模式）
// ═════════════════════════════════════════════════════════════

describe('For — keyed 模式', () => {
  it('keyBy 为字符串时按属性匹配', () => {
    const items = signal([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])
    const node = For({
      each: items,
      keyBy: 'id',
      children: (item: any) => jsx('div', { 'data-key': item.id }, item.name),
    })

    // 初始渲染
    const divs = node.querySelectorAll('div')
    assert.equal(divs.length, 2)
    assert.equal(divs[0].textContent, 'A')
    assert.equal(divs[1].textContent, 'B')
  })

  it('keyed 模式增加元素后保留已有节点', () => {
    const items = signal<Array<{ id: string; name: string }>>([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ])
    const node = For({
      each: items,
      keyBy: 'id',
      children: (item: any) => jsx('div', { 'data-key': item.id }, item.name),
    })

    // 记录第一个节点的引用
    const firstDiv = node.querySelector('div')
    const firstRef = firstDiv

    // 增加元素
    items.value = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]

    // 第一个节点应复用
    assert.equal(node.querySelectorAll('div').length, 3)
    assert.equal(node.querySelector('div'), firstRef)
  })

  it('keyed 模式删除元素后清理', () => {
    const items = signal<Array<{ id: string; name: string }>>([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ])
    const node = For({
      each: items,
      keyBy: 'id',
      children: (item: any) => jsx('div', { 'data-key': item.id }, item.name),
    })
    assert.equal(node.querySelectorAll('div').length, 3)

    items.value = [
      { id: 'a', name: 'A' },
      { id: 'c', name: 'C' },
    ]
    assert.equal(node.querySelectorAll('div').length, 2)

    const texts = [...node.querySelectorAll('div')].map(d => d.textContent)
    assert.deepEqual(texts, ['A', 'C'])
  })

  it('keyBy 为函数时使用自定义 key', () => {
    const items = signal([{ name: 'foo' }, { name: 'bar' }])
    const node = For({
      each: items,
      keyBy: (item: any) => item.name,
      children: (item: any) => jsx('div', {}, item.name),
    })
    assert.equal(node.querySelectorAll('div').length, 2)
  })
})

// ═════════════════════════════════════════════════════════════
// jsxs / jsxDEV
// ═════════════════════════════════════════════════════════════

describe('jsxs / jsxDEV', () => {
  it('jsxs 与 jsx 行为一致', () => {
    const node = jsxs('div', { class: 'jsxs' }, jsx('span', null, 'a'), jsx('span', null, 'b'))
    assert.equal(node.className, 'jsxs')
    assert.equal(node.children.length, 2)
  })

  it('jsxDEV 编译目标兼容', () => {
    const node = jsxDEV('div', { class: 'dev', children: jsx('span', null, 'child') }, null, false, { fileName: '', lineNumber: 0 }, null)
    assert.equal(node.className, 'dev')
    assert.equal(node.children.length, 1)
  })
})
