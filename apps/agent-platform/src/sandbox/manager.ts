/**
 * Sandbox 管理器 — 生命周期/资源管理的唯一事实源（DB 驱动）
 *
 * 三层模型（2026-12）：sandbox = 计算资源（一级概念，绑定部门）。
 * 本模块持有生命周期状态机（DB 持久化——重启可恢复），DockerSandbox 只做 docker 操作。
 *
 * 状态机：requested（记录已建，容器未起——惰性）→ running ⇄ stopped → terminated；error
 * 两级回收：idle 超时（默认 10min）→ docker stop（瞬态短时保留、恢复快）
 *           停止超时（默认 24h）→ terminate（释放磁盘）
 * 超龄重建：expires_at 到期 → rm + 重建（清瞬态残留——「瞬态是副作用」的执行保证）
 * reconcile（60s）：DB 期望状态 vs docker 实际 → 对齐（缺容器重建/停着 start/漂移重建/孤儿 rm）
 * busy 豁免：exec 进行中的容器绝不回收/驱逐（任务完整性 > 池吞吐）
 *
 * 诚实裁剪：docker 不可用 → 工具返回「沙盒不可用」；池配额超限 → 明确错误（不静默降级）
 */

import { ops } from 'weifuwu'
import type { Orm, RowOf } from 'weifuwu'
import { SHAPES } from '../db/shapes.ts'
import type { DockerSandbox, ExecResult, SandboxSpec } from './docker.ts'
import { sandbox as defaultExecutor } from './docker.ts'
import { sandboxEmit, subscribeSandboxEvents } from './events.ts'
import { HOST_ID, hostCapacity } from './host.ts'
import { emitRouteDecision } from './scheduler.ts'

/** sandboxes 行类型——shape 单源派生（W2：行类型与 shape 同步——不再手动双写） */
export type SandboxRow = RowOf<typeof SHAPES.sandboxes>

export interface ManagerOptions {
  /** 空闲回收（stop）超时 ms——默认 10min */
  idleTimeoutMs: number
  /** 停止后终止超时 ms——默认 24h */
  stopTimeoutMs: number
  /** 寿命上限 ms——默认 24h（超龄重建） */
  maxLifetimeMs: number
  /** reconcile 扫描间隔 ms */
  reconcileIntervalMs: number
  /** terminated 记录保留天数 */
  historyRetentionDays: number
  /** 池内存预算 MB（M5-2；0=禁用）——默认 SANDBOX_POOL_BUDGET_MB */
  poolBudgetMb?: number
}

const DEFAULT_OPTIONS: ManagerOptions = {
  idleTimeoutMs: Number(process.env.SANDBOX_IDLE_TIMEOUT ?? 600) * 1000,
  stopTimeoutMs: Number(process.env.SANDBOX_STOP_TIMEOUT ?? 86_400) * 1000,
  maxLifetimeMs: Number(process.env.SANDBOX_MAX_LIFETIME ?? 86_400) * 1000,
  reconcileIntervalMs: 60_000,
  historyRetentionDays: 30,
}

/** 单容器资源默认（env 化——M5-3；创建时快照进记录，配置即声明）
 *  512MB（2027-09——问卷实测容器 306MB（chromium 满载）——原 1024 高估
 *  60%——降配 512 + 30% 余量 → 池预算 10240MB ÷ 512 = 20 并发（原 10）
 *  ——1000 生产挂钟减半（SURVEY-BOTS-PLAN v2——S7b）） */
const DEFAULT_MEMORY_MB = Number(process.env.SANDBOX_MEMORY_LIMIT ?? 512) // 默认 512MB
const DEFAULT_CPUS = Number(process.env.SANDBOX_CPU_LIMIT ?? 1)
/** 池内存预算（M5-2）——默认 10240MB = 20×512MB；0 = 禁用 */
const DEFAULT_POOL_BUDGET_MB = Number(process.env.SANDBOX_POOL_BUDGET_MB ?? 10240)

type Sql = Orm // 消费侧依赖契约类型——orm 句柄（运行时注入）

