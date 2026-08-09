/**
 * weifuwu/components/Editor/tools — 表格工具
 */

import { h } from '../../../client/vnode.ts'
import { createClientBrowser } from '../../../client/browser.ts'

// 编辑器工具：无组件 ctx——模块级 browser（SSR 时 getSelection/createElement 返回安全默认）
const browser = createClientBrowser()

/** 最大表格行列数 */
const MAX = 6

/** 在光标处插入表格 HTML */
export function insertTable(rows: number, cols: number): void {
  const sel = browser.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  if (!range) return

  const table = browser.createElement('table')
  const tbody = browser.createElement('tbody')
  if (!table || !tbody) return

  table.className = 'wf-editor-table'

  for (let ri = 0; ri < rows; ri++) {
    const tr = browser.createElement('tr')
    if (!tr) continue
    for (let ci = 0; ci < cols; ci++) {
      const td = browser.createElement('td')
      if (!td) continue
      if (ri === 0) {
        td.style.fontWeight = 'var(--wf-font-weight-semibold,600)'
      }
      td.innerHTML = '&nbsp;'
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }

  table.appendChild(tbody)

  const wrapper = browser.createElement('div')
  if (!wrapper) return
  wrapper.appendChild(table)

  range.deleteContents()
  range.insertNode(wrapper)

  range.setStartAfter(wrapper)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 渲染 6×6 表格选择网格 */
export function renderTableGrid(
  hoverRow: number,
  hoverCol: number,
  onSelect: (rows: number, cols: number) => void,
  onHover: (row: number, col: number) => void,
  onLeave: () => void,
): any {
  const grid = h('div', {
    class: 'wf-editor-table-grid',
    onMouseLeave: onLeave,
  }, Array.from({ length: MAX }, (_, ri) =>
    h('div', { class: 'wf-editor-table-grid-row', key: `r${ri}` },
      Array.from({ length: MAX }, (_, ci) => {
        const isHighlighted = ri <= hoverRow && ci <= hoverCol
        return h('div', {
          class: `wf-editor-table-grid-cell${isHighlighted ? ' wf-editor-table-grid-cell--active' : ''}`,
          key: `${ri}-${ci}`,
          onMouseEnter: () => onHover(ri, ci),
          onClick: () => onSelect(ri + 1, ci + 1),
        })
      }),
    ),
  ))

  const label = hoverRow >= 0 && hoverCol >= 0
    ? `${hoverRow + 1} × ${hoverCol + 1} 表格`
    : '选择表格大小'

  return h('div', {
    class: 'wf-editor-table-picker',
    onMouseDown: (e: Event) => e.stopPropagation(),
  }, [
    grid,
    h('div', { class: 'wf-editor-table-picker-label' }, label),
  ])
}
