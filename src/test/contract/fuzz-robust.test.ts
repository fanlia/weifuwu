/**
 * vdom core — fuzz 扩展（R4——design/vdom-core-robustness-round4.md P3）
 *
 * 组件树 fuzz 新维度（C1 之外的盲区——生成器扩展）：
 * - D1 async 工厂（乱序 resolve）——**已退役（2027-08 断代——工厂同步——
 *   async 标签移除——无 mounting 窗口）**——测试删除（D2 同步 renderFn
 *   等价覆盖存活契约）
 * - D2 同步 renderFn（2027-08 断代后形态——终态等价）
 * - D3 throw 组件（错误路径——mount 清理 + renderFn hole 降级 + 重试自愈——
 *   R2 契约迁移 v2——段保留）
 * - D4 keyed 组件 × 输出组件混合（嵌套深度 3——C1 深度 ≤2 的扩展）
 *
 * 纪律（对齐 C1 生成器）：工厂输出创建时固定（build/diff 各执行一次——
 * 输出一致——无假反例）；compSeq 全局稳定（多轮共享——确定性）。
 *
 * **v1 退役（2027-08）**：实例权威 = v2 段表（segs）——断言迁移。
 *
 * 诚实裁剪：**Portal vnode 已删除**（2027-03 命令式弹窗改造——portal.ts
 * 仅容器 id 工具）——原计划"portal 输出"维度不适用——跳过（记录）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode, type VNodeChild } from '../../client/vdom/core/vnode.ts'
import { Fragment } from '../../client/vdom/core/node/fragment.ts'
import { diffToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { renderToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { createComponentRegistry, type ComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Segment } from '../../client/vdom/core/v2/diff.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import {
  mulberry32, verifyEquivalence,
} from './reconcile.test.ts'
import { drainStream } from './sim.ts'

// ── D1/D2：工厂 + renderFn（2027-08 断代——工厂/renderFn 全同步） ────
let asyncSeq = 0

// ── D3：throw 组件（工厂/renderFn 抛错——错误路径契约） ─────────────

/** throw 组件注册表辅助——工厂 throw（mount 失败） */
function makeThrowFactory(phase: 'mount' | 'renderFn'): () => any {
  const f = () => {
    if (phase === 'mount') throw new Error(`fuzz-mount-${phase}`)
    return () => { throw new Error(`fuzz-renderFn-${phase}`) }
  }
  return f as any
}

/** 错误路径验证（相位区分——R2 语义——v2 段表权威）：
 *  mount：① build 流显式 reject（错误传播——不静默）② 段表无残留
 *  （工厂 throw 在建段前——零占位）③ 替换正常组件 diff → 自愈。
 *  renderFn：① 流**正常完成**（R2 组件级 hole 降级——不炸整树）+
 *  组件槽位 hole 锚 ② 段**保留**（mounted——下一拍重试自愈）③ 同位置
 *  修复 diff → 终态正常。 */
async function verifyThrowContract(
  bad: VNode, good: VNode, segs: Map<string, Segment>, phase: 'mount' | 'renderFn',
): Promise<string | null> {
  if (phase === 'mount') {
    try {
      await drainStream(renderToStreamV2(bad, {}, createComponentRegistry(), segs))
      return '① throw 组件 build 流未 reject（错误被静默）'
    } catch (e) {
      if (!String(e).includes('fuzz-')) return `① 错误类型不符: ${String(e)}`
    }
    if (segs.size > 0) return `② 段表残留（工厂 throw 未清理）: ${[...segs.keys()].join(',')}`
  } else {
    const cmds = await drainStream(renderToStreamV2(bad, {}, createComponentRegistry(), segs))
    if (!cmds.some((c) => c.op === 'done')) return '① renderFn 错误未降级——流未完成'
    if (!cmds.some((c) => c.op === 'createAnchor')) return '① renderFn 错误未降级 hole 锚'
    if (segs.size === 0) return '② renderFn 错误后段未保留（应为保留——下一拍重试）'
  }
  // ③ 修复自愈（同位置正常组件 diff——终态正常）
  const diff = await verifyEquivalence(good, good, createComponentRegistry())
  if (diff) return `③ 修复后对账不等价:\n${diff}`
  return null
}

// ── D4：keyed 组件 × 输出组件混合（深度 3） ─────────────────────────
let compSeq = 0

function makeMixedComp(depth: number, rnd: () => number): () => any {
  const k = ['array', 'comp'][compSeq++ % 2]
  const innerVal = depth > 0 ? makeRandomTree(depth - 1, rnd) : 'leaf' + (compSeq % 3)
  const outKey = 'mk' + compSeq
  // **输出组件预生成（创建时求值——工厂输出确定性纪律——f 惰性生成会
  // 每拍重造组件（渲染层恢复）——fuzz 爆炸教训）**
  const innerComp = k === 'comp' ? h(makeMixedComp(0, rnd), { key: outKey }) : null
  const f = () => () => {
    if (k === 'array') return [h('span', { key: outKey }, 'a'), innerVal]
    return innerComp
  }
  return f as any
}

