/** CronPicker：cron 表达式快捷输入（预置常见 + 自由编辑）（showcase /components/cronpicker） */
import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Input } from '../Input/Input.ts'
import { Select, type SelectOption } from '../Select/Select.ts'

/**
 * weifuwu/components — CronPicker
 *
 * cron 表达式输入原语：预置语义 + 自由编辑双通道。
 * - 预置面：常见档（每分钟/每 5 分钟/每小时/每天/工作日——单源 PRESETS）
 * - 自由面：Input 直编（任何 cron 表达式——服务端解析器裁决语义）
 * - 契约：preset 选中 → onChange（五段 * / N / N-M / N,M 与 server 解析器
 *   语义对齐——见 src/server/... cron 解析面）；自由输入全量直传。
 *
 * 来源：agent-platform CronPicker（平台层单一消费者 workflow 详情——入
 * 库判负登记已推翻（用户指令 = 第二消费面确立）——库件标准形（Select 单源
 * 表单面——替换原生 select）。
 */

export interface CronPickerProps {
  value: string
  onChange?: (v: string)=> void
  /** 预置档（默认 6 档——Preset 可覆盖——自定义场景） */
  presets?: { label: string; value: string }[]
  /** 预设选择占位文案 */
  placeholder?: string
}

export const CRON_PRESETS: { label: string; value: string }[] = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每 5 分钟', value: '*/5 * * * *' },
  { label: '每 30 分钟', value: '*/30 * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天 9:00', value: '0 9 * * *' },
  { label: '工作日 9:00（周一至五）', value: '0 9 * * 1-5' },
]

const optOf = (p: { label: string; value: string }): SelectOption => ({ label: p.label, value: p.value })

export const CronPicker: Component<CronPickerProps> = (_init, _ctx)=>
  (props)=> {
    const { value, onChange, presets = CRON_PRESETS, placeholder = '选择常用…' } = props
    const matched = presets.find((p)=> p.value === value)
    // 空（placeholder）固定为 ''——Select 无 '' 选项时显 placeholder
    const selectValue = matched ? matched.value : (presets.some((p)=> p.value === value) ? value : '')

    return h('div', { class: 'wf-row wf-gap-sm wf-items-center' }, [
      h(Select, {
        value: selectValue,
        placeholder,
        options: presets.map(optOf),
        onChange: (v: string | string[])=> {
          // 单选走 string；空清选（placeholder）忽略（预设清空无效——保留平台语义）
          if (typeof v === 'string' && v) onChange?.(v)
        },
      }),
      h('div', { class: 'wf-fill' }, [
        h(Input, {
          value,
          placeholder: '* * * * *',
          onInput: (e: Event)=> onChange?.((e.target as HTMLInputElement).value ?? ''),
        }),
      ]),
    ])
  }
