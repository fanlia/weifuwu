/**
 * todo 活体嵌入——showcase /apps/todo 页面
 *
 * P0 补丁的用武之地：页面内嵌独立 router（history: false——不碰宿主 URL/popstate）。
 * §5.1 ref 纪律：ref 定义在 mount 作用域（卸载时 close 子路由 + 注销 hashchange）。
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { createTodoApp, pathFromHash } from '../../../../examples/apps/todo/app.tsx'

export const TodoEmbed: Component = async (_init: any, _ctx: any) => {
  let sub: ReturnType<typeof createTodoApp> | null = null
  let removeHash: (() => void) | null = null

  const embedRef = (el: HTMLElement | null) => {
    if (el && !sub) {
      // 挂载：独立 router 实例（隔离模式——不污染宿主）
      sub = createTodoApp(el, { history: false })
      const onHash = () => sub?.navigate(pathFromHash())
      window.addEventListener('hashchange', onHash)
      removeHash = () => window.removeEventListener('hashchange', onHash)
    } else if (!el && sub) {
      // 卸载：清理（子路由 close + hashchange 注销）
      removeHash?.()
      sub.unmount()
      sub = null
    }
  }

  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-text-xs wf-text-secondary">← 活体运行（页面内嵌独立 router——history:false 隔离模式）</div>
      <div class="wf-surface wf-surface--flat wf-border wf-rounded-md wf-p-md" style="min-height:280px" ref={embedRef} />
      <div class="wf-text-xs wf-text-tertiary">
        路由表：<code style="font-family:var(--wf-font-mono)">/</code> 列表 · <code style="font-family:var(--wf-font-mono)">/new</code> 新建
        —— hash 桥接（location.hash）· 源码：<a href="/src/examples/apps/todo/app.tsx" target="_blank">app.tsx</a> · <a href="/src/examples/apps/todo/server.ts" target="_blank">server.ts</a>
      </div>
    </div>
  )
}
