/**
 * Workflow 列表页——声明式工作流（框架 workflowSystem /api/workflows）
 *
 * 列表 + 新建（wfjs 源码——compileGate 门：创建校验失败即拒绝）。
 * 行点击 → /workflows/:id 详情（三视图）。
 */
import type { UIContext, Component } from 'weifuwu/vdom'
import { Alert, Badge, Button, Card, CodeEditor, Field, Input, Loading, Textarea } from 'weifuwu/components'
import { errMsg, PageHeader } from '../components/ui'
import { inputValue } from '../lib/types'

interface WorkflowRow {
  id: string
  name: string
  description: string | null
  status: string
  cron: string | null
  created_at: string
  updated_at: string
  last_run?: { status: string; trigger: string; created_at: string; error: string | null } | null
}

/** 模板库（一键创建——第一次体验：看到能跑的模式而不是写代码）
 *  模板 wfjs 均为本地 demo 端点（origin 动态）——创建即编译门 */
const WF_TEMPLATES = [
  {
    key: 'stock-alert',
    name: '库存告警（本地演示）',
    wfjs: (o: string) => `// 本地演示 API：/api/demo/stock?stock=N 生成 N 个缺货商品（N>0 触发告警）
// 改 URL 的 stock=N 可切换两条路径；创建后可在详情页执行
const res = await http({ url: '${o}/api/demo/stock?stock=0' })
const count = res.json.items.length
if (count > 0) { await log({ message: \`缺货 \${count} 件\` }) }`,
  },
  {
    key: 'health-check',
    name: '健康检查（失败通知——try/catch 范例）',
    wfjs: (o: string) => `// 健康检查（try/catch：网络级失败也能通知——监控流程核心形态）
// 改 URL 为不可达地址可演示 catch 路径；错误经 steps.<tryid>.error 读取
try {
const res = await http({ url: '${o}/api/demo/stock?stock=1' })
if (res.status !== 200) { await log({ message: \`接口异常：\${res.status}\` }) }
} catch {
await log({ message: \`健康检查失败：\${steps._try1.error}\` })
}`,
  },
  {
    key: 'conditional-alert',
    name: '条件告警（本地演示）',
    wfjs: (o: string) => `// 条件告警：阈值判断 + 静默/告警两路径（status>=400 可编排——不抛）
const res = await http({ url: '${o}/api/demo/stock?stock=0' })
const count = res.json.items.length
if (count >= 3) {
await log({ message: \`严重告警：缺货 \${count} 件\` })
} else if (count > 0) {
await log({ message: \`提示：缺货 \${count} 件\` })
}`,
  },
  {
    key: 'daily-hook',
    name: '定时巡检（cron 范例）',
    wfjs: (o: string) => `// 定时巡检范例：创建后到详情页设置 cron（如 */5 * * * *）
const res = await http({ url: '${o}/api/demo/stock?stock=2' })
await log({ message: \`巡检完成：\${res.json.items.length} 条缺货\` })`,
  },
]

interface WorkflowsState {
  loading: boolean; creating: boolean
  name: string
  wfjs: string
  rows: WorkflowRow[]
  error: string
  template: string
}

/** 本地 demo 示例（origin 动态——用户访问的端口即 http 步骤目标；?stock=N 控制路径） */
function demoWfjs(origin: string): string {
  return `// 本地演示 API：/api/demo/stock?stock=N 生成 N 个缺货商品（N>0 触发告警）
// 改 URL 的 stock=N 可切换两条路径；创建后可在详情页执行
const res = await http({ url: '${origin}/api/demo/stock?stock=0' })
const count = res.json.items.length

// store 步骤需求 redis——未配置时执行会报明确错误（可用 log 路径先体验）
if (count > 0) { await log({ message: \`缺货 \${count} 件\` }) }`
}

