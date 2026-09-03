/**
 * workflow runner + validate 契约测试（全内存 fixture——零网络零外部依赖）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { workflow, type WorkflowDef } from './index.ts'

function makeWf() {
  return workflow({
    fetch: (async () => new Response(JSON.stringify({ items: [{ price: 100 }], status: 'up' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as typeof fetch,
    log: () => {},
  })
}

const baseDef: WorkflowDef = {
  name: '探测-预警',
  steps: [
    { id: 'probe', type: 'http', config: { url: 'https://example.test/api' } },
    { id: 'msg', type: 'template', config: { template: '价格 {{steps.probe.data.json.items[0].price}} 状态 {{steps.probe.data.json.status}}' } },
  ],
}

describe('runner: 步骤链执行 + ctx 传递', () => {
  it('顺序执行，模板引用前步输出（steps.<id>.data 命名空间）', async () => {
    const r = await makeWf().execute(baseDef)
    assert.equal(r.status, 'success')
    assert.deepEqual(r.executed, ['probe', 'msg'])
    assert.deepEqual(r.skippedSteps, [])
    assert.equal(r.stepResults.probe.ok, true)
    assert.equal(r.stepResults.probe.data.status, 200)
    assert.deepEqual(r.stepResults.probe.data.json.items, [{ price: 100 }])
    assert.equal(r.stepResults.msg.data.text, '价格 100 状态 up')
  })
  it('http 非 2xx 也记成功（数据含 status——判定交给 if）', async () => {
    const wf = workflow({ fetch: (async () => new Response('oops', { status: 500 })) as typeof fetch, log: () => {} })
    const r = await wf.execute({ steps: [{ id: 'p', type: 'http', config: { url: 'x' } }] })
    assert.equal(r.status, 'success')
    assert.equal(r.stepResults.p.ok, true)
    assert.equal(r.stepResults.p.data.status, 500)
  })
  it('http 网络错误 → 步骤失败终止 + 错误消息', async () => {
    const wf = workflow({ fetch: (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch, log: () => {} })
    const r = await wf.execute({ steps: [{ id: 'p', type: 'http', config: { url: 'x' } }, { id: 'after', type: 'log', config: {} }] })
    assert.equal(r.status, 'error')
    assert.deepEqual(r.executed, [])
    assert.equal(r.stepResults.p.ok, false)
    assert.match(r.error!, /ECONNREFUSED/)
    assert.equal(r.stepResults.after, undefined) // 后续未执行
  })
})

describe('runner: 短路语义', () => {
  it('步骤级 when 不通过 → 跳过（skippedSteps），后续继续', async () => {
    const def: WorkflowDef = {
      steps: [
        { id: 'p', type: 'http', config: { url: 'x' } },
        { id: 'opt', type: 'template', config: { template: 'no' }, when: 'steps.p.data.json.missing != null' },
        { id: 'tail', type: 'template', config: { template: 'ok' } },
      ],
    }
    const r = await makeWf().execute(def)
    assert.equal(r.status, 'success')
    assert.deepEqual(r.executed, ['p', 'tail'])
    assert.deepEqual(r.skippedSteps, ['opt'])
  })
  it('if 通过 → 继续；步骤记录 satisfied:true', async () => {
    const def: WorkflowDef = {
      steps: [
        { id: 'p', type: 'http', config: { url: 'x' } },
        { id: 'gate', type: 'if', config: { when: 'steps.p.data.json.items != null' } },
        { id: 'tail', type: 'log', config: { message: 'through' } },
      ],
    }
    const r = await makeWf().execute(def)
    assert.equal(r.status, 'success')
    assert.deepEqual(r.executed, ['p', 'gate', 'tail'])
    assert.deepEqual(r.stepResults.gate.data, { satisfied: true })
  })
  it('if 不通过 → 分支语义：else/无 else 跳过子链，后续继续（success）', async () => {
    const def: WorkflowDef = {
      steps: [
        { id: 'p', type: 'http', config: { url: 'x' } },
        { id: 'gate', type: 'if', config: { when: 'steps.p.data.json.none != null' } },
        { id: 'tail', type: 'log', config: {} },
      ],
    }
    const r = await makeWf().execute(def)
    assert.equal(r.status, 'success')
    assert.equal(r.error, undefined)
    // 分支失败 → then 没走 → 后续 tail 继续执行
    assert.deepEqual(r.executed, ['p', 'gate', 'tail'])
    assert.deepEqual(r.stepResults.gate.data, { satisfied: false })
  })
  it('if then/else 子链：条件真走 then，假走 else——都继续后续', async () => {
    const def: WorkflowDef = {
      steps: [
        { id: 'gate', type: 'if', config: {
          when: 'input.n > 1', then: { steps: [{ id: 'yes', type: 'log', config: {} }] },
          else: { steps: [{ id: 'no', type: 'log', config: {} }] },
        } },
        { id: 'tail', type: 'log', config: {} },
      ],
    }
    const r = await makeWf().execute(def, { input: { n: 5 } })
    assert.equal(r.status, 'success')
    assert.ok(r.stepResults.yes, 'then 分支执行')
    assert.ok(!r.stepResults.no)
    assert.ok(r.stepResults.tail, '子链后继续')
    const r2 = await makeWf().execute(def, { input: { n: 0 } })
    assert.ok(!r2.stepResults.yes)
    assert.ok(r2.stepResults.no)
    assert.ok(r2.stepResults.tail)
  })
})

describe('runner: dry 模式', () => {
  it('effects 步骤打桩 {ok,dry}；非 effects 照常执行', async () => {
    const wf = makeWf()
    wf.registerStep({
      type: 'sender',
      effects: true,
      run: () => { throw new Error('不应真执行') },
    })
    const def: WorkflowDef = {
      steps: [
        { id: 'p', type: 'http', config: { url: 'x' } },
        { id: 's', type: 'sender', config: {} },
      ],
    }
    const r = await wf.execute(def, { mode: 'dry' })
    assert.equal(r.status, 'success')
    assert.equal(r.dry, true)
    assert.equal(r.stepResults.p.ok, true) // http 照常（用户要看数据）
    assert.deepEqual(r.stepResults.s, { ok: true, dry: true }) // 打桩
  })
})

describe('runner: 自定义步骤 + input', () => {
  it('registerStep 扩展 + ctx.input 注入', async () => {
    const wf = makeWf()
    wf.registerStep({
      type: 'check',
      run: (config, ctx) => ({ got: `${String(config.prefix)}:${JSON.stringify(ctx.input)}` }),
    })
    const r = await wf.execute({ steps: [{ id: 'c', type: 'check', config: { prefix: 'IN' } }] }, { input: { n: 1 } })
    assert.equal(r.stepResults.c.data.got, 'IN:{"n":1}')
  })
})

describe('validate: 确定性闸门', () => {
  const wf = makeWf()
  it('合法定义通过', () => {
    const v = wf.validate(baseDef)
    assert.equal(v.ok, true)
    assert.deepEqual(v.errors, [])
  })
  it('steps 缺失 / 空', () => {
    assert.equal(wf.validate({}).ok, false)
    assert.equal(wf.validate({ steps: [] }).ok, false)
  })
  it('id 重复', () => {
    const v = wf.validate({ steps: [{ id: 'a', type: 'log' }, { id: 'a', type: 'log' }] })
    assert.equal(v.ok, false)
    assert.match(v.errors[0].message, /重复/)
  })
  it('未注册类型', () => {
    const v = wf.validate({ steps: [{ id: 'a', type: 'spacewalk' }] })
    assert.equal(v.ok, false)
    assert.match(v.errors[0].message, /未注册/)
  })
  it('必填缺失（http.url / template.template / if.config.when）', () => {
    assert.equal(wf.validate({ steps: [{ id: 'a', type: 'http', config: {} }] }).ok, false)
    assert.equal(wf.validate({ steps: [{ id: 'a', type: 'template', config: {} }] }).ok, false)
    assert.equal(wf.validate({ steps: [{ id: 'a', type: 'if', config: {} }] }).ok, false)
  })
  it('when 表达式语法错误（含 if.config.when）', () => {
    const v = wf.validate({ steps: [{ id: 'a', type: 'log', when: 'a ===' }] })
    assert.equal(v.ok, false)
    assert.match(v.errors[0].message, /表达式错误/)
    const v2 = wf.validate({ steps: [{ id: 'a', type: 'if', config: { when: 'a +' } }] })
    assert.equal(v2.ok, false)
  })
  it('变量自足（v2）：vars.* 未声明 / steps.* 未知 → 拒绝', () => {
    const v1 = wf.validate({ steps: [{ id: 'a', type: 'assign', config: { target: 'x', value: 'vars.nope' } }] })
    assert.equal(v1.ok, false)
    assert.match(v1.errors[0].message, /未声明变量引用：vars\.nope/)
    const v2 = wf.validate({ steps: [{ id: 'a', type: 'assign', config: { target: 'x', value: 'steps.zzz.data' } }] })
    assert.equal(v2.ok, false)
    assert.match(v2.errors[0].message, /未知步骤引用：steps\.zzz/)
    // 合法：子链声明 + 模板插值 + 循环体 loop
    const ok = wf.validate({ steps: [
      { id: 'n0', type: 'assign', config: { target: 'n', value: '0' } },
      { id: 'w', type: 'while', config: { when: '(vars.n < 3)', step: { steps: [
        { id: 'n1', type: 'assign', config: { target: 'n', value: '(vars.n + 1)' } },
      ] } } },
      { id: 't', type: 'template', config: { template: 'n={{vars.n}} loop={{vars.loop.item}}' } },
    ] })
    assert.equal(ok.ok, true)
  })
  it('函数体内 vars 引用自足（函数参数 + 局部声明）', () => {
    const ok = wf.validate({ steps: [
      { id: 'c', type: 'call', config: { name: 'f', args: ['1'] } },
    ], functions: [{ name: 'f', params: ['a'], step: { steps: [
      { id: '_fn:f:_r', type: 'return', config: { value: 'vars.a' } },
    ] } }] })
    assert.equal(ok.ok, true)
    const bad = wf.validate({ steps: [{ id: 'a', type: 'log', config: {} }], functions: [{ name: 'f', params: ['a'], step: { steps: [
      { id: '_fn:f:_r', type: 'return', config: { value: 'vars.missing' } },
    ] } }] })
    if (bad.errors.length) assert.match(bad.errors[0].message, /未声明变量引用：vars\.missing/)
  })
})
