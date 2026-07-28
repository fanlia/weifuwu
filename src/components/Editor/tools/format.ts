/**
 * weifuwu/components/Editor/tools — 格式化命令
 */

import type { FormatState, ToolbarItem } from './types.ts'

/** 查询当前选区格式状态 */
export function queryFormats(): FormatState {
  const f: FormatState = {}
  try {
    f.bold = document.queryCommandState('bold')
    f.italic = document.queryCommandState('italic')
    f.underline = document.queryCommandState('underline')
    const block = document.queryCommandValue('formatBlock')
    f.h1 = block === 'h1' || block === 'H1'
    f.h2 = block === 'h2' || block === 'H2'
    f.h3 = block === 'h3' || block === 'H3'
    f.blockquote = block === 'blockquote' || block === 'BLOCKQUOTE'
    f.alignLeft = document.queryCommandState('justifyLeft')
    f.alignCenter = document.queryCommandState('justifyCenter')
    f.alignRight = document.queryCommandState('justifyRight')
  } catch { /* 安全忽略 */ }
  return f
}

/** 执行 document.execCommand */
export function exec(cmd: string, value?: string) {
  try {
    document.execCommand(cmd, false, value)
  } catch { /* 安全忽略 */ }
}

/** 根据工具项执行格式化 */
export function execFormat(item: ToolbarItem) {
  switch (item) {
    case 'bold': exec('bold'); break
    case 'italic': exec('italic'); break
    case 'underline': exec('underline'); break
    case 'h1': exec('formatBlock', '<h1>'); break
    case 'h2': exec('formatBlock', '<h2>'); break
    case 'h3': exec('formatBlock', '<h3>'); break
    case 'ul': exec('insertUnorderedList'); break
    case 'ol': exec('insertOrderedList'); break
    case 'blockquote': exec('formatBlock', '<blockquote>'); break
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
