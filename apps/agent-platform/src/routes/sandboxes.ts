/**
 * Sandbox 路由 — CRUD + 生命周期操作（一级概念：sandbox = 计算资源）
 *
 * 三层模型（2026-12）：部门 = 工作目录，sandbox = 计算资源，agent = 能力。
 * - 租户隔离：app_id 过滤（列表/详情/操作）
 * - 权限：owner/admin 管理操作（创建/配置/终止）；成员只读
 * - 配额：per-app sandbox_quota（超限 409——manager.create 抛错）
 * - 审计：sandbox_create/config_change/start/stop/restart/terminate
 */

import type { Router } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

export function registerSandboxRoutes(app: Router<AppCtx>): void {
  // 管理权限校验（owner/admin——同 agents 删除权限模型）
  function requireManager(ctx: AppCtx): { ok: boolean; error?: string; status?: number } {
    const role = (ctx.auth as any)?.role
    if (role !== 'owner' && role !== 'admin') {
      return { ok: false, error: '仅管理员可管理沙盒', status: 403 }
    }
    return { ok: true }
  }

  async function audit(ctx: AppCtx, action: string, targetId: string, detail?: Record<string, unknown>): Promise<void> {
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action, target_type: 'sandbox', target_id: targetId, detail: detail ?? {} })
    } catch { /* 尽力 */ }
  }

  // ── 列表（租户隔离 + 部门名 join + 容器实际状态） ─────────

  app.get('/api/sandboxes', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const url = new URL(req.url)
    const status = url.searchParams.get('status') ?? undefined
    const departmentId = url.searchParams.get('department_id') ?? undefined
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(sql)
    const rows = await manager.list(String(appId), { status, department_id: departmentId })
    // 部门名 join（显示用）
    const deptIds = rows.map(r => r.department_id).filter(Boolean) as string[]
    const deptMap = new Map<string, string>()
    if (deptIds.length > 0) {
      const depts = await sql`
        SELECT id, name FROM departments WHERE id = ANY(string_to_array(${deptIds.join(',')}, ',')::uuid[])
      ` as any[]
      for (const d of depts ?? []) deptMap.set(String(d.id), String(d.name ?? d.id))
    }
    // 容器实际状态（运行/停止——列表一次查询）
    const { sandbox } = await import('../sandbox/docker.ts')
    const containers = await sandbox.listContainers()
    const actualMap = new Map<string, string>()
    for (const c of containers) actualMap.set(String(c.name ?? '').replace('ap-sandbox-', ''), String(c.status ?? ''))
    const items = rows.map(r => ({
      ...r,
      departmentName: r.department_id ? (deptMap.get(r.department_id) ?? '未知部门') : null,
      containerStatus: actualMap.get(r.id) ?? null,
    }))
    // M5-1 配额用量（per-app）：used/limit + 压力（≥80% 黄条）
    const [q] = await sql`SELECT sandbox_quota FROM _weifuwu_apps WHERE id = ${appId}`
    const quotaLimit = Number(q?.sandbox_quota ?? 5)
    const usedCount = items.filter(i => i.status !== 'terminated').length
    return Response.json({
      sandboxes: items,
      total: items.length,
      quota: {
        used: usedCount,
        limit: quotaLimit,
        pressure: quotaLimit > 0 && usedCount / quotaLimit >= 0.8,
      },
    })
  })

  // ── 创建（手动；配额超限 409） ──────────────────────────

  app.post('/api/sandboxes', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const perm = requireManager(ctx)
    if (!perm.ok) return Response.json({ error: perm.error }, { status: perm.status ?? 403 })
    const { sql, appId } = ctx
    const body = await req.json().catch(() => ({})) as {
      department_id?: string
      name?: string
      image?: string
      network?: boolean
      memory_mb?: number
      mode?: 'persistent' | 'ephemeral'
    }
    // 部门绑定校验（可选——独立沙盒 department_id 为空）
    let deptName = body.name
    let wsPath: string | null = null
    if (body.department_id) {
      const [dept] = await sql`
        SELECT id, name, is_dm, workspace_path FROM departments WHERE id = ${body.department_id} AND app_id = ${appId}
      `
      if (!dept) return Response.json({ error: '部门不存在' }, { status: 404 })
      if ((dept as any).is_dm) return Response.json({ error: '单聊无工作目录——不支持创建沙盒' }, { status: 400 })
      deptName = deptName ?? String(dept.name ?? '工作环境')
      // 三层模型：部门 = 工作目录——手动创建沙盒挂载部门目录（默认 {root}/{id}）
      try {
        const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
        wsPath = await resolveDepartmentWorkspace(String((dept as any).id), (dept as any).workspace_path, true)
      } catch { wsPath = null }
    }
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(sql)
    try {
      const row = await manager.create({
        appId: String(appId),
        departmentId: body.department_id ?? null,
        name: deptName ?? '工作环境',
        workspace: wsPath ?? undefined,
        image: body.image,
        network: body.network,
        memoryMb: body.memory_mb,
        mode: body.mode,
      })
      await audit(ctx, 'sandbox_create', String(row.id), { name: row.name, departmentId: row.department_id ?? undefined })
      return Response.json({ sandbox: row }, { status: 201 })
    } catch (e: any) {
      const msg = e?.message ?? '创建失败'
      const quota = msg.includes('配额')
      return Response.json({ error: msg }, { status: quota ? 409 : 400 })
    }
  })

  // ── 详情（含容器资源统计） ──────────────────────────────

  app.get('/api/sandboxes/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(sql)
    const row = await manager.get(String(params.id), String(appId))
    if (!row) return Response.json({ error: '沙盒不存在' }, { status: 404 })
    // 容器实际状态 + 资源
    const { sandbox } = await import('../sandbox/docker.ts')
    const stats = await sandbox.containerStats(`ap-sandbox-${row.id}`)
    const containers = await sandbox.listContainers()
    const actual = containers.find(c => String(c.name) === `ap-sandbox-${row.id}`)
    return Response.json({
      sandbox: {
        ...row,
        containerStatus: actual?.status ?? null,
        stats: stats ?? null,
      },
    })
  })

  // ── 配置更新（快照变更 → 漂移重建） ─────────────────────

  app.patch('/api/sandboxes/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const perm = requireManager(ctx)
    if (!perm.ok) return Response.json({ error: perm.error }, { status: perm.status ?? 403 })
    const { sql, appId, params } = ctx
    const body = await req.json().catch(() => ({})) as { image?: string; network?: boolean; memory_mb?: number; cpus?: number }
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(sql)
    const row = await manager.get(String(params.id), String(appId))
    if (!row) return Response.json({ error: '沙盒不存在' }, { status: 404 })
    await manager.updateConfig(String(row.id), String(appId), {
      image: body.image, network: body.network, memoryMb: body.memory_mb, cpus: body.cpus,
    })
    await audit(ctx, 'sandbox_config_change', String(row.id), { ...body })
    return Response.json({ success: true })
  })

  // ── 生命周期操作 ────────────────────────────────────────

  app.post('/api/sandboxes/:id/:action', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const perm = requireManager(ctx)
    if (!perm.ok) return Response.json({ error: perm.error }, { status: perm.status ?? 403 })
    const { sql, appId, params } = ctx
    const action = params.action as 'start' | 'stop' | 'restart' | 'terminate'
    if (!['start', 'stop', 'restart', 'terminate'].includes(action)) {
      return Response.json({ error: '不支持的 action' }, { status: 400 })
    }
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(sql)
    const id = String(params.id)
    const row = await manager.get(id, String(appId))
    if (!row) return Response.json({ error: '沙盒不存在' }, { status: 404 })
    let r: { ok: boolean; error?: string }
    if (action === 'terminate') {
      await manager.terminate(id, String(appId))
      r = { ok: true }
    } else if (action === 'start') {
      r = await manager.start(id, String(appId))
    } else if (action === 'stop') {
      r = await manager.stop(id, String(appId))
    } else {
      r = await manager.restart(id, String(appId))
    }
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 })
    await audit(ctx, `sandbox_${action}`, id, { name: row.name })
    return Response.json({ success: true, status: action === 'terminate' ? 'terminated' : undefined })
  })

  // ── 容器内进程 / 资源（管理面） ─────────────────────────

  app.get('/api/sandboxes/:id/processes', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(sql)
    const row = await manager.get(String(params.id), String(appId))
    if (!row) return Response.json({ error: '沙盒不存在' }, { status: 404 })
    const { sandbox } = await import('../sandbox/docker.ts')
    const procs = await sandbox.containerProcesses(`ap-sandbox-${row.id}`)
    return Response.json({ name: row.name, processes: procs })
  })

  app.get('/api/sandboxes/:id/stats', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(sql)
    const row = await manager.get(String(params.id), String(appId))
    if (!row) return Response.json({ error: '沙盒不存在' }, { status: 404 })
    const { sandbox } = await import('../sandbox/docker.ts')
    const stats = await sandbox.containerStats(`ap-sandbox-${row.id}`)
    return Response.json({ name: row.name, stats: stats ?? null })
  })
}
