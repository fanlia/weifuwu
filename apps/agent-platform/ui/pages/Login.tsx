import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { setRefreshToken } from '../lib/api'
import { AuthPage, Avatar, Field, Icon, Input, PasswordInput } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import { authErrorKey } from '../lib/i18n'

interface LoginState {
  email: string; password: string; error: string; loading: boolean
}

export const Login: Component = async (_props, ctx) => {
  let ssoEnabled = false
  void fetch('/api/auth/sso/enabled').then(r => r.json()).then((d: any) => { ssoEnabled = !!d.enabled; ctx.ui.render() }).catch(() => {})
  const $ = {} as LoginState
  const rerender = () => ctx.ui.render()
  $.email = ''; $.password = ''; $.error = ''; $.loading = false
  // 稳定回调（mount 层——render 期传同一引用：Field/Input 不重建——受控输入焦点保持）
  const onEmailInput = (e: Event) => { $.email = inputValue(e); rerender() }
  const onPasswordInput = (e: Event) => { $.password = inputValue(e); rerender() }
  const logoVNode = <Avatar name={(window as any).__whiteLabel?.logo || 'A'} size="lg" />

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
      if (!res.ok) { const k = authErrorKey(data.error); $.error = k ? (ctx.i18n?.t(k) ?? data.error) : (data.error || '登录失败'); $.loading = false; rerender(); return }

      // 2. 应用内登录（/api/auth/apps/:slug/login）——token 带 appId，业务 API 隔离所需
      //    单应用直接进；多应用取第一个（应用选择器后续迭代）
      const apps = data.apps ?? []
      if (!apps.length) {
        $.error = ctx.i18n?.t('err.app_not_joined') ?? '该账号尚未加入任何应用'
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
      subtitle={`${(window as any).__whiteLabel?.name || 'Agent Platform'} — 多租户 AI 平台`}
      logo={logoVNode}
      submitLabel="登 录"
      loading={$.loading}
      error={$.error || null}
      onSubmit={handleLogin}
      footer={
        <div class="wf-stack wf-gap-sm wf-center">
          <span>还没有账号？<a onClick={() => ctx.app?.navigate('/register')}>立即注册</a></span>
          {ssoEnabled && (
            <a href="/api/auth/sso/login" class="wf-btn wf-btn--secondary wf-btn--sm wf-w-full wf-center">
              <Icon name="shield" size={14} /> 企业 SSO 登录
            </a>
          )}
        </div>
      }
    >
      <Field label="邮箱" required>
        <Input type="email" placeholder="you@example.com" value={$.email}
          onInput={onEmailInput} />
      </Field>
      <Field label="密码" required>
        <PasswordInput placeholder="••••••••" value={$.password}
          onInput={onPasswordInput} />
      </Field>
    </AuthPage>
  )
}
