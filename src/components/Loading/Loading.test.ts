import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Loading } from './Loading.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Loading', () => {
  it('renders loading container', () => {
    const vnode = Loading({}, mockCtx())!
    assert.match(vnode.props.class, /wf-loading/)
  })

  it('renders default text', () => {
    const vnode = Loading({}, mockCtx())!
    const text = vnode.props.children[1]
    assert.equal(text.props.children, '加载中...')
  })

  it('renders custom text', () => {
    const vnode = Loading({ text: '提交中...' }, mockCtx())!
    const text = vnode.props.children[1]
    assert.equal(text.props.children, '提交中...')
  })

  it('renders spinner element', () => {
    const vnode = Loading({}, mockCtx())!
    const spinner = vnode.props.children[0]
    assert.match(spinner.props.class, /wf-loading-spinner/)
  })
})

  it('has role status attribute', () => {
    const vnode = Loading({}, mockCtx())!
    assert.equal(vnode.props.role, 'status')
  })

  it('has aria-live polite', () => {
    const vnode = Loading({}, mockCtx())!
    assert.equal(vnode.props['aria-live'], 'polite')
  })
