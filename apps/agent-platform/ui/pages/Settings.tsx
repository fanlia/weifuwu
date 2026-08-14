import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, errMsg } from '../components/ui'
import { Alert, Badge, Button, Card, Field, Icon, Input, PasswordInput, Select, ThemeSwitch } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import type { AuditEntry, OpsInfo } from '../lib/types'

interface SettingsState {
  name: string; nameSubmitting: boolean; nameOk: string; nameErr: string
  currentPassword: string; newPassword: string; confirmPassword: string
  pwdSubmitting: boolean; pwdOk: string; pwdErr: string
  auditFilter: string
  sysHealth: OpsInfo | null
  inviteLink: string; inviteCopied: boolean; inviteErr: string
  inviteRole: string
  plan: { plan: string; label: string; trialEndsAt: string | null; trialExpired: boolean; monthlyTokenLimit: number; usedThisMonth?: number } | null
  byok: { baseUrl: string; apiKey: string; apiKeySet: boolean; model: string } | null
  byokSubmitting: boolean; byokOk: string; byokErr: string
}

const AUDIT_LABELS: Record<string, string> = {
  login_success: '登录成功', agent_create: '创建 Agent', agent_update: '更新 Agent',
  agent_delete: '删除 Agent', approval: '审批操作', invite_create: '生成邀请', invite_join: '邀请加入',
}
function fmtAuditTime(t: string): string {
  try { return new Date(t).toLocaleString().slice(0, 16) } catch { return String(t ?? '').slice(0, 16) }
}

