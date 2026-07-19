/**
 * weifuwu/client 生命周期测试 — onMount / onCleanup / wrap / createPortal / domMount
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
const { jsx, onMount, onCleanup, domMount, createPortal, wrap, setCtx, getCtx } = await import('../../client/jsx-runtime.ts')
import type { WfuiContext } from '../../client/types.ts'

// 创建一个最小 ctx 供测试
const mockCtx = {
  route: { path: '/', params: {}, query: {}, hash: '', component: null, data: {}, loading: false },
  app: { navigate: () => {} },
  provide: () => {}, inject: () => null, ws: null as any,
}

// ═════════════════════════════════════════════════════════════
// onMount / onCleanup
// ═════════════════════════════════════════════════════════════

describe('onMount', () => {
  it('组件挂载到 DOM 时执行回调', () => {
    let mounted = false
    const Comp = (_props: {}, _ctx: WfuiContext) => {
      onMount(() => { mounted = true })
      return jsx('div', { id: 'test-mount' })
    }

    setCtx(mockCtx)
    const node = jsx(Comp, {})
    setCtx(null)

    // 挂载前尚未执行
    assert.equal(mounted, false)

    // 挂载到 DOM
    const root = document.getElementById('root')!
    root.appendChild(node)

    // MutationObserver 需要时间触发（在下一帧/tick）
    // 不过在我们的测试环境中，append 可能立即触发 MutationObserver
    // 我们等待一个微任务
    return new Promise<void>(resolve => {
      setTimeout(() => {
        assert.equal(mounted, true)
        // 清理
        root.innerHTML = ''
        resolve()
      }, 10)
    })
  })

  it('onMount 返回的清理函数在卸载时调用', () => {
    let cleaned = false
    const Comp = (_props: {}, _ctx: WfuiContext) => {
      onMount(() => {
        return () => { cleaned = true }
      })
      return jsx('div', { id: 'test-cleanup' })
    }

    setCtx(mockCtx)
    const node = jsx(Comp, {})
    setCtx(null)

    const root = document.getElementById('root')!
    root.appendChild(node)

    return new Promise<void>(resolve => {
      setTimeout(() => {
        // 卸载
        root.innerHTML = ''
        setTimeout(() => {
          assert.equal(cleaned, true)
          resolve()
        }, 10)
      }, 10)
    })
  })
})

describe('onCleanup', () => {
  it('组件卸载时执行回调', () => {
    let cleanupCalled = false
    const Comp = (_props: {}, _ctx: WfuiContext) => {
      onCleanup(() => { cleanupCalled = true })
      return jsx('div', { id: 'test-oncleanup' })
    }

    setCtx(mockCtx)
    const node = jsx(Comp, {})
    setCtx(null)

    const root = document.getElementById('root')!
    root.appendChild(node)

    return new Promise<void>(resolve => {
      setTimeout(() => {
        // 卸载
        root.innerHTML = ''
        setTimeout(() => {
          assert.equal(cleanupCalled, true)
          resolve()
        }, 10)
      }, 10)
    })
  })
})

// ═════════════════════════════════════════════════════════════
// domMount
// ═════════════════════════════════════════════════════════════

describe('domMount', () => {
  it('将节点渲染到 DOM 容器', () => {
    const root = document.getElementById('root')!
    root.innerHTML = ''

    const app = jsx('div', { class: 'app' }, 'hello')
    domMount('#root', app)

    const child = root.firstElementChild
    assert.ok(child instanceof HTMLDivElement)
    assert.equal(child.className, 'app')
    assert.equal(child.textContent, 'hello')

    root.innerHTML = ''
  })

  it('目标不存在时抛出异常', () => {
    assert.throws(() => domMount('#nonexistent', document.createTextNode('')))
  })
})

// ═════════════════════════════════════════════════════════════
// createPortal
// ═════════════════════════════════════════════════════════════

describe('createPortal', () => {
  it('将节点渲染到指定目标', () => {
    const root = document.getElementById('root')!
    root.innerHTML = ''

    const portalTarget = document.createElement('div')
    portalTarget.id = 'portal-target'
    document.body.appendChild(portalTarget)

    const node = createPortal(jsx('span', { class: 'portal-child' }, 'hello'), portalTarget)

    assert.equal(portalTarget.children.length, 1)
    assert.equal(portalTarget.firstElementChild?.className, 'portal-child')
    assert.equal(portalTarget.firstElementChild?.textContent, 'hello')

    // 返回空 fragment
    assert.ok(node instanceof DocumentFragment)
    assert.equal(node.children.length, 0)

    document.body.removeChild(portalTarget)
  })
})

// ═════════════════════════════════════════════════════════════
// wrap
// ═════════════════════════════════════════════════════════════

describe('wrap', () => {
  it('创建包裹组件并执行 setup', () => {
    let setupCalled = false
    const Wrapped = wrap('div', (el, _props: { label: string }, _ctx) => {
      setupCalled = true
      el.textContent = _props.label
    })

    setCtx(mockCtx)
    const node = jsx(Wrapped, { label: 'hello wrap' })
    setCtx(null)

    assert.equal(setupCalled, false) // setup 在挂载时执行，尚未挂载
    assert.ok(node instanceof HTMLDivElement)

    // 挂载到 DOM 触发 setup
    const root = document.getElementById('root')!
    root.appendChild(node)

    return new Promise<void>(resolve => {
      setTimeout(() => {
        assert.equal(setupCalled, true)
        assert.equal(node.textContent, 'hello wrap')
        root.innerHTML = ''
        resolve()
      }, 10)
    })
  })

  it('setup 返回的 cleanup 在卸载时调用', () => {
    let cleaned = false
    const Wrapped = wrap('div', (_el, _props: {}, _ctx) => {
      return () => { cleaned = true }
    })

    setCtx(mockCtx)
    const node = jsx(Wrapped, {})
    setCtx(null)

    const root = document.getElementById('root')!
    root.appendChild(node)

    return new Promise<void>(resolve => {
      setTimeout(() => {
        root.innerHTML = '' // 触发卸载
        setTimeout(() => {
          assert.equal(cleaned, true)
          resolve()
        }, 10)
      }, 10)
    })
  })
})

// ═════════════════════════════════════════════════════════════
// setCtx / getCtx
// ═════════════════════════════════════════════════════════════

describe('setCtx / getCtx', () => {
  it('设置和读取当前上下文', () => {
    assert.equal(getCtx(), null) // 尚未设置

    setCtx(mockCtx)
    assert.equal(getCtx(), mockCtx)

    setCtx(null)
    assert.equal(getCtx(), null)
  })

  it('组件渲染时接收 ctx', () => {
    let capturedCtx: any = null
    const Comp = (_props: {}, ctx: WfuiContext) => {
      capturedCtx = ctx
      return jsx('div', {})
    }

    setCtx(mockCtx)
    jsx(Comp, {})
    setCtx(null)

    assert.equal(capturedCtx, mockCtx)
  })
})
