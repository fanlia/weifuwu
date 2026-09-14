/**
 * weifuwu/workflow/views — 视图适配纯函数（DSL → 客户端可视化数据）
 *
 * 架构约定：DSL 是枢纽真相；本模块只做**纯数据转换**（零组件依赖）——
 * 组件库（Pipeline/JsonSchemaForm）直接消费输出。契约测试锁定形状。
 */
import type { WorkflowDef } from './contracts.ts'
import type { StepSchema } from './validate.ts'

// ── JsonSchema（与 client JsonSchemaForm 同构——server 侧独立声明，鸭子匹配） ──────

export interface WorkflowJsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null'
  title?: string
  description?: string
  properties?: Record<string, WorkflowJsonSchema>
  required?: string[]
  enum?: (string | number)[]
  items?: WorkflowJsonSchema
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  placeholder?: string
}

/**
 * stepSchemas() → JsonSchemaForm 消费的 JsonSchema（对象子集）。
 * 结构：顶层 object；每步骤类型一个 properties 键（object + 字段 properties + required）。
 * 字段 type 映射：'string'→string（Input）；扩展 'number'/'boolean' 预留（fields.type 声明能力 v2）。
 */
export function toJsonSchema(schemas: { type: string; label?: string; fields?: StepSchema['fields']; required?: string[] }[]): WorkflowJsonSchema {
  const properties: Record<string, WorkflowJsonSchema> = {}
  for (const s of schemas) {
    const fieldProps: Record<string, WorkflowJsonSchema> = {}
    for (const f of s.fields ?? []) {
      fieldProps[f.name] = {
        type: f.type === 'number' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string',
        title: f.label,
        placeholder: f.placeholder,
      }
    }
    properties[s.type] = {
      type: 'object',
      title: s.label,
      properties: fieldProps,
      ...(s.required && s.required.length ? { required: s.required } : {}),
    }
  }
  return { type: 'object', title: 'Workflow', properties }
}

// ── DAG（Pipeline 组件消费：nodes + edges） ─────────────────

export interface DagNode {
  id: string
  label: string
}
export interface DagEdge {
  from: string
  to: string
}
export interface WorkflowDag {
  nodes: DagNode[]
  edges: DagEdge[]
}

const STEP_LABELS: Record<string, string> = {
  http: 'HTTP', assign: '赋值', call: '调用', if: '条件', while: '循环',
  for: '遍历', return: '返回', store: '存储', email: '邮件', ai: 'AI',
  template: '模板', log: '日志',
}

/** 子链折叠摘要（if: then×2/else×1；while/for: ×3 子步骤） */
function chainSummary(type: string, steps: unknown[] | undefined, elseSteps?: unknown[] | undefined): string {
  if (type === 'if') {
    const thenN = steps?.length ?? 0
    const elseN = elseSteps?.length ?? 0
    return `then×${thenN}${elseN ? `/else×${elseN}` : ''}`
  }
  if (type === 'while' || type === 'for') return `×${steps?.length ?? 0} 子步骤`
  return ''
}

/**
 * WorkflowDef → Pipeline 数据（v0：顶层线性链——子链折叠进节点标签）。
 * 仅主流程 steps（函数库由函数管理视图处理）；0 步 → 空图。
 */
export function workflowToDag(def: WorkflowDef, opts?: { labels?: Record<string, string> }): WorkflowDag {
  const labels = opts?.labels ?? {}
  const nodes: DagNode[] = []
  const edges: DagEdge[] = []
  const steps = def.steps ?? []
  for (const [i, s] of steps.entries()) {
    const cfg = (s.config ?? {}) as Record<string, unknown>
    let label = `${labels[s.type] ?? STEP_LABELS[s.type] ?? s.type} ${s.id}`
    if (s.type === 'if') {
      const then = (cfg.then as { steps?: unknown[] } | undefined)?.steps
      const els = (cfg.else as { steps?: unknown[] } | undefined)?.steps
      const sum = chainSummary('if', then, els)
      if (sum) label += `（${sum}）`
    } else if (s.type === 'while' || s.type === 'for') {
      const sub = (cfg.step as { steps?: unknown[] } | undefined)?.steps
      const sum = chainSummary(s.type, sub)
      if (sum) label += `（${sum}）`
    }
    nodes.push({ id: s.id, label })
    if (i > 0) edges.push({ from: steps[i - 1].id, to: s.id })
  }
  return { nodes, edges }
}

// ── 步骤参数编辑补丁（UI 表单 → DSL——纯函数——路径定位 + config 合并——不重建 id/type） ──

export type StepPathToken = number | 'then' | 'else' | 'step'
export type StepPath = StepPathToken[]

/** 定位并替换 config（深路径：number → steps[i]；'then'/'else'/'step' → config.X.steps 下钻）
 *  返回新 def（原对象不变——纯函数）；路径越界/类型不符抛错（UI 层良性失败） */
