/**
 * agent-platform 表绑定视图（orm 注册入口）
 *
 * tables(orm) → 23 表绑定（registry 幂等——ctx.orm.table 共享实例——类型随 shape）。
 * 用法定点：route/service 一律 `const T = tables(ctx.orm)`（或注入面传 orm）。
 */
import type { Orm, OrmTable, ZodRawShape } from 'weifuwu'
import { z, f } from 'weifuwu'
import { SHAPES } from './shapes.ts'

/** 框架 _weifuwu_app_members（业务只读角色校验——归属框架 schema——不入平台 23 表） */
export const weifuwuAppMembers: ZodRawShape = {
  app_id: f.req(z.uuid()),
  user_id: f.req(z.uuid()),
  role: f.req(z.string()),
  invited_by: z.uuid().nullable(),
  joined_at: f.now(z.date()),
  source: z.string().nullable(),
  last_login_at: z.date().nullable(),
}

export function tables(orm: Orm): { [K in keyof typeof SHAPES]: OrmTable<typeof SHAPES[K]> } {
  const out = {} as { [K in keyof typeof SHAPES]: OrmTable<typeof SHAPES[K]> }
  for (const [name, def] of Object.entries(SHAPES)) {
    ;(out as Record<string, OrmTable<ZodRawShape>>)[name] = orm.table(name, def)
  }
  return out
}
