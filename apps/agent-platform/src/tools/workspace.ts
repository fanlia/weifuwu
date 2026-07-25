/**
 * 工作空间工具集 — read/write/edit/grep/list_files/bash
 *
 * 所有文件操作限制在 workspace_path 范围内（禁止 `../` 跳出）
 * bash 执行需要 allow_command_exec = true
 * 全部使用异步 I/O，不阻塞事件循环（符合 PS-01）
 */

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises'
import { join, relative, resolve, normalize, sep, dirname } from 'node:path'
import { exec } from 'node:child_process'
import type { ToolDefinition } from '../ai/types.ts'

// ── 工具定义 ───────────────────────────────────────────────

export const WORKSPACE_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read',
      description: '读取文件内容。使用相对路径（相对于工作空间根目录）。',
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
      description: '写入或创建文件。使用相对路径（相对于工作空间根目录）。',
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
      description: '对文件进行精确文本替换。使用相对路径。',
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
    description: '在工作空间目录中执行 shell 命令。支持运行脚本、编译、测试等。超时 30 秒，输出上限 100KB。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        description: { type: 'string', description: '命令的目的说明（仅用于日志）' },
      },
      required: ['command'],
    },
  },
}

// ── 安全校验 ───────────────────────────────────────────────

/** 高危命令模式列表 */
const DANGEROUS_PATTERNS = [
  /^sudo\s/, /^su\s/, /chmod\s+777/, /chown\b/,
  /\s+>\s+\/dev\//, /\s+>\s+\/etc\//,
]

/**
 * 将相对路径解析为工作空间内的绝对路径
 * 检查路径是否跳出工作空间（路径穿越攻击防护）
 */
function resolveWorkspacePath(workspace: string, relPath: string): string {
  const resolved = resolve(join(workspace, relPath))
  const normalized = normalize(resolved)
  const wsNormalized = normalize(resolve(workspace))

  if (!normalized.startsWith(wsNormalized + sep) && normalized !== wsNormalized) {
    throw new Error(`路径 "${relPath}" 超出了工作空间范围`)
  }
  return normalized
}

// ── Helper: 用 Promise 包装 exec ──────────────────────────

function execAsync(
  command: string,
  options: { cwd: string; timeout: number; maxBuffer: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      cwd: options.cwd,
      timeout: options.timeout,
      maxBuffer: options.maxBuffer,
      env: { ...process.env, PATH: process.env.PATH! },
    }, (error, stdout, stderr) => {
      if (error) {
        // 超时或其他错误
        reject(error)
      } else {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' })
      }
    })
  })
}

// ── Handler 工厂 ───────────────────────────────────────────

/**
 * 创建工作空间工具的 handlers
 * @param workspace 工作空间根目录绝对路径
 * @param allowCommandExec 是否允许 bash 执行
 */
