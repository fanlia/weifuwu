import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Markdown } from './Markdown.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

function blocks(vnode: any): any[] {
  return vnode.props.children
}

describe('Markdown 组件', () => {
  it('渲染标题为 h1-h4', () => {
    const vnode = renderVNode(Markdown, { content: '# 一\n## 二' }, mockCtx())!
    const bs = blocks(vnode)
    assert.equal(bs[0].type, 'h1')
    assert.equal(bs[1].type, 'h2')
  })

  it('渲染段落 + 行内粗体', () => {
    const vnode = renderVNode(Markdown, { content: '**加粗** 内容' }, mockCtx())!
    const p = blocks(vnode)[0]
    assert.equal(p.type, 'p')
    assert.equal(p.props.children[0].type, 'strong')
  })

  it('代码围栏 → CodeBlock 组件', () => {
    const vnode = renderVNode(Markdown, { content: '```js\nconst a = 1\n```' }, mockCtx())!
    const cb = blocks(vnode)[0]
    assert.equal(typeof cb.type, 'function') // 组件函数
    assert.equal(cb.props.code, 'const a = 1\n')
    assert.equal(cb.props.lang, 'js')
  })

  it('链接带安全属性（noopener + target=_blank）', () => {
    const vnode = renderVNode(Markdown, { content: '[链接](https://x.dev)' }, mockCtx())!
    const a = blocks(vnode)[0].props.children[0]
    assert.equal(a.props.href, 'https://x.dev')
    assert.equal(a.props.target, '_blank')
    assert.match(a.props.rel, /noopener/)
  })

  it('javascript: 链接降级为纯文本（无 <a>）', () => {
    const vnode = renderVNode(Markdown, { content: '[x](javascript:alert(1))' }, mockCtx())!
    const p = blocks(vnode)[0]
    const nodes = flattenInline(p.props.children)
    assert.ok(!nodes.some((n: any) => n.type === 'a'))
  })

  it('列表渲染 ul/ol + li', () => {
    const vnode = renderVNode(Markdown, { content: '- a\n- b\n\n1. x' }, mockCtx())!
    const [ul, ol] = blocks(vnode)
    assert.equal(ul.type, 'ul')
    assert.equal(ul.props.children.length, 2)
    assert.equal(ol.type, 'ol')
  })

  it('空内容返回 null', () => {
    assert.equal(renderVNode(Markdown, { content: '' }, mockCtx()), null)
  })

  it('XSS: script 内容渲染为文本节点（无元素）', () => {
    const vnode = renderVNode(Markdown, { content: '<script>alert(1)</script>' }, mockCtx())!
    const p = blocks(vnode)[0]
    const text = p.props.children.map((c: any) => c.props?.children ?? '').join('')
    assert.ok(text.includes('<script>'))
  })
})

function flattenInline(nodes: any[]): any[] {
  const out: any[] = []
  for (const n of nodes) {
    if (n?.props?.children && typeof n.props.children !== 'string') {
      out.push(n, ...flattenInline(n.props.children))
    } else if (n?.type) out.push(n)
  }
  return out
}

describe('Markdown GFM', () => {
  it('删除线 ~~text~~ → <del>', () => {
    const v = renderVNode(Markdown, { content: '~~删除~~ 这段' }, mockCtx())!
    const s = JSON.stringify(v)
    assert.ok(s.includes('wf-md-del'), 'del 渲染')
  })

  it('任务列表 [ ]/[x] → checkbox', () => {
    const v = renderVNode(Markdown, { content: '- [x] 已完成\n- [ ] 待办' }, mockCtx())!
    const s = JSON.stringify(v)
    assert.ok(s.includes('wf-md-task-list'), '任务列表类')
    assert.ok(s.includes('wf-md-task-check'), 'checkbox 渲染')
    assert.ok(s.includes('"checked":true'), '已完成项 checked')
    assert.ok(s.includes('"checked":false'), '待办项 unchecked')
  })

  it('表格 → thead/tbody + 对齐', () => {
    const md = '| 名称 | 数量 |\n| :--- | ---: |\n| 苹果 | 3 |\n| 香蕉 | 12 |'
    const v = renderVNode(Markdown, { content: md }, mockCtx())!
    const s = JSON.stringify(v)
    assert.ok(s.includes('wf-md-table'), '表格渲染')
    assert.ok(s.includes('苹果') && s.includes('香蕉'), '行数据')
    assert.ok(s.includes('textAlign'), '对齐样式')
    assert.ok(s.includes('center') || s.includes('right'), '含 center/right 对齐')
  })

  it('表格分隔行缺失时不误判（普通段落）', () => {
    const v = renderVNode(Markdown, { content: '| 不是表格' }, mockCtx())!
    // 无分隔行 → 走段落
    assert.ok(JSON.stringify(v).includes('wf-md-p'), '降级为段落')
  })
})
