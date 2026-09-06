/**
 * vdom 契约——useField（表单字段行为契约）
 *
 * 锁定（W5）：
 * - 无 label/error/hint → hasWrap false（裸输入——Input 先例）
 * - label → renderLabel（for 连接 · required 星）
 * - error → aria-invalid + aria-describedby 指向 err id + 错误态类
 * - hint → aria-describedby（error 时不渲染 hint——先例）
 * - aria-required（required 面）
 * - id 基（name 派生 wf-<name>；显式 id 优先）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useField } from '../../client/vdom/hooks/field.ts'

function env() { return { nextHookIndex: () => 0, getHookState: () => undefined, setHookState: () => {} } as any }

test('无 label/error/hint → hasWrap false（裸输入）', () => {
  const f = useField(env(), {})
  assert.equal(f.hasWrap, false)
  assert.equal(f.stateClass, '')
})

test('label → renderLabel（class 皮 · for 连接 name 派生 id）', () => {
  const f = useField(env(), { label: '用户名', required: true, name: 'username', labelClass: 'wf-input-label', reqClass: 'wf-input-req' })
  assert.equal(f.hasWrap, true)
  assert.equal(f.inputId, 'wf-username', 'id 派生')
  const label = f.renderLabel() as any
  assert.equal(label.type, 'label')
  assert.equal(label.props.class, 'wf-input-label')
  assert.equal(label.props.for, 'wf-username', 'for 连接')
  const kids = label.props.children as any[]
  assert.ok(kids[0] === '用户名')
  assert.equal(kids[1]?.type, 'span')
})

test('error → aria-invalid + aria-describedby 指向 err id + 状态类', () => {
  const f = useField(env(), { error: '格式错', name: 'email', errClass: 'wf-x-err', wrapErrClass: 'wf-x--err' })
  assert.equal(f.stateClass, ' wf-x--err')
  const p = f.inputProps()
  assert.equal(p['aria-invalid'], true)
  assert.equal(p['aria-describedby'], 'wf-email-err')
  const err = f.renderError() as any
  assert.equal(err.type, 'div')
  assert.equal(err.props.id, 'wf-email-err')
  assert.equal(err.props.children, '格式错')
})

test('hint → aria-describedby 指向 hint id · error 时不渲染 hint', () => {
  const f1 = useField(env(), { hint: '辅助', name: 'a' })
  assert.equal(f1.inputProps()['aria-describedby'], 'wf-a-hint')
  assert.ok(f1.renderHint())
  assert.equal(f1.renderError(), null)
  const f2 = useField(env(), { hint: '辅助', error: '错', name: 'a' })
  assert.equal(f2.renderHint(), null, 'error 时不渲染 hint')
  assert.equal(f2.inputProps()['aria-describedby'], 'wf-a-err')
})

test('required → aria-required', () => {
  const f = useField(env(), { required: true, name: 'pwd' })
  assert.equal(f.inputProps()['aria-required'], true)
})

test('显式 id 优先（name 派生让位）', () => {
  const f = useField(env(), { id: 'custom-id', name: 'ignored' })
  assert.equal(f.inputId, 'custom-id')
})
