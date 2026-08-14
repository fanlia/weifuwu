import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, errMsg } from '../components/ui'
import { Alert, Badge, Button, Card, StatCard, Table, Icon } from 'weifuwu/components'

interface AdminApp {
  id: string
  slug: string
  name: string
  status: string
  plan?: string
  trial_ends_at?: string | null
  monthly_token_limit?: number
  created_at: string
  member_count: number
  agent_count: number
  token_usage: number
  token_usage_month: number
}

export const Admin: Component = async (_props, ctx) => {
  let apps: AdminApp[] = []
  let loading = true
  let error = ''
  let busyId = ''
  let overview: any = null
  let opsInfo: any = null
  const load = () => {
    loading = true; error = ''
    ctx.ui.render()
    return ctx.api!.get<{ apps: AdminApp[] }>('/api/admin/apps')
      .then((d) => { apps = d.apps ?? []; loading = false; ctx.ui.render() })
      .catch((e) => { error = errMsg(e, '加载租户列表失败'); loading = false; ctx.ui.render() })
  }
  void load()
  // 平台使用概览（G11）
  void ctx.api!.get<any>('/api/admin/overview').then((d) => { overview = d; ctx.ui.render() }).catch(() => {})
  void ctx.api!.get<any>('/api/ops').then((d) => { opsInfo = d; ctx.ui.render() }).catch(() => {})

  async function openPro(a: AdminApp) {
    busyId = a.id
    ctx.ui.render()
    try {
      await ctx.api!.post(`/api/admin/apps/${a.id}/plan`, { plan: 'pro', monthlyTokenLimit: 1000000 })
      await load()
    } catch (e) { error = errMsg(e, '操作失败'); ctx.ui.render() }
    finally { busyId = '' }
  }

  async function toggleStatus(a: AdminApp) {
    busyId = a.id
    ctx.ui.render()
    try {
      await ctx.api!.post(`/api/admin/apps/${a.id}/status`, { status: a.status === 'disabled' ? 'active' : 'disabled' })
      await load()
    } catch (e) {
      error = errMsg(e, '操作失败')
      ctx.ui.render()
    } finally { busyId = '' }
  }

  const fmtTokens = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)

  return async () => (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 960px">
      <PageHeader title="租户管理" sub="平台管理员：查看所有团队用量，停用/启用租户（ADMIN_EMAILS 白名单）" />

      {error && <Alert variant="error">{error}</Alert>}

      {overview && (
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(160px, 1fr))">
          <StatCard label="租户总数" value={overview.totalApps} icon={<Icon name="grid" />} />
          <StatCard label="7 天活跃租户" value={overview.activeApps7d} icon={<Icon name="activity" />} />
          <StatCard label="Pro 租户" value={overview.proApps} icon={<Icon name="zap" />} />
          <StatCard label="本月消息" value={overview.msgsMonth} icon={<Icon name="message" />} />
          <StatCard label="AI 回复" value={overview.aiRepliesMonth} icon={<Icon name="cpu" />} />
          <StatCard label="平台成本（月）" value={`¥${overview.costYuanMonth}`} icon={<Icon name="database" />} />
        </div>
      )}

      {opsInfo && (
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(160px, 1fr))">
          <StatCard label="沙盒池" value={`${opsInfo.sandbox?.poolSize ?? 0}/${opsInfo.sandbox?.maxContainers ?? 0}`} icon={<Icon name="box" />} />
          <StatCard label="沙盒模式" value={opsInfo.sandbox?.mode ?? '-'} icon={<Icon name="cpu" />} />
          <StatCard label="容器镜像" value={opsInfo.sandbox?.imageReady ? '就绪' : '缺失'} icon={<Icon name="hard-drive" />} />
        </div>
      )}

      {loading ? (
        <div class="wf-text-sm wf-text-tertiary wf-py-lg wf-center">加载中...</div>
      ) : (
        <Card>
          <Table
            data={apps}
            columns={[
              { key: 'name', label: '团队', render: (v: any) => <span class="wf-text-sm wf-text-semibold">{v}</span> },
              { key: 'slug', label: 'Slug' },
              { key: 'member_count', label: '成员', render: (v: any) => <span class="wf-nums">{v}</span> },
              { key: 'agent_count', label: 'Agent', render: (v: any) => <span class="wf-nums">{v}</span> },
              { key: 'token_usage_month', label: '本月 Token', render: (v: any) => <span class="wf-nums">{fmtTokens(Number(v))}</span> },
              { key: 'token_usage', label: '累计 Token', render: (v: any) => <span class="wf-nums wf-text-secondary">{fmtTokens(Number(v))}</span> },
              { key: 'plan', label: '计划', render: (v: any, row: any) => (
                <span class="wf-row wf-gap-sm wf-items-center">
                  {v === 'pro' ? <Badge variant="primary">Pro</Badge> : <Badge>免费试用</Badge>}
                  {v !== 'pro' && (
                    <Button size="sm" variant="primary" disabled={busyId === row.id} onClick={() => openPro(row)}>开通 Pro</Button>
                  )}
                </span>
              ) },
              { key: 'status', label: '状态', render: (v: any, row: any) => (
                <span class="wf-row wf-gap-sm wf-items-center">
                  {v === 'disabled' ? <Badge variant="danger">已停用</Badge> : <Badge variant="success">正常</Badge>}
                  <Button size="sm" variant={v === 'disabled' ? 'primary' : 'ghost'}
                    disabled={busyId === row.id}
                    onClick={() => toggleStatus(row)}>
                    {v === 'disabled' ? '启用' : '停用'}
                  </Button>
                </span>
              ) },
            ]}
          />
        </Card>
      )}
    </div>
  )
}
