import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JsonSchemaForm, type JsonSchema } from './JsonSchemaForm.ts'
import { Field } from '../Field/Field.ts'
import { Input } from '../Input/Input.ts'
import { InputNumber } from '../InputNumber/InputNumber.ts'
import { Select } from '../Select/Select.ts'
import { Switch } from '../Switch/Switch.ts'
import { renderVNode, mountComponent, findByClass, findVNode, createTestCtx } from '../../ui-dom/testing.ts'

const ofType = (v: any, T: any) => {
  const out: any[] = []
  findVNode(v, (n: any) => { if (n?.type === T) out.push(n); return false })
  return out
}
const fieldErr = (v: any) => ofType(v, Field).filter((f: any) => !!f.props.error)

const schema: JsonSchema = {
  type: 'object',
  title: '查询参数',
  properties: {
    city: { type: 'string', title: '城市' },
    days: { type: 'integer', title: '天数', minimum: 1, maximum: 30 },
    with_weather: { type: 'boolean', title: '含天气' },
    unit: { type: 'string', enum: ['celsius', 'fahrenheit'], title: '单位' },
  },
  required: ['city'],
}

describe('JsonSchemaForm', () => {
  it('对象 schema → 各类型控件渲染', async () => {
    const v = await renderVNode(JsonSchemaForm, { schema }, createTestCtx())!
    assert.equal(ofType(v, Input).length, 1, 'string → Input')
    assert.equal(ofType(v, InputNumber).length, 1, 'integer → InputNumber')
    assert.equal(ofType(v, Switch).length, 1, 'boolean → Switch')
    const selects = ofType(v, Select)
    assert.equal(selects.length, 1, 'enum → Select')
    assert.deepEqual(selects[0].props.options, [
      { value: 'celsius', label: 'celsius' },
      { value: 'fahrenheit', label: 'fahrenheit' },
    ])
    // required 星号传给 Field
    const cityField = ofType(v, Field).find((f: any) => f.props.label === '城市')
    assert.equal(cityField.props.required, true)
  })

  it('required 校验：缺值提交 → 错误展示 + onSubmit 不触发', async () => {
    let submitted: any = null
    const render = await mountComponent(JsonSchemaForm, { schema, onSubmit: (vals: any) => { submitted = vals } }, createTestCtx())
    const v = render()
    const btn = findByClass(v, 'wf-jsf-submit')[0]
    assert.ok(btn, '提交按钮')
    btn.props.onClick()
    assert.equal(submitted, null, '校验失败不提交')
    assert.ok(fieldErr(v).length >= 1, '错误展示')
  })

  it('编辑 string 字段 → onChange 通知 + 值更新', async () => {
    let changed: any = null
    const render = await mountComponent(JsonSchemaForm, { schema, onChange: (v2: any) => { changed = v2 } }, createTestCtx())
    let v = render()
    const input = ofType(v, Input)[0]
    input.props.onInput({ target: { value: '北京' } })
    assert.ok(changed, 'onChange 触发')
    assert.equal(changed.city, '北京')
    v = render() // 内部状态回流 → 输入框回显
    assert.equal(ofType(v, Input)[0].props.value, '北京')
  })

  it('校验通过 → onSubmit 触发', async () => {
    let submitted: any = null
    const v = await renderVNode(JsonSchemaForm, {
      schema, value: { city: '北京', days: 7 },
      onSubmit: (vals: any) => { submitted = vals },
    }, createTestCtx())!
    findByClass(v, 'wf-jsf-submit')[0].props.onClick()
    assert.ok(submitted)
    assert.equal(submitted.city, '北京')
  })

  it('嵌套 object 递归渲染', async () => {
    const nested: JsonSchema = {
      type: 'object',
      properties: {
        loc: {
          type: 'object', title: '位置',
          properties: { lat: { type: 'number', title: '纬度' }, lng: { type: 'number', title: '经度' } },
        },
      },
    }
    const v = await renderVNode(JsonSchemaForm, { schema: nested }, createTestCtx())!
    assert.ok(findByClass(v, 'wf-jsf-obj').length >= 1, '嵌套容器')
    assert.equal(ofType(v, InputNumber).length, 2, '嵌套字段递归')
  })

  it('array 字段：添加/删除项', async () => {
    const arrSchema: JsonSchema = {
      type: 'object',
      properties: { tags: { type: 'array', title: '标签', items: { type: 'string' } } },
    }
    let changed: any = null
    const render = await mountComponent(JsonSchemaForm, { schema: arrSchema, onChange: (v2: any) => { changed = v2 } }, createTestCtx())
    let v = render()
    assert.equal(findByClass(v, 'wf-jsf-arr-item').length, 0, '初始空数组')
    findByClass(v, 'wf-jsf-arr-add')[0].props.onClick() // 添加
    assert.ok(changed && Array.isArray(changed.tags) && changed.tags.length === 1, '添加一项')
    v = render()
    assert.equal(findByClass(v, 'wf-jsf-arr-item').length, 1)
    findByClass(v, 'wf-jsf-arr-del')[0].props.onClick() // 删除
    assert.ok(changed && changed.tags.length === 0, '删除后空')
  })

  it('number 字段 min/max 校验', async () => {
    let submitted: any = null
    const v = await renderVNode(JsonSchemaForm, {
      schema, value: { city: '北京', days: 99 },
      onSubmit: (vals: any) => { submitted = vals },
    }, createTestCtx())!
    findByClass(v, 'wf-jsf-submit')[0].props.onClick()
    assert.equal(submitted, null, '超出 maximum 不提交')
    assert.ok(fieldErr(v).length >= 1)
  })

  it('不支持的 schema 项 → console.warn 降级为输入框', async () => {
    const warns: string[] = []
    const orig = console.warn
    console.warn = (...a: any[]) => { warns.push(a.join(' ')) }
    try {
      const v = await renderVNode(JsonSchemaForm, {
        schema: { type: 'object', properties: { x: { type: 'null' }, y: { $ref: '#/defs/a' } } },
      }, createTestCtx())!
      // 降级：仍渲染 Input（文本输入逃生舱），不崩
      assert.ok(ofType(v, Input).length >= 1)
      assert.ok(warns.length >= 2, `应有 unsupported 告警，实际 ${warns.join('; ')}`)
      assert.ok(warns.some((w) => w.includes('x')))
      assert.ok(warns.some((w) => w.includes('y')))
    } finally {
      console.warn = orig
    }
  })
})
