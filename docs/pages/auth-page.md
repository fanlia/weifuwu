# 认证页模板

**使用场景**：登录、注册、忘记密码

**使用的组件**：Card / Form / Input / Button / Alert / Checkbox

## 模板代码

```tsx
import { Card, Form, Input, Button, Alert, Checkbox } from 'weifuwu/components'
import type { WfuiContext } from 'weifuwu/client'

export function Login(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  if (!ctx.ui.ready) {
    $.email = ''; $.password = ''; $.remember = false; $.error = ''; $.loading = false
  }

  async function handleSubmit() {
    if (!$.email || !$.password) { $.error = '请填写所有字段'; return }
    $.loading = true; $.error = ''
    try {
      // ★ 改这里：登录 API
      const res = await ctx.api.post('/api/auth/login', {
        email: $.email, password: $.password,
      })
      ctx.auth?.login(res.token, res.user)
      ctx.app?.navigate('/')
    } catch (e: any) { $.error = e.message }
    finally { $.loading = false }
  }

  return (
    <div class="wf-center" style="height:100vh">
      <Card style="width:380px;padding:32px">
        <div class="wf-stack" style="text-align:center;margin-bottom:24px">
          <h2>登录</h2>
          <p style="color:var(--wf-color-text-secondary);font-size:13px">欢迎回来</p>
        </div>

        <Alert if={$.error} variant="error">{$.error}</Alert>

        <Form onSubmit={handleSubmit}>
          <Input label="邮箱" type="email" required
            placeholder="name@example.com"
            value={$.email}
            onInput={e => $.email = e.target.value} />

          <Input label="密码" type="password" required
            placeholder="••••••••"
            value={$.password}
            onInput={e => $.password = e.target.value} />

          <Checkbox label="记住我" checked={$.remember} onChange={v => $.remember = v} />

          <Button type="submit" variant="primary" block loading={$.loading}>
            登录
          </Button>
        </Form>

        <p style="text-align:center;margin-top:16px;font-size:13px">
          还没有账号？<a onClick={() => ctx.app?.navigate('/register')}>注册</a>
        </p>
      </Card>
    </div>
  )
}
```

## 可修改的部分

| 位置 | 说明 |
|------|------|
| 登录 API | `POST /api/auth/login` |
| 页面标题 | "登录" 替换 |
| 描述文字 | "欢迎回来" |
| 注册链接 | `/register` |
| 额外字段 | 添加 Input 等 |
