/**
 * weifuwu/components/Editor/tools — 格式化命令
 */

import type { FormatState, ToolbarItem } from './types.ts'
import { createClientBrowser } from '../../../client/browser.ts'

// 编辑器工具：无组件 ctx——模块级 browser（SSR 时 queryCommand 返回安全默认）
const browser = createClientBrowser()

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
    f.alignLeft = browser.queryCommandState('justifyLeft')
    f.alignCenter = browser.queryCommandState('justifyCenter')
    f.alignRight = browser.queryCommandState('justifyRight')
  } catch { /* 安全忽略 */ }
  return f
}

/** 执行 execCommand（经 browser 环境抽象） */
export function exec(cmd: string, value?: string) {
  try {
    browser.execCommand(cmd, value)
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
