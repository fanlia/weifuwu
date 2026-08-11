import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { parseAnsi, LogViewer } from './LogViewer.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'

function makeCtx(scrollY = 0): { ctx: WfuiContext; setY: (y: number) => void } {
  const scroll = { y: scrollY, refresh: () => {} }
  const ctx = createTestCtx({ ui: { useScrollPosition: () => scroll } }) as any
  return { ctx, setY: (y: number) => { scroll.y = y } }
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

function getRows(v: any): any[] {
  const body = v.props.children.find((c: any) => c?.props?.class?.includes('wf-log-body'))
  if (!body) return []
  return body.props.children.filter((c: any) => c?.props?.class?.includes('wf-log-row'))
}

describe('parseAnsi（ANSI 转义解析）', () => {
  it('解析前景色 \x1b[31m → red span', () => {
    const nodes = parseAnsi('\x1b[31m错误\x1b[0m 正常')
    assert.equal(nodes.length, 2)
    assert.equal(nodes[0].props.class, 'wf-log-ansi--31')
    assert.equal(nodes[0].props.children, '错误')
    assert.equal(nodes[1], ' 正常')
  })

  it('粗体 \x1b[1m → bold span', () => {
    const nodes = parseAnsi('\x1b[1m加粗\x1b[0m')
    assert.equal(nodes[0].props.class, 'wf-log-ansi--bold')
  })

  it('背景色 \x1b[41m → bg span', () => {
    const nodes = parseAnsi('\x1b[41m红底\x1b[0m')
    assert.match(nodes[0].props.class, /41/)
  })

  it('无转义 → 原样单节点', () => {
    const nodes = parseAnsi('plain log line')
    assert.deepEqual(nodes, ['plain log line'])
  })

  it('多段连续样式切换', () => {
    const nodes = parseAnsi('\x1b[32mA\x1b[33mB\x1b[0mC')
    assert.equal(nodes.length, 3)
    assert.match(nodes[0].props.class, /32/)
    assert.match(nodes[1].props.class, /33/)
    assert.equal(nodes[2], 'C')
  })
})

const lines = [
  '[12:00:01] 启动服务',
  '\x1b[32m[12:00:02] ✓ 连接数据库\x1b[0m',
  '\x1b[31m[12:00:03] ✗ 请求失败\x1b[0m',
  '[12:00:04] 重试中…',
]

describe('LogViewer', () => {
  it('渲染行号 + 行内容', () => {
    const render = mount(LogViewer, { lines, height: 200 }, makeCtx().ctx)!
    const v = render({ lines, height: 200 })
    assert.match(v.props.class, /wf-log-viewer/)
    const rows = getRows(v)
    assert.equal(rows.length, 4)
    assert.equal(rows[0].props.children[0].props.children, '1') // 行号
    assert.equal(rows[2].props.children[1].props.children[0].props.class, 'wf-log-ansi--31')
  })

  it('maxLines 截断显示（只渲染尾部 N 行）', () => {
    const many = Array.from({ length: 20 }, (_, i) => `line-${i}`)
    const render = mount(LogViewer, { lines: many, height: 400, maxLines: 5 }, makeCtx().ctx)!
    const v = render({ lines: many, height: 400, maxLines: 5 })
    const rows = getRows(v)
    assert.equal(rows.length, 5)
    // 行号从截断起点开始
    assert.equal(rows[0].props.children[0].props.children, '16')
  })

  it('10k 行只渲染可见窗口', () => {
    const many = Array.from({ length: 10000 }, (_, i) => `line-${i}`)
    const render = mount(LogViewer, { lines: many, height: 300, lineHeight: 30 }, makeCtx().ctx)!
    const v = render({ lines: many, height: 300, lineHeight: 30 })
    const rows = getRows(v)
    assert.ok(rows.length < 20, `应只渲染可见窗口，实际 ${rows.length}`)
  })

  it('滚动后窗口更新（setY）', () => {
    const { ctx, setY } = makeCtx()
    const many = Array.from({ length: 1000 }, (_, i) => `line-${i}`)
    const render = mount(LogViewer, { lines: many, height: 300 }, ctx)!
    setY(9000)
    const v = render({ lines: many, height: 300 })
    const rows = getRows(v)
    const first = rows[0]
    // 起点行 = floor(9000/24) - 5 = 370 → top = 370×24 = 8880px
    assert.match(first.props.style.top, /8880px/)
  })

  it('复制按钮存在', () => {
    const render = mount(LogViewer, { lines, height: 200, showCopy: true }, makeCtx().ctx)!
    const v = render({ lines, height: 200, showCopy: true })
    const btn = v.props.children.find((c: any) => c?.props?.class?.includes('wf-log-copy'))
    assert.ok(btn, '复制按钮应存在')
  })
})
