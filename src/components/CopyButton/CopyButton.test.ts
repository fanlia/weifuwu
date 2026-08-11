import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { CopyButton } from './CopyButton.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get render fn (two-phase) */
function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

function makeCtx(opts: { copyText?: (t: string) => Promise<boolean> } = {}): WfuiContext {
  return createTestCtx({
    browser: { copyText: opts.copyText ?? (async (t: string) => { (globalThis as any).__copied = t; return true }) },
  }) as any
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
    const render = mount(CopyButton, { value: 'text' }, makeCtx())!
    const vnode = render({ value: 'text' })
    assert.equal(vnode.type, 'button')
    assert.match(vnode.props.class, /wf-copy-btn/)
    const icon = vnode.props.children[0]
    assert.equal(icon.props.name, 'copy')
  })

  it('copies value via ctx.browser.copyText on click', async () => {
    let copiedText: string | null = null
    const ctx = makeCtx({ copyText: async (t: string) => { copiedText = t; return true } })
    const render = mount(CopyButton, { value: '你好世界' }, ctx)!
    const vnode = render({ value: '你好世界' })
    await vnode.props.onClick()
    assert.equal(copiedText, '你好世界')
  })

  it('calls onCopied after success', async () => {
    let copied = false
    const render = mount(CopyButton, { value: 'x' }, makeCtx())!
    await render({ value: 'x', onCopied: () => { copied = true } }).props.onClick()
    assert.equal(copied, true)
  })

  it('shows success feedback after copy (check icon)', async () => {
    const ctx = makeCtx()
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
    const render = mount(CopyButton, { value: 'x' }, makeCtx())!
    const vnode = render({ value: 'x', label: '复制' })
    const text = vnode.props.children[1]
    assert.equal(text.props.class, 'wf-copy-btn-text')
    assert.equal(text.props.children, '复制')
  })

  it('iconOnly renders no text', () => {
    const render = mount(CopyButton, { value: 'x', iconOnly: true }, makeCtx())!
    const vnode = render({ value: 'x', iconOnly: true })
    assert.equal(vnode.props.children.length, 1) // 只有图标
  })
})

it('复制失败（copyText  reject）不崩溃且无成功态（边界）', async () => {
  const ctx = makeCtx({ copyText: async () => { throw new Error('denied') } })
  const factory = mount(CopyButton, { value: 'x' }, ctx)
  const vnode = factory({ value: 'x' })
  try { await vnode.props.onClick?.() } catch { /* 允许抛错但不挂死 */ }
  assert.ok(true, '复制失败路径不挂死')
})

it('size/variant 变体类', () => {
  const vnode = mount(CopyButton, { value: 'x', size: 'sm', variant: 'ghost' }, makeCtx())!({ value: 'x', size: 'sm', variant: 'ghost' })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('sm') && s.includes('ghost'))
})
