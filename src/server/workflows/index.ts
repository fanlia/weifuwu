/**
 * weifuwu/workflows — workflow 系统（声明式执行引擎的存储/编排层）
 *
 * 定位（对齐 messager/user 模式）：框架管理系统——引擎（`./workflow/` 语言+执行）
 * 是纯能力，本系统补上存储/CRUD/执行记录/路由，消费方（agent-platform 等）只做 UI。
 *
 * 架构：def_json 为枢纽真相（DSL）；src_wfjs 为源码视图（toJs 渲染——审计用）。
 * 编译门：wfjs → compileWfjs → engine.validate → 通过才入库（LLM 生成/编辑共用闸门）。
 *
 * ```
 * const wfs = workflowSystem({ sql, redis })   // redis 可选（store 步骤）
 * app.use(wfs)                                  // ctx.wf 注入（execute/compileGate/views）
 * await wfs.migrate()                           // 幂等建表 _weifuwu_workflows / _weifuwu_workflow_runs
 * wfs.routes(app, { appId: (ctx) => ctx.auth.appId })  // 内置 API（可选挂载）
 * ```
 */
import type { SqlClient } from '../postgres/types.ts'
import type { Redis } from '../db/contracts.ts'
import type { Context, Handler } from '../types.ts'
import type { Router } from '../core/router.ts'
import { workflow, redisStore } from '../workflow/index.ts'
import { compileWfjs, toJs, toJsonSchema, workflowToDag } from '../workflow/index.ts'
import type { WorkflowDef, ValidationResult } from '../workflow/index.ts'

const WORKFLOWS = '_weifuwu_workflows'
const RUNS = '_weifuwu_workflow_runs'

