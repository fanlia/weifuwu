/**
 * LoginForm — 登录/注册组件
 *
 * 使用纯 JSX 编写，展示 weifuwu/client 组件最佳实践。
 *
 * ```tsx
 * import { LoginForm } from 'weifuwu/client'
 *
 * function LoginPage(_, ctx) {
 *   if (ctx.isAuthenticated) return ctx.app.navigate('/')
 *   return <LoginForm />
 * }
 * ```
 */

import { signal, computed } from '../signal.ts'
import { Show } from '../jsx-runtime.ts'
import type { Component } from '../jsx-runtime.ts'
import type { WfuiContext } from '../types.ts'

export const LoginForm: Component<{}> = (_props, ctx: WfuiContext) => {
  const mode = signal<'login' | 'register'>('login')
  const email = signal('')
  const name = signal('')
  const password = signal('')
  const error = signal<string | null>(null)
  const loading = signal(false)
  const isRegister = computed(() => mode.value === 'register')
  const hasError = computed(() => error.value != null)

  const submit = async () => {
    error.value = null
    loading.value = true
    try {
      if (mode.value === 'login') {
        await ctx.login(email.value, password.value)
      } else {
        await ctx.register({ email: email.value, name: name.value, password: password.value })
      }
    } catch (e: any) {
      error.value = e.message ?? '操作失败'
    } finally {
      loading.value = false
    }
  }

  return (
    <div class="wefu-login">
      <div class="wefu-login-card">
        <h2>{mode.value === 'login' ? '登录' : '注册'}</h2>

        <div class="wefu-login-tabs">
          <button class={mode.value === 'login' ? 'active' : ''} onClick={() => mode.value = 'login'}>登录</button>
          <button class={mode.value === 'register' ? 'active' : ''} onClick={() => mode.value = 'register'}>注册</button>
        </div>

        <form onSubmit={(e: any) => { e.preventDefault(); submit() }}>
          <Show when={isRegister}>
            <div class="wefu-field">
              <label>昵称</label>
              <input value={name} onInput={(e: any) => name.value = e.target.value} placeholder="你的昵称" />
            </div>
          </Show>

          <div class="wefu-field">
            <label>邮箱</label>
            <input type="email" value={email} onInput={(e: any) => email.value = e.target.value} placeholder="邮箱" />
          </div>

          <div class="wefu-field">
            <label>密码</label>
            <input type="password" value={password} onInput={(e: any) => password.value = e.target.value} placeholder="密码" />
          </div>

          <Show when={hasError}>
            <div class="wefu-error">{error}</div>
          </Show>

          <button type="submit" class="wefu-btn wefu-btn-primary" disabled={loading}>
            {loading ? '处理中...' : (mode.value === 'login' ? '登录' : '注册')}
          </button>
        </form>
      </div>
    </div>
  )
}


