import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { diffLines, groupDiffLines } from './diff-utils.ts'
import type { DiffLine } from './diff-utils.ts'

export interface DiffViewProps {
  /** 旧代码 */
  oldCode: string
  /** 新代码 */
  newCode: string
  /** 旧标题 */
  oldTitle?: string
  /** 新标题 */
  newTitle?: string
  /** 连续未变行超过该值折叠为「↕ N 行」（默认 5；0 = 不折叠） */
  foldThreshold?: number
  /** 最大渲染行数（超出的变化行显示省略提示——防超大 diff 卡顿） */
  maxLines?: number
  className?: string
}

/**
 * DiffView — AI 代码生成/审查的 diff 展示。
 * 行级 LCS diff（自研纯函数）：same/add/remove 三态 + 未变块折叠。
 *
 * 展开状态用闭包 let + render()（手动模式）：`$` 深度 Proxy 包装的
 * Set 会破坏 Set.prototype.has 的 this 绑定（内置类型不可 Proxy 方法调用）。
 */
export const DiffView: Component<DiffViewProps> = (_init, ctx) => {
  let expanded = new Set<number>() // 已展开的折叠块索引（手动：不触发 $ Proxy）

  return (props) => {
    const {
      oldCode = '',
      newCode = '',
      oldTitle = '旧版',
      newTitle = '新版',
      foldThreshold = 5,
      maxLines = 2000,
      className = '',
    } = props

    const lines = diffLines(oldCode, newCode)
    const groups = groupDiffLines(lines)

    // 折叠块：same 且 sameCount > foldThreshold（foldThreshold=0 不折叠）
    const foldable = (g: (typeof groups)[number], idx: number) =>
      g.kind === 'same' && g.sameCount! > foldThreshold

    const isExpanded = (idx: number) => expanded.has(idx)

    const rows: any[] = []
    let lineCount = 0

    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]
      if (foldable(g, gi)) {
        const foldOpen = isExpanded(gi)
        rows.push(
          h('div', {
            class: 'wf-diffview-fold',
            role: 'button',
            tabindex: 0,
            onClick: () => {
              if (expanded.has(gi)) expanded.delete(gi)
              else expanded.add(gi)
              ctx.render()
            },
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (expanded.has(gi)) expanded.delete(gi)
                else expanded.add(gi)
                ctx.render()
              }
            },
          // 展开态文案：点击收起（2027-XX 实证——原「展开中」文案误导）
        }, foldOpen ? '收起未变行' : `↕ ${g.sameCount} 行未变`),
        )
        // **展开才渲染行（2027-XX 实证修复）**：原 `if (expanded)` 用 Set 对象本身判真——
        // 恒真与 foldOpen 状态脱钩——点击展开/收起后行数不变（状态切换失效）
        if (foldOpen) {
          for (const line of g.lines) {
            if (lineCount >= maxLines) break
            lineCount++
            rows.push(renderRow(line, lineCount))
          }
        }
      } else {
        for (const line of g.lines) {
          if (lineCount >= maxLines) break
          lineCount++
          rows.push(renderRow(line, lineCount))
        }
      }
    }

    if (lineCount >= maxLines) {
      rows.push(h('div', { class: 'wf-diffview-overflow' }, `… diff 过大，仅显示前 ${maxLines} 行`))
    }

    return h('div', { class: `wf-diffview${className ? ` ${className}` : ''}` }, [
      h('div', { class: 'wf-diffview-header' }, [
        h('span', { class: 'wf-diffview-title wf-diffview-title--old' }, oldTitle),
        h('span', { class: 'wf-diffview-arrow' }, '→'),
        h('span', { class: 'wf-diffview-title wf-diffview-title--new' }, newTitle),
      ]),
      h('div', { class: 'wf-diffview-body' }, rows),
    ])
  }
}

function renderRow(line: DiffLine, lineNo: number) {
  return h('div', { class: `wf-diffview-row wf-diffview-row--${line.type}` }, [
    h('span', { class: 'wf-diffview-sign' }, line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '),
    h('span', { class: 'wf-diffview-line' }, line.line === '' ? ' ' : line.line),
  ])
}
