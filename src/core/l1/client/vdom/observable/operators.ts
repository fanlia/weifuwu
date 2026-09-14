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

/** 旁路副作用（值原样转发——**observability 基建**：sink/度量订阅点——
 *  tap 内抛错 = 源 error（传播终结）） */
export function tap<T>(fn: (v: T) => void): OperatorFn<T, T> {
  return (source) => new Observable<T>((obs) =>
    source.subscribe({ next: (v) => { try { fn(v) } catch (e) { obs.error(e); return } obs.next(v) }, error: (e) => obs.error(e), complete: () => obs.complete() }))
}

/** 收束：同步流 → 数组单值（**完整收集后**才产出——原子性语义——
 *  流生成完成前消费者零应用——错误 → 零产出） */
export function toArray<T>(): OperatorFn<T, T[]> {
  return (source) => new Observable<T[]>((obs) => {
    const acc: T[] = []
    source.subscribe({ next: (v) => acc.push(v), error: (e) => obs.error(e), complete: () => { obs.next(acc); obs.complete() } })
  })
}

/** 延迟（每值延时发射——**取消语义**：unsubscribe 清未发 timer——
 *  complete 等 pending 值发完（RxJS 对齐——时序完整不丢值）；隐式时序
 *  （toast 自动消失）流化基建——场景证据：命令式 API 自动销毁链） */
export function delay<T>(ms: number): OperatorFn<T, T> {
  return (source) => new Observable<T>((obs) => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    let done = false // 源终结（error/complete/pending 标记）
    let pendingComplete = false
    const flushComplete = (): void => {
      if (pendingComplete && timers.size === 0) { done = true; obs.complete() }
    }
    const sub = source.subscribe({
      next: (v) => {
        const t = setTimeout(() => {
          timers.delete(t)
          if (done) return
          obs.next(v)
          flushComplete()
        }, ms)
        timers.add(t)
      },
      error: (e) => { done = true; obs.error(e) },
      complete: () => {
        pendingComplete = true
        flushComplete() // 无 pending 则立即 complete
      },
    })
    return () => {
      done = true
      for (const t of timers) clearTimeout(t)
      timers.clear()
      sub.unsubscribe()
    }
  })
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
 * 单飞合并（single-flight）：内层 in-flight 期间上游发射被**丢弃**（不缓存
 * 不排队）——内层完成后**下一个**上游发射才启动新内层。
 * - W2（api refresh$）：并发 401 → 只执行一次刷新——exhaustMap 内建
 *   single-flight（旋转 token 双刷新竞态歼灭——G13 快照比对的窗口堵死）
 * - 上游 complete：内层空闲时瞬时完成（RxJS 对齐——内层 in-flight 不等待）
 */
export function exhaustMap<T, R>(fn: (v: T) => Observable<R>): OperatorFn<T, R> {
  return (source) => new Observable<R>((obs) => {
    let inner: { unsubscribe(): void } | null = null
    const outer = source.subscribe({
      next: (v) => {
        if (inner) return // in-flight 期间丢弃（single-flight）
        let syncedDone = false
        const sub = fn(v).subscribe({
          next: (r) => obs.next(r),
          error: (e) => obs.error(e),
          complete: () => { syncedDone = true; inner = null },
        })
        inner = syncedDone ? null : sub
      },
      error: (e) => obs.error(e),
      complete: () => { if (!inner) obs.complete() },
    })
    return () => { outer.unsubscribe(); inner?.unsubscribe() }
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

// ── VDOM-OBSERVABLE-OPTIMIZE 波次 1：组合算子面 ──────────────────────
// 场景证据：operators.ts 原裁剪注释「可后补——场景证据」——触发兑现：
// - combineLatest：多源汇流（页面级数据流——token$ + locale$ + 数据源）
// - merge：同类型多源合并（ws 多频道）
// - debounceTime/throttleTime：高频源时间管理（搜索输入/滚动/ws 洪泛）
// - distinctUntilChanged：相邻去重（显式算子——useObservable 内建浅比较
//   的对面——比较器可自定义：深度/字段面）
// - finalize/take/startWith：取消验证/有限流/初值前置

/** 初值前置：订阅即同步发射初值——随后转发源（冷源惰性保持——
 *  startWith 后源才被订阅——自订阅时刻起算） */
export function startWith<T>(v: T): OperatorFn<T, T> {
  return (source) => new Observable<T>((obs) => {
    obs.next(v)
    return source.subscribe(obs)
  })
}

/** 限量：第 n 值后 complete + 自动退订上游（n 值即止——有限流语义） */
export function take<T>(n: number): OperatorFn<T, T> {
  return (source) => new Observable<T>((obs) => {
    if (n <= 0) { obs.complete(); return () => {} }
    let count = 0
    let inner: { unsubscribe(): void } | null = null
    inner = source.subscribe({
      next: (v) => {
        count++
        obs.next(v)
        if (count >= n) {
          obs.complete()
          inner?.unsubscribe() // 完成即退订上游（防继续收——泄漏防线）
        }
      },
      error: (e) => obs.error(e),
      complete: () => obs.complete(),
    })
    return () => inner?.unsubscribe()
  })
}

/** 终结清理：complete/error/主动退订——**恰好调用一次**（三路径统一——
 *  取消验证的钩子——泄漏检测基建） */
export function finalize<T>(fn: () => void): OperatorFn<T, T> {
  return (source) => new Observable<T>((obs) => {
    let called = false
    const call = (): void => { if (!called) { called = true; fn() } }
    const inner = source.subscribe({
      next: (v) => obs.next(v),
      error: (e) => { call(); obs.error(e) },
      complete: () => { call(); obs.complete() },
    })
    return () => { call(); inner.unsubscribe() }
  })
}

/** 相邻去重：默认 ===（显式算子——比较器可自定义：深度/字段比较） */
export function distinctUntilChanged<T>(compare: (a: T, b: T) => boolean = (a, b) => a === b): OperatorFn<T, T> {
  return (source) => new Observable<T>((obs) => {
    let hasPrev = false
    let prev: T | undefined
    return source.subscribe({
      next: (v) => {
        if (!hasPrev || !compare(prev as T, v)) {
          hasPrev = true
          prev = v
          obs.next(v)
        }
      },
      error: (e) => obs.error(e),
      complete: () => obs.complete(),
    })
  })
}

/** 防抖：静默期后发射最后值——**取消语义**（新值到 → 旧 timer 清）——
 *  完成语义（RxJS 对齐）：complete 立即完成（pending 丢弃——搜索框
 *  unmount 不需尾值——数据完整向丢弃妥协——正确面）——零泄漏（退订清） */
export function debounceTime<T>(ms: number): OperatorFn<T, T> {
  return (source) => new Observable<T>((obs) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let done = false
    const inner = source.subscribe({
      next: (v) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          if (done) return
          obs.next(v)
        }, ms)
      },
      error: (e) => { done = true; if (timer) { clearTimeout(timer); timer = null } obs.error(e) },
      complete: () => { done = true; if (timer) { clearTimeout(timer); timer = null } obs.complete() },
    })
    return () => {
      done = true
      if (timer) { clearTimeout(timer); timer = null }
      inner.unsubscribe()
    }
  })
}

