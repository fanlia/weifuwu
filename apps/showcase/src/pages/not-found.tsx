/**
 * 404——未匹配路由（组件/布局回退）
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { DOMAINS } from '../shell.tsx'

export const NotFound: Component = async (_init: any, _ctx: any) => async (_p: any) => (
  <div class="wf-container wf-center wf-stack wf-gap-sm" style="--wf-max:600px;padding:80px 16px;text-align:center">
    <h1 class="wf-text-4xl wf-m-0">404</h1>
    <p class="wf-text-secondary">页面不存在——试试入口：</p>
    <div class="wf-cluster wf-gap-sm" style="justify-content:center">
      {DOMAINS.map((d) => (
        <a key={d.id} href={d.path} class="wf-btn wf-btn--sm">{d.name}</a>
      ))}
    </div>
  </div>
)
