import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { AuthPage, Avatar, Field, Input, PasswordInput } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import { authErrorKey } from '../lib/i18n'
import { track } from '../lib/track'

interface RegisterState {
  email: string; name: string; password: string; error: string; loading: boolean
}

export const Register: Component = async (_props, ctx) => {
  const $ = {} as RegisterState
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
      if (!res.ok) { const k = authErrorKey(data.error); $.error = k ? (ctx.i18n?.t(k) ?? data.error) : (data.error || '注册失败'); $.loading = false; rerender(); return }
      ctx.auth?.login(data.token, data.user, data.refreshToken)
      track('register_complete')
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
        <Input placeholder="你的名字" value={$.name} onInput={(e: Event) => { $.name = inputValue(e); rerender() }} />
      </Field>
      <Field label="邮箱" required>
        <Input type="email" placeholder="you@example.com" value={$.email} onInput={(e: Event) => { $.email = inputValue(e); rerender() }} />
      </Field>
      <Field label="密码" required>
        <PasswordInput placeholder="••••••••" value={$.password} onInput={(e: Event) => { $.password = inputValue(e); rerender() }} />
      </Field>
    </AuthPage>
  )
}
