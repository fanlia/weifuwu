/**
 * weifuwu/workflow/tojs — 渲染器：WorkflowDef → wfjs 源码（源码视图）
 *
 * 与 compileWfjs 对称（逆向）：round-trip 对账锚点 = compile(toJs(def)) ≡ normalize(def)。
 *
 * 规则（对称性约束——每题都要求 compile 对称）：
 *   - assign → `let t = v`（首次声明）/ `t = v`（后续）
 *   - if → `if (when) {` / `if once (when) {`（edge:true）
 *   - while/for → `while (c) {` / `for (const it of items) {`
 *   - return → `return` / `return <expr>`
 *   - 内建步骤 id 以 `_` 开头 → 裸调用（`await http({...})`）；否则绑定（`const id = await http({...})`）
 *   - 表达式反映射：steps.<id>.data → <id>；vars.<n> → n；loop.item → 循环变量（it/jt/…）
 *   - 嵌套循环变量名：it / jt / kt / …（字母顺序）——与生成器约定一致
 *   - 模板 {{expr}} → `${expr}`（模板串）；纯文本字段 → 字符串字面量
 */
import type { StepDef, WorkflowDef, AssignConfig, IfConfig, WhileConfig, ForConfig, ReturnConfig, TryConfig } from './contracts.ts'
import type { WorkflowImport } from './contracts.ts'
import { parse as parseExpr, toSrc } from './expression.ts'
import { FIELD_KIND } from './wfjs.ts'

/** DSL 预编译表达式 → wfjs 源码表达式（parse→路径反映射→toSrc 规范化） */
function toJsExpr(src: string, bind?: (segments: (string | number)[]) => boolean): string {
  const ast = parseExpr(src)
  const walk = (n: unknown): void => {
    const node = n as { kind?: string; segments?: (string | number)[]; left?: unknown; right?: unknown; operand?: unknown; cond?: unknown; then?: unknown; else?: unknown; args?: unknown[] }
    if (!node || typeof node !== 'object') return
    if (node.kind === 'path' && node.segments && bind?.(node.segments)) {
      // 路径重写（由 bind callback 替换 segments 内容）
      return
    }
    if (node.kind === 'ternary') { walk(node.cond); walk(node.then); walk(node.else); return }
    if (node.kind === 'call') { node.args?.forEach(walk); return }
    for (const k of ['left', 'right', 'operand'] as const) walk(node[k])
  }
  walk(ast)
  return toSrc(ast)
}

/**
 * DSL Def → wfjs 源码。
 * 绑定上下文（渲染子链时传入）：loop 变量名栈（表达式内 loop.item 反映射）
 */
export function toJs(def: WorkflowDef): string {
  const head = renderImports(def.imports)
  const fns = renderFunctions(def.functions)
  const body = renderChain(def.steps, {
    seenVars: new Set<string>(),
    loopNames: [] as string[],
    inReturn: false,
  }).trimEnd()
  const tail = renderExports(def.exports)
  const parts = [head, fns, body, tail].filter(Boolean)
  return parts.join('\n\n')
}

/** export 渲染（ESM 逐字——与 compileWfjs 对称） */
export function renderExports(exports?: WorkflowDef['exports']): string {
  if (!exports) return ''
  const lines: string[] = []
  if (exports.named.length) {
    lines.push(`export { ${exports.named.map((n) => n.as && n.as !== n.name ? `${n.name} as ${n.as}` : n.name).join(', ')} }`)
  }
  if (exports.default) lines.push(`export default ${exports.default}`)
  return lines.join('\n')
}

/** 函数定义渲染（源码视图——与 compileWfjs 对称） */
export function renderFunctions(functions?: WorkflowDef['functions']): string {
  if (!functions?.length) return ''
  return functions.map((f) => {
    const ctx: RenderCtx = { seenVars: new Set<string>(), loopNames: [], inReturn: false }
    const body = renderChain(f.step.steps, ctx)
    return `function ${f.name}(${f.params.join(', ')}) {\n${indent(body)}\n}`
  }).join('\n')
}

