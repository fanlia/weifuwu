/**
 * wfjs 编译器契约测试（编译产物断言 + 静态检查——纯函数，零外部依赖）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compileWfjs, _rewriteExprForTest, type Binding } from './wfjs.ts'

const bind = (m: Record<string, Binding>): Map<string, Binding> => new Map(Object.entries(m))

describe('wfjs: 基础编译', () => {
  it('const 绑定内置调用 → http 步骤（data 解包映射）', () => {
    const def = compileWfjs(`const res = await http({ url: 'https://api.test/items' })`)
    assert.deepEqual(def.steps, [{ id: 'res', type: 'http', config: { url: 'https://api.test/items' } }])
  })
  it('const 绑定表达式 → set 变量步骤', () => {
    const def = compileWfjs(`const page = 0\nlet limit = 10`)
    assert.deepEqual(def.steps, [
      { id: 'page', type: 'set', config: { name: 'page', value: '0' } },
      { id: 'limit', type: 'set', config: { name: 'limit', value: '10' } },
    ])
  })
  it('模板串 → DSL 插值（表达式改写）', () => {
    const def = compileWfjs('const r = await http({ url: `https://api.test?p=${1}` })')
    assert.equal(def.steps[0].config.url, 'https://api.test?p={{1}}')
  })
  it('嵌套对象参数（headers）', () => {
    const def = compileWfjs(`const r = await http({ url: 'x', headers: { 'a-b': '1', c: '2' } })`)
    assert.deepEqual(def.steps[0].config, { url: 'x', headers: { 'a-b': '1', c: '2' } })
  })
  it('语句调用（const 绑定）+ await 忽略', () => {
    const def = compileWfjs(`await http({ url: 'x' })\nawait log({ message: 'done' })`)
    assert.equal(def.steps.length, 2)
    assert.equal(def.steps[0].type, 'http')
    assert.equal(def.steps[0].id.startsWith('_http'), true) // auto id
    assert.equal(def.steps[1].type, 'log')
  })
})

describe('wfjs: 控制流编译', () => {
  it('if/else → 分支步骤（then/else 子步骤）', () => {
    const def = compileWfjs(`let n = 1\nif (n > 1) { await log({ message: 'a' }) } else { await log({ message: 'b' }) }`)
    const s = def.steps[1]
    assert.equal(s.type, 'if')
    assert.equal(s.config.when, '(vars.n > 1)')
    assert.equal(s.config.then.steps[0].config.message, 'a')
    assert.equal(s.config.else.steps[0].config.message, 'b')
  })
  it('if once → edge: true', () => {
    const def = compileWfjs('const r = await http({ url: "x" })\nif once (r.json.items.length > 0) { await email({ to: "a@x.com" }) }')
    const s = def.steps[1]
    assert.equal(s.type, 'if')
    assert.equal(s.config.edge, true)
    assert.equal(s.config.when, '(steps.r.data.json.items.length > 0)')
    assert.equal(s.config.then.steps[0].type, 'email')
  })
  it('while → while 步骤（体内引用外层变量）', () => {
    const def = compileWfjs(`let page = 0\nwhile (page < 3) { page = page + 1 }`)
    assert.equal(def.steps.length, 2) // set + while（体内 set 在 while.step 内）
    const w = def.steps[1]
    assert.equal(w.type, 'while')
    assert.equal(w.config.when, '(vars.page < 3)')
    assert.deepEqual(w.config.step.steps[0].config, { name: 'page', value: '(vars.page + 1)' })
  })
  it('for-of → forEach + loop.item 映射', () => {
    const def = compileWfjs(`const r = await http({ url: 'x' })\nfor (const it of r.json.items) { await log({ message: it.name }) }`)
    const f = def.steps[1]
    assert.equal(f.type, 'forEach')
    assert.equal(f.config.items, 'steps.r.data.json.items')
    const inner = f.config.step.steps[0]
    assert.equal(inner.type, 'log')
    assert.equal(inner.config.message, '{{loop.item.name}}')
  })
  it('return 步骤', () => {
    const def = compileWfjs(`return 42`)
    assert.deepEqual(def.steps, [{ id: '_return1', type: 'return', config: { value: '42' } }])
  })
  it('incdec / += / -= 糖 → set', () => {
    const def = compileWfjs(`let n = 0\nn++\nn += 2\nn -= 1`)
    assert.deepEqual(def.steps[1].config, { name: 'n', value: '(vars.n + 1)' })
    assert.deepEqual(def.steps[2].config, { name: 'n', value: '(vars.n + 2)' })
    assert.deepEqual(def.steps[3].config, { name: 'n', value: '(vars.n - 1)' })
  })
  it('复合赋值 *= /= %=（与算术运算符一一对应）', () => {
    const def = compileWfjs(`let n = 10\nn *= 2\nn /= 4\nn %= 3`)
    assert.deepEqual(def.steps[1].config, { name: 'n', value: '(vars.n * 2)' })
    assert.deepEqual(def.steps[2].config, { name: 'n', value: '(vars.n / 4)' })
    assert.deepEqual(def.steps[3].config, { name: 'n', value: '(vars.n % 3)' })
  })
  it('表达式内 std 纯函数调用（sum 白名单校验通过）', () => {
    const def = compileWfjs(`let items = input.list\nlet n = sum(items, 2)`)
    assert.deepEqual(def.steps[1].config, { name: 'n', value: 'sum(vars.items, 2)' })
  })
  it('系统根路径直接放行（input/steps/vars/loop）', () => {
    const def = compileWfjs(`let n = input.count`)
    assert.deepEqual(def.steps[0].config, { name: 'n', value: 'input.count' })
  })
})

describe('wfjs: 编译期检查（静态面——错误在写的时候暴露）', () => {
  it('未声明变量引用 → 编译错', () => {
    assert.throws(() => compileWfjs(`await log({ message: nope })`), /未声明变量 'nope'/)
    assert.throws(() => compileWfjs(`if (x > 1) {}`), /未声明变量 'x'/)
  })
  it('给 const 赋值 → 编译错', () => {
    assert.throws(() => compileWfjs(`const n = 1\nn = 2`), /不能给 const 'n' 赋值/)
  })
  it('表达式内非 std 调用 → 编译错（仅 std 纯函数）', () => {
    assert.throws(() => compileWfjs(`let n = foo(1)`), new RegExp("未注册函数 'foo\\("))
  })
  it('副作用调用防线：对象参数/内置名两层挡住（进入表达式的必经点）', () => {
    // 内置名 + 对象参数 → 语句层绑定调用（合法）——不当作表达式
    const def = compileWfjs(`const r = await http({ url: 'x' })`)
    assert.equal(def.steps[0].type, 'http')
  })
  it('var 声明 → 编译错（提示用 let/const）', () => {
    assert.throws(() => compileWfjs(`var n = 1`), /'var' 不支持/)
  })
  it('重复声明 → 编译错', () => {
    assert.throws(() => compileWfjs(`const n = 1\nconst n = 2`), /重复声明 'n'/)
  })
  it('循环变量遮蔽 → 编译错', () => {
    assert.throws(() => compileWfjs(`const r = await http({ url: 'x' })\nfor (const it of r.json.items) { for (const it of r.json.items) {} }`), /遮蔽/)
  })
  it('内置名冲突 → 编译错', () => {
    assert.throws(() => compileWfjs(`const http = 1`), /与内置函数冲突/)
  })
  it('函数调用（非内置）→ 编译错', () => {
    assert.throws(() => compileWfjs(`const f = await sendAlert({ to: 'a@x.com' })`), /未识别调用 'sendAlert'/)
  })
  it('位置参数（非对象）→ 编译错', () => {
    assert.throws(() => compileWfjs(`http('url')`), /对象参数/)
  })
  it('function 关键字 → 提示 W8', () => {
    assert.throws(() => compileWfjs(`function f() {}`), /W8/)
  })
  it('表达式语法错（含表达式复用 expression.parse 校验）', () => {
    assert.throws(() => compileWfjs(`if (a === 1) {}`))
  })
  it('数组字面量表达式 → 编译错', () => {
    assert.throws(() => compileWfjs(`const a = [1, 2]`), /unexpected|expression/)
  })
})

describe('wfjs: 表达式改写（绑定映射单测）', () => {
  it('步骤绑定 → steps.<id>.data 解包', () => {
    const out = _rewriteExprForTest('res.json.items[0].price', bind({ res: { kind: 'step', id: 'res' } }))
    assert.equal(out, 'steps.res.data.json.items[0].price')
  })
  it('变量绑定 → vars.<name>', () => {
    const out = _rewriteExprForTest('page + 1', bind({ page: { kind: 'var', name: 'page' } }))
    assert.equal(out, '(vars.page + 1)')
  })
  it('循环绑定 → loop.item.*', () => {
    const out = _rewriteExprForTest('it.price', bind({ it: { kind: 'loop' } }))
    assert.equal(out, 'loop.item.price')
  })
  it('未声明 → 抛错（含插值内）', () => {
    assert.throws(() => _rewriteExprForTest('a.b + c', bind({ a: { kind: 'var', name: 'a' } })), /未声明变量 'c'/)
  })
})

describe('wfjs: 完整例子（用户场景）——编译产物结构', () => {
  it('库存监控：http → if once → email', () => {
    const def = compileWfjs(`
      const res = await http({ url: 'https://api.example.com/stock' })
      if once (res.json.items.length > 0) {
        const msg = await ai({ prompt: \`总结库存数据：\${res.json.items}\` })
        await email({ to: 'ops@x.com', subject: '库存预警', body: msg.text })
      }
    `)
    assert.deepEqual(def.steps.map(s => s.type), ['http', 'if'])
    assert.equal(def.steps[1].config.edge, true)
    const then = def.steps[1].config.then.steps
    assert.deepEqual(then.map(s => s.type), ['ai', 'email'])
    assert.equal(then[0].config.prompt, '总结库存数据：{{steps.res.data.json.items}}')
    assert.equal(then[1].config.body, '{{steps.msg.data.text}}') // msg 绑定 ai 步骤 id='msg'
  })
})
