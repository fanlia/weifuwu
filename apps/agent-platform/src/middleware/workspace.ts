/**
 * ctx.workspace 中间件 — 注入工作空间信息
 *
 * 工作空间路径解析规则：
 *   - allowFileTools=false → 无工作空间（null）
 *   - 有自定义 workspace_path → 使用自定义路径
 *   - 无自定义路径 → 使用默认 {AGENT_WORKSPACE_ROOT}/{agent_id}/
 *     自动创建目录（如 AGENT_WORKSPACE_ROOT 未设置，默认 ./data/workspaces）
 *
 * 在 Agent 执行时，由 agent-runner 调用 resolveAgentWorkspace() 获取最终路径
 */

import type { Context, Middleware } from 'weifuwu'
import { resolve, join } from 'node:path'
import { mkdir } from 'node:fs/promises'

export interface WorkspaceInfo {
  /** 工作空间根目录绝对路径 */
  path: string
  /** 是否允许文件工具 */
  allowFileTools: boolean
  /** 是否允许命令执行 */
  allowCommandExec: boolean
}

// 类型注入：不 declare module（与框架无冲突字段，但保持一致性用显式注入）
export interface WorkspaceInjected {
  workspace?: WorkspaceInfo
}

/** 默认工作空间根目录 */
const DEFAULT_ROOT = (() => {
  const env = process.env.AGENT_WORKSPACE_ROOT
  if (env) return resolve(env)
  return resolve(process.cwd(), 'data', 'workspaces')
})()

/**
 * 解析 Agent 的工作空间路径
 *
 * @param agentId Agent UUID
 * @param customPath  用户自定义路径（来自 agents.workspace_path）
 * @param allowFileTools  是否启用了文件工具
 * @returns 最终的工作空间绝对路径，或 null（无工作空间）
 */
export async function resolveAgentWorkspace(
  agentId: string,
  customPath?: string | null,
  allowFileTools?: boolean,
): Promise<string | null> {
  if (!allowFileTools) return null

  if (customPath) {
    const p = resolve(customPath)
    await mkdir(p, { recursive: true })
    return p
  }

  // 使用默认路径：{root}/{agent_id}/
  const defaultPath = join(DEFAULT_ROOT, agentId)
  await mkdir(defaultPath, { recursive: true })
  return defaultPath
}

/**
 * 获取默认工作空间根目录（用于 UI 显示提示）
 */
export function getDefaultWorkspaceRoot(): string {
  return DEFAULT_ROOT
}

/**
 * 工作空间中间件工厂（保留，暂不用于自动注入）
 */
export function workspace(): Middleware<Context, Context & { workspace?: WorkspaceInfo }> {
  const mw: Middleware = (req, ctx, next) => {
    return next(req, ctx)
  }
  mw.__meta = { injects: ['workspace'], depends: ['ai'] }
  return mw as Middleware<Context, Context & { workspace?: WorkspaceInfo }>
}
