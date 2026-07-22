/**
 * 注册页面
 */

import { signal, computed, Show } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { setRefreshToken } from '../lib/api'

export function Register(_props: {}, ctx: WfuiContext) {
  const name = signal('')
  const email = signal('')
  const password = signal('')
  const error = signal('')
  const loading = signal(false)
  const hasError = computed(() => error.value !== '')

  async function handleRegister(e: Event) {
    e.preventDefault()
    if (!name.value || !email.value || !password.value) {
      error.value = '请填写所有字段'
      return
    }
    loading.value = true
    error.value = ''

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.value, email: email.value, password: password.value }),
      })
      const data = await res.json()
      if (!res.ok) {
        error.value = data.error || '注册失败'
        loading.value = false
        return
      }
      ctx.auth.login(data.token, data.user)
      setRefreshToken(data.refreshToken ?? null)
      ctx.app.navigate('/')
    } catch {
      error.value = '网络错误，请稍后重试'
      loading.value = false
    }
  }

  return (
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">A</div>
        <div class="auth-title">创建账号</div>
        <p class="auth-sub">注册 Agent Platform，开始构建 AI 团队</p>

        <Show when={hasError}>
          <div class="alert alert-err">{error}</div>
        </Show>

        <form onSubmit={handleRegister}>
          <div class="field">
            <label class="field-label">用户名</label>
            <input
              class="input"
              type="text"
              placeholder="你的名字"
              value={name}
              onInput={(e: any) => { name.value = e.target.value }}
            />
          </div>
          <div class="field">
            <label class="field-label">邮箱</label>
            <input
              class="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onInput={(e: any) => { email.value = e.target.value }}
            />
          </div>
          <div class="field">
            <label class="field-label">密码</label>
            <input
              class="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onInput={(e: any) => { password.value = e.target.value }}
            />
          </div>
          <button class="btn btn-primary btn-block mt-8" type="submit" disabled={loading}>
            {computed(() => loading.value ? '注册中...' : '注 册')}
          </button>
        </form>

        <p class="auth-alt">
          已有账号？<a href="/login" onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/login') }}>直接登录</a>
        </p>
      </div>
    </div>
  )
}
