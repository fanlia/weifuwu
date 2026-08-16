/**
 * Editor tools 单元测试（toolbar/table——模块级函数全分支）
 *
 * 覆盖：
 * - renderToolbar：分组分隔符、active 高亮态、link 按钮 class
 * - tableHtml：表格 HTML 生成（事件流事务层——embed 快照）
 * - renderTableGrid：6×6 网格、hover 高亮、label、onSelect/onHover/onLeave 回调
 */

import { test, before, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../../test/client/setup.ts'
before(setupJsdom)

import { renderToolbar } from './toolbar.ts'
import { tableHtml, renderTableGrid } from './table.ts'
import type { ToolbarItem } from './types.ts'

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
  children.find((c: any) => c.props?.['data-item'] === 'italic')!.props.onClick({ currentTarget: null })
  assert.deepEqual(got, ['italic'])
})

// ═══════════ table.ts ═══════════

test('tableHtml：2×3 表格 HTML（表头加粗 + &nbsp;）', () => {
  const html = tableHtml(2, 3)
  const container = document.createElement('div')
  container.innerHTML = html
  const table = container.querySelector('table.wf-editor-table')
  assert.ok(table, '包含 <table class="wf-editor-table">')
  const rows = table!.querySelectorAll('tr')
  assert.equal(rows.length, 2, '2 行')
  assert.equal(rows[0].querySelectorAll('td').length, 3, '3 列')
  assert.equal(rows[1].querySelectorAll('td').length, 3)
  // 表头加粗 + &nbsp; 单元格
  const headerTd = rows[0].querySelector('td')!
  assert.ok(headerTd.style.fontWeight, '表头有加粗样式')
  assert.equal(rows[1].querySelector('td')!.innerHTML, '&nbsp;', '单元格 &nbsp;')
})

test('tableHtml：行列参数', () => {
  assert.equal(tableHtml(1, 1).includes('<tr>'), true)
  assert.equal(tableHtml(0, 0).includes('<tbody></tbody>'), true)
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
