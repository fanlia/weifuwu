import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workflowToDag, toJsonSchema } from './views.ts'
import type { StepSchema } from './validate.ts'

test('toJsonSchema: stepSchemas → JsonSchema 形状（字段/必填/标题）', () => {
  const schemas: (StepSchema & { type: string })[] = [
    { type: 'http', label: 'HTTP 请求', fields: [
      { name: 'url', label: 'URL', type: 'string', placeholder: 'https://…' },
      { name: 'method', label: '方法', type: 'string' },
    ], required: ['url'] },
    { type: 'log', label: '日志', fields: [{ name: 'message', label: '消息', type: 'string' }] },
  ]
  const js = toJsonSchema(schemas)
  assert.equal(js.type, 'object')
  assert.equal(js.properties!.http.type, 'object')
  assert.equal(js.properties!.http.title, 'HTTP 请求')
  assert.equal(js.properties!.http.properties!.url.type, 'string')
  assert.equal(js.properties!.http.properties!.url.placeholder, 'https://…')
  assert.deepEqual(js.properties!.http.required, ['url'])
  // 无 required 字段：不输出（JsonSchemaForm 的 required 缺省 = 非必填）
  assert.equal(js.properties!.log.required, undefined)
})

test('toJsonSchema: 字段类型映射（number/boolean 预留）', () => {
  const js = toJsonSchema([{ type: 'x', fields: [
    { name: 'n', label: '数量', type: 'number' as never },
    { name: 'b', label: '开关', type: 'boolean' as never },
    { name: 's', label: '文本', type: 'string' as never },
  ] }])
  assert.equal(js.properties!.x.properties!.n.type, 'number')
  assert.equal(js.properties!.x.properties!.b.type, 'boolean')
  assert.equal(js.properties!.x.properties!.s.type, 'string')
})

test('workflowToDag: 线性链 → 节点顺序 + 边链', () => {
  const dag = workflowToDag({ steps: [
    { id: 'res', type: 'http', config: { url: 'u' } },
    { id: 'n', type: 'assign', config: { target: 'n', value: '0' } },
    { id: 'm', type: 'email', config: { to: 'a', subject: 's', body: 'b' } },
  ] })
  assert.deepEqual(dag.nodes.map((n) => n.id), ['res', 'n', 'm'])
  assert.deepEqual(dag.nodes.map((n) => n.label), ['HTTP res', '赋值 n', '邮件 m'])
  assert.deepEqual(dag.edges, [{ from: 'res', to: 'n' }, { from: 'n', to: 'm' }])
})

test('workflowToDag: 子链折叠（if then/else 计数；while/for 子步骤数）', () => {
  const dag = workflowToDag({ steps: [
    { id: 'i', type: 'if', config: { when: 'vars.x > 0', then: { steps: [
      { id: 'a', type: 'log', config: {} }, { id: 'b', type: 'log', config: {} },
    ] }, else: { steps: [{ id: 'c', type: 'log', config: {} }] } } },
    { id: 'w', type: 'while', config: { when: 'vars.n < 3', step: { steps: [
      { id: 'd', type: 'assign', config: { target: 'n', value: 'vars.n' } },
      { id: 'e', type: 'assign', config: { target: 'n', value: 'vars.n' } },
      { id: 'f', type: 'assign', config: { target: 'n', value: 'vars.n' } },
    ] } } },
  ] })
  assert.equal(dag.nodes[0].label, '条件 i（then×2/else×1）')
  assert.equal(dag.nodes[1].label, '循环 w（×3 子步骤）')
})

test('workflowToDag: 边界——0 步空图 / 1 步单节点无边', () => {
  assert.deepEqual(workflowToDag({ steps: [] }), { nodes: [], edges: [] })
  assert.deepEqual(workflowToDag({ steps: [{ id: 'a', type: 'log', config: {} }] }), {
    nodes: [{ id: 'a', label: '日志 a' }], edges: [],
  })
})

test('workflowToDag: 自定义标签覆盖（消费端配置）', () => {
  const dag = workflowToDag({ steps: [{ id: 'a', type: 'http', config: {} }] }, { labels: { http: '取数' } })
  assert.equal(dag.nodes[0].label, '取数 a')
})
