/**
 * process-csv skill — 工作空间 CSV 表格处理（读取/解析/汇总）
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ToolDefinition } from '../../../src/ai/types.ts'
import type { Context } from 'weifuwu'
import type { AppCtx } from '../../../src/middleware/ctx.ts'

/** 简易 CSV 解析（支持引号） */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuote) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inQuote = false }
      else cur += ch
    } else if (ch === '"') inQuote = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); row = []; cur = '' }
    } else cur += ch
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.length > 0 && r.some((c) => c.trim() !== ''))
}

/** 数字列汇总 */
function summarize(rows: string[][], header: string[]): string {
  const numeric: Record<string, { sum: number; count: number; min: number; max: number }> = {}
  for (const row of rows.slice(1)) {
    header.forEach((h, i) => {
      const v = Number(String(row[i] ?? '').replace(/[,¥$]/g, ''))
      if (!Number.isNaN(v) && row[i] !== undefined) {
        const acc = numeric[h] ?? { sum: 0, count: 0, min: v, max: v }
        acc.sum += v; acc.count++; acc.min = Math.min(acc.min, v); acc.max = Math.max(acc.max, v)
        numeric[h] = acc
      }
    })
  }
  const parts = Object.entries(numeric).map(([h, a]) =>
    `${h}: 合计 ${a.sum.toLocaleString()} · 平均 ${(a.sum / a.count).toFixed(1)} · 范围 ${a.min}~${a.max}`)
  return parts.join('\n')
}

export const tools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_csv',
      description: '读取工作空间内的 CSV 文件并解析。返回表头、行数与数值列汇总（合计/平均/范围）。文件路径相对工作空间，如 "sales.csv" 或 "data/report.csv"。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'CSV 文件路径（相对工作空间）' },
        },
        required: ['path'],
      },
    },
  },
]

export function createHandlers(ctxProvider: () => Context) {
  return {
    read_csv: async (args: Record<string, unknown>): Promise<unknown> => {
      const path = String(args.path ?? '')
      if (!path || path.includes('..')) return { ok: false, error: '路径非法（禁止 ..）' }
      const ctx = ctxProvider() as AppCtx
      // **工作目录解析修复（2026-08——read_csv 失败根因）**：三层模型
      // 部门 = 工作目录——旧实现 join(wsRoot, appId, path)（**appId 错**）
      // ——文件实际在 {wsRoot}/{department_id}/——「文件不存在: 订单.csv」
      // 完全吻合（AI 被迫走 bash ls+cat+python 兜底——4 步流程）——
      // 用 _toolDepartmentId（agent-runner 工具上下文注入）+ 复用
      // resolveDepartmentWorkspace（单一实现源——支持自定义路径/默认）
      const deptId = String((ctx as any)._toolDepartmentId ?? '')
      if (!deptId) return { ok: false, error: '无部门上下文' }
      const { resolveDepartmentWorkspace } = await import('../../../src/middleware/workspace.ts')
      const [dept] = await ctx.sql`SELECT workspace_path FROM departments WHERE id = ${deptId}`
      const ws = await resolveDepartmentWorkspace(deptId, dept?.workspace_path ?? null, true)
      if (!ws) return { ok: false, error: '工作目录不可用' }
      const file = join(ws, path)
      if (!existsSync(file)) return { ok: false, error: `文件不存在: ${path}` }
      const text = readFileSync(file, 'utf-8').slice(0, 200_000)
      const rows = parseCsv(text)
      if (rows.length === 0) return { ok: false, error: '空文件或无有效行' }
      const header = rows[0]
      const summary = summarize(rows, header)
      return {
        ok: true,
        headers: header,
        rowCount: rows.length - 1,
        preview: rows.slice(1, 6),
        summary,
      }
    },
  }
}
