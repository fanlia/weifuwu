/**
 * Workflow 详情页——三视图（DAG Pipeline / 步骤 JsonSchemaForm / wfjs CodeEditor）
 * + 执行（args JSON → POST run）+ 运行历史。
 *
 * 组件消费面：workflowToDag 在服务端（GET /:id 提供 dag）、toJsonSchema 在 meta 端点——
 * 客户端零转换（架构验证：组件库零改动）。
 */
import type { UIContext, Component } from 'weifuwu/vdom'
import { Alert, Badge, Button, Card, CodeEditor, Descriptions, DiffView, Input, JSONViewer, Loading, Modal, Pipeline, Select, Tabs, Textarea } from 'weifuwu/components'
import { errMsg, PageHeader } from '../components/ui'
import { CronPicker } from '../components/CronPicker'

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
interface VersionRow {
  id: string
  note: string | null
  created_at: string
  def_json?: Record<string, unknown>
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
  fieldMeta: Record<string, Record<string, { title?: string; type?: string }>>
  editing: { path: (number | string)[]; type: string; draft: Record<string, string> } | null
  adding: { anchor: string | null; chain: string[] } | null
  addingType: string
  diffing: VersionRow | null
  wfjsEditing: boolean
  wfjsDraft: string
  wfjsDiffOpen: boolean
  runs: RunRow[]
  tab: string
  args: string
  inputFields: string[]
  error: string
  lastResult?: unknown
  viewingRun?: RunDetail | null
  cronDraft: string
  versions: VersionRow[]
}

/** def → 顶层步骤实例（IR 形态） */
function stepsOf(def: unknown): StepInstance[] {
  return ((def as { steps?: StepInstance[] })?.steps ?? [])
}

/** 步骤实例 → 展示项（config 字段 → label/value 行；子链递归缩进；path 定位供编辑补丁） */
type StepPathT = (number | string)[]
function stepView(
  step: StepInstance,
  labels: Labels,
  fieldMeta: Record<string, Record<string, { title?: string; type?: string }>>,
  depth: number,
  path: StepPathT,
  editing: DetailState['editing'],
  onEdit: (step: StepInstance, path: StepPathT) => void,
  onDraft: (k: string, v: string) => void,
  onRemove: (path: StepPathT) => void,
  onAdd: (anchor: string, chain: ('then' | 'else' | 'step')[]) => void,
): any {
  const chain = (cfg: Record<string, unknown>, seg: 'step' | 'then' | 'else'): any => {
    const sub = cfg[seg] as { steps?: StepInstance[] } | undefined
    if (!sub?.steps) return null
    return <div style={`margin-left: ${(depth + 1) * 16}px`} class="wf-stack wf-gap-sm">
      <div class="wf-row wf-gap-sm wf-items-center">
        {seg !== 'step' && <span class="wf-font-xs wf-semibold wf-text-secondary">{seg}</span>}
        <Button size="sm" variant="ghost" onClick={() => onAdd(step.id, [seg])}>＋ 添加步骤</Button>
      </div>
      {sub.steps.map((x, i) => (
        <div key={i}>
          {stepView(x, labels, fieldMeta, depth + 1, [...path, seg, i], editing, onEdit, onDraft, onRemove, onAdd)}
        </div>
      ))}
    </div>
  }
  const items = Object.entries(step.config).map(([k, v]) => ({
    label: k,
    value: typeof v === 'object' ? JSON.stringify(v) : String(v),
  }))
  const isEditing = editing !== null && editing.path.length === path.length && editing.path.every((t, i) => t === path[i])
  const meta = fieldMeta[step.type] ?? {}
  const fields = Object.keys(meta).length > 0 ? Object.entries(meta) : Object.keys(step.config).map((k) => [k, {}] as [string, Record<string, unknown>])
  return (
    <div class="wf-stack wf-gap-sm" style={`margin-left: ${depth * 16}px`}>
      <div class="wf-row wf-gap-sm wf-items-center">
        <Badge>{labels[step.type] ?? step.type}</Badge>
        <span class="wf-font-mono wf-font-xs wf-text-secondary">{step.id}</span>
        <span class="wf-fill" />
        <Button size="sm" variant="ghost" onClick={() => onEdit(step, path)}>编辑</Button>
        <Button size="sm" variant="ghost" onClick={() => onRemove(path)}>删除</Button>
      </div>
      {items.length > 0 && <Descriptions items={items} size="sm" />}
      {isEditing && (
        <div class="wf-card-outline wf-rounded-md wf-padding-md wf-stack wf-gap-sm">
          <div class="wf-font-xs wf-semibold wf-text-secondary">编辑参数（{step.id}）</div>
          {fields.map(([k, meta2]) => {
            const cur = step.config[k]
            const isObj = typeof cur === 'object' && cur !== null
            const isNum = typeof cur === 'number'
            const val = editing.draft[k] ?? (isObj ? JSON.stringify(cur) : String(cur ?? ''))
            const textArea = (meta2 as { type?: string })?.type === 'string' && (k === 'message' || k === 'template' || k === 'system' || k === 'body' || k === 'prompt')
            return (
              <div key={k} class="wf-stack wf-gap-xs">
                <label class="wf-font-xs wf-text-secondary">{String((meta2 as { title?: string })?.title ?? k)}</label>
                {textArea
                  ? <Textarea rows={3} value={val} onInput={(e) => onDraft(k, String((e.target as HTMLTextAreaElement).value))} />
                  : <Input value={val} onInput={(e) => onDraft(k, (e as any).target?.value ?? '')} />}
              </div>
            )
          })}
          <div class="wf-row wf-gap-sm">
            <Button size="sm" onClick={() => onEdit(step, path)}>保存</Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(step, path)}>取消</Button>
          </div>
        </div>
      )}
      {chain(step.config, 'step')}
      {chain(step.config, 'then')}
      {chain(step.config, 'else')}
    </div>
  )
}

