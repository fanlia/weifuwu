/**
 * 平台导航数据（AppLayout → lib/nav 迁移——应用层导航定义单源）
 *
 * 形态：path/label/icon（IconName——weifuwu Icon 组件）/group。
 * 路径匹配由库 AppShell activeOf 承接（'/' 精确 + 前缀）——match 函数
 * 已不必要（'/dashboard' 归一路由归一在 app-chrome）。
 */
export interface NavDef {
  path: string
  icon: string
  label: string
  group?: string
}

export const NAV: NavDef[] = [
  { path: '/', icon: 'grid', label: '工作台', group: '工作台' },
  { path: '/chat/new', icon: 'message', label: '聊天', group: '工作台' },
  { path: '/approvals', icon: 'check-circle', label: '审批待办', group: '工作台' },
  { path: '/deliverables', icon: 'inbox', label: '交付物', group: '工作台' },
  { path: '/agents', icon: 'cpu', label: 'Agent', group: '管理' },
  { path: '/sandboxes', icon: 'box', label: '沙盒', group: '管理' },
  { path: '/templates', icon: 'layers', label: '模板市场', group: '管理' },
  { path: '/departments', icon: 'users', label: '部门', group: '管理' },
  { path: '/reports', icon: 'bar-chart', label: '运营报表', group: '管理' },
  { path: '/surveys', icon: 'target', label: '问卷', group: '管理' },
  { path: '/workflows', icon: 'zap', label: '工作流', group: '管理' },
]

/** 管理员导航（商业化 G2：ADMIN_EMAILS 白名单——/api/admin/me 判定） */
export const ADMIN_NAV: NavDef[] = [
  { path: '/admin', icon: 'shield', label: '租户管理', group: '管理' },
]
