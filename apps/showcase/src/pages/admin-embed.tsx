/**
 * admin 活体嵌入——showcase /apps/admin 页面
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { createAdminApp, pathFromHash } from '../../../../examples/apps/admin/app.tsx'

export const AdminEmbed: Component = async (_init: any, _ctx: any) => {
  let sub: ReturnType<typeof createAdminApp> | null = null
  let removeHash: (() => void) | null = null

  const embedRef = (el: HTMLElement | null) => {
    if (el && !sub) {
      sub = createAdminApp(el, { history: false })
      const onHash = () => sub?.navigate(pathFromHash())
      window.addEventListener('hashchange', onHash)
      removeHash = () => window.removeEventListener('hashchange', onHash)
    } else if (!el && sub) {
      removeHash?.()
      sub.unmount()
      sub = null
    }
  }

  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-text-xs wf-text-secondary">← 活体运行（AppShell 多页 + Table/StatCard——数据来自 MemorySql）</div>
      <div class="wf-surface wf-surface--flat wf-border wf-rounded-md wf-p-md" style="min-height:380px" ref={embedRef} />
      <div class="wf-text-xs wf-text-tertiary">
        源码：<a href="/src/examples/apps/admin/app.tsx" target="_blank">app.tsx</a> · <a href="/src/examples/apps/admin/api.ts" target="_blank">api.ts</a>
      </div>
    </div>
  )
}
