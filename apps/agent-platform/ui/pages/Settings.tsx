import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, errMsg } from '../components/ui'
import { Alert, Badge, Button, Card, Field, Icon, Input, PasswordInput, Select, ThemeSwitch } from 'weifuwu/components'
import { inputValue } from '../lib/types'

interface SettingsState {
  name: string; nameSubmitting: boolean; nameOk: string; nameErr: string
  currentPassword: string; newPassword: string; confirmPassword: string
  pwdSubmitting: boolean; pwdOk: string; pwdErr: string
  auditFilter: string
  sysHealth: any
}

const AUDIT_LABELS: Record<string, string> = {
  login_success: '登录成功', agent_create: '创建 Agent', agent_update: '更新 Agent',
  agent_delete: '删除 Agent', approval: '审批操作',
}
function fmtAuditTime(t: string): string {
  try { return new Date(t).toLocaleString().slice(0, 16) } catch { return String(t ?? '').slice(0, 16) }
}

export const Settings: Component = async (_props, ctx) => {
  // 审计日志（Wave 9）——加载最近 20 条（支持 action 过滤）
  const auditEntries: any[] = []
  const loadAudit = (action?: string) => {
    auditEntries.length = 0
    const q = action ? `&action=${encodeURIComponent(action)}` : ''
    return ctx.api!.get<{ entries: any[] }>(`/api/audit?limit=20${q}`).then((d) => {
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
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md"><Icon name="activity" size={14} /> 系统状态</div>
        {$.sysHealth ? (
          <div class="wf-stack wf-gap-xs">
            <div class="wf-split wf-py-xs wf-border-b">
              <span class="wf-text-sm wf-text-secondary">今日审计操作</span>
              <span class="wf-text-sm wf-text-semibold wf-nums">{$.sysHealth.auditToday ?? 0} 条</span>
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
          <div style="width: 140px; margin-left: auto">
            <Select value={$.auditFilter} onChange={(v: string | string[]) => { const val = Array.isArray(v) ? '' : v; $.auditFilter = val; void loadAudit(val || undefined) }}
              options={[{ value: '', label: '全部操作' }, { value: 'login_success', label: '登录' }, { value: 'agent_create', label: '创建 Agent' }, { value: 'agent_update', label: '更新 Agent' }, { value: 'agent_delete', label: '删除 Agent' }, { value: 'approval', label: '审批' }]} />
          </div>
        </div>
        {auditEntries.length === 0 ? (
          <div class="wf-text-sm wf-text-tertiary wf-py-sm">{$.auditFilter ? '该类型暂无记录' : '暂无记录'}</div>
        ) : (
          <div class="wf-stack wf-gap-xs">
            {auditEntries.map((e: any, i: number) => (
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
