export type DiffLineType = 'add' | 'remove' | 'same'

export interface DiffLine {
  type: DiffLineType
  line: string
}

/**
 * LCS（最长公共子序列）行级 diff——O(n·m) 动态规划。
 * 返回按原顺序排列的行序列：same（公共行）/ remove（仅旧）/ add（仅新）。
 *
 * 实现：DP 表回溯——公共行保留原顺序，删除行在前、新增行在后（相邻配对，
 * 符合 diff 展示惯例：修改 = 删旧 + 增新）。
 */
export function diffLines(oldCode: string, newCode: string): DiffLine[] {
  const oldLines = oldCode === '' ? [] : oldCode.split('\n')
  const newLines = newCode === '' ? [] : newCode.split('\n')
  const n = oldLines.length
  const m = newLines.length
  if (n === 0) return newLines.map(line => ({ type: 'add' as const, line }))
  if (m === 0) return oldLines.map(line => ({ type: 'remove' as const, line }))

  // DP：dp[i][j] = oldLines[i..] 与 newLines[j..] 的 LCS 长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  // 回溯：优先跳过删除（让 remove 出现在 add 前，相邻配对）
  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'same', line: oldLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'remove', line: oldLines[i] })
      i++
    } else {
      result.push({ type: 'add', line: newLines[j] })
      j++
    }
  }
  while (i < n) {
    result.push({ type: 'remove', line: oldLines[i] })
    i++
  }
  while (j < m) {
    result.push({ type: 'add', line: newLines[j] })
    j++
  }
  return result
}

/** 将 diff 行分组为渲染块：连续 same 合并为 same 块（组件按 sameCount 决定是否折叠），add/remove 独立成块 */
export function groupDiffLines(
  lines: DiffLine[],
): { kind: 'same' | 'change'; sameCount?: number; lines: DiffLine[] }[] {
  const groups: { kind: 'same' | 'change'; sameCount?: number; lines: DiffLine[] }[] = []
  let run: DiffLine[] = []

  const flush = () => {
    if (run.length === 0) return
    if (run[0].type === 'same') {
      groups.push({ kind: 'same', sameCount: run.length, lines: run })
    } else {
      groups.push({ kind: 'change', lines: run })
    }
    run = []
  }

  for (const line of lines) {
    const kind = line.type === 'same' ? 'same' : 'change'
    // 当前 run 的 kind（run[0] 单一判断源）——kind 切换时先 flush 再开新段
    // **2027-XX 实证修复**：原实现从未分段（全部行进同一 run——末尾 flush 一次）——
    // 整个 diff 被当成首行 kind 的单组（same:12 覆盖 remove/add——折叠全错）
    const runKind = run.length === 0 ? null : run[0].type === 'same' ? 'same' : 'change'
    if (runKind !== null && runKind !== kind) flush()
    run.push(line)
  }
  flush()
  return groups
}
