/**
 * Workflow 详情页——三视图（DAG Pipeline / 步骤 JsonSchemaForm / wfjs CodeEditor）
 * + 执行（args JSON → POST run）+ 运行历史。
 *
 * 组件消费面：workflowToDag 在服务端（GET /:id 提供 dag）、toJsonSchema 在 meta 端点——
 * 客户端零转换（架构验证：组件库零改动）。
 */
import type { UIContext, Component } from 'weifuwu/vdom'
import { Alert, Badge, Button, Card, CodeEditor, JsonSchemaForm, Loading, Pipeline, Tabs, Textarea } from 'weifuwu/components'
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

interface DetailState {
  loading: boolean; running: boolean
  wf?: WorkflowDetail
  schemas?: unknown
  runs: RunRow[]
  tab: string
  args: string
  error: string
  lastResult?: unknown
}

export const WorkflowDetail: Component<{ id?: string }> = (props, ctx) => {
  const $ = {} as DetailState
  const rerender = () => ctx.render()
  $.loading = true; $.running = false
  $.runs = []; $.tab = 'dag'; $.args = '{}'; $.error = ''
  const id = props.id ?? ''

  async function load(): Promise<void> {
    try {
      const [d, m, r] = await Promise.all([
        ctx.api!.get<{ workflow: WorkflowDetail }>(`/api/workflows/${id}`),
        ctx.api!.get<{ schemas: unknown }>('/api/workflows/meta'),
        ctx.api!.get<{ runs: RunRow[] }>(`/api/workflows/${id}/runs`),
      ])
      $.wf = d.workflow
      $.schemas = m.schemas
      $.runs = r.runs ?? []
    } catch (e) { $.error = errMsg(e, '加载失败') }
    $.loading = false
    rerender()
  }
  void load()

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
                <div class="wf-padding-md wf-card-outline wf-rounded-md">
                  <div class="wf-font-xs wf-text-secondary wf-margin-bottom-sm">步骤类型 schema（JsonSchemaForm 直消费——选择类型查看参数结构）</div>
                  <JsonSchemaForm
                    schema={($.schemas as { type: string; title?: string; properties?: Record<string, unknown> }) ?? { type: 'object', properties: {} }}
                    value={{}}
                    submitLabel="（只读预览——执行参数在下方输入）"
                  />
                </div>
              ) },
              { key: 'code', label: 'wfjs', content: (
                <div class="wf-padding-md wf-card-outline wf-rounded-md">
                  <CodeEditor value={wf.wfjs} lang="ts" rows={16} readOnly />
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
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    )
  }
}
