/**
 * vdom observable — 算子（语义规格见 types.ts——每算子契约测试锁定）
 *
 * 裁剪边界（2027-08——场景驱动——加算子需场景证据）：
 * - 只有 7 个：map/filter/scan/switchMap/mergeMap/takeUntil/shareReplay(1)
 * - 显式不做：背压/调度器/timeout/retry/debounce（可后补——场景证据）
 */
import { Observable } from './observable.ts'
import type { OperatorFn } from './observable.ts'

/** 变换 */
export function map<T, R>(fn: (v: T) => R): OperatorFn<T, R> {
  return (source) => new Observable<R>((obs) =>
    source.subscribe({ next: (v) => obs.next(fn(v)), error: (e) => obs.error(e), complete: () => obs.complete() }))
}

/** 过滤（pred 为真才转发） */
export function filter<T>(pred: (v: T) => boolean): OperatorFn<T, T> {
  return (source) => new Observable<T>((obs) =>
    source.subscribe({ next: (v) => { if (pred(v)) obs.next(v) }, error: (e) => obs.error(e), complete: () => obs.complete() }))
}

/** 累积（状态 = 流的折叠——每值产出累加器） */
export function scan<T, R>(fn: (acc: R, v: T) => R, init: R): OperatorFn<T, R> {
  let acc = init
  return (source) => new Observable<R>((obs) =>
    source.subscribe({ next: (v) => { acc = fn(acc, v); obs.next(acc) }, error: (e) => obs.error(e), complete: () => obs.complete() }))
}

/**
 * 竞态取消（核心语义）：上游每值 → 订阅内层——**新值到来取消旧内层**——
 * 旧流的结果作废（switchMap 语义——竞态消灭的根基）
 */
export function switchMap<T, R>(fn: (v: T) => Observable<R>): OperatorFn<T, R> {
  return (source) => new Observable<R>((obs) => {
    let inner: { unsubscribe(): void } | null = null
    let outerDone = false
    const outer = source.subscribe({
      next: (v) => {
        inner?.unsubscribe() // 新值 → 旧取消（旧结果作废）
        // **同步完成时序**：内层在 subscribe 期间同步 complete——回调先于
        // 赋值执行——用标记修正（否则 inner 残留订阅对象——complete 漏判）
        let syncedDone = false
        const sub = fn(v).subscribe({
          next: (r) => obs.next(r),
          error: (e) => obs.error(e), // 内部 error → 传播（终结）
          complete: () => { syncedDone = true; inner = null }, // 内部完成——外部继续
        })
        inner = syncedDone ? null : sub
      },
      error: (e) => obs.error(e),
      complete: () => { outerDone = true; if (!inner) obs.complete() },
    })
    return () => { outer.unsubscribe(); inner?.unsubscribe() }
  })
}

/** 并行合并：不取消内层——全部内层完成且上游完成 → 外部 complete */
export function mergeMap<T, R>(fn: (v: T) => Observable<R>): OperatorFn<T, R> {
  return (source) => new Observable<R>((obs) => {
    let outerDone = false
    let active = 0
    let outer: { unsubscribe(): void } | null = null
    const check = (): void => { if (outerDone && active === 0) obs.complete() }
    outer = source.subscribe({
      next: (v) => {
        active++
        fn(v).subscribe({
          next: (r) => obs.next(r),
          error: (e) => obs.error(e),
          complete: () => { active--; check() },
        })
      },
      error: (e) => obs.error(e),
      complete: () => { outerDone = true; check() },
    })
    return () => { outer?.unsubscribe() }
  })
}

/**
 * 停止信号：notifier **发射**（next）→ 外部 complete——notifier 的
 * complete/error **不触发**（RxJS 对齐）——卸载停止的语义根基
 */
export function takeUntil<T>(notifier: Observable<unknown>): OperatorFn<T, T> {
  return (source) => new Observable<T>((obs) => {
    const outer = source.subscribe({ next: (v) => obs.next(v), error: (e) => obs.error(e), complete: () => obs.complete() })
    const notifierSub = notifier.subscribe({
      next: () => { obs.complete(); notifierSub.unsubscribe(); outer.unsubscribe() },
      error: () => { /* notifier 错误不传播（RxJS 对齐） */ },
      complete: () => { /* notifier 完成不触发（RxJS 对齐） */ },
    })
    return () => { notifierSub.unsubscribe(); outer.unsubscribe() }
  })
}

/**
 * 缓存共享：多订阅共享同一上游（源只执行一次）——缓存最后值——
 * 新订阅立即收缓存——refCount 归零（全退订）后新订阅重新执行源——
 * (useAsyncData 的「层上缓存」是 key 管道——此处纯 operator 语义)
 */
export function shareReplay<T>(bufferSize = 1): OperatorFn<T, T> {
  // **per-operator 状态（多订阅共享——必须在函数体——非 subscribe 回调内）**
  const refs = new Set<{ next(v: T): void; error(e: unknown): void; complete(): void }>()
  let upstream: { unsubscribe(): void } | null = null
  let last: T | undefined
  let hasLast = false
  let done = false

  const start = (source: Observable<T>): void => {
    upstream = source.subscribe({
      next: (v) => { last = v; hasLast = true; for (const r of refs) r.next(v) },
      error: (e) => { done = true; for (const r of refs) r.error(e); refs.clear() },
      complete: () => { done = true; for (const r of refs) r.complete(); refs.clear() },
    })
  }

  return (source) => new Observable<T>((obs) => {
    if (hasLast) obs.next(last as T) // 新订阅立即收缓存
    if (done) { obs.complete(); return () => {} } // 源已终结——重放后 complete
    refs.add(obs)
    if (!upstream) start(source)
    return () => {
      refs.delete(obs)
      // **主动退订（源未终结）→ 清缓存重置**——终结后的自动 teardown
      // refuses（refs 已 clear——误判 refCount 归零——缓存被清）
      if (refs.size === 0 && !done) {
        upstream?.unsubscribe()
        upstream = null
        hasLast = false
        last = undefined
      }
    }
  })
}
