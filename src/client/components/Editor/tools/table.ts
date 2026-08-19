/**
 * weifuwu/components/Editor/tools — 表格工具
 *
 * 事件流事务层（design/editor-events-plan.md 阶段 1）：表格 = embed 事件——
 * 本模块只生成 HTML（不再操作 DOM/execCommand）。
 */

import { h } from '../../../vdom/index.ts'

/** 最大表格行列数 */
const MAX = 6

/** 生成表格 HTML（表头行加粗——模型 embed 快照） */
export function tableHtml(rows: number, cols: number): string {
  let out = '<table class="wf-editor-table"><tbody>'
  for (let ri = 0; ri < rows; ri++) {
    out += '<tr>'
    for (let ci = 0; ci < cols; ci++) {
      out += ri === 0
        ? '<td style="font-weight:var(--wf-font-weight-semibold,600)">&nbsp;</td>'
        : '<td>&nbsp;</td>'
    }
    out += '</tr>'
  }
  out += '</tbody></table>'
  return out
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
