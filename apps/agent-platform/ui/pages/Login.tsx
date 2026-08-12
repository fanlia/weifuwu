import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { setRefreshToken } from '../lib/api'
import { AuthPage, Avatar, Field, Input, PasswordInput } from 'weifuwu/components'
import { inputValue } from '../lib/types'

interface LoginState {
  email: string; password: string; error: string; loading: boolean
}

export const Login: Component = async (_props, ctx) => {
  const $ = {} as LoginState
  const rerender = () => ctx.ui.render()
  $.email = ''; $.password = ''; $.error = ''; $.loading = false

  async function handleLogin() {
    if (!$.email || !$.password) { $.error = '请输入邮箱和密码'; rerender(); return }
    $.loading = true
    $.error = ''
    rerender()

    try {
      // 1. 平台登录（/api/auth/login）——返回 { token, user, apps } 我的应用列表
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $.email, password: $.password }),
      })
      const data = await res.json()
      if (!res.ok) { $.error = data.error || '登录失败'; $.loading = false; rerender(); return }

      // 2. 应用内登录（/api/auth/apps/:slug/login）——token 带 appId，业务 API 隔离所需
      //    单应用直接进；多应用取第一个（应用选择器后续迭代）
      const apps = data.apps ?? []
      if (!apps.length) {
        $.error = '该账号尚未加入任何应用'
        $.loading = false
        rerender()
        return
      }
      const app = apps[0]
      const appRes = await fetch(`/api/auth/apps/${app.slug}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $.email, password: $.password }),
      })
      const appData = await appRes.json()
      if (!appRes.ok) { $.error = appData.error || '应用登录失败'; $.loading = false; rerender(); return }

      ctx.auth?.login(appData.token, appData.user, appData.refreshToken)
      if (appData.refreshToken) setRefreshToken(appData.refreshToken)
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
          onInput={(e: Event) => { $.email = inputValue(e); rerender() }} />
      </Field>
      <Field label="密码" required>
        <PasswordInput placeholder="••••••••" value={$.password}
          onInput={(e: Event) => { $.password = inputValue(e); rerender() }} />
      </Field>
    </AuthPage>
  )
}
