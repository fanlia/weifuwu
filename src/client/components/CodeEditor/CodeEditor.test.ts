import { describe, it } from 'node:test'
import assert from 'node:assert'
import { renderVNode, findByClass, createTestCtx } from '../../ui-dom/testing.ts'
import { CodeEditor } from './CodeEditor.ts'

it('CodeEditor：行号 + 编辑区渲染', async () => {
  const vnode: any = await renderVNode(CodeEditor, { value: 'a\nb\nc', onChange: () => {} }, createTestCtx())
  assert.ok(findByClass(vnode, 'wf-codeeditor').length, '根类存在')
  assert.ok(findByClass(vnode, 'wf-codeeditor-gutter').length, '行号栏存在')
  const area = findByClass(vnode, 'wf-codeeditor-area')[0] as any
  assert.equal(area.props.value, 'a\nb\nc', '受控 value')
  assert.equal(area.props.rows, 10, '默认行数')
})

it('CodeEditor：Tab 插入空格（编辑器惯例）', async () => {
  let next = ''
  const vnode: any = await renderVNode(CodeEditor, { value: 'x', onChange: (v: string) => { next = v } }, createTestCtx())
  const area = findByClass(vnode, 'wf-codeeditor-area')[0] as any
  const ta = { selectionStart: 1, value: 'x' }
  area.props.onKeyDown({ key: 'Tab', preventDefault: () => {}, target: ta })
  assert.equal(next, 'x  ', 'Tab 插入两空格')
})

it('CodeEditor：readOnly 缺 onChange 不 warn', async () => {
  const warns: string[] = []
  const ow = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  try {
    await renderVNode(CodeEditor, { value: 'x', readOnly: true }, createTestCtx())
  } finally { console.warn = ow }
  assert.ok(!warns.some((w) => w.includes('CodeEditor')), 'readOnly 不 warn')
})
