/**
 * weifuwu/components — LogViewer
 *
 * 日志流查看器（Agent 执行日志 / CI 输出）：ANSI 着色 + 虚拟滚动 + 自动跟随。
 * 复用 VirtualList 滚动基座（useScrollPosition + rAF 节流）。
 * 裁剪（CS-05，见 design/components-cuts.md）：正则高亮、多日志源合并、搜索定位。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface LogViewerProps {
  lines: string[]
  /** 视口高度（px），默认 400 */
  height?: number
  /** 行高（px），默认 24 */
  lineHeight?: number
  /** 可见区外额外渲染行数 */
  overscan?: number
  /** 自动跟随：新行到达时若已在底部则滚到底（默认 true） */
  follow?: boolean
  /** 只显示尾部 N 行（内存保护，默认不限） */
  maxLines?: number
  /** 显示复制按钮（默认 true） */
  showCopy?: boolean
  /** 显示行号（默认 true） */
  showLineNumbers?: boolean
  className?: string
}

const ansiRe = /\x1b\[([\d;]*)m/g

/** ANSI 转义解析（16 色 + 粗体 + 背景 8 色）：累积样式到 reset 为止，零依赖 */
export function parseAnsi(text: string): any[] {
  const nodes: any[] = []
  let last = 0
  let active = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = ansiRe.exec(text))) {
    const plain = text.slice(last, m.index)
    if (plain) {
      if (active.size) nodes.push(h('span', { class: [...active].join(' ') }, plain))
      else nodes.push(plain)
    }
    const codes = m[1].split(';').filter(Boolean)
    for (const c of codes) {
      if (c === '0') active.clear()
      else if (c === '1') active.add('wf-log-ansi--bold')
      else if (+c >= 30 && +c <= 37) active.add(`wf-log-ansi--${c}`)
      else if (+c >= 40 && +c <= 47) active.add(`wf-log-ansi--bg${c}`)
      // 其他 code（22/39 等）忽略——诚实裁剪
    }
    last = ansiRe.lastIndex
  }
  const tail = text.slice(last)
  if (tail) {
    if (active.size) nodes.push(h('span', { class: [...active].join(' ') }, tail))
    else nodes.push(tail)
  }
  return nodes
}

export const LogViewer: Component<LogViewerProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let bodyEl: HTMLElement | null = null
  let lastLineCount = 0
  let atBottom = true
  const scroll = ctx.ui.useScrollPosition({ getScroller: () => bodyEl ?? null })

  const stableRef = (node: HTMLElement | null) => {
    if (node) {
      bodyEl = node
      scroll.refresh()
    } else {
      bodyEl = null
    }
  }

  const copyLines = async (lines: string[]) => {
    // 复制统一经 ctx.browser（clipboard + execCommand 降级）
    await ctx.browser?.copyText(lines.join('\n'))
  }

  return async (props: LogViewerProps) => {
    const {
      lines, height = 400, lineHeight = 24, overscan = 5,
      follow = true, maxLines, showCopy = true, showLineNumbers = true, className,
    } = props

    // maxLines 截断：只显示尾部 N 行（行号保持原文位置）
    const offset = maxLines != null && lines.length > maxLines ? lines.length - maxLines : 0
    const viewLines = maxLines != null && lines.length > maxLines ? lines.slice(-maxLines) : lines
    const total = viewLines.length

    // 自动跟随：行数增加 + 之前在底部 → 滚到底（DOM 挂载后微任务设置 scrollTop）
    if (follow && lines.length !== lastLineCount) {
      lastLineCount = lines.length
      if (atBottom && bodyEl) {
        queueMicrotask(() => {
          if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight
        })
      }
    } else {
      lastLineCount = lines.length
    }

    // 滚动位置 → 是否在底部（用户手动上翻停止跟随）
    const totalHeight = total * lineHeight
    if (bodyEl) {
      atBottom = scroll.y + height >= totalHeight - 2
    }

    const start = Math.max(0, Math.floor(scroll.y / lineHeight) - overscan)
    const end = Math.min(total, Math.ceil((scroll.y + height) / lineHeight) + overscan)

    const spacer = h('div', {
      class: 'wf-log-spacer',
      style: { height: `${totalHeight}px` },
    })

    const rows: any[] = []
    for (let i = start; i < end; i++) {
      const lineNo = i + offset + 1
      rows.push(h('div', {
        class: 'wf-log-row',
        style: { position: 'absolute', top: `${i * lineHeight}px`, left: 0, right: 0, height: `${lineHeight}px` },
        key: `${lineNo}:${viewLines[i]}`,
      }, [
        showLineNumbers ? h('span', { class: 'wf-log-line-no' }, String(lineNo)) : null,
        h('span', { class: 'wf-log-line-content' }, parseAnsi(viewLines[i])),
      ].filter(Boolean)))
    }

    const copyBtn = showCopy
      ? h('button', {
          class: 'wf-log-copy',
          'aria-label': '复制全部日志',
          onClick: () => void copyLines(lines),
        }, h(Icon, { name: 'copy', size: 14 }))
      : null

    const body = total === 0
      ? h('div', { class: 'wf-log-empty' }, '暂无日志')
      : h('div', {
          class: 'wf-log-body',
          style: { position: 'relative', width: '100%', height: `${height}px`, overflowY: 'auto' },
          ref: stableRef,
        }, [spacer, ...rows])

    return h('div', {
      class: ['wf-log-viewer', className].filter(Boolean).join(' '),
      style: { width: '100%' },
    }, [
      copyBtn,
      body,
    ].filter(Boolean))
  }
}
