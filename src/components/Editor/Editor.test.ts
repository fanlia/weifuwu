import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Editor } from './Editor.ts'
import { Modal } from '../Modal/Modal.ts'
import { FileUpload } from '../FileUpload/FileUpload.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'

function makeCtx(): WfuiContext {
  return createTestCtx() as any
}

/** 两阶段 Editor：mount 后每次修改状态后调用 renderFn(props) 获取最新 VNode */
function makeEditor(props: any, ctx: WfuiContext) {
  const result = Editor(props, ctx)
  const renderFn = typeof result === 'function' ? result : null
  return {
    /** 获取最新 VNode */
    render: (overrides: any = props) => renderFn!(overrides),
  }
}

function childrenOf(vnode: any): any[] {
  if (!vnode?.props?.children) return []
  return Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
}

function findAllByType(vnode: any, type: string): any[] {
  if (!vnode) return []
  const result: any[] = []
  const children = childrenOf(vnode)
  for (const c of children) {
    if (c?.type === type) result.push(c)
    result.push(...findAllByType(c, type))
  }
  return result
}

function findAllButtons(vnode: any): any[] {
  return findAllByType(vnode, 'button')
}

describe('Editor', () => {
  it('renders an editor container', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    assert.ok(vnode, 'should render')
    assert.equal(vnode!.type, 'div')
    assert.ok(vnode!.props.class?.includes('wf-editor'), 'should have wf-editor class')
  })

  it('renders toolbar with all 18 default items', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    assert.ok(toolbar, 'should have a toolbar')
    const buttons = findAllButtons(toolbar)
    assert.equal(buttons.length, 18, 'should have 18 toolbar buttons')
  })

  it('renders contentEditable div in rich mode', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === true)
    assert.ok(editable, 'should have contentEditable div')
  })

  it('hides toolbar when disabled', () => {
    const ed = makeEditor({ disabled: true }, makeCtx())
    const vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    assert.ok(!toolbar, 'should not render toolbar when disabled')
  })

  it('sets contentEditable=false when disabled', () => {
    const ed = makeEditor({ disabled: true }, makeCtx())
    const vnode = ed.render()
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === false)
    assert.ok(editable, 'contentEditable should be false when disabled')
  })

  it('sets minHeight from props', () => {
    const ed = makeEditor({ minHeight: '300px' }, makeCtx())
    const vnode = ed.render()
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === true)
    assert.ok(editable, 'should have editable div')
    assert.equal(editable.props.style.minHeight, '300px')
  })

  it('renders placeholder attribute', () => {
    const ed = makeEditor({ placeholder: '请输入内容...' }, makeCtx())
    const vnode = ed.render()
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === true)
    assert.ok(editable, 'should have editable div')
    assert.equal(editable.props['data-placeholder'], '请输入内容...')
  })

  it('accepts custom toolbar items', () => {
    const ed = makeEditor({ toolbar: ['bold', 'italic', 'link', 'source'] }, makeCtx())
    const vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    assert.ok(toolbar, 'should have toolbar')
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    assert.equal(buttons.length, 4)
    assert.equal(buttons[0].props['data-item'], 'bold')
    assert.equal(buttons[1].props['data-item'], 'italic')
    assert.equal(buttons[2].props['data-item'], 'link')
    assert.equal(buttons[3].props['data-item'], 'source')
  })

  it('renders hidden input with value', () => {
    const ed = makeEditor({ value: '<p>Hello</p>' }, makeCtx())
    const vnode = ed.render()
    const hidden = findAllByType(vnode, 'input').find((i: any) => i.props.type === 'hidden')
    assert.ok(hidden, 'should have hidden input')
    assert.equal(hidden.props.value, '<p>Hello</p>')
  })

  it('renders Modal when showLinkInput is true via toolbar click', () => {
    const ctx = makeCtx()
    const ed = makeEditor({}, ctx)
    let vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const linkBtn = buttons.find((b: any) => b.props['data-item'] === 'link')
    assert.ok(linkBtn, 'link button should exist')
    linkBtn.props.onClick()
    vnode = ed.render()
    const modal = vnode.props.children.find((c: any) => c?.type === Modal)
    assert.ok(modal, 'should render Modal for link input')
    assert.equal(modal.props.title, '插入链接')
  })

  it('calls onChange when input event fires in rich mode', () => {
    const calls: string[] = []
    const ctx = makeCtx()
    const ed = makeEditor({ value: '', onChange: (v) => calls.push(v) }, ctx)
    const vnode = ed.render({ value: '', onChange: (v) => calls.push(v) })
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === true)
    assert.ok(editable, 'should have editable div')
    editable.props.onInput({ currentTarget: { innerHTML: '<p>changed</p>' } })
    assert.equal(calls.length, 1)
    assert.equal(calls[0], '<p>changed</p>')
  })

  it('sets disabled class on container', () => {
    const ed = makeEditor({ disabled: true }, makeCtx())
    const vnode = ed.render()
    const cls = vnode!.props.class
    assert.ok(cls.includes('wf-editor--disabled'), 'should have disabled class')
  })

  it('toolbar buttons have correct aria labels', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const boldBtn = buttons.find((b: any) => b.props['data-item'] === 'bold')
    assert.ok(boldBtn, 'bold button exists')
    assert.equal(boldBtn.props['aria-label'], '加粗 (Ctrl+B)')
  })

  it('renders textarea in source mode via toolbar click', () => {
    const ctx = makeCtx()
    const ed = makeEditor({ value: '<p>source</p>' }, ctx)
    let vnode = ed.render({ value: '<p>source</p>' })
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const sourceBtn = buttons.find((b: any) => b.props['data-item'] === 'source')
    assert.ok(sourceBtn, 'source button should exist')
    sourceBtn.props.onClick()
    vnode = ed.render({ value: '<p>source</p>' })
    const textarea = findAllByType(vnode, 'textarea').find((t: any) => t.props.class === 'wf-editor-source')
    assert.ok(textarea, 'should render textarea in source mode')
    assert.equal(textarea.props.value, '<p>source</p>')
  })

  it('calls onChange when source textarea input fires', () => {
    const calls: string[] = []
    const ctx = makeCtx()
    const ed = makeEditor({ value: '', onChange: (v) => calls.push(v) }, ctx)
    let vnode = ed.render({ value: '', onChange: (v) => calls.push(v) })
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const sourceBtn = buttons.find((b: any) => b.props['data-item'] === 'source')
    sourceBtn.props.onClick()
    vnode = ed.render({ value: '', onChange: (v) => calls.push(v) })
    const textarea = findAllByType(vnode, 'textarea').find((t: any) => t.props.class === 'wf-editor-source')
    assert.ok(textarea, 'should have source textarea')
    textarea.props.onInput({ target: { value: '<p>edited</p>' } })
    assert.equal(calls.length, 1)
    assert.equal(calls[0], '<p>edited</p>')
  })

  it('toolbar includes blockquote', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const btn = buttons.find((b: any) => b.props['data-item'] === 'blockquote')
    assert.ok(btn, 'blockquote button exists')
    assert.equal(btn.props['aria-label'], '引用')
  })

  it('toolbar includes alignment buttons', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    assert.ok(buttons.find((b: any) => b.props['data-item'] === 'alignLeft'), 'alignLeft')
    assert.ok(buttons.find((b: any) => b.props['data-item'] === 'alignCenter'), 'alignCenter')
    assert.ok(buttons.find((b: any) => b.props['data-item'] === 'alignRight'), 'alignRight')
  })

  it('toolbar includes hr button', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    assert.ok(buttons.find((b: any) => b.props['data-item'] === 'hr'), 'hr button')
    assert.equal(buttons.find((b: any) => b.props['data-item'] === 'hr').props['aria-label'], '分割线')
  })

  it('toolbar includes source button', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const sourceBtn = buttons.find((b: any) => b.props['data-item'] === 'source')
    assert.ok(sourceBtn, 'source button exists')
    assert.equal(sourceBtn.props['aria-label'], '源码')
  })

  it('toolbar includes image button', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const imgBtn = buttons.find((b: any) => b.props['data-item'] === 'image')
    assert.ok(imgBtn, 'image button exists')
    assert.equal(imgBtn.props['aria-label'], '插入图片')
  })

  it('toolbar includes table button', () => {
    const ed = makeEditor({}, makeCtx())
    const vnode = ed.render()
    const allButtons = findAllButtons(vnode)
    const tblBtn = allButtons.find((b: any) => b.props['data-item'] === 'table')
    assert.ok(tblBtn, 'table button exists')
    assert.equal(tblBtn.props['aria-label'], '插入表格')
  })

  it('renders table grid inside Popover when table button clicked', () => {
    const ctx = makeCtx()
    const ed = makeEditor({}, ctx)
    let vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    assert.ok(toolbar, 'toolbar should exist')
    // 按 type.name 找到 Popover（content 初始为 null，需先触发打开）
    const popover = toolbar.props.children.find((c: any) =>
      typeof c?.type === 'function' && c.type.name === 'Popover'
    )
    assert.ok(popover, 'Popover should exist in toolbar')
    popover.props.onOpenChange(true)
    vnode = ed.render()
    // 重新 render 后 content 应有 table picker
    const toolbar2 = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const popover2 = toolbar2.props.children.find((c: any) =>
      typeof c?.type === 'function' && c.type.name === 'Popover'
    )
    assert.ok(popover2.props.content, 'Popover should have content when open')
    const picker = popover2.props.content
    assert.ok(picker.props?.class?.includes('wf-editor-table-picker'), 'Content should be table picker')
  })

  it('renders Modal when image button clicked', () => {
    const ctx = makeCtx()
    const ed = makeEditor({}, ctx)
    let vnode = ed.render()
    // 点击 image 按钮触发 Modal
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const imgBtn = buttons.find((b: any) => b.props['data-item'] === 'image')
    imgBtn.props.onClick()
    vnode = ed.render()
    const imgModal = vnode.props.children.find((m: any) => m?.type === Modal && m?.props?.title === '插入图片')
    assert.ok(imgModal, 'should render Modal for image input')
  })

  it('renders FileUpload inside image Modal when onUpload provided', () => {
    const ctx = makeCtx()
    const ed = makeEditor({ value: '', onUpload: async (f: any) => f.name }, ctx)
    let vnode = ed.render({ value: '', onUpload: async (f: any) => f.name })
    // 点击 image 按钮
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const imgBtn = buttons.find((b: any) => b.props['data-item'] === 'image')
    imgBtn.props.onClick()
    vnode = ed.render({ value: '', onUpload: async (f: any) => f.name })
    const imgModal = vnode.props.children.find((c: any) => c?.type === Modal && c.props.title === '插入图片')
    assert.ok(imgModal, 'should render image Modal')
    const bodyChildren = imgModal.props.children?.props?.children
    const all = Array.isArray(bodyChildren) ? bodyChildren : [bodyChildren]
    const hasFU = all.some((c: any) => c?.type === FileUpload)
    assert.ok(hasFU, 'should contain FileUpload inside image Modal')
  })

  it('switches to source mode via toolbar', () => {
    const ctx = makeCtx()
    const ed = makeEditor({}, ctx)
    let vnode = ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const sourceBtn = buttons.find((b: any) => b.props['data-item'] === 'source')
    sourceBtn.props.onClick()
    vnode = ed.render()
    const modals = vnode.props.children.filter((c: any) => c?.type === Modal)
    assert.equal(modals.length, 0, 'Modals should not render in source mode')
  })
})