export class SandboxManager {
  private orm: Orm | null = null
  /** 2026-12：事件日志独立连接池（不抢主池——10 角色并发 exec 风暴时事件写入不占 AI 执行连接） */
  private eventsOrm: Orm | null = null
  /** 事件流持久化订阅退订（阶段 4） */
  private _eventsUnsub: (() => void) | null = null
  /** 事件流持久化订阅退订（阶段 4） */
  private exe: DockerSandbox
  private opts: ManagerOptions
  private timer: NodeJS.Timeout | null = null
  private reconciling = false

  constructor(executor: DockerSandbox = defaultExecutor, options?: Partial<ManagerOptions>) {
    this.exe = executor
    this.opts = { ...DEFAULT_OPTIONS, ...options }
  }

  /** 启动注入 DB 句柄（server.ts 初始化时调用；幂等） */
  init(orm: Orm, eventsOrm?: Orm): void {
    this.orm = orm
    this.eventsOrm = eventsOrm ?? orm
    // 2026-12 可观测性：executor exec 事件 → sandbox_events（诊断链）
    this.exe.onExecEvent = (sandboxId, type, detail) => this.logEvent(sandboxId, null, type, detail)
    // 阶段 4：事件流 → 持久化接通（结果类事件入库——降频：exec:start/queued/
    // cache-hit 等频繁事件只留内存环形——结果类/生命周期/漂移/调度入库）
    this._eventsUnsub?.()
    this._eventsUnsub = subscribeSandboxEvents((e) => {
      const persistable = /exec:end|exec:timeout|exec:error|create|status|stop|reconcile:drift|reconcile:idle-stop|evict|queue:rejected|quota:rejected|container:/.test(e.action)
      if (!persistable) return
      this.logEvent(e.target ?? '', null, e.action, JSON.stringify(e.payload ?? {}).slice(0, 300))
    })
  }

  /** 事件日志（2026-12 可观测性——fire-and-forget，不阻塞主流程） */
  private logEvent(sandboxId: string, appId: string | null, type: string, detail?: string): void {
    const db = this.eventsOrm ?? this.orm
    if (!db) return
    void db.query.insert('sandbox_events')
      .values({ sandbox_id: sandboxId, app_id: appId ?? null, type, detail: detail ?? null })
      .run()
      .catch(() => {})
  }

  /** 事件历史（诊断用） */
  async eventHistory(sandboxId: string, limit = 30): Promise<Array<{ type: string; detail: string | null; created_at: string }>> {
    if (!this.orm) return []
    try {
      const rows = await this.orm.query.from('sandbox_events')
        .select('type', 'detail', 'created_at')
        .where({ sandbox_id: { eq: sandboxId }})
        .orderBy('created_at', 'desc')
        .limit(limit)
        .run()
      return (rows ?? []).map((r: any) => ({ type: String(r.type), detail: r.detail ? String(r.detail) : null, created_at: r.created_at }))
    } catch {
      return []
    }
  }

  /** 计数器（M6-2 指标接线） */
  readonly counters = {
    created: 0,
    terminated: 0,
    evicted: 0,
    idleStopped: 0,
    autoStarted: 0,
    orphansCleaned: 0,
    execCount: 0,
    execErrors: 0,
    execTimeouts: 0,
  }

  // ── 查询 ──────────────────────────────────────────

  async list(appId: string, filter?: { status?: string; department_id?: string }): Promise<SandboxRow[]> {
    if (!this.orm) return []
    // 白名单校验（status 来自查询参数——防注入）+ 全参数化
    const status = ['requested', 'running', 'stopped', 'terminated', 'error'].includes(filter?.status ?? '') ? filter!.status : null
    const where: import('weifuwu').WhereExpr = { app_id: { eq: appId }}
    if (status) where.status = { eq: status }
    if (filter?.department_id) where.department_id = { eq: filter.department_id }
    const rows = await this.orm.table('sandboxes', SHAPES.sandboxes).select()
      .where(where)
      .orderBy('created_at', 'desc')
      .run()
    return rows as SandboxRow[]
  }

