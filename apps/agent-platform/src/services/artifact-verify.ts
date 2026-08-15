/**
 * 产物验证服务（2026-12——AI 执行验证/幻觉治理）
 *
 * 问题：AI 可能「声称完成」但实际没调用工具（LLM 幻觉）——用户看到「已完成」却无产物。
 * 方案：AI 回复完成后，系统从回复文本提取声称的产物路径 → 校验部门工作目录存在性 →
 * 追加「✅ 产物已验证 / ⚠️ 声称的产物未找到」标记——把「声称完成」和「实际完成」分开。
 *
 * 诚实裁剪：只验证明确文件路径（扩展名白名单）；bash 写入无法追踪来源但路径存在即验证通过；
 * 越界路径（../）忽略；每轮最多验证 5 个路径。
 */

type Sql = any

/** 文件路径提取正则（/ws/ 前缀可选；中英文文件名 + 常见扩展名） */
const PATH_RE = /(?:\/ws\/)?([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5./()（）_-]*?\.(?:md|txt|xlsx|xls|csv|json|py|ts|js|tsx|jsx|html|htm|pdf|docx|pptx|log|xml|yaml|yml|sql|sh|png|jpg|jpeg|svg|zip))(?:[\s"'`,，。；;:：)）\]}]|$)/g

/** 从回复内容提取声称的产物路径（去重 + 上限 5） */
export function extractArtifactPaths(content: string): string[] {
  const out = new Set<string>()
  const text = String(content ?? '')
  for (const m of text.matchAll(PATH_RE)) {
    let p = String(m[1]).trim()
    if (p.startsWith('/ws/')) p = p.slice(4)
    // 过滤明显的非产物（代码示例里的 import 路径等误报——只保留文件扩展名且路径较短）
    if (p.length > 200 || p.includes('node_modules')) continue
    out.add(p)
  }
  return [...out].slice(0, 5)
}

/** 校验产物是否存在（部门工作目录内；越界/无工作目录 → 忽略） */
export async function verifyArtifacts(
  sql: Sql,
  departmentId: string,
  paths: string[],
  taskStartedAt?: number,
): Promise<{ verified: string[]; missing: string[]; stale: string[] }> {
  const verified: string[] = []
  const missing: string[] = []
  const stale: string[] = []
  if (paths.length === 0) return { verified, missing, stale }
  try {
    const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
    const [dept] = await sql`SELECT workspace_path FROM departments WHERE id = ${departmentId}`
    const ws = await resolveDepartmentWorkspace(departmentId, dept?.workspace_path, true)
    if (!ws) return { verified, missing, stale }
    const { access, stat } = await import('node:fs/promises')
    const { join, resolve } = await import('node:path')
    const wsRoot = resolve(ws)
    for (const p of paths) {
      const abs = resolve(join(ws, p))
      if (abs !== wsRoot && !abs.startsWith(wsRoot + '/')) continue // 越界忽略
      try {
        const st = await stat(abs)
        // 2026-12 修复：区分新旧产物——文件 mtime 早于任务开始 = 旧文件（本轮未更新——
        // 曾把旧 survey-result.json 误判「已验证」掩盖 AI 未干活）
        if (taskStartedAt && st.mtimeMs < taskStartedAt) {
          stale.push(p)
        } else {
          verified.push(p)
        }
      } catch {
        missing.push(p)
      }
    }
  } catch { /* 验证失败不阻断 */ }
  return { verified, missing, stale }
}

/** 验证标记（追加到 AI 回复末尾——Markdown 渲染） */
export function buildVerifyMark(verified: string[], missing: string[], stale: string[] = []): string {
  const parts: string[] = []
  if (verified.length > 0) parts.push(`✅ 产物已验证：${verified.join('、')}`)
  if (stale.length > 0) parts.push(`⚠️ 声称的产物是旧文件（本轮未更新）：${stale.join('、')}——请确认是否实际重新生成`)
  if (missing.length > 0) parts.push(`⚠️ 声称的产物未找到：${missing.join('、')}——请确认是否实际生成`)
  return parts.length > 0 ? `\n\n---\n${parts.join('\n')}` : ''
}
