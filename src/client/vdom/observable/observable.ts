/**
 * vdom observable — Observable 核心类 + create + pipe
 *
 * 实现契约（与 types.ts 语义规格一一对应）：
 * - subscribe 规范化 observer（缺省 noop）——terminated 后发射忽略
 * - error/complete：terminated → teardown 自动执行（一次）
 * - unsubscribe：幂等（重复调用无副作用）——teardown 只执行一次
 * - next 期间安全：广播快照迭代（删除不中断）——见 Subject（sources.ts）
 */
import type { Observer, PartialObserver, Subscription, SubscribeFn } from './types.ts'
export type { Observer, PartialObserver, Subscription, SubscribeFn, UnsubscribeFn } from './types.ts'

/** 算子：Observable → Observable（此处定义——避免 types 循环依赖） */
export type OperatorFn<T, R> = (source: Observable<T>) => Observable<R>

const noop = (): void => {}

export class Observable<T> {
  /** 订阅函数（冷源惰性——订阅才执行） */
  private readonly _subscribe: SubscribeFn<T>

  constructor(subscribe: SubscribeFn<T>) {
    this._subscribe = subscribe
  }

  subscribe(partial?: PartialObserver<T>): Subscription {
    const obs = normalize(partial)
    let terminated = false
    let teardown: (() => void) | null = null

    const safe: Observer<T> = {
      next: (v) => { if (!terminated) obs.next(v) },
      error: (e) => {
        if (terminated) return
        terminated = true
        obs.error(e)
        teardown?.()
      },
      complete: () => {
        if (terminated) return
        terminated = true
        obs.complete()
        teardown?.()
      },
    }

    // teardown 统一规范化：函数或订阅对象
    const td = this._subscribe(safe)
    teardown = typeof td === 'function' ? td : td ? () => td.unsubscribe() : noop
    // **同步终结时序**：源在执行 subscribe 期间（同步）已 error/complete——
    // teardown 需在此刻补执行（此前被挂起——语义：终结必 teardown）
    if (terminated) teardown()

    let unsubscribed = false
    return {
      unsubscribe() {
        if (unsubscribed) return
        unsubscribed = true
        if (!terminated) {
          terminated = true
          teardown?.()
        }
      },
    }
  }

  pipe<A>(op1: OperatorFn<T, A>): Observable<A>
  pipe<A, B>(op1: OperatorFn<T, A>, op2: OperatorFn<A, B>): Observable<B>
  pipe<A, B, C>(op1: OperatorFn<T, A>, op2: OperatorFn<A, B>, op3: OperatorFn<B, C>): Observable<C>
  pipe(...ops: OperatorFn<unknown, unknown>[]): Observable<unknown> {
    return ops.reduce((source, op) => op(source), this as Observable<unknown>) as Observable<unknown>
  }
}

/** 规范化 observer——缺省 noop */
function normalize(partial?: PartialObserver<unknown>): Observer<unknown> {
  return {
    next: partial?.next ?? noop,
    error: partial?.error ?? noop,
    complete: partial?.complete ?? noop,
  }
}

/** 源构造（裸冷源）——订阅函数直接定义 */
export function create<T>(subscribe: SubscribeFn<T>): Observable<T> {
  return new Observable(subscribe)
}
