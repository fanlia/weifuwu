/**
 * 权限角色单源（fullstack W2——前后端共享）
 *
 * 角色（_weifuwu_app_members.role + department_members.role）：
 *   owner    租户所有者：全部 + 计费/邀请/删除
 *   admin    部门管理员：建 Agent/建部门/审批/成员管理（部门级）
 *   member   普通成员：对话/使用已授权 Agent
 *   viewer   只读成员：查看全部，禁止任何写操作
 *
 * 能力矩阵（单源——前端 canWrite/isTenantOwner 与后端 requireWriter 都
 * 从这里查——矩阵注释代码化——不再 ASCII 表双维护）：
 *   write  发消息/建 Agent/建部门……（owner/admin/member——viewer 拒）
 *   manage 管理面（owner/admin）
 *   tenant 租户面（owner——计费/邀请/删除）
 *
 * 前端 unknown（token 缺失/解析失败）→ 所有能力 false（API 403 兜底）。
 */

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const CAPABILITIES = {
  /** 写面（发消息/建 Agent——viewer/unknown 拒） */
  write: ['owner', 'admin', 'member'] as const,
  /** 管理面（建部门/加成员/审批） */
  manage: ['owner', 'admin'] as const,
  /** 租户面（计费/邀请/删除） */
  tenant: ['owner'] as const,
} as const

export type Capability = keyof typeof CAPABILITIES

/** 角色能力检查（null/undefined/未知 → false——显式拒绝不明角色） */
export function hasCapability(role: string | null | undefined, cap: Capability): boolean {
  if (!role) return false
  const allowed = CAPABILITIES[cap] as readonly string[]
  return allowed.includes(role)
}
