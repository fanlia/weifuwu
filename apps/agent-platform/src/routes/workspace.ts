/**
 * 工作空间文件浏览器 API（F1-F4）——用户管理面
 *
 * 与沙盒关系：文件浏览器是用户查看 workspace 状态的管理面（宿主直接 fs 访问）；
 * agent 工具（容器内）与用户看到的是同一份数据（容器卷挂载 = 宿主目录，双向可见）。
 * 安全：租户隔离（agent 必须属于当前 tenant）+ 路径穿越防护（resolveWorkspacePath）。
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
  // 校验 agent 属于当前租户 + 解析 workspace
  async function getWorkspace(ctx: AppCtx, agentId: string): Promise<string | null> {
    const { sql, tenantId } = ctx
    const [agent] = await sql`
      SELECT id, workspace_path, allow_file_tools FROM agents
      WHERE id = ${agentId} AND tenant_id = ${tenantId}
    `
    if (!agent) return null
    // 未启用文件工具的 agent 无 workspace（或返回默认目录）
    const { resolveAgentWorkspace } = await import('../middleware/workspace.ts')
    return resolveAgentWorkspace(String(agent.id), agent.workspace_path as string | null | undefined, true)
  }

  // ── F1: 列目录 ────────────────────────────────────────
  app.get('/api/agents/:id/workspace/list', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { params } = ctx
    const ws = await getWorkspace(ctx, params.id)
    if (!ws) return Response.json({ error: 'Agent 不存在或无工作空间' }, { status: 404 })
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

  // ── F2: 读文件 ────────────────────────────────────────
  app.get('/api/agents/:id/workspace/file', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { params } = ctx
    const ws = await getWorkspace(ctx, params.id)
    if (!ws) return Response.json({ error: 'Agent 不存在或无工作空间' }, { status: 404 })
    const rel = new URL(req.url).searchParams.get('path') ?? ''
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
  app.put('/api/agents/:id/workspace/file', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { params } = ctx
    const ws = await getWorkspace(ctx, params.id)
    if (!ws) return Response.json({ error: 'Agent 不存在或无工作空间' }, { status: 404 })
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
}