/** import 语句渲染（ESM 逐字——与 compileWfjs 对称） */
export function renderImports(imports?: WorkflowImport[]): string {
  if (!imports?.length) return ''
  return imports.map((imp) => {
    const names = imp.names.map((n) => n.as && n.as !== n.name ? `${n.name} as ${n.as}` : n.name).join(', ')
    return `import { ${names} } from '${imp.from}'`
  }).join('\n')
}

interface RenderCtx {
  seenVars: Set<string>
  /** 循环变量名栈（最新 = 当前循环体）——needed for loop.item → var 反映射 */
  loopNames: string[]
  inReturn: boolean
}

function renderChain(steps: StepDef[], ctx: RenderCtx): string {
  return steps.map((s) => renderStep(s, ctx)).join('\n')
}

/** 表达式反映射（prefix 替换）：steps.<id>.data / vars.<n> / loop.item → 源码名 */
function rewritePathExpr(src: string, ctx: RenderCtx): string {
  const map = (segments: (string | number)[]): (string | number)[] | null => {
    const [s0, s1, s2, ...rest] = segments
    // steps.<id>.data.<...> → <id>.<...>（id 非内建自动名时才有变量名对应）
    if (s0 === 'steps' && typeof s1 === 'string' && (s2 === 'data' || s2 === 'result') && !s1.startsWith('_')) {
      return [s1, ...segments.slice(3)]
    }
    if (s0 === 'vars' && typeof s1 === 'string') return [s1, ...segments.slice(2)]
    if (s0 === 'loop' && s1 === 'item') return [ctx.loopNames[ctx.loopNames.length - 1] ?? 'it', ...segments.slice(2)]
    return null
  }
  return rewritePath(src, map)
}

/** 路径重写通用（AST 级——避免字符串前缀误伤） */
function rewritePath(src: string, map: (segments: (string | number)[]) => (string | number)[] | null): string {
  const ast = parseExpr(src)
  const walk = (n: unknown): void => {
    const node = n as { kind?: string; segments?: (string | number)[]; left?: unknown; right?: unknown; operand?: unknown; cond?: unknown; then?: unknown; else?: unknown; args?: unknown[] }
    if (!node || typeof node !== 'object') return
    if (node.kind === 'path' && node.segments) {
      const mapped = map(node.segments)
      if (mapped) node.segments = mapped
      return
    }
    if (node.kind === 'ternary') { walk(node.cond); walk(node.then); walk(node.else); return }
    if (node.kind === 'call') { node.args?.forEach(walk); return }
    for (const k of ['left', 'right', 'operand'] as const) walk(node[k])
  }
  walk(ast)
  return toSrc(ast)
}

