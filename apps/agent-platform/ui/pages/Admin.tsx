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

export const Admin: Component = (_props, ctx) => {
  let apps: AdminApp[] = []
  let loading = true
  let error = ''
  let busyId = ''
  let overview: any = null
  let opsInfo: any = null
  // 沙盒监控：容器列表 / 进程 / 操作
  let sbContainers: any[] | null = null
  let capacity: { host: { id: string; memoryMb: number; cpus: number }; occupied: { mb: number; running: number; terminated: number }; weeklyEvictions: number; recentEvictions: Array<{ sandboxId: string; type: string; detail: string; at: string; name: string }> } | null = null
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
  // C1 容量视图（2026-08）：宿主容量 + 占用 + 驱逐审计
  void ctx.api!.get<any>('/api/admin/sandbox-capacity').then((d) => { capacity = d; ctx.render() }).catch(() => {})

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

  return () => (
    <div class="wf-container wf-stack wf-gap-lg wf-padding-lg wf-margin-x-auto" style="--wf-max: 960px">
      <PageHeader key="page-header" title="租户管理" sub="平台管理员：查看所有团队用量，停用/启用租户（ADMIN_EMAILS 白名单）" />

      {error && <Alert key="error" variant="error">{error}</Alert>}

      {overview && (
        <div key="overview" class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(160px, 1fr))">
          <StatCard key="st-total" label="租户总数" value={overview.totalApps} icon={<Icon name="grid" />} />
          <StatCard key="st-active" label="7 天活跃租户" value={overview.activeApps7d} icon={<Icon name="activity" />} />
          <StatCard key="st-pro" label="Pro 租户" value={overview.proApps} icon={<Icon name="zap" />} />
          <StatCard key="st-msgs" label="本月消息" value={overview.msgsMonth} icon={<Icon name="message" />} />
          <StatCard key="st-ai" label="AI 回复" value={overview.aiRepliesMonth} icon={<Icon name="cpu" />} />
          <StatCard key="st-cost" label="平台成本（月）" value={`¥${overview.costYuanMonth}`} icon={<Icon name="database" />} />
        </div>
      )}

      {opsInfo && (
        <div key="ops" class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(160px, 1fr))">
          <StatCard key="st-pool" label="沙盒池" value={`${opsInfo.sandbox?.poolSize ?? 0}/${opsInfo.sandbox?.maxContainers ?? 0}`} icon={<Icon name="box" />} />
          <StatCard key="st-mode" label="沙盒模式" value={opsInfo.sandbox?.mode ?? '-'} icon={<Icon name="cpu" />} />
          <StatCard key="st-image" label="容器镜像" value={opsInfo.sandbox?.imageReady ? '就绪' : '缺失'} icon={<Icon name="hard-drive" />} />
        </div>
      )}

      {capacity && (
        <Card key="capacity">
          <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary">📊 沙盒容量（宿主 {capacity.host.id}）</div>
          <div class="wf-grid wf-margin-top-sm" style="--wf-cols: repeat(auto-fill, minmax(150px, 1fr))">
            <StatCard label="内存预算" value={`${capacity.host.memoryMb}MB`} icon={<Icon name="database" />} />
            <StatCard label="当前占用" value={`${capacity.occupied.mb}MB / ${capacity.occupied.running} 运行`} icon={<Icon name="server" />} />
            <StatCard label="CPU" value={capacity.host.cpus} icon={<Icon name="cpu" />} />
            <StatCard label="7 天驱逐" value={capacity.weeklyEvictions} icon={<Icon name="warning" />} />
          </div>
          {capacity.recentEvictions.length > 0 && (
            <div class="wf-stack wf-gap-xs wf-margin-top-sm">
              {capacity.recentEvictions.map((e, i) => (
                <div key={i} class="wf-font-xs wf-text-tertiary wf-row wf-gap-sm">
                  <span class="wf-text-warning">⏏</span>
                  <span>{e.name || e.sandboxId.slice(0, 8)}</span>
                  <span>{e.detail}</span>
                  <span class="wf-fill" />
                  <span>{new Date(e.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card key="sandbox">
        <div class="wf-row wf-justify-between wf-margin-bottom-sm">
          <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="box" size={14} /> 沙盒监控（容器/资源/进程）</div>
          <Button size="sm" variant="ghost" onClick={loadContainers}>刷新</Button>
        </div>
        {sbContainers === null ? (
          <div class="wf-font-sm wf-text-tertiary">加载容器列表（docker ps）——<Button size="sm" variant="ghost" onClick={loadContainers}>加载</Button></div>
        ) : sbContainers.length === 0 ? (
          <div class="wf-font-sm wf-text-tertiary">暂无容器（沙盒空闲）</div>
        ) : (
          <div class="wf-stack wf-gap-xs">
            {sbContainers.map((c: any) => (
              <div key={c.name} class="wf-border wf-radius wf-padding-sm">
                <div class="wf-row wf-gap-sm wf-items-center">
                  <span class="wf-font-sm wf-semibold">{c.agentName}</span>
                  <span class="wf-font-xs wf-text-tertiary wf-truncate">{c.name}</span>
                  {String(c.status ?? '').includes('Up') ? <Badge variant="success">运行中</Badge> : <Badge variant="danger">已停止</Badge>}
                  <span class="wf-fill" />
                  <span class="wf-font-xs wf-text-tertiary wf-nums">CPU {c.cpu ?? '-'} · 内存 {c.mem ?? '-'} · 进程 {c.pids ?? '-'}</span>
                  <Button size="sm" variant="ghost" disabled={!!sbBusy} onClick={() => showProcesses(c.name)}>进程</Button>
                  <Button size="sm" variant="ghost" disabled={!!sbBusy} onClick={() => containerAction(c.name, 'restart')}>重启</Button>
                  <Button size="sm" variant="danger" disabled={!!sbBusy} onClick={() => containerAction(c.name, 'stop')}>停止</Button>
                </div>
                {sbProcs && sbProcs.name === c.name && (
                  <div class="wf-margin-top-xs wf-bg-tertiary wf-radius wf-padding-sm wf-font-xs wf-overflow-x" style="max-height: 160px; overflow-y: auto">
                    <div class="wf-row wf-gap-xs wf-text-tertiary">
                      <span class="wf-font-xs">PID</span><span class="wf-font-xs">USER</span><span class="wf-font-xs">CPU%</span><span class="wf-font-xs">MEM%</span><span class="wf-font-xs wf-fill">COMMAND</span>
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

      <Card key="enterprises">
        <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-margin-bottom-md"><Icon name="briefcase" size={14} /> 企业账户（子租户）</div>
        <div class="wf-row wf-gap-sm wf-margin-bottom-sm wf-cluster">
          <Input placeholder="企业名" value={entName} style={{ width: 180 }}
            onInput={(e: any) => { entName = e.target.value; ctx.render() }} />
          <Input placeholder="管理员邮箱（可选）" value={entEmail} style={{ width: 220 }}
            onInput={(e: any) => { entEmail = e.target.value; ctx.render() }} />
          <Button size="sm" variant="primary" onClick={createEnterprise}>建企业</Button>
          {entErr && <span class="wf-font-xs wf-text-error">{entErr}</span>}
        </div>
        {enterprises.length === 0 ? (
          <div class="wf-font-sm wf-text-tertiary">暂无企业——大客户场景：建企业后把租户挂入（统一结算视图）</div>
        ) : (
          <div class="wf-stack wf-gap-sm">
            {enterprises.map((e: any) => (
              <div key={e.id} class="wf-split wf-padding-y-xs wf-border-bottom">
                <div class="wf-stack wf-gap-none">
                  <span class="wf-font-sm wf-semibold">{e.name}</span>
                  <span class="wf-font-xs wf-text-tertiary">{e.app_count} 个子租户 · 本月 {Number(e.tokens_month ?? 0).toLocaleString()} token</span>
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
        <div key="loading" class="wf-font-sm wf-text-tertiary wf-padding-y-lg wf-center">加载中...</div>
      ) : (
        <Card key="apps-table">
          {/* 全量渲染（用户决策 2026-08：不截断——以 vdom 性能升级根治——见 design/VDOM-PERF-PLAN.md） */}
          {apps.length > 0 && (
            <div class="wf-font-xs wf-text-tertiary wf-margin-bottom-sm">共 {apps.length} 个团队——全量渲染（vdom 性能升级实证基线）</div>
          )}
          <Table
            data={apps}
            columns={[
              { key: 'name', label: '团队', render: (v: any) => <span class="wf-font-sm wf-semibold">{v}</span> },
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
