/**
 * Editor tools 单元测试（format/toolbar/table——模块级函数全分支）
 *
 * 覆盖：
 * - execFormat：18 个 item 分支 → document.execCommand 命令透传（spy）
 * - queryFormats：queryCommandState/Value → FormatState 字段映射（spy）
 * - renderToolbar：分组分隔符、active 高亮态、link 按钮 class
 * - insertTable：真实 DOM 插入（行列/表头加粗/&nbsp;/caret 移动）
 * - renderTableGrid：6×6 网格、hover 高亮、label、onSelect/onHover/onLeave 回调
 */

import { test, before, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../../test/client/setup.ts'
before(setupJsdom)

import { execFormat, queryFormats } from './format.ts'
import { renderToolbar } from './toolbar.ts'
import { insertTable, renderTableGrid } from './table.ts'
import type { ToolbarItem } from './types.ts'

/** 收集 document.execCommand 调用（jsdom 原生为 no-op/不存在——spy 记录并安全返回） */
function spyExec(): string[][] {
  const calls: string[][] = []
  ;(document as any).execCommand = (cmd: string, _ui?: boolean, value?: string) => {
    calls.push([cmd, value ?? ''])
    return false
  }
  return calls
}

/** 收集 queryCommandState/Value 调用并返回预设值 */
function spyQuery(state: Record<string, boolean>, value: Record<string, string>): void {
  ;(document as any).queryCommandState = (cmd: string) => state[cmd] ?? false
  ;(document as any).queryCommandValue = (cmd: string) => value[cmd] ?? ''
}

afterEach(() => {
  delete (document as any).execCommand
  delete (document as any).queryCommandState
  delete (document as any).queryCommandValue
})

// ═══════════ format.ts ═══════════

test('execFormat：全部分支 → execCommand 命令透传', () => {
  const calls = spyExec()
  const cases: Array<[ToolbarItem, string[]]> = [
    ['bold', ['bold']],
    ['italic', ['italic']],
    ['underline', ['underline']],
    ['h1', ['formatBlock', '<h1>']],
    ['h2', ['formatBlock', '<h2>']],
    ['h3', ['formatBlock', '<h3>']],
    ['ul', ['insertUnorderedList']],
    ['ol', ['insertOrderedList']],
    ['blockquote', ['formatBlock', '<blockquote>']],
    ['alignLeft', ['justifyLeft']],
    ['alignCenter', ['justifyCenter']],
    ['alignRight', ['justifyRight']],
    ['hr', ['insertHorizontalRule']],
    ['clear', ['removeFormat', 'formatBlock', '<div>']], // clear = removeFormat + formatBlock div
  ]
  for (const [item, expected] of cases) {
    calls.length = 0
    execFormat(item)
    if (item === 'clear') {
      assert.deepEqual(calls, [['removeFormat', ''], ['formatBlock', '<div>']], 'clear = removeFormat + formatBlock div')
    } else {
      assert.equal(calls.length, 1, `${item} 应调用 1 次 execCommand`)
      assert.equal(calls[0][0], expected[0], `${item} → ${expected[0]}`)
      if (expected[1]) assert.equal(calls[0][1], expected[1], `${item} value → ${expected[1]}`)
    }
  }
  // 特殊处理项不调 execCommand
  for (const item of ['image', 'link', 'source'] as ToolbarItem[]) {
    calls.length = 0
    execFormat(item)
    assert.equal(calls.length, 0, `${item} 应由 Editor 特殊处理，不调 execCommand`)
  }
})

test('queryFormats：queryCommandState/Value → FormatState 字段映射', () => {
  spyQuery(
    { bold: true, italic: false, underline: true, justifyCenter: true, justifyLeft: false, justifyRight: false },
    { formatBlock: 'h2' },
  )
  const f = queryFormats()
  assert.equal(f.bold, true)
  assert.equal(f.italic, false)
  assert.equal(f.underline, true)
  assert.equal(f.h1, false, 'formatBlock=h2 → h1 false')
  assert.equal(f.h2, true, 'formatBlock=h2 → h2 true')
  assert.equal(f.h3, false)
  assert.equal(f.alignCenter, true, 'justifyCenter → alignCenter')
  assert.equal(f.alignLeft, false)
  assert.equal(f.alignRight, false)
})

test('queryFormats：jsdom 无 execCommand 时不抛（安全兜底）', () => {
  delete (document as any).queryCommandState
  delete (document as any).queryCommandValue
  assert.doesNotThrow(() => queryFormats())
})

// ═══════════ toolbar.ts ═══════════

test('renderToolbar：分组分隔符数量与位置', () => {
  const vnode = renderToolbar(['bold', 'italic', 'h1', 'ul', 'blockquote', 'image', 'link', 'source'], {}, false, () => {})
  const children = vnode.props.children as any[]
  const seps = children.filter((c: any) => c?.props?.class === 'wf-editor-tb-sep')
  // 分组边界：format|heading|list|block|insert|source = 5 个分隔符
  assert.equal(seps.length, 5, `应有 5 个分组分隔符，实际 ${seps.length}`)
  const order = children.map((c: any) => c.props?.['data-item'] ?? 'sep')
  assert.deepEqual(order, ['bold', 'italic', 'sep', 'h1', 'sep', 'ul', 'sep', 'blockquote', 'sep', 'image', 'link', 'sep', 'source'])
})

test('renderToolbar：active 格式高亮（wf-editor-tb-btn--active）', () => {
  const vnode = renderToolbar(['bold', 'italic', 'h1'], { bold: true, h1: true }, false, () => {})
  const children = vnode.props.children as any[]
  const boldBtn = children.find((c: any) => c.props?.['data-item'] === 'bold')
  const italicBtn = children.find((c: any) => c.props?.['data-item'] === 'italic')
  const h1Btn = children.find((c: any) => c.props?.['data-item'] === 'h1')
  assert.ok(boldBtn.props.class.includes('wf-editor-tb-btn--active'), 'bold active')
  assert.ok(!italicBtn.props.class.includes('wf-editor-tb-btn--active'), 'italic 非 active')
  assert.ok(h1Btn.props.class.includes('wf-editor-tb-btn--active'), 'h1 active')
})

test('renderToolbar：source 模式 source 按钮高亮 + link 按钮专用 class', () => {
  const vnode = renderToolbar(['link', 'source'], {}, true, () => {})
  const children = vnode.props.children as any[]
  const linkBtn = children.find((c: any) => c.props?.['data-item'] === 'link')
  const sourceBtn = children.find((c: any) => c.props?.['data-item'] === 'source')
  assert.ok(linkBtn.props.class.includes('wf-editor-tb-btn--link'), 'link 按钮有专用 class')
  assert.ok(sourceBtn.props.class.includes('wf-editor-tb-btn--active'), 'source 模式 source 按钮高亮')
})

test('renderToolbar：点击触发 onItem 回调（item 透传）', () => {
  const got: ToolbarItem[] = []
  const vnode = renderToolbar(['bold', 'italic'], {}, false, (item) => got.push(item))
  const children = vnode.props.children as any[]
  children.find((c: any) => c.props?.['data-item'] === 'italic')!.props.onClick()
  assert.deepEqual(got, ['italic'])
})

// ═══════════ table.ts ═══════════

test('insertTable：在 caret 处插入 2×3 表格（表头加粗 + &nbsp; + caret 移到表后）', () => {
  const container = document.createElement('div')
  container.innerHTML = '<p>abc</p>'
  document.body.appendChild(container)
  try {
    // caret 放到 <p>abc</p> 文本开头
    const text = container.firstChild!.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 0)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    insertTable(2, 3)

    const table = container.querySelector('table.wf-editor-table')
    assert.ok(table, '应插入 <table class="wf-editor-table">')
    const rows = table!.querySelectorAll('tr')
    assert.equal(rows.length, 2, '2 行')
    assert.equal(rows[0].querySelectorAll('td').length, 3, '3 列')
    assert.equal(rows[1].querySelectorAll('td').length, 3)
    // 表头加粗 + &nbsp; 单元格
    const headerTd = rows[0].querySelector('td')!
    assert.ok(headerTd.style.fontWeight, '表头有加粗样式')
    assert.equal(rows[1].querySelector('td')!.innerHTML, '&nbsp;', '单元格 &nbsp;')
    // caret 移到表格后（selection 在 table 之后）
    const sel2 = window.getSelection()!
    assert.ok(sel2.rangeCount > 0, 'caret 保留')
    const after = sel2.getRangeAt(0).startContainer
    assert.ok(after === container || after.nodeType === 1, 'caret 在表格后')
  } finally {
    container.remove()
  }
})

