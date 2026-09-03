/**
 * workflow/tojs 契约：DSL → wfjs 源码（源码视图渲染器）
 *
 * 对账定义（IR 锚点）：compile 产物已规范化（expr = toSrc 形）——
 * round-trip 深比较严格相等：compile(toJs(def)) ≡ def。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compileWfjs } from './wfjs.ts'
import { toJs } from './tojs.ts'
import type { WorkflowDef } from './contracts.ts'

describe('tojs: 渲染规则', () => {
  it('assign → let/赋值（首次声明语义）', async () => {
    const def = await compileWfjs(`let n = 0\nn += 2\nn = 3`)
    assert.equal(toJs(def), `let n = 0\nn = (n + 2)\nn = 3`)
  })
  it('if/else → 分支 + else', async () => {
    const def = await compileWfjs(`let n = 5\nif (n > 1) { await log({ message: 'a' }) } else { await log({ message: 'b' }) }`)
    const js = toJs(def)
    assert.match(js, /\nif \(\(n > 1\)\) \{/)
    assert.match(js, /\} else \{/)
  })
  it('块级遮蔽 round-trip（mangle 内部名 x$1 → 渲染 → 恒等）', async () => {
    const d1 = await compileWfjs(`let x = 1
if (x > 0) { let x = 2
const y = x + 1 }
const z = x`)
    const js = toJs(d1)
    assert.match(js, /let x\$1 = 2/)
    assert.match(js, /let z = x/)
    const d2 = await compileWfjs(js)
    assert.deepEqual(d2, d1)
  })
  it('import 语句渲染（ESM 逐字往返）', async () => {
    const def = await compileWfjs(`import { store } from 'wf://std/store'\nimport { sum as add } from 'wf://std/math'\nlet n = add(1)`)
    const js = toJs(def)
    assert.match(js, /^import \{ store \} from 'wf:\/\/std\/store'$/m)
    assert.match(js, /^import \{ sum as add \} from 'wf:\/\/std\/math'$/m)
    const d2 = await compileWfjs(js)
    assert.deepEqual(d2, def)
  })
  it('store 方法调用往返（get/set → 渲染对称）', async () => {
    const def = await compileWfjs(`import { store } from 'wf://std/store'\nconst sent = await store.get('k:1')\nawait store.set('k:1', 'v')`)
    const js = toJs(def)
    assert.match(js, /const sent = await store\.get\('k:1'\)/)
    assert.match(js, /await store\.set\('k:1', 'v'\)/)
    assert.deepEqual(await compileWfjs(js), def)
  })
  it('while/for → 循环语句 + loop 变量反映射', async () => {
    const def = await compileWfjs(`let n = 0\nlet list = input.rows\nwhile (n < 3) { n = n + 1 }\nfor (const it of list) { await log({ message: \`行 \${it.name}\` }) }`)
    const js = toJs(def)
    assert.match(js, /\nwhile \(\(n < 3\)\) \{/)
    assert.match(js, /for \(const it0 of list\) \{\n/)
    assert.match(js, /\$\{it0\.name\}/)
    // 循环内引用外层变量
    const def2 = await compileWfjs(`let list = input.rows\nlet n = 5\nfor (const it of list) { const r = await log({ message: n }) }`)
    const js2 = toJs(def2)
    assert.match(js2, /await log\(\{ message: \`\$\{n\}\` \}\)/)
  })
  it('return（无值/带值）', async () => {
    assert.equal(toJs(await compileWfjs(`return`)), 'return')
    assert.equal(toJs(await compileWfjs(`let n = 1\nreturn n + 1`)), 'let n = 1\nreturn (n + 1)')
  })
  it('绑定调用（const 变量名）+ 裸调用（_ 前缀）', async () => {
    const def = await compileWfjs(`const res = await http({ url: 'u' })\nawait log({ message: 'x' })`)
    const js = toJs(def)
    assert.equal(js, `const res = await http({ url: 'u' })\nawait log({ message: 'x' })`)
    // 绑定引用反映射：res.json → steps 路径还原
    const def2 = await compileWfjs(`const res = await http({ url: 'u' })\nif (res.json.n > 1) {}`)
    assert.match(toJs(def2), /\nif \(\(res\.json\.n > 1\)\)/) // 反映射掉 steps.res.data
  })
  it('模板串 → {{}} → ${} 往返', async () => {
    const def = await compileWfjs('let n = 1\nlet m = 2\nconst r = await http({ url: `u?p=${n}&q=${m + 1}` })')
    const js = toJs(def)
    assert.equal(js, 'let n = 1\nlet m = 2\nconst r = await http({ url: `u?p=${n}&q=${(m + 1)}` })')
  })
})

describe('tojs: round-trip 对账（fuzz——IR 锚点）', () => {
  it('函数定义/调用渲染对称（round-trip）', async () => {
    const d1 = await compileWfjs(`function pay(amount, rate) {
  let fee = amount * rate
  if (fee > 100) { fee = fee - 10 }
  return fee + amount
}
const a = await pay(100, 0.1)
const b = await pay(a, 0.2)`)
    const js = toJs(d1)
    assert.match(js, /^function pay\(amount, rate\) \{$/m)
    assert.match(js, /const a = await pay\(100, 0\.1\)/)
    assert.match(js, /const b = await pay\(a, 0\.2\)/)
    const d2 = await compileWfjs(js)
    assert.deepEqual(d2, d1)
  })

  it('库存监控示例：compile → toJs → compile 深比较', async () => {
    const src = `import { store } from 'wf://std/store'
const res = await http({ url: 'https://api.test/stock' })
const sent = await store.get('stock:sent')
if (res.json.items.length > 0 && sent !== '1') {
  const msg = await ai({ prompt: \`库存：\${res.json.items.length}\` })
  await email({ to: 'ops@x.com', subject: '预警', body: msg.text })
  await store.set('stock:sent', '1')
}`
    const d1 = await compileWfjs(src)
    const d2 = await compileWfjs(toJs(d1))
    assert.deepEqual(d2, d1)
    // 再验证渲染稳定（幂等）：toJs(toJs 的产物) 同形
    assert.equal(toJs(d2), toJs(d1))
  })

  it('fuzz：随机程序 × 5 种子 × 100 样本 round-trip 恒等', async () => {
    for (let seed = 1; seed <= 5; seed++) {
      for (let i = 0; i < 100; i++) {
        const rng = mulberry32(seed * 100000 + i)
        const src = genProgram(rng)
        let d1: WorkflowDef
        try { d1 = await compileWfjs(src) } catch (e) {
          // 生成器自身 bug 不算对账失败——但编译必须通过（生成器保证语法）
          assert.fail(`生成程序编译失败（seed=${seed} i=${i}）: ${(e as Error).message}\n${src}`)
        }
        let d2: WorkflowDef
        try { d2 = await compileWfjs(toJs(d1)) } catch (e) {
          assert.fail(`round-trip 编译失败（seed=${seed} i=${i}）: ${(e as Error).message}\n源码：\n${src}\n渲染：\n${toJs(d1)}`)
        }
        try {
          assert.deepEqual(d2, d1)
        } catch {
          assert.fail(`round-trip 不等价（seed=${seed} i=${i}）\n源码：\n${src}\n渲染：\n${toJs(d1)}\nD1: ${JSON.stringify(d1)}\nD2: ${JSON.stringify(d2)}`)
        }
      }
    }
  })
})

// ---------- fuzz 生成器（wfjs 程序——guarantee 语法正确） ----------

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VAR_PREFIX = ['a', 'b', 'c', 'd', 'e']
const BUILTINS = ['http', 'template', 'log', 'ai', 'email']

/** 生成 wfjs 程序（scope 感知——表达式只引用可见变量） */
function genProgram(rng: () => number): string {
  const vars: string[] = []
  const consts = new Set<string>()
  // 全局唯一命名（v1 命名空间裁决：块级遮蔽 v2——生成器对齐）
  let n = 0
  const nextName = (): string => `w${n++}`
  // 固定导入（fuzz 聚焦语句/表达式 round-trip；import 变更由显式测试覆盖）
  const imports = [
    `import { sum } from 'wf://std/math'`,
    `import { count } from 'wf://std/collections'`,
    `import { store } from 'wf://std/store'`,
  ]
  const fnLine = genFunction(rng, nextName)
  return imports.join('\n') + '\n' + (fnLine ? fnLine + '\n' : '') + genStmts(rng, vars, consts, 3, 0, nextName)
}

