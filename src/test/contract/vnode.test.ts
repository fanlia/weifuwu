/**
 * vdom core — vnode 纯数据面测试
 *
 * 锁定 h/jsx 行为契约（vdom-x X-A 系 + 设计规则 §4.0）：
 * - h() 除 key 剥离外零转换（children 原样——false/嵌套数组保留）
 * - key 业务身份声明（props 不泄漏 key）
 * - childrenOf 单一规则源（递归展开 + 空洞保留——长度恒定）
 * - 组件两阶段类型（工厂 mount 一次 + renderFn 每次渲染）
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, jsx, type VNode, type Component } from '../../client/vdom/core/vnode.ts'
import { Fragment } from '../../client/vdom/core/node/fragment.ts'
import { childrenOf } from '../../client/vdom/core/node/children.ts'
import { kindOf, isHoleKind, isTextKind } from '../../client/vdom/core/node/index.ts'
import { normalizeOutput } from '../../client/vdom/core/node/component.ts'

test('h：纯数据 vnode——type/props/key/children 形状', () => {
  const v = h('div', { id: 'x', key: 'k1' }, 'text')
  assert.equal(v.type, 'div')
  assert.equal(v.key, 'k1')
  assert.equal(v.props.id, 'x')
  assert.equal(v.props.key, undefined, 'key 从 props 剥离——组件不见 key')
  assert.equal(v.props.children, 'text')
  assert.deepEqual(Object.keys(v.props).sort(), ['children', 'id'], '除 key 剥离外零转换')
})

test('h：children 原样——false/嵌套数组保留（不 filter）', () => {
  const v = h('div', {}, false, [h('span', {}), [h('i', {})]], null, 0)
  const c = v.props.children as unknown[]
  assert.ok(Array.isArray(c))
  assert.equal(c.length, 4, '多子节点存数组——false/null/0 保留')
  assert.equal(c[0], false)
  assert.equal(c[1][0].type, 'span')
  assert.equal(c[1][1][0].type, 'i', '嵌套数组原样（childrenOf 消费侧展开）')
})

test('childrenOf：递归展开 + 空洞保留（长度恒定——占位法前提）', () => {
  const v = h('div', {}, [
    h('span', {}),
    false,
    [h('i', {}), null, [h('b', {})]],
    'text',
    0,
  ])
  const c = childrenOf(v)
  assert.equal(c.length, 7, '任意嵌套展开为同一序列——空洞占位保留（span/false/i/null/b/text/0）')
  assert.equal(c[0].type, 'span')
  assert.equal(c[1], false)
  assert.equal(c[2].type, 'i')
  assert.equal(c[3], null)
  assert.equal(c[4].type, 'b')
  assert.equal(c[5], 'text')
  assert.equal(c[6], 0)
})

test('jsx 运行时：React 兼容签名——props.key 与第三参 key 双源', () => {
  const a = jsx('div', { id: 'a' }, 'ka')
  assert.equal(a.key, 'ka')
  const b = jsx('div', { id: 'b', key: 'kb' })
  assert.equal(b.key, 'kb')
  assert.equal(b.props.key, undefined, 'props 内 key 同样剥离')
  const c = jsx(Fragment as unknown as string, { children: [h('span', {})] })
  assert.equal(c.props.children.length, 1)
})

test("kindOf：空字符串 = 空洞（编码唯一性——空文本不可序列化——SSR 吸收错位根因）", () => {
  // **空字符串归一空洞（2026-08——inputnumber SSR 吸收实证）**：
  // `{cond ? 'x' : ''}` 的 '' 槽位——客户端 createText('') 空文本节点 vs
  // HTML 序列化零输出——同一 children 值两套物理表示——吸收文本流错位
  // （把 demo 面 div 当多余节点跳过 → 耗尽 failed → DOM 双份污染）——
  // 归空洞（锚注释——双端同构）
  assert.equal(kindOf(''), 'hole', "'' → hole（不再 text）")
  assert.equal(kindOf('x'), 'text')
  assert.equal(kindOf(0), 'text', '数字 0 仍是文本（与 null 区分）')
})

test("判定点收敛（2026-08）：isHoleKind/isTextKind 全判定点一致性——禁止分裂", () => {
  // **判定点收敛红线（hole/text 语义唯一实现源——''→hole 双 bug 的机制防线）**：
  // 渲染级“是否空洞/文本”一律经 isHoleKind/isTextKind（kindOf 派生）——
  // 任何模块手写 `=== null || typeof === 'boolean'`（不含 ''）或
  // `typeof === 'string'`（含 ''）都是分裂点（diffSlot setText 到锚 / 组件
  // 输出''形状错位——实证）
  assert.equal(isHoleKind(''), true, "'' 渲染级空洞")
  assert.equal(isHoleKind(null), true)
  assert.equal(isHoleKind(false), true)
  assert.equal(isHoleKind('x'), false)
  assert.equal(isTextKind(''), false, "'' 不是文本（快路径排除——setText 到锚防线）")
  assert.equal(isTextKind('x'), true)
  assert.equal(isTextKind(42), true)
  // 组件输出形状统一（'' 输出 = hole——emit/输出形状同构）
  const out0 = normalizeOutput('')
  assert.equal(out0.kind, 'hole', "组件输出空串 → hole（旧判定不含——输出形状分裂——id 空间错位风险）")
  const out1 = normalizeOutput(null)
  assert.equal(out1.kind, 'hole')
  const out2 = normalizeOutput('v')
  assert.equal(out2.kind, 'vnode')
})

test('组件两阶段类型：工厂 mount 一次 + renderFn 每次渲染', () => {
  const Counter: Component<{ step?: number }, { render: () => Promise<void> }> = (initProps, ctx) => {
    let count = initProps.step ?? 0
    return (props) => h('button', { onClick: () => { count += props.step ?? 1; void ctx.render() } }, `count:${count}`)
  }
  // 形状验证（编译期）——运行时仅验证 h 调用链
  const v = h(Counter, { step: 1 })
  assert.equal(v.type, Counter)
  assert.equal(v.props.step, 1)
})

test('childrenOf：单子节点形态（非数组——h 直接存）', () => {
  const v = h('p', {}, 'single')
  assert.deepEqual(childrenOf(v), ['single'])
  const none = h('p', {})
  assert.deepEqual(childrenOf(none), [], '无 children → 空序列')
})

// 浏览器测试 runner 入口标记（sideEffects 摇除防护——scripts/test-browser.ts 引用）
export const __wf_tests = (): void => {}
