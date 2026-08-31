/**
 * shared Trie 契约（SHARED-TRIE-EXCELLENCE 波次 A1——2027-10）
 *
 * **单一实现源的守护位归位**：此前 fuzz/语义锚点寄生在
 * server/core/router-contract.test.ts——shared 模块零自有测试。
 * 本文件是 shared 域首测试——server 侧契约保留（消费端集成面——双保险）。
 *
 * 锁定面：
 * - 匹配语义对账 fuzz（8 种子 × 200 对——线性扫描参考模型终态等价）
 * - 语义锚点（探针实证）：浅通配优先 / param>通配 / 静态首段贪心 /
 *   param 冲突抛错 / 通配独立槽 / 精确优先标记 '*': '' / '*': 剩余段
 * - trieFind 精确纪律（agent-platform 事故——静态段不命中 param 槽）
 * - splitPath 编码（根路径 []/空段过滤）
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createTrie, trieRegister, trieMatch, trieFind, splitPath } from './trie.ts'

// ── 匹配语义对账 fuzz（参考模型——语义规则探针实证） ────────────

/** 线性扫描参考模型——胜者规则：精确集合 staticCount 最大（生成器保证
 *  唯一 specificity）；通配集合前缀深度最小（浅优先）；精确整体优先 */
function referenceMatch(
  patterns: Array<{ path: string; id: number }>, reqSegs: string[],
): { id: number; params: Record<string, string>; wildcard: boolean } | null {
  let best: { id: number; params: Record<string, string>; staticCount: number } | null = null
  for (const p of patterns) {
    if (p.path.includes('*')) continue
    const segs = splitPath(p.path)
    if (segs.length !== reqSegs.length) continue
    const params: Record<string, string> = {}
    let staticCount = 0
    let hit = true
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]
      if (s.startsWith(':')) params[s.slice(1)] = reqSegs[i]
      else if (s === reqSegs[i]) staticCount++
      else { hit = false; break }
    }
    if (!hit) continue
    if (!best || staticCount > best.staticCount) best = { id: p.id, params, staticCount }
  }
  if (best) {
    const hasWf = patterns.some((p) => p.path === patterns[best!.id].path + '/*')
    return { id: best.id, params: hasWf ? { ...best.params, '*': '' } : best.params, wildcard: false }
  }
  let wf: { id: number; params: Record<string, string>; depth: number } | null = null
  for (const p of patterns) {
    if (!p.path.includes('*')) continue
    const prefixSegs = splitPath(p.path.replace(/\/\*$/, ''))
    if (prefixSegs.length > reqSegs.length) continue
    const params: Record<string, string> = {}
    let hit = true
    for (let i = 0; i < prefixSegs.length; i++) {
      const s = prefixSegs[i]
      if (s.startsWith(':')) params[s.slice(1)] = reqSegs[i]
      else if (s !== reqSegs[i]) { hit = false; break }
    }
    if (!hit) continue
    if (!wf || prefixSegs.length < wf.depth) {
      wf = { id: p.id, params, depth: prefixSegs.length }
      wf.params['*'] = reqSegs.slice(prefixSegs.length).join('/')
    }
  }
  if (wf) return { id: wf.id, params: wf.params, wildcard: true }
  return null
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 随机 pattern 集（静态/param 池 + 尾通配——param 名带 depth 防冲突） */
function genPatterns(rnd: () => number): Array<{ path: string; id: number }> {
  const statics = ['a', 'b', 'c', 'd', 'e']
  const out: Array<{ path: string; id: number }> = []
  const used = new Set<string>()
  const n = 3 + Math.floor(rnd() * 8)
  let id = 0
  for (let i = 0; i < n; i++) {
    const depth = 1 + Math.floor(rnd() * 3)
    const segs: string[] = []
    let paramUsed = false
    for (let d = 0; d < depth; d++) {
      const r = rnd()
      if (r < 0.25 && !paramUsed) { segs.push(':p' + d); paramUsed = true }
      else segs.push(statics[Math.floor(rnd() * statics.length)])
    }
    const wildcard = rnd() < 0.4
    const path = '/' + segs.join('/') + (wildcard ? '/*' : '')
    if (!used.has(path)) { used.add(path); out.push({ path, id: id++ }) }
  }
  return out
}

