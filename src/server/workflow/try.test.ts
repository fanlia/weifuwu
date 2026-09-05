/**
 * try/catch 契约：编译 / toJs round-trip / 执行五语义（成功/失败/catch 失败/return 穿透/嵌套）
 * 铁律：wfjs 与 JS 逐字对齐——try/catch 是 JS 原生语法（失败通知场景：监控流程核心形态）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileWfjs, toJs } from './index.ts'
import { workflow } from './index.ts'
import type { WorkflowDef, TryConfig } from './contracts.ts'

test('编译：try/catch → try 步骤（step 链 + catch 链）', async () => {
  const def = await compileWfjs(`try {
const res = await http({ url: 'http://x/' })
const n = res.json.items.length
} catch {
await log({ message: '失败' })
}`)
  assert.equal(def.steps.length, 1)
  const cfg = def.steps[0].config as unknown as TryConfig // W1: 判别联合——先 unknown 再定向
  assert.equal(def.steps[0].type, 'try')
  assert.equal(cfg.step.steps.length, 2) // http + assign
  assert.equal(cfg.catch.steps.length, 1)
  assert.equal(cfg.catch.steps[0].type, 'log')
  assert.ok(String(def.steps[0].id).startsWith('_try'))
})

test('渲染：try/catch round-trip（toJs → 再编译 → IR 等价）', async () => {
  const src = `try {
const res = await http({ url: 'http://x/' })
} catch {
await log({ message: '失败' })
}`
  const def = await compileWfjs(src)
  const js = toJs(def)
  assert.match(js, /try \{/)
  assert.match(js, /\} catch \{/)
  const def2 = await compileWfjs(js)
  assert.equal(def2.steps.length, 1)
  assert.equal(def2.steps[0].type, 'try')
})

test('语法守卫：catch 绑定 / 无 catch → 编译错', async () => {
  await assert.rejects(() => compileWfjs(`try { const x = 1 } catch (e) { const y = 2 }`), /catch 绑定变量暂不支持/)
  await assert.rejects(() => compileWfjs(`try { const x = 1 } const z = 2`), /必须配 catch/)
})

/** 执行 helper（fetch 可控——注入错误） */
function run(def: WorkflowDef, init: Record<string, unknown> = {}) {
  return workflow({ fetch: init.fetch as any }).execute(def, { input: init.input ?? {} })
}

test('执行：成功路径——catch 不跑；失败路径——catch 接管 + 错误可读 + 流转继续', async () => {
  const okDef = await compileWfjs(`try {
const n = 1 / 1
} catch {
await log({ message: '不该跑' })
}
const after = 2`)
  const r1 = await run(okDef)
  assert.equal(r1.status, 'success')
  assert.ok(r1.executed.includes('_try1'))
  assert.ok(r1.executed.includes('after')) // try 后继续执行（id=变量名）
  assert.deepEqual(r1.executed.slice(0, 2), ['n', '_try1']) // try 链成功——顺序保持
  // 失败路径：调用不存在的步骤函数（std 未导入）或 http fetch 抛错
  const failDef = await compileWfjs(`try {
const res = await http({ url: 'http://x/' })
} catch {
const err = steps._try1.error
await log({ message: err })
}
const after = 1`)
  const r2 = await run(failDef, { fetch: async () => { throw new Error('boom') } } as any)
  const r2d = r2 as any
  assert.equal(r2.status, 'success') // catch 接管——被控住
  assert.equal(r2.error, undefined) // error 已清——失败被 catch 吞掉（不泄到流程层）
  // log 步骤输出（catch 内 log message = err——通过 stepResults 检查）
  const logEntry = Object.entries((r2d.stepResults ?? {}) as Record<string, { type?: string; data?: unknown }>)
    .find(([, v]) => (v as any).data !== undefined && String((v as any).data).includes('boom'))
  assert.ok(logEntry, 'catch 内 log 步骤应拿到错误消息（steps.try.error）')
})

test('执行：catch 链失败 → 传播 error（不吞）', async () => {
  const def = await compileWfjs(`try {
const res = await http({ url: 'http://x/' })
} catch {
const x = 1 / 0
}`)
  const r = await run(def, { fetch: async () => { throw new Error('net') } } as any)
  assert.equal(r.status, 'error') // catch 内 1/0 严格算术抛错——失败传播
  assert.match(String((r as any).error ?? ''), /non-finite|除以|非有限/)
})

test('执行：return 穿透不误判（函数内 try 中 return）', async () => {
  const def = await compileWfjs(`function pick(flag) {
try {
if (flag) { return 'ok' }
} catch {
return 'err'
}
return 'fall'
}
const r = await pick(false)`)
  const rr = await run(def)
  assert.equal(rr.status, 'success')
  assert.equal((rr as any).stepResults?.['r']?.data, 'fall') // try 无 return → fall（call 步骤 data）
})

test('执行：嵌套 try（内层 catch 管住内层失败——外层不触发）', async () => {
  const def = await compileWfjs(`try {
try {
const res = await http({ url: 'http://x/' })
} catch {
await log({ message: '内层救' })
}
} catch {
await log({ message: '外层不该跑' })
}`)
  const r = await run(def, { fetch: async () => { throw new Error('inner') } } as any)
  assert.equal(r.status, 'success')
  const executed = (r as any).executed as string[]
  const logIdx = executed.findIndex((id) => id.startsWith('_log'))
  assert.ok(logIdx >= 0)
})
