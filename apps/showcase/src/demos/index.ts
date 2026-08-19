/**
 * demo 注册表——组件页活体区按组件名（卡片 title）查找
 * 自动生成（scripts/migrate-demos.mjs）——勿手改
 */
import type { Component } from 'weifuwu/vdom'
import { DEMOS as C_ai_chat } from './ai-chat.tsx'
import { DEMOS as C_data_display } from './data-display.tsx'
import { DEMOS as C_data_feedback } from './data-feedback.tsx'
import { DEMOS as C_form_advanced } from './form-advanced.tsx'
import { DEMOS as C_form_core } from './form-core.tsx'
import { DEMOS as C_form_select } from './form-select.tsx'
import { DEMOS as C_navigation } from './navigation.tsx'
import { DEMOS as C_new_batch } from './new-batch.tsx'
import { DEMOS as C_others } from './others.tsx'

export const DEMOS: Record<string, any> = {
  ...C_ai_chat,
  ...C_data_display,
  ...C_data_feedback,
  ...C_form_advanced,
  ...C_form_core,
  ...C_form_select,
  ...C_navigation,
  ...C_new_batch,
  ...C_others,
}
