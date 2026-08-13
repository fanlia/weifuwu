/**
 * vdom 分派全状态机化审计（design/vdom-dispatch-state-machines.md——if/else 收敛基线）
 *
 * 统一原则：分派逻辑走查表（状态 × 事件 → 行为）；值判断（props 相等/null/tag 匹配）保留条件。
 *
 * 本测试是「分派型 if/else → 状态机」的 enforcement：
 *   A1 静态扫描：每个分派入口函数体必须包含对应转换表引用（BUILDERS[/PROP_SETTERS[/POS[…），
 *     且函数体内禁止 `else if`（分派链形态——值判断型单层 if 允许）
 *   A2 静态扫描：vdom2 全目录 `else if` 总数 ≤ 基线（22——只降不升；新分派代码必须走表）
 *   A3 运行时：各状态机表完整性（kind 全量 / channel 全量 / 位置矩阵全量）
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const VDOM2 = join(ROOT, 'src', 'ui-dom', 'vdom2')

/** 读取源文件（去注释） */
function sourceOf(file: string): string {
  const src = readFileSync(join(VDOM2, file), 'utf-8')
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** 提取函数体（function 名 → 签名后的身体 { 到匹配 }——跳过签名区花括号（如 opts?: { force?: boolean }）） */
function functionBody(src: string, name: string): string | null {
  const re = new RegExp(`function\\s+${name}\\s*\\(`)
  const m = re.exec(src)
  if (!m) return null
  // 跳过参数括号区（签名的花括号不计数——正则已消费开括号，paren 从 1 起）
  let paren = 1
  let i = m.index + m[0].length
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '(') paren++
    else if (ch === ')') paren--
    else if (ch === '{' && paren === 0) break
  }
  let depth = 0
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(m.index, i + 1)
    }
  }
  return null
}

/** A1：分派入口 → 必须包含表引用 + 无 else if */
const DISPATCH_ENTRIES: Array<{ file: string; fn: string; table: string }> = [
  // 构建分派
  { file: 'build.ts', fn: 'buildVNode', table: 'BUILDERS[' },
  // 渲染分派（客户端）
  { file: 'render.ts', fn: 'renderValue', table: 'RENDERERS[' },
  // SSR 分派
  { file: 'x2html.ts', fn: 'x2html', table: 'TO_HTML[' },
  { file: 'x2html.ts', fn: 'arrToHtml', table: 'CHILD_HTML[' },
  // 水合分派
  { file: 'hydrate.ts', fn: 'renderValueHydrating', table: 'HYDRATERS[' },
  // diff 分派
  { file: 'patch.ts', fn: 'patchValue', table: 'x2y(' },
  { file: 'transitions.ts', fn: 'x2y', table: 'TRANSITIONS[' },
  { file: 'patch.ts', fn: 'patchChildren', table: 'KEY_DIFFERS[' },
  { file: 'patch.ts', fn: 'diffUnkeyed', table: 'POS[' },
  { file: 'patch.ts', fn: 'diffKeyed', table: 'KEYED_NEW[' },
  { file: 'patch.ts', fn: 'removeOldOutput', table: 'REMOVERS[' },
  { file: 'patch.ts', fn: 'disposeSubtree', table: 'DISPOSERS[' },
  // 属性通道分派
  { file: 'transform.ts', fn: 'setProp', table: 'PROP_SETTERS[' },
  { file: 'patch.ts', fn: 'patchProps', table: 'PROP_PATCHERS[' },
  // 审计分派
  { file: 'audit.ts', fn: 'auditTree', table: 'AUDITERS[' },
  // trace 名称解析
  { file: 'trace.ts', fn: 'vnDesc', table: 'NAME_SHORT[' },
  { file: 'trace.ts', fn: 'dumpTree', table: 'NAME_FULL[' },
]

test('A1: 分派入口函数走状态机查表 + 函数体零 else if', () => {
  const offenders: string[] = []
  for (const { file, fn, table } of DISPATCH_ENTRIES) {
    const src = sourceOf(file)
    const body = functionBody(src, fn)
    assert.ok(body, `${file} 未找到函数 ${fn}`)
    if (!body!.includes(table)) {
      offenders.push(`${file} ${fn}: 缺表引用 ${table}（分派必须走状态机查表）`)
    }
    // 分派链形态禁止：else if 链（值判断型单层 if 允许）
    if (/else\s+if/.test(body!)) {
      offenders.push(`${file} ${fn}: 函数体含 else if（分派链残留——收敛到状态机表）`)
    }
  }
  assert.deepEqual(offenders, [], '分派型 if/else 必须收敛到状态机查表（design/vdom-dispatch-state-machines.md）')
})

