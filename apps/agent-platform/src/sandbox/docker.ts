/**
 * Docker 沙盒执行器 — 纯执行层（无生命周期状态）
 *
 * 三层模型（2026-12）：sandbox = 计算资源（一级概念）。本模块只负责 docker 操作：
 *   ensure（创建/校验/重建）/ runTool（统一工具执行）/ dispose / 监控查询。
 * 生命周期状态（requested/running/stopped/terminated/error + 回收/驱逐/孤儿清理）
 * 全部由 SandboxManager（src/sandbox/manager.ts）持有——DB 驱动，单一事实源。
 *
 * 重构要点（M1，P0 修复）：
 *   - 容器名 = ap-sandbox-{sandbox_id}（身份独立，不依赖 agent/部门存在）
 *   - busy 豁免：exec 期间容器不可被回收/驱逐（长任务保护——P0-1）
 *   - ensure inflight 去重：并发调用共享同一 promise（P0-2）
 *   - 容器内 timeout 杀进程树：exec 超时不留孤儿进程（P0-3）
 *   - stopped 自愈：容器存在但未运行 → docker start（P1-5）
 *   - 漂移校验：挂载/镜像/网络不匹配 → 重建（P1-6）
 *   - per-sandbox exec 串行队列（部门共享环境的并发纪律）
 *
 * 诚实裁剪：docker 不可用 / 镜像缺失 → 工具返回「沙盒不可用」（绝不静默回退宿主）
 */

import { execFile, spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sandboxEmit } from './events.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface SandboxOptions {
  /** 默认容器镜像（ensure 时可按记录快照覆盖） */
  image: string
  /** 单次命令超时（ms） */
  execTimeoutMs: number
  /** 是否启用（SANDBOX_DISABLE=1 禁用） */
  enabled: boolean
  /** 工具执行器脚本路径（挂载进容器 /opt/sandbox/tool-runner.js） */
  runnerPath: string
}

/** ensure 时的容器规格（来自 sandboxes 记录快照——配置即声明） */
export interface SandboxSpec {
  /** 宿主 workspace 绝对路径（卷挂载源） */
  ws: string
  /** 容器镜像（默认 opts.image） */
  image?: string
  /** allow_network → bridge（默认 none） */
  network?: boolean
  /** 内存上限 MB（默认 512） */
  memoryMb?: number
  /** CPU 上限（默认 1） */
  cpus?: number
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
  /** 部署模式（persistent 常驻池 | ephemeral 一次性——记录级 mode 为准） */
  mode: string
  poolSize: number
  maxContainers: number
}

const DEFAULT_OPTIONS: SandboxOptions = {
  image: process.env.SANDBOX_IMAGE ?? 'ap-sandbox:latest',
  execTimeoutMs: 35_000,
  enabled: process.env.SANDBOX_DISABLE !== '1',
  runnerPath: resolve(__dirname, 'tool-runner.js'),
}

const CONTAINER_PREFIX = 'ap-sandbox-'

