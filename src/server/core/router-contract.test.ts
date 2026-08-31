/**
 * Router 内核契约（ROUTER-CORE-EXCELLENCE 波次 A——2027-10）
 *
 * A2：mount 深水区（双层/通配展平/mountPath/冲突/ws）
 * A3：Trie 匹配对账 fuzz（随机路由树 × 随机请求——线性扫描参考模型
 *     终态等价——**语义规则探针实证**：
 *     ① 精确 > 通配；param 精确 > 通配
 *     ② 通配浅优先（/* 与 /a/* 并存——root-wf 胜——wildcardFallback
 *        从 depth=0 起扫）
 *     ③ 静态逐段贪心（/:a/b vs /a/:b 对 /a/b——static-first 胜）
 *     模型胜者规则：精确集合中 staticCount 最大（生成器保证唯一）；
 *     通配集合中前缀深度最小（浅优先）；精确整体优先于通配）
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { createTrie, trieRegister, trieMatch, splitPath } from '../../shared/router/trie.ts'

const ok = (label: string) => () => new Response(label)

describe('A2: mount 深水区', () => {
  test('子路由通配路由 mount 展平命中（P3 实证修复——直接注册对照）', async () => {
    // 修复前: _collectAll 只查 node.value——wildcardValue 静默丢失
    const sub = new Router()
    sub.get('/files/*', ok('wf'))
    const app = new Router()
    app.mount('/s', sub)
    const h = app.handler() as any
    const r = await h(new Request('http://x/s/files/a/b/c'), { params: {}, query: {} })
    assert.equal(r.status, 200)
    assert.equal(await r.text(), 'wf')
    // 直接注册对照（不经 mount——语义必须一致）
    const direct = new Router()
    direct.get('/s/files/*', ok('wf'))
    const r2 = await (direct.handler() as any)(new Request('http://x/s/files/a/b/c'), { params: {}, query: {} })
    assert.equal(await r2.text(), 'wf')
  })

  test('双层 mount——leaf 命中（P1）', async () => {
    const c = new Router(); c.get('/leaf', ok('c-leaf'))
    const b = new Router(); b.mount('/c', c)
    const a = new Router(); a.mount('/b', b)
    const h = a.handler() as any
    const r = await h(new Request('http://x/b/c/leaf'), { params: {}, query: {} })
    assert.equal(await r.text(), 'c-leaf')
  })

  test('mount 后同路径注册抛错（冲突检测——静默覆盖是违例）（P2）', () => {
    const sub = new Router(); sub.get('/x', ok('sub'))
    const app = new Router(); app.mount('/api', sub)
    assert.throws(() => app.get('/api/x', ok('dup')), /route conflict/)
  })

  test('精确 + 通配并存 mount——两条都展平（A1 双修：精确错标 + 通配丢失）', async () => {
    const sub = new Router()
    sub.get('/files', ok('exact'))
    sub.get('/files/*', ok('wf'))
    const app = new Router(); app.mount('/s', sub)
    const h = app.handler() as any
    const r1 = await h(new Request('http://x/s/files'), { params: {}, query: {} })
    assert.equal(await r1.text(), 'exact', '精确 /s/files 命中（修复前被错标为 /s/files/*）')
    const r2 = await h(new Request('http://x/s/files/deep'), { params: {}, query: {} })
    assert.equal(await r2.text(), 'wf', '通配 /s/files/* 命中')
  })

  test('ws 通配路由 mount 展平（A1Ws 同根因）', async () => {
    const sub = new Router()
    sub.ws('/chat/*', () => {}) as never
    const app = new Router(); app.mount('/ws', sub)
    // 展平面验证：_collectAllWs 收集到通配路径
    const routes = (app as any)._collectAllWs((app as any).wsRoot).map((r: any) => r.path)
    assert.ok(routes.includes('/ws/chat/*'), `ws 通配展平（实际 ${JSON.stringify(routes)}）`)
  })

  test('mount 全局中间件顺序——app-global 先于 sub-global（P4）', async () => {
    const order: string[] = []
    const mk = (n: string) => async (_: Request, __: any, next: any) => { order.push(n); return next(_, __) }
    const sub = new Router(); sub.use(mk('sub')); sub.get('/x', ok('ok'))
    const app = new Router(); app.use(mk('app')); app.mount('/m', sub)
    await (app.handler() as any)(new Request('http://x/m/x'), { params: {}, query: {} })
    assert.deepEqual(order, ['app', 'sub'])
  })
})

// ── A3: Trie 匹配对账 fuzz ─────────────────────────────────────

/** 线性扫描参考模型——胜者规则（探针实证语义） */
function referenceMatch(
  patterns: Array<{ path: string; id: number }>, reqSegs: string[],
): { id: number; params: Record<string, string>; wildcard: boolean } | null {
  // 精确集合：段数等 + 逐段（静态相等 or :param）
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
    // 生成器保证唯一 specificity（staticCount 平局时注册序首条—— Trie 逐段
    // 贪心的近似——见 describe 头注释③；模型取 staticCount 最大）
    if (!best || staticCount > best.staticCount) best = { id: p.id, params, staticCount }
  }
  if (best) {
    // 精确命中节点有通配槽（同前缀 path + '/*' 也注册）→ '*': ''（精确优先标记——trieMatch 语义）
    const hasWf = patterns.some((p) => p.path === patterns[best!.id].path + '/*')
    return { id: best.id, params: hasWf ? { ...best.params, '*': '' } : best.params, wildcard: false }
  }
  // 通配集合：前缀深度（pattern 去掉尾 * 后的段数）——**浅优先**（探针②）
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

