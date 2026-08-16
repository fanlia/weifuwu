/**
 * Editor 文档模型测试——折叠不变量（文档 = fold(事件流)）
 *
 * 核心验收（design/editor-events-plan.md 阶段 0）：
 * 1. 折叠不变量：随机事件序列 → apply → 状态；空文档重放 → 状态一致
 * 2. 逆操作：任意事件 → apply → inverse → 状态复原
 * 3. undo 全部 → 空文档；redo → 复原
 * 4. 结构不变量：段起点/占位符/区间合法性（fuzz 后检查）
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEdit } from './apply.ts'
import { segmentStarts, blockPropAt } from './apply.ts'
import { inverseEdit, inverseCommit } from './inverse.ts'
import { createHistory, pushCommit, popUndo, popRedo, canUndo, canRedo } from './history.ts'
import type { DocState, EditEvent, Commit } from './types.ts'
import { EMBED_CHAR, EMPTY_DOC } from './types.ts'

// ── 种子化随机（mulberry32——可复现 fuzz） ────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CHARS = 'abc \n中文xyz'
function randText(rnd: () => number, maxLen = 12): string {
  let s = ''
  const n = 1 + Math.floor(rnd() * maxLen)
  for (let i = 0; i < n; i++) s += CHARS[Math.floor(rnd() * CHARS.length)]
  return s
}

/** 生成合法随机事件（需要当前 doc 上下文——fuzz 顺序应用） */
function randEvent(doc: DocState, rnd: () => number): EditEvent {
  const n = doc.text.length
  const kind = Math.floor(rnd() * 8)
  switch (kind) {
    case 0: // text-insert
      return { type: 'text-insert', at: Math.floor(rnd() * (n + 1)), text: randText(rnd) }
    case 1: { // text-delete（携带被删区间内 embeds——逆操作恢复条目）
      if (n === 0) return { type: 'text-insert', at: 0, text: randText(rnd, 5) }
      const at = Math.floor(rnd() * n)
      const maxLen = Math.min(n - at, 1 + Math.floor(rnd() * 6))
      const len = 1 + Math.floor(rnd() * maxLen)
      return {
        type: 'text-delete', at, len,
        removed: doc.text.slice(at, at + len),
        removedEmbeds: doc.embeds.filter((e) => e.at >= at && e.at < at + len),
        removedBlocks: doc.blockProps.filter((b) => b.start >= at && b.start <= at + len),
      }
    }
    case 2: { // text-insert 变体（mark 区间表示不可逆——逆操作 fuzz 只测原子事件）
      return { type: 'text-insert', at: Math.floor(rnd() * (n + 1)), text: randText(rnd, 6) }
    }
    case 3: { // block-set（段起点）
      const starts = segmentStarts(doc.text)
      const start = starts[Math.floor(rnd() * starts.length)]
      const prev = blockPropAt(doc, start)
      return {
        type: 'block-set', start,
        kind: ['p', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol'][Math.floor(rnd() * 7)] as any,
        align: rnd() > 0.5 ? ['left', 'center', 'right'][Math.floor(rnd() * 3)] as any : null,
        prev,
      }
    }
    case 4: { // embed-insert（唯一 id）
      const at = Math.floor(rnd() * (n + 1))
      const id = `e${Math.floor(rnd() * 1e9)}`
      return {
        type: 'embed-insert', at,
        embed: { id, at, type: 'img', html: `<img src="x${Math.floor(rnd() * 3)}">` },
      }
    }
    case 5: { // embed-delete（删真实存在的 embed）
      const e = doc.embeds[Math.floor(rnd() * doc.embeds.length)]
      if (!e) return { type: 'text-insert', at: 0, text: randText(rnd, 5) }
      return { type: 'embed-delete', at: e.at, embed: e }
    }
    case 6: { // ai-apply（快照式）
      if (n === 0) return { type: 'text-insert', at: 0, text: randText(rnd, 5) }
      const s = Math.floor(rnd() * n)
      const e = Math.min(n, s + 1 + Math.floor(rnd() * (n - s)))
      return { type: 'ai-apply', start: s, end: e, original: doc.text.slice(s, e), revised: randText(rnd, 8), removedEmbeds: doc.embeds.filter((x) => x.at >= s && x.at < e), removedBlocks: doc.blockProps.filter((b) => b.start >= s && b.start <= e) }
    }
    default: // 混合（连续小操作）
      return { type: 'text-insert', at: Math.floor(rnd() * (n + 1)), text: randText(rnd, 4) }
  }
}

// ── 结构不变量检查 ────────────────────────────────────────────────────

function assertDocInvariants(doc: DocState, msg: string): void {
  // 段起点合法（0 与 \n 之后）
  const starts = segmentStarts(doc.text)
  assert.equal(starts[0], 0, `${msg}: 首段起点 0`)
  for (const s of starts) {
    if (s > 0) assert.equal(doc.text[s - 1], '\n', `${msg}: 段起点前是 \\n (${s})`)
  }
  // blockProps 起点都是有效段起点
  for (const b of doc.blockProps) {
    assert.ok(starts.includes(b.start), `${msg}: blockProps.start 是段起点 (${b.start})`)
  }
  // marks 区间合法
  for (const m of doc.marks) {
    assert.ok(m.start >= 0 && m.end <= doc.text.length && m.start < m.end, `${msg}: mark 区间合法`)
  }
  // embeds：at 处是占位符
  for (const e of doc.embeds) {
    assert.equal(doc.text[e.at], EMBED_CHAR, `${msg}: embed at 处是占位符 (${e.at})`)
  }
}

// ── 测试 ──────────────────────────────────────────────────────────────

test('折叠不变量：随机序列重放（多种子）', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const rnd = mulberry32(seed)
    let doc = EMPTY_DOC
    const events: EditEvent[] = []
    const N = 200
    for (let i = 0; i < N; i++) {
      const ev = randEvent(doc, rnd)
      events.push(ev)
      doc = applyEdit(doc, ev)
      assertDocInvariants(doc, `seed=${seed} step=${i}`)
    }
    // 从空文档重放同一序列 → 状态一致
    let replay = EMPTY_DOC
    for (const ev of events) replay = applyEdit(replay, ev)
    assert.deepEqual(replay, doc, `seed=${seed}: 重放 === 原状态`)
  }
})