function containerName(sandboxId: string): string {
  return CONTAINER_PREFIX + sandboxId
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
  /** exec 进行中的 sandbox（回收/驱逐必须跳过——长任务保护 P0-1） */
  private busy = new Set<string>()
  /** ensure inflight 去重（P0-2） */
  private inflightEnsure = new Map<string, Promise<boolean>>()
  /** per-sandbox exec 串行队列（并发工具调用排队） */
  private execChains = new Map<string, Promise<unknown>>()
  private availability: { dockerOk: boolean; imageOk: boolean } | null = null
  /** M6-1 TTL 缓存：探测结果（成功 60s；失败负缓存 10s——防 docker 抖动时反复全量探测） */
  private availCache: { at: number; value: { dockerOk: boolean; imageOk: boolean } } | null = null
  /** M6-1 TTL 缓存：per-sandbox 就绪指纹（30s——工具调用降为 1 次 exec） */
  private readyCache = new Map<string, { at: number; fingerprint: string }>()
  /** M6-2 执行器指标 */
  readonly execStats = { execCount: 0, execTimeouts: 0, execErrors: 0 }
  /** 2026-12 可观测性：运行中的 exec（sandboxId → 工具/开始时间/超时）——debug 卡住场景 */
  readonly runningExecs = new Map<string, { tool: string; startedAt: number; timeoutMs: number }>()
  /** 事件回调（manager 注入——exec 生命周期写 sandbox_events） */
  onExecEvent: ((sandboxId: string, type: string, detail?: string) => void) | null = null

  constructor(options?: Partial<SandboxOptions>) {
    this.opts = { ...DEFAULT_OPTIONS, ...options }
  }

  // ── 探测 ──────────────────────────────────────────

  async probe(): Promise<{ dockerOk: boolean; imageOk: boolean }> {
    if (!this.opts.enabled) {
      this.availability = { dockerOk: false, imageOk: false }
      return this.availability
    }
    // M6-1 TTL：成功 60s / 失败负缓存 10s
    if (this.availCache) {
      const ttl = this.availCache.value.dockerOk ? 60_000 : 10_000
      if (Date.now() - this.availCache.at < ttl) {
        this.availability = this.availCache.value
        return this.availCache.value
      }
    }
    const docker = await dockerCli(['version', '--format', '{{.Server.Version}}'], 10_000)
    const dockerOk = docker.exitCode === 0
    let imageOk = false
    if (dockerOk) {
      const img = await dockerCli(['image', 'inspect', this.opts.image, '--format', '{{.Id}}'], 10_000)
      imageOk = img.exitCode === 0
    }
    this.availCache = { at: Date.now(), value: { dockerOk, imageOk } }
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

  // ── 生命周期（纯执行——状态由 manager 持有） ──────────

  /** exec 进行中（manager 回收/驱逐前查询——长任务保护） */
  isBusy(sandboxId: string): boolean {
    return this.busy.has(sandboxId)
  }

  /**
   * 确保容器存在且符合规格（惰性创建/自愈/重建）
   * - 存在且健康且规格匹配 → 复用
   * - 存在但停止 → docker start（P1-5 自愈；start 失败 → rm 重建）
   * - 规格漂移（挂载/镜像/网络）→ rm 重建（P1-6）
   * - 不存在 → docker run（池上限检查由 manager 负责）
   * 并发去重：同 sandbox 并发 ensure 共享同一 promise（P0-2）
   */
  async ensure(sandboxId: string, spec: SandboxSpec): Promise<boolean> {
    if (!this.opts.enabled) return false
    const existing = this.inflightEnsure.get(sandboxId)
    if (existing) return existing
    const p = this.doEnsure(sandboxId, spec)
    this.inflightEnsure.set(sandboxId, p)
    try {
      return await p
    } finally {
      this.inflightEnsure.delete(sandboxId)
    }
  }

  private async doEnsure(sandboxId: string, spec: SandboxSpec): Promise<boolean> {
    // M6-1 readiness TTL：同指纹 30s 内命中 → 直接就绪（工具调用降为 1 次 exec）
    const fingerprint = `${spec.ws}|${spec.image ?? this.opts.image}|${spec.network ? 'bridge' : 'none'}|${spec.memoryMb ?? 512}|${spec.cpus ?? 1}`
    const cached = this.readyCache.get(sandboxId)
    if (cached && cached.fingerprint === fingerprint && Date.now() - cached.at < 30_000) {
      sandboxEmit('ensure:cache-hit', sandboxId, { fingerprint })
      return true
    }
    const a = await this.probe()
    if (!a.dockerOk) return false
    const image = spec.image ?? this.opts.image
    if (image !== this.opts.image) {
      // 记录快照镜像与默认不同——确保存在
      const img = await dockerCli(['image', 'inspect', image, '--format', '{{.Id}}'], 10_000)
      if (img.exitCode !== 0) {
        sandboxEmit('image:pull', sandboxId, { image })
        const pull = await dockerCli(['pull', image], 120_000)
        if (pull.exitCode !== 0) return false
      }
    } else if (!a.imageOk) {
      const ok = await this.ensureImage()
      if (!ok) return false
    }
    const name = containerName(sandboxId)
    const state = await this.inspectState(name)
    if (state) {
      // 存在——校验规格漂移（挂载/镜像/网络；P1-6）
      const drift = await this.specDrift(name, spec, image)
      if (state.running && !drift) {
        this.readyCache.set(sandboxId, { at: Date.now(), fingerprint })
        return true
      }
      if (!state.running && !drift) {
        // stopped 自愈：docker start（P1-5）；失败 → 重建
        const st = await dockerCli(['start', name], 15_000)
        if (st.exitCode === 0) {
          this.readyCache.set(sandboxId, { at: Date.now(), fingerprint })
          return true
        }
        await dockerCli(['rm', '-f', name])
      } else {
        await dockerCli(['rm', '-f', name])
      }
    }
    // 创建
    const args = this.runArgs(sandboxId, spec, image)
    const r = await dockerCli(args, 30_000)
    if (r.exitCode !== 0) {
      // 容器名冲突（残留竞态）→ 删除重试一次
      if (r.stderr.includes('Conflict')) {
        await dockerCli(['rm', '-f', name])
        const r2 = await dockerCli(args, 30_000)
        if (r2.exitCode !== 0) return false
      } else {
        return false
      }
    }
    this.readyCache.set(sandboxId, { at: Date.now(), fingerprint })
    return true
  }

  /** 容器存在性 + 运行状态（null = 不存在） */
  private async inspectState(name: string): Promise<{ running: boolean } | null> {
    const r = await dockerCli(['ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}'], 10_000)
    if (r.exitCode !== 0 || !r.stdout.trim()) return null
    const st = await dockerCli(['inspect', name, '--format', '{{.State.Running}}'], 10_000)
    return { running: st.exitCode === 0 && st.stdout.trim() === 'true' }
  }

  /** 规格漂移校验（挂载/镜像/网络不匹配 → 需重建） */
  private async specDrift(name: string, spec: SandboxSpec, image: string): Promise<boolean> {
    const m = await dockerCli(['inspect', name, '--format',
      '{{ range .Mounts }}{{ .Source }}={{ .Destination }};{{ end }}|{{.Config.Image}}|{{.HostConfig.NetworkMode}}'], 10_000)
    if (m.exitCode !== 0) return true
    const [mounts, cfgImage, netMode] = m.stdout.split('|')
    if (!mounts || !mounts.includes(`${spec.ws}=/ws`)) return true
    if (cfgImage !== image) return true
    const wantNet = spec.network ? 'bridge' : 'none'
    if (netMode !== wantNet) return true
    return false
  }

  /** docker run 参数（资源限制——非 root/无特权/防 fork 炸弹） */
  private runArgs(sandboxId: string, spec: SandboxSpec, image: string): string[] {
    const memory = (spec.memoryMb ?? 512) * 1024 * 1024
    const cpus = spec.cpus ?? 1
    // sandbox 事件流：工作目录挂载（部门身份 ↔ 容器——bind mount 可观测）
    sandboxEmit('mount:bind', sandboxId, { hostPath: spec.ws, containerPath: '/ws', mode: 'rw' })
    return [
      'run', '-d',
      '--name', containerName(sandboxId),
      '-v', `${spec.ws}:/ws`,
      '-v', `${this.opts.runnerPath}:/opt/sandbox/tool-runner.js:ro`,
      '-w', '/ws',
      '--network', spec.network ? 'bridge' : 'none',
      ...(spec.network ? ['--add-host', 'host.docker.internal:host-gateway'] : []),
      '-m', `${memory}`, '--memory-swap', `${memory}`,
      '--cpus', String(cpus),
      '--pids-limit', '256',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--ulimit', 'nofile=1024:1024',
      '--user', 'node',
      image,
      'sleep', 'infinity',
    ]
  }

  /** 销毁容器（终止/驱逐/清理） */
  async dispose(sandboxId: string): Promise<void> {
    await dockerCli(['rm', '-f', containerName(sandboxId)])
  }

  /**
   * ephemeral 一次性执行（M6-3）：每次调用独立容器（docker run -d + exec + finally rm -f）
   * - 天然隔离：无池/心跳/回收/busy/串行队列（调用即焚）
   * - 卷挂载共享：文件状态永远在 /ws（卷）——与常驻模式同一份数据
   */
  async runOnce(sandboxId: string, spec: SandboxSpec, tool: string, args: Record<string, unknown>): Promise<ExecResult> {
    if (!this.opts.enabled) {
      return { ok: false, error: '沙盒不可用（SANDBOX_DISABLE）——工具已禁用' }
    }
    const a = await this.probe()
    if (!a.dockerOk) return { ok: false, error: '沙盒不可用——命令执行已禁用（docker 不可用或镜像缺失）' }
    const image = spec.image ?? this.opts.image
    const img = await dockerCli(['image', 'inspect', image, '--format', '{{.Id}}'], 10_000)
    if (img.exitCode !== 0) {
      const pull = await dockerCli(['pull', image], 120_000)
      if (pull.exitCode !== 0) return { ok: false, error: '沙盒不可用——镜像缺失' }
    }
    const tmpName = CONTAINER_PREFIX + 'e-' + sandboxId.slice(0, 8) + '-' + Math.random().toString(36).slice(2, 8)
    const memory = (spec.memoryMb ?? 512) * 1024 * 1024
    const args2 = [
      'run', '-d',
      '--name', tmpName,
      '-v', `${spec.ws}:/ws`,
      '-v', `${this.opts.runnerPath}:/opt/sandbox/tool-runner.js:ro`,
      '-w', '/ws',
      '--network', spec.network ? 'bridge' : 'none',
      ...(spec.network ? ['--add-host', 'host.docker.internal:host-gateway'] : []),
      '-m', `${memory}`, '--memory-swap', `${memory}`,
      '--cpus', String(spec.cpus ?? 1),
      '--pids-limit', '256',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--ulimit', 'nofile=1024:1024',
      '--user', 'node',
      image,
      'sleep', 'infinity',
    ]
    const r = await dockerCli(args2, 30_000)
    if (r.exitCode !== 0) return { ok: false, error: `一次性容器创建失败: ${r.stderr.trim() || 'unknown'}` }
    try {
      const payload = JSON.stringify({ tool, args })
      const secs = Math.max(3, Math.floor(this.opts.execTimeoutMs / 1000))
      const er = await this.dockerExec(tmpName,
        ['-e', `SANDBOX_EXEC_TIMEOUT_SECS=${secs}`, 'timeout', '-s', 'KILL', String(secs), 'node', '/opt/sandbox/tool-runner.js'],
        payload)
      if (er.timedOut) return { ok: false, error: `命令执行超时（${secs}s）——沙盒已终止该命令`, timedOut: true }
      if (er.exitCode !== 0) {
        if (er.exitCode === 124 || er.exitCode === 137) {
          return { ok: false, error: `命令执行超时（${secs}s）——沙盒已终止该命令`, timedOut: true }
        }
        return { ok: false, error: `容器执行失败 (exit ${er.exitCode}): ${er.output || 'unknown'}`, exitCode: er.exitCode }
      }
      try {
        const parsed = JSON.parse(er.output)
        if (parsed.ok) return { ok: true, output: String(parsed.output ?? '') }
        return { ok: false, error: String(parsed.error ?? 'unknown') }
      } catch {
        return { ok: true, output: er.output }
      }
    } finally {
      // 调用即焚：无论成败删除容器
      await dockerCli(['rm', '-f', tmpName]).catch(() => {})
    }
  }

  // ── 执行 ──────────────────────────────────────────

  /**
   * 统一工具执行：stdin {tool,args} → 容器内 tool-runner.js → {ok,output}
   * - busy 标记（回收/驱逐豁免）+ finally 清除（P0-1）
   * - per-sandbox 串行队列（部门共享环境的并发纪律）
   */
  async runTool(
    sandboxId: string,
    spec: SandboxSpec,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<ExecResult> {
    if (!this.opts.enabled) {
      return { ok: false, error: '沙盒不可用（SANDBOX_DISABLE）——工具已禁用' }
    }
    const ready = await this.ensure(sandboxId, spec)
    if (!ready) {
      return { ok: false, error: '沙盒不可用——命令执行已禁用（docker 不可用或镜像缺失）' }
    }
    // 串行队列：同 sandbox 的 exec 排队执行（并发调用不踩踏容器内状态）
    // sandbox 事件流：队列等待（排队可见——exec 延迟可审计）
    sandboxEmit('exec:queued', sandboxId, { tool })
    const queueT0 = Date.now()
    const chain = this.execChains.get(sandboxId) ?? Promise.resolve()
    const run = chain.then(() => this.execOnce(sandboxId, tool, args))
    this.execChains.set(sandboxId, run.catch(() => {}))
    const r = await run
    const queueMs = Date.now() - queueT0
    // stopped 自愈重试（P1-5 + readiness 缓存）：容器被外部 stop 时缓存命中 → exec 'not running'
    // → 清缓存 → ensure（start/重建）→ 重试一次——自愈对工具调用透明
    if (!r.ok && !r.timedOut && r.error && r.error.includes('not running')) {
      this.readyCache.delete(sandboxId)
      const ready2 = await this.ensure(sandboxId, spec)
      if (ready2) {
        const chain2 = this.execChains.get(sandboxId) ?? Promise.resolve()
        const run2 = chain2.then(() => this.execOnce(sandboxId, tool, args))
        this.execChains.set(sandboxId, run2.catch(() => {}))
        return run2
      }
    }
    return r
  }

  /** 单次 exec（队列内执行体） */
  private async execOnce(sandboxId: string, tool: string, args: Record<string, unknown>): Promise<ExecResult> {
    this.busy.add(sandboxId)
    this.execStats.execCount++
    // 2026-12 可观测性：记录运行中 exec（诊断卡住场景——哪个沙盒在跑什么/多久）
    this.runningExecs.set(sandboxId, { tool, startedAt: Date.now(), timeoutMs: this.opts.execTimeoutMs })
    this.onExecEvent?.(sandboxId, 'exec_start', tool)
    try {
      const payload = JSON.stringify({ tool, args })
      const secs = Math.max(3, Math.floor(this.opts.execTimeoutMs / 1000))
      // 容器内 timeout 杀 node 兜底（P0-3）；bash 进程树由 tool-runner 内部
      // spawn detached + kill(-pid) 先杀（-e 传外层超时——内部 = 外层 − 2s）
      const r = await this.dockerExec(containerName(sandboxId),
        ['-e', `SANDBOX_EXEC_TIMEOUT_SECS=${secs}`, 'timeout', '-s', 'KILL', String(secs), 'node', '/opt/sandbox/tool-runner.js'],
        payload)
      if (r.timedOut) {
        this.execStats.execTimeouts++
        this.onExecEvent?.(sandboxId, 'exec_timeout', `${tool} ${secs}s`)
        return { ok: false, error: `命令执行超时（${secs}s）——沙盒已终止该命令`, timedOut: true }
      }
      if (r.exitCode !== 0) {
        // 超时信号：timeout 命令自身 124 / 进程组被 SIGKILL 137（容器内 timeout -s KILL 杀树）
        if (r.exitCode === 124 || r.exitCode === 137 || r.timedOut) {
          this.execStats.execTimeouts++
          this.onExecEvent?.(sandboxId, 'exec_timeout', `${tool} ${secs}s`)
          return { ok: false, error: `命令执行超时（${secs}s）——沙盒已终止该命令`, timedOut: true }
        }
        // exec 失败（容器可能被外部 stop）→ 清 readiness 缓存（下次 ensure 重新校验）
        this.readyCache.delete(sandboxId)
        this.execStats.execErrors++
        this.onExecEvent?.(sandboxId, 'exec_error', `${tool}: ${r.output?.slice(0, 200) ?? ''}`)
        return { ok: false, error: `容器执行失败 (exit ${r.exitCode}): ${r.output || 'unknown'}`, exitCode: r.exitCode }
      }
      try {
        const parsed = JSON.parse(r.output)
        if (parsed.ok) return { ok: true, output: String(parsed.output ?? '') }
        return { ok: false, error: String(parsed.error ?? 'unknown') }
      } catch {
        return { ok: true, output: r.output }
      }
    } finally {
      this.busy.delete(sandboxId)
      this.runningExecs.delete(sandboxId)
      this.onExecEvent?.(sandboxId, 'exec_done', tool)
    }
  }

  /**
   * docker exec（容器内命令）。超时：杀 exec 客户端 + 状态上报
   * （容器内 timeout 已保证进程树终止——此定时器是兜底）
   */
  private async dockerExec(
    container: string,
    cmdArgs: string[],
    stdin?: string,
  ): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
    return new Promise((resolvePromise) => {
      // -e/--env 必须在容器名前（docker exec [OPTIONS] CONTAINER COMMAND）
      const envIdx = cmdArgs.findIndex((a) => a === '-e')
      const envArgs = envIdx >= 0 ? cmdArgs.slice(envIdx, envIdx + 2) : []
      const rest = envIdx >= 0 ? [...cmdArgs.slice(0, envIdx), ...cmdArgs.slice(envIdx + 2)] : cmdArgs
      const proc = spawn('docker', ['exec', '-i', ...envArgs, container, ...rest], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        proc.kill('SIGKILL')
        ;(resolvePromise as any)({ output: (stdout + stderr).trim() || `命令执行超时（${Math.floor(this.opts.execTimeoutMs / 1000)}s）——沙盒已终止该命令`, exitCode: -1, timedOut: true })
      }, this.opts.execTimeoutMs + 5_000) // 容器内 timeout 优先，外层多 5s 兜底
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

  // ── 状态与监控（管理/运维面——Admin 保留） ────────────

  /**
   * 沙盒监控（管理/调试）：容器列表 + 资源占用
   */
  async listContainers(): Promise<Array<Record<string, string>>> {
    const r = await dockerCli(['ps', '-a', '--filter', `name=${CONTAINER_PREFIX}`, '--format',
      '{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.CreatedAt}}'], 10_000)
    if (r.exitCode !== 0) return []
    return r.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [name, status, image, createdAt] = line.split('\t')
      return { name: name ?? '', status: status ?? '', image: image ?? '', createdAt: createdAt ?? '' }
    })
  }

  async containerStats(name: string): Promise<Record<string, string> | null> {
    if (!name.startsWith(CONTAINER_PREFIX)) return null
    const r = await dockerCli(['stats', '--no-stream', '--format',
      '{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}\t{{.NetIO}}', name], 15_000)
    if (r.exitCode !== 0) return null
    const [cpu, mem, memPct, pids, net] = r.stdout.trim().split('\t')
    return { cpu: cpu ?? '-', mem: mem ?? '-', memPct: memPct ?? '-', pids: pids ?? '-', net: net ?? '-' }
  }

  async containerProcesses(name: string): Promise<Array<Record<string, string>>> {
    if (!name.startsWith(CONTAINER_PREFIX)) return []
    const r = await dockerCli(['top', name], 10_000)
    if (r.exitCode !== 0) return []
    const lines = r.stdout.trim().split('\n').filter(Boolean)
    if (lines.length <= 1) return []
    const headers = lines[0].split(/\s+/)
    return lines.slice(1).map((line) => {
      const parts = line.split(/\s+/)
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = parts[i] ?? '' })
      return row
    })
  }

  async containerAction(name: string, action: 'stop' | 'start' | 'restart' | 'rm'): Promise<{ ok: boolean; message: string }> {
    if (!name.startsWith(CONTAINER_PREFIX)) return { ok: false, message: '非法容器名' }
    // rm 必须强制（运行中容器直接删除——孤儿/终止语义）
    const args = action === 'rm' ? ['rm', '-f', name] : [action, name]
    sandboxEmit(`container:${action}`, name.replace(CONTAINER_PREFIX, ''), { name })
    const r = await dockerCli(args, 30_000)
    return r.exitCode === 0 ? { ok: true, message: `${action} ${name} 成功` } : { ok: false, message: r.stderr.trim() || `${action} 失败` }
  }

  async status(): Promise<SandboxStatus> {
    const a = this.availability ?? (await this.probe())
    const r = await dockerCli(['ps', '--filter', `name=${CONTAINER_PREFIX}`, '--format', '{{.Names}}'], 10_000)
    const poolSize = r.exitCode === 0 && r.stdout.trim() ? r.stdout.trim().split('\n').length : 0
    return {
      available: this.opts.enabled && a.dockerOk && a.imageOk,
      enabled: this.opts.enabled,
      imageReady: a.imageOk,
      mode: process.env.SANDBOX_MODE ?? 'persistent',
      poolSize,
      maxContainers: 0, // 池上限由 manager 的配额/预算控制（M2/M5）
    }
  }
}

// 单例（模块级共享——app 内所有 sandbox 共用同一个执行器）
export const sandbox = new DockerSandbox()
