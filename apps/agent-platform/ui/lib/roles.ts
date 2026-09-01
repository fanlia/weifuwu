/**
 * 客户端角色读取（ROLES-OPTIMIZATION 波次 2——写入口遮蔽的统一感知点）
 *
 * role 来源：localStorage `agent_platform_role`——Login 登录/join 流与
 * 测试 injectAuth 均写入（roles.test 锚定）。用途 = 前端写操作入口的
 * 禁用态（tooltip 说明原因）——与 API 403 防线构成双保险（前端不点、
 * 后端必拒——两者语义一致，前端缺失时 API 兜底）。
 */

export type ClientRole = 'owner' | 'admin' | 'member' | 'viewer' | 'unknown'

export function clientRole(): ClientRole {
  if (typeof localStorage === 'undefined') return 'unknown'
  const raw = localStorage.getItem('agent_platform_role')
  if (raw === 'owner' || raw === 'admin' || raw === 'member' || raw === 'viewer') return raw
  return 'unknown'
}

/** 部门消息/建 Agent 等 writer 面写权限（owner/member 合法——viewer/unknown 拒） */
export function canWrite(): boolean {
  const r = clientRole()
  return r === 'owner' || r === 'member' || r === 'admin'
}

/** 租户管理面（建删部门/邀请/审批操作）——仅 owner（波次 1 裁剪后唯一租户管理角色） */
export function isTenantOwner(): boolean {
  return clientRole() === 'owner'
}

/** 禁用原因文案（tooltip/placeholder 用——引导而非惩罚——走查 P0 语义） */
export function writeDenyReason(role: ClientRole = clientRole()): string {
  if (role === 'viewer') return '只读成员无法执行此操作'
  return '此操作需要更高权限'
}