test('逆操作不变量：apply → inverse → 复原（逐步——原子事件）', () => {
  for (let seed = 101; seed <= 104; seed++) {
    const rnd = mulberry32(seed)
    let doc = EMPTY_DOC
    for (let i = 0; i < 300; i++) {
      const ev = randEvent(doc, rnd)
      const after = applyEdit(doc, ev)
      // 逆操作带 after 上下文（text-insert 逆需要提取区间内段属性）
      const inv = inverseEdit(ev, after)
      const back = Array.isArray(inv) ? inv.reduce((d, e) => applyEdit(d, e), after) : applyEdit(after, inv)
      assert.deepEqual(back, doc, `seed=${seed} step=${i} 逆操作复原`)
      doc = after
    }
  }
})

test('mark-apply 逆操作：mark-restore 快照精确恢复（区间收缩不可逆——快照兜底）', () => {
  let doc = EMPTY_DOC
  doc = applyEdit(doc, { type: 'text-insert', at: 0, text: 'hello world' })
  doc = applyEdit(doc, { type: 'mark-apply', start: 0, end: 5, mark: 'b', on: true, prev: [] })
  // 重叠 on：区间独立（不合并——[0,5) 与 [2,8) 共存）
  const merged = applyEdit(doc, { type: 'mark-apply', start: 2, end: 8, mark: 'b', on: true, prev: [{ start: 0, end: 5, type: 'b' }] })
  assert.deepEqual(merged.marks.map((m) => ({ start: m.start, end: m.end, type: m.type })).sort((a, b) => a.start - b.start), [
    { start: 0, end: 2, type: 'b' }, { start: 2, end: 8, type: 'b' },
  ], '相交收缩 + 新区间（0-8 全覆盖语义）')
  // 逆操作 = mark-restore（绝对恢复操作前区间）
  const inv = inverseEdit({ type: 'mark-apply', start: 2, end: 8, mark: 'b', on: true, prev: [{ start: 0, end: 5, type: 'b' }] }, merged)
  assert.equal(inv.type, 'mark-restore')
  const back = applyEdit(merged, inv as any)
  assert.deepEqual(back, doc, '快照精确恢复')
  // mark-restore 再逆（双向——带 doc 上下文提取当前区间）
  const inv2 = inverseEdit(inv as any, back)
  const fwd = applyEdit(back, inv2 as any)
  assert.deepEqual(fwd, merged, 'mark-restore 双向可逆')
})

