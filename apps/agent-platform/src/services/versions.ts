/**
 * Agent 版本管理服务（Wave 9——配置快照/回滚）
 *
 * 快照字段：system_prompt/model/temperature/max_tokens/tools/workspace_path/
 * allow_file_tools/allow_command_exec/allow_network/monthly_token_quota。
 * 回滚：从快照恢复配置（不删版本历史）。
 */

import type { AppCtx } from '../middleware/ctx.ts'

/** 保存当前配置为版本（自动递增 version） */
export async function saveVersion(ctx: AppCtx, agentId: string, note?: string): Promise<{ id: string; version: number } | null> {
  const { sql } = ctx
  const [agent] = await sql`
    SELECT system_prompt, model, temperature, max_tokens, tools, workspace_path,
      allow_file_tools, allow_command_exec, allow_network, monthly_token_quota, name
    FROM agents WHERE id = ${agentId} AND app_id = ${ctx.appId}
  `
  if (!agent) return null
  const snapshot = {
    system_prompt: agent.system_prompt,
    model: agent.model,
    temperature: agent.temperature,
    max_tokens: agent.max_tokens,
    tools: agent.tools,
    workspace_path: agent.workspace_path,
    allow_file_tools: agent.allow_file_tools,
    allow_command_exec: agent.allow_command_exec,
    allow_network: agent.allow_network,
    monthly_token_quota: agent.monthly_token_quota,
  }
  const [maxRow] = await sql`SELECT COALESCE(MAX(version), 0)::int AS max_v FROM agent_versions WHERE agent_id = ${agentId}`
  const nextVersion = Number((maxRow as any)?.max_v ?? 0) + 1
  const [row] = await sql`
    INSERT INTO agent_versions (agent_id, app_id, version, snapshot, note)
    VALUES (${agentId}, ${ctx.appId}, ${nextVersion}, ${JSON.stringify(snapshot)}, ${note ?? `版本 ${nextVersion}`})
    RETURNING id, version
  `
  return { id: String(row.id), version: nextVersion }
}

/** 版本列表 */
export async function listVersions(ctx: AppCtx, agentId: string): Promise<any[]> {
  const { sql } = ctx
  const rows = await sql`
    SELECT id, version, note, snapshot, created_at
    FROM agent_versions WHERE agent_id = ${agentId} AND app_id = ${ctx.appId}
    ORDER BY version DESC LIMIT 30
  `
  return rows ?? []
}

/** 回滚到指定版本（恢复快照配置） */
export async function rollbackVersion(ctx: AppCtx, agentId: string, versionId: string): Promise<{ ok: boolean; note?: string }> {
  const { sql } = ctx
  const [ver] = await sql`
    SELECT snapshot, version FROM agent_versions
    WHERE id = ${versionId} AND agent_id = ${agentId} AND app_id = ${ctx.appId}
  `
  if (!ver) return { ok: false, note: '版本不存在' }
  const snap = ver.snapshot as Record<string, any>
  const sets = [
    'system_prompt', 'model', 'temperature', 'max_tokens', 'tools',
    'workspace_path', 'allow_file_tools', 'allow_command_exec', 'allow_network', 'monthly_token_quota',
  ]
  const assign: string[] = []
  const params: unknown[] = []
  let idx = 1
  for (const f of sets) {
    if (snap[f] !== undefined && snap[f] !== null) {
      assign.push(`${f} = $${idx++}`)
      params.push(f === 'tools' ? JSON.stringify(snap[f]) : snap[f])
    }
  }
  assign.push('updated_at = NOW()')
  await (sql as any).unsafe(
    `UPDATE agents SET ${assign.join(', ')} WHERE id = $${idx++} AND app_id = $${idx++}`,
    [...params, agentId, ctx.appId],
  )
  return { ok: true, note: `已回滚到版本 ${ver.version}` }
}
