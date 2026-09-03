/** patchStepConfig 契约：顶层/嵌套 then-else-step 路径/越界防护/纯函数不变性 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patchStepConfig, workflowToDag, toJsonSchema } from './views.ts'
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