export const WorkflowDetail: Component<{ id?: string }> = (props, ctx) => {
  const $ = {} as DetailState
  const rerender = () => ctx.render()
  $.loading = true; $.running = false
  $.runs = []; $.tab = 'dag'; $.args = '{}'; $.error = ''; $.inputFields = []
  $.labels = {}; $.viewingRun = null; $.cronDraft = ''
  $.fieldMeta = {}; $.editing = null; $.versions = []; $.adding = null; $.addingType = ''; $.diffing = null
  $.wfjsEditing = false; $.wfjsDraft = ''; $.wfjsDiffOpen = false
  const id = props.id ?? ''

  async function load(): Promise<void> {
    try {
      const [d, m, r] = await Promise.all([
        ctx.api.get<{ workflow: WorkflowDetail }>(`/api/workflows/${id}`),
        ctx.api.get<{ schemas: unknown }>('/api/workflows/meta'),
        ctx.api.get<{ runs: RunRow[] }>(`/api/workflows/${id}/runs`),
      ])
      $.wf = d.workflow
      $.cronDraft = String((d.workflow as { cron?: string }).cron ?? '')
      $.wfjsDraft = d.workflow.wfjs ?? ''
      $.inputFields = [...new Set((d.workflow.wfjs ?? '').match(/\binput\.([A-Za-z_$][\w$]*)/g)?.map((x) => x.slice(6)) ?? [])]
      $.schemas = m.schemas
      const props = (m.schemas as { properties?: Record<string, { title?: string; properties?: Record<string, { title?: string; type?: string }> }> })?.properties ?? {}
      const labels: Labels = {}
      const fieldMeta: DetailState['fieldMeta'] = {}
      for (const [t, v] of Object.entries(props)) {
        labels[t] = v?.title ?? t
        fieldMeta[t] = v?.properties ?? {}
      }
      $.labels = labels
      $.fieldMeta = fieldMeta
      $.runs = r.runs ?? []
      const vs = await ctx.api.get<{ versions: VersionRow[] }>(`/api/workflows/${id}/versions`)
      $.versions = vs.versions ?? []
    } catch (e) { $.error = errMsg(e, '加载失败') }
    $.loading = false
    rerender()
  }
  void load()

  async function saveCron(): Promise<void> {
    try {
      await ctx.api.put<{ ok: boolean }>(`/api/workflows/${id}`, { cron: $.cronDraft.trim() || null })
      ctx.toast('定时已保存', 'success')
      await load()
    } catch (e) {
      ctx.toast((e as Error)?.message ?? '保存失败', 'error')
    }
  }

  async function addStep(): Promise<void> {
    const adding = $.adding
    if (!adding || !$.addingType) return
    const t = $.addingType
    $.adding = null
    rerender()
    try {
      await ctx.api.put<any>(`/api/workflows/${id}`, { patch: { op: 'insert', anchor: adding.anchor, chain: adding.chain, step: { type: t, config: {} } } })
      ctx.toast('步骤已添加（打开编辑填参数）', 'success')
      await load()
    } catch (e) { ctx.toast((e as Error)?.message ?? '添加失败', 'error') }
  }

  async function saveWfjs(): Promise<void> {
    try {
      await ctx.api.put<{ ok: boolean }>(`/api/workflows/${id}`, { wfjs: $.wfjsDraft })
      ctx.toast('wfjs 已保存（编译通过）', 'success')
      $.wfjsEditing = false
      await load()
    } catch (e) {
      ctx.toast((e as Error)?.message ?? '保存失败', 'error')
    }
  }

  async function rollback(versionId: string): Promise<void> {
    try {
      await ctx.api.post<{ ok: boolean }>(`/api/workflows/${id}/versions/${versionId}/rollback`)
      ctx.toast('已回滚（新版本已记录）', 'success')
      await load()
    } catch (e) { ctx.toast((e as Error)?.message ?? '回滚失败', 'error') }
  }

  async function viewRun(runId: string): Promise<void> {
    try {
      const r = await ctx.api.get<{ run: RunDetail }>(`/api/workflows/${id}/runs/${runId}`)
      $.viewingRun = r.run
      rerender()
    } catch (e) { ctx.toast('加载运行结果失败', 'error') }
  }

  async function run(): Promise<void> {
    let args: Record<string, unknown> = {}
    try { args = $.args.trim() ? JSON.parse($.args) : {} } catch { ctx.toast('args 不是合法 JSON', 'error'); return }
    $.running = true; $.error = ''; rerender()
    try {
      const r = await ctx.api.post<{ run: RunRow & { result_json: unknown } }>(`/api/workflows/${id}/runs`, { args })
      $.lastResult = r.run
      ctx.toast('执行完成', 'success')
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
            active={$.tab}
            onChange={(v) => { $.tab = String(v); rerender() }}
            items={[
              { key: 'dag', label: '流程', content: (
                <div class="wf-padding-md wf-card-outline wf-rounded-md" style="overflow:auto">
                  <Pipeline nodes={wf.dag.nodes} edges={wf.dag.edges} orientation="vertical" width={Math.max(360, wf.dag.nodes.length * 120)} height={Math.max(160, wf.dag.nodes.length * 56)} />
                </div>
              ) },
              { key: 'form', label: '步骤', content: (
                <div class="wf-padding-md wf-card-outline wf-rounded-md wf-stack wf-gap-md">
                  <div class="wf-row wf-gap-sm">
                    <Button size="sm" onClick={() => { $.adding = { anchor: null, chain: [] }; $.addingType = ''; rerender() }}>＋ 添加步骤（末尾）</Button>
                  </div>
                  {stepsOf(wf.def).map((st, i) => (
                    <div key={i}>
                      {stepView(st, $.labels, $.fieldMeta, 0, [i], $.editing,
                        (step, path) => {
                          if ($.editing !== null && $.editing.path.length === path.length && $.editing.path.every((t, j) => t === path[j])) {
                            // 保存：拼接 patch → PUT → 刷新
                            const parsed: Record<string, unknown> = {}
                            for (const [k, v] of Object.entries($.editing.draft)) {
                              const old = (step.config as Record<string, unknown>)[k]
                              if (typeof old === 'number') parsed[k] = Number(v)
                              else if (typeof old === 'boolean') parsed[k] = v === 'true'
                              else if (typeof old === 'object' && old !== null) { try { parsed[k] = JSON.parse(v) } catch { ctx.toast('JSON 格式错误：' + k, 'error'); return } }
                              else parsed[k] = v
                            }
                            void (async () => {
                              try {
                                await ctx.api.put<any>(`/api/workflows/${id}`, { patch: { path, config: parsed } })
                                ctx.toast('参数已保存', 'success')
                                $.editing = null
                                await load()
                              } catch (e) { ctx.toast((e as Error)?.message ?? '保存失败', 'error') }
                            })()
                            return
                          }
                          // 打开编辑态：draft 预填当前值
                          const draft: Record<string, string> = {}
                          for (const [k, v] of Object.entries(step.config as Record<string, unknown>)) {
                            draft[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')
                          }
                          $.editing = { path, type: step.type, draft }
                          rerender()
                        },
                        (k, v) => { if ($.editing) { $.editing.draft[k] = v; rerender() } },
                        (path) => {
                          if (!confirm(`删除步骤（${stepsOf(wf.def).find(() => true) ? '' : ''}路径 ${path.join('.')}——子链一并删除）？`)) return
                          void (async () => {
                            try {
                              await ctx.api.put<any>(`/api/workflows/${id}`, { patch: { op: 'remove', path } })
                              ctx.toast('步骤已删除', 'success')
                              await load()
                            } catch (e) { ctx.toast((e as Error)?.message ?? '删除失败', 'error') }
                          })()
                        },
                        (anchor, chain) => { $.adding = { anchor, chain }; $.addingType = ''; rerender() })}
                    </div>
                  ))}
                </div>
              ) },
              { key: 'versions', label: '版本', content: (
                <div class="wf-padding-md wf-card-outline wf-rounded-md wf-stack wf-gap-sm">
                  <div class="wf-font-xs wf-text-secondary">def 版本快照（编辑/回滚自动记录——恢复任一时点）</div>
                  {$.versions.length === 0 && <div class="wf-font-sm wf-text-secondary">暂无版本</div>}
                  {$.versions.map((v) => (
                    <div key={v.id} class="wf-row wf-gap-md wf-items-center wf-border-bottom wf-padding-y-sm">
                      <span class="wf-font-xs wf-text-secondary wf-fill">{v.note ?? '（无备注）'} · {String(v.created_at ?? '').slice(0, 19)}</span>
                      <Button size="sm" variant="ghost" onClick={() => { $.diffing = v; rerender() }}>恢复</Button>
                    </div>
                  ))}
                </div>
              ) },
              { key: 'code', label: 'wfjs', content: (
                <div class="wf-padding-md wf-card-outline wf-rounded-md wf-stack wf-gap-md">
                  <CodeEditor value={$.wfjsEditing ? $.wfjsDraft : (wf.wfjs ?? '')} lang="ts" rows={16} readOnly={!$.wfjsEditing}
                    onChange={(v) => { $.wfjsDraft = String(v); rerender() }} />
                  <div class="wf-row wf-gap-sm">
                    {!$.wfjsEditing ? (
                      <Button size="sm" onClick={() => { $.wfjsEditing = true; $.wfjsDraft = wf.wfjs ?? ''; rerender() }}>编辑源码</Button>
                    ) : (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => { $.wfjsDiffOpen = true; rerender() }}>预览差异</Button>
                        <Button size="sm" onClick={() => void saveWfjs()}>保存（编译验证）</Button>
                        <Button size="sm" variant="ghost" onClick={() => { $.wfjsEditing = false; rerender() }}>取消</Button>
                      </>
                    )}
                    <span class="wf-font-xs wf-text-secondary wf-self-center">保存时编译门验证（语法错拒绝——DSL 真相源同步）</span>
                  </div>
                </div>
              ) },
            ]}
          />
        </Card>

        <Card key="run">
          <div class="wf-stack wf-gap-md">
            <div class="wf-stack wf-gap-sm">
              <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary">定时（cron）</div>
              <CronPicker value={$.cronDraft} onChange={(v) => { $.cronDraft = v; rerender() }} />
              <div class="wf-row wf-gap-sm wf-items-center">
                <Button variant="secondary" size="sm" onClick={() => void saveCron()}>保存定时</Button>
                <div class="wf-font-xs wf-text-secondary">格式：分 时 日 月 周（如 `*/5 * * * *` = 每 5 分钟）</div>
              </div>
            </div>

            <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary">执行参数（JSON）</div>
            {$.inputFields.length > 0 ? (
              <div class="wf-row wf-gap-sm wf-items-center">
                <span class="wf-font-xs wf-text-secondary">可用参数（wfjs 里读 input.xxx）：</span>
                {$.inputFields.map((f) => (
                  <span key={f} class="wf-font-xs wf-padding-x-sm wf-padding-y-xs wf-bg-secondary wf-rounded-sm">{f}</span>
                ))}
                <Button variant="ghost" size="sm" onClick={() => {
                  const obj = Object.fromEntries($.inputFields.map((f) => [f, '']))
                  $.args = JSON.stringify(obj, null, 2)
                  rerender()
                }}>按参数生成模板</Button>
              </div>
            ) : (
              <div class="wf-font-xs wf-text-secondary">wfjs 里用 input.xxx 读取——值来自这里的 JSON（同名键）</div>
            )}
            <Textarea value={$.args} rows={3} onInput={(e) => { $.args = String((e.target as HTMLTextAreaElement).value); rerender() }} placeholder='{"sku": "A-100"}' />
            {$.lastResult && (
              <Alert variant={($.lastResult as { status?: string }).status === 'success' ? 'success' : 'error'}>
                执行 {($.lastResult as { status?: string }).status}
                {(($.lastResult as { error?: string }).error ?? '') && <>：{($.lastResult as { error?: string }).error}</>}
              </Alert>
            )}
          </div>
        </Card>

        <Modal open={!!$.adding} title={$.adding?.anchor ? `在「${$.adding.anchor}」的 ${$.adding.chain.join('.')} 链添加步骤` : '添加步骤'} onClose={() => { $.adding = null; rerender() }} width="420px">
          <div class="wf-stack wf-gap-md">
            <Select
              value={$.addingType}
              placeholder="选择步骤类型"
              options={Object.entries($.fieldMeta).map(([k, v]) => ({ value: k, label: (v as { title?: string })?.title ?? k }))}
              onChange={(v) => { $.addingType = String(v); rerender() }}
            />
            <div class="wf-row wf-gap-sm wf-justify-end">
              <Button variant="secondary" size="sm" onClick={() => { $.adding = null; rerender() }}>取消</Button>
              <Button size="sm" disabled={!$.addingType} onClick={() => void addStep()}>添加</Button>
            </div>
            <div class="wf-font-xs wf-text-secondary">添加后可点「编辑」填参数（http url / log 内容等）</div>
          </div>
        </Modal>

        <Modal open={$.wfjsDiffOpen} title="wfjs 编辑差异" onClose={() => { $.wfjsDiffOpen = false; rerender() }} width="760px">
          <div class="wf-stack wf-gap-md">
            <DiffView oldCode={$.wf?.wfjs ?? ''} newCode={$.wfjsDraft} oldTitle="当前" newTitle="草稿" foldThreshold={4} maxLines={600} />
            <div class="wf-row wf-gap-sm wf-justify-end">
              <Button variant="secondary" size="sm" onClick={() => { $.wfjsDiffOpen = false; rerender() }}>返回编辑</Button>
              <Button size="sm" onClick={() => { $.wfjsDiffOpen = false; rerender(); void saveWfjs() }}>确认保存</Button>
            </div>
          </div>
        </Modal>

        <Modal open={!!$.diffing} title="恢复前预览（def 差异）" onClose={() => { $.diffing = null; rerender() }} width="760px">
          {$.diffing && (() => {
            const v = $.diffing
            const cur = JSON.stringify($.wf?.def ?? {}, null, 2)
            const ver = JSON.stringify(v.def_json ?? {}, null, 2)
            const same = cur === ver
            return (
              <div class="wf-stack wf-gap-md">
                <Alert variant={same ? 'success' : 'warning'}>
                  {same ? '两版 def 一致（无差异——恢复不会改变内容）' : `将 def 回滚到 ${v.note ?? '该版本'}（${String(v.created_at ?? '').slice(0, 19)}）——当前 def 会先记录为新版本`}
                </Alert>
                {!same && <DiffView oldCode={cur} newCode={ver} oldTitle="当前" newTitle="该版本" foldThreshold={4} maxLines={600} />}
                <div class="wf-row wf-gap-sm wf-justify-end">
                  <Button variant="secondary" size="sm" onClick={() => { $.diffing = null; rerender() }}>取消</Button>
                  <Button size="sm" onClick={() => { $.diffing = null; rerender(); void rollback(v.id) }}>确认恢复</Button>
                </div>
              </div>
            )
          })()}
        </Modal>

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
