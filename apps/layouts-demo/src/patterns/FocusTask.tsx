import type { Component } from 'weifuwu/client'
import { Button, Form, Field, Input, Checkbox } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 8：聚焦任务页（Focus Task）
//
// 单任务页面：居中卡片承载表单——登录、注册、支付、审批通用。
// 使用 wf-center + wf-fill（视口居中）+ wf-card 承载。
// ─────────────────────────────────────────────────────────────

export const FocusTask: Component = (_init, ctx) => {
  let ok = false
  return (props) => (
    <div class="wf-fill wf-center wf-pad-md" style={{ minHeight: 'calc(100vh - 48px)', background: 'var(--wf-color-bg-subtle)' }}>
      <div class="wf-card wf-pad-lg wf-stack wf-gap-md" style={{ width: 400, maxWidth: '100%', borderRadius: 12 }}>
        {/* 品牌区 */}
        <div class="wf-stack wf-gap-none" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 32 }}>🔐</span>
          <b style={{ fontSize: 20 }}>登录 weifuwu</b>
          <span class="wf-text-secondary" style={{ fontSize: 13 }}>进入你的工作台</span>
        </div>

        <Form
          onSubmit={(v) => {
            if (v.username === 'admin' && v.password === 'admin') {
              ok = true
              ctx.ui.render()
            }
          }}
        >
          <Field label="用户名" required>
            <Input name="username" placeholder="请输入用户名" />
          </Field>
          <Field label="密码" required>
            <Input name="password" type="password" placeholder="请输入密码" />
          </Field>
          <div class="wf-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Checkbox label="记住我" />
            <span class="wf-text-primary" style={{ fontSize: 13, cursor: 'pointer' }}>忘记密码？</span>
          </div>
          <Button type="submit" variant="primary" block size="lg">
            登 录
          </Button>
        </Form>

        {ok && (
          <div class="wf-pad-sm" style={{ background: 'var(--wf-color-success-bg)', color: 'var(--wf-color-success-text)', borderRadius: 8, fontSize: 13, textAlign: 'center' }}>
            ✅ 登录成功（demo：admin / admin）
          </div>
        )}

        <div class="wf-text-secondary wf-center" style={{ fontSize: 13 }}>
          没有账号？<span class="wf-text-primary" style={{ cursor: 'pointer' }}>立即注册</span>
        </div>
      </div>
    </div>
  )
}

// register({ id: 'focus-task', name: '聚焦任务页', desc: '视口居中卡片（登录/表单/支付）', comp: FocusTask })