export const Workflows: Component = (_props, ctx) => {
  const $ = {} as WorkflowsState
  const rerender = () => ctx.render()
  $.loading = true; $.creating = false
  $.name = ''; $.wfjs = demoWfjs(globalThis.location?.origin ?? 'http://localhost:3000')
  $.rows = []; $.error = ''; $.template = 'stock-alert'

  async function load(): Promise<void> {
    try {
      const d = await ctx.api.get<{ workflows: WorkflowRow[] }>('/api/workflows')
      $.rows = d.workflows ?? []
    } catch { $.rows = [] }
    $.loading = false
    rerender()
  }
  void load()

  async function create(): Promise<void> {
    if (!$.name.trim()) { ctx.toast('请填写名称', 'error'); return }
    if (!$.wfjs.trim()) { ctx.toast('请填写 wfjs 源码', 'error'); return }
    $.creating = true; $.error = ''; rerender()
    try {
      await ctx.api.post('/api/workflows', { name: $.name.trim(), wfjs: $.wfjs })
      ctx.toast('工作流已创建', 'success')
      $.name = ''
      await load()
    } catch (e) {
      $.error = errMsg(e, '创建失败')
    }
    $.creating = false
    rerender()
  }

  async function runRow(id: string): Promise<void> {
    try {
      const d = await ctx.api.post<{ run: { status: string; error: string | null } }>(`/api/workflows/${id}/runs`, { args: {} })
      const st = d.run?.status
      ctx.toast(st === 'success' ? '执行成功' : `执行：${st}${d.run?.error ? `——${d.run.error}` : ''}`, st === 'success' ? 'success' : 'error')
      await load()
    } catch (e: any) {
      ctx.toast(e?.message ?? '执行失败', 'error')
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await ctx.api.delete(`/api/workflows/${id}`)
      await load()
    } catch { ctx.toast('删除失败', 'error') }
  }

  return () => {
    if ($.loading) return <div class="wf-container wf-padding-lg"><Loading /></div>
    return (
      <div class="wf-container wf-stack wf-gap-lg wf-padding-lg wf-margin-x-auto" style="--wf-max: 1080px">
        <PageHeader title="工作流" sub="声明式执行——wfjs 编译 → DSL 真相 → 引擎执行（框架 workflowSystem）" />

        <Card key="create">
          <div class="wf-stack wf-gap-md">
            <Field label="名称">
              <Input value={$.name} onInput={(e) => { $.name = inputValue(e); rerender() }} placeholder="库存告警" />
            </Field>
            <Field label="从模板开始" hint="选模板 → 源码自动填入（可改）——第一次体验从能跑的模式开始">
              <div class="wf-row wf-gap-sm">
                <select value={$.template} onChange={(e: any) => {
                  const t = WF_TEMPLATES.find((x) => x.key === (e.target as any).value)
                  $.template = String((e.target as any).value)
                  if (t) { $.wfjs = t.wfjs(globalThis.location?.origin ?? 'http://localhost:3000'); rerender() }
                }}>
                  {WF_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
                <Button size="sm" variant="ghost" onClick={() => {
                  const t = WF_TEMPLATES.find((x) => x.key === $.template)
                  if (t) { $.wfjs = t.wfjs(globalThis.location?.origin ?? 'http://localhost:3000'); rerender() }
                }}>填入</Button>
              </div>
            </Field>
            <Field label="wfjs 源码" hint="创建时编译 + 校验（未声明变量/语法错即拒绝）">
              <CodeEditor value={$.wfjs} lang="ts" rows={10} onChange={(v) => { $.wfjs = v; rerender() }} />
            </Field>
            {$.error && <Alert variant="error">{$.error}</Alert>}
            <div class="wf-row wf-gap-md">
              <Button variant="primary" disabled={$.creating} onClick={() => void create()}>{$.creating ? '创建中...' : '创建工作流'}</Button>
            </div>
          </div>
        </Card>

        <Card key="list">
          <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-margin-bottom-md">工作流列表</div>
          {$.rows.length === 0 ? (
            <div class="wf-font-sm wf-text-secondary">暂无工作流——用上面源码创建一个</div>
          ) : (
            <div class="wf-stack wf-gap-sm">
              {$.rows.map(r => (
                <div key={r.id} class="wf-row wf-gap-md wf-items-center wf-border-bottom wf-padding-y-sm">
                  <a href={`/workflows/${r.id}`} class="wf-fill wf-font-sm wf-fill-hover">
                    <span class="wf-semibold">{r.name}</span>
                    {r.cron && <span class="wf-font-xs wf-text-warning wf-margin-left-sm">⏱ {r.cron}</span>}
                    <span class="wf-font-xs wf-text-tertiary wf-margin-left-sm">{String(r.updated_at ?? '').slice(0, 19)}</span>
                  </a>
                  {r.last_run && (
                    <span class="wf-font-xs wf-text-secondary">
                      <Badge variant={r.last_run.status === 'success' ? 'success' : r.last_run.status === 'error' ? 'danger' : 'warning'}>{r.last_run.status}</Badge>
                      <span class="wf-margin-left-xs">{r.last_run.trigger} · {String(r.last_run.created_at ?? '').slice(5, 16)}</span>
                    </span>
                  )}
                  {!r.last_run && <span class="wf-font-xs wf-text-tertiary">未运行</span>}
                  <Badge variant={r.status === 'active' ? 'success' : 'default'}>{r.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => void runRow(r.id)}>执行</Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(r.id)}>删除</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    )
  }
}