export const Settings: Component = async (_props, ctx) => {
  // 审计日志（Wave 9）——加载最近 20 条（支持 action 过滤）
  const auditEntries: AuditEntry[] = []
  const loadAudit = (action?: string) => {
    auditEntries.length = 0
    const q = action ? `&action=${encodeURIComponent(action)}` : ''
    return ctx.api!.get<{ entries: AuditEntry[] }>(`/api/audit?limit=20${q}`).then((d) => {
      auditEntries.push(...(d.entries ?? []))
      ctx.ui.render()
    }).catch(() => {})
  }
  void loadAudit()
  const $ = {} as SettingsState
  const rerender = () => ctx.ui.render()

  $.name = ctx.auth?.user?.name ?? ''
  $.auditFilter = ''
  $.sysHealth = null
  // 系统状态（运营视角：健康 + 沙盒 + 今日审计）
  void ctx.api!.get('/api/ops').then((d) => { $.sysHealth = d; ctx.ui.render() }).catch(() => {})
  $.nameSubmitting = false; $.nameOk = ''; $.nameErr = ''
    $.currentPassword = ''; $.newPassword = ''; $.confirmPassword = ''
    $.pwdSubmitting = false; $.pwdOk = ''; $.pwdErr = ''
    $.inviteLink = ''; $.inviteCopied = false; $.inviteRole = 'member'
    $.plan = null
    $.byok = null; $.byokSubmitting = false; $.byokOk = ''; $.byokErr = ''
    // 计划状态（G1 付费墙：试用剩余/配额用量）
    void ctx.api!.get('/api/plan').then((d: any) => { $.plan = d; ctx.ui.render() }).catch(() => {})
    // BYOK（G4：租户自带模型 Key）
    void ctx.api!.get('/api/settings/ai-config').then((d: any) => { $.byok = d; ctx.ui.render() }).catch(() => {})

  async function saveByok() {
    if (!$.byok) return
    $.byokSubmitting = true; $.byokErr = ''; $.byokOk = ''
    rerender()
    try {
      await ctx.api!.put('/api/settings/ai-config', {
        baseUrl: $.byok.baseUrl, apiKey: $.byok.apiKey, model: $.byok.model,
      })
      $.byokOk = '已保存——新对话使用你的模型配置'
      $.byok = { ...$.byok, apiKey: '' }
    } catch (e) { $.byokErr = errMsg(e, '保存失败') }
    finally { $.byokSubmitting = false; rerender() }
  }

  async function clearByok() {
    try {
      await ctx.api!.put('/api/settings/ai-config', { clear: true })
      $.byok = { baseUrl: '', apiKey: '', apiKeySet: false, model: '' }
      $.byokOk = '已清除——恢复使用平台默认模型'
      rerender()
    } catch (e) { $.byokErr = errMsg(e, '清除失败'); rerender() }
  }

  async function createInvite() {
    $.inviteLink = ''; $.inviteCopied = false; $.inviteRole = 'member'; $.inviteErr = ''
    rerender()
    try {
      const d = await ctx.api!.post<{ url: string; expiresInDays: number }>('/api/auth/invite', { role: $.inviteRole === 'viewer' ? 'viewer' : 'member' })
      $.inviteLink = d.url
      void ctx.browser?.copyText?.(location.origin + d.url)
      $.inviteCopied = true
    } catch (e) { $.inviteErr = errMsg(e, '生成邀请失败') }
    rerender()
  }

  async function updateName(e: Event) {
    e.preventDefault()
    if (!$.name.trim()) { $.nameErr = '姓名不能为空'; rerender(); return }
    $.nameSubmitting = true; $.nameErr = ''; $.nameOk = ''
    rerender()
    try {
      await ctx.api!.put('/api/auth/profile', { name: $.name.trim() })
      ctx.auth?.setUser({ ...ctx.auth?.user, name: $.name.trim() }); $.nameOk = '姓名已更新'
    } catch (e) { $.nameErr = errMsg(e, '保存失败') }
    finally { $.nameSubmitting = false; rerender() }
  }

  async function updatePassword(e: Event) {
    e.preventDefault()
    if (!$.currentPassword || !$.newPassword) { $.pwdErr = '请填写所有密码字段'; rerender(); return }
    if ($.newPassword.length < 6) { $.pwdErr = '新密码至少 6 位'; rerender(); return }
    if ($.newPassword !== $.confirmPassword) { $.pwdErr = '两次密码输入不一致'; rerender(); return }
    $.pwdSubmitting = true; $.pwdErr = ''; $.pwdOk = ''
    rerender()
    try {
      await ctx.api!.put('/api/auth/password', { currentPassword: $.currentPassword, newPassword: $.newPassword })
      $.pwdOk = '密码已更新'
      $.currentPassword = ''; $.newPassword = ''; $.confirmPassword = ''
    } catch (e) { $.pwdErr = errMsg(e, '修改失败') }
    finally { $.pwdSubmitting = false; rerender() }
  }
  return async (props) => (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px">
      <PageHeader title="个人设置" sub="管理你的账号信息" />

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md">基本资料</div>
        <div class="wf-mb-md">{$.nameOk && <Alert variant="success">{$.nameOk}</Alert>}</div>
        <div class="wf-mb-md">{$.nameErr && <Alert variant="error">{$.nameErr}</Alert>}</div>
        <form class="wf-stack wf-gap-md" onSubmit={updateName}>
          <Field label="姓名">
            <Input type="text" value={$.name} onInput={(e: Event) => { $.name = inputValue(e); rerender() }} />
          </Field>
          <div class="wf-right">
            <Button type="submit" variant="primary" disabled={$.nameSubmitting}>
              {$.nameSubmitting ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md">修改密码</div>
        <div class="wf-mb-md">{$.pwdOk && <Alert variant="success">{$.pwdOk}</Alert>}</div>
        <div class="wf-mb-md">{$.pwdErr && <Alert variant="error">{$.pwdErr}</Alert>}</div>
        <form class="wf-stack wf-gap-md" onSubmit={updatePassword}>
          <Field label="当前密码">
            <PasswordInput placeholder="••••••••" value={$.currentPassword}
              onInput={(e: Event) => { $.currentPassword = inputValue(e); rerender() }} />
          </Field>
          <Field label="新密码">
            <PasswordInput placeholder="至少 6 位" value={$.newPassword}
              onInput={(e: Event) => { $.newPassword = inputValue(e); rerender() }} />
          </Field>
          <Field label="确认新密码">
            <PasswordInput placeholder="再次输入新密码" value={$.confirmPassword}
              onInput={(e: Event) => { $.confirmPassword = inputValue(e); rerender() }} />
          </Field>
          <div class="wf-right">
            <Button type="submit" variant="primary" disabled={$.pwdSubmitting}>
              {$.pwdSubmitting ? '修改中...' : '修改密码'}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md"><Icon name="zap" size={14} /> 当前计划</div>
        {$.plan ? (
          <div class="wf-stack wf-gap-xs">
            <div class="wf-split wf-py-xs wf-border-b">
              <span class="wf-text-sm wf-text-secondary">计划</span>
              <span class="wf-text-sm">{$.plan.plan === 'pro' ? <Badge variant="primary">Pro</Badge> : <Badge>免费试用</Badge>}</span>
            </div>
            {$.plan.plan !== 'pro' && (
              <div class="wf-split wf-py-xs wf-border-b">
                <span class="wf-text-sm wf-text-secondary">试用到期</span>
                <span class="wf-text-sm">{$.plan.trialExpired
                  ? <Badge variant="danger">已到期（AI 已暂停）</Badge>
                  : <span>{$.plan.trialEndsAt ? new Date($.plan.trialEndsAt).toLocaleDateString() : '—'}</span>}</span>
              </div>
            )}
            <div class="wf-split wf-py-xs wf-border-b">
              <span class="wf-text-sm wf-text-secondary">本月配额</span>
              <span class="wf-text-sm wf-nums">{($.plan.usedThisMonth ?? 0).toLocaleString()} / {$.plan.monthlyTokenLimit.toLocaleString()} token</span>
            </div>
          </div>
        ) : (
          <div class="wf-text-sm wf-text-tertiary wf-py-sm">加载中...</div>
        )}
      </Card>

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md"><Icon name="server" size={14} /> 模型配置（BYOK）</div>
        <div class="wf-text-xs wf-text-tertiary wf-mb-sm">企业自带模型 Key/端点（OpenAI 兼容）——AI 对话改用你的配置，平台默认配置不参与</div>
        {$.byok ? (
          <div class="wf-stack wf-gap-md">
            {$.byokOk && <Alert variant="success">{$.byokOk}</Alert>}
            {$.byokErr && <Alert variant="error">{$.byokErr}</Alert>}
            <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); --wf-gap: 12px">
              <Field label="API Base URL">
                <Input placeholder="https://api.你的模型.com/v1" value={$.byok.baseUrl}
                  onInput={(e: Event) => { $.byok!.baseUrl = inputValue(e); rerender() }} />
              </Field>
              <Field label="API Key">
                <Input type="password" placeholder={$.byok.apiKeySet ? '已配置（留空保持不变）' : 'sk-...'}
                  value={$.byok.apiKey} onInput={(e: Event) => { $.byok!.apiKey = inputValue(e); rerender() }} />
              </Field>
              <Field label="模型">
                <Input placeholder="模型名（如 deepseek-chat）" value={$.byok.model}
                  onInput={(e: Event) => { $.byok!.model = inputValue(e); rerender() }} />
              </Field>
            </div>
            <div class="wf-row wf-gap-sm">
              <Button size="sm" variant="primary" disabled={$.byokSubmitting} onClick={saveByok}>
                {$.byokSubmitting ? '保存中...' : '保存配置'}
              </Button>
              {$.byok.apiKeySet && (
                <Button size="sm" variant="ghost" onClick={clearByok}>清除（用平台默认）</Button>
              )}
            </div>
          </div>
        ) : (
          <div class="wf-text-sm wf-text-tertiary wf-py-sm">加载中...</div>
        )}
      </Card>

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md"><Icon name="users" size={14} /> 邀请成员</div>
        <div class="wf-text-xs wf-text-tertiary wf-mb-sm">生成邀请链接，同事打开链接注册即可加入你的团队（7 天有效；仅所有者可用）</div>
        <div class="wf-mb-sm">{$.inviteErr && <Alert variant="error">{$.inviteErr}</Alert>}</div>
        <div class="wf-row wf-gap-sm wf-items-center wf-mb-sm">
          <span class="wf-text-xs wf-text-secondary">成员角色</span>
          <Select value={$.inviteRole} onChange={(v: string | string[]) => { const val = Array.isArray(v) ? 'member' : v; $.inviteRole = val; rerender() }}
            options={[
              { value: 'member', label: '成员（可对话/建 Agent）' },
              { value: 'viewer', label: '只读（仅查看）' },
            ]} />
        </div>
        {$.inviteLink ? (
          <div class="wf-stack wf-gap-sm">
            <div class="wf-surface wf-border wf-rounded-md wf-p-sm wf-text-xs wf-break-word" style="background: var(--wf-color-bg-secondary)">
              {location.origin + $.inviteLink}
            </div>
            <div class="wf-row wf-gap-sm">
              <Button size="sm" variant="primary" onClick={createInvite}>生成新邀请（旧链接失效）</Button>
              <Button size="sm" variant="ghost" onClick={() => { void ctx.browser?.copyText?.(location.origin + $.inviteLink); $.inviteCopied = true; rerender() }}>
                {$.inviteCopied ? '✓ 已复制' : '复制链接'}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="primary" onClick={createInvite}>生成邀请链接</Button>
        )}
      </Card>

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md"><Icon name="database" size={14} /> 数据与账号</div>
        <div class="wf-stack wf-gap-sm">
          <div class="wf-split wf-py-xs wf-border-b wf-items-center">
            <div class="wf-stack wf-gap-none">
              <span class="wf-text-sm">导出我的数据</span>
              <span class="wf-text-xs wf-text-tertiary">账号资料/成员关系/Agent/消息（JSON 下载）</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { window.open('/api/auth/export', '_blank') }}>导出</Button>
          </div>
          <div class="wf-split wf-py-xs wf-items-center">
            <div class="wf-stack wf-gap-none">
              <span class="wf-text-sm wf-text-error">删除账号</span>
              <span class="wf-text-xs wf-text-tertiary">匿名化你的身份（消息/日志保留，不可恢复）</span>
            </div>
            <Button size="sm" variant="danger" onClick={async () => {
              if (!window.confirm('确定删除账号？你的身份将被匿名化，此操作不可恢复。')) return
              try {
                await ctx.api!.delete('/api/auth/account')
                ctx.auth?.logout?.()
                ctx.app?.navigate('/login')
              } catch (e) { window.alert('删除失败：' + errMsg(e, '未知错误')) }
            }}>删除账号</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md"><Icon name="activity" size={14} /> 系统状态</div>
        {$.sysHealth ? (
          <div class="wf-stack wf-gap-xs">
            <div class="wf-split wf-py-xs wf-border-b">
              <span class="wf-text-sm wf-text-secondary">今日审计操作</span>
              <span class="wf-text-sm wf-text-semibold wf-nums">{$.sysHealth.auditToday ?? 0} 条</span>
            </div>
            <div class="wf-split wf-py-xs wf-border-b">
              <span class="wf-text-sm wf-text-secondary">授权</span>
              <span class="wf-text-sm">{$.sysHealth?.license?.edition === 'licensed'
                ? <span><Badge variant="success">企业授权</Badge> {$.sysHealth?.license?.expiresAt && <span class="wf-text-xs wf-text-tertiary">至 {$.sysHealth.license.expiresAt}</span>}</span>
                : $.sysHealth?.license?.expired
                  ? <Badge variant="danger">授权已到期</Badge>
                  : <Badge>社区版</Badge>}</span>
            </div>
            <div class="wf-split wf-py-xs wf-border-b">
              <span class="wf-text-sm wf-text-secondary">沙盒执行环境</span>
              <span class="wf-text-sm">{$.sysHealth.sandbox?.available ? <Badge variant="success">运行中</Badge> : <Badge variant="danger">不可用</Badge>} <span class="wf-text-xs wf-text-tertiary">模式 {$.sysHealth.sandbox?.mode ?? '-'} · 池 {$.sysHealth.sandbox?.poolSize ?? 0}/{$.sysHealth.sandbox?.maxContainers ?? '-'}</span></span>
            </div>
            <div class="wf-split wf-py-xs wf-border-b">
              <span class="wf-text-sm wf-text-secondary">容器镜像</span>
              <span class="wf-text-sm">{$.sysHealth.sandbox?.imageReady ? <Badge variant="success">就绪</Badge> : <Badge variant="danger">缺失</Badge>}</span>
            </div>
          </div>
        ) : (
          <div class="wf-text-sm wf-text-tertiary wf-py-sm">加载中...</div>
        )}
      </Card>
      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md"><Icon name="settings" size={14} /> 外观</div>
        <div class="wf-split wf-py-sm wf-border-b">
          <div class="wf-stack wf-gap-none">
            <span class="wf-text-sm">主题</span>
            <span class="wf-text-xs wf-text-tertiary">自动跟随系统偏好；可强制亮色/暗色（持久化）</span>
          </div>
          <ThemeSwitch />
        </div>
      </Card>
      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md"><Icon name="shield" size={14} /> 审计日志</div>
        <div class="wf-row wf-gap-xs wf-items-center wf-mb-sm">
          <span class="wf-text-xs wf-text-tertiary">登录、Agent 变更与审批操作记录（最近 20 条）</span>
          <Button size="sm" variant="ghost" onClick={() => { window.open('/api/audit/export', '_blank') }}><Icon name="file-text" size={14} /> 导出 CSV</Button>
          <div style="width: 140px; margin-left: auto">
            <Select value={$.auditFilter} onChange={(v: string | string[]) => { const val = Array.isArray(v) ? '' : v; $.auditFilter = val; void loadAudit(val || undefined) }}
              options={[{ value: '', label: '全部操作' }, { value: 'login_success', label: '登录' }, { value: 'agent_create', label: '创建 Agent' }, { value: 'agent_update', label: '更新 Agent' }, { value: 'agent_delete', label: '删除 Agent' }, { value: 'approval', label: '审批' }]} />
          </div>
        </div>
        {auditEntries.length === 0 ? (
          <div class="wf-text-sm wf-text-tertiary wf-py-sm">{$.auditFilter ? '该类型暂无记录' : '暂无记录'}</div>
        ) : (
          <div class="wf-stack wf-gap-xs">
            {auditEntries.map((e: AuditEntry, i: number) => (
              <div key={i} class="wf-split wf-py-xs wf-border-b">
                <div class="wf-stack wf-gap-none">
                  <span class="wf-text-sm">{AUDIT_LABELS[e.action] ?? e.action}</span>
                  <span class="wf-text-xs wf-text-tertiary">{e.user_name ?? 'system'} · {fmtAuditTime(e.created_at)}</span>
                </div>
                <span class="wf-text-xs wf-text-secondary wf-nums">{String(e.detail?.name ?? e.target_type ?? '')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