/** 生成器：随机 pattern 集（静态/param 池 + 尾通配——param 名带 depth 防冲突） */
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
    // **生成器约束**：同 specificity 竞争对（同段数同静态位置元组）去重——
    // 模型 staticCount 规则的适用域（describe 头注释）
    if (!used.has(path)) { used.add(path); out.push({ path, id: id++ }) }
  }
  return out
}

describe('A3: Trie 匹配对账 fuzz（参考模型终态等价）', () => {
  test('随机路由树 × 随机请求——value/params/wildcard 全等（多种子）', () => {
    for (const seed of [11, 42, 99, 2026, 555, 7, 31337, 8888]) {
      let a = seed
      const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
      const patterns = genPatterns(rnd)
      // Trie 注册（value = pattern 字符串——可辨识）
      const trie = createTrie<{ id: number }>()
      for (const p of patterns) trieRegister(trie, p.path, { id: p.id }, p.path.includes('*'))
      // 随机请求 × 200
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
        assert.equal(got.wildcard, want.wildcard, `wildcard 标志`)
        if (!got.wildcard) {
          // param 键集全等（Trie decodeURIComponent——生成器段无编码——直等）
          assert.deepEqual(got.params, want.params, `seed=${seed} i=${i} req=${reqSegs.join('/')} id=${got.value.id} params Trie=${JSON.stringify(got.params)} 模型=${JSON.stringify(want.params)}`)
        }
      }
    }
  })

  test('语义锚点：浅通配优先 / param>通配 / 静态首段贪心（探针固化）', () => {
    // ② /* vs /a/* 对 /a/b——浅通配胜
    const t1 = createTrie<{ id: number }>()
    trieRegister(t1, '/*', { id: 1 }, true)
    trieRegister(t1, '/a/*', { id: 2 }, true)
    assert.equal(trieMatch(t1, ['a', 'b'])!.value.id, 1, '浅通配优先')
    // ① param 精确 > 通配
    const t2 = createTrie<{ id: number }>()
    trieRegister(t2, '/:p/x', { id: 1 })
    trieRegister(t2, '/*', { id: 2 }, true)
    const m2 = trieMatch(t2, ['v', 'x'])!
    assert.equal(m2.value.id, 1)
    assert.deepEqual(m2.params, { p: 'v' })
    // ③ /a/:b vs /:a/b 对 /a/b——静态首段贪心
    const t3 = createTrie<{ id: number }>()
    trieRegister(t3, '/:a/b', { id: 1 })
    trieRegister(t3, '/a/:b', { id: 2 })
    assert.equal(trieMatch(t3, ['a', 'b'])!.value.id, 2, '静态首段优先')
  })
})
// ── B 波次：meta 检查 + 405/HEAD/all 语义 ───────────────────────

const mwWith = (meta: { injects: string[]; depends: string[] }) => {
  const f = async (_: Request, __: any, next: any) => next(_, __)
  ;(f as any).__meta = meta
  return f
}