/** 节流：窗口期首值（leading——默认）——trailing 可选（窗口关闭时
 *  补最后值——并立即开新窗口——RxJS 对齐）——complete 丢弃 pending */
export function throttleTime<T>(ms: number, opts?: { trailing?: boolean }): OperatorFn<T, T> {
  const trailing = opts?.trailing ?? false
  return (source) => new Observable<T>((obs) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let waiting = false
    let last: T | undefined
    let hasLast = false
    let done = false
    const emit = (v: T): void => { if (!done) obs.next(v) }
    const openWindow = (): void => {
      timer = null
      if (trailing && hasLast) {
        hasLast = false
        emit(last as T)
      }
      waiting = false // 窗口开（新值立发——trailing 发射后同拍可进新窗口）
    }
    const inner = source.subscribe({
      next: (v) => {
        if (!waiting) {
          waiting = true
          emit(v)
          timer = setTimeout(openWindow, ms)
        } else if (trailing) {
          last = v
          hasLast = true
        }
      },
      error: (e) => { done = true; if (timer) clearTimeout(timer); obs.error(e) },
      complete: () => { done = true; if (timer) clearTimeout(timer); obs.complete() },
    })
    return () => { done = true; if (timer) clearTimeout(timer); inner.unsubscribe() }
  })
}

/** 多源汇流：**全源首发后**才发射——快照数组——全源完成 → 外部完成
 *  （任一源未发值即完成——其他源可等待——RxJS 对齐；任源 error →
 *  外部 error 终结）——空源 = 立即 complete */
export function combineLatest<T>(...sources: Observable<T>[]): Observable<T[]> {
  return new Observable<T[]>((obs) => {
    if (sources.length === 0) { obs.complete(); return () => {} }
    const values: T[] = new Array(sources.length)
    const has = new Array<boolean>(sources.length).fill(false)
    let completed = 0
    const subs: { unsubscribe(): void }[] = []
    for (let i = 0; i < sources.length; i++) {
      subs[i] = sources[i].subscribe({
        next: (v) => {
          values[i] = v
          has[i] = true
          if (has.every((h) => h)) obs.next([...values])
        },
        error: (e) => obs.error(e),
        complete: () => {
          completed++
          if (completed === sources.length) obs.complete()
        },
      })
    }
    return () => { for (const s of subs) s.unsubscribe() }
  })
}

/** 多源合并：同类型流交错——**全源完成** → 外部完成（任源 error 终结） */
export function merge<T>(...sources: Observable<T>[]): Observable<T> {
  return new Observable<T>((obs) => {
    if (sources.length === 0) { obs.complete(); return () => {} }
    let active = sources.length
    const subs: { unsubscribe(): void }[] = []
    const check = (): void => { if (active === 0) obs.complete() }
    for (let i = 0; i < sources.length; i++) {
      subs[i] = sources[i].subscribe({
        next: (v) => obs.next(v),
        error: (e) => obs.error(e),
        complete: () => { active--; check() },
      })
    }
    return () => { for (const s of subs) s.unsubscribe() }
  })
}
