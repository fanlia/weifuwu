import { describe, it } from 'node:test'
import assert from 'node:assert'
import { FileUpload } from './FileUpload.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    useDragDrop: () => ({ dropProps: {} }),
  } } as any
}

describe('FileUpload', () => {
  it('renders drop zone with default text', () => {
    const vnode = renderVNode(FileUpload, {}, mockCtx())!
    const dropZone = vnode.props.children[1]
    const text = dropZone.props.children.props.children[1].props.children
    assert.match(text, /上传/)
  })

  it('renders custom children instead of default', () => {
    const vnode = renderVNode(FileUpload, { children: '自定义区域' }, mockCtx())!
    const dropZone = vnode.props.children[1]
    assert.equal(dropZone.props.children, '自定义区域')
  })

  it('renders disabled class when disabled', () => {
    const vnode = renderVNode(FileUpload, { disabled: true }, mockCtx())!
    const dropZone = vnode.props.children[1]
    assert.match(dropZone.props.class, /wf-upload-zone--disabled/)
  })

  it('renders error class and message when error', () => {
    const vnode = renderVNode(FileUpload, { error: '文件太大' }, mockCtx())!
    const children = vnode.props.children
    assert.match(children[1].props.class, /wf-upload-zone--err/)
    const errEl = children[children.length - 1]
    assert.equal(errEl.props.class, 'wf-upload-err')
    assert.equal(errEl.props.children, '文件太大')
  })

  it('renders file list when value provided', () => {
    const file = new File(['test'], 'readme.txt', { type: 'text/plain' })
    const vnode = renderVNode(FileUpload, { value: [file] }, mockCtx())!
    const list = vnode.props.children[2]
    assert.equal(list.type, 'ul')
    assert.match(list.props.class, /wf-upload-list/)
  })

  it('renders hint text when provided', () => {
    const vnode = renderVNode(FileUpload, { hint: '支持图片格式' }, mockCtx())!
    const children = vnode.props.children
    const hint = children[children.length - 1]
    assert.equal(hint.props.class, 'wf-upload-hint')
    assert.equal(hint.props.children, '支持图片格式')
  })

  it('renders accept and maxSize hints', () => {
    const vnode = renderVNode(FileUpload, { accept: 'image/*', maxSize: 1024 * 1024 }, mockCtx())!
    const dropZone = vnode.props.children[1]
    const hints = dropZone.props.children.props.children.filter(Boolean)
    const acceptHint = hints.find((h: any) => h?.props?.children?.includes('image/*'))
    const sizeHint = hints.find((h: any) => h?.props?.children?.includes('1.0MB'))
    assert.ok(acceptHint)
    assert.ok(sizeHint)
  })
})
