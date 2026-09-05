/**
 * 权限模型 V2（R4）— 角色能力矩阵 + 统一校验
 *
 * 角色（_weifuwu_app_members.role + department_members.role）：
 *   owner    租户所有者：全部 + 计费/邀请/删除
 *   admin    部门管理员：建 Agent/建部门/审批/成员管理（部门级）
 *   member   普通成员：对话/使用已授权 Agent
 *   viewer   只读成员：查看全部，禁止任何写操作（发消息/建 Agent/管理）
 *
 * 能力矩阵（单源——src/shared/roles.ts CAPABILITIES——本注释不再双维护）
 */

import type { AppCtx } from '../middleware/ctx.ts'
import { hasCapability } from '../shared/roles.ts'

/** 查询用户的应用角色（owner/admin/member/viewer——框架 app_members role） */
export async function appRoleOf(ctx: AppCtx, userId?: string): Promise<string | null> {
  const uid = userId ?? ctx.auth?.userId
  if (!uid) return null
  const rows = await ctx.orm.query.from('_weifuwu_app_members')
    .select('role')
    .where({ app_id: { eq: String(ctx.appId) }, user_id: { eq: uid }})
    .limit(1)
    .run()
  return rows[0]?.role ? String(rows[0].role) : null
}

/** 禁止只读成员（viewer）执行写操作——403 带明确提示
 * W2：能力矩阵单源（src/shared/roles.ts）——requireWriter 从 CAPABILITIES.write 查 */
export async function requireWriter(ctx: AppCtx): Promise<void> {
  const role = await appRoleOf(ctx)
  if (!hasCapability(role, 'write')) {
    const err = new Error('只读成员无权执行此操作') as Error & { status?: number }
    err.status = 403
    throw err
  }
}

/** 禁止普通成员执行管理操作（部门成员管理/审批等）——部门 admin 或租户 owner */
export async function requireDeptManager(ctx: AppCtx, departmentId: string): Promise<void> {
  const { auth } = ctx
  const [caller] = await ctx.orm.query.from('department_members dm')
    .join('agents ua', { 'ua.id': { col: 'dm.agent_id' } })
    .select('dm.role')
    .where({ 'dm.department_id': { eq: departmentId }, 'ua.user_id': { eq: String(auth!.userId) } })
    .limit(1)
    .run()
  const [ownerRow] = await ctx.orm.query.from('_weifuwu_app_members')
    .select('role')
    .where({ app_id: { eq: String(ctx.appId) }, user_id: { eq: String(auth!.userId) } })
    .limit(1)
    .run()
  if ((!caller || caller.role !== 'admin') && ownerRow?.role !== 'owner') {
    const err = new Error('只有部门管理员可以执行此操作') as Error & { status?: number }
    err.status = 403
    throw err
  }
}
