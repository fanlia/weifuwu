import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CitationCard, type Citation } from './CitationCard.ts'
import { renderVNode, mountComponent, findByClass, findVNode, createTestCtx } from '../../vdom/testing.ts'

/** 收集所有匹配节点（findVNode 谓词版） */
function collect(v: any, pred: (n: any) => boolean): any[] {
  const found: any[] = []
  findVNode(v, (n: any) => { if (pred(n)) found.push(n); return false })
  return found
}

const items: Citation[] = [
  { id: 'c1', title: '产品手册 · 计费', source: 'docs/billing.md', snippet: '按量计费以小时为粒度……', url: 'https://example.com/docs/billing' },
  { id: 'c2', title: 'FAQ · 退款', source: 'faq.md', snippet: '退款将在 3-5 个工作日内原路退回。' },
]

describe('CitationCard', () => {
  it('默认折叠：头部显示「引用 N 条」，列表隐藏', async () => {
    const v = await renderVNode(CitationCard, { items }, createTestCtx())!
    const header = findByClass(v, 'wf-citation-toggle')[0]
    assert.ok(header, '折叠头')
    assert.ok(String(header.props.children).includes('引用 2 条') || JSON.stringify(header.props.children).includes('2 条'))
    assert.equal(header.props['aria-expanded'], false)
    const body = findByClass(v, 'wf-citation-body')[0]
    assert.ok(body.props.hidden || !String(body.props.class).includes('open'), '列表隐藏')
  })

  it('点击展开 → 列表显示（title/source/snippet + 序号）', async () => {
    const render = await mountComponent(CitationCard, { items }, createTestCtx())
    let v = await render()
    findByClass(v, 'wf-citation-toggle')[0].props.onClick()
    v = await render()
    assert.equal(findByClass(v, 'wf-citation-toggle')[0].props['aria-expanded'], true)
    const rows = findByClass(v, 'wf-citation-item')
    assert.equal(rows.length, 2)
    assert.ok(JSON.stringify(rows[0].props.children).includes('产品手册'))
    assert.ok(JSON.stringify(rows[0].props.children).includes('按量计费'))
    assert.ok(JSON.stringify(rows[0].props.children).includes('docs/billing.md'))
  })

  it('maxVisible：折叠只显示前 N 条 + 溢出计数', async () => {
    const many: Citation[] = [1, 2, 3, 4].map((i) => ({ id: `c${i}`, title: `条目 ${i}`, snippet: `片段 ${i}` }))
    const render = await mountComponent(CitationCard, { items: many, maxVisible: 2 }, createTestCtx())
    let v = await render()
    findByClass(v, 'wf-citation-toggle')[0].props.onClick()
    v = await render()
    const rows = findByClass(v, 'wf-citation-item')
    assert.equal(rows.length, 3, '2 条 + 1 溢出条目')
    assert.ok(JSON.stringify(rows[2].props.children).includes('2'), '溢出条目显示 +N')
  })

  it('url → 链接可点（a[href] + target=_blank + rel）；无 url → 非链接', async () => {
    const v = await renderVNode(CitationCard, { items, defaultExpanded: true }, createTestCtx())!
    const links = collect(v, (n: any) => n?.type === 'a' || n?.props?.href)
    assert.equal(links.length, 1, '仅 c1 有 url')
    assert.equal(links[0].props.href, 'https://example.com/docs/billing')
    assert.equal(links[0].props.target, '_blank')
    assert.equal(links[0].props.rel, 'noopener')
  })

  it('onOpen 回调优先（不跳转；onOpen 时所有条目均可点开）', async () => {
    let opened: string | undefined
    const v = await renderVNode(CitationCard, { items, defaultExpanded: true, onOpen: (c: Citation) => { opened = c.id } }, createTestCtx())!
    // onOpen 时渲染为链接按钮（无 href）而非 a[href]
    const btns = collect(v, (n: any) => typeof n?.props?.class === 'string' && n.props.class.includes('wf-citation-link'))
    assert.equal(btns.length, 2, 'onOpen 时全部条目可点')
    assert.equal(btns[0].props.href, undefined, '不渲染 href（由调用方处理）')
    btns[0].props.onClick()
    assert.equal(opened, 'c1')
  })

  it('空 items → 不渲染', async () => {
    const v = await renderVNode(CitationCard, { items: [] }, createTestCtx())
    assert.equal(v, null)
  })

  it('键盘可达：Enter/Space 切换展开', async () => {
    const render = await mountComponent(CitationCard, { items }, createTestCtx())
    let v = await render()
    findByClass(v, 'wf-citation-toggle')[0].props.onKeyDown({ key: ' ', preventDefault: () => {} })
    v = await render()
    assert.equal(findByClass(v, 'wf-citation-toggle')[0].props['aria-expanded'], true)
  })

  it('defaultExpanded → 初始展开', async () => {
    const v = await renderVNode(CitationCard, { items, defaultExpanded: true }, createTestCtx())!
    assert.equal(findByClass(v, 'wf-citation-toggle')[0].props['aria-expanded'], true)
  })
})
