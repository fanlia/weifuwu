/**
 * multi 活体嵌入——showcase /apps/multi 页面
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { createMultiApp, pathFromHash } from '../../../../examples/apps/multi/app.tsx'

export const MultiEmbed: Component = async (_init: any, _ctx: any) => {
  let sub: ReturnType<typeof createMultiApp> | null = null
  let removeHash: (() => void) | null = null

  const embedRef = (el: HTMLElement | null) => {
    if (el && !sub) {
      sub = createMultiApp(el, { history: false })
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
      <div class="wf-text-xs wf-text-secondary">← 活体运行（父应用嵌子应用——计数器 + 迷你任务独立状态）</div>
      <div class="wf-surface wf-border wf-rounded-md wf-p-md" style="min-height:300px" ref={embedRef} />
      <div class="wf-text-xs wf-text-tertiary">
        源码：<a href="/src/examples/apps/multi/app.tsx" target="_blank">app.tsx</a>（registerApp + &lt;App appId /&gt;）
      </div>
    </div>
  )
}
