/**
 * Docker 沙盒执行器 — agent 级常驻容器池（S1/S2/S6/S7）
 *
 * 架构：状态在宿主 workspace 卷（data/workspaces/{agent_id}/）→ bind mount 到容器 /ws
 *       agent 的一切工具操作（read/write/edit/grep/list_files/bash）经容器执行
 * 生命周期：heartbeat 空闲回收（SANDBOX_IDLE_TIMEOUT 默认 600s）+ 池上限 LRU 驱逐
 *           （SANDBOX_MAX_CONTAINERS 默认 20）+ 惰性重建 + 孤儿清理
 * 诚实裁剪：docker 不可用 / 镜像缺失 → 工具返回「沙盒不可用」（绝不静默回退宿主）
 */

import { execFile, spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface SandboxOptions {
  /** 容器镜像（默认 node:24） */
  image: string
  /** 空闲回收超时（ms）——超过无 heartbeat 销毁容器 */
  idleTimeoutMs: number
  /** 池上限——超限 LRU 驱逐最旧容器 */
  maxContainers: number
  /** 回收扫描间隔（ms） */
  reaperIntervalMs: number
  /** persistent（agent 级常驻，默认）| ephemeral（每次调用一次性容器） */
  mode: 'persistent' | 'ephemeral'
  /** 单次命令超时（ms） */
  execTimeoutMs: number
  /** 是否启用（SANDBOX_DISABLE=1 禁用） */
  enabled: boolean
  /** 工具执行器脚本路径（挂载进容器 /opt/sandbox/tool-runner.js） */
  runnerPath: string
}

export interface ExecResult {
  ok: boolean
  output?: string
  error?: string
  exitCode?: number
  timedOut?: boolean
}

export interface SandboxStatus {
  available: boolean
  enabled: boolean
  imageReady: boolean
  mode: SandboxOptions['mode']
  poolSize: number
  maxContainers: number
}

const DEFAULT_OPTIONS: SandboxOptions = {
  image: process.env.SANDBOX_IMAGE ?? 'node:24',
  idleTimeoutMs: Number(process.env.SANDBOX_IDLE_TIMEOUT ?? 600) * 1000,
  maxContainers: Number(process.env.SANDBOX_MAX_CONTAINERS ?? 20),
  reaperIntervalMs: 60_000,
  mode: (process.env.SANDBOX_MODE ?? 'persistent') === 'ephemeral' ? 'ephemeral' : 'persistent',
  execTimeoutMs: 35_000,
  enabled: process.env.SANDBOX_DISABLE !== '1',
  runnerPath: resolve(__dirname, 'tool-runner.js'),
}

const CONTAINER_PREFIX = 'ap-sandbox-'

function containerName(agentId: string): string {
  return CONTAINER_PREFIX + agentId
}

/** 执行 docker CLI，返回 { stdout, stderr, exitCode }——args 数组避免 shell 注入 */
function dockerCli(args: string[], timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    execFile('docker', args, { timeout: timeoutMs ?? 15_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const exitCode = err ? (err as any).code ?? 1 : 0
      resolvePromise({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode })
    })
  })
}

export class DockerSandbox {
  private opts: SandboxOptions
  /** agentId → 最后使用时间戳（heartbeat） */
  private lastUsed = new Map<string, number>()
  private reaper: NodeJS.Timeout | null = null
  private availability: { dockerOk: boolean; imageOk: boolean } | null = null

  constructor(options?: Partial<SandboxOptions>) {
    this.opts = { ...DEFAULT_OPTIONS, ...options }
  }

  // ── 探测（S2）─────────────────────────────────────────

  async probe(): Promise<{ dockerOk: boolean; imageOk: boolean }> {
    if (!this.opts.enabled) {
      this.availability = { dockerOk: false, imageOk: false }
      return this.availability
    }
    const docker = await dockerCli(['version', '--format', '{{.Server.Version}}'], 10_000)
    const dockerOk = docker.exitCode === 0
    let imageOk = false
    if (dockerOk) {
      const img = await dockerCli(['image', 'inspect', this.opts.image, '--format', '{{.Id}}'], 10_000)
      imageOk = img.exitCode === 0
    }
    this.availability = { dockerOk, imageOk }
    return this.availability
  }

  /** 确保镜像存在（首次调用自动拉取，幂等） */
  async ensureImage(): Promise<boolean> {
    const a = await this.probe()
    if (!a.dockerOk) return false
    if (a.imageOk) return true
    const pull = await dockerCli(['pull', this.opts.image], 120_000)
    if (pull.exitCode === 0) {
      this.availability = { dockerOk: true, imageOk: true }
      return true
    }
    return false
  }