  async get(id: string, appId: string): Promise<SandboxRow | null> {
    if (!this.orm) return null
    const rows = await this.orm.table('sandboxes', SHAPES.sandboxes).select()
      .where({ id: { eq: String(id) }, app_id: { eq: String(appId) }})
      .limit(1)
      .run()
    return (rows?.[0] ?? null) as SandboxRow | null
  }

  /** 部门绑定的非终止记录（1 部门 = 1 环境） */
  async byDepartment(departmentId: string): Promise<SandboxRow | null> {
    if (!this.orm) return null
    const rows = await this.orm.table('sandboxes', SHAPES.sandboxes).select()
      .where({ department_id: { eq: departmentId }, status: { ne: 'terminated' } })
      .limit(1)
      .run()
    return (rows?.[0] ?? null) as SandboxRow | null
  }

  // ── 业务入口：工具执行 ────────────────────────────

  /**
   * 部门工具执行：查/建 sandbox 记录 → 校正状态 → ensure → exec → heartbeat 落库
   * 三层模型：agent 工具操作 = 在部门环境里执行（单聊/无部门由调用方拦截）
   */
  async runTool(
    departmentId: string,
    ws: string,
    tool: string,
    args: Record<string, unknown>,
    opts?: { network?: boolean; execTimeoutMs?: number },
  ): Promise<ExecResult> {
    if (!this.orm) return { ok: false, error: '沙盒管理器未初始化' }
    let row = await this.byDepartment(departmentId)
    if (!row) {
      // 惰性自动创建（requested）——部门成员启用文件工具即自动获得环境
      const [dept] = await this.orm.query.from('departments')
        .select('name', 'app_id')
        .where({ id: { eq: departmentId }})
        .limit(1)
        .run()
      if (!dept) return { ok: false, error: '部门不存在——无法创建工作环境' }
      try {
        row = await this.create({
          appId: String(dept.app_id),
          departmentId,
          name: String(dept.name ?? '工作环境'),
          workspace: ws,
          network: opts?.network,
        })
      } catch (e: any) {
        return { ok: false, error: `沙盒创建失败: ${e?.message ?? '未知错误'}` }
      }
    }
    if (row.status === 'terminated' || !row.workspace) {
      return { ok: false, error: '沙盒已终止——请重新创建' }
    }
    // 记录快照 → 执行器规格（配置即声明）
    const spec: SandboxSpec = {
      // 挂载目标优先用调用方传入的 ws（产物审批模式 = .pending 待审区；正常模式 = 记录快照一致）
      ws: ws || row.workspace,
      image: row.image,
      network: opts?.network ?? row.network,
      memoryMb: row.memory_mb,
      cpus: row.cpus,
    }
    // 指标：exec 计数（M6-2 修复 sandboxCalls 死指标）
    this.counters.execCount++
    const m = (globalThis as any).__platform_metrics
    if (m) m.sandboxCalls++
    // sandbox 事件流：exec 开始（队列等待可见——排队的可见性）
    sandboxEmit('exec:start', row.id, { departmentId, tool, mode: row.mode, hostId: HOST_ID })
    const execT0 = Date.now()
    const r = row.mode === 'ephemeral'
      ? await this.exe.runOnce(row.id, spec, tool, args, { execTimeoutMs: opts?.execTimeoutMs })
      : await this.exe.runTool(row.id, spec, tool, args, { execTimeoutMs: opts?.execTimeoutMs })
    const execMs = Date.now() - execT0
    if (!r.ok) {
      if (r.timedOut) this.counters.execTimeouts++
      else this.counters.execErrors++
    }
    // sandbox 事件流：exec 结束（耗时/退出码/错误——可回放/审计）
    // 统一 schema（阶段 1）：错误码 code（机器可读——timeout/exec_error——
    // 与 ai error 的 code 字段对齐）
    sandboxEmit(r.ok ? 'exec:end' : r.timedOut ? 'exec:timeout' : 'exec:error', row.id, {
      departmentId, tool, ms: execMs, error: r.error?.slice(0, 200),
      code: r.ok ? undefined : r.timedOut ? 'timeout' : 'exec_error',
      hostId: HOST_ID,
    })
    // heartbeat 落 DB（exec 后——成功与否都算活动；exec 中由 busy 豁免回收）
    // 成功 → status 校正 running（requested/stopped 经 exec 即运行）；失败 → error 持久化
    const nextStatus = r.ok ? 'running' : r.error?.includes('沙盒不可用') || r.error?.includes('docker') || r.error?.includes('镜像')
      ? 'error'
      : null
    await this.touch(row.id, nextStatus, nextStatus === 'error' ? r.error?.slice(0, 500) ?? '未知错误' : null).catch(() => {})
    return r
  }

