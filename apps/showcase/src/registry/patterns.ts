/**
 * 页面模式表——由 scripts/migrate-demo-registry.mjs 迁移生成（uses 提取自源码 import）。
 * 新增模式走 scaffold——禁止手写本文件。
 */
import type { PatternEntry } from './types.ts'

export const patterns: PatternEntry[] = [
  {
    "id": "app-shell",
    "name": "后台应用壳",
    "group": "工作台",
    "desc": "wf-app-shell 可折叠侧栏 + 内容区",
    "file": "patterns/AppShell.tsx",
    "uses": [
      "Button",
      "PageHeader",
      "Table",
      "Badge",
      "Icon",
      "Divider",
      "Pagination",
      "StatCard",
      "Space",
      "Card",
      "Text"
    ]
  },
  {
    "id": "workspace",
    "name": "分栏工作台",
    "group": "工作台",
    "desc": "wf-grid 三栏（文件树 + CodeBlock + Descriptions）",
    "file": "patterns/SplitWorkspace.tsx",
    "uses": [
      "Text",
      "Button",
      "CodeBlock",
      "Descriptions",
      "Divider",
      "Icon",
      "List",
      "Tabs",
      "Space"
    ]
  },
  {
    "id": "focus-task",
    "name": "聚焦任务页",
    "group": "工作台",
    "desc": "wf-center 居中 + Form 表单全家桶",
    "file": "patterns/FocusTask.tsx",
    "uses": [
      "Text",
      "Button",
      "Card",
      "Checkbox",
      "Field",
      "Form",
      "Icon",
      "Input",
      "Space",
      "Alert",
      "Divider"
    ]
  },
  {
    "id": "docs",
    "name": "文档站",
    "group": "内容展示",
    "desc": "Anchor 目录 + prose 正文 + CodeBlock",
    "file": "patterns/Docs.tsx",
    "uses": [
      "Title",
      "Paragraph",
      "Anchor",
      "BackTop",
      "Breadcrumb",
      "Button",
      "CodeBlock",
      "Divider",
      "Icon",
      "Tag",
      "Space"
    ]
  },
  {
    "id": "dashboard",
    "name": "仪表盘",
    "group": "内容展示",
    "desc": "wf-grid 响应式 KPI + 时间范围数据联动",
    "file": "patterns/Dashboard.tsx",
    "uses": [
      "Title",
      "Text",
      "StatCard",
      "PageHeader",
      "ProgressBar",
      "SegmentedControl",
      "Switch",
      "Table",
      "Badge",
      "Card",
      "Divider",
      "Icon",
      "Space"
    ]
  },
  {
    "id": "data-screen",
    "name": "数据大屏",
    "group": "内容展示",
    "desc": "wf-fill 全屏 + wf-layer/wf-absolute 容器内角标 + Sparkline",
    "file": "patterns/DataScreen.tsx",
    "uses": [
      "Text",
      "Badge",
      "Card",
      "Icon",
      "Sparkline",
      "StatCard",
      "Space"
    ]
  },
  {
    "id": "landing",
    "name": "营销落地页",
    "group": "营销推广",
    "desc": "wf-center Hero + wf-grid 特性 + CTA",
    "file": "patterns/Landing.tsx",
    "uses": [
      "Title",
      "Paragraph",
      "Text",
      "Badge",
      "BackTop",
      "Button",
      "Card",
      "Divider",
      "Icon",
      "Link",
      "Space",
      "Avatar"
    ]
  },
  {
    "id": "mobile",
    "name": "移动端 App",
    "group": "营销推广",
    "desc": "wf-safe-top/bottom + SearchInput + List + 底部 Tab",
    "file": "patterns/Mobile.tsx",
    "uses": [
      "Text",
      "Avatar",
      "Badge",
      "Divider",
      "Icon",
      "List",
      "SearchInput",
      "Space"
    ]
  },
  {
    id: 'list-page',
    name: '列表页',
    group: '内容展示',
    desc: '搜索 + 表格 + 分页 + 状态标签——最常用业务列表',
    file: 'patterns/ListPage.tsx',
    uses: ['PageHeader', 'SearchInput', 'Table', 'Tag', 'Pagination', 'Button', 'Icon', 'EmptyState', 'Card'],
  },
  {
    id: 'detail-page',
    name: '详情页',
    group: '内容展示',
    desc: '描述列表 + 时间线 + 操作区——业务对象详情',
    file: 'patterns/DetailPage.tsx',
    uses: ['PageHeader', 'Descriptions', 'Timeline', 'Tag', 'Button', 'Space', 'Card', 'Divider'],
  },
  {
    id: 'settings-page',
    name: '设置页',
    group: '内容展示',
    desc: 'Tabs 分区 + 表单 + 开关——多块设置',
    file: 'patterns/SettingsPage.tsx',
    uses: ['PageHeader', 'Tabs', 'Form', 'Field', 'Input', 'Switch', 'Select', 'Button', 'Alert', 'Space'],
  },
]
