import { describe, it } from 'node:test'
import assert from 'node:assert'
import { renderVNode, findByClass, createTestCtx } from '../../ui-dom/testing.ts'
import { MarkdownEditor } from './MarkdownEditor.ts'

it('MarkdownEditor：分屏渲染（编辑 + 预览）', async () => {
  const vnode: any = await renderVNode(MarkdownEditor, { value: '# 标题', onChange: () => {} }, createTestCtx())
  assert.ok(findByClass(vnode, 'wf-md-editor').length, '根类存在')
  const textarea = findByClass(vnode, 'wf-md-editor-textarea')[0] as any
  assert.ok(textarea, 'textarea 存在')
  assert.equal(textarea.props.value, '# 标题', '受控 value')
  assert.ok(typeof textarea.props.onInput === 'function', 'onInput 存在')
})

it('MarkdownEditor：preview 模式渲染 Markdown', async () => {
  const vnode: any = await renderVNode(MarkdownEditor, { value: '# 标题\n\n正文', mode: 'preview', onChange: () => {} }, createTestCtx())
  assert.ok(findByClass(vnode, 'wf-md-editor-preview').length, '预览区存在')
})

it('MarkdownEditor：受控缺 onChange warn（防静默失效）', async () => {
  const warns: string[] = []
  const ow = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  try {
    await renderVNode(MarkdownEditor, { value: 'x' }, createTestCtx())
  } finally { console.warn = ow }
  assert.ok(warns.some((w) => w.includes('MarkdownEditor')), '受控 warn 触发')
})