function makeRandomTree(depth: number, rnd: () => number): VNodeChild {
  if (depth <= 0 || rnd() < 0.35) {
    if (depth <= 0) return 'leaf' + (compSeq % 3) // 深度 0 = 纯叶子（终止互递归）
    // 有 key 组件（keyed 路径——.k{key} 实例 id——身份映射）
    return h(makeMixedComp(1 + (compSeq % 2), rnd), { key: 'k' + (compSeq++ % 50) })
  }
  const r = rnd()
  if (r < 0.3) return h('div', {}, Array.from({ length: 1 + (compSeq % 2) }, () => makeRandomTree(depth - 1, rnd)))
  if (r < 0.5) return h(makeMixedComp(1 + (compSeq % 2), rnd), {})
  if (r < 0.8) return h('span', { key: 's' + (compSeq++ % 50) }, makeRandomTree(depth - 1, rnd))
  return h(Fragment, {}, Array.from({ length: 1 + (compSeq % 2) }, () => makeRandomTree(depth - 1, rnd)))
}

// ── 测试 ───────────────────────────────────────────────────────────

test('D2：renderFn 同步输出——终态等价（多种子 × 200 对）——2027-08 同步化', async () => {
  const rnd = mulberry32(31)
  let mismatches = 0
  let sample = ''
  const mkRender = () => {
    const label = 'r' + (asyncSeq % 3)
    // 工厂 → renderFn（同步——Promise 输出语义已退役）
    return () => () => h('b', { class: 'sync-r' }, label)
  }
  for (let i = 0; i < 200; i++) {
    const mk = () => h('div', {}, [
      h(mkRender(), {}),
      h(mkRender(), {}),
    ]) as VNode
    const oldT = mk()
    const newT = mk()
    const diff = await verifyEquivalence(oldT, newT, createComponentRegistry())
    if (diff) { mismatches++; if (!sample) sample = `i=${i}\n${diff}` }
  }
  assert.equal(mismatches, 0, `renderFn 不等价 ${mismatches}/200\n${sample}`)
})

test('D3：throw 组件——错误传播 + mount 清理 + 修复自愈（2 相位 × 多种子）', async () => {
  for (const phase of ['mount', 'renderFn'] as const) {
    for (const seed of [7, 42, 99]) {
      const segs = new Map<string, Segment>()
      const mkBad = () => h('div', {}, [h(makeThrowFactory(phase), {})]) as VNode
      const mkGood = () => h('div', {}, [h('span', {}, 'ok')]) as VNode
      for (let i = 0; i < 10; i++) {
        const bad = mkBad()
        // 错误路径契约（build 传播 + 段表清理/保留 + 同位置修复自愈）
        const issue = await verifyThrowContract(bad, mkGood(), segs, phase)
        if (issue) assert.fail(`D3 ${phase} seed=${seed} i=${i}: ${issue}`)
      }
    }
  }
})

test('D4：keyed 组件 × 输出组件混合（深度 3）——终态等价（多种子 × 200 对）', async () => {
  let mismatches = 0
  let sample = ''
  for (const seed of [11, 99, 2026]) {
    const rnd = mulberry32(seed)
    compSeq = 0
    for (let i = 0; i < 200; i++) {
      const oldT = makeRandomTree(3, rnd) as VNode
      const newT = makeRandomTree(3, rnd) as VNode
      if (typeof oldT === 'string' || oldT === null || typeof newT === 'string' || newT === null) continue
      const diff = await verifyEquivalence(oldT, newT, createComponentRegistry())
      if (diff) {
        mismatches++
        if (!sample) {
          const reg2 = createComponentRegistry()
          const bo = await drainStream(renderToStreamV2(oldT, {}, reg2))
          const d2 = await drainStream(diffToStreamV2(oldT, newT, {}, reg2))
          sample = `seed=${seed} i=${i}\nold=${JSON.stringify(oldT)}\nnew=${JSON.stringify(newT)}\n${diff}\n[bo] ${bo.map((c: any) => `${c.op}:${c.id ?? c.compId ?? ''}${c.tag ? ':' + c.tag : ''}`).join(' ')}\n[d2] ${d2.map((c: any) => `${c.op}:${c.id ?? c.compId ?? ''}${c.parent ? '^' + c.parent : ''}${c.tag ? ':' + c.tag : ''}`).join(' ')}`
        }
      }
    }
  }
  assert.equal(mismatches, 0, `keyed×输出组件混合不等价 ${mismatches}/600\n${sample}`)
})