test('undo 全部 → 空文档；redo → 复原（commit 快照 + 事件重放）', () => {
  const rnd = mulberry32(2024)
  const h = createHistory()
  const commits: Commit[] = []
  let doc = EMPTY_DOC
  // 5 个 commit，每 commit 1-3 个事件（before = 操作前快照——undo 精确恢复）
  for (let c = 0; c < 5; c++) {
    const before = doc
    const events: EditEvent[] = []
    const n = 1 + Math.floor(rnd() * 3)
    for (let i = 0; i < n; i++) {
      const ev = randEvent(doc, rnd)
      events.push(ev)
      doc = applyEdit(doc, ev)
    }
    commits.push({ label: `commit-${c}`, events, before })
    pushCommit(h, commits[c])
  }
  const final = doc
  // undo 全部：恢复 before 快照
  for (let c = 4; c >= 0; c--) {
    const commit = popUndo(h)
    assert.ok(commit)
    doc = commit.before
  }
  assert.equal(doc.text, '', 'undo 全部后空文档')
  assert.equal(doc.marks.length, 0)
  assert.equal(doc.embeds.length, 0)
  assert.equal(doc.blockProps.length, 0)
  // redo 全部：从 before 重放事件（fold 语义）
  for (let c = 0; c < 5; c++) {
    const commit = popRedo(h)
    assert.ok(commit)
    let d = commit.before
    for (const ev of commit.events) d = applyEdit(d, ev)
    doc = d
  }
  assert.deepEqual(doc, final, 'redo 重放复原')
  assert.equal(canUndo(h), true)
  assert.equal(canRedo(h), false)
})

test('undo 后新 commit 清空 redo 栈（新分支）', () => {
  const h = createHistory()
  const c1: Commit = { label: 'a', events: [{ type: 'text-insert', at: 0, text: 'a' }], before: EMPTY_DOC }
  const c2: Commit = { label: 'b', events: [{ type: 'text-insert', at: 1, text: 'b' }], before: { text: 'a', blockProps: [], marks: [], embeds: [] } }
  pushCommit(h, c1)
  pushCommit(h, c2)
  assert.equal(canUndo(h), true)
  const popped = popUndo(h)
  assert.equal(popped?.label, 'b')
  assert.equal(canRedo(h), true)
  pushCommit(h, { label: 'c', events: [{ type: 'text-insert', at: 2, text: 'c' }], before: { text: 'ab', blockProps: [], marks: [], embeds: [] } })
  assert.equal(canRedo(h), false, '新 commit 清空 redo')
  assert.equal(h.undoStack.length, 2)
})

test('history 栈深上限（20 默认）', () => {
  const h = createHistory()
  for (let i = 0; i < 25; i++) {
    pushCommit(h, { label: `c${i}`, events: [{ type: 'text-insert', at: 0, text: 'x' }], before: EMPTY_DOC })
  }
  assert.equal(h.undoStack.length, 20, '超深丢弃最旧')
  assert.equal(h.undoStack[0].label, 'c5')
})

