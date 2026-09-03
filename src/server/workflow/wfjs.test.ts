/**
 * wfjs 编译器契约测试（编译产物断言 + 静态检查——纯函数，零外部依赖）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compileWfjs, _rewriteExprForTest, type Binding } from './wfjs.ts'

const bind = (m: Record<string, Binding>): Map<string, Binding> => new Map(Object.entries(m))

describe('wfjs: 基础编译', () => {
  it('const 绑定内置调用 → http 步骤（data 解包映射）', async () => {
    const def = await compileWfjs(`const res = await http({ url: 'https://api.test/items' })`)
    assert.deepEqual(def.steps, [{ id: 'res', type: 'http', config: { url: 'https://api.test/items' } }])
  })
  it('const 绑定表达式 → assign 变量步骤', async () => {
    const def = await compileWfjs(`const page = 0\nlet limit = 10`)
    assert.deepEqual(def.steps, [
      { id: 'page', type: 'assign', config: { target: 'page', value: '0' } },
      { id: 'limit', type: 'assign', config: { target: 'limit', value: '10' } },
    ])
  })
  it('模板串 → DSL 插值（表达式改写）', async () => {
    const def = await compileWfjs('const r = await http({ url: `https://api.test?p=${1}` })')
    assert.equal(def.steps[0].config.url, 'https://api.test?p={{1}}')
  })
  it('嵌套对象参数（headers）', async () => {
    const def = await compileWfjs(`const r = await http({ url: 'x', headers: { 'a-b': '1', c: '2' } })`)
    assert.deepEqual(def.steps[0].config, { url: 'x', headers: { 'a-b': '1', c: '2' } })
  })
  it('语句调用（const 绑定）+ await 忽略', async () => {
    const def = await compileWfjs(`await http({ url: 'x' })\nawait log({ message: 'done' })`)
    assert.equal(def.steps.length, 2)
    assert.equal(def.steps[0].type, 'http')
    assert.equal(def.steps[0].id.startsWith('_http'), true) // auto id
    assert.equal(def.steps[1].type, 'log')
  })
})

describe('wfjs: 控制流编译', () => {
  it('if/else → 分支步骤（then/else 子步骤）', async () => {
    const def = await compileWfjs(`let n = 1\nif (n > 1) { await log({ message: 'a' }) } else { await log({ message: 'b' }) }`)
    const s = def.steps[1]
    assert.equal(s.type, 'if')
    assert.equal(s.config.when, '(vars.n > 1)')
    assert.equal(s.config.then.steps[0].config.message, 'a')
    assert.equal(s.config.else.steps[0].config.message, 'b')
  })
  it('if 分支 + std 导入（E）——隐式约定', async () => {
    // if 条件引用步骤绑定 + std import
    const def = await compileWfjs('import { sum } from \'wf://std/math\'\nconst r = await http({ url: "x" })\nif (sum(r.json.items) > 1) { await email({ to: "a@x.com" }) }')
    assert.deepEqual(def.imports, [{ from: 'wf://std/math', names: [{ name: 'sum' }] }])
    const s = def.steps[1]
    assert.equal(s.type, 'if')
    assert.equal(s.config.when, '(sum(steps.r.data.json.items) > 1)')
    assert.equal(s.config.then.steps[0].type, 'email')
  })
  it('while → while 步骤（体内引用外层变量）', async () => {
    const def = await compileWfjs(`let page = 0\nwhile (page < 3) { page = page + 1 }`)
    assert.equal(def.steps.length, 2) // set + while（体内 set 在 while.step 内）
    const w = def.steps[1]
    assert.equal(w.type, 'while')
    assert.equal(w.config.when, '(vars.page < 3)')
    assert.deepEqual(w.config.step.steps[0].config, { target: 'page', value: '(vars.page + 1)' })
  })
  it('for-of → forEach + loop.item 映射', async () => {
    const def = await compileWfjs(`const r = await http({ url: 'x' })\nfor (const it of r.json.items) { await log({ message: it.name }) }`)
    const f = def.steps[1]
    assert.equal(f.type, 'for')
    assert.equal(f.config.items, 'steps.r.data.json.items')
    const inner = f.config.step.steps[0]
    assert.equal(inner.type, 'log')
    assert.equal(inner.config.message, '{{loop.item.name}}')
  })
  it('return 步骤', async () => {
    const def = await compileWfjs(`return 42`)
    assert.deepEqual(def.steps, [{ id: '_return1', type: 'return', config: { value: '42' } }])
  })
  it('incdec / += / -= 糖 → assign', async () => {
    const def = await compileWfjs(`let n = 0\nn++\nn += 2\nn -= 1`)
    assert.deepEqual(def.steps[1].config, { target: 'n', value: '(vars.n + 1)' })
    assert.deepEqual(def.steps[2].config, { target: 'n', value: '(vars.n + 2)' })
    assert.deepEqual(def.steps[3].config, { target: 'n', value: '(vars.n - 1)' })
  })
  it('复合赋值 *= /= %=（与算术运算符一一对应）', async () => {
    const def = await compileWfjs(`let n = 10\nn *= 2\nn /= 4\nn %= 3`)
    assert.deepEqual(def.steps[1].config, { target: 'n', value: '(vars.n * 2)' })
    assert.deepEqual(def.steps[2].config, { target: 'n', value: '(vars.n / 4)' })
    assert.deepEqual(def.steps[3].config, { target: 'n', value: '(vars.n % 3)' })
  })
  it('表达式内 std 纯函数调用（导入后可见）', async () => {
    const def = await compileWfjs(`import { sum } from 'wf://std/math'\nlet items = input.list\nlet n = sum(items, 2)`)
    assert.deepEqual(def.steps[1].config, { target: 'n', value: 'sum(vars.items, 2)' })
  })
  it('std 函数未导入 → 编译错（ESM 一致——不存在）', async () => {
    await assert.rejects(compileWfjs(`let n = sum(1)`), new RegExp("未导入函数 'sum\\("))
  })
  it('系统根路径直接放行（input/steps/vars/loop）', async () => {
    const def = await compileWfjs(`let n = input.count`)
    assert.deepEqual(def.steps[0].config, { target: 'n', value: 'input.count' })
  })
})

describe('wfjs: 编译期检查（静态面——错误在写的时候暴露）', () => {
  it('未声明变量引用 → 编译错', async () => {
    await assert.rejects(compileWfjs(`await log({ message: nope })`), /未声明变量 'nope'/)
    await assert.rejects(compileWfjs(`if (x > 1) {}`), /未声明变量 'x'/)
  })
  it('给 const 赋值 → 编译错', async () => {
    await assert.rejects(compileWfjs(`const n = 1\nn = 2`), /不能给 const 'n' 赋值/)
  })
  it('表达式内非 std 调用 → 编译错（仅 std 纯函数）', async () => {
    await assert.rejects(compileWfjs(`let n = foo(1)`), new RegExp("未导入函数 'foo\\("))
  })
  it('副作用调用防线：对象参数/内置名两层挡住（进入表达式的必经点）', async () => {
    // 内置名 + 对象参数 → 语句层绑定调用（合法）——不当作表达式
    const def = await compileWfjs(`const r = await http({ url: 'x' })`)
    assert.equal(def.steps[0].type, 'http')
  })
  it('var 声明 → 编译错（提示用 let/const）', async () => {
    await assert.rejects(compileWfjs(`var n = 1`), /'var' 不支持/)
  })
  it('store 未导入直接使用 → 编译错', async () => {
    await assert.rejects(compileWfjs(`const v = await store.get('k')`), /使用 store 前需导入/)
  })
  it('store 方法参数数量校验', async () => {
    await assert.rejects(compileWfjs(`import { store } from 'wf://std/store'\nawait store.get('a', 'b')`), /参数数量错误/)
  })
  it('重复声明 → 编译错', async () => {
    await assert.rejects(compileWfjs(`const n = 1\nconst n = 2`), /重复声明 'n'/)
  })
  it('块级遮蔽（v2）：块内声明同名 → mangle 内部名 + 块后原名恢复', async () => {
    const def = await compileWfjs(`let x = 1\nif (x > 0) { let x = 2\nconst y = x + 1 }\nconst z = x`)
    // 外层 x → x；块内 x → x$1（遮蔽）；块后 z 引用 x（原名恢复）
    assert.equal(def.steps[0].config.target, 'x')
    assert.equal(def.steps[1].config.then.steps[0].config.target, 'x$1')
    assert.equal(def.steps[2].config.value, 'vars.x')
  })
  it('块级遮蔽（v2）：for 循环变量与外层同名 → 允许（JS 一致）', async () => {
    const def = await compileWfjs(`let it = 'a'\nfor (const it of input.arr) { const r = it }`)
    assert.equal(def.steps[1].type, 'for')
    assert.equal(def.steps[1].config.items, 'input.arr')
  })
  it('两个函数参数同名 → 各自作用域（v2——不再全局唯一）', async () => {
    const def = await compileWfjs(`function a(x) { return x }\nfunction b(x) { return x }`)
    assert.equal(def.functions!.length, 2)
  })
  it('内置名冲突 → 编译错', async () => {
    await assert.rejects(compileWfjs(`const http = 1`), /与内置函数冲突/)
  })
  it('函数调用（非内置）→ 编译错', async () => {
    await assert.rejects(compileWfjs(`const f = await sendAlert({ to: 'a@x.com' })`), /未识别调用 'sendAlert'/)
  })
  it('位置参数（非对象）→ 编译错', async () => {
    await assert.rejects(compileWfjs(`http('url')`), /对象参数/)
  })
  it('表达式语法错（含表达式复用 expression.parse 校验）', async () => {
    await assert.rejects(compileWfjs(`if (a === 1) {}`))
  })
  it('数组字面量表达式 → 编译错', async () => {
    await assert.rejects(compileWfjs(`const a = [1, 2]`), /unexpected|expression/)
  })
})

describe('wfjs: 表达式改写（绑定映射单测）', () => {
  it('步骤绑定 → steps.<id>.data 解包', async () => {
    const out = _rewriteExprForTest('res.json.items[0].price', bind({ res: { kind: 'step', id: 'res' } }))
    assert.equal(out, 'steps.res.data.json.items[0].price')
  })
  it('变量绑定 → vars.<name>', async () => {
    const out = _rewriteExprForTest('page + 1', bind({ page: { kind: 'var', name: 'page' } }))
    assert.equal(out, '(vars.page + 1)')
  })
  it('循环绑定 → loop.item.*', async () => {
    const out = _rewriteExprForTest('it.price', bind({ it: { kind: 'loop' } }))
    assert.equal(out, 'loop.item.price')
  })
  it('未声明 → 抛错（含插值内）', async () => {
    assert.throws(() => _rewriteExprForTest('a.b + c', bind({ a: { kind: 'var', name: 'a' } })), /未声明变量 'c'/)
  })
})

describe('wfjs: 函数（定义/调用/纯逻辑约束）', () => {
  it('function 定义 + 调用 → functions + call 步骤（参数绑定映射）', async () => {
    const def = await compileWfjs(`function pay(amount, rate) {
  let fee = amount * rate
  return fee + amount
}
const a = await pay(100, 0.1)`)
    assert.equal(def.functions![0].name, 'pay')
    assert.deepEqual(def.functions![0].params, ['amount', 'rate'])
    // 函数体：assign 用 vars.amount/vars.rate（参数 → 局部变量）
    const bodySteps = def.functions![0].step.steps
    assert.deepEqual(bodySteps[0].config, { target: 'fee', value: '(vars.amount * vars.rate)' })
    // call 步骤
    const call = def.steps[0]
    assert.equal(call.type, 'call')
    assert.deepEqual(call.config, { name: 'pay', args: ['100', '0.1'] })
  })
  it('函数体内禁用副作用内置（纯逻辑 v1 裁剪）', async () => {
    await assert.rejects(compileWfjs(`function f(x) { await log({ message: x }) }`), /函数体内不支持副作用内置/)
    await assert.rejects(compileWfjs(`function f(x) { const r = await http({ url: 'u' }) }`), /函数体内不支持副作用内置/)
  })
  it('函数提升：先调用后声明 → 编译通过并真跑（JS 一致）', async () => {
    const def = await compileWfjs(`const a = await pay(100)\nfunction pay(x) { return x * 2 }`)
    assert.equal(def.functions![0].name, 'pay')
    const { workflow } = await import('./index.ts')
    const r = await workflow({}).execute(def)
    assert.equal(r.status, 'success')
    assert.equal(r.stepResults.a.data, 200)
  })
  it('函数体内函数调用（组合 v2）', async () => {
    const def = await compileWfjs(`function dbl(x) { return x * 2 }\nfunction quad(x) { const a = await dbl(x)\nconst b = await dbl(a)\nreturn b }\nconst a = await quad(3)`)
    const { workflow } = await import('./index.ts')
    const r = await workflow({}).execute(def)
    assert.equal(r.stepResults.a.data, 12)
  })
  it('函数体内引用外层步骤绑定 → 编译错', async () => {
    await assert.rejects(compileWfjs(`const res = await http({ url: 'u' })\nfunction f() { return res.data }`), /未声明变量 'res'/)
  })
  it('参数遮蔽全局变量（v2——JS 一致：参数优先）', async () => {
    const def = await compileWfjs(`let x = 1\nfunction f(x) { return x }`)
    // 参数同名覆盖（IR 名不变——运行期 vars 注入遮蔽层；函数体内 x → 参数）
    const steps = def.functions![0].step.steps
    assert.equal(steps[0].config.value, 'vars.x')
    // 执行验证：调用 f(5) → 5（参数值——非全局 1）
    const { workflow } = await import('./index.ts')
    const def2 = await compileWfjs(`let x = 1\nfunction f(x) { return x }\nconst r = await f(5)`)
    const rr = await workflow({}).execute(def2, { args: { x: 1 } })
    assert.equal(rr.stepResults.r.data, 5)
  })
  it('return 值 → 函数返回表达式', async () => {
    const def = await compileWfjs(`function f(n) { return n + 1 }`)
    const ret = def.functions![0].step.steps[0]
    assert.equal(ret.type, 'return')
    assert.equal(ret.config.value, '(vars.n + 1)')
  })
})

describe('wfjs: 远程导入（编译期 fetch 物化——运行期零 IO）', () => {
  const LIB = {
    functions: [
      { name: 'calc', params: ['a', 'b'], step: { steps: [
        { id: 'r', type: 'assign', config: { target: 'r', value: '(vars.a + vars.b)' } },
        { id: 'ret', type: 'return', config: { value: 'vars.r' } },
      ] } },
    ],
  }
  it('import { calc } from https → 函数物化 + call 可编译', async () => {
    const def = await compileWfjs(
      `import { calc } from 'https://lib.example.com/math.json'\nconst x = await calc(1, 2)`,
      { remoteFetch: async (url) => { assert.equal(url, 'https://lib.example.com/math.json'); return LIB } },
    )
    assert.equal(def.functions![0].name, 'calc')
    assert.equal(def.steps[0].type, 'call')
    assert.deepEqual(def.steps[0].config, { name: 'calc', args: ['1', '2'] })
  })
  it('远程导入执行真跑（物化函数 → 引擎调用）', async () => {
    const def = await compileWfjs(
      `import { calc } from 'https://lib.example.com/math.json'\nconst x = await calc(1, 2)`,
      { remoteFetch: async () => LIB },
    )
    const { workflow } = await import('./index.ts')
    const wf = workflow({})
    const r = await wf.execute(def)
    assert.equal(r.status, 'success')
    assert.equal(r.stepResults.x.data, 3)
  })
  it('无 remoteFetch → 编译错（明确提示注入）', async () => {
    await assert.rejects(
      compileWfjs(`import { calc } from 'https://lib.example.com/math.json'`),
      /需要 compileWfjs\(\{ remoteFetch \}\)/,
    )
  })
  it('模块格式白名单拒绝（非 { functions }）', async () => {
    await assert.rejects(
      compileWfjs(`import { calc } from 'https://x.com/lib.json'`, { remoteFetch: async () => ({ code: 'evil()' }) }),
    )
  })
  it('函数名冲突（远程导入 vs 本地）→ 编译错', async () => {
    await assert.rejects(
      compileWfjs(`function calc(x) { return x }\nimport { calc } from 'https://x.com/lib.json'`, { remoteFetch: async () => LIB }),
      /冲突（远程导入）/
    )
  })
})

describe('wfjs: 完整例子（用户场景）——编译产物结构', () => {
  it('库存监控：http → if（store 记账模式）→ email', async () => {
    const def = await compileWfjs(`
      import { store } from 'wf://std/store'
      const res = await http({ url: 'https://api.example.com/stock' })
      const sent = await store.get('stock:alert:sent')
      if (res.json.items.length > 0 && sent !== '1') {
        const msg = await ai({ prompt: \`总结库存数据：\${res.json.items}\` })
        await email({ to: 'ops@x.com', subject: '库存预警', body: msg.text })
        await store.set('stock:alert:sent', '1')
      }
    `)
    assert.deepEqual(def.steps.map(s => s.type), ['http', 'store', 'if'])
    const sentStep = def.steps[1]
    assert.deepEqual(sentStep.config, { op: 'get', key: 'stock:alert:sent' })
    assert.equal(def.steps[2].config.edge, undefined)
    const then = def.steps[2].config.then.steps
    assert.deepEqual(then.map(s => s.type), ['ai', 'email', 'store'])
    assert.equal(then[0].config.prompt, '总结库存数据：{{steps.res.data.json.items}}')
    assert.equal(then[1].config.body, '{{steps.msg.data.text}}') // msg 绑定 ai 步骤 id='msg'
    assert.deepEqual(then[2].config, { op: 'set', key: 'stock:alert:sent', value: '1' })
  })
})
