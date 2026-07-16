/**
 * LoginForm — 登录/注册组件
 *
 * ```ts
 * import { LoginForm } from 'weifuwu/client'
 *
 * function LoginPage(_, ctx) {
 *   if (ctx.isAuthenticated) return ctx.app.navigate('/')
 *   return LoginForm({}, ctx)
 * }
 * ```
 */

import { signal, computed } from '../signal.ts'
import { jsx, Show } from '../jsx-runtime.ts'
import type { WfuiContext } from '../types.ts'

const h = (tag: string, props: any, ...children: any[]) => jsx(tag, props ?? {}, ...children)

export function LoginForm(_props: {}, ctx: WfuiContext) {
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

  return h('div', { class: 'wefu-login' },
    h('div', { class: 'wefu-login-card' },
      h('h2', null, mode.value === 'login' ? '登录' : '注册'),

      h('div', { class: 'wefu-login-tabs' },
        h('button', { class: mode.value === 'login' ? 'active' : '', onClick: () => mode.value = 'login' }, '登录'),
        h('button', { class: mode.value === 'register' ? 'active' : '', onClick: () => mode.value = 'register' }, '注册'),
      ),

      h('form', { onSubmit: (e: any) => { e.preventDefault(); submit() } },
        Show({ when: isRegister, children:
          h('div', { class: 'wefu-field' },
            h('label', null, '昵称'),
            h('input', { value: name, onInput: (e: any) => name.value = e.target.value, placeholder: '你的昵称' }),
          )
        }),

        h('div', { class: 'wefu-field' },
          h('label', null, '邮箱'),
          h('input', { type: 'email', value: email, onInput: (e: any) => email.value = e.target.value, placeholder: '邮箱' }),
        ),

        h('div', { class: 'wefu-field' },
          h('label', null, '密码'),
          h('input', { type: 'password', value: password, onInput: (e: any) => password.value = e.target.value, placeholder: '密码' }),
        ),

        Show({ when: hasError, children:
          h('div', { class: 'wefu-error' }, error)
        }),

        h('button', { type: 'submit', class: 'wefu-btn wefu-btn-primary', disabled: loading },
          loading ? '处理中...' : (mode.value === 'login' ? '登录' : '注册')
        ),
      ),
    ),
  )
}
