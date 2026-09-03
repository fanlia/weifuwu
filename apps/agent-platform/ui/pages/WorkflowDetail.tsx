/**
 * Workflow 详情页——三视图（DAG Pipeline / 步骤 JsonSchemaForm / wfjs CodeEditor）
 * + 执行（args JSON → POST run）+ 运行历史。
 *
 * 组件消费面：workflowToDag 在服务端（GET /:id 提供 dag）、toJsonSchema 在 meta 端点——
 * 客户端零转换（架构验证：组件库零改动）。
 */
import type { UIContext, Component } from 'weifuwu/vdom'
import { Alert, Badge, Button, Card, CodeEditor, Descriptions, Input, JSONViewer, Loading, Modal, Pipeline, Tabs, Textarea } from 'weifuwu/components'
import { errMsg, PageHeader } from '../components/ui'

interface DagNode { id: string; label: string }
interface DagEdge { from: string; to: string }
interface WorkflowDetail {
  id: string
  name: string
  def: unknown
  wfjs: string
  dag: { nodes: DagNode[]; edges: DagEdge[] }
  status: string
  updated_at: string
}
interface RunRow {
  id: string
  trigger: string
  status: string
  error: string | null
  created_at: string
}
interface RunDetail extends RunRow {
  result_json: { stepResults?: Record<string, { ok?: boolean; data?: unknown; error?: string }>; executed?: string[] } | null
}

interface StepInstance {
  id: string
  type: string
  config: Record<string, unknown>
}
/** 步骤类型 → 中文标签（schemas 提供 title；缺省回退 type） */
type Labels = Record<string, string>
interface DetailState {
  loading: boolean; running: boolean
  wf?: WorkflowDetail
  schemas?: unknown
  labels: Labels
  runs: RunRow[]
  tab: string
  args: string
  error: string
  lastResult?: unknown
  viewingRun?: RunDetail | null
  cronDraft: string
}

/** def → 顶层步骤实例（IR 形态） */
function stepsOf(def: unknown): StepInstance[] {
  return ((def as { steps?: StepInstance[] })?.steps ?? [])
}

/** 步骤实例 → 展示项（config 字段 → label/value 行；子链递归缩进） */
function stepView(step: StepInstance, labels: Labels, depth: number): any {
  const chain = (cfg: Record<string, unknown>): any => {
    const sub = cfg.step as { steps?: StepInstance[] } | undefined
    const then = cfg.then as { steps?: StepInstance[] } | undefined
    const els = cfg.else as { steps?: StepInstance[] } | undefined
    return [
      sub?.steps ? <div style={`margin-left: ${(depth + 1) * 16}px`} class="wf-stack wf-gap-sm">{sub.steps.map((x) => stepView(x, labels, depth + 1))}</div> : null,
      then?.steps ? <div style={`margin-left: ${(depth + 1) * 16}px`} class="wf-stack wf-gap-sm">
        <div class="wf-font-xs wf-semibold wf-text-secondary">then</div>
        {then.steps.map((x) => stepView(x, labels, depth + 1))}
      </div> : null,
      els?.steps ? <div style={`margin-left: ${(depth + 1) * 16}px`} class="wf-stack wf-gap-sm">
        <div class="wf-font-xs wf-semibold wf-text-secondary">else</div>
        {els.steps.map((x) => stepView(x, labels, depth + 1))}
      </div> : null,
    ]
  }
  const items = Object.entries(step.config).map(([k, v]) => ({
    label: k,
    value: typeof v === 'object' ? JSON.stringify(v) : String(v),
  }))
  return (
    <div class="wf-stack wf-gap-sm" style={`margin-left: ${depth * 16}px`}>
      <div class="wf-row wf-gap-sm wf-items-center">
        <Badge>{labels[step.type] ?? step.type}</Badge>
        <span class="wf-font-mono wf-font-xs wf-text-secondary">{step.id}</span>
      </div>
      {items.length > 0 && <Descriptions items={items} size="sm" />}
      {chain(step.config)}
    </div>
  )
}

