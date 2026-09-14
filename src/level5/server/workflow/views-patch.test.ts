/** patchStepConfig 契约：顶层/嵌套 then-else-step 路径/越界防护/纯函数不变性 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patchStepConfig, insertStep, removeStep, workflowToDag, toJsonSchema } from './views.ts'
import type { WorkflowDef } from './contracts.ts'

const def: WorkflowDef = {
  steps: [
    { id: 'res', type: 'http', config: { url: 'http://a/1' } },
    { id: 'count', type: 'assign', config: { target: 'count', value: 'steps.res.x' } },
    {
      id: '_if1', type: 'if', config: {
        when: '(vars.count > 0)',
        then: {
          steps: [
            { id: '_log1', type: 'log', config: { message: '缺货 X 件' } },
            { id: '_if2', type: 'if', config: { when: '(vars.count > 1)', else: { steps: [{ id: '_log2', type: 'log', config: { message: '深' } }] } } },
          ],
        },
      },
    },
  ],
}

test('patch: 顶层步骤 config 替换', () => {
  const d = patchStepConfig(def, [0], { url: 'http://b/2' })
  assert.equal((d.steps[0].config as any).url, 'http://b/2')
  assert.equal((d.steps[0].config as any).method, undefined) // 未提供键不新增
  // 原 def 不变
  assert.equal((def.steps[0].config as any).url, 'http://a/1')
})

test('patch: then 子链嵌套下钻（then→if2→else→log）', () => {
  const d = patchStepConfig(def, [0 + 2, 'then', 1, 'else', 0], { message: '改深' })
  const node = d.steps[2].config as any
  const log2 = node.then.steps[1].config.else.steps[0]
  assert.equal(log2.config.message, '改深')
  // 其余节点原样
  assert.equal((d.steps[2].config as any).when, '(vars.count > 0)')
})

test('patch: 越界/链条不符抛错', () => {
  assert.throws(() => patchStepConfig(def, [9], {}), /越界/)
  assert.throws(() => patchStepConfig(def, [2, 'then', 5], {}), /越界/)
  assert.throws(() => patchStepConfig(def, [0, 'then', 0], {}), /无子链/)
  assert.throws(() => patchStepConfig(def, [], {}), /路径不能为空/)
})

test('patch: 与视图适配协同（改后 dag 标签不变——id/type 未动）', () => {
  const d = patchStepConfig(def, [0], { url: 'http://c/3' })
  const dag = workflowToDag(d)
  assert.equal(dag.nodes.length, 3) // 顶层 3 节点——子链折叠进标签
  assert.equal(dag.nodes[0].label, 'HTTP res')
  assert.equal(dag.nodes[2].label.includes('then×2'), true)
})

test('patch: toJsonSchema 可同步（字段元数据消费面）', () => {
  const s = toJsonSchema([])
  assert.equal(s.type, 'object')
})

test('insert: 顶层追加（anchor=null）+ id 防撞生成', () => {
  let d = insertStep(def, null, [], { type: 'log', config: { message: '追加' } })
  assert.equal(d.steps.length, 4)
  assert.equal(d.steps[3].type, 'log')
  assert.ok(String(d.steps[3].id).startsWith('_log'))
  // 再插一个——id 不撞
  d = insertStep(d, null, [], { type: 'log', config: { message: '再' } })
  assert.equal(d.steps.length, 5)
  const ids = d.steps.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  // 原 def 不变
  assert.equal(def.steps.length, 3)
})

test('insert: 子链追加（anchor=if id + then）——id 锚定无歧义', () => {
  const d = insertStep(def, '_if1', ['then'], { type: 'log', config: { message: '子链追加' } })
  const thenSteps = (d.steps[2].config as any).then.steps
  assert.equal(thenSteps.length, 3)
  assert.equal(thenSteps[2].config.message, '子链追加')
  assert.throws(() => insertStep(def, '_if1', ['else'], { type: 'log', config: {} }), /无子链/)
  assert.throws(() => insertStep(def, 'nope', ['then'], { type: 'log', config: {} }), /不存在/)
})

test('remove: 顶层/嵌套删除（级联子链）', () => {
  const d = removeStep(def, [2])
  assert.equal(d.steps.length, 2)
  assert.equal(d.steps[1].id, 'count')
  const d2 = removeStep(def, [2, 'then', 0])
  const thenSteps = (d2.steps[2].config as any).then.steps
  assert.equal(thenSteps.length, 1)
  assert.equal(thenSteps[0].id, '_if2')
  assert.throws(() => removeStep(def, [9]), /越界/)
})

test('insert/remove 后视图一致（dag 同步）', () => {
  const d = insertStep(def, null, [], { type: 'log', config: { message: 'x' } })
  assert.equal(workflowToDag(d).nodes.length, 4)
  const d2 = removeStep(d, [3])
  assert.equal(workflowToDag(d2).nodes.length, 3)
})
