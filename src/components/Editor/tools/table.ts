/**
 * weifuwu/components/Editor/tools — 表格工具
 */

import { h } from '../../../client/vnode.ts'

/** 最大表格行列数 */
const MAX = 6

/** 在光标处插入表格 HTML */
export function insertTable(rows: number, cols: number): void {
  const tds = Array.from({ length: cols }, (_, ci) =>
    `<td${ci === 0 ? ' style="font-weight:var(--wf-font-weight-semibold,600)"' : ''}>&nbsp;</td>`
  ).join('')

  const rowsHtml = Array.from({ length: rows }, (_, ri) =>
    `<tr>${ri === 0 ? tds : tds.replace(/ style="[^"]*"/, '')}</tr>`
  ).join('')

  const html = `<div><table class="wf-editor-table"><tbody>${rowsHtml}</tbody></table></div>`
  try { document.execCommand('insertHTML', false, html) } catch { /* 安全忽略 */ }
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
