/**
 * 工作空间文件浏览器 API（F1-F4 迁移 2026-12）——用户管理面
 *
 * 三层模型：部门 = 工作目录——文件浏览器按**部门**浏览（单聊也是部门特例，同样有目录）：
 *   - 部门有工作目录（departments.workspace_path 自定义，默认 {root}/{id}）
 *   - 可见性：部门必须属于当前 app（app_id 隔离）
 * 与沙盒关系：AI 工具（容器内）与用户看到的是同一份数据（容器卷挂载 = 宿主目录，双向可见）。
 * 安全：应用隔离 + 路径穿越防护（resolveWorkspacePath）。
 */

import { readFile, readdir, writeFile, stat, mkdir } from 'node:fs/promises'
import { join, resolve, normalize, sep, dirname } from 'node:path'
import type { Router, Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

/** 宿主侧路径穿越防护（文件浏览器专用——agent 工具侧由容器 safePath 负责） */
export function resolveWorkspacePath(workspace: string, relPath: string): string {
  const resolved = resolve(join(workspace, relPath || '.'))
  const normalized = normalize(resolved)
  const wsNormalized = normalize(resolve(workspace))
  if (!normalized.startsWith(wsNormalized + sep) && normalized !== wsNormalized) {
    throw new Error(`路径 "${relPath}" 超出了工作空间范围`)
  }
  return normalized
}

const MAX_READ = 200 * 1024 // 200KB 内可读全文
const MAX_WRITE = 500 * 1024 // 500KB 写上限

export async function registerWorkspaceRoutes(app: Router<AppCtx>): Promise<void> {
  // 校验部门属于当前租户 + 解析 workspace（不存在 → null；单聊也是部门特例——同样有目录）
  async function getWorkspace(ctx: AppCtx, departmentId: string): Promise<string | null> {
    const { sql, appId } = ctx
    const [dept] = await sql`
      SELECT id, is_dm, workspace_path FROM departments
      WHERE id = ${departmentId} AND app_id = ${appId}
    `
    if (!dept) return null
    const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
    return resolveDepartmentWorkspace(String((dept as any).id), (dept as any).workspace_path as string | null | undefined, true)
  }

  // ── F1: 列目录 ────────────────────────────────────────
  app.get('/api/departments/:id/workspace/list', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { params } = ctx
    const ws = await getWorkspace(ctx, params.id)
    if (!ws) return Response.json({ error: '部门不存在或无工作空间' }, { status: 404 })
    const rel = new URL(req.url).searchParams.get('path') ?? ''
    let abs: string
    try {
      abs = resolveWorkspacePath(ws, rel)
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    try {
      const st = await stat(abs)
      if (!st.isDirectory()) {
        return Response.json({ error: '不是目录' }, { status: 400 })
      }
      const entries = await readdir(abs, { withFileTypes: true })
      const items: Array<{ name: string; type: 'dir' | 'file'; size: number; mtime: string }> = []
      for (const entry of entries) {
        const full = join(abs, entry.name)
        try {
          const s = await stat(full)
          items.push({
            name: entry.name,
            type: entry.isDirectory() ? 'dir' : 'file',
            size: s.size,
            mtime: s.mtime.toISOString(),
          })
        } catch { /* 跳过无法访问 */ }
      }
      items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
      return Response.json({ entries: items, path: rel || '/' })
    } catch (e: any) {
      return Response.json({ error: `读取目录失败: ${e.message}` }, { status: 400 })
    }
  })

  // ── F2: 读文件（?download=1 → 二进制下载流——AI 产物交付） ──
  app.get('/api/departments/:id/workspace/file', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { params } = ctx
    // **token query 直链鉴权（框架 mw——2026-08）**：?token= 与 Bearer 同等
    // （框架 user mw 解析 query token——window.open 下载导航无 header 也能鉴权）
    const url = new URL(req.url)
    const ws = await getWorkspace(ctx, params.id)
    if (!ws) return Response.json({ error: '部门不存在或无工作空间' }, { status: 404 })
    const rel = url.searchParams.get('path') ?? ''
    if (!rel) return Response.json({ error: 'path 为必填' }, { status: 400 })
    let abs: string
    try {
      abs = resolveWorkspacePath(ws, rel)
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    try {
      const st = await stat(abs)
      if (st.isDirectory()) return Response.json({ error: '是目录——请用 list 接口' }, { status: 400 })
      const buf = await readFile(abs)
      // P1-3 产物下载：二进制流 + Content-Disposition（AI 生成的 xlsx/pdf/图表交付）
      if (url.searchParams.get('download') === '1') {
        const pathMod = await import('node:path')
        return new Response(new Uint8Array(buf), {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(pathMod.basename(rel))}"`,
            'Content-Length': String(buf.length),
          },
        })
      }
      // 二进制检测（null 字节）
      const isBinary = buf.includes(0)
      let content = ''
      let truncated = false
      if (!isBinary) {
        let str = buf.toString('utf-8')
        if (str.length > MAX_READ) {
          str = str.slice(0, MAX_READ) + `\n... (文件过大，仅预览前 ${MAX_READ} 字符，总长 ${str.length})`
          truncated = true
        }
        content = str
      }
      return Response.json({ content, binary: isBinary, truncated, size: st.size })
    } catch (e: any) {
      return Response.json({ error: `读取失败: ${e.message}` }, { status: 404 })
    }
  })

  // ── F3/F4: 写文件（编辑保存） ─────────────────────────
  app.put('/api/departments/:id/workspace/file', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { params } = ctx
    const ws = await getWorkspace(ctx, params.id)
    if (!ws) return Response.json({ error: '部门不存在或无工作空间' }, { status: 404 })
    const body = await req.json().catch(() => ({}))
    const rel = String(body.path ?? '')
    const content = String(body.content ?? '')
    if (!rel) return Response.json({ error: 'path 为必填' }, { status: 400 })
    if (content.length > MAX_WRITE) {
      return Response.json({ error: `文件过大（上限 ${MAX_WRITE} 字符）` }, { status: 413 })
    }
    if (content.includes('\u0000')) {
      return Response.json({ error: '二进制内容不可写——仅支持文本编辑' }, { status: 400 })
    }
    let abs: string
    try {
      abs = resolveWorkspacePath(ws, rel)
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    try {
      // F4 目录名防抖：写 path 指向已存在目录 → 拒绝
      const st = await stat(abs).catch(() => null)
      if (st?.isDirectory()) {
        return Response.json({ error: '目标已存在且是目录——不能覆盖' }, { status: 400 })
      }
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, content, 'utf-8')
      return Response.json({ success: true, size: content.length })
    } catch (e: any) {
      return Response.json({ error: `写入失败: ${e.message}` }, { status: 400 })
    }
  })

  // ── P1-3: 上传二进制文件（配置页——管理员预置资料） ─────────
  app.post('/api/departments/:id/workspace/upload', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { params } = ctx
    const ws = await getWorkspace(ctx, params.id)
    if (!ws) return Response.json({ error: '部门不存在或无工作空间' }, { status: 404 })
    const body = await req.json().catch(() => ({}))
    const rel = String(body.path ?? '')
    const { validateUploadFile } = await import('../services/upload.ts')
    let file
    try {
      file = validateUploadFile(body as { name: string; data: string; size?: number })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '附件无效' }, { status: 400 })
    }
    let abs: string
    try {
      abs = resolveWorkspacePath(ws, rel ? `${rel.replace(/\/$/, '')}/${file.safeName}` : file.safeName)
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    const fs = await import('node:fs/promises')
    const pathMod = await import('node:path')
    try {
      await fs.mkdir(pathMod.dirname(abs), { recursive: true })
      await fs.writeFile(abs, file.buffer)
      return Response.json({ success: true, name: file.safeName, size: file.size })
    } catch (e: any) {
      return Response.json({ error: `写入失败: ${e.message}` }, { status: 400 })
    }
  })
}