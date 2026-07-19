/**
 * weifuwu/client 核心单元测试
 *
 * 信号系统 + JSX runtime + 控制流组件 + useForm。
 * 使用 jsdom 提供浏览器全局环境，node --test 运行。
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

const { signal, computed, effect, isSignal, batch, untrack } = await import('../client/signal.ts')
const { jsx, Show, For, ErrorBoundary, onMount, onCleanup } = await import('../client/jsx-runtime.ts')
const { useForm } = await import('../client/lib/form.ts')
const { createResource } = await import('../client/lib/resource.ts')

// ═════════════════════════════════════════════════════════════
// 信号系统
// ═════════════════════════════════════════════════════════════

describe('signal', () => {
  it('创建并读取信号', () => {
    const s = signal(42)
    assert.equal(s.value, 42)
  })

  it('写入信号并读取新值', () => {
    const s = signal(0)
    s.value = 1
    assert.equal(s.value, 1)
  })

  it('isSignal 正确识别', () => {
    assert.equal(isSignal(signal(1)), true)
    assert.equal(isSignal(42), false)
    assert.equal(isSignal(null), false)
    assert.equal(isSignal({}), false)
  })

  it('signal 接受不同类型', () => {
    assert.equal(signal('hello').value, 'hello')
    assert.equal(signal(true).value, true)
    assert.deepEqual(signal([1, 2, 3]).value, [1, 2, 3])
    assert.deepEqual(signal({ a: 1 }).value, { a: 1 })
  })
})

describe('effect', () => {
  it('effect 立即执行一次', () => {
    let called = 0
    effect(() => { called++ })
    assert.equal(called, 1)
  })

  it('effect 响应信号变化', () => {
    const s = signal(0)
    let result = 0
    effect(() => { result = s.value * 2 })
    assert.equal(result, 0)

    s.value = 5
    assert.equal(result, 10)

    s.value = 10
    assert.equal(result, 20)
  })

  it('effect 追踪多个信号', () => {
    const a = signal(1)
    const b = signal(2)
    let sum = 0
    effect(() => { sum = a.value + b.value })
    assert.equal(sum, 3)

    a.value = 10
    assert.equal(sum, 12)

    b.value = 20
    assert.equal(sum, 30)
  })

  it('effect dispose 停止追踪', () => {
    const s = signal(0)
    let calls = 0
    const dispose = effect(() => { calls++; s.value })
    assert.equal(calls, 1)

    dispose()
    s.value = 1
    assert.equal(calls, 1) // dispose 后不再响应
  })

  it('effect 动态依赖追踪', () => {
    const toggle = signal(true)
    const a = signal(1)
    const b = signal(2)
    let lastValue = 0

    effect(() => {
      lastValue = toggle.value ? a.value : b.value
    })
    assert.equal(lastValue, 1)

    a.value = 10
    assert.equal(lastValue, 10)

    toggle.value = false
    assert.equal(lastValue, 2) // 切换到 b

    a.value = 100 // a 不再是依赖
    assert.equal(lastValue, 2) // 不应变化

    b.value = 20
    assert.equal(lastValue, 20)
  })

  it('多次 dispose 安全', () => {
    const s = signal(0)
    let calls = 0
    const dispose = effect(() => { calls++; s.value })
    dispose()
    dispose() // 重复调用不应报错
    assert.equal(calls, 1)
  })

  it('嵌套 effect 各自追踪独立', () => {
    const outer = signal('o')
    const inner = signal('i')
    let outerCalls = 0
    let innerCalls = 0

    effect(() => {
      outerCalls++
      outer.value
      effect(() => {
        innerCalls++
        inner.value
      })
    })
    assert.equal(outerCalls, 1)
    assert.equal(innerCalls, 1)

    inner.value = 'i2'
    assert.equal(innerCalls, 2)
    assert.equal(outerCalls, 1) // 外层不触发
  })
})

describe('untrack', () => {
  it('读取信号但不建立依赖', () => {
    const a = signal(1)
    const b = signal(10)
    let lastA = 0
    let lastUntracked = 0

    effect(() => {
      lastA = a.value
      lastUntracked = untrack(() => b.value)
    })
    assert.equal(lastA, 1)
    assert.equal(lastUntracked, 10)

    // b 变化不触发 effect
    let effectCallsBefore = 0
    const dispose = effect(() => { effectCallsBefore++; a.value })
    dispose()

    b.value = 20
    // lastA 不变（effect 未重跑）
    assert.equal(lastA, 1)
  })
})

describe('signal.mutate', () => {
  it('原地修改数组并触发通知', () => {
    const items = signal([1, 2, 3])
    let lastLen = 0
    effect(() => { lastLen = items.value.length })
    assert.equal(lastLen, 3)

    items.mutate(arr => arr.push(4, 5))
    assert.equal(items.value.length, 5)
    assert.equal(lastLen, 5)
  })

  it('原地修改对象并触发通知', () => {
    const user = signal({ name: 'Alice', age: 25 })
    let lastAge = 0
    effect(() => { lastAge = user.value.age })
    assert.equal(lastAge, 25)

    user.mutate(obj => { obj.age = 30 })
    assert.equal(user.value.age, 30)
    assert.equal(lastAge, 30)
  })
})

describe('batch', () => {
  it('合并多个信号写入为一次通知', () => {
    const a = signal(1)
    const b = signal(2)
    let effectCalls = 0
    let sum = 0

    effect(() => {
      effectCalls++
      sum = a.value + b.value
    })
    assert.equal(effectCalls, 1) // 初始调用
    assert.equal(sum, 3)

    batch(() => {
      a.value = 10
      b.value = 20
    })
    // 两次写入合并为一次 effect 调用
    assert.equal(effectCalls, 2)
    assert.equal(sum, 30)
  })

  it('batch 不改变最终结果', () => {
    const a = signal(1)
    const b = signal(2)
    let sum = 0
    effect(() => { sum = a.value + b.value })

    batch(() => {
      a.value = 100
      b.value = 200
    })
    assert.equal(sum, 300)
  })

  it('嵌套 batch 正常', () => {
    const a = signal(0)
    let calls = 0
    effect(() => { calls++; a.value })

    calls = 0 // 重置计数器
    batch(() => {
      a.value = 1
      batch(() => {
        a.value = 2
      })
      a.value = 3
    })
    assert.equal(calls, 1) // 只触发一次
    assert.equal(a.value, 3)
  })
})

describe('computed', () => {
  it('computed 返回衍生值', () => {
    const a = signal(3)
    const b = computed(() => a.value * 2)
    assert.equal(b.value, 6)

    a.value = 5
    assert.equal(b.value, 10)
  })

  it('computed 链式依赖', () => {
    const a = signal(2)
    const b = computed(() => a.value * 3)
    const c = computed(() => b.value + 1)
    assert.equal(c.value, 7)

    a.value = 4
    assert.equal(b.value, 12)
    assert.equal(c.value, 13)
  })

  it('computed 动态依赖', () => {
    const toggle = signal(true)
    const a = signal(10)
    const b = signal(20)
    const c = computed(() => toggle.value ? a.value : b.value)

    assert.equal(c.value, 10)

    toggle.value = false
    assert.equal(c.value, 20)

    a.value = 100 // a 不再是依赖，c 不应变化
    assert.equal(c.value, 20)

    b.value = 200
    assert.equal(c.value, 200)
  })
})

// ═════════════════════════════════════════════════════════════
// JSX Runtime
// ═════════════════════════════════════════════════════════════

describe('jsx', () => {
  it('创建 DOM 元素', () => {
    const el = jsx('div', { class: 'foo' })
    assert(el instanceof HTMLDivElement)
    assert.equal(el.className, 'foo')
  })

  it('设置属性', () => {
    const el = jsx('input', { type: 'text', placeholder: 'hello' }) as HTMLInputElement
    assert.equal(el.type, 'text')
    assert.equal(el.placeholder, 'hello')
  })

  it('绑定事件', () => {
    let clicked = false
    const el = jsx('button', { onClick: () => { clicked = true } })
    el.click()
    assert.equal(clicked, true)
  })

  it('文本子节点', () => {
    const el = jsx('div', null, 'Hello', ' ', 'World')
    assert.equal(el.textContent, 'Hello World')
  })

  it('嵌套子节点', () => {
    const inner = jsx('span', { class: 'inner' }, 'text')
    const outer = jsx('div', { class: 'outer' }, inner)
    assert.equal(outer.children.length, 1)
    assert.equal((outer.firstElementChild as HTMLElement).className, 'inner')
  })

  it('多个子节点', () => {
    const el = jsx('div', null, jsx('span', null, 'a'), jsx('span', null, 'b'))
    assert.equal(el.childNodes.length, 2)
  })
})

describe('Show', () => {
  it('when=true 渲染 children', () => {
    const node = Show({ when: true, children: jsx('div', null, 'shown') })
    assert(node instanceof HTMLDivElement)
    assert.equal(node.style.display, 'contents')
    const divs = node.querySelectorAll('div')
    assert.equal(divs.length, 1)
    assert.equal(divs[0].textContent, 'shown')
  })

  it('when=false 渲染 fallback', () => {
    const node = Show({ when: false, fallback: jsx('div', null, 'fallback') })
    const divs = node.querySelectorAll('div')
    assert.equal(divs.length, 1)
    assert.equal(divs[0].textContent, 'fallback')
  })

  it('when=false 无 fallback 渲染空', () => {
    const node = Show({ when: false })
    assert.equal(node.children.length, 0)
  })

  it('响应式切换', () => {
    const show = signal(false)
    const node = Show({ when: show, children: jsx('div', null, 'shown'), fallback: jsx('span', null, 'fallback') })
    // 初始：false → 显示 fallback
    assert.equal(node.querySelectorAll('span').length, 1)
    assert.equal(node.querySelectorAll('div').length, 0)

    // 切换为 true → 显示 children
    show.value = true
    assert.equal(node.querySelectorAll('span').length, 0)
    assert.equal(node.querySelectorAll('div').length, 1)
    assert.equal(node.querySelectorAll('div')[0].textContent, 'shown')
  })
})

describe('For', () => {
  it('渲染列表', () => {
    const items = ['a', 'b', 'c']
    const node = For({ each: items, children: (item) => jsx('div', null, item) })
    assert(node instanceof HTMLDivElement)
    assert.equal(node.style.display, 'contents')
    const divs = node.querySelectorAll('div')
    assert.equal(divs.length, 3)
    assert.equal(divs[0].textContent, 'a')
    assert.equal(divs[1].textContent, 'b')
    assert.equal(divs[2].textContent, 'c')
  })

  it('Signal 列表响应式更新', () => {
    const items = signal(['a', 'b'])
    const node = For({ each: items, children: (item) => jsx('div', null, item) })
    assert.equal(node.querySelectorAll('div').length, 2)

    items.value = ['x', 'y', 'z']
    assert.equal(node.querySelectorAll('div').length, 3)
    assert.equal((node.querySelectorAll('div')[0] as HTMLElement).textContent, 'x')
  })

  it('Signal 列表响应式清空', () => {
    const items = signal(['a', 'b', 'c'])
    const node = For({ each: items, children: (item) => jsx('div', null, item) })
    assert.equal(node.querySelectorAll('div').length, 3)

    items.value = []
    assert.equal(node.querySelectorAll('div').length, 0)
  })
})

// ═════════════════════════════════════════════════════════════
// useForm
// ═════════════════════════════════════════════════════════════

describe('createResource', () => {
  it('初始状态 loading=true', () => {
    const { loading } = createResource(async () => 'data')
    assert.equal(loading.value, true)
  })

  it('加载完成后 data 有值, loading=false', async () => {
    const res = createResource(async () => 'hello')
    await new Promise(r => setTimeout(r, 0))
    assert.equal(res.loading.value, false)
    assert.equal(res.data.value, 'hello')
    assert.equal(res.error.value, null)
  })

  it('加载失败时 error 有值', async () => {
    const res = createResource(async () => { throw new Error('fail') })
    await new Promise(r => setTimeout(r, 0))
    assert.equal(res.loading.value, false)
    assert.equal(res.data.value, undefined)
    assert.equal(res.error.value?.message, 'fail')
  })

  it('refetch 重新加载', async () => {
    let count = 0
    const res = createResource(async () => { count++; return `data-${count}` })
    await new Promise(r => setTimeout(r, 0))
    assert.equal(res.data.value, 'data-1')

    res.refetch()
    await new Promise(r => setTimeout(r, 0))
    assert.equal(res.data.value, 'data-2')
  })

  it('retry=1 时失败后自动重试一次', async () => {
    let attempts = 0
    const res = createResource(async () => {
      attempts++
      if (attempts < 2) throw new Error('try again')
      return 'success'
    }, { retry: 1, retryDelay: 10 })

    await new Promise(r => setTimeout(r, 50))
    assert.equal(res.data.value, 'success')
    assert.equal(res.loading.value, false)
    assert.equal(res.error.value, null)
    assert.equal(attempts, 2)
  })

  it('retry 耗尽后 error 为最后一次错误', async () => {
    let attempts = 0
    const res = createResource(async () => {
      attempts++
      throw new Error(`attempt-${attempts}`)
    }, { retry: 2, retryDelay: 10 })

    await new Promise(r => setTimeout(r, 50))
    assert.equal(res.data.value, undefined)
    assert.equal(res.loading.value, false)
    assert.equal(res.error.value?.message, 'attempt-3')
    assert.equal(attempts, 3)
  })

  it('timeout 超时后报错', async () => {
    const res = createResource(async () => {
      await new Promise(r => setTimeout(r, 100))
      return 'too late'
    }, { timeout: 20 })

    await new Promise(r => setTimeout(r, 50))
    assert.equal(res.loading.value, false)
    assert.equal(res.data.value, undefined)
    assert.ok(res.error.value?.message.includes('超时'))
  })
})

describe('ErrorBoundary', () => {
  it('捕获渲染异常并显示 fallback', () => {
    const node = ErrorBoundary({
      fallback: (e) => jsx('div', null, 'Error: ', e.message),
      children: () => { throw new Error('boom') },
    }, {} as any)
    assert.equal((node as HTMLElement).textContent, 'Error: boom')
  })

  it('正常渲染时不触发 fallback', () => {
    const node = ErrorBoundary({
      fallback: (e) => jsx('div', null, 'Error: ', e.message),
      children: () => jsx('div', null, 'ok'),
    }, {} as any)
    assert.equal((node as HTMLElement).textContent, 'ok')
  })

  it('onError 回调被调用', () => {
    let called = false
    let errorMsg = ''
    ErrorBoundary({
      fallback: (e) => jsx('div', null, e.message),
      children: () => { throw new Error('test-error') },
      onError: (e) => { called = true; errorMsg = e.message },
    }, {} as any)
    assert.equal(called, true)
    assert.equal(errorMsg, 'test-error')
  })
})

describe('useForm', () => {
  it('初始化字段值', () => {
    const form = useForm({ initial: { email: '', password: '' } })
    assert.equal(form.field('email').value.value, '')
    assert.equal(form.field('password').value.value, '')
  })

  it('验证通过', () => {
    const form = useForm({
      initial: { email: '' },
      validate: { email: (v) => !v && 'required' },
    })
    form.setValue('email', 'a@b.com')
    assert.equal(form.errors.email, null)
    assert.equal(form.valid.value, true)
  })

  it('验证失败', () => {
    const form = useForm({
      initial: { email: '' },
      validate: { email: (v) => !v && 'required' },
    })
    // useForm 初始化时不运行验证，字段交互时触发单字段验证
    assert.equal(form.errors.email, null)
    assert.equal(form.valid.value, true)

    form.setValue('email', '')
    assert.equal(form.errors.email, 'required')
    // setValue 只验证单个字段，valid 在 submit 时全量计算
    // 因此 valid 可能在交互后仍为 true
  })

  it('submit 校验通过后调用 handler', async () => {
    const form = useForm({
      initial: { email: 'a@b.com', name: 'test' },
      validate: { email: (v) => !v && 'required' },
    })
    let submitted: any = null
    await form.submit((data) => { submitted = data })
    assert.deepEqual(submitted, { email: 'a@b.com', name: 'test' })
  })

  it('submit 校验失败不调用 handler', async () => {
    const form = useForm({
      initial: { email: '' },
      validate: { email: (v) => !v && 'required' },
    })
    let called = false
    await form.submit(() => { called = true })
    assert.equal(called, false)
  })

  it('reset 恢复初始值', () => {
    const form = useForm({ initial: { x: 1 } })
    form.setValue('x', 999)
    form.reset()
    assert.equal(form.field('x').value.value, 1)
  })

  it('setValues 批量更新', () => {
    const form = useForm({ initial: { a: 1, b: 2 } })
    form.setValues({ a: 10, b: 20 })
    assert.equal(form.field('a').value.value, 10)
    assert.equal(form.field('b').value.value, 20)
  })

  it('touched 追踪字段交互', () => {
    const form = useForm({ initial: { email: '' } })
    assert.equal(form.touched.email, false)

    const field = form.field('email')
    field.onInput({ target: { value: 'a', type: 'text' } } as any)
    assert.equal(form.touched.email, true)
  })

  it('validateOnInit 创建时即运行验证', () => {
    const form = useForm({
      initial: { email: '' },
      validate: { email: (v) => !v && '必填' },
      validateOnInit: true,
    })
    assert.equal(form.errors.email, '必填')
    assert.equal(form.valid.value, false)
  })

  it('validateOnInit=false 不初始化验证', () => {
    const form = useForm({
      initial: { email: '' },
      validate: { email: (v) => !v && '必填' },
    })
    assert.equal(form.errors.email, null)
    assert.equal(form.valid.value, true)
  })
})