  /** heartbeat 落库 + 状态校正（exec 后） */
  private async touch(id: string, status: string | null, error?: string | null): Promise<void> {
    if (!this.orm) return
    // sandbox 事件流：状态变更（requested/running/stopped/error——状态机可观测）
    if (status) sandboxEmit('status', id, { status, error: error?.slice(0, 200) })
    await this.orm.query.update('sandboxes')
      .set({ last_used_at: ops.now(), error: error ?? null, updated_at: ops.now(), ...(status ? { status } : {}) })
      .where({ id: { eq: String(id) } })
      .run()
  }

  // ── 业务入口：生命周期操作 ─────────────────────────

  /** 创建（手动/自动）。配额校验（per-app sandbox_quota）。创建后惰性（requested） */
  async create(input: {
    appId: string
    departmentId?: string | null
    name: string
    workspace?: string
    image?: string
    network?: boolean
    memoryMb?: number
    cpus?: number
    mode?: 'persistent' | 'ephemeral'
  }): Promise<SandboxRow> {
    if (!this.orm) throw new Error('沙盒管理器未初始化')
    // 配额校验（per-app——M5 预算在此扩展）
    const [q] = await this.orm.query.from('_weifuwu_apps').select('sandbox_quota').where({ id: { eq: input.appId }}).limit(1).run()
    const quota = Number((q as any)?.sandbox_quota ?? 5)
    const [c] = await this.orm.query.from('sandboxes')
      .count('*', 'n')
      .where({ app_id: { eq: input.appId }, status: { in: ['requested', 'running'] } })
      .run()
    if (Number(c?.n ?? 0) >= quota) {
      this.logEvent('quota', String(input.appId), 'quota_rejected', `quota=${quota} name=${input.name}`)
      sandboxEmit('quota:rejected', undefined, { appId: input.appId, quota, name: input.name })
      throw new Error(`沙盒配额已满（${quota} 个）——请先终止不用的沙盒`)
    }
    // 池内存预算校验（M5-2）：超预算 → 驱逐非 busy 最旧（LRU）→ 仍超 → 明确错误（不静默降级）
    const needMb = input.memoryMb ?? DEFAULT_MEMORY_MB
    await this.ensurePoolBudget(needMb)
    // 部门绑定唯一性（1 部门 = 1 环境；部分唯一索引——并发创建竞态由 23505 冲突兜底）
    if (input.departmentId) {
      const existing = await this.byDepartment(input.departmentId)
      if (existing) return existing
    }
    try {
      // expires_at = now + maxLifetime（JS 侧计算——语义与 make_interval 等价——无 SQL 表达式逃生舱）
      const expiresAt = new Date(Date.now() + this.opts.maxLifetimeMs).toISOString()
      const rows = await this.orm.query.insert('sandboxes')
        .values({
          app_id: input.appId, department_id: input.departmentId ?? null, name: input.name, status: 'requested',
          mode: input.mode ?? 'persistent', image: input.image ?? 'ap-sandbox:latest', network: input.network ?? true,
          memory_mb: input.memoryMb ?? DEFAULT_MEMORY_MB, cpus: input.cpus ?? DEFAULT_CPUS, workspace: input.workspace ?? null,
          expires_at: expiresAt,
        })
        .returning('*')
        .run()
      this.counters.created++
      this.logEvent(String(rows[0].id), String(input.appId), 'created', `name=${input.name}`)
      // sandbox 事件流：创建（惰性 requested——首次 exec 才起容器）
      sandboxEmit('create', String(rows[0].id), { appId: input.appId, departmentId: input.departmentId, name: input.name, memoryMb: input.memoryMb ?? DEFAULT_MEMORY_MB, hostId: HOST_ID })
      // 宿主注册（集群化阶段 1：首次创建时上报宿主身份/容量——调度器容量视图）
      sandboxEmit('host:register', undefined, { ...hostCapacity(), at: new Date().toISOString() })
      // 集群调度（阶段 3）：路由决策事件（容量视图——选宿主——决策可观测）
      emitRouteDecision(String(rows[0].id), input.departmentId ?? null, input.memoryMb ?? DEFAULT_MEMORY_MB)
      return rows[0] as SandboxRow
    } catch (e: any) {
      // 并发创建冲突（23505）→ 重查返回已有记录（幂等）
      if (String(e?.code ?? '') === '23505' || /duplicate key/.test(String(e?.message ?? ''))) {
        const existing = await this.byDepartment(String(input.departmentId ?? ''))
        if (existing) return existing
      }
      throw e
    }
  }

