/**
 * CronPicker — cron 表达式快捷输入（预置常见 + 自由编辑）
 * 平台层组件（单一消费者 workflow 详情——第二个消费者出现再入框架组件库）
 * 预置语义与 server 解析器（分 时 日 月 周——* / N N-M N,M）对齐
 */
import type { Component } from 'weifuwu/vdom'
import { Input } from 'weifuwu/components'

const PRESETS: { label: string; value: string }[] = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每 5 分钟', value: '*/5 * * * *' },
  { label: '每 30 分钟', value: '*/30 * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天 9:00', value: '0 9 * * *' },
  { label: '工作日 9:00（周一至五）', value: '0 9 * * 1-5' },
]

export const CronPicker: Component<{ value: string; onChange: (v: string) => void }> = (_init, _ctx) =>
  (props) => {
    const { value, onChange } = props
    return (
      <div class="wf-row wf-gap-sm wf-items-center">
        <select
          class="wf-font-xs"
          value={PRESETS.find((p) => p.value === value)?.value ?? ''}
          onChange={(e: any) => { const v = String((e.target as any).value); if (v) onChange(v) }}
        >
          <option value="">选择常用…</option>
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}（{p.value}）</option>)}
        </select>
        <div class="wf-fill">
          <Input value={value} placeholder={'*/5 * * * *'} onInput={(e: any) => onChange((e.target as any).value ?? '')} />
        </div>
      </div>
    )
  }
