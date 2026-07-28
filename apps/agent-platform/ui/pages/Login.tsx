import type { WfuiContext, Component } from 'weifuwu/client'
import { setRefreshToken } from '../lib/api'

export const Login: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
$.email = ''; $.password = ''; $.error = ''; $.loading = false

  async function handleLogin(e: Event) {
    e.preventDefault()
    if (!$.email || !$.password) { $.error = '请输入邮箱和密码'; return }
    $.loading = true
    $.error = ''
   

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $.email, password: $.password }),
      })
      const data = await res.json()
      if (!res.ok) { $.error = data.error || '登录失败'; $.loading = false; return }
      ctx.auth?.login(data.token, data.user, data.refreshToken)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      ctx.app?.navigate('/')
    } catch {
      $.error = '网络错误，请检查连接后重试'
      $.loading = false
     
    }

  return (props) => (
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">A</div>
        <div class="auth-title">登录</div>
        <div class="auth-sub">Agent Platform — 多租户 AI 平台</div>

        {$.error && <div class="alert alert-err">{$.error}</div>}

        <form onSubmit={handleLogin}>
          <div class="field">
            <label class="field-label">邮箱 <span class="req">*</span></label>
            <input class="input" type="email" placeholder="you@example.com"
              value={$.email}
              onInput={(e: any) => { $.email = e.target.value }} />
          </div>
          <div class="field">
            <label class="field-label">密码 <span class="req">*</span></label>
            <input class="input" type="password" placeholder="••••••••"
              value={$.password}
              onInput={(e: any) => { $.password = e.target.value }} />
          </div>
          <button class="btn btn-primary btn-block" type="submit" disabled={$.loading}>
            {$.loading ? '登录中...' : '登 录'}
          </button>
        </form>

        <div class="auth-alt">
          还没有账号？
          <a onClick={() => ctx.app?.navigate('/register')}>立即注册</a>
        </div>
      </div>
    </div>
  )
}