  /**
   * 池内存预算（M5-2）：当前非终止记录内存总和 + 新需求 > 预算 →
   * 驱逐非 busy 最旧（LRU——任务完整性 > 池吞吐）→ 仍超 → 抛明确错误
   */
  private async ensurePoolBudget(needMb: number): Promise<void> {
    const budgetMb = this.opts.poolBudgetMb ?? DEFAULT_POOL_BUDGET_MB
    if (!this.orm || budgetMb <= 0) return
    // 口径 = 活跃记录（requested/running/error——容器会占内存）；stopped 容器
    // 已 docker stop（内存已释放）不计（2027-09 与配额口径对齐——实证：S4 批收尾
    // 停 1000 角色容器——stopped 记录若计数——下一 campaign 无可用预算——新角色
    // 创建强制驱逐陈旧记录——不健康 churn）
    const [used] = await this.orm.query.from('sandboxes')
      .sum('memory_mb', 'used')
      .where({ status: { in: ['requested', 'running', 'error'] } })
      .run()
    let usedMb = Number((used as any)?.used ?? 0)
    if (usedMb + needMb <= budgetMb) return
    // 驱逐非 busy 最旧记录（LRU）直到预算满足
    const rows = (await this.orm.table('sandboxes', SHAPES.sandboxes).select()
      .where({ status: { ne: 'terminated' } })
      .orderBy('last_used_at', 'asc')
      .orderBy('created_at', 'asc')
      .run()) as SandboxRow[]
    for (const row of rows) {
      if (usedMb + needMb <= budgetMb) break
      if (this.exe.isBusy(row.id)) continue // busy 豁免——绝不杀执行中的任务
      // 阶段 3：调度事件（预算驱逐——LRU——任务完整性 > 池吞吐——驱逐可审计）
      sandboxEmit('evict', row.id, { reason: 'pool-budget', detail: `LRU 驱逐（预算 ${budgetMb}MB——释放 ${row.memory_mb ?? DEFAULT_MEMORY_MB}MB）` })
      await this.exe.dispose(row.id).catch(() => {})
      await this.orm.query.update('sandboxes')
        .set({ status: 'terminated', terminated_at: ops.now(), updated_at: ops.now() })
        .where({ id: { eq: row.id }})
        .run()
      usedMb -= Number(row.memory_mb ?? DEFAULT_MEMORY_MB)
      this.counters.evicted++
    }
    if (usedMb + needMb > budgetMb) {
      // 阶段 3：调度事件（超限拒绝——不静默降级——可审计）
      sandboxEmit('queue:rejected', undefined, { reason: 'pool-budget', detail: `预算 ${budgetMb}MB——需要 ${needMb}MB` })
      throw new Error(`沙盒池内存不足（预算 ${budgetMb}MB）——请终止不用的沙盒或提升 SANDBOX_POOL_BUDGET_MB`)
    }
  }