function genStmts(rng: () => number, vars: string[], consts: Set<string>, depth: number, loopDepth: number, nextName: () => string): string {
  const stmts: string[] = []
  const count = 1 + Math.floor(rng() * 3)
  for (let i = 0; i < count; i++) {
    stmts.push(genStmt(rng, vars, consts, depth, loopDepth, nextName))
  }
  return stmts.join('\n')
}

function genStmt(rng: () => number, vars: string[], consts: Set<string>, depth: number, loopDepth: number, nextName: () => string): string {
  const r = rng()
  if (depth > 0 && r < 0.15) {
    // 嵌套块：if / if once / while / for
    const t = rng()
    const cond = genExpr(rng, vars, depth, loopDepth, 1)
    const localVars = [...vars] // 块局部作用域（JS 一致：块内声明不出块）
    const body = () => genStmts(rng, localVars, consts, depth - 1, loopDepth, nextName)
    if (t < 0.3) return `if (${cond}) {\n${ind(body())}\n}`
    if (t < 0.6) return `if (${cond}) {\n${ind(body())}\n} else {\n${ind(genStmts(rng, [...vars], consts, depth - 1, loopDepth, nextName))}\n}`
    if (t < 0.8) return `while (${cond}) {\n${ind(body())}\n}`
    const items = genExpr(rng, vars, depth, loopDepth, 1)
    const loopVar = `it${loopDepth}`
    return `for (const ${loopVar} of ${items}) {\n${ind(genStmts(rng, [...vars], consts, depth - 1, loopDepth + 1, nextName))}\n}`
  }
  if (r < 0.3) {
    // 声明（let）
    const name = nextName()
    const init = genExpr(rng, vars, depth, loopDepth, 0)
    vars.push(name)
    return `let ${name} = ${init}`
  }
  if (r < 0.45) {
    // 赋值（仅非 const 变量）
    const assignable = vars.filter((v) => !consts.has(v))
    if (assignable.length > 0) {
      const v = pick(rng, assignable)
      const op = pick(rng, ['=', '+=', '-=', '*='])
      return `${v} ${op} ${genExpr(rng, vars, depth, loopDepth, 0)}`
    }
  }
  if (r < 0.55) {
    // 内置调用（裸或绑定）
    const b = pick(rng, BUILTINS)
    const args = genBuiltinArgs(rng, b, vars, depth, loopDepth)
    return rng() < 0.5 ? `await ${b}({ ${args} })` : `const r${Math.floor(rng() * 1000)} = await ${b}({ ${args} })`
  }
  if (r < 0.62) return `await log({ message: \`m${Math.floor(rng() * 10)} \${${genExpr(rng, vars, depth, loopDepth, 0)}}\` })`
  if (r < 0.68 && depth > 0) return `return`
  // 简单声明兜底（const——赋过值分支排除）
  const name = nextName()
  const init = genExpr(rng, vars, depth, loopDepth, 0)
  vars.push(name)
  consts.add(name)
  return `const ${name} = ${init}`
}

