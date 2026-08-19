import type { UIContext, Component } from 'weifuwu/vdom'
import { PageHeader, errMsg } from '../components/ui'
import { Alert, Badge, Button, Card, Input, StatCard, Table, Icon } from 'weifuwu/components'

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
  // 沙盒监控：容器列表 / 进程 / 操作
  let sbContainers: any[] | null = null
  let sbProcs: { name: string; list: any[] } | null = null
  let sbBusy = ''
  const loadContainers = () => {
    void ctx.api!.get<any>('/api/sandbox/containers').then((d) => {
      sbContainers = d.containers ?? []
      ctx.render()
    }).catch(() => {})
  }
  const containerAction = async (name: string, action: string) => {
    sbBusy = name + action; ctx.render()
    await ctx.api!.post(`/api/sandbox/containers/${name}/${action}`).catch(() => {})
    sbBusy = ''
    loadContainers()
  }
  const showProcesses = (name: string) => {
    void ctx.api!.get<any>(`/api/sandbox/containers/${name}/processes`).then((d) => {
      sbProcs = { name, list: d.processes ?? [] }
      ctx.render()
    }).catch(() => {})
  }
  let enterprises: any[] = []
  let entName = ''
  let entEmail = ''
  let entErr = ''
  const load = () => {
    loading = true; error = ''
    ctx.render()
    return ctx.api!.get<{ apps: AdminApp[] }>('/api/admin/apps')
      .then((d) => { apps = d.apps ?? []; loading = false; ctx.render() })
      .catch((e) => { error = errMsg(e, '加载租户列表失败'); loading = false; ctx.render() })
  }
  void load()
  // 平台使用概览（G11）
  void ctx.api!.get<any>('/api/admin/overview').then((d) => { overview = d; ctx.render() }).catch(() => {})
  void ctx.api!.get<any>('/api/ops').then((d) => { opsInfo = d; ctx.render() }).catch(() => {})
  void ctx.api!.get<any>('/api/admin/enterprises').then((d) => { enterprises = d.enterprises ?? []; ctx.render() }).catch(() => {})

  async function createEnterprise() {
    if (!entName.trim()) { entErr = '企业名必填'; ctx.render(); return }
    entErr = ''
    try {
      await ctx.api!.post('/api/admin/enterprises', { name: entName.trim(), ownerEmail: entEmail.trim() || undefined })
      entName = ''; entEmail = ''
      const d = await ctx.api!.get<any>('/api/admin/enterprises')
      enterprises = d.enterprises ?? []
    } catch (e: any) { entErr = e?.message ?? '创建失败' }
    ctx.render()
  }

  async function openPro(a: AdminApp) {
    busyId = a.id
    ctx.render()
    try {
      await ctx.api!.post(`/api/admin/apps/${a.id}/plan`, { plan: 'pro', monthlyTokenLimit: 1000000 })
      await load()
    } catch (e) { error = errMsg(e, '操作失败'); ctx.render() }
    finally { busyId = '' }
  }

  async function toggleStatus(a: AdminApp) {
    busyId = a.id
    ctx.render()
    try {
      await ctx.api!.post(`/api/admin/apps/${a.id}/status`, { status: a.status === 'disabled' ? 'active' : 'disabled' })
      await load()
    } catch (e) {
      error = errMsg(e, '操作失败')
      ctx.render()
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

      <Card>
        <div class="wf-row wf-between wf-mb-sm">
          <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="box" size={14} /> 沙盒监控（容器/资源/进程）</div>
          <Button size="sm" variant="ghost" onClick={loadContainers}>刷新</Button>
        </div>
        {sbContainers === null ? (
          <div class="wf-text-sm wf-text-tertiary">加载容器列表（docker ps）——<Button size="sm" variant="ghost" onClick={loadContainers}>加载</Button></div>
        ) : sbContainers.length === 0 ? (
          <div class="wf-text-sm wf-text-tertiary">暂无容器（沙盒空闲）</div>
        ) : (
          <div class="wf-stack wf-gap-xs">
            {sbContainers.map((c: any) => (
              <div key={c.name} class="wf-border wf-rounded wf-p-sm">
                <div class="wf-row wf-gap-sm wf-items-center">
                  <span class="wf-text-sm wf-text-semibold">{c.agentName}</span>
                  <span class="wf-text-xs wf-text-tertiary wf-truncate">{c.name}</span>
                  {String(c.status ?? '').includes('Up') ? <Badge variant="success">运行中</Badge> : <Badge variant="danger">已停止</Badge>}
                  <span class="wf-fill" />
                  <span class="wf-text-xs wf-text-tertiary wf-nums">CPU {c.cpu ?? '-'} · 内存 {c.mem ?? '-'} · 进程 {c.pids ?? '-'}</span>
                  <Button size="sm" variant="ghost" disabled={!!sbBusy} onClick={() => showProcesses(c.name)}>进程</Button>
                  <Button size="sm" variant="ghost" disabled={!!sbBusy} onClick={() => containerAction(c.name, 'restart')}>重启</Button>
                  <Button size="sm" variant="danger" disabled={!!sbBusy} onClick={() => containerAction(c.name, 'stop')}>停止</Button>
                </div>
                {sbProcs && sbProcs.name === c.name && (
                  <div class="wf-mt-xs wf-bg-tertiary wf-rounded wf-p-sm wf-text-xs wf-overflow-x" style="max-height: 160px; overflow-y: auto">
                    <div class="wf-row wf-gap-xs wf-text-tertiary">
                      <span class="wf-text-xs">PID</span><span class="wf-text-xs">USER</span><span class="wf-text-xs">CPU%</span><span class="wf-text-xs">MEM%</span><span class="wf-text-xs wf-fill">COMMAND</span>
                    </div>
                    {(sbProcs.list ?? []).map((p: any, i: number) => (
                      <div key={i} class="wf-row wf-gap-xs">
                        <span class="wf-nums">{p.PID ?? '-'}</span><span>{p.USER ?? '-'}</span><span class="wf-nums">{p['%CPU'] ?? '-'}</span><span class="wf-nums">{p['%MEM'] ?? '-'}</span>
                        <span class="wf-truncate wf-fill">{p.COMMAND ?? ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md"><Icon name="briefcase" size={14} /> 企业账户（子租户）</div>
        <div class="wf-row wf-gap-sm wf-mb-sm wf-cluster">
          <Input placeholder="企业名" value={entName} style={{ width: 180 }}
            onInput={(e: any) => { entName = e.target.value; ctx.render() }} />
          <Input placeholder="管理员邮箱（可选）" value={entEmail} style={{ width: 220 }}
            onInput={(e: any) => { entEmail = e.target.value; ctx.render() }} />
          <Button size="sm" variant="primary" onClick={createEnterprise}>建企业</Button>
          {entErr && <span class="wf-text-xs wf-text-error">{entErr}</span>}
        </div>
        {enterprises.length === 0 ? (
          <div class="wf-text-sm wf-text-tertiary">暂无企业——大客户场景：建企业后把租户挂入（统一结算视图）</div>
        ) : (
          <div class="wf-stack wf-gap-sm">
            {enterprises.map((e: any) => (
              <div key={e.id} class="wf-split wf-py-xs wf-border-b">
                <div class="wf-stack wf-gap-none">
                  <span class="wf-text-sm wf-text-semibold">{e.name}</span>
                  <span class="wf-text-xs wf-text-tertiary">{e.app_count} 个子租户 · 本月 {Number(e.tokens_month ?? 0).toLocaleString()} token</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => {
                  const appId = window.prompt('挂入租户的 appId（管理后台列表可见）')
                  if (appId) void ctx.api!.post(`/api/admin/enterprises/${e.id}/apps`, { appId }).then(() => {
                    void ctx.api!.get<any>('/api/admin/enterprises').then((d) => { enterprises = d.enterprises ?? []; ctx.render() })
                  })
                }}>挂租户</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

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
