/**
 * 工作空间工具集 — read/write/edit/grep/list_files/bash
 *
 * 三层模型（2026-12）：部门 = 工作目录，sandbox = 计算资源，agent = 能力。
 * 安全边界 = Docker 沙盒容器：所有工具操作经容器内 Go sandbox-agent（exec 子命令）执行
 * （agent 看到统一的容器内 /ws 视图；路径穿越即使有 bug 也逃不出卷挂载——纵深防御）
 * 宿主侧只做参数透传 + 容器调用（经 SandboxManager——DB 驱动生命周期），不再直接 fs/bash
 */

import { resolve } from 'node:path'
import type { ToolDefinition } from '../ai/types.ts'
import { manager } from '../sandbox/manager.ts'

// ── 工具定义 ───────────────────────────────────────────────

// 提示词引导（体验关键）：/ws 是唯一持久位置
const WS_GUIDE = '工作目录为 /ws（沙盒卷挂载）——所有文件/依赖放这里（容器重建后保留）；容器根目录为瞬态不保留。'

export const WORKSPACE_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read',
      description: `读取文件内容。使用相对路径（相对于工作空间根目录 /ws）。${WS_GUIDE}`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对工作空间根目录）' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: `写入或创建文件。使用相对路径（相对于工作空间根目录 /ws）。${WS_GUIDE}`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对工作空间根目录）' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: `对文件进行精确文本替换。使用相对路径。${WS_GUIDE}`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对工作空间根目录）' },
          oldText: { type: 'string', description: '被替换的精确文本段' },
          newText: { type: 'string', description: '替换后的新文本' },
        },
        required: ['path', 'oldText', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: '在文件中搜索文本。使用相对路径。支持按目录递归搜索。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索模式（普通文本，非正则）' },
          path: { type: 'string', description: '文件或目录路径（相对工作空间根目录），默认搜索全部' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出目录内容。使用相对路径。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径（相对工作空间根目录），默认根目录' },
        },
      },
    },
  },
]

export const BASH_TOOL_DEF: ToolDefinition = {
  type: 'function',
  function: {
    name: 'bash',
    description: '在工作空间目录 /ws 中执行 shell 命令。支持运行脚本、编译、测试等。超时 30 秒，输出上限 100KB。' +
      '沙盒默认无网络（--network none）——npm install/curl 等网络命令会失败；如需网络请管理员在 Agent 配置开启 allow_network。' +
      '所有文件/依赖放 /ws（容器重建后保留）；容器根目录为瞬态不保留。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令（工作目录 /ws）' },
        description: { type: 'string', description: '命令的目的说明（仅用于日志）' },
      },
      required: ['command'],
    },
  },
}

// ── Handler 工厂（S4/S5：参数透传 + 容器调用） ─────────────

/**
 * 创建工作空间工具的 handlers（全部经沙盒容器执行——归属部门）
 * @param workspace 工作空间根目录绝对路径（宿主——容器卷挂载源；部门级）
 * @param allowCommandExec 是否允许 bash 执行
 * @param departmentId 部门 UUID（sandbox 记录归属/容器命名）
 * @param allowNetwork 是否允许网络（--network bridge）
 */
export function createWorkspaceHandlers(
  workspace: string,
  allowCommandExec: boolean,
  departmentId: string,
  allowNetwork?: boolean,
): Record<string, (args: Record<string, unknown>) => Promise<string>> {
  const ws = resolve(workspace)

  // 容器内工具执行（统一入口——经 SandboxManager：查/建记录 → ensure → exec）
  const runInSandbox = async (tool: string, args: Record<string, unknown>): Promise<string> => {
    // exec 超时分级：浏览器任务（agent-browser——open 挂起实测）→ 120s——
    // 轻量命令（bash/文件）→ 默认 35s（docker 层按工具分类）
    const isBrowserTask = tool.includes('agent-browser') || tool.includes('browser') || tool.includes('ab_')
    const r = await manager.runTool(departmentId, ws, tool, args, { network: allowNetwork, execTimeoutMs: isBrowserTask ? 120_000 : undefined })
    if (r.ok) return r.output ?? ''
    // B1-b（2026-08）：r.ok=false → **抛错**（此前返回字符串“沙盒错误: …”——
    // 框架层工具 run 只见字符串=成功——ok:false 协议断裂——前端永远显示完成——
    // 工具失败不可观测——抛错让框架层 wf:tool_result 标 ok:false + error 透传）
    throw new Error(r.error ?? `工具执行失败: ${tool}`)
  }

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    read: (a) => runInSandbox('read', a),
    write: (a) => runInSandbox('write', a),
    edit: (a) => runInSandbox('edit', a),
    grep: (a) => runInSandbox('grep', a),
    list_files: (a) => runInSandbox('list_files', a),
  }

  if (allowCommandExec) {
    handlers.bash = (a) => runInSandbox('bash', a)
  }

  return handlers
}

/**
 * 获取工作空间工具的全部 ToolDefinition
 */
export function getWorkspaceToolDefs(allowCommandExec: boolean): ToolDefinition[] {
  const defs = [...WORKSPACE_TOOL_DEFS]
  if (allowCommandExec) {
    defs.push(BASH_TOOL_DEF)
  }
  return defs
}