function genBuiltinArgs(rng: () => number, b: string, vars: string[], depth: number, loopDepth: number): string {
  switch (b) {
    case 'http': {
      const url = `u${Math.floor(rng() * 10)}`
      return `url: '${url}'` + (rng() < 0.3 ? `, method: 'GET'` : '') + (rng() < 0.3 ? `, body: '${'b' + Math.floor(rng() * 10)}'` : '')
    }
    case 'template': return `template: 't${Math.floor(rng() * 10)}'`
    case 'log': return `message: 'm${Math.floor(rng() * 10)}'`
    case 'ai': return `prompt: 'p${Math.floor(rng() * 10)}'`
    case 'email': return `to: 'a@x.com', subject: 's', body: 'b'`
    default: return `message: 'x'`
  }
}

/** 函数生成（简单：参数 → return 表达式——生成器侧覆盖函数 round-trip） */
function genFunction(rng: () => number, nextName: () => string): string {
  if (rng() < 0.6) return ''
  const fname = `fn${Math.floor(rng() * 100)}`
  const params = ['p1', 'p2']
  const expr = `(p1 + p2)`
  return `function ${fname}(${params.join(', ')}) {\n  return ${expr}\n}`
}

/** 表达式生成（depth 保障终止；只引用 vars + loop 可见变量） */
function genExpr(rng: () => number, vars: string[], depth: number, loopDepth: number, minDepth: number): string {
  const r = rng()
  const pool: string[] = []
  for (let i = 0; i < loopDepth; i++) pool.push(`it${i}`)
  if (vars.length > 0) pool.push(pick(rng, vars))
  const leaf = (): string => {
    if (pool.length === 0) return String(Math.floor(rng() * 10))
    if (rng() < 0.5) return pick(rng, pool)
    return String(Math.floor(rng() * 10))
  }
  if (depth <= minDepth) return leaf()
  if (r < 0.25) return `(${genExpr(rng, vars, depth - 1, loopDepth, minDepth)} + ${genExpr(rng, vars, depth - 1, loopDepth, minDepth)})`
  if (r < 0.4) return `(${genExpr(rng, vars, depth - 1, loopDepth, minDepth)} > ${genExpr(rng, vars, depth - 1, loopDepth, minDepth)})`
  if (r < 0.5) return `!(${genExpr(rng, vars, depth - 1, loopDepth, minDepth)})`
  if (r < 0.58) return `(${genExpr(rng, vars, depth - 1, loopDepth, minDepth)} && ${genExpr(rng, vars, depth - 1, loopDepth, minDepth)})`
  if (r < 0.64) return `(${genExpr(rng, vars, depth - 1, loopDepth, minDepth)} ? ${genExpr(rng, vars, depth - 1, loopDepth, minDepth)} : ${genExpr(rng, vars, depth - 1, loopDepth, minDepth)})`
  if (r < 0.72 && pool.length > 0) return `(${pick(rng, pool)}.length > 0)`
  if (r < 0.78) return `sum(${genExpr(rng, vars, depth - 1, loopDepth, minDepth)})`
  if (pool.length > 0) {
    const v = pick(rng, pool)
    return rng() < 0.5 ? `${v}.length` : `count(${v})`
  }
  return leaf()
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function ind(s: string): string {
  return s.split('\n').map((l) => '  ' + l).join('\n')
}
