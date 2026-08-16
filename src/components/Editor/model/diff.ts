/**
 * weifuwu/components/Editor/model/diff — 文本 diff（AI 建议对比用）
 *
 * 零依赖：公共前缀/后缀剪枝 + 中间 LCS（滚动数组 O(m) 空间）。
 * 裁剪：总长度超 DIFF_MAX_LEN 退化为整体替换（诚实裁剪——大文本不追求
 * 精细 diff，AI 选区级文本通常 < 4k）。
 */

export type DiffOp =
  | { type: 'equal'; text: string }
  | { type: 'insert'; text: string }
  | { type: 'delete'; text: string }

export const DIFF_MAX_LEN = 4000

/** LCS 中间段（a、b 无公共前后缀）——DP 滚动数组回溯 */
function lcsOps(a: string, b: string): DiffOp[] {
  const n = a.length
  const m = b.length
  // dp[j] = a[0..i] 与 b[0..j] 的 LCS 长度（滚动行）
  const dp = new Uint32Array(m + 1)
  const prevRow = new Uint32Array(m + 1)
  for (let i = 1; i <= n; i++) {
    const row = i % 2 === 1 ? dp : prevRow
    const prev = i % 2 === 1 ? prevRow : dp
    for (let j = 1; j <= m; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1])
    }
  }
  // 回溯（重建操作序列）
  const ops: DiffOp[] = []
  let i = n
  let j = m
  const rowOf = (idx: number): Uint32Array => (idx % 2 === 1 ? dp : prevRow)
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', text: a[i - 1] })
      i--
      j--
    } else if (rowOf(i)[j] === rowOf(i - 1)[j]) {
      ops.push({ type: 'delete', text: a[i - 1] })
      i--
    } else {
      ops.push({ type: 'insert', text: b[j - 1] })
      j--
    }
  }
  while (i > 0) { ops.push({ type: 'delete', text: a[i - 1] }); i-- }
  while (j > 0) { ops.push({ type: 'insert', text: b[j - 1] }); j-- }
  // 合并相邻同类 + 逆序还原
  const merged: DiffOp[] = []
  for (let k = ops.length - 1; k >= 0; k--) {
    const op = ops[k]
    const last = merged[merged.length - 1]
    if (last && last.type === op.type) last.text += op.text
    else merged.push({ ...op })
  }
  return merged
}

/** a → b 的文本 diff（公共前后缀剪枝——编辑两端不动的场景零 DP） */
export function textDiff(a: string, b: string): DiffOp[] {
  if (a === b) return [{ type: 'equal', text: a }]
  if (a.length + b.length > DIFF_MAX_LEN) {
    // 大文本裁剪：整体替换（诚实裁剪——不追求精细）
    const ops: DiffOp[] = []
    if (a) ops.push({ type: 'delete', text: a })
    if (b) ops.push({ type: 'insert', text: b })
    return ops
  }
  // 公共前缀
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  // 公共后缀
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  const mid = lcsOps(a.slice(p, a.length - s), b.slice(p, b.length - s))
  const ops: DiffOp[] = []
  if (p > 0) ops.push({ type: 'equal', text: a.slice(0, p) })
  ops.push(...mid)
  if (s > 0) ops.push({ type: 'equal', text: a.slice(a.length - s) })
  // 合并边界同类
  const merged: DiffOp[] = []
  for (const op of ops) {
    const last = merged[merged.length - 1]
    if (last && last.type === op.type) last.text += op.text
    else merged.push({ ...op })
  }
  return merged
}

/** diff 统计（AI 面板摘要：+N/-M） */
export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const op of ops) {
    if (op.type === 'insert') added += op.text.length
    else if (op.type === 'delete') removed += op.text.length
  }
  return { added, removed }
}
