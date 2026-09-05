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
import { HttpError } from 'weifuwu'
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
    const { orm, appId } = ctx
    const [dept] = await orm.query.from('departments')
      .select('id', 'is_dm', 'workspace_path')
      .where({ id: { eq: departmentId }, app_id: { eq: String(appId) } })
      .limit(1)
      .run()
    if (!dept) return null
    const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
    return resolveDepartmentWorkspace(String((dept as any).id), (dept as any).workspace_path as string | null | undefined, true)
  }

  // ── F1: 列目录 ────────────────────────────────────────
  app.get('/api/departments/:id/workspace/list', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { params } = ctx
    const ws = await getWorkspace(ctx, params.id)
    if (!ws) throw new HttpError('部门不存在或无工作空间', 404)
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
        throw new HttpError('不是目录', 400)
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
  // **下载 ticket（短时绑定票——2026-08 安全升级）**：此前 ?token= 直接复用
  // access token（3600s JWT——URL 进浏览器历史/日志/Referer——泄漏窗口大）——
  // 升级：点击下载先 POST 换 30s ticket（type=download + appId + path 绑定——
  // 换 URL 下载其他文件无效）——window.open(ticket 直链)——原生导航下载
  app.post('/api/departments/:id/workspace/download-ticket', async (req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      const { requireWriter } = await import('../services/permissions.ts')
      await requireWriter(ctx)
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '无权操作' }, { status: e?.status ?? 403 })
    }
    const body = await req.json().catch(() => ({}))
    const rel = String(body.path ?? '')
    if (!rel) throw new HttpError('path 为必填', 400)
    try {
      const { signToken } = await import('weifuwu')
      const secret = process.env.JWT_SECRET ?? 'default-secret'
      const ticket = signToken({ type: 'download', appId: ctx.appId, deptId: String(ctx.params?.id ?? ''), path: rel, sub: ctx.auth?.userId }, secret, 30)
      return Response.json({ ticket, expiresIn: 30 })
    } catch (e: any) {
      throw new HttpError('ticket 签发失败', 500)
    }
  })

  app.get('/api/departments/:id/workspace/file', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { params } = ctx
    const url = new URL(req.url)
    // **ticket 直链鉴权（v3——2026-08）**：?ticket=（30s + type=download +
    // appId + path 绑定）——验证通过才放行（下载导航无 header 面）
    const ticket = url.searchParams.get('ticket')
    const rel0 = url.searchParams.get('path') ?? ''
    if (ticket && !req.headers.get('authorization')) {
      try {
        const { verifyToken } = await import('weifuwu')
        const secret = process.env.JWT_SECRET ?? 'default-secret'
        const payload = verifyToken(ticket, secret)
        if (payload?.type !== 'download') throw new Error('ticket 类型不符')
        // **appId 从 payload 注入**（ticket 请求无 authorization——框架 mw
        // 不解析 query——ctx.appId 空——不能比较——payload 自含 appId——
        // 验证后信任（ticket 签名+30s+绑定=最小暴露面）
        ;(ctx as any).appId = payload.appId
        if (payload.path !== decodeURIComponent(rel0)) throw new Error('ticket path 不匹配')
        ;(ctx as any).auth = { userId: String(payload.sub ?? ''), ...(ctx as any).auth }
        ;(ctx as any).ticketUser = payload.sub
      } catch {
        throw new HttpError('下载 ticket 无效或已过期（30s——请重新点击）', 401)
      }
    }
    const ws = await getWorkspace(ctx, params.id)
    if (!ws) throw new HttpError('部门不存在或无工作空间', 404)
    const rel = url.searchParams.get('path') ?? ''
    if (!rel) throw new HttpError('path 为必填', 400)
    let abs: string
    try {
      abs = resolveWorkspacePath(ws, rel)
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 400 })
    }
    try {
      const st = await stat(abs)
      if (st.isDirectory()) throw new HttpError('是目录——请用 list 接口', 400)
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
    if (!ws) throw new HttpError('部门不存在或无工作空间', 404)
    const body = await req.json().catch(() => ({}))
    const rel = String(body.path ?? '')
    const content = String(body.content ?? '')
    if (!rel) throw new HttpError('path 为必填', 400)
    if (content.length > MAX_WRITE) {
      return Response.json({ error: `文件过大（上限 ${MAX_WRITE} 字符）` }, { status: 413 })
    }
    if (content.includes('\u0000')) {
      throw new HttpError('二进制内容不可写——仅支持文本编辑', 400)
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
        throw new HttpError('目标已存在且是目录——不能覆盖', 400)
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
    if (!ws) throw new HttpError('部门不存在或无工作空间', 404)
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