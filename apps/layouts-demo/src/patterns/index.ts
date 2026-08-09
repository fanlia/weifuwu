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

export interface LayoutPattern {
  id: string
  name: string
  desc: string
  comp: Component
}

export const PATTERNS: LayoutPattern[] = [
  { id: 'app-shell', name: '后台应用壳', desc: '侧栏导航 + 顶栏 + 内容区（后台管理标准）', comp: AppShell },
  { id: 'docs', name: '文档站', desc: '顶部导航 + 左侧目录锚点 + prose 正文', comp: Docs },
  { id: 'dashboard', name: '仪表盘', desc: '响应式 KPI 网格 + 数据表（wf-grid 自适应）', comp: Dashboard },
  { id: 'workspace', name: '分栏工作台', desc: '左中右三栏（文件树 + 编辑器 + 属性）', comp: SplitWorkspace },
  { id: 'landing', name: '营销落地页', desc: 'Hero + 特性网格 + CTA + Footer', comp: Landing },
  { id: 'mobile', name: '移动端 App', desc: '安全区避让 + 顶部导航 + 底部 Tab', comp: Mobile },
  { id: 'data-screen', name: '数据大屏', desc: '全屏网格 + 固定角标 + 实时曲线', comp: DataScreen },
  { id: 'focus-task', name: '聚焦任务页', desc: '视口居中卡片（登录/表单/支付）', comp: FocusTask },
]

export const getPattern = (id: string) => PATTERNS.find((p) => p.id === id) ?? PATTERNS[0]
