import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { setRefreshToken } from '../lib/api'
import { Alert, Button, Card, Field, Input, PasswordInput } from 'weifuwu/components'
import { Avatar } from 'weifuwu/components'

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
  }
  return (props) => (
    <div class="wf-center wf-p-xl wf-bg-secondary" style="min-height: 100vh">
      <Card>
        <div class="wf-stack wf-gap-sm wf-text-center wf-mb-lg">
          <div class="wf-center"><Avatar name="A" size="lg" /></div>
          <div class="wf-text-2xl wf-text-semibold">登录</div>
          <div class="wf-text-sm wf-text-secondary">Agent Platform — 多租户 AI 平台</div>
        </div>

        <div class="wf-mb-md">{$.error && <Alert variant="error">{$.error}</Alert>}</div>

        <form class="wf-stack wf-gap-md" onSubmit={handleLogin}>
          <Field label="邮箱" required>
            <Input type="email" placeholder="you@example.com" value={$.email}
              onInput={(e: any) => { $.email = e.target.value }} />
          </Field>
          <Field label="密码" required>
            <PasswordInput placeholder="••••••••" value={$.password}
              onInput={(e: any) => { $.password = e.target.value }} />
          </Field>
          <Button variant="primary" block type="submit" disabled={$.loading}>
            {$.loading ? '登录中...' : '登 录'}
          </Button>
        </form>

        <div class="wf-text-sm wf-text-secondary wf-mt-lg wf-text-center">
          还没有账号？
          <a onClick={() => ctx.app?.navigate('/register')}>立即注册</a>
        </div>
      </Card>
    </div>
  )
}
