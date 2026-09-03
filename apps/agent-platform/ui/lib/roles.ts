/**
 * 客户端角色读取（ROLES-OPTIMIZATION 波次 2——写入口遮蔽的统一感知点）
 *
 * USERSYSTEM-V2 角色单源：从应用 token JWT payload 解（issueSession 签发即
 * 带 appId+role——注册/登录/SSO 全链路同一 token）——不再依赖 localStorage
 * `agent_platform_role`（双源 bug：Login 写而 Register 不写——注册用户角色
 * 恒"unknown"→ 写入口误禁）。token 内角色变更在 refresh 轮换后生效（诚实
 * 边界：非实时同步——应用内降权即时场景由 API 403 兜底）。
 *
 * 用途 = 前端写操作入口的禁用态（tooltip 说明原因）——与 API 403 防线构成
 * 双保险（前端不点、后端必拒——语义一致，前端缺失时 API 兜底）。
 */

export type ClientRole = 'owner' | 'admin' | 'member' | 'viewer' | 'unknown'

const ALL: ReadonlySet<string> = new Set(['owner', 'admin', 'member', 'viewer'])

function readToken(): string | null {
  try { return localStorage.getItem('agent_platform_token') } catch { return null }
}

/** JWT payload 角色（base64url 解码——token 是唯一真源——不落第二存储） */
function tokenRole(): ClientRole | null {
  const token = readToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')))
    const r = payload?.role
    if (typeof r === 'string' && ALL.has(r)) return r as ClientRole
  } catch { /* 非 JWT/坏 token——降级 */ }
  return null
}

export function clientRole(): ClientRole {
  return tokenRole() ?? 'unknown'
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
