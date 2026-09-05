/**
 * Agent 版本管理服务（Wave 9——配置快照/回滚）
 *
 * 快照字段：system_prompt/model/temperature/max_tokens/tools/workspace_path/
 * allow_file_tools/allow_command_exec/allow_network/monthly_token_quota。
 * 回滚：从快照恢复配置（不删版本历史）。
 */

import type { AppCtx } from '../middleware/ctx.ts'
import { ops, and, eq } from 'weifuwu'
import { tables } from '../db/orm.ts'

/** 保存当前配置为版本（自动递增 version） */
export async function saveVersion(ctx: AppCtx, agentId: string, note?: string): Promise<{ id: string; version: number } | null> {
  const T = tables(ctx.orm)
  const [agent] = await T.agents
    .select('name', 'description', 'system_prompt', 'model', 'temperature', 'max_tokens', 'tools', 'workspace_path',
      'allow_file_tools', 'allow_command_exec', 'allow_network', 'monthly_token_quota')
    .where(and(eq(T.agents.c.id, agentId), eq(T.agents.c.app_id, ctx.appId)))
    .run()
  if (!agent) return null
  const snapshot = {
    name: agent.name,
    description: agent.description,
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
  const [maxRow] = await T.agent_versions
    .select('version')
    .where(eq(T.agent_versions.c.agent_id, agentId))
    .orderBy('version', 'desc')
    .limit(1)
    .run()
  const nextVersion = Number((maxRow as any)?.version ?? 0) + 1
  const [row] = await T.agent_versions
    .insert({
      agent_id: agentId,
      app_id: ctx.appId,
      version: nextVersion,
      snapshot,
      note: note ?? `版本 ${nextVersion}`,
    })
    .returning('id', 'version')
    .run()
  return { id: String(row.id), version: nextVersion }
}

/** 版本列表 */
export async function listVersions(ctx: AppCtx, agentId: string): Promise<any[]> {
  const T = tables(ctx.orm)
  const rows = await T.agent_versions
    .select('id', 'version', 'note', 'snapshot', 'created_at')
    .where(and(eq(T.agent_versions.c.agent_id, agentId), eq(T.agent_versions.c.app_id, ctx.appId)))
    .orderBy('version', 'desc')
    .limit(30)
    .run()
  return rows ?? []
}

/** 回滚到指定版本（恢复快照配置——null 也恢复 = 完全回到快照） */
export async function rollbackVersion(ctx: AppCtx, agentId: string, versionId: string): Promise<{ ok: boolean; note?: string }> {
  const T = tables(ctx.orm)
  const [ver] = await T.agent_versions
    .select('snapshot', 'version')
    .where(and(
      eq(T.agent_versions.c.id, versionId),
      eq(T.agent_versions.c.agent_id, agentId),
      eq(T.agent_versions.c.app_id, ctx.appId),
    ))
    .run()
  if (!ver) return { ok: false, note: '版本不存在' }
  const snap = ver.snapshot as Record<string, any>
  const sets = [
    'name', 'description', 'system_prompt', 'model', 'temperature', 'max_tokens', 'tools',
    'workspace_path', 'allow_file_tools', 'allow_command_exec', 'allow_network', 'monthly_token_quota',
  ]
  const patch: Record<string, unknown> = { updated_at: ops.now() }
  for (const f of sets) {
    if (snap[f] !== undefined) patch[f] = snap[f] // W3: snapshot 入库恒对象（versions 自己存）——tools 容错删除
  }
  await T.agents
    .update(patch)
    .where(and(eq(T.agents.c.id, agentId), eq(T.agents.c.app_id, ctx.appId)))
    .run()
  return { ok: true, note: `已回滚到版本 ${ver.version}` }
}
