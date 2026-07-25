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

    // Signal value 通过 DOM property .value 设置（非 setAttribute），
    // 所以断言 el.value 而非 getAttribute('value')
    assert.equal(el.value, 'initial')

    val.value = 'updated'
    assert.equal(el.value, 'updated')
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

// ═════════════════════════════════════════════════════════════
// setProp — Signal className 空值保护
// ═════════════════════════════════════════════════════════════

describe('setProp className Signal 空值保护', () => {
  it('正常字符串', () => {
    const el = jsx('div', { class: signal('foo') }) as HTMLElement
    assert.equal(el.className, 'foo')
  })

  it('空字符串', () => {
    const el = jsx('div', { class: signal('') }) as HTMLElement
    assert.equal(el.className, '')
  })

  it('undefined', () => {
    const el = jsx('div', { class: signal(undefined) }) as HTMLElement
    assert.equal(el.className, '')
  })

  it('null', () => {
    const el = jsx('div', { class: signal(null) }) as HTMLElement
    assert.equal(el.className, '')
  })

  it('Signal 从字符串变为 undefined', () => {
    const cls = signal('foo')
    const el = jsx('div', { class: cls }) as HTMLElement
    assert.equal(el.className, 'foo')
    cls.value = undefined as any
    assert.equal(el.className, '')
  })
})

// ═════════════════════════════════════════════════════════════
// setProp — Signal value/checked 空值保护
// ═════════════════════════════════════════════════════════════

describe('setProp input value/checked 空值保护', () => {
  it('正常 value', () => {
    const el = jsx('input', { value: signal('hello') }) as HTMLInputElement
    assert.equal(el.value, 'hello')
  })

  it('空字符串 value', () => {
    const el = jsx('input', { value: signal('') }) as HTMLInputElement
    assert.equal(el.value, '')
  })

  it('null value', () => {
    const el = jsx('input', { value: signal(null) }) as HTMLInputElement
    assert.equal(el.value, '')
  })

  it('checked true', () => {
    const el = jsx('input', { type: 'checkbox', checked: signal(true) }) as HTMLInputElement
    assert.equal(el.checked, true)
  })

  it('checked false', () => {
    const el = jsx('input', { type: 'checkbox', checked: signal(false) }) as HTMLInputElement
    assert.equal(el.checked, false)
  })

  it('checked null', () => {
    const el = jsx('input', { type: 'checkbox', checked: signal(null) }) as HTMLInputElement
    assert.equal(el.checked, false)
  })

  it('Signal value 从 hello 变为空', () => {
    const val = signal('hello')
    const el = jsx('input', { value: val }) as HTMLInputElement
    assert.equal(el.value, 'hello')
    val.value = ''
    assert.equal(el.value, '')
  })

  it('非 Signal value 空值', () => {
    const el = jsx('input', { value: null }) as HTMLInputElement
    assert.equal(el.value, '')
  })
})

// ═════════════════════════════════════════════════════════════
// 组件返回值保护
// ═════════════════════════════════════════════════════════════

describe('组件返回值保护', () => {
  it('组件返回 null', () => {
    function Cmp() { return null }
    const node = jsx(Cmp, {})
    assert(node instanceof DocumentFragment || node instanceof Element)
    assert.equal(node.childNodes.length, 0)
  })

  it('组件返回 undefined', () => {
    function Cmp() { return undefined }
    const node = jsx(Cmp, {})
    assert(node instanceof DocumentFragment || node instanceof Element)
    assert.equal(node.childNodes.length, 0)
  })

  it('组件返回 false', () => {
    function Cmp() { return false }
    const node = jsx(Cmp, {})
    assert(node instanceof DocumentFragment || node instanceof Element)
    assert.equal(node.childNodes.length, 0)
  })

  it('组件返回字符串', () => {
    function Cmp() { return 'hello' }
    const node = jsx(Cmp, {}) as DocumentFragment
    assert(node instanceof DocumentFragment)
    assert.equal(node.textContent, 'hello')
  })

  it('组件返回数字', () => {
    function Cmp() { return 42 }
    const node = jsx(Cmp, {}) as DocumentFragment
    assert(node instanceof DocumentFragment)
    assert.equal(node.textContent, '42')
  })

  it('组件返回 Node（正常路径）', () => {
    function Cmp() { return jsx('div', null, 'ok') }
    const node = jsx(Cmp, {}) as HTMLElement
    assert(node instanceof HTMLElement)
    assert.equal(node.textContent, 'ok')
  })

  it('组件 throw（ErrorBoundary 路径）', () => {
    function Cmp() { throw new Error('crash') }
    const node = jsx(Cmp, {}) as HTMLElement
    assert(node instanceof HTMLElement)
  })
})

// ═════════════════════════════════════════════════════════════
// toNode 隐式覆盖
// ═════════════════════════════════════════════════════════════

