/**
 * 个人设置页面 — 修改姓名 / 修改密码
 */

import { signal, computed, Show } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader } from '../components/ui'

export function Settings(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }
  const user = ctx.auth?.user
  const currentName = computed(() => (user?.value ?? user)?.name ?? '')

  // ── 姓名修改 ──
  const name = signal(currentName.value)
  const nameSubmitting = signal(false)
  const nameOk = signal('')
  const nameErr = signal('')

  // ── 密码修改 ──
  const currentPassword = signal('')
  const newPassword = signal('')
  const confirmPassword = signal('')
  const pwdSubmitting = signal(false)
  const pwdOk = signal('')
  const pwdErr = signal('')

  async function updateName(e: Event) {
    e.preventDefault()
    if (!name.value.trim()) { nameErr.value = '姓名不能为空'; return }
    nameSubmitting.value = true
    nameErr.value = ''
    nameOk.value = ''
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ name: name.value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { nameErr.value = data.error || '保存失败' }
      else { nameOk.value = '姓名已更新' }
    } catch {
      nameErr.value = '网络错误'
    } finally {
      nameSubmitting.value = false
    }
  }

  async function updatePassword(e: Event) {
    e.preventDefault()
    if (!currentPassword.value || !newPassword.value) {
      pwdErr.value = '请填写所有密码字段'
      return
    }
    if (newPassword.value.length < 6) {
      pwdErr.value = '新密码至少 6 位'
      return
    }
    if (newPassword.value !== confirmPassword.value) {
      pwdErr.value = '两次密码输入不一致'
      return
    }
    pwdSubmitting.value = true
    pwdErr.value = ''
    pwdOk.value = ''
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ currentPassword: currentPassword.value, newPassword: newPassword.value }),
      })
      const data = await res.json()
      if (!res.ok) { pwdErr.value = data.error || '修改失败' }
      else {
        pwdOk.value = '密码已更新'
        currentPassword.value = ''
        newPassword.value = ''
        confirmPassword.value = ''
      }
    } catch {
      pwdErr.value = '网络错误'
    } finally {
      pwdSubmitting.value = false
    }
  }

  return (
    <div class="page page-narrow">
      <PageHeader title="个人设置" sub="管理你的账号信息" />

      {/* ── 姓名 ── */}
      <div class="card card-pad" style={{ marginBottom: '16px' }}>
        <div class="sect-title" style={{ marginBottom: '16px' }}>基本资料</div>
        <Show when={computed(() => nameOk.value !== '')}>
          <div class="alert alert-ok">{nameOk}</div>
        </Show>
        <Show when={computed(() => nameErr.value !== '')}>
          <div class="alert alert-err">{nameErr}</div>
        </Show>
        <form onSubmit={updateName}>
          <div class="field">
            <label class="field-label">姓名</label>
            <input class="input" type="text" value={name}
              onInput={(e: any) => { name.value = e.target.value }} />
          </div>
          <button type="submit" class="btn btn-primary" disabled={nameSubmitting}>
            {computed(() => nameSubmitting.value ? '保存中...' : '保存')}
          </button>
        </form>
      </div>

      {/* ── 密码 ── */}
      <div class="card card-pad">
        <div class="sect-title" style={{ marginBottom: '16px' }}>修改密码</div>
        <Show when={computed(() => pwdOk.value !== '')}>
          <div class="alert alert-ok">{pwdOk}</div>
        </Show>
        <Show when={computed(() => pwdErr.value !== '')}>
          <div class="alert alert-err">{pwdErr}</div>
        </Show>
        <form onSubmit={updatePassword}>
          <div class="field">
            <label class="field-label">当前密码</label>
            <input class="input" type="password" placeholder="••••••••"
              value={currentPassword}
              onInput={(e: any) => { currentPassword.value = e.target.value }} />
          </div>
          <div class="field">
            <label class="field-label">新密码</label>
            <input class="input" type="password" placeholder="至少 6 位"
              value={newPassword}
              onInput={(e: any) => { newPassword.value = e.target.value }} />
          </div>
          <div class="field">
            <label class="field-label">确认新密码</label>
            <input class="input" type="password" placeholder="再次输入新密码"
              value={confirmPassword}
              onInput={(e: any) => { confirmPassword.value = e.target.value }} />
          </div>
          <button type="submit" class="btn btn-primary" disabled={pwdSubmitting}>
            {computed(() => pwdSubmitting.value ? '修改中...' : '修改密码')}
          </button>
        </form>
      </div>
    </div>
  )
}
