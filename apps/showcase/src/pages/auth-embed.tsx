/**
 * auth 活体嵌入——showcase /apps/auth 页面（独立 router 隔离模式 + hash 桥接）
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { createAuthApp, pathFromHash } from '../../../../examples/apps/auth/app.tsx'

export const AuthEmbed: Component = async (_init: any, _ctx: any) => {
  let sub: ReturnType<typeof createAuthApp> | null = null
  let removeHash: (() => void) | null = null

  const embedRef = (el: HTMLElement | null) => {
    if (el && !sub) {
      sub = createAuthApp(el, { history: false })
      const onHash = () => sub?.navigate(pathFromHash())
      window.addEventListener('hashchange', onHash)
      removeHash = () => window.removeEventListener('hashchange', onHash)
    } else if (!el && sub) {
      removeHash?.()
      sub.close()
      sub = null
    }
  }

  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-text-xs wf-text-secondary">← 活体运行（登录 → 受保护页 → 登出——内存用户 + 会话）</div>
      <div class="wf-surface wf-border wf-rounded-md wf-p-md" style="min-height:300px" ref={embedRef} />
      <div class="wf-text-xs wf-text-tertiary">
        路由守卫：<code style="font-family:var(--wf-font-mono)">/</code> 受保护（未登录 → 登录）· 源码：
        <a href="/src/examples/apps/auth/app.tsx" target="_blank">app.tsx</a> · <a href="/src/examples/apps/auth/api.ts" target="_blank">api.ts</a>
      </div>
    </div>
  )
}
