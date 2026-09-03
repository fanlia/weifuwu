import type { UIContext, Component } from 'weifuwu/vdom'
import { setRefreshToken } from '../lib/api'
import { AuthPage, Avatar, Field, Icon, Input, PasswordInput } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import { authErrorKey } from '../lib/i18n'

interface LoginState {
  email: string; password: string; error: string; loading: boolean
}

export const Login: Component = (_props, ctx) => {
  let ssoEnabled = false
  void fetch('/api/auth/sso/enabled').then(r => r.json()).then((d: any) => { ssoEnabled = !!d.enabled; ctx.render() }).catch(() => {})
  const $ = {} as LoginState
  const rerender = () => ctx.render()
  $.email = ''; $.password = ''; $.error = ''; $.loading = false
  // 稳定回调（mount 层——render 期传同一引用：Field/Input 不重建——受控输入焦点保持）
  const onEmailInput = (e: Event) => { $.email = inputValue(e); rerender() }
  const onPasswordInput = (e: Event) => { $.password = inputValue(e); rerender() }
  // SSR 安全（2026-08——A1 首屏 SSR）：window 惰性防（服务端渲染期无 window）
  const whiteLabel = (typeof window !== 'undefined' ? (window as any).__whiteLabel : null) ?? {}
  const logoVNode = <Avatar name={whiteLabel.logo || 'A'} size="lg" />

  async function handleLogin() {
    if (!$.email || !$.password) { $.error = '请输入邮箱和密码'; rerender(); return }
    $.loading = true
    $.error = ''
    rerender()

    try {
      // 单应用模式（定案）：登录 = 直进 _default（agent-platform 平台唯一业务应用）
      const appRes = await fetch('/api/auth/apps/_default/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $.email, password: $.password }),
      })
      const appData = await appRes.json()
      if (!appRes.ok) {
        // 非成员（未注册）明确提示——引导注册（成员关系即登录资格）
        if (appData.error === 'Not a member of this application') {
          $.error = ctx.i18n?.t('err.not_joined') ?? '账号未加入平台——请先注册'
        } else {
          // i18n 错误映射（BUG-1 回归防线——不显示原始英文/key）
          const k = authErrorKey(appData.error)
          $.error = k ? (ctx.i18n?.t(k) ?? appData.error) : (appData.error || '登录失败')
        }
        $.loading = false
        rerender()
        return
      }

      ctx.auth?.login(appData.token, appData.user, appData.refreshToken)
      // 角色存储（2026-08——前端写操作防线——viewer 禁用写按钮）
      // USERSYSTEM-V2：角色单源=token payload（不再写 localStorage——双源根除）
      void appData.role
      if (appData.refreshToken) setRefreshToken(appData.refreshToken)
      ctx.app?.navigate('/')
    } catch (e) {
      console.error('[login-catch]', e)
      $.error = '网络错误，请检查连接后重试'
      $.loading = false
      rerender()
    }
  }
  return (props) => (
    <AuthPage
      title="登录"
      subtitle={`${whiteLabel.name || 'Agent Platform'} — 多租户 AI 平台`}
      logo={logoVNode}
      submitLabel="登 录"
      loading={$.loading}
      error={$.error || null}
      onSubmit={handleLogin}
      footer={
        <div class="wf-stack wf-gap-sm wf-center">
          <span>还没有账号？<a onClick={() => ctx.app?.navigate('/register')}>立即注册</a></span>
          {ssoEnabled && (
            <a href="/api/auth/sso/login" class="wf-btn wf-btn--secondary wf-btn--sm wf-width-full wf-center">
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
