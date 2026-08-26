/**
 * patterns 活体预览——pattern 详情页渲染真实组件（复制即用的活体示范）
 * 静态 import 映射（ctx.ui.js 编译不支持动态 import 变量）
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { AppShell } from '../../../../examples/patterns/AppShell.tsx'
import { SplitWorkspace } from '../../../../examples/patterns/SplitWorkspace.tsx'
import { FocusTask } from '../../../../examples/patterns/FocusTask.tsx'
import { Docs } from '../../../../examples/patterns/Docs.tsx'
import { Dashboard } from '../../../../examples/patterns/Dashboard.tsx'
import { DataScreen } from '../../../../examples/patterns/DataScreen.tsx'
import { Landing } from '../../../../examples/patterns/Landing.tsx'
import { Mobile } from '../../../../examples/patterns/Mobile.tsx'
import { ListPage } from '../../../../examples/patterns/ListPage.tsx'
import { DetailPage } from '../../../../examples/patterns/DetailPage.tsx'
import { SettingsPage } from '../../../../examples/patterns/SettingsPage.tsx'

const PATTERN_COMPONENTS: Record<string, Component> = {
  'app-shell': AppShell,
  workspace: SplitWorkspace,
  'focus-task': FocusTask,
  docs: Docs,
  dashboard: Dashboard,
  'data-screen': DataScreen,
  landing: Landing,
  mobile: Mobile,
  'list-page': ListPage,
  'detail-page': DetailPage,
  'settings-page': SettingsPage,
}

/** 活体预览（pattern 详情页嵌入）——**demo 选择必须在 renderFn**（真实 bug：
 *  SPA 导航 app-shell → 列表 → workspace 时 PatternLive 复用（同位置同类型
 *  复用 _render——工厂不重跑）——工厂闭包捕获 initProps.id 固定——
 *  两个 pattern 的 demo 一样（AppShell 残留）——renderFn 读最新 props.id */
export const PatternLive: Component = async (initProps: any, _ctx: any) => {
  return async (props: any) => {
    const id = props.id ?? (initProps as any).id
    const Comp = PATTERN_COMPONENTS[id]
    if (!Comp) return null
    return (
      <div class="wf-stack wf-gap-sm">
        <div class="wf-text-xs wf-text-secondary">← 活体预览（此页面的完整源码 = 复制即用的蓝本）</div>
        <div class="wf-surface wf-surface--flat wf-border wf-rounded-md" style="padding:2px">
          <Comp />
        </div>
      </div>
    )
  }
}
