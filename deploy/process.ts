import { fork, type ChildProcess } from 'node:child_process'

export interface ManagedProcess {
  child: ChildProcess
  port: number
}

export function forkApp(opts: {
  cwd: string
  entry: string
  port: number
  env?: Record<string, string>
  onLog?: (line: string) => void
}): ManagedProcess {
  const child = fork(opts.entry, [], {
    cwd: opts.cwd,
    env: {
      ...(process.env as Record<string, string>),
      ...opts.env,
      PORT: String(opts.port),
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  })

  child.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      opts.onLog?.(line)
    }
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      opts.onLog?.(`[error] ${line}`)
    }
  })

  return { child, port: opts.port }
}

export function stopProcess(mp: ManagedProcess, timeout = 10_000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      mp.child.kill('SIGKILL')
      resolve()
    }, timeout)
    mp.child.on('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    mp.child.kill('SIGTERM')
  })
}

export async function healthCheck(port: number, path = '/'): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(5_000),
    })
    return res.ok
  } catch {
    return false
  }
}