test('insertTable：无选区时不操作（不抛）', () => {
  window.getSelection()!.removeAllRanges()
  assert.doesNotThrow(() => insertTable(2, 2))
})

test('renderTableGrid：6×6 网格 + hover 高亮 + label + 回调', () => {
  let selected: [number, number] | null = null
  let hovered: [number, number] | null = null
  let left = false
  const vnode = renderTableGrid(2, 3, (r, c) => { selected = [r, c] }, (r, c) => { hovered = [r, c] }, () => { left = true })

  const rows = vnode.props.children[0].props.children as any[]
  assert.equal(rows.length, 6, '6 行')
  assert.equal(rows[0].props.children.length, 6, '每行 6 格')

  // hover(2,3)：高亮 3×4=12 个 cell（row<=2 && col<=3）
  const cells = rows.flatMap((r: any) => r.props.children as any[])
  const active = cells.filter((c: any) => c.props.class.includes('--active'))
  assert.equal(active.length, 12, `hover(2,3) 应高亮 12 格，实际 ${active.length}`)
  // label 显示 "3 × 4 表格"
  const label = vnode.props.children[1]
  assert.equal(label.props.children, '3 × 4 表格')

  // 回调：onMouseEnter → onHover；onClick → onSelect（行列 +1）；onMouseLeave → onLeave
  cells[0].props.onMouseEnter()
  assert.deepEqual(hovered, [0, 0])
  cells[0].props.onClick()
  assert.deepEqual(selected, [1, 1])
  vnode.props.children[0].props.onMouseLeave()
  assert.equal(left, true)
})

test('renderTableGrid：无 hover 时 label 默认提示', () => {
  const vnode = renderTableGrid(-1, -1, () => {}, () => {}, () => {})
  const label = vnode.props.children[1]
  assert.equal(label.props.children, '选择表格大小')
})
