import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { CopyButton } from './CopyButton.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get render fn (two-phase) */
function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('CopyButton', () => {
  let written: string | null = null
  let execCalled = false

  const setNavigator = (val: any) => {
    Object.defineProperty(globalThis, 'navigator', {
      value: val, configurable: true, writable: true,
    })
  }

  beforeEach(() => {
    written = null
    execCalled = false
    setNavigator({ clipboard: { writeText: async (t: string) => { written = t } } })
    ;(document as any).execCommand = () => { execCalled = true; return true }
  })

  afterEach(() => {
    ;(document as any).execCommand = undefined
  })

  it('renders button with copy icon', () => {
    const render = mount(CopyButton, { value: 'text' }, mockCtx())!
    const vnode = render({ value: 'text' })
    assert.equal(vnode.type, 'button')
    assert.match(vnode.props.class, /wf-copy-btn/)
    const icon = vnode.props.children[0]
    assert.equal(icon.props.name, 'copy')
  })

  it('copies value via navigator.clipboard on click', async () => {
    const render = mount(CopyButton, { value: '你好世界' }, mockCtx())!
    const vnode = render({ value: '你好世界' })
    await vnode.props.onClick()
    assert.equal(written, '你好世界')
  })

  it('calls onCopied after success', async () => {
    let copied = false
    const render = mount(CopyButton, { value: 'x' }, mockCtx())!
    await render({ value: 'x', onCopied: () => { copied = true } }).props.onClick()
    assert.equal(copied, true)
  })

  it('falls back to execCommand when clipboard rejects', async () => {
    setNavigator({ clipboard: { writeText: async () => { throw new Error('denied') } } })
    const render = mount(CopyButton, { value: 'fallback' }, mockCtx())!
    await render({ value: 'fallback' }).props.onClick()
    assert.equal(execCalled, true)
  })

  it('uses execCommand when clipboard unavailable', async () => {
    setNavigator({})
    const render = mount(CopyButton, { value: 'no-clip' }, mockCtx())!
    await render({ value: 'no-clip' }).props.onClick()
    assert.equal(execCalled, true)
  })

  it('shows success feedback after copy (check icon)', async () => {
    const ctx = mockCtx()
    const render = mount(CopyButton, { value: 'x' }, ctx)!
    const vnode1 = render({ value: 'x' })
    assert.equal(vnode1.props.children[0].props.name, 'copy')
    await vnode1.props.onClick()
    // copied 状态变化后再次 render → check 图标
    const vnode2 = render({ value: 'x' })
    assert.equal(vnode2.props.children[0].props.name, 'check')
    assert.match(vnode2.props.class, /wf-copy-btn--copied/)
  })

  it('renders label when provided', () => {
    const render = mount(CopyButton, { value: 'x' }, mockCtx())!
    const vnode = render({ value: 'x', label: '复制' })
    const text = vnode.props.children[1]
    assert.equal(text.props.class, 'wf-copy-btn-text')
    assert.equal(text.props.children, '复制')
  })

  it('iconOnly renders no text', () => {
    const render = mount(CopyButton, { value: 'x', iconOnly: true }, mockCtx())!
    const vnode = render({ value: 'x', iconOnly: true })
    assert.equal(vnode.props.children.length, 1) // 只有图标
  })
})