  // ── 生命周期（S1/S2）─────────────────────────────────

  /** touch heartbeat：记录最后使用时间 */
  touch(agentId: string): void {
    this.lastUsed.set(agentId, Date.now())
  }

  /** 容器名可推导——检查存在性 + 挂载路径匹配（真实 bug：agent 换 workspace 后容器仍挂旧路径） */
  private async containerReady(agentId: string, ws: string): Promise<boolean> {
    const name = containerName(agentId)
    const r = await dockerCli(['ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}'])
    if (r.exitCode !== 0 || !r.stdout.trim()) return false
    // 校验卷挂载路径与当前 ws 一致（不一致 → 重建）
    const m = await dockerCli(['inspect', name, '--format', '{{ range .Mounts }}{{ .Source }}={{ .Destination }};{{ end }}'])
    if (m.exitCode === 0) {
      const mounts = m.stdout
      const expected = `${ws}=/ws`
      if (!mounts.includes(expected)) {
        await dockerCli(['rm', '-f', name])
        return false
      }
    }
    return true
  }

  /** 池大小（活跃容器数） */
  private async poolSize(): Promise<number> {
    const r = await dockerCli(['ps', '--filter', `name=${CONTAINER_PREFIX}`, '--format', '{{.Names}}'])
    if (r.exitCode !== 0) return 0
    return r.stdout.trim() ? r.stdout.trim().split('\n').length : 0
  }

  /** LRU 驱逐最旧容器（池满时） */
  private async evictLru(): Promise<void> {
    // 从 heartbeat Map 找最旧的
    let oldestId: string | null = null
    let oldestTs = Infinity
    for (const [id, ts] of this.lastUsed) {
      if (ts < oldestTs) { oldestTs = ts; oldestId = id }
    }
    if (oldestId) {
      await this.dispose(oldestId)
      return
    }
    // Map 空（从未 touch）——驱逐任一池内容器
    const r = await dockerCli(['ps', '--filter', `name=${CONTAINER_PREFIX}`, '--format', '{{.Names}}'])
    if (r.exitCode === 0 && r.stdout.trim()) {
      const name = r.stdout.trim().split('\n')[0]
      await dockerCli(['rm', '-f', name])
    }
  }

  /**
   * 确保容器存在（惰性重建）
   * @param agentId agent UUID
   * @param ws 宿主 workspace 绝对路径（卷挂载源）
   * @param network allow_network → bridge（默认 none）
   */
  async ensure(agentId: string, ws: string, network?: boolean): Promise<boolean> {
    if (!this.opts.enabled) return false
    const a = await this.probe()
    if (!a.dockerOk) return false
    if (!a.imageOk) {
      const ok = await this.ensureImage()
      if (!ok) return false
    }
    if (await this.containerReady(agentId, ws)) {
      this.touch(agentId)
      return true
    }
    // 池上限检查（S2）
    const size = await this.poolSize()
    if (size >= this.opts.maxContainers) {
      await this.evictLru()
    }
    const args = [
      'run', '-d',
      '--name', containerName(agentId),
      '-v', `${ws}:/ws`,
      '-v', `${this.opts.runnerPath}:/opt/sandbox/tool-runner.js:ro`,
      '-w', '/ws',
      '--network', network ? 'bridge' : 'none',
      '-m', '512m', '--memory-swap', '512m',
      '--cpus', '1',
      '--pids-limit', '256',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--ulimit', 'nofile=1024:1024',
      '--user', 'node',
      this.opts.image,
      'sleep', 'infinity',
    ]
    const r = await dockerCli(args, 30_000)
    if (r.exitCode !== 0) {
      // 容器名冲突（残留）→ 删除重试
      if (r.stderr.includes('Conflict')) {
        await dockerCli(['rm', '-f', containerName(agentId)])
        const r2 = await dockerCli(args, 30_000)
        if (r2.exitCode !== 0) return false
      } else {
        return false
      }
    }
    this.touch(agentId)
    return true
  }

  /** 销毁容器（空闲回收/驱逐/agent 删除联动） */
  async dispose(agentId: string): Promise<void> {
    await dockerCli(['rm', '-f', containerName(agentId)])
    this.lastUsed.delete(agentId)
  }

