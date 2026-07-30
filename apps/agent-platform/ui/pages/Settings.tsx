import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader } from '../components/ui'

export const Settings: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const token = ctx.auth?.token

    $.name = ctx.auth?.user?.name ?? ''
    $.nameSubmitting = false; $.nameOk = ''; $.nameErr = ''
    $.currentPassword = ''; $.newPassword = ''; $.confirmPassword = ''
    $.pwdSubmitting = false; $.pwdOk = ''; $.pwdErr = ''

  async function updateName(e: Event) {
    e.preventDefault()
    if (!$.name.trim()) { $.nameErr = '姓名不能为空'; return }
    $.nameSubmitting = true; $.nameErr = ''; $.nameOk = ''
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: $.name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { $.nameErr = data.error || '保存失败' }
      else { ctx.auth?.setUser({ ...ctx.auth?.user, name: $.name.trim() }); $.nameOk = '姓名已更新' }
    } catch { $.nameErr = '网络错误' }
    finally { $.nameSubmitting = false }

  async function updatePassword(e: Event) {
    e.preventDefault()
    if (!$.currentPassword || !$.newPassword) { $.pwdErr = '请填写所有密码字段'; return }
    if ($.newPassword.length < 6) { $.pwdErr = '新密码至少 6 位'; return }
    if ($.newPassword !== $.confirmPassword) { $.pwdErr = '两次密码输入不一致'; return }
    $.pwdSubmitting = true; $.pwdErr = ''; $.pwdOk = ''
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: $.currentPassword, newPassword: $.newPassword }),
      })
      const data = await res.json()
      if (!res.ok) { $.pwdErr = data.error || '修改失败' }
      else {
        $.pwdOk = '密码已更新'
        $.currentPassword = ''; $.newPassword = ''; $.confirmPassword = ''
      }
    } catch { $.pwdErr = '网络错误' }
    finally { $.pwdSubmitting = false }

  }
  }
  return (props) => (
    <div class="page page-narrow">
      <PageHeader title="个人设置" sub="管理你的账号信息" />

      <div class="card card-pad" style={{ marginBottom: '16px' }}>
        <div class="sect-title" style={{ marginBottom: '16px' }}>基本资料</div>
        {$.nameOk && <div class="alert alert-ok">{$.nameOk}</div>}
        {$.nameErr && <div class="alert alert-err">{$.nameErr}</div>}
        <form onSubmit={updateName}>
          <div class="field">
            <label class="field-label">姓名</label>
            <input class="input" type="text" value={$.name}
              onInput={(e: any) => { $.name = e.target.value }} />
          </div>
          <button type="submit" class="btn btn-primary" disabled={$.nameSubmitting}>
            {$.nameSubmitting ? '保存中...' : '保存'}
          </button>
        </form>
      </div>

      <div class="card card-pad">
        <div class="sect-title" style={{ marginBottom: '16px' }}>修改密码</div>
        {$.pwdOk && <div class="alert alert-ok">{$.pwdOk}</div>}
        {$.pwdErr && <div class="alert alert-err">{$.pwdErr}</div>}
        <form onSubmit={updatePassword}>
          <div class="field">
            <label class="field-label">当前密码</label>
            <input class="input" type="password" placeholder="••••••••"
              value={$.currentPassword}
              onInput={(e: any) => { $.currentPassword = e.target.value }} />
          </div>
          <div class="field">
            <label class="field-label">新密码</label>
            <input class="input" type="password" placeholder="至少 6 位"
              value={$.newPassword}
              onInput={(e: any) => { $.newPassword = e.target.value }} />
          </div>
          <div class="field">
            <label class="field-label">确认新密码</label>
            <input class="input" type="password" placeholder="再次输入新密码"
              value={$.confirmPassword}
              onInput={(e: any) => { $.confirmPassword = e.target.value }} />
          </div>
          <button type="submit" class="btn btn-primary" disabled={$.pwdSubmitting}>
            {$.pwdSubmitting ? '修改中...' : '修改密码'}
          </button>
        </form>
      </div>
    </div>
  )
}
