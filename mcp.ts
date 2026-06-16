/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
/**
 * MCP (Model Context Protocol) client for weifuwu.
 *
 * Spawns MCP server subprocesses (stdio JSON-RPC) and exposes their tools
 * as AI SDK `Tool` objects that can be passed to `agent()` or `opencode()`.
 *
 * ```ts
 * import { mcpClient } from 'weifuwu'
 * import { agent } from 'weifuwu'
 *
 * const fsMcp = mcpClient({
 *   command: 'npx',
 *   args: ['@modelcontextprotocol/server-filesystem', '/workspace'],
 * })
 *
 * const tools = await fsMcp.getTools()
 * const a = agent({ pg, provider, tools })
 * ```
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { z } from 'zod'

// ── Types ───────────────────────────────────────────────────────────────────

export interface MCPClientOptions {
  /** Command to spawn (e.g. 'npx', 'node', 'uvx'). */
  command: string
  /** Arguments passed to the command. */
  args?: string[]
  /** Environment variables (merged with process.env). */
  env?: Record<string, string>
  /** How long to wait for handshake/response (ms). Default: 15_000. */
  timeout?: number
  /** Max tool response body size in bytes. Default: 10MB. */
  maxResponseSize?: number
}

/** A tool definition from an MCP server. */
export interface MCPToolDef {
  name: string
  description?: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/** MCP client — spawns and manages a single MCP server subprocess. */
export interface MCPClient {
  /** Fetch tool definitions from the server and return AI SDK Tool objects. */
  getTools(): Promise<Record<string, unknown>>
  /** Refresh tool definitions (re-call tools/list). */
  refresh(): Promise<void>
  /** Call a tool by name. Returns the raw result from the MCP server. */
  callTool(name: string, args: unknown): Promise<unknown>
  /** Shutdown the MCP server and release resources. */
  close(): Promise<void>
}

// ── JSON-RPC helpers ────────────────────────────────────────────────────────

let _requestId = 0

function nextId(): number {
  return ++_requestId
}

function createRequest(id: number, method: string, params?: unknown) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params,
  })
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function mcpClient(options: MCPClientOptions): MCPClient {
  const { command, args = [], env } = options
  const timeout = options.timeout ?? 15_000
  const maxResponseSize = options.maxResponseSize ?? 10 * 1024 * 1024

  let proc: ChildProcess | null = null
  let rl: ReturnType<typeof createInterface> | null = null

  // Pending JSON-RPC requests: id → { resolve, reject, timer }
  const pending = new Map<
    number,
    {
      resolve: (v: unknown) => void
      reject: (e: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  // Cached tool definitions
  let _tools: Record<string, unknown> | null = null

  // ── Start subprocess ────────────────────────────────────────────────────
  function ensureProcess(): void {
    if (proc && !proc.killed) return

    proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    })

    rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity })

    // Buffer partial JSON lines
    let buffer = ''

    rl.on('line', (line: string) => {
      // Server may emit multiple JSON-RPC messages per line or split across lines
      buffer += line
      try {
        const msg = JSON.parse(buffer)
        buffer = ''
        handleMessage(msg)
      } catch {
        // Incomplete JSON — wait for more data
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      // MCP servers may log to stderr; we ignore by default
      const text = chunk.toString().trim()
      if (text) {
        console.debug(`[mcp:${command}] stderr:`, text)
      }
    })

    proc.on('exit', (code, signal) => {
      console.debug(`[mcp:${command}] exited (code=${code} signal=${signal})`)
      // Reject all pending requests
      for (const [id, { reject, timer }] of pending) {
        clearTimeout(timer)
        reject(new Error(`MCP server exited (code=${code} signal=${signal})`))
        pending.delete(id)
      }
      proc = null
      rl = null
    })

    proc.on('error', (err) => {
      console.error(`[mcp:${command}] error:`, err.message)
      for (const [, { reject, timer }] of pending) {
        clearTimeout(timer)
        reject(err)
      }
      pending.clear()
    })
  }

  // ── Message dispatch ────────────────────────────────────────────────────
  function handleMessage(msg: any): void {
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id)!
      clearTimeout(timer)
      pending.delete(msg.id)

      if (msg.error) {
        reject(new Error(`MCP error: ${JSON.stringify(msg.error)}`))
      } else {
        resolve(msg.result)
      }
    }
    // Ignore notifications (no id)
  }

  // ── Send JSON-RPC request ───────────────────────────────────────────────
  function sendRequest(method: string, params?: unknown): Promise<unknown> {
    ensureProcess()

    const id = nextId()
    const body = createRequest(id, method, params)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`MCP request "${method}" timed out after ${timeout}ms`))
      }, timeout)

      pending.set(id, { resolve, reject, timer })

      if (proc?.stdin?.writable) {
        proc.stdin.write(body + '\n')
      } else {
        clearTimeout(timer)
        pending.delete(id)
        reject(new Error('MCP server stdin not available'))
      }
    })
  }

  // ── Initialize connection ──────────────────────────────────────────────
  async function initialize(): Promise<void> {
    ensureProcess()
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'weifuwu', version: '0.25.0' },
    })
    // Send initialized notification (fire-and-forget)
    try {
      if (proc?.stdin?.writable) {
        proc.stdin.write(
          JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
        )
      }
    } catch {
      // Ignore notification errors
    }
  }

  // ── Convert MCP schema to Zod schema ────────────────────────────────────
  function mcpSchemaToZod(inputSchema?: MCPToolDef['inputSchema']): z.ZodObject<any> {
    if (!inputSchema || !inputSchema.properties) {
      return z.object({})
    }

    const shape: Record<string, z.ZodTypeAny> = {}
    const required = new Set(inputSchema.required ?? [])

    for (const [key, prop] of Object.entries(inputSchema.properties)) {
      const p = prop as Record<string, unknown>
      let field: z.ZodTypeAny

      switch (p.type) {
        case 'string':
          field = z.string()
          break
        case 'number':
          field = z.number()
          break
        case 'integer':
          field = z.number().int()
          break
        case 'boolean':
          field = z.boolean()
          break
        case 'array':
          field = z.array(z.any())
          break
        case 'object':
          field = z.record(z.string(), z.any())
          break
        default:
          field = z.any()
      }

      if (p.description) {
        field = field.describe(p.description as string)
      }

      if (!required.has(key)) {
        field = field.optional()
      }

      shape[key] = field
    }

    return z.object(shape)
  }

  // ── Public API ──────────────────────────────────────────────────────────
  async function refresh(): Promise<void> {
    _tools = null
    await getTools()
  }

  async function getTools(): Promise<Record<string, unknown>> {
    if (_tools) return _tools

    await initialize()

    const result = (await sendRequest('tools/list')) as { tools: MCPToolDef[] } | undefined
    const defs = result?.tools ?? []

    const tools: Record<string, unknown> = {}
    for (const def of defs) {
      const paramsSchema = mcpSchemaToZod(def.inputSchema)
      tools[def.name] = {
        description: def.description ?? 'MCP tool: ' + def.name,
        parameters: paramsSchema,
        execute: async (args: Record<string, unknown>) => {
          const raw = await callToolInternal(def.name, args)
          return raw
        },
      }
    }

    _tools = tools
    return tools
  }

  async function callToolInternal(name: string, args: unknown): Promise<unknown> {
    const result = await sendRequest('tools/call', {
      name,
      arguments: args,
    })

    // MCP tool responses are an array of content items (text, images, resources, etc.)
    const content = (result as any)?.content
    if (Array.isArray(content)) {
      // Concatenate text content items
      const textParts = content.filter((c: any) => c.type === 'text').map((c: any) => c.text ?? '')
      if (textParts.length > 0) {
        let combined = textParts.join('\n')
        if (combined.length > maxResponseSize) {
          combined = combined.slice(0, maxResponseSize) + '\n... [truncated]'
        }
        return combined
      }
      // Return resource content if no text
      const resourceParts = content.filter((c: any) => c.type === 'resource')
      if (resourceParts.length > 0) {
        return resourceParts
      }
      // Return raw content array
      return content
    }

    return result
  }

  async function callTool(name: string, args: unknown): Promise<unknown> {
    return callToolInternal(name, args)
  }

  async function close(): Promise<void> {
    try {
      await sendRequest('shutdown')
    } catch {
      // Ignore shutdown errors
    }

    if (proc && !proc.killed) {
      proc.kill('SIGTERM')
      // Force kill after 3 seconds
      setTimeout(() => {
        if (proc && !proc.killed) {
          try {
            proc.kill('SIGKILL')
          } catch {
            // Already dead
          }
        }
      }, 3000)
    }

    for (const [, { reject, timer }] of pending) {
      clearTimeout(timer)
      reject(new Error('MCP client closed'))
    }
    pending.clear()
    proc = null
    rl = null
  }

  return {
    getTools,
    refresh,
    callTool,
    close,
  }
}
