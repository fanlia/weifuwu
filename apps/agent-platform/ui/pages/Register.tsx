import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Alert, Avatar, Button, Card, Field, Input, PasswordInput } from 'weifuwu/components'

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
    <div class="wf-center wf-p-xl wf-bg-secondary" style="min-height: 100vh">
      <Card>
        <div class="wf-stack wf-gap-sm wf-text-center wf-mb-lg">
          <div class="wf-center"><Avatar name="A" size="lg" /></div>
          <div class="wf-text-2xl wf-text-semibold">创建账号</div>
          <div class="wf-text-sm wf-text-secondary">注册 Agent Platform，开始构建 AI 团队</div>
        </div>
        <div class="wf-mb-md">{$.error && <Alert variant="error">{$.error}</Alert>}</div>
        <form class="wf-stack wf-gap-md" onSubmit={handleRegister}>
          <Field label="姓名" required>
            <Input placeholder="你的名字" value={$.name} onInput={(e: any) => { $.name = e.target.value }} />
          </Field>
          <Field label="邮箱" required>
            <Input type="email" placeholder="you@example.com" value={$.email} onInput={(e: any) => { $.email = e.target.value }} />
          </Field>
          <Field label="密码" required>
            <PasswordInput placeholder="••••••••" value={$.password} onInput={(e: any) => { $.password = e.target.value }} />
          </Field>
          <Button variant="primary" block type="submit" disabled={$.loading}>
            {$.loading ? '注册中...' : '注 册'}
          </Button>
        </form>
        <div class="wf-text-sm wf-text-secondary wf-mt-lg wf-text-center">
          已有账号？<a onClick={() => ctx.app?.navigate('/login')}>立即登录</a>
        </div>
      </Card>
    </div>
  )
}
