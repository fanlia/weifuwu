import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CodeBlock } from './CodeBlock.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('CodeBlock', () => {
  it('渲染代码内容（pre > code）', () => {
    const vnode = renderVNode(CodeBlock, { code: 'const a = 1' }, mockCtx())!
    assert.match(vnode.props.class, /wf-codeblock/)
    // 子结构: header(标签+复制) + pre > code
    const pre = vnode.props.children.find((c: any) => c?.props?.class === 'wf-codeblock-pre')
    const codeEl = pre.props.children
    assert.equal(codeEl.props.class, 'wf-codeblock-code')
    assert.equal(codeEl.props.children, 'const a = 1')
  })

  it('语言标签展示（标题区内）', () => {
    const vnode = renderVNode(CodeBlock, { code: 'x', lang: 'ts' }, mockCtx())!
    const header = vnode.props.children.find((c: any) => c?.props?.class === 'wf-codeblock-header')
    const title = header.props.children.find((c: any) => c?.props?.class === 'wf-codeblock-title')
    const lang = title.props.children
    assert.equal(lang.props.class, 'wf-codeblock-lang')
    assert.equal(lang.props.children[1], 'ts')
  })

  it('复制按钮存在（aria-label=复制）', () => {
    const vnode = renderVNode(CodeBlock, { code: 'x' }, mockCtx())!
    const btn = vnode.props.children[0].props.children.find((c: any) => c?.props?.type === 'button')
    assert.equal(btn.props['aria-label'], '复制')
  })

  it('点击复制 → 调 clipboard + 反馈图标', async () => {
    let copied = ''
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: (t: string) => { copied = t; return Promise.resolve() } } },
      configurable: true, writable: true,
    })
    const vnode = renderVNode(CodeBlock, { code: 'const a = 1' }, mockCtx())!
    const btn = vnode.props.children[0].props.children.find((c: any) => c?.props?.type === 'button')
    await btn.props.onClick()
    assert.equal(copied, 'const a = 1')
  })

  it('clipboard 不可用时 execCommand 兜底不抛错', () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true })
    const vnode = renderVNode(CodeBlock, { code: 'x' }, mockCtx())!
    const btn = vnode.props.children[0].props.children.find((c: any) => c?.props?.type === 'button')
    assert.doesNotThrow(() => btn.props.onClick())
  })
})
