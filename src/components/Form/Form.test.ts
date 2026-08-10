import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Form, validateValues } from './Form.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true } } as any
}

/** 创建模拟 form 的 target，返回 FormData 友好的对象 */
function mockForm(values: Record<string, string>): HTMLFormElement {
  const entries = Object.entries(values)
  return {
    querySelector: () => null,
    querySelectorAll: () => [],
    // FormData 兼容：每次调用 entries 返回当前快照
  } as any
}

/** 创建模拟提交事件 */
function mockSubmitEvent(form: any): Event {
  return { preventDefault: () => {}, target: form } as any
}

describe('validateValues', () => {
  it('passes when no rules', async () => {
    const errors = await validateValues({ email: 'a@b.com' }, {})
    assert.deepEqual(errors, {})
  })

  it('detects required field', async () => {
    const errors = await validateValues({ email: '' }, {
      email: [{ required: true, message: '必填' }],
    })
    assert.deepEqual(errors, { email: '必填' })
  })

  it('detects required field with whitespace', async () => {
    const errors = await validateValues({ email: '   ' }, {
      email: [{ required: true, message: '必填' }],
    })
    assert.deepEqual(errors, { email: '必填' })
  })

  it('passes required when value present', async () => {
    const errors = await validateValues({ email: 'a@b.com' }, {
      email: [{ required: true, message: '必填' }],
    })
    assert.deepEqual(errors, {})
  })

  it('validates pattern', async () => {
    const errors = await validateValues({ email: 'abc' }, {
      email: [{ pattern: /@/, message: '格式错误' }],
    })
    assert.deepEqual(errors, { email: '格式错误' })
  })

  it('passes pattern when it matches', async () => {
    const errors = await validateValues({ email: 'a@b.com' }, {
      email: [{ pattern: /@/, message: '格式错误' }],
    })
    assert.deepEqual(errors, {})
  })

  it('validates minLength', async () => {
    const errors = await validateValues({ pass: 'abc' }, {
      pass: [{ minLength: 6, message: '太短' }],
    })
    assert.deepEqual(errors, { pass: '太短' })
  })

  it('validates maxLength', async () => {
    const errors = await validateValues({ name: 'a'.repeat(20) }, {
      name: [{ maxLength: 10, message: '太长' }],
    })
    assert.deepEqual(errors, { name: '太长' })
  })

  it('validates custom validator returning false', async () => {
    const errors = await validateValues({ code: '13' }, {
      code: [{ validator: (v: string) => v === '42', message: '答案错误' }],
    })
    assert.deepEqual(errors, { code: '答案错误' })
  })

  it('passes custom validator returning true', async () => {
    const errors = await validateValues({ code: '42' }, {
      code: [{ validator: (v: string) => v === '42', message: '答案错误' }],
    })
    assert.deepEqual(errors, {})
  })

  it('uses custom validator string return as error message', async () => {
    const errors = await validateValues({ code: '13' }, {
      code: [{ validator: (v: string) => '必须是42', message: '答案错误' }],
    })
    assert.deepEqual(errors, { code: '必须是42' })
  })

  it('supports async validator', async () => {
    const errors = await validateValues({ user: 'taken' }, {
      user: [{ validator: async (v: string) => v !== 'taken', message: '已被占用' }],
    })
    assert.deepEqual(errors, { user: '已被占用' })
  })

  it('stops at first error for a field', async () => {
    const errors = await validateValues({ email: '' }, {
      email: [
        { required: true, message: '必填' },
        { pattern: /@/, message: '格式错误' }, // 不应执行
      ],
    })
    assert.deepEqual(errors, { email: '必填' })
  })

  it('validates multiple fields', async () => {
    const errors = await validateValues({ email: '', pass: 'abc' }, {
      email: [{ required: true, message: '必填' }],
      pass: [{ minLength: 6, message: '太短' }],
    })
    assert.deepEqual(errors, { email: '必填', pass: '太短' })
  })

  it('handles undefined values as empty string', async () => {
    const errors = await validateValues({}, {
      name: [{ required: true, message: '必填' }],
    })
    assert.deepEqual(errors, { name: '必填' })
  })
})

describe('Form', () => {
  it('renders a form element', () => {
    const vnode = renderVNode(Form, { children: '内容' }, mockCtx())!
    assert.equal(vnode.type, 'form')
    assert.match(vnode.props.class, /wf-form/)
  })

  it('renders children', () => {
    const vnode = renderVNode(Form, { children: '表单字段' }, mockCtx())!
    assert.equal(vnode.props.children, '表单字段')
  })

  it('sets noValidate when validation is provided', () => {
    const vnode = renderVNode(Form, {
      validation: { email: [{ required: true, message: '必填' }] },
    }, mockCtx())!
    assert.equal(vnode.props.noValidate, true)
  })

  it('does not set noValidate without validation', () => {
    const vnode = renderVNode(Form, {}, mockCtx())!
    assert.equal(vnode.props.noValidate, undefined)
  })
})
