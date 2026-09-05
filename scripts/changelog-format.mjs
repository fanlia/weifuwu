/**
 * CHANGELOG 生成逻辑（release.mjs Step 3.75 提取——可测面）
 *
 * 域分组（docs-可学习性 W2）：conventional scope 提取为域标签
 * （feat(orm): xxx → `- orm：xxx`）——无 scope 进「核心层」——
 * [0.92+ 生效（历史段不重写）。
 */

/** 解析 commit 行 → { type, scope, title } */
export function parseCommitLine(line) {
  const m = line.match(/^\w+ ((?:feat|fix|docs|test|chore))(?:\(([^)]*)\))?: (.+)$/)
  if (m) return { type: m[1], scope: m[2] ?? '', title: m[3].trim() }
  if (line) return { type: 'other', scope: '', title: line.replace(/^\w+\s/, '').trim() }
  return null
}

/** log（git log --oneline 输出）→ 分组（type → 条目数组——含域前缀） */
export function parseCommits(log) {
  const groups = { feat: [], fix: [], docs: [], test: [], chore: [], other: [] }
  const scopes = new Set()
  for (const line of log.split('\n')) {
    const p = parseCommitLine(line)
    if (!p) continue
    const dom = p.scope || 'core'
    scopes.add(dom)
    // 域前缀（无 scope → 核心层——诚实标签不猜测）
    groups[p.type].push(p.title || (p.scope ? `（${p.scope}）` : ''))
    groups[p.type][groups[p.type].length - 1] = `${dom}：${groups[p.type][groups[p.type].length - 1]}`
  }
  return { groups, scopes: [...scopes].sort() }
}

/** 分组 → changelog 条目（域统计 + 分组条目） */
export function formatEntry(version, date, groups, scopes) {
  const entry = [`## [${version}] - ${date}`, '']
  // 域统计（一览——平铺 Other 反例的治理面）
  const counts = {}
  for (const [k, arr] of Object.entries(groups)) {
    for (const item of arr) {
      const dom = item.split('：')[0]
      counts[dom] = (counts[dom] ?? 0) + 1
    }
  }
  if (Object.keys(counts).length > 0) {
    entry.push(`按域统计：${Object.entries(counts).map(([d, n]) => `${d} ${n}`).join(' · ')}`, '')
  }
  const title = { feat: '### Added', fix: '### Fixed', docs: '### Docs', test: '### Tests', chore: '### Chore', other: '### Other（未分类——人工补域）' }
  for (const [k, label] of Object.entries(title)) {
    if (groups[k].length) entry.push(label, '', ...groups[k].map((x) => `- ${x}`), '')
  }
  return entry.join('\n').trim()
}
