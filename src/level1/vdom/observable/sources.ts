/**
 * vdom observable — 源构造
 *
 * Subject（热源）：
 * - next 广播全部当前订阅者（快照迭代——广播中退订安全）
 * - error/complete：终结全部订阅者并清空——之后 next 忽略（closed）
 * - 无订阅也持有（热——独立于订阅者存在）
 *
 * BehaviorSubject（状态源——signal 的根基）：
 * - 持当前值 get()（同步读）
 * - 新订阅立即收到当前值（Behavior 语义——首帧同步命中的根基）
 * - next 更新值并广播
 *
 * fromPromise（异步取数源——useAsyncData 的根基）：
 * - resolve → next(v) + complete（单发）
 * - reject → error（传播——不静默）
 * - AbortSignal：abort → **静默 complete**（不发值——订阅者恢复
 *   idle——fetch abort 语义——竞态取消靠 switchMap 层——此处只管停）
 * - unsubscribe 后 resolve/reject 不发（alive 守卫）
 *
 * fromEventPattern（DOM/环境源——useMedia/useInView 的根基）：
 * - add(next) 注册监听（返回 unlisten 或 void）——unsubscribe 对称移除
 * - initial()：订阅时**同步发射首值**（Behavior 语义——useMedia 初值）
 */
import { Observable, create } from './observable.ts'
import type { Observer, UnsubscribeFn } from './types.ts'

const noop = (): void => {}

/** 热源——先订阅者广播 */
export class Subject<T> {
  protected subs = new Set<Observer<T>>()
  protected closed = false

  /** 可观察面（订阅——自动从 Subject 的订阅表接入） */
  asObservable(): Observable<T> {
    return create((obs) => {
      if (this.closed) { obs.complete(); return noop }
      this.subs.add(obs)
      return () => { this.subs.delete(obs) }
    })
  }

  subscribe(partial?: Partial<Observer<T>>): { unsubscribe(): void } {
    return this.asObservable().subscribe(partial)
  }

  next(value: T): void {
    if (this.closed) return
    // 快照迭代（广播中退订安全——不影响正在广播的其他订阅者）
    for (const s of this.subs) s.next(value)
  }

  error(err: unknown): void {
    if (this.closed) return
    this.closed = true
    for (const s of this.subs) s.error(err)
    this.subs.clear()
  }

  complete(): void {
    if (this.closed) return
    this.closed = true
    for (const s of this.subs) s.complete()
    this.subs.clear()
  }
}

/** 状态源——持当前值——新订阅立即收当前值 */
export class BehaviorSubject<T> extends Subject<T> {
  private value: T

  constructor(init: T) {
    super()
    this.value = init
  }

  get(): T { return this.value }

  override next(v: T): void {
    this.value = v
    super.next(v)
  }

  /** Behavior 完整面（subscribe → 立即 next(当前值)） */
  override asObservable(): Observable<T> {
    return create((obs) => {
      if (this.closed) { obs.complete(); return noop }
      obs.next(this.value) // 订阅即收当前值（Behavior 语义）
      this.subs.add(obs)
      return () => { this.subs.delete(obs) }
    })
  }
}

/** 固定值源（单发）+ Abort 支持——resolve/subscribe 时序安全 */
export function fromPromise<T>(p: Promise<T>, opts?: { signal?: AbortSignal }): Observable<T> {
  return create<T>((obs) => {
    let alive = true
    const onAbort = (): void => {
      if (!alive) return
      alive = false // abort → 静默 complete（不发值——订阅者恢复 idle）
      obs.complete()
    }
    const signal = opts?.signal
    if (signal) {
      if (signal.aborted) { onAbort(); return noop }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    p.then(
      (v) => { if (!alive) return; alive = false; obs.next(v); obs.complete() },
      (e) => { if (!alive) return; alive = false; obs.error(e) },
    )
    return () => {
      alive = false
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  })
}

/** DOM/环境源——add 注册（可返 unlisten）——unsubscribe 对称移除 */
export function fromEventPattern<T>(
  add: (next: (v: T) => void) => UnsubscribeFn | void,
  initial?: () => T,
): Observable<T> {
  return create<T>((obs) => {
    const unlisten = add((v) => obs.next(v))
    if (initial) obs.next(initial()) // 同步首值（Behavior 语义）
    return () => { if (typeof unlisten === 'function') unlisten() }
  })
}
