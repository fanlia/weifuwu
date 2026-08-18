import { test } from 'node:test'
import assert from 'node:assert'
import { toCsv } from './ExportCSV.ts'

test('toCsv：基本导出（列映射 + 引号转义 + BOM）', () => {
  const csv = toCsv({
    data: [{ id: 1, name: 'A,B' }, { id: 2, name: 'C' }],
    columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: '名称' }],
  })
  assert.ok(csv.startsWith('\uFEFF'), 'BOM（Excel 兼容）')
  const lines = csv.slice(1).split('\n')
  assert.equal(lines[0], 'ID,名称', '表头')
  assert.equal(lines[1], '1,"A,B"', '引号转义')
  assert.equal(lines[2], '2,C')
})

test('toCsv：null/undefined → 空 + format 自定义', () => {
  const csv = toCsv({
    data: [{ a: null, b: 100 }],
    format: (v, k) => k === 'b' ? `¥${v}` : String(v),
  })
  assert.ok(csv.includes(',¥100'), 'format 生效')
  assert.ok(csv.includes('a,') && !csv.includes('null'), 'null → 空')
})

test('toCsv：中文列名 + 特殊字符完整导出', () => {
  const csv = toCsv({
    data: [{ 名称: '订单"1"', 金额: '1,000' }],
  })
  const lines = csv.slice(1).split('\n')
  assert.ok(lines[0].includes('名称'), '中文表头')
  assert.match(lines[1], /"订单""1"""/, '双引号转义')
  assert.match(lines[1], /"1,000"/, '逗号转义')
})