describe('B1: middleware meta 检查（全分支——探针实证）', () => {
  test('depends 未注册抛错（含定位 + 注册引导文案）', () => {
    try {
      new Router().use(mwWith({ injects: [], depends: ['db'] }))
      assert.fail('应抛错')
    } catch (e: any) {
      assert.match(e.message, /depends on ctx\.db/)
      assert.match(e.message, /app\.use\(db\(\)\)/)
    }
  })

  test('injects 先登记后依赖——通过（注册顺序语义）', () => {
    assert.doesNotThrow(() => new Router()
      .use(mwWith({ injects: ['db'], depends: [] }))
      .use(mwWith({ injects: [], depends: ['db'] })))
  })

  test('顺序反（depends 在 injects 前）——抛错', () => {
    assert.throws(() => new Router()
      .use(mwWith({ injects: [], depends: ['db'] }))
      .use(mwWith({ injects: ['db'], depends: [] })), /depends on ctx\.db/)
  })

  test('object middleware 形态（{ middleware() } 工厂）——meta 透传检查', () => {
    const obj = { middleware() { return async (_: Request, __: any, next: any) => next(_, __) } } as any
    obj.__meta = { injects: [], depends: ['missing'] }
    assert.throws(() => new Router().use(obj), /depends on ctx\.missing/)
  })

  test('route 级中间件 meta 同样检查（B1 修复——机制一致性）', () => {
    assert.throws(() => new Router().get('/x', mwWith({ injects: [], depends: ['db'] }), ok('ok')),
      /depends on ctx\.db/, 'route 级 depends 未注册应抛错（修复前静默跳过）')
    // 通过面：先注册 provider 中间件再注册依赖方
    assert.doesNotThrow(() => new Router()
      .use(mwWith({ injects: ['db'], depends: [] }))
      .get('/x', mwWith({ injects: [], depends: ['db'] }), ok('ok')))
  })
})

describe('B2: 405 / HEAD / all 语义（探针固化）', () => {
  test('405 Allow 头多方法完备（Map 插入序——注册序稳定）', async () => {
    const app = new Router()
    app.get('/x', ok('g')); app.post('/x', ok('p')); app.put('/x', ok('pu'))
    const r = await (app.handler() as any)(new Request('http://x/x', { method: 'DELETE' }), { params: {}, query: {} })
    assert.equal(r.status, 405)
    assert.equal(r.headers.get('allow'), 'GET, POST, PUT')
  })

  test('通配注册错 method → 404（通配不产生 405——现状锁死）', async () => {
    const app = new Router()
    app.get('/api/*', ok('wf'))
    const r = await (app.handler() as any)(new Request('http://x/api/a', { method: 'DELETE' }), { params: {}, query: {} })
    assert.equal(r.status, 404)
  })

  test('HEAD → GET fallback 携带 GET 的 route 中间件（B2 修复——mw 联动）', async () => {
    const log: string[] = []
    const app = new Router()
    app.get('/x', async (_: Request, ctx: any, next: any) => { log.push('mw'); return next(_, ctx) }, ok('body'))
    const r = await (app.handler() as any)(new Request('http://x/x', { method: 'HEAD' }), { params: {}, query: {} })
    assert.equal(r.status, 200)
    assert.deepEqual(log, ['mw'], 'GET route mw 对 HEAD 请求生效（修复前静默丢失——鉴权类 mw 失效）')
  })

  test('all() 匹配任意 method（PATCH 实证）', async () => {
    const app = new Router()
    app.all('/any', ok('all'))
    const r = await (app.handler() as any)(new Request('http://x/any', { method: 'PATCH' }), { params: {}, query: {} })
    assert.equal(await r.text(), 'all')
  })

  test("get('*') 单段通配路径（根通配——catch-all）", async () => {
    const app = new Router()
    app.get('*', ok('star'))
    const r = await (app.handler() as any)(new Request('http://x/whatever/deep'), { params: {}, query: {} })
    assert.equal(await r.text(), 'star')
  })

  test('405 不经过 onError（onError 管 handler 异常——405 是直接响应）', async () => {
    const app = new Router()
    app.get('/x', ok('g'))
    app.onError(() => new Response('onError', { status: 599 }))
    const r = await (app.handler() as any)(new Request('http://x/x', { method: 'DELETE' }), { params: {}, query: {} })
    assert.equal(r.status, 405, '405 语义（非 599）')
  })
})
// ── C 波次：错误路径语义（自愈不可消音） ────────────────────────

import { errorSnapshot, resetErrorCounter, clearHandlerError } from './error-counter.ts'

