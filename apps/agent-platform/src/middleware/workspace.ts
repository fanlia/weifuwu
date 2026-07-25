/**
 * ctx.workspace 中间件 — 注入工作空间信息
 *
 * 在 Agent 执行时，从 agents 表读取 workspace_path 并注入 ctx.workspace
 * 供 workspace 工具集和 agent-runner 使用
 */

import type { Context, Middleware } from 'weifuwu'

export interface WorkspaceInfo {
  /** 工作空间根目录绝对路径 */
  path: string
  /** 是否允许文件工具 */
  allowFileTools: boolean
  /** 是否允许命令执行 */
  allowCommandExec: boolean
}

// 类型扩展 — 声明 ctx.workspace
declare module 'weifuwu' {
  interface Context {
    workspace?: WorkspaceInfo
  }
}

/**
 * 工作空间中间件工厂
 *
 * 需要 ctx.tenantId 和 ctx.params.agentId
 * 通常在 agent-runner 中直接调用 loadWorkspaceInfo()，而非通过中间件链
 */
export function workspace(): Middleware<Context, Context & { workspace?: WorkspaceInfo }> {
  const mw: Middleware = (req, ctx, next) => {
    // 不在请求路径自动注入，由 agent-runner 按需调用
    return next(req, ctx)
  }
  mw.__meta = { injects: ['workspace'], depends: ['ai'] }
  return mw as Middleware<Context, Context & { workspace?: WorkspaceInfo }>
}

/**
 * 从数据库加载 Agent 的工作空间配置
 * 在 agent-runner 中调用
 */
export async function loadWorkspaceInfo(
  sql: any,
  agentId: string,
): Promise<WorkspaceInfo | null> {
  try {
    const [agent] = await sql`
      SELECT workspace_path, allow_file_tools, allow_command_exec
      FROM agents
      WHERE id = ${agentId} AND type = 'ai'
    `
    if (!agent?.workspace_path) return null
    return {
      path: agent.workspace_path,
      allowFileTools: !!agent.allow_file_tools,
      allowCommandExec: !!agent.allow_command_exec,
    }
  } catch {
    return null
  }
}
