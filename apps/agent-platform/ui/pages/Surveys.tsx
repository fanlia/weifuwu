/**
 * 问卷活动页（BUSINESS-SCENARIO-PLAN W2——G-G 开箱）
 *
 * 发起面板：问卷 URL + 内置人设勾选 → 一键角色池（每角色独立部门/沙盒——并发契约）
 * + 活动创建——活动列表：进度 / 失败摘要 / 重试 / 取消。
 * 替代路径：手工 seed-survey-agents.mjs（注册租户后先跑脚本——无开箱——已歼灭）。
 */
import type { UIContext, Component } from 'weifuwu/vdom'
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Loading, Select } from 'weifuwu/components'
import { errMsg, PageHeader } from '../components/ui'
import { inputValue } from '../lib/types'

/** 内置人设（与 seed 一致的精简版——企业可后续扩展） */
const BUILTIN_PERSONAS = [
  { name: '财务小王', roleLabel: '财务视角', expertise: '成本/预算/ROI', prompt: '你是财务部的小王，35 岁，关注成本与预算。填问卷时：对价格敏感，倾向低分，反馈聚焦性价比与 ROI。回答简洁务实。' },
  { name: '市场小李', roleLabel: '市场视角', expertise: '品牌/渠道/增长', prompt: '你是市场部的小李，28 岁，关注品牌与增长。填问卷时：乐观积极，给高分，反馈聚焦品牌传播与市场活动。语气热情。' },
  { name: '产品老张', roleLabel: '产品视角', expertise: '体验/功能/roadmap', prompt: '你是产品经理老张，38 岁，关注体验与功能。填问卷时：评分中等偏上，反馈聚焦易用性与功能缺口，给具体改进建议。' },
  { name: '客服小陈', roleLabel: '客服视角', expertise: '售后/响应/满意度', prompt: '你是客服主管小陈，30 岁，关注售后响应。填问卷时：评分取决于售后体验的想象，反馈聚焦响应速度与服务态度。' },
  { name: '研发大刘', roleLabel: '技术视角', expertise: '性能/安全/架构', prompt: '你是技术负责人大刘，40 岁，关注性能与安全。填问卷时：评分保守（3-4），反馈聚焦技术稳定性、安全性与性能指标。' },
]

interface CampaignRow {
  id: string
  status: string
  total: number
  completed: number
  failed: number
  created_at: string
}

interface SurveysState {
  loading: boolean; creating: boolean
  url: string
  concurrency: string
  selected: Record<string, boolean>
  campaigns: CampaignRow[]
  error: string
}

export const Surveys: Component = (_props, ctx) => {
  const $ = {} as SurveysState
  const rerender = () => ctx.render()
  $.loading = true; $.creating = false
  $.url = `${globalThis.location?.origin ?? ''}/demo-survey`
  $.concurrency = '2'
  $.selected = Object.fromEntries(BUILTIN_PERSONAS.map(p => [p.name, true]))
  $.campaigns = []; $.error = ''

  async function load(): Promise<void> {
    try {
      const d = await ctx.api.get<{ campaigns: CampaignRow[] }>('/api/survey/campaigns')
      $.campaigns = d.campaigns ?? []
    } catch { $.campaigns = [] }
    $.loading = false
    rerender()
  }
  void load()

  async function create(): Promise<void> {
    const personas = BUILTIN_PERSONAS.filter(p => $.selected[p.name])
    if (personas.length === 0) { ctx.toast('至少选择一个调查员人设', 'error'); return }
    if (!$.url.trim()) { ctx.toast('请填写问卷地址', 'error'); return }
    $.creating = true; $.error = ''; rerender()
    try {
      await ctx.api.post('/api/survey/setup', { url: $.url.trim(), personas })
      ctx.toast('问卷活动已创建——调查员将开始填写', 'success')
      await load()
    } catch (e) {
      $.error = errMsg(e, '创建失败')
    }
    $.creating = false
    rerender()
  }

  async function action(id: string, act: 'retry' | 'cancel'): Promise<void> {
    try {
      await ctx.api.post(`/api/survey/campaigns/${id}/${act}`)
      await load()
    } catch { ctx.toast('操作失败', 'error') }
  }

  return () => {
    if ($.loading) return <div class="wf-container wf-padding-lg"><Loading /></div>
    return (
      <div class="wf-container wf-stack wf-gap-lg wf-padding-lg wf-margin-x-auto" style="--wf-max: 860px">
        <PageHeader title="问卷活动" sub="内置调查员人设 → 一键派单填写 → 进度/失败/重试（银行家：数据模拟收集）" />

        <Card key="create">
          <div class="wf-stack wf-gap-md">
            <Field label="问卷地址" hint="调查员用 agent-browser 打开填写（默认本机 demo-survey；生产填真实问卷 URL）">
              <Input value={$.url} onInput={(e) => { $.url = inputValue(e); rerender() }} />
            </Field>
            <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary">调查员人设（勾选——每名独立部门/沙盒——并发填写）</div>
            <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(210px, 1fr))">
              {BUILTIN_PERSONAS.map(p => (
                <Card key={p.name} outlined hover active={!!$.selected[p.name]} onClick={() => { $.selected[p.name] = !$.selected[p.name]; rerender() }}>
                  <div class="wf-font-sm wf-semibold">{p.name}</div>
                  <div class="wf-font-xs wf-text-secondary">{p.roleLabel} · {p.expertise}</div>
                </Card>
              ))}
            </div>
            <div class="wf-row wf-gap-md wf-items-center">
              <Field label="并发">
                <Select value={$.concurrency ?? '2'} onChange={(v) => { $.concurrency = (Array.isArray(v) ? '2' : v) as string; rerender() }}
                  options={['1', '2', '3', '4', '5'].map(n => ({ value: n, label: n + ' 名' }))} />
              </Field>
              <Button variant="primary" disabled={$.creating} onClick={() => void create()}>{$.creating ? '创建中...' : '创建问卷活动'}</Button>
            </div>
            {$.error && <Alert variant="error">{$.error}</Alert>}
          </div>
        </Card>

        <Card key="list">
          <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-margin-bottom-md">历史活动</div>
          {$.campaigns.length === 0 ? (
            <div class="wf-font-sm wf-text-secondary">暂无问卷活动——创建第一个吧</div>
          ) : (
            <div class="wf-stack wf-gap-sm">
              {$.campaigns.map(c => (
                <div key={c.id} class="wf-row wf-gap-md wf-items-center wf-border-bottom wf-padding-y-sm">
                  <Badge variant={c.status === 'done' ? 'success' : c.status === 'cancelled' ? 'default' : 'warning'}>{c.status}</Badge>
                  <span class="wf-font-sm wf-fill">进度 {c.completed}/{c.total} · 失败 {c.failed}</span>
                  <span class="wf-font-xs wf-text-tertiary">{String(c.created_at ?? '').slice(0, 19)}</span>
                  {c.status === 'running' && (
                    <Button size="sm" variant="ghost" onClick={() => void action(c.id, 'retry')}>重试</Button>
                  )}
                  {c.status === 'running' && (
                    <Button size="sm" variant="ghost" onClick={() => void action(c.id, 'cancel')}>取消</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    )
  }
}