test('偏移平移：插入/删除后 marks/embeds/blockProps 同步', () => {
  // 构造：段1 (H1) "hello"，段2 "world" + b mark + img embed
  let doc = EMPTY_DOC
  doc = applyEdit(doc, { type: 'text-insert', at: 0, text: 'hello\nworld' })
  doc = applyEdit(doc, { type: 'block-set', start: 0, kind: 'h1', align: null, prev: null })
  doc = applyEdit(doc, { type: 'mark-apply', start: 6, end: 11, mark: 'b', on: true, prev: [] })
  doc = applyEdit(doc, { type: 'embed-insert', at: 5, embed: { id: 'img1', at: 5, type: 'img', html: '<img src="a">' } })
  // 插入前：text = "hello\uFFFC\nworld"（len 12）；embed at 5；mark [6,11)
  assert.equal(doc.text, `hello${EMBED_CHAR}\nworld`)
  assert.equal(doc.embeds[0].at, 5)
  // embed 占位符插入 at=5 → mark [6,11) 平移到 [7,12)
  assert.deepEqual(doc.marks.map((m) => ({ start: m.start, end: m.end, type: m.type })), [{ start: 7, end: 12, type: 'b' }])
  // 段1 前插入 "A" → 所有 offset +1
  doc = applyEdit(doc, { type: 'text-insert', at: 0, text: 'A' })
  assert.equal(doc.embeds[0].at, 6)
  assert.deepEqual(doc.marks.map((m) => ({ start: m.start, end: m.end, type: m.type })), [{ start: 8, end: 13, type: 'b' }])
  assert.deepEqual(doc.blockProps, [{ start: 0, kind: 'h1' }], '段首插入属性跟随段起点（起点不变）')
  // 删除 embed 占位符（按 id）
  doc = applyEdit(doc, { type: 'embed-delete', at: 6, embed: { id: 'img1', at: 6, type: 'img', html: '<img src="a">' } })
  assert.equal(doc.embeds.length, 0)
  assert.equal(doc.text, 'Ahello\nworld')
  // 删除段首字符（段起点不变——属性保留）
  doc = applyEdit(doc, { type: 'text-delete', at: 0, len: 1, removed: 'A', removedEmbeds: [], removedBlocks: [{ start: 0, kind: 'h1' }] })
  assert.deepEqual(doc.blockProps, [{ start: 0, kind: 'h1' }], '段首删除属性保留')
})

test('ai-apply 原子替换 + 区间内 mark 收缩', () => {
  let doc = EMPTY_DOC
  doc = applyEdit(doc, { type: 'text-insert', at: 0, text: 'hello world' })
  doc = applyEdit(doc, { type: 'mark-apply', start: 0, end: 5, mark: 'b', on: true, prev: [] })
  doc = applyEdit(doc, { type: 'mark-apply', start: 6, end: 11, mark: 'i', on: true, prev: [] })
  // AI 替换 [0,11) → "你好"
  doc = applyEdit(doc, { type: 'ai-apply', start: 0, end: 11, original: 'hello world', revised: '你好', removedEmbeds: [], removedBlocks: [] })
  assert.equal(doc.text, '你好')
  assert.equal(doc.marks.length, 0, '区间内 marks 全部移除')
  // 部分替换：[1,2)（"好"）→ "嗨"
  doc = applyEdit(doc, { type: 'ai-apply', start: 1, end: 2, original: '好', revised: '嗨', removedEmbeds: [], removedBlocks: [] })
  assert.equal(doc.text, '你嗨')
  // original 不符 → 抛错（诚实失败）
  assert.throws(() => applyEdit(doc, { type: 'ai-apply', start: 0, end: 1, original: 'X', revised: 'Y', removedEmbeds: [], removedBlocks: [] }))
})

test('text-delete 跨段合并保留块属性（取 at 前段）', () => {
  let doc = EMPTY_DOC
  doc = applyEdit(doc, { type: 'text-insert', at: 0, text: '标题\n正文内容' })
  doc = applyEdit(doc, { type: 'block-set', start: 0, kind: 'h1', align: null, prev: null })
  // 删除 "\n正文"（段分隔 + 第二段开头）→ 合并为单段，H1 保留
  doc = applyEdit(doc, { type: 'text-delete', at: 2, len: 3, removed: '\n正文', removedEmbeds: [], removedBlocks: [] })
  assert.equal(doc.text, '标题内容')
  assert.deepEqual(doc.blockProps, [{ start: 0, kind: 'h1' }], '合并段继承第一段属性')
})
