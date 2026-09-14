/**
 * 产物审批服务（2026-12——AI 产出 → 经理/管理员审批 → 发布到共享区）
 *
 * 机制：部门开启 artifact_review 后，AI 的沙盒容器挂载**待审区**（{ws}/.pending 为 /ws）——
 * AI 全程感知 /ws 正常（读写都在待审区），产物不直接进入共享目录；
 * 批准 = 宿主把 .pending 文件移动到共享目录（发布）；拒绝 = 删除待审文件。
 * 关闭审批模式时 flushPendingArtifacts（待审产物全部发布——不丢文件）。
 */

type Sql = any

/** 待审区路径（{部门工作目录}/.pending） */
export async function pendingDirOf(sql: Sql, departmentId: string): Promise<string | null> {
  try {
    const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
    const [dept] = await (sql as any).query.from('departments').select('workspace_path').where({ id: departmentId }).limit(1).run()
    const ws = await resolveDepartmentWorkspace(departmentId, dept?.workspace_path, true)
    if (!ws) return null
    const { join } = await import('node:path')
    const { mkdir } = await import('node:fs/promises')
    const pending = join(ws, '.pending')
    await mkdir(pending, { recursive: true })
    return pending
  } catch {
    return null
  }
}

/** 待审批产物列表（相对路径 + 大小 + 时间） */
export async function listPendingArtifacts(sql: Sql, departmentId: string): Promise<Array<{ path: string; size: number; mtime: string }>> {
  const pending = await pendingDirOf(sql, departmentId)
  if (!pending) return []
  try {
    const { readdir, stat } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const entries = await readdir(pending, { withFileTypes: true })
    const out: Array<{ path: string; size: number; mtime: string }> = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(pending, entry.name)
      try {
        const st = await stat(full)
        if (entry.isDirectory()) {
          // 递归子目录（AI 可能写子目录产物）
          const sub = await readdir(full, { withFileTypes: true })
          for (const s of sub) {
            if (s.name.startsWith('.')) continue
            const sf = join(full, s.name)
            try {
              const ss = await stat(sf)
              if (s.isFile()) out.push({ path: `${entry.name}/${s.name}`, size: ss.size, mtime: ss.mtime.toISOString() })
            } catch { /* 跳过 */ }
          }
        } else {
          out.push({ path: entry.name, size: st.size, mtime: st.mtime.toISOString() })
        }
      } catch { /* 跳过 */ }
    }
    out.sort((a, b) => a.path.localeCompare(b.path))
    return out
  } catch {
    return []
  }
}

/** 批准：移动待审文件 → 共享目录（发布）；源缺失 → 视为已处理 */
export async function approveArtifact(sql: Sql, departmentId: string, relPath: string): Promise<{ ok: boolean; error?: string }> {
  const pending = await pendingDirOf(sql, departmentId)
  if (!pending) return { ok: false, error: '待审区不可用' }
  if (!relPath || relPath.includes('..') || relPath.startsWith('/')) {
    return { ok: false, error: '非法路径' }
  }
  try {
    const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
    const [dept] = await (sql as any).query.from('departments').select('workspace_path').where({ id: departmentId }).limit(1).run()
    const ws = await resolveDepartmentWorkspace(departmentId, dept?.workspace_path, true)
    if (!ws) return { ok: false, error: '工作目录不可用' }
    const { rename, mkdir, access } = await import('node:fs/promises')
    const { join, dirname } = await import('node:path')
    const src = join(pending, relPath)
    const dst = join(ws, relPath)
    try { await access(src) } catch { return { ok: true, error: '待审文件不存在（可能已处理）' } }
    await mkdir(dirname(dst), { recursive: true })
    await rename(src, dst)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `发布失败: ${(e as Error)?.message ?? '未知错误'}` }
  }
}

/** 拒绝：删除待审文件 */
export async function rejectArtifact(sql: Sql, departmentId: string, relPath: string): Promise<{ ok: boolean; error?: string }> {
  const pending = await pendingDirOf(sql, departmentId)
  if (!pending) return { ok: false, error: '待审区不可用' }
  if (!relPath || relPath.includes('..') || relPath.startsWith('/')) {
    return { ok: false, error: '非法路径' }
  }
  try {
    const { rm, access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const src = join(pending, relPath)
    try { await access(src) } catch { return { ok: true, error: '待审文件不存在（可能已处理）' } }
    await rm(src, { recursive: true, force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `删除失败: ${(e as Error)?.message ?? '未知错误'}` }
  }
}

/** 关闭审批模式：待审产物全部发布到共享目录（不丢文件） */
export async function flushPendingArtifacts(sql: Sql, departmentId: string): Promise<number> {
  const pending = await pendingDirOf(sql, departmentId)
  if (!pending) return 0
  const items = await listPendingArtifacts(sql, departmentId)
  let moved = 0
  for (const it of items) {
    const r = await approveArtifact(sql, departmentId, it.path)
    if (r.ok) moved++
  }
  // 清空残留子目录
  try {
    const { readdir, rm } = await import('node:fs/promises')
    const { join } = await import('node:path')
    for (const e of await readdir(pending)) {
      if (e.startsWith('.')) continue
      await rm(join(pending, e), { recursive: true, force: true })
    }
  } catch { /* 清理尽力 */ }
  return moved
}
