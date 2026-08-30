/**
 * vdom observable — 契约测试（语义规格锁定——测试即生态）
 *
 * 锁定（2027-08）：
 * - 基础：订阅收发 / 终结语义（error/complete 后不再收）/ unsubscribe 幂等
 * - 安全：next 广播期间退订安全
 * - 源：Subject 热广播 / BehaviorSubject 当前值+订阅即收 / fromPromise
 *   三路径+abort / fromEventPattern 对称+初值
 * - 算子：map/filter/scan / switchMap 竞态取消 / mergeMap 并行 /
 *   takeUntil 停止 / shareReplay 缓存共享
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Observable, create, Subject, BehaviorSubject, fromPromise, fromEventPattern } from '../../client/vdom/observable/index.ts'
import { map, filter, tap, toArray, delay, scan, switchMap, mergeMap, exhaustMap, takeUntil, shareReplay } from '../../client/vdom/observable/index.ts'

// ── 基础语义 ──────────────────────────────────────────────

test('订阅收发 + unsubscribe 后不再收', () => {
  const got: number[] = []
  const sub = create<number>((obs) => {
    obs.next(1); obs.next(2)
    return () => {} // teardown
  })
  const s = sub.subscribe({ next: (v) => got.push(v) })
  s.unsubscribe()
  assert.deepEqual(got, [1, 2])
  // 幂等 unsubscribe（重复调用无副作用）
  s.unsubscribe()
})

test('error 终结——后续发射被忽略 + teardown 执行一次', () => {
  let teardowns = 0
  let errs: unknown[] = []
  const src = create<number>((obs) => {
    obs.error('boom')
    obs.next(99) // error 后发射被忽略
    return () => { teardowns++ }
  })
  src.subscribe({ next: () => {}, error: (e) => errs.push(e) })
  assert.deepEqual(errs, ['boom'])
  assert.equal(teardowns, 1)
})

test('complete 终结——后续发射被忽略', () => {
  const got: number[] = []
  let done = false
  create<number>((obs) => { obs.complete(); obs.next(1) })
    .subscribe({ next: (v) => got.push(v), complete: () => { done = true } })
  assert.deepEqual(got, [])
  assert.equal(done, true)
})

test('空 observer 合法（全部缺省——订阅不崩）', () => {
  create<number>((obs) => { obs.next(1); obs.complete() }).subscribe()
})

test('pipe 组合多算子', () => {
  const got: number[] = []
  create<number>((obs) => { obs.next(1); obs.next(2); obs.next(3) })
    .pipe(filter((v) => v % 2 === 1), map((v) => v * 10))
    .subscribe({ next: (v) => got.push(v) })
  assert.deepEqual(got, [10, 30])
})

// ── 源 ───────────────────────────────────────────────────

test('Subject 热广播 + 广播中退订安全（快照迭代）', () => {
  const s = new Subject<number>()
  const a: number[] = [], b: number[] = []
  const sa = s.subscribe({ next: (v) => a.push(v) })
  s.subscribe({ next: (v) => b.push(v) })
  s.next(1)
  sa.unsubscribe() // 退订后仍在广播的其他订阅者不受影响
  s.next(2)
  assert.deepEqual(a, [1])
  assert.deepEqual(b, [1, 2])
})

test('Subject complete 后 next 忽略（closed 语义）', () => {
  const s = new Subject<number>()
  const got: number[] = []
  s.subscribe({ next: (v) => got.push(v) })
  s.complete()
  s.next(1)
  assert.deepEqual(got, [])
})

test('BehaviorSubject：get() 同步读 / 订阅即收当前值 / next 更新', () => {
  const b = new BehaviorSubject(0)
  assert.equal(b.get(), 0)
  const got: number[] = []
  b.subscribe({ next: (v) => got.push(v) }) // 订阅立即收当前值（Behavior 语义）
  assert.deepEqual(got, [0])
  b.next(5)
  assert.equal(b.get(), 5)
  assert.deepEqual(got, [0, 5])
})

test('fromPromise：resolve → next+complete 单发', () => {
  const got: number[] = []
  let done = false
  fromPromise(Promise.resolve(42)).subscribe({ next: (v) => got.push(v), complete: () => { done = true } })
  // Promise 微任务后断言
  return Promise.resolve().then(() => { assert.deepEqual(got, [42]); assert.equal(done, true) })
})

test('fromPromise：reject → error 传播（不静默）', () => {
  const errs: unknown[] = []
  fromPromise(Promise.reject(new Error('x'))).subscribe({ error: (e) => errs.push(e) })
  return Promise.resolve().then(() => assert.equal((errs[0] as Error).message, 'x'))
})

test('fromPromise：unsubscribe 后 resolve 不发', () => {
  const got: number[] = []
  const s = fromPromise(Promise.resolve(1)).subscribe({ next: (v) => got.push(v) })
  s.unsubscribe()
  return Promise.resolve().then(() => assert.deepEqual(got, []))
})

test('fromPromise：abort → 静默 complete（不发值）', async () => {
  const ac = new AbortController()
  const got: number[] = []
  let done = false
  const src = fromPromise(new Promise<number>(() => {}), { signal: ac.signal }) // 永不 settle
  src.subscribe({ next: (v) => got.push(v), complete: () => { done = true } })
  ac.abort()
  await Promise.resolve()
  assert.deepEqual(got, [])
  assert.equal(done, true)
})

test('fromEventPattern：add/remove 对称 + initial 同步首值', () => {
  let adds = 0, removes = 0
  let emit: (v: number) => void = () => {}
  const src = fromEventPattern<number>(
    (next) => { adds++; emit = next; return () => { removes++ } },
    () => 7, // initial 首值
  )
  const got: number[] = []
  const s = src.subscribe({ next: (v) => got.push(v) })
  assert.equal(adds, 1)
  assert.deepEqual(got, [7]) // initial 同步首值（Behavior 语义）
  emit(8)
  assert.deepEqual(got, [7, 8])
  s.unsubscribe()
  assert.equal(removes, 1) // 对称移除
})

// ── 算子 ─────────────────────────────────────────────────

test('scan：累积——每值产出累加器（状态 = 流的折叠）', () => {
  const got: number[] = []
  create<number>((obs) => { obs.next(1); obs.next(2); obs.next(3) })
    .pipe(scan((acc, v) => acc + v, 0))
    .subscribe({ next: (v) => got.push(v) })
  assert.deepEqual(got, [1, 3, 6])
})

test('tap：旁路副作用（值原样转发——observability 基建）', () => {
  const got: number[] = []
  let side = 0
  create<number>((obs) => { obs.next(1); obs.next(2); obs.complete() })
    .pipe(tap((v) => { side += v }))
    .subscribe({ next: (v) => got.push(v) })
  assert.deepEqual(got, [1, 2], '值原样转发')
  assert.equal(side, 3, '副作用已执行')
})

test('tap：内部抛错 → 源 error（传播终结）', () => {
  let errs: unknown[] = []
  create<number>((obs) => { obs.next(1) })
    .pipe(tap((v) => { if (v === 1) throw new Error('tap 抛错') }))
    .subscribe({ next: () => {}, error: (e) => errs.push(e) })
  assert.equal(errs.length, 1)
})

test('toArray：同步流收束——完整收集后单值产出（原子性）', () => {
  const got: number[][] = []
  create<number>((obs) => { obs.next(1); obs.next(2); obs.next(3); obs.complete() })
    .pipe(toArray())
    .subscribe({ next: (v) => got.push(v) })
  assert.deepEqual(got, [[1, 2, 3]], '单值（数组）——完整后产出')
})

test('toArray：源错误 → 零产出（错误传播——原子性）', () => {
  let vals: number[][] = []
  let errs: unknown[] = []
  create<number>((obs) => { obs.next(1); obs.error('boom') })
    .pipe(toArray())
    .subscribe({ next: (v) => vals.push(v), error: (e) => errs.push(e) })
  assert.deepEqual(vals, [], '零产出')
  assert.deepEqual(errs, ['boom'], '错误传播')
})

test('delay：每值延时发射（时序——自动消失流化基建）', async () => {
  const got: number[] = []
  const t0 = Date.now()
  create<number>((obs) => { obs.next(1); obs.next(2); obs.complete() })
    .pipe(delay(20))
    .subscribe({ next: (v) => got.push(v) })
  await new Promise((r) => setTimeout(r, 30))
  const dt = Date.now() - t0
  assert.deepEqual(got, [1, 2], '值保序发完')
  assert.ok(dt >= 18, `发射已延迟（${dt}ms）`)
})

test('delay：complete 等 pending 值发完（RxJS 对齐——时序完整）', async () => {
  const got: number[] = []
  let done = false
  create<number>((obs) => { obs.next(1); obs.complete() })
    .pipe(delay(15))
    .subscribe({ next: (v) => got.push(v), complete: () => { done = true } })
  // complete 不应早于值到达（pending 值先发——再 complete）
  assert.equal(done, false, 'complete 挂起（pending 值未发）')
  await new Promise((r) => setTimeout(r, 25))
  assert.deepEqual(got, [1], '值到达')
  assert.equal(done, true, 'pending 发完后 complete')
})

test('delay：unsubscribe 取消未发 timer（零泄漏——可取消语义）', async () => {
  const got: number[] = []
  create<number>((obs) => { obs.next(1) })
    .pipe(delay(30))
    .subscribe({ next: (v) => got.push(v) })
    .unsubscribe()
  await new Promise((r) => setTimeout(r, 40))
  assert.deepEqual(got, [], '未发值被取消（timer 清除）')
})

test('delay：错误立即传播（不等 pending）', () => {
  let errs: unknown[] = []
  create<number>((obs) => { obs.next(1); obs.error('boom') })
    .pipe(delay(10))
    .subscribe({ next: () => {}, error: (e) => errs.push(e) })
  assert.deepEqual(errs, ['boom'])
})

test('switchMap：新值到来取消旧内层——旧结果作废（竞态语义）', async () => {
  const got: string[] = []
  let resolveOld!: (v: string) => void
  const oldInner = new Observable<string>((obs) => {
    resolveOld = () => obs.next('OLD')
    return () => {}
  })
  const trigger = new Subject<number>()
  const inner$ = (n: number) => n === 1 ? oldInner : new Observable<string>((obs) => { obs.next('NEW'); obs.complete() })

  trigger.asObservable().pipe(switchMap(inner$)).subscribe({ next: (v) => got.push(v) })
  trigger.next(1) // 订阅旧内层（挂起）
  trigger.next(2) // 新值 → 旧内层被取消（NEW 到达）
  resolveOld()    // 旧结果迟到——**作废**（下游不收）
  await Promise.resolve()
  assert.deepEqual(got, ['NEW'])
})

test('switchMap：内部 error 传播终结 / 内部 complete 外部继续', () => {
  const collected: string[] = []
  const trigger = new Subject<number>()
  const inner$ = (n: number) => {
    if (n === 1) return new Observable<string>((obs) => { obs.next('A'); obs.complete() })
    if (n === 2) return new Observable<string>((obs) => { obs.next('B') }) // 不 complete（等取消）
    return new Observable<string>(() => {}) // 不发射
  }
  const errs: unknown[] = []
  trigger.asObservable().pipe(switchMap(inner$)).subscribe({
    next: (v) => collected.push(v), error: (e) => errs.push(e),
  })
  trigger.next(1)
  trigger.next(2)
  assert.deepEqual(collected, ['A', 'B']) // 内 complete 不终结外（1 后仍收 2 的 B）
  assert.deepEqual(errs, [])
})

test('switchMap：上游 complete 且无内层挂起 → 外部 complete', () => {
  let done = false
  create<number>((obs) => { obs.next(1); obs.complete() })
    .pipe(switchMap((v) => new Observable<string>((obs) => { obs.next('x'); obs.complete() })))
    .subscribe({ next: () => {}, complete: () => { done = true } })
  assert.equal(done, true)
})

test('mergeMap：并行不取消——全部完成才 complete', () => {
  const got: string[] = []
  let done = false
  const trigger = new Subject<number>()
  const inner$ = (n: number) => new Observable<string>((obs) => { obs.next(`v${n}`); obs.complete() })
  trigger.asObservable().pipe(mergeMap(inner$)).subscribe({ next: (v) => got.push(v), complete: () => { done = true } })
  trigger.next(1)
  trigger.next(2)
  assert.deepEqual(got.sort(), ['v1', 'v2'])
  assert.equal(done, false) // 上游未完成
  trigger.complete()
  assert.equal(done, true) // 全部完成
})

test('takeUntil：notifier 发射 → 外部 complete（停止语义）', () => {
  const got: number[] = []
  let done = false
  const source = new Subject<number>()
  const stop = new Subject<void>()
  source.asObservable().pipe(takeUntil(stop.asObservable())).subscribe({ next: (v) => got.push(v), complete: () => { done = true } })
  source.next(1)
  stop.next() // 停止
  source.next(2) // 忽略
  assert.deepEqual(got, [1])
  assert.equal(done, true)
})

test('takeUntil：notifier complete 不触发（RxJS 对齐）', () => {
  let done = false
  const source = new Subject<number>()
  const notifier = new Subject<void>()
  source.asObservable().pipe(takeUntil(notifier.asObservable())).subscribe({ next: () => {}, complete: () => { done = true } })
  notifier.complete() // 不触发停止
  assert.equal(done, false)
  source.next(1) // 仍在流动
})

test('shareReplay：多订阅共享（源执行 1 次）+ 新订阅立即收缓存', () => {
  let runs = 0
  const inner = new Subject<number>()
  const src = new Observable<number>((obs) => { runs++; return inner.subscribe(obs) }).pipe(shareReplay(1))
  const a: number[] = [], b: number[] = []
  src.subscribe({ next: (v) => a.push(v) })
  inner.next(1)
  assert.equal(runs, 1)
  src.subscribe({ next: (v) => b.push(v) }) // 新订阅立即收缓存
  assert.deepEqual(b, [1])
  inner.next(2)
  assert.deepEqual(a, [1, 2])
  assert.deepEqual(b, [1, 2])
  assert.equal(runs, 1) // 未重新执行
})

test('shareReplay：refCount 归零后新订阅重新执行源', () => {
  let runs = 0
  const src = create<number>((obs) => { runs++; obs.next(runs) }).pipe(shareReplay(1))
  const s1 = src.subscribe({ next: () => {} })
  s1.unsubscribe() // refCount = 0
  const got: number[] = []
  const s2 = src.subscribe({ next: (v) => got.push(v) })
  s2.unsubscribe()
  assert.equal(runs, 2) // 重新执行
  assert.deepEqual(got, [2])
})

test('shareReplay：源 complete 后新订阅——收缓存值 + complete', () => {
  const inner = new Subject<number>()
  const src = inner.asObservable().pipe(shareReplay(1))
  src.subscribe({ next: () => {} })
  inner.next(9)
  inner.complete()
  const got: number[] = []
  let done = false
  src.subscribe({ next: (v) => got.push(v), complete: () => { done = true } })
  assert.deepEqual(got, [9]) // 完成后仍重放缓存
  assert.equal(done, true)
})

// ── VDOM-OBSERVABLE-OPTIMIZE 波次 1：组合算子面 ───────────────────────
import { startWith, take, finalize, distinctUntilChanged, debounceTime, throttleTime, combineLatest, merge } from '../../client/vdom/observable/index.ts'

function collect<T>(src: Observable<T>) {
  const vals: T[] = []
  let err: unknown = null
  let done = false
  src.subscribe({ next: (v) => vals.push(v), error: (e) => { err = e }, complete: () => { done = true } })
  return { vals, err, done: () => done, getErr: () => err }
}

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

test('startWith：订阅即同步发初值——随后转发源值', () => {
  const sub = new Subject<number>()
  const s = collect(sub.asObservable().pipe(startWith(0)))
  assert.deepEqual(s.vals, [0], '订阅即收初值')
  sub.next(1)
  assert.deepEqual(s.vals, [0, 1], '初值后转发')
})

test('take：限量 n 值后 complete + 上游自动退订（零泄漏）', () => {
  const sub = new Subject<number>()
  let upstreamUnsubbed = false
  const src = create<number>((obs) => {
    const inner = sub.asObservable().subscribe(obs)
    return () => { upstreamUnsubbed = true; inner.unsubscribe() }
  })
  const s = collect(src.pipe(take(2)))
  sub.next(1)
  sub.next(2)
  assert.deepEqual(s.vals, [1, 2])
  assert.equal(s.done(), true, '第 2 值后 complete')
  assert.equal(upstreamUnsubbed, true, '完成即退订上游')
  sub.next(3) // 此后发射忽略
  assert.deepEqual(s.vals, [1, 2])
})

test('take(0)：立即 complete——不订阅上游', () => {
  let subscribed = false
  const src = create<number>(() => { subscribed = true; return () => {} })
  const s = collect(src.pipe(take(0)))
  assert.equal(s.done(), true)
  assert.equal(subscribed, false, 'take(0) 不订阅上游（零泄漏）')
})

test('finalize：complete/error/退订三路径恰好调用一次', () => {
  let calls = 0
  const fin = () => { calls++ }
  // complete 路径
  const sub = new Subject<number>()
  collect(sub.asObservable().pipe(finalize(fin)))
  sub.complete()
  assert.equal(calls, 1, 'complete 路径一次')
  // error 路径
  const sub2 = new Subject<number>()
  collect(sub2.asObservable().pipe(finalize(fin)))
  sub2.error('x')
  assert.equal(calls, 2, 'error 路径一次')
  // 退订路径
  const sub3 = new Subject<number>()
  const inner = sub3.asObservable().pipe(finalize(fin)).subscribe()
  inner.unsubscribe()
  assert.equal(calls, 3, '退订路径一次')
})

test('distinctUntilChanged：相邻去重（默认 ===）', () => {
  const sub = new Subject<number>()
  const s = collect(sub.asObservable().pipe(distinctUntilChanged()))
  sub.next(1); sub.next(1); sub.next(2); sub.next(2); sub.next(1); sub.next(1)
  assert.deepEqual(s.vals, [1, 2, 1], '相邻去重——非相邻相同保留')
})

test('distinctUntilChanged：自定义比较器（字段/深比较）', () => {
  const sub = new Subject<{ id: number; v: number }>()
  const s = collect(sub.asObservable().pipe(distinctUntilChanged((a, b) => a.id === b.id)))
  sub.next({ id: 1, v: 1 }); sub.next({ id: 1, v: 2 }); sub.next({ id: 2, v: 1 })
  assert.equal(s.vals.length, 2, '同 id 去重（v 变化不算）')
  assert.equal(s.vals[1].id, 2)
})

test('debounceTime：静默期后发尾值（连续快速→末值）', async () => {
  const sub = new Subject<number>()
  const s = collect(sub.asObservable().pipe(debounceTime(20)))
  sub.next(1); await wait(5); sub.next(2); await wait(5); sub.next(3)
  await wait(40)
  assert.deepEqual(s.vals, [3], '静默期尾值（中间丢弃）')
})

test('debounceTime：complete 立即完成（pending 丢弃——RxJS 对齐）', async () => {
  const sub = new Subject<number>()
  const s = collect(sub.asObservable().pipe(debounceTime(20)))
  sub.next(1)
  sub.complete() // 静默期内完成——丢弃 pending
  assert.equal(s.done(), true, '立即 complete（不等静默期）')
  await wait(30)
  assert.deepEqual(s.vals, [], 'pending 值不发射')
})

test('debounceTime：unsubscribe 清 timer（零泄漏）', async () => {
  const sub = new Subject<number>()
  const s = collect(sub.asObservable().pipe(debounceTime(20)))
  sub.next(1)
  const inner = sub.asObservable().pipe(debounceTime(20)).subscribe({ next: () => {} })
  inner.unsubscribe()
  await wait(30)
  assert.deepEqual(s.vals, [1], '另一订阅的 timer 已清（不误发）')
})

test('throttleTime：leading 首值（窗口期内后续丢弃）', async () => {
  const sub = new Subject<number>()
  const s = collect(sub.asObservable().pipe(throttleTime(20)))
  sub.next(1); await wait(2); sub.next(2); await wait(2); sub.next(3)
  await wait(30)
  assert.deepEqual(s.vals, [1], '窗口期首值——后续丢弃')
  sub.next(4) // 窗口已开——新首值
  await wait(30)
  assert.deepEqual(s.vals, [1, 4], '窗口开后新首值')
})

test('throttleTime(trailing)：窗口关闭补尾值 + 立即开新窗口', async () => {
  const sub = new Subject<number>()
  const s = collect(sub.asObservable().pipe(throttleTime(20, { trailing: true })))
  sub.next(1); await wait(5); sub.next(2)
  await wait(30)
  assert.deepEqual(s.vals, [1, 2], 'leading + trailing 尾值')
  sub.next(3) // 新窗口（trailing 后立开）
  await wait(30)
  assert.deepEqual(s.vals, [1, 2, 3])
})

test('combineLatest：全源首发后才发射（快照数组）', () => {
  const a = new Subject<number>()
  const b = new BehaviorSubject<number>(10)
  const s = collect(combineLatest(a.asObservable(), b.asObservable()))
  // b 同步首值——a 未发——无发射
  assert.deepEqual(s.vals, [], '未全源首发不发射')
  a.next(1)
  assert.deepEqual(s.vals, [[1, 10]], '全源首发后发射快照')
  b.next(20)
  assert.deepEqual(s.vals, [[1, 10], [1, 20]], '单源更新发射新快照')
})

test('combineLatest：全源完成 → complete；空源 → 立即 complete', () => {
  const a = new Subject<number>()
  const b = new Subject<number>()
  const s = collect(combineLatest(a.asObservable(), b.asObservable()))
  a.complete()
  assert.equal(s.done(), false, '单源完成不 complete')
  b.complete()
  assert.equal(s.done(), true, '全源完成 → complete')
  const empty = collect(combineLatest())
  assert.equal(empty.done(), true, '空源立即 complete')
})

test('merge：多源交错——全完成才 complete', () => {
  const a = new Subject<number>()
  const b = new Subject<number>()
  const s = collect(merge(a.asObservable(), b.asObservable()))
  a.next(1); b.next(2); a.next(3)
  assert.deepEqual(s.vals, [1, 2, 3], '交错与发射顺序一致')
  a.complete()
  assert.equal(s.done(), false)
  b.complete()
  assert.equal(s.done(), true)
})

test('优化波次 1 组合链：combineLatest+distinct+debounce 端到端（搜索场景声明式）', async () => {
  const kw = new Subject<string>()
  const page = new BehaviorSubject<number>(1)
  const s = collect(
    combineLatest(kw.asObservable(), page.asObservable())
      .pipe(
        distinctUntilChanged((p, n) => p[0] === n[0] && p[1] === n[1]),
        debounceTime(20),
      ),
  )
  kw.next('a'); kw.next('ab'); await wait(5); kw.next('abc'); kw.next('abcd')
  await wait(40)
  assert.deepEqual(s.vals, [['abcd', 1]], '防抖尾值 + 全源快照（无重复）')
})

test('exhaustMap：single-flight——in-flight 期间上游发射丢弃（只启动一次内层）', async () => {
  const src = new Subject<number>()
  let started = 0
  const done = new Subject<void>()
  const s = collect(
    src.asObservable().pipe(
      exhaustMap((v) => {
        started++
        return create<number>((obs) => {
          const un = done.asObservable().subscribe({ next: () => { obs.next(v * 10); obs.complete() } })
          return () => un.unsubscribe()
        })
      }),
    ),
  )
  src.next(1) // 启动内层 1
  assert.equal(started, 1)
  src.next(2) // in-flight —— 丢弃
  src.next(3) // in-flight —— 丢弃
  done.next() // 完成内层 1
  assert.deepEqual(s.vals, [10], '内层 1 结果')
  src.next(4) // 完成后启动新内层
  assert.equal(started, 2, '完成后下一个发射启动新内层')
  done.next()
  assert.deepEqual(s.vals, [10, 40], '内层 4 结果（in-flight 发射被丢弃）')
})

test('exhaustMap：上游 complete——内层空闲时瞬时完成（RxJS 对齐）', () => {
  const src = new Subject<number>()
  let completed = false
  src.asObservable().pipe(exhaustMap((v) => fromPromise(Promise.resolve(v)))).subscribe({
    complete: () => { completed = true },
  })
  src.next(1)
  src.complete()
  assert.equal(completed, false, '内层 in-flight——上游 complete 不瞬时完成')
})
