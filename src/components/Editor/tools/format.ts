/**
 * weifuwu/components/Editor/tools — 格式化命令
 */

import type { FormatState, ToolbarItem } from './types.ts'
import { createClientBrowser } from '../../../ui-dom/browser.ts'

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
