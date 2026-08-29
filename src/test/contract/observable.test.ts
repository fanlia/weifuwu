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
import { map, filter, scan, switchMap, mergeMap, takeUntil, shareReplay } from '../../client/vdom/observable/index.ts'

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
