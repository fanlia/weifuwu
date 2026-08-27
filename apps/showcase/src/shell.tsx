/**
 * showcase 全站壳——六域导航 + 主题 + 搜索（layout 包裹复用，跨路由状态保持）
 *
 * 自举：ThemeSwitch（主题能力）、wf-* 原语（布局）、Icon 组件（图标纪律）。
 * **SSR 同源纪律（2026-08）**：服务端 uiSsr 渲染本组件（无 location 全局）——
 * current() 回退 props.active（路由 handler 从请求 URL 推导——与浏览器同值）。
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { ThemeSwitch, Icon } from 'weifuwu/components'

export const DOMAINS = [
  { id: 'components', name: '组件', path: '/components' },
  { id: 'layout', name: '布局原语', path: '/layout' },
  { id: 'patterns', name: '页面模式', path: '/patterns' },
  { id: 'apps', name: '应用模板', path: '/apps' },
  { id: 'backend', name: '后端能力', path: '/backend' },
  { id: 'capabilities', name: '框架能力', path: '/capabilities' },
  { id: 'guides', name: '指南', path: '/guides' },
] as const

/** 壳（layout 包裹——跨路由复用：工厂不重跑，状态保持） */
export const Shell: Component<any, any> = async (_init: any, ctx: any) => {
  return async (props: { page: any; active?: string }) => {
    const current = () => (typeof location !== 'undefined' ? location.pathname : (props.active ?? ''))
    return (
      <div class="wf-stack wf-gap-none" style="min-height:100vh">
        {/* 吸顶导航 */}
        <div class="wf-sticky wf-row wf-gap-sm wf-p-sm wf-bg-primary wf-border-b" style="--wf-offset:0;z-index:var(--wf-pop-z)">
          <a href="/" class="wf-row wf-gap-xs wf-text-nowrap" style="text-decoration:none;color:inherit">
            <Icon name="layout" size={16} className="wf-text-primary" />
            <b class="wf-text-bold">wf/showcase</b>
          </a>
          <nav class="wf-row wf-nowrap wf-scroll wf-gap-xs wf-fill" aria-label="平台域导航">
            {DOMAINS.map((d) => (
              <a
                key={d.id}
                href={d.path}
                class={`wf-nav-item wf-text-nowrap wf-text-sm${current().startsWith(d.path) ? ' wf-nav-item--active' : ''}`}
              >
                {d.name}
              </a>
            ))}
          </nav>
          <div class="wf-row wf-gap-sm">
            <span class="wf-text-xs wf-text-tertiary wf-hidden wf-flex@lg" style="font-family:var(--wf-font-mono)">LLM: /llms.txt · /content/:id.md</span>
            <ThemeSwitch />
          </div>
        </div>
        {/* 页面主体 */}
        <main class="wf-fill">{props.page}</main>
        <footer class="wf-text-center wf-py-lg wf-text-tertiary wf-text-sm wf-border-t">
          weifuwu showcase · 发展引擎——组件/页面/应用/后端/能力/指南 一站式（content/ 随 npm 包发布）
        </footer>
      </div>
    )
  }
}
