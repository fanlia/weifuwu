import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { setRefreshToken } from '../lib/api'
import { AuthPage, Avatar, Field, Input, PasswordInput } from 'weifuwu/components'

export const Login: Component = async (_props, ctx) => {
  const $: Record<string, any> = {}
  const rerender = () => ctx.ui.render()
$.email = ''; $.password = ''; $.error = ''; $.loading = false

  async function handleLogin() {
    if (!$.email || !$.password) { $.error = '请输入邮箱和密码'; rerender(); return }
    $.loading = true
    $.error = ''
    rerender()

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $.email, password: $.password }),
      })
      const data = await res.json()
      if (!res.ok) { $.error = data.error || '登录失败'; $.loading = false; rerender(); return }
      ctx.auth?.login(data.token, data.user, data.refreshToken)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      ctx.app?.navigate('/')
    } catch {
      $.error = '网络错误，请检查连接后重试'
      $.loading = false
      rerender()
    }
  }
  return async (props) => (
    <AuthPage
      title="登录"
      subtitle="Agent Platform — 多租户 AI 平台"
      logo={<Avatar name="A" size="lg" />}
      submitLabel="登 录"
      loading={$.loading}
      error={$.error || null}
      onSubmit={() => handleLogin()}
      footer={<span>还没有账号？<a onClick={() => ctx.app?.navigate('/register')}>立即注册</a></span>}
    >
      <Field label="邮箱" required>
        <Input type="email" placeholder="you@example.com" value={$.email}
          onInput={(e: any) => { $.email = e.target.value; rerender() }} />
      </Field>
      <Field label="密码" required>
        <PasswordInput placeholder="••••••••" value={$.password}
          onInput={(e: any) => { $.password = e.target.value; rerender() }} />
      </Field>
    </AuthPage>
  )
}
