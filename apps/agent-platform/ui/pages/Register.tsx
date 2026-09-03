import type { UIContext, Component } from 'weifuwu/vdom'
import { AuthPage, Avatar, Field, Input, PasswordInput } from 'weifuwu/components'
import { inputValue } from '../lib/types'
import { authErrorKey } from '../lib/i18n'
import { track } from '../lib/track'

interface RegisterState {
  email: string; name: string; password: string; error: string; loading: boolean
}

/** 邀请模式：URL query ?app=slug&invite=token（Settings 生成的邀请链接） */
function inviteParams(): { app: string; invite: string } | null {
  // SSR 安全（A1 纪律——服务端无 location——非邀请态首帧；客户端水合后重渲染取真值）
  if (typeof location === 'undefined') return null
  const q = new URLSearchParams(location.search)
  const app = q.get('app') ?? ''
  const invite = q.get('invite') ?? ''
  return app && invite ? { app, invite } : null
}

export const Register: Component = (_props, ctx) => {
  const $ = {} as RegisterState
  const rerender = () => ctx.render()
  $.email = ''; $.name = ''; $.password = ''; $.error = ''; $.loading = false
  const invite = inviteParams()
  // 稳定回调（mount 层——受控输入焦点保持 + AuthPage 不重建）
  const onNameInput = (e: Event) => { $.name = inputValue(e); rerender() }
  const onEmailInput = (e: Event) => { $.email = inputValue(e); rerender() }
  const onPasswordInput = (e: Event) => { $.password = inputValue(e); rerender() }

  async function handleRegister() {
    if (!$.email || !$.name || !$.password) { $.error = '请填写所有字段'; rerender(); return }
    $.loading = true; $.error = ''
    rerender()
    try {
      // 单应用模式（定案）：注册 = 加入 _default（平台唯一业务应用——开放注册直入）
      //   邀请面保留（apps/:slug/register + inviteToken——super admin 定向邀请）
      const url = invite ? `/api/auth/apps/${invite.app}/auth/register` : '/api/auth/apps/_default/auth/register'
      const body = invite
        ? { inviteToken: invite.invite, email: $.email, name: $.name, password: $.password }
        : { email: $.email, name: $.name, password: $.password }
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { const k = authErrorKey(data.error); $.error = k ? (ctx.i18n?.t(k) ?? data.error) : (data.error || '注册失败'); $.loading = false; rerender(); return }
      ctx.auth?.login(data.token, data.user, data.refreshToken)
      track(invite ? 'invite_join_complete' : 'register_complete')
      $.loading = false
      ctx.app?.navigate('/')
      rerender()
    } catch { $.error = '网络错误'; $.loading = false; rerender() }
  }
  return (props) => (
    <AuthPage
      title={invite ? '加入团队' : '创建账号'}
      subtitle={invite ? '你已被邀请加入团队——注册后即可与 AI 同事协作' : '注册 Agent Platform，开始构建 AI 团队'}
      logo={<Avatar name="A" size="lg" />}
      submitLabel={invite ? '加入团队' : '注 册'}
      loading={$.loading}
      error={$.error || null}
      onSubmit={handleRegister}
      footer={<span>已有账号？<a onClick={() => ctx.app?.navigate('/login')}>立即登录</a></span>}
    >
      <Field label="姓名" required>
        <Input placeholder="你的名字" value={$.name} onInput={onNameInput} />
      </Field>
      <Field label="邮箱" required>
        <Input type="email" placeholder="you@example.com" value={$.email} onInput={onEmailInput} />
      </Field>
      <Field label="密码" required>
        <PasswordInput placeholder="至少 8 位" value={$.password} onInput={onPasswordInput} />
      </Field>
    </AuthPage>
  )
}
