import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, errMsg } from '../components/ui'
import { Alert, Button, Card, Field, Input, PasswordInput } from 'weifuwu/components'

export const Settings: Component = async (_props, ctx) => {
  const $: Record<string, any> = {}
  const rerender = () => ctx.ui.render()
  const token = ctx.auth?.token

    $.name = ctx.auth?.user?.name ?? ''
    $.nameSubmitting = false; $.nameOk = ''; $.nameErr = ''
    $.currentPassword = ''; $.newPassword = ''; $.confirmPassword = ''
    $.pwdSubmitting = false; $.pwdOk = ''; $.pwdErr = ''

  async function updateName(e: Event) {
    e.preventDefault()
    if (!$.name.trim()) { $.nameErr = '姓名不能为空'; rerender(); return }
    $.nameSubmitting = true; $.nameErr = ''; $.nameOk = ''
    rerender()
    try {
      await ctx.api!.put('/api/auth/profile', { name: $.name.trim() })
      ctx.auth?.setUser({ ...ctx.auth?.user, name: $.name.trim() }); $.nameOk = '姓名已更新'
    } catch (e) { $.nameErr = errMsg(e, '保存失败') }
    finally { $.nameSubmitting = false; rerender() }
  }

  async function updatePassword(e: Event) {
    e.preventDefault()
    if (!$.currentPassword || !$.newPassword) { $.pwdErr = '请填写所有密码字段'; rerender(); return }
    if ($.newPassword.length < 6) { $.pwdErr = '新密码至少 6 位'; rerender(); return }
    if ($.newPassword !== $.confirmPassword) { $.pwdErr = '两次密码输入不一致'; rerender(); return }
    $.pwdSubmitting = true; $.pwdErr = ''; $.pwdOk = ''
    rerender()
    try {
      await ctx.api!.put('/api/auth/password', { currentPassword: $.currentPassword, newPassword: $.newPassword })
      $.pwdOk = '密码已更新'
      $.currentPassword = ''; $.newPassword = ''; $.confirmPassword = ''
    } catch (e) { $.pwdErr = errMsg(e, '修改失败') }
    finally { $.pwdSubmitting = false; rerender() }
  }
  return async (props) => (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px">
      <PageHeader title="个人设置" sub="管理你的账号信息" />

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md">基本资料</div>
        <div class="wf-mb-md">{$.nameOk && <Alert variant="success">{$.nameOk}</Alert>}</div>
        <div class="wf-mb-md">{$.nameErr && <Alert variant="error">{$.nameErr}</Alert>}</div>
        <form class="wf-stack wf-gap-md" onSubmit={updateName}>
          <Field label="姓名">
            <Input type="text" value={$.name} onInput={(e: any) => { $.name = e.target.value; rerender() }} />
          </Field>
          <div class="wf-right">
            <Button type="submit" variant="primary" disabled={$.nameSubmitting}>
              {$.nameSubmitting ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-md">修改密码</div>
        <div class="wf-mb-md">{$.pwdOk && <Alert variant="success">{$.pwdOk}</Alert>}</div>
        <div class="wf-mb-md">{$.pwdErr && <Alert variant="error">{$.pwdErr}</Alert>}</div>
        <form class="wf-stack wf-gap-md" onSubmit={updatePassword}>
          <Field label="当前密码">
            <PasswordInput placeholder="••••••••" value={$.currentPassword}
              onInput={(e: any) => { $.currentPassword = e.target.value; rerender() }} />
          </Field>
          <Field label="新密码">
            <PasswordInput placeholder="至少 6 位" value={$.newPassword}
              onInput={(e: any) => { $.newPassword = e.target.value; rerender() }} />
          </Field>
          <Field label="确认新密码">
            <PasswordInput placeholder="再次输入新密码" value={$.confirmPassword}
              onInput={(e: any) => { $.confirmPassword = e.target.value; rerender() }} />
          </Field>
          <div class="wf-right">
            <Button type="submit" variant="primary" disabled={$.pwdSubmitting}>
              {$.pwdSubmitting ? '修改中...' : '修改密码'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