describe('C1: handler 错误去重计数（error-counter 移植）', () => {
  test('同路由错误风暴去重——100 次同错 1 条日志（C1 探针实证修复）', async () => {
    resetErrorCounter()
    let errs = 0
    const orig = console.error
    console.error = (..._: any[]) => { errs++ }
    try {
      const app = new Router()
      app.get('/boom', () => { throw new Error('storm') })
      const h = app.handler() as any
      for (let i = 0; i < 100; i++) await h(new Request('http://x/boom'), { params: {}, query: {} })
    } finally { console.error = orig }
    assert.equal(errs, 1, `去重后日志 1 条（实际 ${errs}——修复前 100 条风暴）`)
    const snap = errorSnapshot()
    assert.equal(snap.byRoute['GET /boom'], 100, '计数完整（去重不丢计数）')
  })

  test('恢复清出——错误后正常请求 → 再错再报（错误状态变化可观测）', async () => {
    resetErrorCounter()
    let boom = true
    const app = new Router()
    app.get('/flap', () => { if (boom) throw new Error('x'); return new Response('ok') })
    const h = app.handler() as any
    await h(new Request('http://x/flap'), { params: {}, query: {} })  // 错 1（报）
    await h(new Request('http://x/flap'), { params: {}, query: {} })  // 错 2（去重）
    boom = false
    await h(new Request('http://x/flap'), { params: {}, query: {} })  // 成功（清出）
    assert.equal(errorSnapshot().byRoute['GET /flap'], undefined, '恢复清出')
    boom = true
    let errs = 0
    const orig = console.error
    console.error = () => { errs++ }
    try { await h(new Request('http://x/flap'), { params: {}, query: {} }) } finally { console.error = orig }
    assert.equal(errs, 1, '再错再报（清出后重新现形）')
  })

  test('total 累计 + resetErrorCounter 测试复位', async () => {
    resetErrorCounter()
    const app = new Router()
    app.get('/e1', () => { throw new Error('a') })
    const h = app.handler() as any
    await h(new Request('http://x/e1'), { params: {}, query: {} })
    assert.ok(errorSnapshot().total >= 1)
    resetErrorCounter()
    assert.equal(errorSnapshot().total, 0)
  })

  test('clearHandlerError 显式清出 API（单路由粒度）', async () => {
    resetErrorCounter()
    const app = new Router()
    app.get('/c', () => { throw new Error('c') })
    await (app.handler() as any)(new Request('http://x/c'), { params: {}, query: {} })
    clearHandlerError('GET /c')
    assert.equal(errorSnapshot().byRoute['GET /c'], undefined)
    resetErrorCounter()
  })
})

describe('C2: close/生命周期语义', () => {
  test('closeables 顺序执行 + 单个失败不阻断（探针固化）', async () => {
    const order: string[] = []
    const app = new Router()
    app.onClose({ close: async () => { order.push('c1') } })
    app.onClose({ close: async () => { order.push('c2'); throw new Error('fail') } })
    app.onClose({ close: async () => { order.push('c3') } })
    await app.close()
    assert.deepEqual(order, ['c1', 'c2', 'c3'])
  })

  test('重复 close 幂等（C2 修复——终态操作第二次 no-op）', async () => {
    const order: string[] = []
    const app = new Router()
    app.onClose({ close: async () => { order.push('run') } })
    await app.close()
    await app.close()
    assert.deepEqual(order, ['run'], '重复 close 只执行一次（修复前重复执行）')
  })
})

describe('C3: 输入防御', () => {
  test('param 非法编码 %zz → 400（C3 修复——URIError 裸抛实锤）', async () => {
    const app = new Router()
    app.get('/u/:id', (_: Request, ctx: any) => new Response('id=' + ctx.params.id))
    const r = await (app.handler() as any)(new Request('http://x/u/%zz'), { params: {}, query: {} })
    assert.equal(r.status, 400, '非法编码 = 客户端错误（修复前 URIError 裸抛）')
    const body = await r.json() as any
    assert.equal(body.reason, 'malformed percent-encoding')
  })

  test('正常编码解码 + 多重编码保留（decode 语义锁）', async () => {
    const app = new Router()
    app.get('/u/:id', (_: Request, ctx: any) => new Response('id=' + ctx.params.id))
    const h = app.handler() as any
    const r1 = await h(new Request('http://x/u/a%2Fb'), { params: {}, query: {} })
    assert.equal(await r1.text(), 'id=a/b', '%2F 解码为 /')
    const r2 = await h(new Request('http://x/u/a%252Fb'), { params: {}, query: {} })
    assert.equal(await r2.text(), 'id=a%2Fb', '多重编码单次解码（%25 → %）')
  })
})