  /** 孤儿清理：启动时扫描 ap-sandbox-* 全删（容器无状态，数据在卷，删除无损） */
  async cleanupOrphans(): Promise<number> {
    if (!this.opts.enabled) return 0
    const a = await this.probe()
    if (!a.dockerOk) return 0
    const r = await dockerCli(['ps', '-a', '--filter', `name=${CONTAINER_PREFIX}`, '--format', '{{.Names}}'])
    if (r.exitCode !== 0 || !r.stdout.trim()) return 0
    const names = r.stdout.trim().split('\n')
    for (const n of names) {
      await dockerCli(['rm', '-f', n])
    }
    this.lastUsed.clear()
    return names.length
  }

  /** Heartbeat 回收定时器（S2） */
  startReaper(): void {
    if (this.reaper || !this.opts.enabled) return
    this.reaper = setInterval(() => {
      void this.reapIdle()
    }, this.opts.reaperIntervalMs)
    this.reaper.unref?.()
  }

  private async reapIdle(): Promise<void> {
    const now = Date.now()
    for (const [id, ts] of this.lastUsed) {
      if (now - ts > this.opts.idleTimeoutMs) {
        await this.dispose(id)
      }
    }
  }

  // ── 执行（S3/S4/S5/S7）───────────────────────────────

  /**
   * 统一工具执行：stdin {tool,args} → 容器内 tool-runner.js → {ok,output}
   */
  async runTool(
    agentId: string,
    ws: string,
    tool: string,
    args: Record<string, unknown>,
    network?: boolean,
  ): Promise<ExecResult> {
    if (!this.opts.enabled) {
      return { ok: false, error: '沙盒不可用（SANDBOX_DISABLE）——工具已禁用' }
    }
    const ready = await this.ensure(agentId, ws, network)
    if (!ready) {
      return { ok: false, error: '沙盒不可用——命令执行已禁用（docker 不可用或镜像缺失）' }
    }
    this.touch(agentId)
    const payload = JSON.stringify({ tool, args })
    const r = await this.dockerExec(agentId, ['node', '/opt/sandbox/tool-runner.js'], payload)
    if (r.timedOut) {
      return { ok: false, error: '命令执行超时（30s）——沙盒已终止该命令', timedOut: true }
    }
    if (r.exitCode !== 0) {
      return { ok: false, error: `容器执行失败 (exit ${r.exitCode}): ${r.output || 'unknown'}`, exitCode: r.exitCode }
    }
    // 解析 tool-runner 的 JSON 输出
    try {
      const parsed = JSON.parse(r.output)
      if (parsed.ok) return { ok: true, output: String(parsed.output ?? '') }
      return { ok: false, error: String(parsed.error ?? 'unknown') }
    } catch {
      return { ok: true, output: r.output }
    }
  }

  /**
   * 直接执行命令（bash 场景经 tool-runner；底层通用）
   */
  private async dockerExec(
    agentId: string,
    cmdArgs: string[],
    stdin?: string,
  ): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
    return new Promise((resolvePromise) => {
      const proc = spawn('docker', ['exec', '-i', containerName(agentId), ...cmdArgs], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        proc.kill('SIGKILL')
        ;(resolvePromise as any)({ output: (stdout + stderr).trim() || '命令执行超时（30s）——沙盒已终止该命令', exitCode: -1, timedOut: true })
      }, this.opts.execTimeoutMs)
      proc.stdout.on('data', d => { stdout += d })
      proc.stderr.on('data', d => { stderr += d })
      proc.on('error', () => {
        clearTimeout(timer)
        resolvePromise({ output: 'docker exec 失败（容器可能已被回收）', exitCode: 1, timedOut: false })
      })
      proc.on('close', (code) => {
        clearTimeout(timer)
        resolvePromise({ output: (stdout + stderr).trim(), exitCode: code ?? 1, timedOut: false })
      })
      if (stdin) proc.stdin.write(stdin)
      proc.stdin.end()
    })
  }

  // ── 状态（U2）────────────────────────────────────────

  async status(): Promise<SandboxStatus> {
    const a = this.availability ?? (await this.probe())
    const size = await this.poolSize()
    return {
      available: this.opts.enabled && a.dockerOk && a.imageOk,
      enabled: this.opts.enabled,
      imageReady: a.imageOk,
      mode: this.opts.mode,
      poolSize: size,
      maxContainers: this.opts.maxContainers,
    }
  }

  /** agent 删除联动 */
  async disposeAgent(agentId: string): Promise<void> {
    await this.dispose(agentId)
  }
}

// 单例（模块级共享——app 内所有 agent 共用同一个池）
export const sandbox = new DockerSandbox()
