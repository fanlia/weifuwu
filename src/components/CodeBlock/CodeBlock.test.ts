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
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true },
    browser: { copyText: async (t: string) => { (globalThis as any).__copied = t; return true } } } as any
}

describe('CodeBlock', () => {
  it('渲染代码内容（pre > code）', () => {
    const vnode = renderVNode(CodeBlock, { code: 'const a = 1' }, mockCtx())!
    assert.match(vnode.props.class, /wf-codeblock/)
    // 子结构: header(标签+复制) + pre > code
    const pre = vnode.props.children.find((c: any) => c?.props?.class === 'wf-codeblock-pre')
    const codeEl = pre.props.children
    assert.equal(codeEl.props.class, 'wf-codeblock-code')
    // 语法高亮：children 为 token 数组（keyword/number span + 文本）
    const children = codeEl.props.children
    assert.ok(Array.isArray(children), '高亮后 children 是 token 数组')
    assert.ok(children.some((c: any) => c?.props?.class === 'wf-hl-keyword'), '关键字高亮 span')
    assert.ok(children.some((c: any) => c?.props?.class === 'wf-hl-number'), '数字高亮 span')
    // token 拼接还原原文
    assert.equal(children.map((c: any) => typeof c === 'string' ? c : c.props.children).join(''), 'const a = 1')
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

  it('点击复制 → 调 ctx.browser.copyText + 反馈图标', async () => {
    let copied = ''
    const ctx = { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true },
      browser: { copyText: async (t: string) => { copied = t; return true } } } as any
    const vnode = renderVNode(CodeBlock, { code: 'const a = 1' }, ctx)!
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

it('title 渲染在标题区', () => {
  const vnode = renderVNode(CodeBlock, { code: 'x', title: 'server.ts' }, mockCtx())!
  assert.ok(JSON.stringify(vnode).includes('server.ts'))
})

it('无 lang 不渲染语言标签（边界）', () => {
  const vnode = renderVNode(CodeBlock, { code: 'x' }, mockCtx())!
  assert.ok(!JSON.stringify(vnode).includes('wf-codeblock-lang'))
})

it('复制跟随最新 code（props 更新后 latestCode 同步）', async () => {
  const copied: string[] = []
  const ctx = mockCtx()
  ;(ctx as any).browser = { copyText: async (t: string) => { copied.push(t) } }
  const factory = CodeBlock({ code: 'v1' }, ctx)
  factory({ code: 'v1' })
  const vnode2 = factory({ code: 'v2' })
  const find = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (n.props?.['aria-label'] === '复制') return n
    const k = n.props?.children
    if (Array.isArray(k)) for (const c of k) { const f = find(c); if (f) return f }
    return null
  }
  await find(vnode2).props.onClick()
  assert.deepEqual(copied, ['v2'], '复制的是 props 更新后的代码')
})