/** 值渲染：template 字段（{{expr}} → ${expr}；无插值 → 字符串字面量）；expr 字段 → 表达式源码 */
function renderValue(v: unknown, kind: 'template' | 'expr', ctx: RenderCtx): string {
  if (typeof v !== 'string') return JSON.stringify(v)
  if (kind === 'expr') return rewritePathExpr(v, ctx)
  // template：{{expr}} 段替换为 ${...}（现无插值 → 普通字符串）
  if (!v.includes('{{')) return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  let out = '`'
  let i = 0
  for (;;) {
    const start = v.indexOf('{{', i)
    if (start === -1) { out += v.slice(i).replace(/`/g, '\\`').replace(/\\/g, '\\\\'); break }
    out += v.slice(i, start).replace(/`/g, '\\`').replace(/\\/g, '\\\\')
    const end = v.indexOf('}}', start + 2)
    if (end === -1) break // 不闭合——防御
    out += '${' + rewritePathExpr(v.slice(start + 2, end), ctx) + '}'
    i = end + 2
  }
  return out + '`'
}

/** 对象参数渲染（http/email/ai/template/log 的 config）：`{ k: v, ... }` */
function renderObjectParams(type: string, config: Record<string, unknown>, ctx: RenderCtx): string {
  const parts: string[] = []
  for (const [key, v] of Object.entries(config)) {
    if (v === undefined) continue
    const kind = FIELD_KIND[type]?.[key] ?? 'template'
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      parts.push(`${key}: { ${renderObjectParams(type, v as Record<string, unknown>, ctx)} }`)
      continue
    }
    parts.push(`${key}: ${renderValue(v, kind, ctx)}`)
  }
  return parts.join(', ')
}

function renderBuiltin(step: StepDef, ctx: RenderCtx): string {
  const config = (step.config ?? {}) as Record<string, unknown>
  // call 步骤 → 函数调用（位置参数——表达式）
  if (step.type === 'call') {
    const args = (config.args as string[] ?? []).map((a) => rewritePathExpr(a, ctx)).join(', ')
    const call = `await ${config.name}(${args})`
    return step.id.startsWith('_') || step.id.includes(':') ? call : `const ${step.id} = ${call}`
  }
  // store 步骤 → 方法式调用（与 wfjs 源码对称：store.get(key) / store.set(key, value)）
  if (step.type === 'store') {
    const key = renderValue(String(config.key), 'template', ctx)
    const method = config.op === 'get' ? 'get' : 'set'
    const args = config.op === 'set' ? `${key}, ${renderValue(String(config.value ?? ''), 'template', ctx)}` : key
    const call = `await store.${method}(${args})`
    return step.id.startsWith('_') ? call : `const ${step.id} = ${call}`
  }
  const params = renderObjectParams(step.type, config, ctx)
  const call = `await ${step.type}({ ${params} })`
  return step.id.startsWith('_') ? call : `const ${step.id} = ${call}`
}

function renderStep(step: StepDef, ctx: RenderCtx): string {
  switch (step.type) {
    case 'assign': {
      const cfg = step.config as unknown as AssignConfig
      const value = rewritePathExpr(cfg.value, ctx)
      if (!ctx.seenVars.has(cfg.target)) {
        ctx.seenVars.add(cfg.target)
        return `let ${cfg.target} = ${value}`
      }
      return `${cfg.target} = ${value}`
    }
    case 'if': {
      const cfg = step.config as unknown as IfConfig
      const when = rewritePathExpr(cfg.when, ctx)
      const head = `if (${when}) {`
      const lines: string[] = [head]
      if (cfg.then?.steps.length) lines.push(indent(renderChain(cfg.then.steps, childLoopCtx(ctx))))
      if (cfg.else?.steps.length) {
        lines.push(cfg.then?.steps.length ? '} else {' : '} else {')
        lines.push(indent(renderChain(cfg.else.steps, childLoopCtx(ctx))))
      }
      lines.push('}')
      return lines.join('\n')
    }
    case 'try': {
      const cfg = step.config as unknown as TryConfig
      const lines = ['try {']
      if (cfg.step?.steps.length) lines.push(indent(renderChain(cfg.step.steps, childLoopCtx(ctx))))
      lines.push('} catch {')
      if (cfg.catch?.steps.length) lines.push(indent(renderChain(cfg.catch.steps, childLoopCtx(ctx))))
      lines.push('}')
      return lines.join('\n')
    }
    case 'while': {
      const cfg = step.config as unknown as WhileConfig
      const when = rewritePathExpr(cfg.when, ctx)
      return `while (${when}) {\n${indent(renderChain(cfg.step.steps, childLoopCtx(ctx)))}\n}`
    }
    case 'for': {
      const cfg = step.config as unknown as ForConfig
      const items = rewritePathExpr(cfg.items, ctx)
      const loopName = `it${ctx.loopNames.length}`
      return `for (const ${loopName} of ${items}) {\n${indent(renderChain(cfg.step.steps, { ...ctx, loopNames: [...ctx.loopNames, loopName] }))}\n}`
    }
    case 'return': {
      const cfg = step.config as unknown as ReturnConfig
      return cfg.value !== undefined ? `return ${rewritePathExpr(cfg.value, ctx)}` : 'return'
    }
    default:
      return renderBuiltin(step, ctx)
  }
}

function childLoopCtx(ctx: RenderCtx): RenderCtx {
  return { ...ctx, inReturn: false }
}

function indent(s: string): string {
  return s.split('\n').map((l) => '  ' + l).join('\n')
}