export const WorkflowDetail: Component<{ id?: string }> = (props, ctx) => {
  const $ = {} as DetailState
  const rerender = () => ctx.render()
  $.loading = true; $.running = false
  $.runs = []; $.tab = 'dag'; $.args = '{}'; $.error = ''
  $.labels = {}; $.viewingRun = null; $.cronDraft = ''
  const id = props.id ?? ''

  async function load(): Promise<void> {
    try {
      const [d, m, r] = await Promise.all([
        ctx.api!.get<{ workflow: WorkflowDetail }>(`/api/workflows/${id}`),
        ctx.api!.get<{ schemas: unknown }>('/api/workflows/meta'),
        ctx.api!.get<{ runs: RunRow[] }>(`/api/workflows/${id}/runs`),
      ])
      $.wf = d.workflow
      $.cronDraft = String(d.workflow.cron ?? '')
      $.schemas = m.schemas
      const props = (m.schemas as { properties?: Record<string, { title?: string }> })?.properties ?? {}
      const labels: Labels = {}
      for (const [t, v] of Object.entries(props)) labels[t] = v?.title ?? t
      $.labels = labels
      $.runs = r.runs ?? []
    } catch (e) { $.error = errMsg(e, '加载失败') }
    $.loading = false
    rerender()
  }
  void load()

  async function saveCron(): Promise<void> {
    try {
      await ctx.api!.put<{ ok: boolean }>(`/api/workflows/${id}`, { cron: $.cronDraft.trim() || null })
      ctx.toast!('定时已保存', 'success')
      await load()
    } catch (e: any) {
      ctx.toast!(e?.message ?? '保存失败', 'error')
    }
  }

  async function viewRun(runId: string): Promise<void> {
    try {
      const r = await ctx.api!.get<{ run: RunDetail }>(`/api/workflows/${id}/runs/${runId}`)
      $.viewingRun = r.run
      rerender()
    } catch (e) { ctx.toast!('加载运行结果失败', 'error') }
  }

  async function run(): Promise<void> {
    let args: Record<string, unknown> = {}
    try { args = $.args.trim() ? JSON.parse($.args) : {} } catch { ctx.toast!('args 不是合法 JSON', 'error'); return }
    $.running = true; $.error = ''; rerender()
    try {
      const r = await ctx.api!.post<{ run: RunRow & { result_json: unknown } }>(`/api/workflows/${id}/runs`, { args })
      $.lastResult = r.run
      ctx.toast!('执行完成', 'success')
      await load()
    } catch (e) {
      $.error = errMsg(e, '执行失败')
    }
    $.running = false
    rerender()
  }

  return () => {
    if ($.loading) return <div class="wf-container wf-padding-lg"><Loading /></div>
    const wf = $.wf
    if (!wf) return <div class="wf-container wf-padding-lg"><Alert variant="error">{$.error || '工作流不存在'}</Alert></div>
    return (
      <div class="wf-container wf-stack wf-gap-lg wf-padding-lg wf-margin-x-auto" style="--wf-max: 1080px">
        <PageHeader title={wf.name} sub={`DSL 真相 · 更新于 ${String(wf.updated_at ?? '').slice(0, 19)}`}>
          <Button variant="primary" disabled={$.running} onClick={() => void run()}>{$.running ? '执行中...' : '执行'}</Button>
        </PageHeader>

        {$.error && <Alert variant="error">{$.error}</Alert>}

        <Card key="views">
          <Tabs
            value={$.tab}
            onChange={(v) => { $.tab = String(v); rerender() }}
            items={[
              { key: 'dag', label: '流程', content: (
                <div class="wf-padding-md wf-card-outline wf-rounded-md" style="overflow:auto">
                  <Pipeline nodes={wf.dag.nodes} edges={wf.dag.edges} orientation="vertical" width={Math.max(360, wf.dag.nodes.length * 120)} height={Math.max(160, wf.dag.nodes.length * 56)} />
                </div>
              ) },
              { key: 'form', label: '步骤', content: (
                <div class="wf-padding-md wf-card-outline wf-rounded-md wf-stack wf-gap-md">
                  {stepsOf(wf.def).map((st) => stepView(st, $.labels, 0))}
                </div>
              ) },
              { key: 'code', label: 'wfjs', content: (
                <div class="wf-padding-md wf-card-outline wf-rounded-md">
                  <CodeEditor value={wf.wfjs ?? ''} lang="ts" rows={16} readOnly />
                </div>
              ) },
            ]}
          />
        </Card>

        <Card key="run">
          <div class="wf-stack wf-gap-md">
            <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary">执行参数（JSON）</div>
            <Textarea value={$.args} rows={3} onChange={(v) => { $.args = String(v); rerender() }} placeholder='{"sku": "A-100"}' />
            {$.lastResult && (
              <Alert variant={($.lastResult as { status?: string }).status === 'success' ? 'success' : 'error'}>
                执行 {($.lastResult as { status?: string }).status}
                {(($.lastResult as { error?: string }).error ?? '') && <>：{($.lastResult as { error?: string }).error}</>}
              </Alert>
            )}
          </div>
        </Card>

        <Modal open={!!$.viewingRun} title="运行结果" onClose={() => { $.viewingRun = null; rerender() }} width="640px">
          {$.viewingRun && (() => {
            const run = $.viewingRun
            const steps = run.result_json?.stepResults ?? {}
            return (
              <div class="wf-stack wf-gap-md">
                <Alert variant={run.status === 'success' ? 'success' : 'error'}>
                  {run.trigger} · {run.status}
                  {run.error && <>：{run.error}</>}
                </Alert>
                <div class="wf-stack wf-gap-sm">
                  {(run.result_json?.executed ?? Object.keys(steps)).map((sid) => {
                    const st = steps[sid]
                    if (!st) return null
                    return (
                      <div key={sid} class="wf-row wf-gap-sm wf-items-start wf-border-bottom wf-padding-y-sm">
                        <Badge variant={st.ok === false ? 'danger' : 'success'}>{st.ok === false ? '失败' : 'ok'}</Badge>
                        <div class="wf-fill wf-stack wf-gap-xs">
                          <div class="wf-font-mono wf-font-xs">{sid}</div>
                          {st.error && <div class="wf-font-xs wf-text-danger">{st.error}</div>}
                          {st.data !== undefined && <div class="wf-font-xs wf-text-secondary wf-break-word">{JSON.stringify(st.data)?.slice(0, 200)}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div class="wf-font-xs wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary">原始结果（JSON）</div>
                <JSONViewer data={run.result_json} defaultExpandDepth={2} maxKeys={50} />
              </div>
            )
          })()}
        </Modal>

        <Card key="runs">
          <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-margin-bottom-md">运行历史</div>
          {$.runs.length === 0 ? (
            <div class="wf-font-sm wf-text-secondary">暂无运行</div>
          ) : (
            <div class="wf-stack wf-gap-sm">
              {$.runs.map(r => (
                <div key={r.id} class="wf-row wf-gap-md wf-items-center wf-border-bottom wf-padding-y-sm">
                  <Badge variant={r.status === 'success' ? 'success' : r.status === 'error' ? 'danger' : 'warning'}>{r.status}</Badge>
                  <span class="wf-font-xs wf-fill wf-text-secondary">{r.trigger} · {String(r.created_at ?? '').slice(0, 19)}</span>
                  {r.error && <span class="wf-font-xs wf-text-danger">{r.error}</span>}
                  <Button size="sm" variant="ghost" onClick={() => void viewRun(r.id)}>查看</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    )
  }
}