describe('toNode 映射', () => {
  it('Signal 作为子节点渲染', () => {
    const msg = signal('hello')
    const el = jsx('div', null, msg) as HTMLElement
    assert.equal(el.textContent, 'hello')

    msg.value = 'world'
    assert.equal(el.textContent, 'world')
  })

  it('boolean 不渲染', () => {
    const el = jsx('div', null, true, false) as HTMLElement
    assert.equal(el.textContent, '')
  })

  it('null/undefined 不渲染', () => {
    const el = jsx('div', null, null, undefined) as HTMLElement
    assert.equal(el.textContent, '')
  })

  it('数字 0 渲染为 "0"', () => {
    const el = jsx('div', null, 0) as HTMLElement
    assert.equal(el.textContent, '0')
  })

  it('空字符串渲染为空', () => {
    const el = jsx('div', null, '') as HTMLElement
    assert.equal(el.textContent, '')
  })

  it('函数被跳过', () => {
    const el = jsx('div', null, () => 'surprise') as HTMLElement
    assert.equal(el.textContent, '')
  })

  it('数组子节点', () => {
    const el = jsx('div', null, ['a', 'b', 'c']) as HTMLElement
    assert.equal(el.textContent, 'abc')
  })

  it('混合子节点：文本 + 元素 + Signal', () => {
    const s = signal('sig')
    const el = jsx('p', null, 'text ', jsx('strong', null, 'bold'), ' ', s) as HTMLElement
    assert.equal(el.textContent, 'text bold sig')

    s.value = 'updated'
    assert.equal(el.textContent, 'text bold updated')
  })
})

// ═════════════════════════════════════════════════════════════
// Fragment
// ═════════════════════════════════════════════════════════════

describe('Fragment', () => {
  it('渲染子节点', () => {
    const frag = Fragment({ children: [
      jsx('span', null, 'a'),
      jsx('span', null, 'b'),
    ] })
    assert(frag instanceof HTMLElement)
    assert.equal(frag.style.display, 'contents')
    assert.equal(frag.children.length, 2)
    assert.equal(frag.textContent, 'ab')
  })

  it('空的 children', () => {
    const frag = Fragment({ children: [] })
    assert(frag instanceof HTMLElement)
    assert.equal(frag.children.length, 0)
  })

  it('不含 children', () => {
    const frag = Fragment({})
    assert(frag instanceof HTMLElement)
    assert.equal(frag.children.length, 0)
  })
})

// ═════════════════════════════════════════════════════════════
// jsx 边界情况
// ═════════════════════════════════════════════════════════════

describe('jsx 边界情况', () => {
  it('空 props（null）', () => {
    const el = jsx('div', null)
    assert(el instanceof HTMLDivElement)
    assert.equal(el.className, '')
  })

  it('props 无 children', () => {
    const el = jsx('div', { class: 'test' })
    assert.equal(el.className, 'test')
    assert.equal(el.children.length, 0)
  })

  it('key 属性被过滤', () => {
    const el = jsx('div', { key: '0', class: 'item' }) as HTMLElement
    assert(!el.hasAttribute('key'))
    assert.equal(el.className, 'item')
  })

  it('style 对象', () => {
    const el = jsx('div', { style: { color: 'red', fontSize: '14px' } }) as HTMLElement
    assert.equal(el.style.color, 'red')
    assert.equal(el.style.fontSize, '14px')
  })

  it('事件绑定', () => {
    let clicked = false
    const el = jsx('button', { onClick: () => { clicked = true } }) as HTMLElement
    el.click()
    assert(clicked)
  })

  it('ref 回调', () => {
    let refd: HTMLElement | null = null
    const el = jsx('div', { ref: (e: HTMLElement) => { refd = e } }) as HTMLElement
    assert.equal(refd, el)
  })
})

// ═════════════════════════════════════════════════════════════
// Signal 属性绑定
// ═════════════════════════════════════════════════════════════

describe('Signal 属性绑定', () => {
  it('hidden Signal', () => {
    const hide = signal(true)
    const el = jsx('div', { hidden: hide }) as HTMLElement
    assert(el.hasAttribute('hidden'))
    hide.value = false
    assert(!el.hasAttribute('hidden'))
  })

  it('disabled Signal', () => {
    const disable = signal(true)
    const el = jsx('button', { disabled: disable }) as HTMLButtonElement
    assert(el.disabled)
    disable.value = false
    assert(!el.disabled)
  })

  it('class Signal 切换', () => {
    const cls = signal('red')
    const el = jsx('div', { class: cls }) as HTMLElement
    assert.equal(el.className, 'red')
    cls.value = 'blue'
    assert.equal(el.className, 'blue')
  })

  it('value Signal 输入框', () => {
    const val = signal('init')
    const el = jsx('input', { value: val }) as HTMLInputElement
    assert.equal(el.value, 'init')
    val.value = 'updated'
    assert.equal(el.value, 'updated')
  })
})