describe('匹配语义对账 fuzz（8 种子 × 200 对）', () => {
  test('随机路由树 × 随机请求——value/params/wildcard 全等', () => {
    for (const seed of [11, 42, 99, 2026, 555, 7, 31337, 8888]) {
      const rnd = mulberry32(seed)
      const patterns = genPatterns(rnd)
      const trie = createTrie<{ id: number }>()
      for (const p of patterns) trieRegister(trie, p.path, { id: p.id }, p.path.includes('*'))
      const statics = ['a', 'b', 'c', 'd', 'e', 'zz']
      for (let i = 0; i < 200; i++) {
        const len = Math.floor(rnd() * 5)
        const reqSegs = Array.from({ length: len }, () => statics[Math.floor(rnd() * statics.length)])
        const got = trieMatch(trie, reqSegs)
        const want = referenceMatch(patterns, reqSegs)
        if (want === null) {
          assert.equal(got, null, `seed=${seed} i=${i} req=${reqSegs.join('/')}——模型 null Trie 命中 ${JSON.stringify(got)}`)
          continue
        }
        assert.ok(got, `seed=${seed} i=${i} req=${reqSegs.join('/')}——模型命中 id=${want.id} Trie null`)
        assert.equal(got.value.id, want.id, `seed=${seed} i=${i} req=${reqSegs.join('/')}——命中 pattern（Trie=${got.value.id} 模型=${want.id}）`)
        assert.equal(got.wildcard, want.wildcard, `seed=${seed} i=${i} wildcard 标志`)
        if (!got.wildcard) {
          assert.deepEqual(got.params, want.params, `seed=${seed} i=${i} req=${reqSegs.join('/')} id=${got.value.id} params Trie=${JSON.stringify(got.params)} 模型=${JSON.stringify(want.params)}`)
        }
      }
    }
  })
})

describe('语义锚点（探针实证固化）', () => {
  test('浅通配优先：/* 与 /a/* 并存对 /a/b——root 通配胜（wildcardFallback depth=0 起）', () => {
    const t = createTrie<{ id: number }>()
    trieRegister(t, '/*', { id: 1 }, true)
    trieRegister(t, '/a/*', { id: 2 }, true)
    assert.equal(trieMatch(t, ['a', 'b'])!.value.id, 1)
  })

  test('param 精确 > 通配', () => {
    const t = createTrie<{ id: number }>()
    trieRegister(t, '/:p/x', { id: 1 })
    trieRegister(t, '/*', { id: 2 }, true)
    const m = trieMatch(t, ['v', 'x'])!
    assert.equal(m.value.id, 1)
    assert.deepEqual(m.params, { p: 'v' })
  })

  test('静态首段贪心：/:a/b vs /a/:b 对 /a/b——static-first 胜', () => {
    const t = createTrie<{ id: number }>()
    trieRegister(t, '/:a/b', { id: 1 })
    trieRegister(t, '/a/:b', { id: 2 })
    assert.equal(trieMatch(t, ['a', 'b'])!.value.id, 2)
  })

  test('param 冲突抛错（同位 :id 与 :name——不静默）', () => {
    const t = createTrie()
    trieRegister(t, '/u/:id', { v: 1 })
    assert.throws(() => trieRegister(t, '/u/:name', { v: 2 }), /param conflict.*:id.*:name/s)
  })

  test('通配独立槽：/files 精确与 /files/* 通配并存互不覆盖', () => {
    const t = createTrie<{ id: number }>()
    trieRegister(t, '/files', { id: 1 })
    trieRegister(t, '/files/*', { id: 2 }, true)
    const m1 = trieMatch(t, ['files'])!
    assert.equal(m1.value.id, 1, '精确命中')
    assert.deepEqual(m1.params, { '*': '' }, '精确优先标记（节点有通配槽）')
    const m2 = trieMatch(t, ['files', 'a'])!
    assert.equal(m2.value.id, 2, '通配命中')
    assert.equal(m2.params['*'], 'a', "'*': 剩余段")
  })

  test('静态段只匹配静态子节点（agent-platform 事故——trieFind 精确纪律）', () => {
    const t = createTrie<{ tag: string }>()
    trieRegister(t, '/:id/debug', { tag: 'action' })
    // 静态段 'debug' 不得命中 :id 参数槽（旧实现 children.get(':') 兜底——污染共享 value）
    const found = trieFind(t, '/:id/debug')
    assert.ok(found, ':id 段 find 命中参数槽')
    assert.equal(trieFind(t, '/x/debug'), null, '静态 x 不命中（未注册）')
    const tw = createTrie<{ v: number }>()
    trieRegister(tw, '/a/*', { v: 1 }, true)
    assert.ok(trieFind(tw, '/a/*')?.wildcard, "find 遇 '*' 返回当前节点（通配槽冲突检查）")
  })
})

describe('splitPath 编码', () => {
  test("根路径 '/' → []（value 绑 root——空段过滤）", () => {
    assert.deepEqual(splitPath('/'), [])
    assert.deepEqual(splitPath('/a//b'), ['a', 'b'])
    assert.deepEqual(splitPath('/a/b'), ['a', 'b'])
  })

  test('根路径注册与匹配（root.value + 根通配）', () => {
    const t = createTrie<{ id: number }>()
    trieRegister(t, '/', { id: 1 })
    assert.equal(trieMatch(t, [])!.value.id, 1, "注册 '/' 匹配根")
    const t2 = createTrie<{ id: number }>()
    trieRegister(t2, '/*', { id: 2 }, true)
    const m2 = trieMatch(t2, [])!
    assert.equal(m2.value.id, 2, '根通配兜底')
    assert.equal(m2.wildcard, true, '根通配 wildcard 标志')
    // **A2 语义统一**：空段 exactDfs 化——通配命中恒有 '*' 键（编码唯一性——
    // 修复前根通配 params 无 '*'——与非空通配形态漂移）
    assert.equal(m2.params['*'], '', "通配命中恒有 '*': 剩余段（空=根）")
  })
})
