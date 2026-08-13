/**
 * weifuwu/components/Editor/tools — 格式化命令
 */

import type { FormatState, ToolbarItem } from './types.ts'
import { createClientBrowser } from '../../../ui-dom/browser.ts'

// 编辑器工具：无组件 ctx——模块级 browser（SSR 时 queryCommand 返回安全默认）
const browser = createClientBrowser()

/** 选区所在块的文本对齐（DOM 检测——queryCommandState 不识别 CSS class/计算样式对齐：
 *  光标在 class="wf-text-center" 的块内，toolbar 却显示左对齐——真实用户报告）。
 *  检测优先级：inline style → wf-text-* class → 计算样式 */
function queryBlockAlign(): string | null {
  try {
    const sel = browser.getSelection()
    if (!sel || !sel.rangeCount) return null
    const range = sel.getRangeAt(0)
    let el = (range.startContainer as Element).nodeType === 1
      ? (range.startContainer as Element)
      : ((range.startContainer as Node).parentElement ?? null)
    while (el) {
      // 到 contentEditable 边界停止（块 = 编辑器内最近元素）
      if (el.getAttribute?.('contenteditable') === 'true') break
      const inline = (el as HTMLElement).style?.textAlign
      if (inline) return inline
      if (el.classList?.contains('wf-text-center')) return 'center'
      if (el.classList?.contains('wf-text-right')) return 'right'
      if (el.classList?.contains('wf-text-left')) return 'left'
      el = el.parentElement
    }
    // 计算样式兜底（继承对齐）
    const first = (range.startContainer as Node).parentElement
    if (first && first.ownerDocument?.defaultView) {
      const cs = first.ownerDocument.defaultView.getComputedStyle(first)
      const ta = cs?.textAlign
      if (ta && ta !== 'start' && ta !== 'initial') return ta
    }
    return null
  } catch {
    return null
  }
}

/** 查询当前选区格式状态 */
export function queryFormats(): FormatState {
  const f: FormatState = {}
  try {
    f.bold = browser.queryCommandState('bold')
    f.italic = browser.queryCommandState('italic')
    f.underline = browser.queryCommandState('underline')
    const block = browser.queryCommandValue('formatBlock')
    f.h1 = block === 'h1' || block === 'H1'
    f.h2 = block === 'h2' || block === 'H2'
    f.h3 = block === 'h3' || block === 'H3'
    f.blockquote = block === 'blockquote' || block === 'BLOCKQUOTE'
    // 对齐：queryCommandState + 块 DOM 检测合并（class 居中/计算样式——state 不识别）
    const blockAlign = queryBlockAlign()
    f.alignLeft = browser.queryCommandState('justifyLeft') || blockAlign === 'left'
    f.alignCenter = browser.queryCommandState('justifyCenter') || blockAlign === 'center'
    f.alignRight = browser.queryCommandState('justifyRight') || blockAlign === 'right'
  } catch { /* 安全忽略 */ }
  return f
}

/** 执行 execCommand（经 browser 环境抽象） */
export function exec(cmd: string, value?: string) {
  try {
    browser.execCommand(cmd, value)
  } catch { /* 安全忽略 */ }
}

/** formatBlock 目标值（toggle 用） */
const FORMAT_BLOCK: Record<string, string> = {
  h1: '<h1>', h2: '<h2>', h3: '<h3>', blockquote: '<blockquote>',
}
/** 反选回退的默认块（与 clear 命令一致） */
const DEFAULT_BLOCK = '<div>'

/** 根据工具项执行格式化（formatBlock 类带 toggle：当前已是该块格式 → 回默认块——
 *  真实浏览器验收发现 Chrome 对重复 formatBlock 同值不切换，标题/引用无法反选） */
export function execFormat(item: ToolbarItem) {
  switch (item) {
    case 'bold': exec('bold'); break
    case 'italic': exec('italic'); break
    case 'underline': exec('underline'); break
    case 'h1': case 'h2': case 'h3': case 'blockquote': {
      const cur = queryFormats()
      exec('formatBlock', cur[item] ? DEFAULT_BLOCK : FORMAT_BLOCK[item])
      break
    }
    case 'ul': exec('insertUnorderedList'); break
    case 'ol': exec('insertOrderedList'); break
    case 'alignLeft': exec('justifyLeft'); break
    case 'alignCenter': exec('justifyCenter'); break
    case 'alignRight': exec('justifyRight'); break
    case 'hr': exec('insertHorizontalRule'); break
    case 'image': /* handled specially */ break
    case 'link': /* handled specially */ break
    case 'clear': exec('removeFormat'); exec('formatBlock', '<div>'); break
    case 'source': /* handled specially */ break
  }
}
