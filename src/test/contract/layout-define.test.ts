/**
 * layout 契约——defineLayout（声明 → 生成器 → 与手写逐属性等价）
 *
 * 锁定（W4）：
 * - generateLayoutCss：基规则 + 零优先级默认（:where）· 变体继承基（独立可用）
 * - 与手写逐属性等价（isEquivalent——选择器集 + 属性集逐项）
 * - 声明添加 = 新原语（组合缺省声明即生成——wf-stack 自带 gap）
 * - 注释/格式无关（解析比对——语义等价）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateLayoutCss, isEquivalent, parseProps } from '../../client/layout/define.ts'
import { structures } from '../../client/layout/decl.ts'

// **旧手写冻结快照（_row.css/_stack.css——W4 迁移前内容——等价基线）**：
// 生成器输出与快照逐属性等价（锁不漂移——手写已删由声明生成）
const HANDWRITTEN_ROW_STACK = `/* stack — 纵向堆叠 */
.wf-stack {
  display: flex;
  flex-direction: column;
}
:where(.wf-stack) {
  gap: var(--wf-gap, var(--wf-gap-md));
  align-items: var(--wf-align, stretch);
}
/* row — 横向排列 */
.wf-row {
  display: flex;
  flex-wrap: wrap;
}
:where(.wf-row) {
  gap: var(--wf-gap, var(--wf-gap-md));
  align-items: var(--wf-align, center);
}
/* row-reverse — 横向反向排列 */
.wf-row-reverse {
  display: flex;
  flex-direction: row-reverse;
  flex-wrap: wrap;
}
:where(.wf-row-reverse) {
  gap: var(--wf-gap, var(--wf-gap-md));
  align-items: var(--wf-align, center);
}
/* items — 交叉轴对齐 */
.wf-items-start { --wf-align: flex-start; }
.wf-items-center { --wf-align: center; }
.wf-items-end { --wf-align: flex-end; }
.wf-items-stretch { --wf-align: stretch; }
`

test('生成器：基规则 + 零优先级默认（:where）输出', () => {
  const gen = generateLayoutCss([{ class: 'wf-x', base: { display: 'flex' }, defaults: { gap: '1px' } }])
  assert.match(gen, /\.wf-x \{ display: flex; \}/)
  assert.match(gen, /:where\(\.wf-x\) \{ gap: 1px; \}/)
})

test('生成器：变体继承基（独立可用——手写 .wf-row-reverse 含 display）', () => {
  const gen = generateLayoutCss(structures)
  assert.match(gen, /\.wf-row-reverse \{ display: flex; flex-wrap: wrap; flex-direction: row-reverse; \}/)
})

test('等价：生成 = 旧手写冻结快照逐属性 diff 0', () => {
  const gen = generateLayoutCss(structures)
  assert.ok(isEquivalent(gen, HANDWRITTEN_ROW_STACK), '生成 = 旧手写（逐属性）')
})

test('等价：注释/格式无关（解析比对——语义等价）', () => {
  const gen = generateLayoutCss([{ class: 'wf-y', base: { display: 'block' } }])
  const withComment = '/* 头注释 */\n.wf-y { display: block; }'
  assert.ok(isEquivalent(gen, withComment))
})

test('声明添加 = 新原语（组合缺省声明即生成——wf-stack 自带 gap）', () => {
  const gen = generateLayoutCss(structures)
  const p = parseProps(gen)
  assert.ok(p.get(':where(.wf-stack)')?.get('gap'), 'stack 缺省 gap')
  assert.equal(p.get(':where(.wf-stack)')?.get('align-items'), 'var(--wf-align, stretch)')
})
