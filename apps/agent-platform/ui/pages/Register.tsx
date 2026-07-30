import type { WfuiContext, Component } from 'weifuwu/client'

export const Register: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
$.email = ''; $.name = ''; $.password = ''; $.error = ''; $.loading = false

  async function handleRegister(e: Event) {
    e.preventDefault()
    if (!$.email || !$.name || !$.password) { $.error = '请填写所有字段'; return }
    $.loading = true; $.error = ''
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $.email, name: $.name, password: $.password }),
      })
      const data = await res.json()
      if (!res.ok) { $.error = data.error || '注册失败'; $.loading = false; return }
      ctx.auth?.login(data.token, data.user, data.refreshToken)
      ctx.app?.navigate('/')
    } catch { $.error = '网络错误'; $.loading = false }

  }
  return (props) => (
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">A</div>
        <div class="auth-title">创建账号</div>
        <div class="auth-sub">注册 Agent Platform，开始构建 AI 团队</div>
        {$.error && <div class="alert alert-err">{$.error}</div>}
        <form onSubmit={handleRegister}>
          <div class="field">
            <label class="field-label">姓名 <span class="req">*</span></label>
            <input class="input" placeholder="你的名字"
              value={$.name} onInput={(e: any) => { $.name = e.target.value }} />
          </div>
          <div class="field">
            <label class="field-label">邮箱 <span class="req">*</span></label>
            <input class="input" type="email" placeholder="you@example.com"
              value={$.email} onInput={(e: any) => { $.email = e.target.value }} />
          </div>
          <div class="field">
            <label class="field-label">密码 <span class="req">*</span></label>
            <input class="input" type="password" placeholder="••••••••"
              value={$.password} onInput={(e: any) => { $.password = e.target.value }} />
          </div>
          <button class="btn btn-primary btn-block" type="submit" disabled={$.loading}>
            {$.loading ? '注册中...' : '注 册'}
          </button>
        </form>
        <div class="auth-alt">
          已有账号？<a onClick={() => ctx.app?.navigate('/login')}>立即登录</a>
        </div>
      </div>
    </div>
  )
}
