/**
 * 交付物聚合端点（B1——2026-08——产品定位「AI 干的活要在哪找」）
 *
 * /api/deliverables——当前 app 所有部门工作区根层文件（AI 实际产物）：
 *  - 数据源：各部门 workspace 根目录扫描（与 /api/departments/:id/workspace
 *    同源——resolveDepartmentWorkspace）——**只列文件**（不列目录——目录
 *    太大（node_modules 等）——交付物主位是文件）
 *  - 可见性：app 级（与部门列表一致——组织模型平台内协作）
 *  - 排序：mtime 降序（最近交付物优先）——limit 兜底（默认 200）
 *  - 性能：并行扫描（Promise.all——部门多时 100ms 级）——失败部门跳过
 *
 * 消费：/deliverables 页（B1）+ Dashboard 卡片（B2——limit=3）
 */
import type { AppCtx } from '../middleware/ctx.ts'

export function registerDeliverableRoutes(app: any): void {
  app.get('/api/deliverables', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const url = new URL(req.url)
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '200', 10)))
    if (!appId) return Response.json({ error: '未认证' }, { status: 401 })

    const depts = await sql`
      SELECT d.id, d.name, d.workspace_path
      FROM departments d
      WHERE d.app_id = ${appId}
    `
    if (depts.length === 0) return Response.json({ files: [] })

    const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
    const { readdir, stat } = await import('node:fs/promises')
    const { join } = await import('node:path')
    // 大文件占位拒绝阈值（根层与子目录同判——此前仅子目录分支有——根层大文件漏网实证）
    const MAX_FILE_SIZE = 50 * 1024 * 1024

    const scanned = await Promise.all(depts.map(async (d: any): Promise<Array<Record<string, unknown>>> => {
      try {
        const ws = await resolveDepartmentWorkspace(String(d.id), d.workspace_path, true)
        if (!ws) return []
        const entries = await readdir(ws, { withFileTypes: true })
        const items = []
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue
          if (entry.isDirectory()) {
            // AI 产物常见于子目录（outputs/、docs/ 等）——扫一层子目录（深度 1）
            const subFull = join(ws, entry.name)
            try {
              const subEntries = await readdir(subFull, { withFileTypes: true })
              for (const sub of subEntries) {
                if (sub.name.startsWith('.')) continue
                if (!sub.isFile()) continue
                const full = join(subFull, sub.name)
                try {
                  const s = await stat(full)
                  if (s.size > MAX_FILE_SIZE) continue // 大文件占位拒绝（统计面）
                  items.push({
                    deptId: String(d.id), deptName: String(d.name),
                    path: `${entry.name}/${sub.name}`, name: sub.name,
                    size: s.size, mtime: s.mtime.toISOString(),
                  })
                } catch { /* 跳过 */ }
              }
            } catch { /* 子目录不可读跳过 */ }
            continue
          }
          try {
            const s = await stat(join(ws, entry.name))
            if (s.size > MAX_FILE_SIZE) continue // 大文件占位拒绝（统计面——与子目录同判）
            items.push({
              deptId: String(d.id), deptName: String(d.name),
              path: entry.name, name: entry.name,
              size: s.size, mtime: s.mtime.toISOString(),
            })
          } catch { /* 跳过 */ }
        }
        return items
      } catch { return [] }
    }))

    const files = scanned
      .flat()
      .sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
      .slice(0, limit)
    return Response.json({ files })
  })
}