  /** P3-3：状态计数（/api/metrics 暴露——DB 快照） */
  async statusCounts(): Promise<Record<string, number>> {
    if (!this.orm) return {}
    try {
      const rows = await this.orm.query.from('sandboxes').select('status').count('*', 'n').groupBy('status').run()
      const out: Record<string, number> = {}
      for (const r of rows ?? []) out[String((r as any).status)] = Number((r as any).n ?? 0)
      return out
    } catch {
      return {}
    }
  }

  /** 终止（rm + terminated_at；记录保留 historyRetentionDays） */
  async terminate(id: string, appId: string): Promise<void> {
    if (!this.orm) return
    const row = await this.get(id, appId)
    if (!row || row.status === 'terminated') return
    await this.exe.dispose(row.id).catch(() => {})
    await this.orm.query.update('sandboxes')
      .set({ status: 'terminated', terminated_at: ops.now(), error: null, updated_at: ops.now() })
      .where({ id: { eq: String(id) } })
      .run()
    this.counters.terminated++
    this.logEvent(id, appId, 'terminated')
  }

  /** 启动（requested/stopped/error → provision） */
  async start(id: string, appId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.orm) return { ok: false, error: '沙盒管理器未初始化' }
    const row = await this.get(id, appId)
    if (!row) return { ok: false, error: '沙盒不存在' }
    if (!row.workspace) return { ok: false, error: '沙盒无工作目录——无法启动' }
    const spec: SandboxSpec = {
      ws: row.workspace, image: row.image, network: row.network, memoryMb: row.memory_mb, cpus: row.cpus,
    }
    const ok = await this.exe.ensure(row.id, spec)
    if (!ok) {
      await this.orm.query.update('sandboxes')
        .set({ status: 'error', error: '容器启动失败（docker 不可用或镜像缺失）', updated_at: ops.now() })
        .where({ id: { eq: row.id }})
        .run()
      return { ok: false, error: '容器启动失败（docker 不可用或镜像缺失）' }
    }
    await this.orm.query.update('sandboxes')
      .set({ status: 'running', error: null, last_used_at: ops.now(), updated_at: ops.now() })
      .where({ id: { eq: row.id }})
      .run()
    this.logEvent(String(row.id), String(appId), 'started')
    return { ok: true }
  }

  /** 停止（容器 stop——瞬态保留；状态 → stopped） */
  async stop(id: string, appId: string): Promise<{ ok: boolean; error?: string }> {
    sandboxEmit('stop', id, { appId })
    if (!this.orm) return { ok: false, error: '沙盒管理器未初始化' }
    const row = await this.get(id, appId)
    if (!row) return { ok: false, error: '沙盒不存在' }
    if (this.exe.isBusy(row.id)) return { ok: false, error: '沙盒正在执行任务——不能停止' }
    const r = await this.exe.containerAction(`ap-sandbox-${row.id}`, 'stop')
    if (!r.ok) return { ok: false, error: r.message }
    await this.orm.query.update('sandboxes')
      .set({ status: 'stopped', updated_at: ops.now() })
      .where({ id: { eq: row.id }})
      .run()
    this.logEvent(String(row.id), String(appId), 'stopped')
    return { ok: true }
  }

  /** 重启（stop + start） */
  async restart(id: string, appId: string): Promise<{ ok: boolean; error?: string }> {
    const s = await this.stop(id, appId)
    if (!s.ok) return s
    return this.start(id, appId)
  }

  /** 配置更新（快照变更 → 漂移重建——reconcile 检测） */
  async updateConfig(id: string, appId: string, patch: { image?: string; network?: boolean; memoryMb?: number; cpus?: number }): Promise<void> {
    if (!this.orm) return
    const set: Record<string, unknown> = { updated_at: ops.now() }
    if (patch.image !== undefined) set.image = patch.image
    if (patch.network !== undefined) set.network = patch.network
    if (patch.memoryMb !== undefined) set.memory_mb = patch.memoryMb
    if (patch.cpus !== undefined) set.cpus = patch.cpus
    await this.orm.query.update('sandboxes')
      .set(set)
      .where({ id: { eq: String(id) }, app_id: { eq: String(appId) }})
      .run()
  }

  /** agent 删除不级联沙盒（归属已移部门）；部门删除级联在路由层调 terminateByDepartment */
  async terminateByDepartment(departmentId: string): Promise<void> {
    if (!this.orm) return
    const rows = await this.orm.table('sandboxes', SHAPES.sandboxes).select()
      .where({ department_id: { eq: departmentId }, status: { ne: 'terminated' } })
      .run()
    for (const row of rows ?? []) {
      await this.terminate(String((row as any).id), String((row as any).app_id))
    }
  }

  // ── reconcile（60s：DB 期望 vs docker 实际） ───────

  startReaper(): void {
    if (this.timer || !this.orm) return
    this.timer = setInterval(() => { void this.reconcile() }, this.opts.reconcileIntervalMs)
    this.timer.unref?.()
  }

  async stopReaper(): Promise<void> {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  /** 对齐 DB 期望状态与 docker 实际状态（启动恢复 + 周期收敛） */
  async reconcile(): Promise<{ created: number; started: number; stopped: number; terminated: number; orphans: number }> {
    sandboxEmit('reconcile:start', undefined, {})
    const stats = { created: 0, started: 0, stopped: 0, terminated: 0, orphans: 0, error: 0 }
    if (!this.orm || this.reconciling) {
      sandboxEmit('reconcile:skip', undefined, { reason: this.reconciling ? 'already-running' : 'no-db' })
      return stats
    }
    this.reconciling = true
    try {
      const now = Date.now()
      // 1) 所有活跃记录（requested/running/stopped/error）
      const rows = (await this.orm.query.from('sandboxes')
        .select()
        .where({ status: { in: ['requested', 'running', 'stopped', 'error'] } })
        .run()) as SandboxRow[]
      // 2) docker 实际容器（一次查询——减少 CLI 往返）
      const containers = await this.exe.listContainers()
      const actual = new Map<string, { running: boolean; name: string }>()
      for (const c of containers) {
        const cid = String(c.name ?? '').replace('ap-sandbox-', '')
        actual.set(cid, { running: String(c.status ?? '').startsWith('Up'), name: String(c.name) })
      }
      const recordIds = new Set(rows.map(r => r.id))
      // 3) 孤儿清理：容器在、DB 无记录 → rm（容器无状态原则——数据在卷）
      for (const [cid, c] of actual) {
        if (!recordIds.has(cid)) {
          // 阶段 2：漂移检测（绕过点——容器存在但无记录/无事件——外部创建）
          sandboxEmit('reconcile:drift', cid, { reason: 'orphan', detail: '容器存在但 DB 无记录（绕过点——外部创建无事件）', action: 'rm' })
          await this.exe.containerAction(c.name, 'rm').catch(() => {})
          stats.orphans++
          this.counters.orphansCleaned++
        }
      }
      // 4) 逐记录对齐
      for (const row of rows) {
        const act = actual.get(row.id)
        if (this.exe.isBusy(row.id)) continue // busy 豁免——长任务不回收
        const lastUsed = row.last_used_at ? new Date(row.last_used_at).getTime() : new Date(row.created_at).getTime()
        if (row.status === 'running' || row.status === 'error' || row.status === 'requested') {
          if (row.status === 'error') stats.error++
          // 超龄重建（清瞬态残留）
          const created = new Date(row.created_at).getTime()
          if (row.status === 'running' && this.opts.maxLifetimeMs > 0 && now - created > this.opts.maxLifetimeMs && row.mode !== 'ephemeral') {
            // 阶段 2：生命周期事件（超龄重建——清瞬态残留）
            sandboxEmit('reconcile:drift', row.id, { reason: 'expired', detail: `超龄重建（${Math.round((now - created) / 60000)}min）`, action: 'recreate' })
            await this.exe.dispose(row.id).catch(() => {})
            stats.terminated++
            continue
          }
          // idle → stop（两级回收第一级）
          if (row.status === 'running' && now - lastUsed > this.opts.idleTimeoutMs && row.mode !== 'ephemeral') {
            // 阶段 2：生命周期事件（idle 回收——两级回收第一级——可审计）
            sandboxEmit('reconcile:idle-stop', row.id, { idleMs: now - lastUsed })
            await this.exe.containerAction(`ap-sandbox-${row.id}`, 'stop').catch(() => {})
            await this.orm.query.update('sandboxes')
              .set({ status: 'stopped', updated_at: ops.now() })
              .where({ id: { eq: row.id }})
              .run()
            stats.stopped++
            this.counters.idleStopped++
            continue
          }
          // 期望运行但容器缺失/停止 → 自愈（start/重建——惰性漂移自愈）
          if (row.status !== 'requested' && (!act || !act.running)) {
            // 阶段 2：漂移检测（期望 running 但容器缺失/停止——外部 stop/重建——绕过点）
            sandboxEmit('reconcile:drift', row.id, { reason: act ? 'container-stopped' : 'container-missing', detail: `期望 ${row.status} 但容器${act ? '已停止' : '缺失'}（外部操作无事件？）`, action: 'restart' })
            if (row.workspace) {
              const spec: SandboxSpec = { ws: row.workspace, image: row.image, network: row.network, memoryMb: row.memory_mb, cpus: row.cpus }
              const ok = await this.exe.ensure(row.id, spec)
              if (ok) {
                stats.started++
              this.counters.autoStarted++
                if (row.status === 'error') {
                  await this.orm.query.update('sandboxes')
                    .set({ status: 'running', error: null, updated_at: ops.now() })
                    .where({ id: { eq: row.id }})
                    .run()
                }
              }
            }
          }
        } else if (row.status === 'stopped') {
          // 停止超时 → terminate（两级回收第二级——释放磁盘）
          const stoppedAt = row.updated_at ? new Date(row.updated_at).getTime() : now
          if (now - stoppedAt > this.opts.stopTimeoutMs && row.mode !== 'ephemeral') {
            await this.exe.dispose(row.id).catch(() => {})
            await this.orm.query.update('sandboxes')
        .set({ status: 'terminated', terminated_at: ops.now(), updated_at: ops.now() })
        .where({ id: { eq: row.id }})
        .run()
            stats.terminated++
          }
        }
      }
      // 5) 历史清理：terminated 超过保留期 → 删除记录（JS 侧计算截止——与 make_interval 等价）
      await this.orm.query.delete('sandboxes')
        .where({ status: { eq: 'terminated' }, terminated_at: { lt: new Date(Date.now() - this.opts.historyRetentionDays * 86_400_000).toISOString() } })
        .run()
        .catch(() => {})
    } finally {
      this.reconciling = false
    }
    // P3-2 告警：环境 error 持续 → 日志 warn（可观测性）
    if (stats.error > 0) {
      console.warn(`[agent-platform] 沙盒 reconcile：${stats.error} 个环境处于 error 状态`)
    }
    // 阶段 4：事件日志 TTL 清理（保留 N 天——默认 7——历史归档）
    try {
      const retentionDays = Number(process.env.SANDBOX_EVENT_RETENTION ?? 7)
      await this.orm.query.delete('sandbox_events')
        .where({ created_at: { lt: new Date(Date.now() - retentionDays * 86_400_000).toISOString() } })
        .run()
    } catch { /* 清理失败不阻断 */ }
    sandboxEmit('reconcile:end', undefined, { ...stats })
    return stats
  }
}

// 单例（模块级共享——app 内所有 sandbox 共用同一个管理器；sql 由 server.ts 启动注入）
export const manager = new SandboxManager()
