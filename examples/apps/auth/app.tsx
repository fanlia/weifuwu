/**
 * auth 应用模板——登录/注册 → 受保护页 → 登出（完整全栈，复制即用）
 *
 * 演示能力：
 *   - 应用级状态（createStore user）+ 路由守卫（未登录 → 登录页）
 *   - 表单校验 + 提交 loading + 错误条（AuthPage 组件）
 *   - 后端：内存用户表 + 会话（api.ts 注册函数——独立/嵌入共享）
 *   - 会话持久化：ctx.browser.storage（浏览器纪律）
 */
import { UIRouter, uiServe, h, createStore, createClientBrowser } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { AuthPage, Input, Button, Alert, PageHeader, Avatar, Space } from 'weifuwu/components'

export interface User { id: string; email: string; name: string }

export const authStore = createStore<{ user: User | null; error: string | null }>({ user: null, error: null })

async function api(browser: any, path: string, body: Record<string, string>): Promise<{ ok: boolean; user?: User; error?: string }> {
  const token = browser.storageGet('auth:token')
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  return res.json()
}

/** 登录/注册页（AuthPage 组件——同一骨架两用） */
const AuthFormPage = (mode: 'login' | 'register'): Component =>
  async (_init: any, ctx: any) => {
    const browser = ctx.browser
    let email = ''
    let password = ''
    let name = ''
    let error = ''
    let loading = false
    const submit = async () => {
      error = ''
      if (!email.includes('@')) { error = '请输入有效邮箱'; ctx.render(); return }
      if (password.length < 6) { error = '密码至少 6 位'; ctx.render(); return }
      loading = true; ctx.render()
      const res = await api(browser, `/api/auth/${mode}`, { email, password, name })
      loading = false
      if (res.ok && res.user) {
        authStore.update((s) => { s.user = res.user!; s.error = null })
        browser.storageSet('auth:token', (res as any).token ?? '')
        location.hash = '#/'
      } else {
        error = res.error ?? '请求失败'
      }
      ctx.render()
    }
    return async (_p: any) => (
      <AuthPage
        title={mode === 'login' ? '登录' : '注册'}
        subtitle="auth 应用模板——内存用户 + 会话（演示）"
        logo={<Avatar name="wf" />}
        submitLabel={mode === 'login' ? '登录' : '注册'}
        loading={loading}
        error={error || null}
        onSubmit={() => void submit()}
        footer={<a href={mode === 'login' ? '#/register' : '#/login'} class="wf-link" style="cursor:pointer">{mode === 'login' ? '没有账号？注册' : '已有账号？登录'}</a>}
      >
        {mode === 'register' && (
          <Input label="昵称" value={name} onInput={(e: any) => { name = (e.target as HTMLInputElement).value; ctx.render() }} placeholder="如何称呼你" />
        )}
        <Input label="邮箱" type="email" value={email} onInput={(e: any) => { email = (e.target as HTMLInputElement).value; ctx.render() }} placeholder="name@example.com" required />
        <Input label="密码" type="password" value={password} onInput={(e: any) => { password = (e.target as HTMLInputElement).value; ctx.render() }} placeholder="至少 6 位" />
      </AuthPage>
    )
  }

export const LoginPage = AuthFormPage('login')
export const RegisterPage = AuthFormPage('register')

/** 受保护页（未登录 → 登录页——路由守卫） */
export const DashboardPage: Component = async (_init: any, ctx: any) => {
  const browser = ctx.browser
  // 会话恢复（mount——ctx.browser.storage 安全适配）
  void (async () => {
    try {
      const token = browser.storageGet('auth:token')
      if (!token) return
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const { user } = await res.json()
        authStore.update((s) => { s.user = user })
      }
    } catch { /* 无会话 */ }
  })()
  const state = ctx.ui.useExternal(authStore)
  const logout = () => {
    browser.storageRemove('auth:token')
    authStore.update((s) => { s.user = null })
    location.hash = '#/login'
  }
  return async (_p: any) => {
    if (!state.state.user) return h(LoginPage, {})
    const u = state.state.user
    return (
      <div class="wf-stack wf-gap-md" style="max-width:560px">
        <PageHeader
          title={`欢迎，${u.name ?? u.email}`}
          sub="登录态由 createStore 持有——路由守卫读它决定渲染"
        >
          <Button variant="ghost" onClick={logout}>登出</Button>
        </PageHeader>
        <div class="wf-surface wf-border wf-rounded-md wf-p-md wf-stack wf-gap-sm">
          <Space align="center" size="md"><Avatar name={u.name ?? u.email} size="lg" /><b>{u.email}</b></Space>
          <Alert variant="success">✓ 已登录——受保护内容可见。刷新页面会话自动恢复（ctx.browser.storage）</Alert>
        </div>
      </div>
    )
  }
}

/** 路由守卫：包装页面——未登录跳登录（守卫逻辑在页面组件内读 store） */
export const guard = (page: Component): Component => page

// ── 路由表 ──
export const authRoutes = [
  { path: '/', render: () => h(DashboardPage, {}) },
  { path: '/login', render: () => h(LoginPage, {}) },
  { path: '/register', render: () => h(RegisterPage, {}) },
]

export const pathFromHash = (): string => location.hash.replace(/^#/, '') || '/'

export function createAuthApp(root: HTMLElement, _options?: { history?: boolean }): ReturnType<typeof uiServe> {
  // vdom 规范面：UIRouter + uiServe——布局共享精准路由
  const router = new UIRouter()
  for (const r of authRoutes) {
    router.get(r.path, (req: Request, ctx: any) =>
      (ctx as { stream: (v: unknown) => Response }).stream(r.render()))
  }
  return uiServe(router, { root, browser: createClientBrowser()! })
}
