/**
 * 任务话语识别（PERSONA-PLAN P2）——前端消息状态角标
 * 体验不变 = 对话流即协作流：AI 的自然语言就是任务状态（真人也没有任务板）
 */

export type TaskMarker = 'claim' | 'progress' | 'handoff' | 'complete' | 'error'

export interface TaskMarkerResult {
  marker: TaskMarker | null
  label: string | null
}

/** 认领：我来/我处理/交给我 */
const CLAIM_RE = /^(好的|好|收到|可以|行)[，,。!！\s]*(我(来|处理|负责|接手)|交给我|让我来)/

/** 进度：正在/马上/稍等 */
const PROGRESS_RE = /(正在|先[看查]|马上|稍等|这就去)/

/** 移交：交给/委托/请.+处理/问一下 */
const HANDOFF_RE = /(交给|委托|转给|请[^，。]{1,12}(处理|查|分析|复核)|问一下[^，。]{1,12})/

/** 完成：完成/已完成/搞定/结果如下/报告/✅ */
const COMPLETE_RE = /^(✅|已完成|完成|搞定|做好了|结果如下|报告[：:])/

/** 失败：失败/报错/无法/搞不定/Error */
const ERROR_RE = /(失败|报错|无法|搞不定|Error|error|不可用)/

export function detectTaskMarker(content: string): TaskMarkerResult {
  if (!content) return { marker: null, label: null }
  const text = String(content).trim()
  // 完成优先（回复以汇报开头）
  if (COMPLETE_RE.test(text)) return { marker: 'complete', label: '✅ 已完成' }
  if (CLAIM_RE.test(text)) return { marker: 'claim', label: '📋 认领' }
  if (HANDOFF_RE.test(text)) return { marker: 'handoff', label: '↪ 移交' }
  if (ERROR_RE.test(text)) return { marker: 'error', label: '⚠️ 受阻' }
  if (PROGRESS_RE.test(text)) return { marker: 'progress', label: '⏳ 进行中' }
  return { marker: null, label: null }
}
