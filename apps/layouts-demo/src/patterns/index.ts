import type { Component } from 'weifuwu/client'
import { AppShell } from './AppShell'
import { Docs } from './Docs'
import { Dashboard } from './Dashboard'
import { SplitWorkspace } from './SplitWorkspace'
import { Landing } from './Landing'
import { Mobile } from './Mobile'
import { DataScreen } from './DataScreen'
import { FocusTask } from './FocusTask'

// ─────────────────────────────────────────────────────────────
// 布局模式注册表——每个模式 = 一个独立可复制文件（patterns/ 下）
// 壳（main.tsx）按 hash 路由切换渲染。
// 注意：用值引用（import 组件）而非 bare import——package.json
// sideEffects:false 会 tree-shake 掉纯 side-effect 注册。
// ─────────────────────────────────────────────────────────────

export type PatternGroup = '工作台' | '内容展示' | '营销推广'

export interface LayoutPattern {
  id: string
  name: string
  desc: string
  comp: Component
  /** 源码文件名（无 .tsx）——id 驼峰 ≠ 文件名时显式声明（workspace → SplitWorkspace） */
  file: string
  group: PatternGroup
}

export const PATTERNS: LayoutPattern[] = [
  { id: 'app-shell', name: '后台应用壳', desc: 'wf-app-shell 可折叠侧栏 + 内容区', comp: AppShell, file: 'AppShell', group: '工作台' },
  { id: 'workspace', name: '分栏工作台', desc: 'wf-grid 三栏（文件树 + CodeBlock + Descriptions）', comp: SplitWorkspace, file: 'SplitWorkspace', group: '工作台' },
  { id: 'focus-task', name: '聚焦任务页', desc: 'wf-center 居中 + Form 表单全家桶', comp: FocusTask, file: 'FocusTask', group: '工作台' },
  { id: 'docs', name: '文档站', desc: 'Anchor 目录 + prose 正文 + CodeBlock', comp: Docs, file: 'Docs', group: '内容展示' },
  { id: 'dashboard', name: '仪表盘', desc: 'wf-grid 响应式 KPI + 时间范围数据联动', comp: Dashboard, file: 'Dashboard', group: '内容展示' },
  { id: 'data-screen', name: '数据大屏', desc: 'wf-fill 全屏 + wf-pin 角标 + Sparkline', comp: DataScreen, file: 'DataScreen', group: '内容展示' },
  { id: 'landing', name: '营销落地页', desc: 'wf-center Hero + wf-grid 特性 + CTA', comp: Landing, file: 'Landing', group: '营销推广' },
  { id: 'mobile', name: '移动端 App', desc: 'wf-safe-top/bottom + SearchInput + List + 底部 Tab', comp: Mobile, file: 'Mobile', group: '营销推广' },
]

export const GROUPS: PatternGroup[] = ['工作台', '内容展示', '营销推广']

export const getPattern = (id: string) => PATTERNS.find((p) => p.id === id) ?? PATTERNS[0]
