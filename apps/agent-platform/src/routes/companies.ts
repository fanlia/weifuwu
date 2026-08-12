/**
 * 公司路由 — CRUD
 */

import type { Router, Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

export function registerCompanyRoutes(app: Router<AppCtx>): void {
  // ── 获取公司列表 ─────────────────────────────────────────

  app.get('/api/companies', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const url = new URL(req.url)
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))

    const companies = await sql`
      SELECT id, name, created_at, updated_at
      FROM companies
      WHERE app_id = ${appId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const [countResult] = await sql`
      SELECT COUNT(*)::int as total FROM companies WHERE app_id = ${appId}
    `

    return Response.json({ companies, total: countResult.total })
  })

  // ── 创建公司 ─────────────────────────────────────────────

  app.post('/api/companies', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const body = await req.json() as { name: string }

    if (!body.name) {
      return Response.json({ error: 'name 为必填' }, { status: 400 })
    }

    const [company] = await sql`
      INSERT INTO companies (app_id, name)
      VALUES (${appId}, ${body.name})
      RETURNING id, name, created_at
    `

    return Response.json({ company }, { status: 201 })
  })

  // ── 获取单个公司 ─────────────────────────────────────────

  app.get('/api/companies/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [company] = await sql`
      SELECT id, name, created_at, updated_at
      FROM companies
      WHERE id = ${params.id} AND app_id = ${appId}
    `
    if (!company) {
      return Response.json({ error: '公司不存在' }, { status: 404 })
    }
    return Response.json({ company })
  })

  // ── 更新公司 ─────────────────────────────────────────────

  app.put('/api/companies/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const body = await req.json() as { name: string }

    const [company] = await sql`
      UPDATE companies
      SET name = ${body.name}, updated_at = NOW()
      WHERE id = ${params.id} AND app_id = ${appId}
      RETURNING id, name, updated_at
    `

    if (!company) {
      return Response.json({ error: '公司不存在' }, { status: 404 })
    }
    return Response.json({ company })
  })

  // ── 删除公司 ─────────────────────────────────────────────

  app.delete('/api/companies/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const result = await sql`
      DELETE FROM companies
      WHERE id = ${params.id} AND app_id = ${appId}
      RETURNING id
    `
    if (result.length === 0) {
      return Response.json({ error: '公司不存在' }, { status: 404 })
    }
    return Response.json({ success: true })
  })
}
