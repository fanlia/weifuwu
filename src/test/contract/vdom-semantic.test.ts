/**
 * semantic 契约——语义面原语（role 模板表）
 *
 * 锁定：模板固定键（dialog→aria-modal）· 键面（progressbar 三值）·
 * labelable 连接（labelledBy > label）· 未知 role 诚实兜底 · 值显式才写
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { semantic, ROLE_SEMANTICS } from '../../level4/client/vdom/semantic.ts'

test('dialog：固定键 aria-modal + labelable', () => {
  assert.deepEqual(semantic('dialog'), { role: 'dialog', 'aria-modal': true })
  assert.deepEqual(semantic('dialog', { label: '标题' }), {
    role: 'dialog', 'aria-modal': true, 'aria-label': '标题',
  })
})

test('progressbar：键面三值（valuenow/min/max）——显式值才写', () => {
  const p = semantic('progressbar', { values: { 'aria-valuenow': 60, 'aria-valuemin': 0, 'aria-valuemax': 100 }, label: '进度' })
  assert.equal(p['aria-valuenow'], 60)
  assert.equal(p['aria-valuemin'], 0)
  assert.equal(p['aria-valuemax'], 100)
  assert.equal(p['aria-label'], '进度')
  // 缺值键不写（调用方决定——审计扫描防缺口）
  assert.equal(semantic('progressbar')['aria-valuenow'], undefined)
})

test('switch：aria-checked 布尔直传（内核归一——无三元）', () => {
  const p = semantic('switch', { values: { 'aria-checked': true } })
  assert.equal(p['aria-checked'], true)
})

test('labelable：labelledBy 优先于 label', () => {
  const p = semantic('menu', { labelledBy: 'menu-t', label: '忽略' })
  assert.equal(p['aria-labelledby'], 'menu-t')
  assert.equal(p['aria-label'], undefined)
})

test('未知 role：只 role（白名单外诚实——不静默造键）', () => {
  assert.deepEqual(semantic('made-up', { label: 'x' }), { role: 'made-up' })
})

test('模板表：28 role 键面子集齐（单源锚点）', () => {
  assert.ok(ROLE_SEMANTICS.dialog.fixed?.['aria-modal'])
  assert.ok(ROLE_SEMANTICS.progressbar.keys?.includes('aria-valuenow'))
  assert.ok(ROLE_SEMANTICS.switch.keys?.includes('aria-checked'))
  assert.ok(ROLE_SEMANTICS.option.keys?.includes('aria-selected'))
  assert.equal(Object.keys(ROLE_SEMANTICS).length >= 28, true)
})

test('combobox：键面（expanded/controls/activedescendant）', () => {
  const p = semantic('combobox', { values: { 'aria-expanded': false, 'aria-controls': 'x' } })
  assert.equal(p['aria-expanded'], false)
  assert.equal(p['aria-controls'], 'x')
})

// ── 语义面审计（全库扫描——role 出现 → 模板键面必须齐全——三面论防线）──
test('审计：全库 role → 模板键面齐全（FileUpload/ToolCallCard 缺口已修）', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const root = join(import.meta.dirname, '..', '..', '..')
  const base = join(root, 'src/level5/client/components')
  const dirs = readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && readdirSync(join(base, e.name)).some((f) => f.endsWith('.ts') && !f.includes('.test')))
    .map((e) => e.name)
  const gaps: string[] = []
  for (const d of dirs) {
    const f = join(base, d, d + '.ts')
    const s = readFileSync(f, 'utf-8')
    for (const m of s.matchAll(/role: ?'([a-z-]+)'/g)) {
      const role = m[1]
      const tpl = ROLE_SEMANTICS[role]
      if (!tpl?.keys?.length) continue
      for (const k of tpl.keys) {
        // 键面必须出现在组件内（roles 键至少被引用——semantic()/手写/其他 role 实例均可）
        if (!s.includes(`'${k}'`) && !s.includes(`"${k}"`) && !s.includes(k + ':')) {
          gaps.push(`${d}: role=${role} 缺 ${k}`)
        }
      }
    }
  }
  assert.equal(gaps.length, 0, `语义键面缺口（三面论审计——ROLE_SEMANTICS 模板防缩水）:\n  ${gaps.join('\n  ')}`)
})
