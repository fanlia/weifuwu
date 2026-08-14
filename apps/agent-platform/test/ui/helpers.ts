/**
 * agent-platform UI 测试基建（UI-REFACTOR-PLAN M1）
 *
 * makeAppCtx = 框架 createTestCtx + 应用层 mock：
 * - api：路由表 mock（method + pattern → handler）——未命中抛 404 风格错误
 * - auth/route/app/ws/toast/confirm：最小可用 mock
 * - browser：createClientBrowser（jsdom 环境）
 */

import { createClientBrowser } from '../../../../src/ui-dom/browser.ts'
import { createVdomContext, mountRoot } from '../../../../src/ui-dom/context.ts'
import type { VNode } from '../../../../src/ui-dom/vnode.ts'

export interface ApiRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** 字符串 = 前缀匹配；RegExp = test 匹配 */
  pattern: string | RegExp
  handler: (url: string, body?: any) => unknown
}

export interface AppCtxOpts {
  routes?: ApiRoute[]
  params?: Record<string, string>
  query?: Record<string, string>
  user?: { id: string; name: string; role?: string }
  role?: string
}

export function makeAppCtx(opts: AppCtxOpts = {}): any {
  const ctx: any = { ui: { render: () => {}, ready: true, useExternal: () => undefined } }
  const role = opts.role ?? 'owner'
  const user = opts.user ?? { id: 'u-test', name: '测试用户', role }

  const match = (method: string, url: string, body?: any) => {
    const clean = url.split('?')[0]
    const r = (opts.routes ?? []).find((rt) =>
      rt.method === method &&
      (typeof rt.pattern === 'string' ? clean.startsWith(rt.pattern) : rt.pattern.test(clean)),
    )
    if (!r) throw new Error(JSON.stringify({ error: `Not Found: ${method} ${clean}` }))
    return r.handler(url, body)
  }

  ctx.api = {
    get: async (url: string) => match('GET', url),
    post: async (url: string, body?: any) => match('POST', url, body),
    put: async (url: string, body?: any) => match('PUT', url, body),
    delete: async (url: string) => match('DELETE', url),
  }
  ctx.auth = {
    user,
    role,
    appId: 'app-test',
    requireAuth: () => {},
    login: () => {},
    refresh: async () => false,
  }
  ctx.route = { params: opts.params ?? {}, query: opts.query ?? {}, navigate: () => {} }
  ctx.app = { navigate: () => {} }
  ctx.toast = () => {}
  ctx.confirm = async () => true
  ctx.ws = { send: () => {} }
  ctx.browser = createClientBrowser()
  return ctx
}

/** 常用 mock 数据：AI Agent（小码风格） */
export const MOCK_AI_AGENT = {
  id: 'agent-1',
  app_id: 'app-test',
  type: 'ai',
  name: '测试 Agent',
  description: '测试描述',
  system_prompt: '你是测试助手',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  max_tokens: 2048,
  monthly_token_quota: 0,
  quota_used: 0,
  human_in_the_loop: false,
  allow_file_tools: true,
  allow_command_exec: false,
  allow_network: false,
  webhook_url: null,
  webhook_secret: null,
  webhook_retry_count: 3,
  kb_id: null,
  is_active: true,
}

/** 真实中间件链路挂载页面（UIRouter + uiServe——与生产同路径：
 *  中间件注入 ctx.api/auth/route——框架保证组件可达（createVdomContext 手动
 *  assign 字段在组件 ctx 原型链不可达——实测） */
export async function mountPage(path: string, view: () => VNode, opts: AppCtxOpts = {}, routePattern?: string) {
  const { UIRouter, uiServe } = await import('../../../../src/ui-dom/index.ts')
  const browser = createClientBrowser()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = makeAppCtx(opts)
  const router = new UIRouter()
  router.use((ctx: any) => {
    Object.assign(ctx, {
      api: app.api, auth: app.auth,
      app: app.app, toast: app.toast, confirm: app.confirm, ws: app.ws,
    })
    return ctx
  })
  router.get(routePattern ?? path, view)
  // uiServe 按 location.pathname 匹配路由——jsdom 先 pushState 到目标路径
  ;(globalThis as any).history?.pushState?.(null, '', path)
  const handle = uiServe(router, { root: container })
  await (handle as any).ready
  await new Promise((r) => setTimeout(r, 80)) // 异步数据落渲染
  return { container, handle }
}
