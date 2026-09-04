/**
 * 问卷 WS 契约测试（2027-09——历史提交污染回归红线）
 *
 * 背景（c1b2fadf 实测）：server 曾在 WS open 时预发**无 campaign 过滤**的全局
 * state——其中含历史 campaign（25934b6d）的同源提交——表单页 onMessage 的
 * lock 判定（submissions.find(source)）命中旧提交 → 页面显示「已提交（#旧id）」
 * → 新 campaign 角色不再提交（假完成）→ run 超时失败。
 *
 * 修复后的契约（本文件锁定）：
 * 1. open 不再预发 state——页面一律 hello 请求（带 campaign 视角）
 * 2. hello 回复按 campaign 过滤（不同 campaign 同源提交不可见——页面锁不污染）
 * 3. 同 campaign 提交后重连 → state 含该提交（锁定重建语义——角色已提交即锁）
 * 4. 提交落库（campaign_id 归属——完成信号依赖该行——反查兜底）
 *
 * 运行：node --env-file=.env --test test/survey-ws.test.ts
 * （复用 test/ui/shared 的共享 server 基建——端口 39217——真实 DB——测试后清理）
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from 'weifuwu'
import { getSharedServer } from './ui/shared.ts'

let base = ''
let pg: ReturnType<typeof postgres> | null = null
const CAMP_1 = 'ws-test-camp-1'
const CAMP_2 = 'ws-test-camp-2'
const SOURCE = 'WS契约-测试源'

/** 连接 + 可选 hello——收集消息直到满足谓词（或超时） */
function wsClient(): { ws: WebSocket; sent: any[]; received: any[]; hello(campaign?: string, src?: string): void; waitFor(pred: (m: any) => boolean, timeoutMs?: number): Promise<any> } {
  const sent: any[] = []
  const received: any[] = []
  const ws = new WebSocket(`${base}/survey-live`)
  const waiters: Array<{ pred: (m: any) => boolean; resolve: (m: any) => void; timer: any }> = []
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data))
    received.push(m)
    for (const w of [...waiters]) {
      if (w.pred(m)) { clearTimeout(w.timer); waiters.splice(waiters.indexOf(w), 1); w.resolve(m) }
    }
  }
  const waitFor = (pred: (m: any) => boolean, timeoutMs = 5_000) =>
    new Promise<any>((resolve, reject) => {
      const hit = received.find(pred)
      if (hit) return resolve(hit)
      const timer = setTimeout(() => { const i = waiters.findIndex((w) => w.pred === pred); if (i >= 0) waiters.splice(i, 1); reject(new Error('WS 消息超时')) }, timeoutMs)
      waiters.push({ pred, resolve, timer })
    })
  return {
    ws, sent, received,
    hello(campaign?: string, src: string = SOURCE) {
      const m: any = { type: 'survey:hello', source: src }
      if (campaign !== undefined) m.campaign = campaign
      sent.push(m); ws.send(JSON.stringify(m))
    },
    waitFor,
  }
}

before(async () => {
  const srv = await getSharedServer()
  base = srv.base
  pg = postgres({ memory: true })
})

after(async () => {
  // 清理走 orm.query AST（零 SQL 文本面——in 算子）
  try { await pg?.orm.query.from('survey_answers').delete().where({ campaign_id: { in: [CAMP_1, CAMP_2] } }).run() } catch (e: any) { console.error('[survey-ws] answers 清理失败:', e?.message) }
  try { await pg?.orm.query.from('survey_submissions').delete().where({ campaign_id: { in: [CAMP_1, CAMP_2] } }).run() } catch (e: any) { console.error('[survey-ws] submissions 清理失败:', e?.message) }
  try { await (pg as any)?.close?.() } catch { /* */ }
})

test('契约1（历史污染红线）：open 不预发全局 state——hello 才回 campaign 视角', async () => {
  const c = wsClient()
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS 连接超时')), 5_000)
    c.ws.onopen = () => { clearTimeout(timer); resolve() }
  })
  // 2s 窗口内不得出现任何 survey:state（旧实现 open 立即发全局 state——污点源）
  await new Promise((r) => setTimeout(r, 800))
  const preStates = c.received.filter((m) => m.type === 'survey:state')
  assert.equal(preStates.length, 0, `open 不得预发 state（历史提交污染源）——实际 ${preStates.length} 条`)
  // hello 带 campaign → 收到该 campaign 视角的 state
  c.hello(CAMP_1)
  const st = await c.waitFor((m) => m.type === 'survey:state')
  assert.equal(st.campaign, CAMP_1, 'state 必须携带请求的 campaign 视角')
  assert.ok(Array.isArray(st.submissions), 'state 含 submissions 数组')
  c.ws.close()
})

test('契约2（campaign 隔离）：他 campaign 的同源提交不可见——页面锁不污染', async () => {
  // 先在 CAMP_1 提交（源 SOURCE）
  const a = wsClient()
  await new Promise<void>((resolve) => { a.ws.onopen = () => resolve() })
  a.hello(CAMP_1)
  await a.waitFor((m) => m.type === 'survey:state' && m.campaign === CAMP_1)
  const submitDone = a.waitFor((m) => m.type === 'survey:submitted' && m.latest?.source === SOURCE)
  a.ws.send(JSON.stringify({ type: 'survey:submit', source: SOURCE, data: { age: '26-35', industry: '互联网', rating: 3, focus: ['易用性'], feedback: 'ws 契约测试反馈', campaign: CAMP_1 } }))
  const sub = await submitDone
  assert.ok(sub.latest?.id, '提交应产生 server 生成的 id')
  // CAMP_2（同源）视角 → 不得包含该提交（历史污染红线：他 campaign 同源提交不得出现）
  const b = wsClient()
  await new Promise<void>((resolve) => { b.ws.onopen = () => resolve() })
  b.hello(CAMP_2)
  const st2 = await b.waitFor((m) => m.type === 'survey:state' && m.campaign === CAMP_2)
  assert.equal(st2.submissions.filter((s: any) => s.source === SOURCE).length, 0, 'CAMP_2 视角不得出现 CAMP_1 的同源提交')
  assert.ok(st2.globalCount >= 1, 'globalCount 仍全量（视角过滤不影响全局计数）')
  // CAMP_1 同campaign重连 → 包含该提交（锁定重建语义）
  const c = wsClient()
  await new Promise<void>((resolve) => { c.ws.onopen = () => resolve() })
  c.hello(CAMP_1)
  const st3 = await c.waitFor((m) => m.type === 'survey:state' && m.campaign === CAMP_1)
  const mine = st3.submissions.find((s: any) => s.source === SOURCE)
  assert.ok(mine, '同 campaign 视角应包含自己的提交')
  assert.equal(mine.campaign, CAMP_1, '提交行 campaign 归属正确（完成信号匹配）')
  a.ws.close(); b.ws.close(); c.ws.close()
})
