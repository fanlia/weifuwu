/**
 * showcase — platform-migrate 组（agent-platform 入库组件展示）
 * CronPicker · ListScaffold · StatusDot —— 三个平台原语的活体 demo
 */
import type { UIContext } from 'weifuwu/vdom'
import { h } from 'weifuwu/vdom'
import { CronPicker, ListScaffold, StatusDot, Button, Tag } from 'weifuwu/components'

/* ── CronPicker —— preset/自由编辑双通道 ── */
export const DemoCronPicker = (_init: {}, ctx: UIContext) => {
  let value = '*/5 * * * *'
  return () => (
    <div class="wf-stack wf-gap-md">
      <CronPicker value={value} onChange={(v) => { value = v; ctx.render() }} />
      <div class="wf-row wf-gap-sm wf-items-center">
        <span class="wf-font-xs wf-text-secondary">当前值：</span>
        <Tag>{value}</Tag>
      </div>
    </div>
  )
}

/* ── ListScaffold —— 骨架 + 空态显式（isEmpty 契约演示）── */
export const DemoListScaffold = (_init: {}, ctx: UIContext) => {
  let isEmpty = true
  return () => (
    <div style="max-width:640px">
      <div class="wf-row wf-gap-sm wf-padding-sm">
        <Button size="sm" onClick={() => { isEmpty = !isEmpty; ctx.render() }}>{isEmpty ? '显示数据' : '变空'}</Button>
        <span class="wf-font-xs wf-text-secondary">isEmpty={String(isEmpty)}（空态仅在 isEmpty 时渲染——防并存）</span>
      </div>
      <ListScaffold
        title="交付物列表"
        sub="列表页骨架演示"
        toolbar={<div class="wf-row wf-gap-sm"><span class="wf-font-sm wf-text-secondary">工具栏区（搜索/筛选）</span></div>}
        empty={{ icon: '📦', text: '暂无交付物', hint: '创建第一个交付物开始' }}
        isEmpty={isEmpty}
      >
        {!isEmpty && (
          <div class="wf-stack wf-gap-sm">
            <div class="wf-row wf-gap-md wf-border wf-padding-sm wf-radius-md"><span>交付物 A</span><Tag>ready</Tag></div>
            <div class="wf-row wf-gap-md wf-border wf-padding-sm wf-radius-md"><span>交付物 B</span><Tag>building</Tag></div>
          </div>
        )}
      </ListScaffold>
    </div>
  )
}

/* ── StatusDot —— on/tone 语义矩阵 ── */
export const DemoStatusDot = (_init: {}, _ctx: UIContext) => {
  const ROWS: { label?: string; desc: string; props: { on?: boolean; tone?: 'success' | 'warning' | 'error' | 'default' } }[] = [
    { label: '运行中（on）', desc: 'success', props: { on: true } },
    { label: '已暂停（off）', desc: 'default', props: { on: false } },
    { label: '降级（warning）', desc: 'warning', props: { on: true, tone: 'warning' } },
    { label: '故障（error）', desc: 'error', props: { on: true, tone: 'error' } },
    { desc: '仅点（label 缺省——文字是调用方职责）', props: { on: true } },
  ]
  return () => (
    <div class="wf-stack wf-gap-sm">
      {ROWS.map((r, i) => (
        <div key={i} class="wf-row wf-gap-md wf-items-center">
          <StatusDot {...r.props} label={r.label} />
          <span class="wf-font-xs wf-text-secondary">{r.desc}</span>
        </div>
      ))}
    </div>
  )
}

export const DEMOS: Record<string, any> = {
  CronPicker: DemoCronPicker,
  ListScaffold: DemoListScaffold,
  StatusDot: DemoStatusDot,
}
