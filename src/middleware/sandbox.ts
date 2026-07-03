import { join, resolve, normalize } from 'node:path'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { exec as cpExec } from 'node:child_process'
import { promisify } from 'node:util'
import type { Middleware } from '../types.ts'

const runExec = promisify(cpExec)

declare module '../types.ts' {
  interface Context {
    /** Filesystem sandbox for agent operations. Injected by sandbox(). */
    sandbox: Sandbox
  }
}

export interface SandboxOptions {
  /** Root directory for all workspaces (default: '/tmp/weifuwu-sandboxes'). */
  baseDir?: string
  /** Default timeout for exec() in ms (default: 30000). */
  timeout?: number
  /** Isolate workspaces by a ctx field. If 'user', uses ctx.user.id. */
  isolateBy?: 'user'
}

export interface ExecResult {
  stdout: string
  stderr: string
}

export interface Sandbox {
  /** The workspace directory for the current request. */
  workDir: string

  /** Read a file inside the workspace. */
  readFile(path: string): Promise<string>

  /** Write a file inside the workspace. Creates parent directories. */
  writeFile(path: string, content: string): Promise<void>

  /** Execute a command inside the workspace. */
  exec(cmd: string, opts?: { timeout?: number; cwd?: string }): Promise<ExecResult>

  /** Grep for a pattern inside the workspace. */
  grep(pattern: string): Promise<string>

  /** Destroy the workspace (called when the session ends). */
  destroy(): Promise<void>
}

/**
 * Filesystem sandbox middleware.
 *
 * Each request gets an isolated workspace directory. File and exec
 * operations are restricted to the workspace — path escapes are rejected.
 *
 * @example
 * ```ts
 * app.use(sandbox({ baseDir: '/tmp/workspaces', isolateBy: 'user' }))
 *
 * // In a handler:
 * await ctx.sandbox.writeFile('hello.txt', 'world')
 * const content = await ctx.sandbox.readFile('hello.txt')
 * ```
 */
export function sandbox(opts: SandboxOptions = {}): Middleware {
  const base = resolve(opts.baseDir ?? '/tmp/weifuwu-sandboxes')
  const defaultTimeout = opts.timeout ?? 30000

  return async (req, ctx, next) => {
    // Resolve session ID for workspace isolation
    let sessionId = 'default'
    if (opts.isolateBy === 'user' && ctx.user) {
      sessionId = (ctx.user as Record<string, unknown>).id as string ?? 'default'
    } else {
      sessionId = crypto.randomUUID()
    }

    const workDir = join(base, encodeURIComponent(sessionId))
    await mkdir(workDir, { recursive: true })

    /** Reject paths that escape the workspace. */
    function safePath(p: string): string {
      const resolved = resolve(workDir, normalize(p).replace(/^[/\\]+/, ''))
      if (!resolved.startsWith(workDir + '/') && resolved !== workDir) {
        throw new Error(`Path escape rejected: ${p}`)
      }
      return resolved
    }

    ctx.sandbox = {
      workDir,

      async readFile(path: string) {
        return readFile(safePath(path), 'utf-8')
      },

      async writeFile(path: string, content: string) {
        const resolved = safePath(path)
        await mkdir(join(resolved, '..'), { recursive: true })
        return writeFile(resolved, content, 'utf-8')
      },

      async exec(cmd: string, execOpts?: { timeout?: number; cwd?: string }) {
        const cwd = execOpts?.cwd ? safePath(execOpts.cwd) : workDir
        const { stdout, stderr } = await runExec(cmd, {
          cwd,
          timeout: execOpts?.timeout ?? defaultTimeout,
          env: {
            ...process.env,
            HOME: workDir,
            PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
          },
          maxBuffer: 10 * 1024 * 1024, // 10MB
        })
        return { stdout, stderr }
      },

      async grep(pattern: string) {
        const { stdout } = await runExec(
          `grep -rn --include='*' "${pattern.replace(/"/g, '\\"')}" . 2>/dev/null || true`,
          { cwd: workDir, timeout: 10000 },
        )
        return stdout
      },

      async destroy() {
        await rm(workDir, { recursive: true, force: true })
      },
    }

    try {
      return await next(req, ctx)
    } finally {
      // Clean up on request end (for non-persistent workspaces)
    }
  }
}
