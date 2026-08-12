import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { AuthPage, Avatar, Field, Input, PasswordInput } from 'weifuwu/components'

export const Register: Component = async (_props, ctx) => {
  const $: Record<string, any> = {}
  const rerender = () => ctx.ui.render()
$.email = ''; $.name = ''; $.password = ''; $.error = ''; $.loading = false

  async function handleRegister() {
    if (!$.email || !$.name || !$.password) { $.error = '请填写所有字段'; rerender(); return }
    $.loading = true; $.error = ''
    rerender()
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $.email, name: $.name, password: $.password }),
      })
      const data = await res.json()
      if (!res.ok) { $.error = data.error || '注册失败'; $.loading = false; rerender(); return }
      ctx.auth?.login(data.token, data.user, data.refreshToken)
      $.loading = false
      ctx.app?.navigate('/')
      rerender()
    } catch { $.error = '网络错误'; $.loading = false; rerender() }
  }
  return async (props) => (
    <AuthPage
      title="创建账号"
      subtitle="注册 Agent Platform，开始构建 AI 团队"
      logo={<Avatar name="A" size="lg" />}
      submitLabel="注 册"
      loading={$.loading}
      error={$.error || null}
      onSubmit={() => handleRegister()}
      footer={<span>已有账号？<a onClick={() => ctx.app?.navigate('/login')}>立即登录</a></span>}
    >
      <Field label="姓名" required>
        <Input placeholder="你的名字" value={$.name} onInput={(e: any) => { $.name = e.target.value; rerender() }} />
      </Field>
      <Field label="邮箱" required>
        <Input type="email" placeholder="you@example.com" value={$.email} onInput={(e: any) => { $.email = e.target.value; rerender() }} />
      </Field>
      <Field label="密码" required>
        <PasswordInput placeholder="••••••••" value={$.password} onInput={(e: any) => { $.password = e.target.value; rerender() }} />
      </Field>
    </AuthPage>
  )
}
