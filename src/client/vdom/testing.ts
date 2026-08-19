/**
 * vdom — 测试不变量 helper（覆盖标准 §1.2/§2——禁止手抄/禁止只查存在性）
 *
 * 每个渲染测试强制断言的不变量：
 * - **同构**：childNodes.length === 期望形态序列长度（占位锚 ↔ 真实节点
 *   互换长度恒定——塌缩即 bug）
 * - **位置**：数组第 i 项 ⟷ childNodes 第 i 个（位置错位即 bug）
 * - **引用**：同 key/同位置复用项 DOM 节点引用不变（重建即 bug）
 * - **资源**：remove/done 后事件表/ref 表/portal 容器清理（残留即 bug）
 */

import assert from 'node:assert/strict'

export type Shape = 'element' | 'text' | 'hole' | 'comment'

/** 节点形态判定（跨 realm 安全——nodeType 而非 instanceof） */
export function shapeOf(node: Node): Shape {
  if (node.nodeType === 1) return 'element'
  if (node.nodeType === 3) return 'text'
  if (node.nodeType === 8) return 'hole'
  return 'comment'
}

/**
 * 同构断言：container.childNodes 与期望形态序列**逐位一致**
 * （长度 + 位置 + 类型）——childNodes.length 恒等于序列长度
 */
export function assertIsomorphic(
  container: HTMLElement,
  expectShapes: Shape[],
  msg = '同构（childNodes 长度 + 位置 + 类型）',
): void {
  assert.equal(container.childNodes.length, expectShapes.length, `${msg}——长度（塌缩/多余即 bug）`)
  for (let i = 0; i < expectShapes.length; i++) {
    assert.equal(
      shapeOf(container.childNodes[i]),
      expectShapes[i],
      `${msg}——位置 ${i}（第 i 项 ⟷ childNodes 第 i 个）`,
    )
  }
}

/** 位置断言：第 i 个 childNode 是期望类型（边界位置——位置 0/末尾重点） */
export function assertSlot(
  container: HTMLElement,
  index: number,
  expect: Shape,
  msg = `位置 ${index}`,
): void {
  assert.ok(container.childNodes[index], `${msg}——存在`)
  assert.equal(shapeOf(container.childNodes[index]), expect, `${msg}——类型`)
}

/** 引用断言：复用项 DOM 节点引用不变（重建即 bug——焦点/状态丢失） */
export function assertKept<T extends Node>(
  container: HTMLElement,
  selector: string,
  before: T,
  msg = '复用项 DOM 引用保持（不重建）',
): asserts before is T {
  const after = container.querySelector(selector)
  assert.ok(after, `${msg}——新项存在`)
  assert.equal(after, before, msg)
}

/** 往返断言：状态切换后回到原 DOM 形态（可逆性——状态不漂移） */
export async function assertRoundTrip(
  toggle: () => void,
  assertOff: () => void,
  assertOn: () => void,
  waitFor: (fn: () => boolean) => Promise<void>,
  rounds = 2,
  msg = '往返可逆（状态不漂移）',
): Promise<void> {
  for (let r = 0; r < rounds; r++) {
    toggle()
    await waitFor(assertOn as unknown as () => boolean)
    toggle()
    await waitFor(assertOff as unknown as () => boolean)
  }
}