export function createWorkspaceHandlers(
  workspace: string,
  allowCommandExec: boolean,
): Record<string, (args: Record<string, unknown>) => Promise<string>> {
  const ws = resolve(workspace)

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {

    // ── read ────────────────────────────────────────────
    read: async (args: Record<string, unknown>) => {
      const relPath = String(args.path ?? '')
      if (!relPath) return '请提供文件路径'
      let absPath: string
      try {
        absPath = resolveWorkspacePath(ws, relPath)
      } catch (err: any) {
        return `读取失败: ${err.message}`
      }
      try {
        const content = await readFile(absPath, 'utf-8')
        if (content.length === 0) return '(空文件)'
        const maxLen = 50000
        if (content.length > maxLen) {
          return content.slice(0, maxLen) + `\n\n... (文件过长，截断至 ${maxLen} 字符，总长 ${content.length})`
        }
        return content
      } catch (err: any) {
        return `读取失败: ${err.message}`
      }
    },

    // ── write ───────────────────────────────────────────
    write: async (args: Record<string, unknown>) => {
      const relPath = String(args.path ?? '')
      const content = String(args.content ?? '')
      if (!relPath) return '请提供文件路径'
      let absPath: string
      try {
        absPath = resolveWorkspacePath(ws, relPath)
      } catch (err: any) {
        return `写入失败: ${err.message}`
      }

      try {
        await mkdir(dirname(absPath), { recursive: true })
        await writeFile(absPath, content, 'utf-8')
        return `已写入 ${relPath} (${content.length} 字符)`
      } catch (err: any) {
        return `写入失败: ${err.message}`
      }
    },

    // ── edit ────────────────────────────────────────────
    edit: async (args: Record<string, unknown>) => {
      const relPath = String(args.path ?? '')
      const oldText = String(args.oldText ?? '')
      const newText = String(args.newText ?? '')
      if (!relPath || !oldText) return '请提供文件路径和 oldText'
      let absPath: string
      try {
        absPath = resolveWorkspacePath(ws, relPath)
      } catch (err: any) {
        return `编辑失败: ${err.message}`
      }

      try {
        const content = await readFile(absPath, 'utf-8')
        const idx = content.indexOf(oldText)
        if (idx === -1) return '未找到匹配的 oldText，请精确匹配'
        const newContent = content.replace(oldText, newText)
        await writeFile(absPath, newContent, 'utf-8')
        return `已编辑 ${relPath} (替换了 ${oldText.length} → ${newText.length} 字符)`
      } catch (err: any) {
        return `编辑失败: ${err.message}`
      }
    },

    // ── grep ────────────────────────────────────────────
    grep: async (args: Record<string, unknown>) => {
      const pattern = String(args.pattern ?? '')
      const relPath = args.path ? String(args.path) : '.'
      if (!pattern) return '请提供搜索模式'
      let absPath: string
      try {
        absPath = resolveWorkspacePath(ws, relPath)
      } catch (err: any) {
        return `搜索失败: ${err.message}`
      }

      try {
        const results: Array<{ file: string; line: number; text: string }> = []

        async function searchFile(filePath: string, relToWs: string) {
          try {
            const content = await readFile(filePath, 'utf-8')
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(pattern)) {
                results.push({ file: relToWs, line: i + 1, text: lines[i].trim().slice(0, 200) })
              }
            }
          } catch { /* 跳过无法读取的文件 */ }
        }

        async function searchDir(dirPath: string, relToWs: string) {
          try {
            const entries = await readdir(dirPath, { withFileTypes: true })
            for (const entry of entries) {
              const fullPath = join(dirPath, entry.name)
              const relPath2 = join(relToWs, entry.name)
              if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                  await searchDir(fullPath, relPath2)
                }
              } else if (entry.isFile()) {
                await searchFile(fullPath, relPath2)
              }
            }
          } catch { /* 跳过 */ }
        }

        const st = await stat(absPath)
        if (st.isDirectory()) {
          await searchDir(absPath, relPath === '.' ? '' : relPath)
        } else {
          await searchFile(absPath, relPath)
        }

        if (results.length === 0) return '未找到匹配'
        const top10 = results.slice(0, 10)
        let output = top10.map(r => `${r.file}:${r.line} | ${r.text}`).join('\n')
        if (results.length > 10) {
          output += `\n... 还有 ${results.length - 10} 处匹配`
        }
        return output
      } catch (err: any) {
        return `搜索失败: ${err.message}`
      }
    },

    // ── list_files ──────────────────────────────────────
    list_files: async (args: Record<string, unknown>) => {
      const relPath = args.path ? String(args.path) : '.'
      let absPath: string
      try {
        absPath = resolveWorkspacePath(ws, relPath)
      } catch (err: any) {
        return `列出目录失败: ${err.message}`
      }
      try {
        const entries = await readdir(absPath, { withFileTypes: true })
        const items: string[] = []

        for (const entry of entries) {
          const fullPath = join(absPath, entry.name)
          if (entry.isDirectory()) {
            items.push(`📁 ${entry.name}/`)
          } else {
            try {
              const st = await stat(fullPath)
              const sizeStr = st.size > 1024 ? `${(st.size / 1024).toFixed(1)}KB` : `${st.size}B`
              items.push(`📄 ${entry.name} (${sizeStr})`)
            } catch {
              items.push(`📄 ${entry.name}`)
            }
          }
        }

        items.sort()
        if (items.length === 0) return '(空目录)'
        return items.join('\n')
      } catch (err: any) {
        return `列出目录失败: ${err.message}`
      }
    },
  }

  // ── bash（可选） ──────────────────────────────────────
  if (allowCommandExec) {
    handlers.bash = async (args: Record<string, unknown>) => {
      const command = String(args.command ?? '')
      if (!command) return '请提供命令'

      // 高危命令检查
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
          return `命令包含高危操作 "${pattern.source}"，已拒绝执行`
        }
      }

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: ws,
          timeout: 30000,
          maxBuffer: 100 * 1024,
        })
        const output = (stdout ?? '').trim()
        const errOutput = (stderr ?? '').trim()

        let result = ''
        if (output) {
          const maxOutput = 10000
          result += output.length > maxOutput
            ? output.slice(0, maxOutput) + `\n... (输出过长，截断至 ${maxOutput} 字符，总长 ${output.length})`
            : output
        }
        if (errOutput) {
          result += result ? `\n\n--- stderr ---\n${errOutput}` : errOutput
        }
        return result || '命令执行成功（无输出）'
      } catch (err: any) {
        if (err.killed) return '命令执行超时（30s）'
        return `命令执行失败: ${err.stderr ?? err.message}`
      }
    }
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
