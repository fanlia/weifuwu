/**
 * weifuwu/client useForm — 表单状态管理测试
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

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

const { useForm } = await import('../../client/form.ts')
const { signal, effect } = await import('../../client/signal.ts')

describe('useForm', () => {
  it('values 初始值与 options.initial 一致', () => {
    const form = useForm({ initial: { name: 'Alice', age: 30 } })
    assert.equal(form.values.value.name, 'Alice')
    assert.equal(form.values.value.age, 30)
  })

  it('field() 返回当前值和 onInput 回调', () => {
    const form = useForm({ initial: { email: '' } })
    const f = form.field('email')
    assert.equal(f.value, '')
    assert.equal(typeof f.onInput, 'function')
  })

  it('field().onInput 更新 values', () => {
    const form = useForm({ initial: { name: '' } })
    const input = document.createElement('input')
    input.value = 'Bob'
    form.field('name').onInput({ target: input } as any)
    assert.equal(form.values.value.name, 'Bob')
  })

  it('setValue 更新指定字段', () => {
    const form = useForm({ initial: { a: 1, b: 2 } })
    form.setValue('a', 100)
    assert.equal(form.values.value.a, 100)
    assert.equal(form.values.value.b, 2) // 其他字段不变
  })

  it('reset 恢复初始值并清空错误/触碰状态', () => {
    const form = useForm({
      initial: { name: '' },
      validate: { name: (v) => !v ? '必填' : null },
    })
    form.setValue('name', 'test')
    form.handleSubmit(new Event('submit'))
    assert.equal(form.touched.value.name, true)
    assert.equal(form.errors.value.name, null) // 有值所以无错误

    // 改回空值触发验证
    form.setValue('name', '')
    form.handleSubmit(new Event('submit'))
    assert.equal(form.errors.value.name, '必填')

    form.reset()
    assert.equal(form.values.value.name, '')
    assert.deepEqual(form.errors.value, {})
    assert.deepEqual(form.touched.value, {})
    assert.equal(form.submitting.value, false)
  })

  it('validateAll 返回是否有错误', () => {
    const form = useForm({
      initial: { name: '' },
      validate: { name: (v) => !v ? '必填' : null },
    })
    assert.equal(form.validateAll(), false)
    assert.equal(form.errors.value.name, '必填')

    form.setValue('name', 'Alice')
    assert.equal(form.validateAll(), true)
    assert.equal(form.errors.value.name, null)
  })

  describe('validation', () => {
    it('单个 validator', () => {
      const form = useForm({
        initial: { v: '' },
        validate: { v: (x: string) => x.length < 3 ? '太短' : null },
      })
      form.validateAll()
      assert.equal(form.errors.value.v, '太短')

      form.setValue('v', 'abc')
      form.validateAll()
      assert.equal(form.errors.value.v, null)
    })

    it('多个 validators 按顺序执行', () => {
      const form = useForm({
        initial: { pw: '' },
        validate: {
          pw: [
            (v: string) => v.length < 3 ? '太短' : null,
            (v: string) => !/[A-Z]/.test(v) ? '需要大写' : null,
          ],
        },
      })
      form.setValue('pw', 'ab')
      form.validateAll()
      assert.equal(form.errors.value.pw, '太短') // 第一个 validator 失败

      form.setValue('pw', 'abc')
      form.validateAll()
      assert.equal(form.errors.value.pw, '需要大写') // 第一个通过，第二个失败

      form.setValue('pw', 'Abc')
      form.validateAll()
      assert.equal(form.errors.value.pw, null) // 全部通过
    })
  })

  describe('submit', () => {
    it('handleSubmit 调用 preventDefault', () => {
      const form = useForm({ initial: { x: '' } })
      let prevented = false
      const ev = new Event('submit')
      ev.preventDefault = () => { prevented = true }
      form.handleSubmit(ev)
      assert.ok(prevented)
    })

    it('提交前自动验证所有字段', () => {
      let submitted = false
      const form = useForm({
        initial: { name: '' },
        validate: { name: (v) => !v ? '必填' : null },
        onSubmit: () => { submitted = true },
      })
      form.handleSubmit(new Event('submit'))
      assert.equal(submitted, false, '验证失败不应提交')
      assert.equal(form.errors.value.name, '必填')
    })

    it('标记所有字段为已触碰', () => {
      const form = useForm({ initial: { a: '', b: '' } })
      form.handleSubmit(new Event('submit'))
      assert.equal(form.touched.value.a, true)
      assert.equal(form.touched.value.b, true)
    })

    it('触碰后字段输入时实时验证', () => {
      const form = useForm({
        initial: { name: '' },
        validate: { name: (v) => !v ? '必填' : null },
      })
      // 先触碰
      form.handleSubmit(new Event('submit'))
      assert.equal(form.errors.value.name, '必填')

      // 触碰后输入 → 实时验证
      const input = document.createElement('input')
      input.value = 'Alice'
      form.field('name').onInput({ target: input } as any)
      assert.equal(form.errors.value.name, null, '触碰后有效值应清除错误')
    })

    it('异步 onSubmit 时 submitting 状态正确变化', async () => {
      let resolve!: () => void
      const submitPromise = new Promise<void>(r => { resolve = r })
      const form = useForm({
        initial: { x: 'ok' },
        onSubmit: () => submitPromise,
      })
      form.handleSubmit(new Event('submit'))
      assert.equal(form.submitting.value, true, '提交中 submitting 应为 true')

      resolve()
      await submitPromise
      assert.equal(form.submitting.value, false, '完成后 submitting 应为 false')
    })
  })
})
