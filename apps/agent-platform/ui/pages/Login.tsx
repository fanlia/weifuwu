/**
 * 登录页面
 */

import { signal, computed, Show } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

export function Login(_props: {}, ctx: WfuiContext) {
  const email = signal('')
  const password = signal('')
  const error = signal('')
  const loading = signal(false)
  const hasError = computed(() => error.value !== '')

  async function handleLogin(e: Event) {
    e.preventDefault()
    if (!email.value || !password.value) {
      error.value = '请输入邮箱和密码'
      return
    }
    loading.value = true
    error.value = ''

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value, password: password.value }),
      })
      const data = await res.json()
      if (!res.ok) {
        error.value = data.error || '登录失败'
        loading.value = false
        return
      }
      ctx.auth.login(data.token, data.user)
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
        <div class="auth-title">欢迎回来</div>
        <p class="auth-sub">登录 Agent Platform 管理你的 AI 团队</p>

        <Show when={hasError}>
          <div class="alert alert-err">{error}</div>
        </Show>

        <form onSubmit={handleLogin}>
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
            {computed(() => loading.value ? '登录中...' : '登 录')}
          </button>
        </form>

        <p class="auth-alt">
          还没有账号？<a href="/register" onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/register') }}>立即注册</a>
        </p>
      </div>
    </div>
  )
}