export function patchStepConfig(def: WorkflowDef, path: StepPath, patch: Record<string, unknown>): WorkflowDef {
  if (path.length === 0) throw new Error('patchStepConfig: 路径不能为空')
  const clone = (node: unknown): unknown => (node && typeof node === 'object' ? JSON.parse(JSON.stringify(node)) : node)
  const root = clone(def) as WorkflowDef
  // 游标定位（root.steps 链）
  let arr = root.steps as Array<Record<string, any>>
  let cursor: Record<string, any> | null = null
  for (let i = 0; i < path.length; i++) {
    const tk = path[i]
    if (typeof tk === 'number') {
      if (!arr || !arr[tk]) throw new Error(`patchStepConfig: 步骤索引 ${tk} 越界`)
      cursor = arr[tk]
      // 若还有下一 token 且是链 token——下钻 config.step / config.then / config.else
      const next = path[i + 1]
      if (typeof next === 'string') {
        const cfg = (cursor.config ?? {}) as Record<string, any>
        const sub = cfg[next] as { steps?: Array<Record<string, any>> } | undefined
        if (next === 'step' && !sub?.steps) throw new Error(`patchStepConfig: 步骤 ${arr[tk].id} 无子链（step）`)
        if ((next === 'then' || next === 'else') && !sub?.steps) throw new Error(`patchStepConfig: 步骤 ${arr[tk].id} 无子链（${next}）`)
        arr = sub?.steps ?? []
        i++ // 链 token 已消费
      } else if (i !== path.length - 1) {
        throw new Error('patchStepConfig: 链 token（then/else/step）后必须跟索引')
      }
    }
  }
  if (!cursor) throw new Error('patchStepConfig: 定位失败')
  cursor.config = { ...(cursor.config ?? {}), ...patch }
  return root
}

// ── 步骤增删（编辑器另一半——insert/remove 同样 DSL 单实现——id 服务端生成防撞） ──

/** 锚点定位：anchor 步骤 id（def 全树搜索——唯一）+ 可选链 token（then/else/step——nested 及 N 层）
 *  顶层：anchor=null + [[]] 顶层末尾；子链：anchor=if 步骤 id + ['then'] */
const findById = (list: Array<Record<string, any>>, id: string): Record<string, any> | null => {
  for (const s of list) {
    if (String(s.id) === id) return s
    const cfg = (s.config ?? {}) as Record<string, any>
    for (const seg of ['then', 'else', 'step'] as const) {
      const sub = cfg[seg] as { steps?: Array<Record<string, any>> } | undefined
      if (sub?.steps) {
        const hit = findById(sub.steps, id)
        if (hit) return hit
      }
    }
  }
  return null
}

/** 插入：anchor（步骤 id——null=顶层）+ 链 token 列表 → 目标数组末尾追加
 *  v0 语义："在 X 步骤的 then/else/step 链末尾加一步"——id 锚定无歧义 */
export function insertStep(
  def: WorkflowDef,
  anchor: string | null,
  chain: ('then' | 'else' | 'step')[],
  step: { type: string; config: Record<string, unknown> },
): WorkflowDef {
  const root = JSON.parse(JSON.stringify(def)) as WorkflowDef
  let arr: Array<Record<string, any>>
  if (anchor === null) {
    if (chain.length > 0) throw new Error('insert: 顶层锚点（anchor=null）不能指定子链——请用步骤 id 锚点')
    arr = root.steps as Array<Record<string, any>>
  } else {
    if (chain.length !== 1) throw new Error('insert: v0 仅支持单段链（then/else/step 之一）——多段嵌套链编辑器暂不支持')
    const parent = findById(root.steps as Array<Record<string, any>>, anchor)
    if (!parent) throw new Error(`insert: 锚点步骤 ${anchor} 不存在`)
    const cfg = (parent.config ?? {}) as Record<string, any>
    const sub = cfg[chain[0]] as { steps?: Array<Record<string, any>> } | undefined
    if (!sub?.steps) throw new Error(`insert: 步骤 ${parent.id} 无子链（${chain[0]}）`)
    arr = sub.steps as Array<Record<string, any>>
  }
  // id 生成：_{type}{n} 自增避撞（确定性）
  const used = new Set<string>()
  const collect = (list: Array<Record<string, any>>): void => {
    for (const s of list) {
      used.add(String(s.id))
      const cfg = (s.config ?? {}) as Record<string, any>
      for (const seg of ['then', 'else', 'step'] as const) {
        const sub = cfg[seg] as { steps?: Array<Record<string, any>> } | undefined
        if (sub?.steps) collect(sub.steps)
      }
    }
  }
  collect(root.steps as Array<Record<string, any>>)
  let id = `_${step.type}${arr.length + 1}`
  let n = 1
  while (used.has(id)) id = `_${step.type}${arr.length + 1 + n++}`
  arr.push({ id, type: step.type, config: { ...step.config } })
  return root
}

/** 删除步骤（深路径同 set——级联删除子链）——找不到抛错 */
export function removeStep(def: WorkflowDef, path: StepPath): WorkflowDef {
  const root = JSON.parse(JSON.stringify(def)) as WorkflowDef
  if (path.length === 0) throw new Error('removeStep: 路径不能为空')
  // 复用 patch 定位思路——定位到父数组 + 索引
  let arr = root.steps as Array<Record<string, any>>
  let idx = -1
  for (let i = 0; i < path.length; i++) {
    const tk = path[i]
    if (typeof tk === 'number') {
      if (!arr[tk]) throw new Error(`removeStep: 步骤索引 ${tk} 越界`)
      idx = tk
      const next = path[i + 1]
      if (typeof next === 'string') {
        const cfg = (arr[tk].config ?? {}) as Record<string, any>
        const sub = cfg[next] as { steps?: Array<Record<string, any>> } | undefined
        if (!sub?.steps) throw new Error(`removeStep: 步骤 ${arr[tk].id} 无子链（${next}）`)
        arr = sub.steps as Array<Record<string, any>>
        i++
      }
    }
  }
  if (idx < 0) throw new Error('removeStep: 定位失败')
  arr.splice(idx, 1)
  return root
}
