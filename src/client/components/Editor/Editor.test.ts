import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../vdom/setup.ts'
setupJsdom()
import { Editor } from './Editor.ts'
import type { UIContext } from '../../vdom/index.ts'
import { createTestCtx } from '../../vdom/testing.ts'

function makeCtx(): UIContext {
  return createTestCtx() as any
}

/** 两阶段 Editor：mount 后每次修改状态后调用 renderFn(props) 获取最新 VNode */
async function makeEditor(props: any, ctx: UIContext) {
  const result = await Editor(props, ctx)
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
  it('renders an editor container', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    assert.ok(vnode, 'should render')
    assert.equal(vnode!.type, 'div')
    assert.ok(vnode!.props.class?.includes('wf-editor'), 'should have wf-editor class')
  })

  it('renders toolbar with all 18 default items', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    assert.ok(toolbar, 'should have a toolbar')
    const buttons = findAllButtons(toolbar)
    assert.equal(buttons.length, 19, '18 工具按钮 + 操作历史')
  })

  it('renders contentEditable div in rich mode', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === true)
    assert.ok(editable, 'should have contentEditable div')
  })

  it('hides toolbar when disabled', async () => {
    const ed = await makeEditor({ disabled: true }, makeCtx())
    const vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    assert.ok(!toolbar, 'should not render toolbar when disabled')
  })

  it('sets contentEditable=false when disabled', async () => {
    const ed = await makeEditor({ disabled: true }, makeCtx())
    const vnode = await ed.render()
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === false)
    assert.ok(editable, 'contentEditable should be false when disabled')
  })

  it('sets minHeight from props', async () => {
    const ed = await makeEditor({ minHeight: '300px' }, makeCtx())
    const vnode = await ed.render()
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === true)
    assert.ok(editable, 'should have editable div')
    assert.equal(editable.props.style.minHeight, '300px')
  })

  it('renders placeholder attribute', async () => {
    const ed = await makeEditor({ placeholder: '请输入内容...' }, makeCtx())
    const vnode = await ed.render()
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === true)
    assert.ok(editable, 'should have editable div')
    assert.equal(editable.props['data-placeholder'], '请输入内容...')
  })

  it('accepts custom toolbar items', async () => {
    const ed = await makeEditor({ toolbar: ['bold', 'italic', 'link', 'source'] }, makeCtx())
    const vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    assert.ok(toolbar, 'should have toolbar')
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    assert.equal(buttons.length, 5, '4 工具按钮 + 操作历史')
    assert.equal(buttons[0].props['data-item'], 'bold')
    assert.equal(buttons[1].props['data-item'], 'italic')
    assert.equal(buttons[2].props['data-item'], 'link')
    assert.equal(buttons[3].props['data-item'], 'source')
    assert.equal(buttons[4].props['data-item'], 'history')
  })

  it('renders hidden input with value', async () => {
    const ed = await makeEditor({ value: '<p>Hello</p>' }, makeCtx())
    const vnode = await ed.render()
    const hidden = findAllByType(vnode, 'input').find((i: any) => i.props.type === 'hidden')
    assert.ok(hidden, 'should have hidden input')
    assert.equal(hidden.props.value, '<p>Hello</p>')
  })

  it('link 按钮点击无选区 → 打开链接输入（浮层渲染由 editor-flow 端到端覆盖）', async () => {
    const ctx = makeCtx()
    const ed = await makeEditor({}, ctx)
    let vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const linkBtn = buttons.find((b: any) => b.props['data-item'] === 'link')
    assert.ok(linkBtn, 'link button should exist')
    assert.doesNotThrow(() => linkBtn.props.onClick({ currentTarget: null }))
  })

  it('binds onInput on contentEditable（输入同步模型——DOM 行为由事务层测试/浏览器验收覆盖）', async () => {
    const ctx = makeCtx()
    const ed = await makeEditor({ value: '<p>初始</p>' }, ctx)
    const vnode = await ed.render({ value: '<p>初始</p>' })
    const editable = findAllByType(vnode, 'div').find((d: any) => d.props.contentEditable === true)
    assert.ok(editable, 'should have editable div')
    assert.equal(typeof editable.props.onInput, 'function', 'onInput 已绑定')
  })

  it('sets disabled class on container', async () => {
    const ed = await makeEditor({ disabled: true }, makeCtx())
    const vnode = await ed.render()
    const cls = vnode!.props.class
    assert.ok(cls.includes('wf-editor--disabled'), 'should have disabled class')
  })

  it('toolbar buttons have correct aria labels', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const boldBtn = buttons.find((b: any) => b.props['data-item'] === 'bold')
    assert.ok(boldBtn, 'bold button exists')
    assert.equal(boldBtn.props['aria-label'], '加粗 (Ctrl+B)')
  })

  it('renders textarea in source mode via toolbar click', async () => {
    const ctx = makeCtx()
    const ed = await makeEditor({ value: '<p>source</p>' }, ctx)
    let vnode = await ed.render({ value: '<p>source</p>' })
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const sourceBtn = buttons.find((b: any) => b.props['data-item'] === 'source')
    assert.ok(sourceBtn, 'source button should exist')
    sourceBtn.props.onClick({ currentTarget: null })
    vnode = await ed.render({ value: '<p>source</p>' })
    const textarea = findAllByType(vnode, 'textarea').find((t: any) => t.props.class === 'wf-editor-source')
    assert.ok(textarea, 'should render textarea in source mode')
    assert.equal(textarea.props.value, '<p>source</p>')
  })

  it('calls onChange when source textarea input fires', async () => {
    const calls: string[] = []
    const ctx = makeCtx()
    const ed = await makeEditor({ value: '', onChange: (v) => calls.push(v) }, ctx)
    let vnode = await ed.render({ value: '', onChange: (v) => calls.push(v) })
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const sourceBtn = buttons.find((b: any) => b.props['data-item'] === 'source')
    sourceBtn.props.onClick({ currentTarget: null })
    vnode = await ed.render({ value: '', onChange: (v) => calls.push(v) })
    const textarea = findAllByType(vnode, 'textarea').find((t: any) => t.props.class === 'wf-editor-source')
    assert.ok(textarea, 'should have source textarea')
    textarea.props.onInput({ target: { value: '<p>edited</p>' } })
    assert.equal(calls.length, 1)
    assert.equal(calls[0], '<p>edited</p>')
  })

  it('toolbar includes blockquote', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const btn = buttons.find((b: any) => b.props['data-item'] === 'blockquote')
    assert.ok(btn, 'blockquote button exists')
    assert.equal(btn.props['aria-label'], '引用')
  })

  it('toolbar includes alignment buttons', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    assert.ok(buttons.find((b: any) => b.props['data-item'] === 'alignLeft'), 'alignLeft')
    assert.ok(buttons.find((b: any) => b.props['data-item'] === 'alignCenter'), 'alignCenter')
    assert.ok(buttons.find((b: any) => b.props['data-item'] === 'alignRight'), 'alignRight')
  })

  it('toolbar includes hr button', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    assert.ok(buttons.find((b: any) => b.props['data-item'] === 'hr'), 'hr button')
    assert.equal(buttons.find((b: any) => b.props['data-item'] === 'hr').props['aria-label'], '分割线')
  })

  it('toolbar includes source button', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const sourceBtn = buttons.find((b: any) => b.props['data-item'] === 'source')
    assert.ok(sourceBtn, 'source button exists')
    assert.equal(sourceBtn.props['aria-label'], '源码')
  })

  it('toolbar includes image button', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const imgBtn = buttons.find((b: any) => b.props['data-item'] === 'image')
    assert.ok(imgBtn, 'image button exists')
    assert.equal(imgBtn.props['aria-label'], '插入图片')
  })

  it('toolbar includes table button', async () => {
    const ed = await makeEditor({}, makeCtx())
    const vnode = await ed.render()
    const allButtons = findAllButtons(vnode)
    const tblBtn = allButtons.find((b: any) => b.props['data-item'] === 'table')
    assert.ok(tblBtn, 'table button exists')
    assert.equal(tblBtn.props['aria-label'], '插入表格')
  })

  it('renders table grid inside Popover when table button clicked', async () => {
    const ctx = makeCtx()
    const ed = await makeEditor({}, ctx)
    let vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    assert.ok(toolbar, 'toolbar should exist')
    // 按 type.name 找到 Popover（content 初始为 null，需先触发打开）
    const popover = toolbar.props.children.find((c: any) =>
      typeof c?.type === 'function' && c.type.name === 'Popover'
    )
    assert.ok(popover, 'Popover should exist in toolbar')
    popover.props.onOpenChange(true)
    vnode = await ed.render()
    // 重新 render 后 content 应有 table picker
    const toolbar2 = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const popover2 = toolbar2.props.children.find((c: any) =>
      typeof c?.type === 'function' && c.type.name === 'Popover'
    )
    assert.ok(popover2.props.content, 'Popover should have content when open')
    const picker = popover2.props.content
    assert.ok(picker.props?.class?.includes('wf-editor-table-picker'), 'Content should be table picker')
  })

  it('image 按钮点击 → 打开图片输入（浮层渲染由 editor-flow 端到端覆盖）', async () => {
    const ctx = makeCtx()
    const ed = await makeEditor({}, ctx)
    let vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const imgBtn = buttons.find((b: any) => b.props['data-item'] === 'image')
    assert.ok(imgBtn, 'image button should exist')
    assert.doesNotThrow(() => imgBtn.props.onClick({ currentTarget: null }))
  })

  it('switches to source mode via toolbar', async () => {
    const ctx = makeCtx()
    const ed = await makeEditor({}, ctx)
    let vnode = await ed.render()
    const toolbar = vnode.props.children.find((c: any) => c?.props?.class?.includes('wf-editor-toolbar'))
    const buttons = toolbar.props.children.filter((c: any) => c?.type === 'button')
    const sourceBtn = buttons.find((b: any) => b.props['data-item'] === 'source')
    sourceBtn.props.onClick({ currentTarget: null })
    vnode = await ed.render()
    const panels = vnode.props.children.filter((c: any) => c?.props?.class?.includes('wf-editor-link-panel'))
    assert.equal(panels.length, 0, '浮层不应在 source 模式渲染')
  })
})