export interface WorkflowRecord {
  id: string
  app_id: string
  name: string
  description: string | null
  def_json: WorkflowDef
  src_wfjs: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface WorkflowRunRecord {
  id: string
  app_id: string
  workflow_id: string
  trigger: string
  status: string
  args_json: unknown
  result_json: unknown
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface CompileGateInput {
  wfjs?: string
  def?: unknown
}

export interface WorkflowSystem {
  (req: Request, ctx: Context, next: Handler<Context>): Response | Promise<Response>
  __meta?: { injects: string[]; depends: string[] }
  /** 注入面（ctx.wf——消费方路由/服务层直接调用） */
  wf: WorkflowClient
  /** 核心 CRUD（测试/服务层直接调用；routes 为薄壳） */
  crud: WorkflowCrud
  /** 幂等建表（_weifuwu_workflows / _weifuwu_workflow_runs） */
  migrate: () => Promise<void>
  /** 内置 HTTP 路由（可选挂载）：/prefix/*——缺省 prefix=/api/workflows、appId 取 ctx.auth.appId（user 中间件会话透传） */
  routes: (app: Router<any>, opts?: { prefix?: string; appId?: (ctx: Context) => string | undefined }) => void
}

/** ctx.wf 注入面（消费方直接调用——与引擎同源） */
export interface WorkflowClient {
  /** 编译门：wfjs/def → validate → { def, wfjs 渲染 }（错抛） */
  compileGate: (input: CompileGateInput) => Promise<{ def: WorkflowDef; wfjs: string }>
  /** 校验已存 DSL（执行前闸门） */
  validate: (def: unknown) => ValidationResult
  /** 执行（appId 显式隔离——返回 run 记录——status success/error + result_json） */
  execute: (appId: string, workflowId: string, args: Record<string, unknown>, trigger?: string) => Promise<WorkflowRunRecord>
  /** 执行（直接 def——不落库——测试/嵌入用） */
  executeDef: (def: WorkflowDef, args: Record<string, unknown>) => Promise<{ status: string; result: unknown; error: string | null }>
  /** 视图适配（UI 消费） */
  dag: (def: WorkflowDef) => ReturnType<typeof workflowToDag>
  schema: () => ReturnType<typeof toJsonSchema>
  defToWfjs: (def: WorkflowDef) => string
}

export interface WorkflowCrud {
  create: (appId: string, input: { name: string; wfjs?: string; def?: unknown; description?: string }) => Promise<WorkflowRecord>
  list: (appId: string, opts?: { offset?: number; limit?: number }) => Promise<WorkflowRecord[]>
  get: (appId: string, id: string) => Promise<WorkflowRecord | null>
  update: (appId: string, id: string, input: { name?: string; wfjs?: string; def?: unknown }) => Promise<boolean>
  remove: (appId: string, id: string) => Promise<boolean>
  listRuns: (appId: string, workflowId: string, opts?: { offset?: number; limit?: number }) => Promise<WorkflowRunRecord[]>
  getRun: (appId: string, workflowId: string, runId: string) => Promise<WorkflowRunRecord | null>
}

export interface WorkflowSystemOptions {
  sql: SqlClient
  /** Redis（可选——store 步骤后端；不传则 store 步骤报"未注入"明确错误） */
  redis?: Redis
  prefix?: string
}

export function workflowSystem(options: WorkflowSystemOptions): WorkflowSystem {
  const { sql, redis } = options
  const engine = workflow({
    store: redis ? redisStore(redis as never) : undefined,
  })

  // ── 编译门 ──
  const compileGate = async ({ wfjs, def }: CompileGateInput): Promise<{ def: WorkflowDef; wfjs: string }> => {
    if (typeof wfjs === 'string') {
      const compiled = await compileWfjs(wfjs) // v0 无 remoteFetch：远程导入 = 编译错（出网策略安全线）
      const v = engine.validate(compiled)
      if (!v.ok) throw new Error(`wfjs 编译通过但校验失败：${v.errors.map((e) => `${e.path}: ${e.message}`).join('；')}`)
      return { def: compiled, wfjs: toJs(compiled) }
    }
    if (def) {
      const v = engine.validate(def)
      if (!v.ok) throw new Error(`DSL 校验失败：${v.errors.map((e) => `${e.path}: ${e.message}`).join('；')}`)
      const valid = def as WorkflowDef
      return { def: valid, wfjs: toJs(valid) }
    }
    throw new Error('创建 workflow 需要 wfjs 源码或 DSL def')
  }

  // ── 执行（def 直接跑——结果不落库；落库路径在 crud.executeRun） ──
  const executeDef = async (def: WorkflowDef, args: Record<string, unknown>) => {
    try {
      const result = await engine.execute(def, { input: args })
      return { status: result.status, result, error: result.status === 'error' ? (result.error ?? '执行失败') : null }
    } catch (e) {
      return { status: 'error' as const, result: null, error: (e as Error).message }
    }
  }

  // ── 核心 CRUD ──
  const FIELDS = 'id, app_id, name, description, def_json, src_wfjs, status, created_at, updated_at'
  const RUN_FIELDS = 'id, app_id, workflow_id, trigger, status, args_json, result_json, error, started_at, finished_at, created_at'
  /** jsonb 列反序列化（store 字符串 → 对象——DB 层不自动 parse） */
  const parseJson = (v: unknown): unknown => (typeof v === 'string' ? JSON.parse(v) : v)
  const toRecord = (row: Record<string, unknown>): WorkflowRecord => ({ ...(row as unknown as WorkflowRecord), def_json: parseJson(row.def_json) as WorkflowDef })
  const toRun = (row: Record<string, unknown>): WorkflowRunRecord => ({
    ...(row as unknown as WorkflowRunRecord),
    args_json: parseJson(row.args_json), result_json: parseJson(row.result_json),
  })
  const crud: WorkflowCrud = {
    async create(appId, input) {
      const { def, wfjs } = await compileGate(input)
      const rows = await sql.query.insert(WORKFLOWS)
        .values({
          app_id: appId, name: input.name, description: input.description ?? null,
          def_json: JSON.stringify(def), src_wfjs: wfjs,
        })
        .returning(...FIELDS.split(', '))
        .run()
      return toRecord(rows[0] as Record<string, unknown>)
    },
    async list(appId, opts) {
      const offset = opts?.offset ?? 0
      const limit = Math.min(100, Math.max(1, opts?.limit ?? 50))
      const rows = await sql.query.from(WORKFLOWS)
        .where({ app_id: appId })
        .select(...FIELDS.split(', '))
        .orderBy('updated_at', 'desc')
        .limit(limit)
        .offset(offset)
        .run()
      return rows.map((r) => toRecord(r as Record<string, unknown>))
    },
    async get(appId, id) {
      const rows = await sql.query.from(WORKFLOWS)
        .where({ app_id: appId, id })
        .select(...FIELDS.split(', '))
        .limit(1)
        .run()
      return rows[0] ? toRecord(rows[0] as Record<string, unknown>) : null
    },
    async update(appId, id, input) {
      const exists = await sql.query.from(WORKFLOWS).where({ app_id: appId, id }).select('id').limit(1).run()
      if (!exists[0]) return false
      let gated: { def: WorkflowDef; wfjs: string } | null = null
      if (input.wfjs !== undefined || input.def !== undefined) gated = await compileGate(input)
      const sets: Record<string, unknown> = {}
      if (input.name !== undefined) sets.name = input.name
      if (gated) { sets.def_json = JSON.stringify(gated.def); sets.src_wfjs = gated.wfjs }
      sets.updated_at = new Date().toISOString()
      await sql.query.update(WORKFLOWS).set(sets).where({ app_id: appId, id }).run()
      return true
    },
    async remove(appId, id) {
      await sql.query.delete(WORKFLOWS).where({ app_id: appId, id }).run()
      return true
    },
    async listRuns(appId, workflowId, opts) {
      const offset = opts?.offset ?? 0
      const limit = Math.min(100, Math.max(1, opts?.limit ?? 50))
      const rows = await sql.query.from(RUNS)
        .where({ app_id: appId, workflow_id: workflowId })
        .select(...RUN_FIELDS.split(', '))
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .run()
      return rows.map((r) => toRun(r as Record<string, unknown>))
    },
    async getRun(appId, workflowId, runId) {
      const rows = await sql.query.from(RUNS)
        .where({ app_id: appId, id: runId, workflow_id: workflowId })
        .select(...RUN_FIELDS.split(', '))
        .limit(1)
        .run()
      return rows[0] ? toRun(rows[0] as Record<string, unknown>) : null
    },
  }

  // ── 执行并落库（POST /:id/runs） ──
  const executeRun = async (appId: string, workflowId: string, args: Record<string, unknown>, trigger = 'manual'): Promise<WorkflowRunRecord> => {
    const rec = await crud.get(appId, workflowId)
    if (!rec) throw new Error('workflow 不存在')
    const r = await executeDef(rec.def_json, args)
    const rows = await sql.query.insert(RUNS)
      .values({
        app_id: appId, workflow_id: workflowId, trigger, status: r.status,
        args_json: JSON.stringify(args), result_json: JSON.stringify(r.result),
        error: r.error, started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      })
      .returning(...RUN_FIELDS.split(', '))
      .run()
    return toRun(rows[0] as Record<string, unknown>)
  }

  const wf: WorkflowClient = {
    compileGate,
    validate: (def) => engine.validate(def),
    execute: executeRun,
    executeDef,
    dag: (def) => workflowToDag(def),
    schema: () => toJsonSchema(engine.stepSchemas()),
    defToWfjs: (def) => toJs(def),
  }

  // ── 中间件（ctx.wf 注入）──
  const mw = (async (req: Request, ctx: Context, next: Handler<Context>) => {
    ;(ctx as Record<string, unknown>).wf = wf
    return next(req, ctx)
  }) as WorkflowSystem

  mw.wf = wf
  mw.crud = crud
  mw.__meta = { injects: ['wf'], depends: [] }

  // ── 幂等建表 ──
  mw.migrate = async () => {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${WORKFLOWS} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        app_id UUID NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        def_json JSONB NOT NULL,
        src_wfjs TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_wf_workflows_app ON ${WORKFLOWS} (app_id, updated_at DESC)`)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${RUNS} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        app_id UUID NOT NULL,
        workflow_id UUID NOT NULL REFERENCES ${WORKFLOWS}(id) ON DELETE CASCADE,
        trigger TEXT NOT NULL DEFAULT 'manual',
        status TEXT NOT NULL DEFAULT 'queued',
        args_json JSONB,
        result_json JSONB,
        error TEXT,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_wf_runs_app ON ${RUNS} (app_id, created_at DESC)`)
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_wf_runs_wf ON ${RUNS} (workflow_id, created_at DESC)`)
  }

  // ── 内置路由（可选挂载；appId 提取器缺省 ctx.user?.appId） ──
  mw.routes = (app: Router<any>, opts?: { prefix?: string; appId?: (ctx: Context) => string | undefined }) => {
    const p = opts?.prefix ?? options.prefix ?? '/api/workflows'
    // 缺省：框架 user() 会话透传的 ctx.auth.appId（应用上下文）；无 appId 场景 = 无数据（安全拒绝）
    const getAppId = opts?.appId ?? ((ctx: Context) => (ctx.auth as Record<string, unknown> | undefined)?.appId as string | undefined)
    const appIdOr = (ctx: Context): string => {
      const id = getAppId(ctx)
      if (!id) throw new Error('workflow route 需要 appId（应用上下文）')
      return id
    }
    const json = (data: unknown, status = 200): Response => Response.json(data, { status })

    app.get(`${p}/meta`, async (_req, ctx) => json({ schemas: wf.schema() }))
    app.get(`${p}`, async (req, ctx) => {
      const url = new URL(req.url)
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10))
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
      return json({ workflows: await crud.list(appIdOr(ctx), { offset, limit }) })
    })
    app.post(`${p}`, async (req, ctx) => {
      const body = (await req.json().catch(() => ({}))) as { name?: string; wfjs?: string; def?: unknown; description?: string }
      if (!body?.name) return json({ error: '必填：name' }, 400)
      try {
        const rec = await crud.create(appIdOr(ctx), body as { name: string; wfjs?: string; def?: unknown })
        return json({ ok: true, workflow: rec }, 201)
      } catch (e) {
        return json({ error: (e as Error).message }, 400)
      }
    })
    app.get(`${p}/:id`, async (_req, ctx) => {
      const rec = await crud.get(appIdOr(ctx), ctx.params.id)
      if (!rec) return json({ error: 'workflow 不存在' }, 404)
      return json({ workflow: { ...rec, dag: wf.dag(rec.def_json) } })
    })
    app.put(`${p}/:id`, async (req, ctx) => {
      const body = (await req.json().catch(() => ({}))) as { name?: string; wfjs?: string; def?: unknown }
      try {
        const ok = await crud.update(appIdOr(ctx), ctx.params.id, body)
        return ok ? json({ ok: true }) : json({ error: 'workflow 不存在' }, 404)
      } catch (e) {
        return json({ error: (e as Error).message }, 400)
      }
    })
    app.delete(`${p}/:id`, async (_req, ctx) => {
      await crud.remove(appIdOr(ctx), ctx.params.id)
      return json({ ok: true })
    })
    app.post(`${p}/:id/runs`, async (req, ctx) => {
      const body = (await req.json().catch(() => ({}))) as { args?: Record<string, unknown> }
      try {
        const run = await executeRun(appIdOr(ctx), ctx.params.id, body.args ?? {})
        return json({ ok: true, run }, 201)
      } catch (e) {
        return json({ error: (e as Error).message }, 400)
      }
    })
    app.get(`${p}/:id/runs`, async (req, ctx) => {
      const url = new URL(req.url)
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10))
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
      return json({ runs: await crud.listRuns(appIdOr(ctx), ctx.params.id, { offset, limit }) })
    })
    app.get(`${p}/:id/runs/:runId`, async (_req, ctx) => {
      const run = await crud.getRun(appIdOr(ctx), ctx.params.id, ctx.params.runId)
      return run ? json({ run }) : json({ error: 'run 不存在' }, 404)
    })
  }

  return mw
}