/** A2：vdom2 全目录 else if 总数 ≤ 基线（22——只降不升） */
test('A2: vdom2 全目录 else if 总数 ≤ 基线（新分派必须走表，禁止回升）', () => {
  const files = readdirSync(VDOM2).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  let total = 0
  for (const f of files) {
    const src = sourceOf(f)
    const count = (src.match(/else\s+if/g) ?? []).length
    total += count
  }
  // 基线 19：全部为值判断（nodeType/null/key 匹配）——见 design 文档验收标准
  assert.ok(total <= 19, `else if 总数 ${total} > 基线 19——新分派代码必须走状态机查表`)
})

/** A3：状态机表完整性（kind 全量 / channel 全量 / 位置矩阵全量——防表项缺失静默） */
test('A3: 状态机表完整性', async () => {
  const vdom2 = await import('../ui-dom/vdom2/index.ts')
  const kind = await import('../ui-dom/vdom2/kind.ts')
  const transform = await import('../ui-dom/vdom2/transform.ts')
  const patch = await import('../ui-dom/vdom2/patch.ts')
  const transitions = await import('../ui-dom/vdom2/transitions.ts')
  const render = await import('../ui-dom/vdom2/render.ts')
  const x2html = await import('../ui-dom/vdom2/x2html.ts')
  const hydrate = await import('../ui-dom/vdom2/hydrate.ts')
  const audit = await import('../ui-dom/vdom2/audit.ts')
  const build = await import('../ui-dom/vdom2/build.ts')

  const kinds = ['text', 'native', 'frag', 'comp', 'arr', 'hole', 'portal'] as const
  // 各 kind 分派表全量（含每类渲染/构建/水合/审计/移除）
  const tables: Array<[string, Record<string, unknown>]> = [
    ['RENDERERS', render.RENDERERS],
    ['BUILDERS', build.BUILDERS],
    ['TO_HTML', x2html.TO_HTML],
    ['HYDRATERS', hydrate.HYDRATERS],
    ['AUDITERS', audit.AUDITERS],
    ['REMOVERS', patch.REMOVERS],
  ]
  for (const [name, t] of tables) {
    for (const k of kinds) {
      assert.equal(typeof t[k], 'function', `${name} 缺 kind=${k}（表不完整——某类 vnode 静默无处理）`)
    }
  }
  // TRANSITIONS：7×7 全量（每 (oldKind, newKind) 组合）
  const tr = transitions.TRANSITIONS
  for (const ok of kinds) {
    for (const nk of kinds) {
      assert.equal(typeof tr[ok][nk], 'function', `TRANSITIONS[${ok}][${nk}] 缺失`)
    }
  }
  // 属性通道表：10 通道全量
  const channels = ['enumerated', 'class', 'style', 'ref', 'event', 'value', 'indeterminate', 'innerHTML', 'aria', 'default'] as const
  for (const ch of channels) {
    assert.equal(typeof transform.PROP_SETTERS[ch], 'function', `PROP_SETTERS 缺通道 ${ch}`)
    assert.equal(typeof patch.PROP_PATCHERS[ch], 'function', `PROP_PATCHERS 缺通道 ${ch}`)
  }
  // propChannelOf：单一判定源（分类结果必须是合法通道）
  for (const key of ['draggable', 'class', 'style', 'ref', 'onClick', 'value', 'indeterminate', 'innerHTML', 'aria-label', 'data-x', 'once']) {
    const ch = transform.propChannelOf(key)
    assert.ok(channels.includes(ch), `propChannelOf('${key}') → 非法通道 ${ch}`)
  }
  // 位置转换表 POS：3×3 全量
  const pos = patch.POS
  for (const ok of ['hole', 'real', 'multi'] as const) {
    for (const nk of ['hole', 'real', 'multi'] as const) {
      assert.equal(typeof pos[ok][nk], 'function', `POS[${ok}][${nk}] 缺失`)
    }
  }
  // KEYED_NEW：hole/portal/real 全量
  for (const nk of ['hole', 'portal', 'real'] as const) {
    assert.equal(typeof patch.KEYED_NEW[nk], 'function', `KEYED_NEW[${nk}] 缺失`)
  }
  // kind 分类与 render 一致（单一判定源）
  assert.equal(kind.classifyKind(null), 'hole')
  assert.equal(kind.classifyKind('x'), 'text')
  assert.equal(kind.classifyKind([1]), 'arr')
})
