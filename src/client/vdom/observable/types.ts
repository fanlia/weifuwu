/**
 * vdom observable — 类型（语义规格层）
 *
 * Observable 核心语义（自研零依赖——2027-08 架构地基）：
 *
 * 1. 订阅：subscribe(observer) → Subscription——observer 可部分实现
 *    （缺省 next/error/complete = noop）——订阅即启动（冷源惰性执行）
 * 2. 终结（terminal）：error/complete 后——订阅者不再收任何值——
 *    内部 teardown 自动执行（unsubscribe 幂等——重复调用无副作用）
 * 3. unsubscribe：释放订阅——上游 teardown 执行——后续发射被忽略
 * 4. 安全迭代：next 广播期间 unsubscribe 某订阅者——不影响正在广播的
 *    其他订阅者（快照迭代——删除安全）
 * 5. 错误传播：error 如遇链上未终结——传播到订阅者 error 回调——不静默
 * 6. 冷热：create/fromPromise 冷（惰性——订阅才执行）；Subject 热
 *    （无订阅也持有——next 只达当前订阅者）
 *
 * 算子规格（operators.ts）：
 * - map(fn)：每个值 → fn 变换
 * - filter(pred)：pred 为真才转发
 * - scan(fn, init)：累积——每值产出累加器（状态 = 流的折叠）
 * - switchMap(fn)：上游每值 → 订阅内层——**新值到来取消旧内层**
 *   （旧流的结果作废——竞态消灭的语义根基）
 * - mergeMap(fn)：上游每值 → 订阅内层——**并行不取消**——全部完成后
 *   且上游完成 → 外部 complete
 * - takeUntil(notifier)：notifier **发射**（next）→ 外部 complete
 *   （notifier 的 complete/error 不触发——RxJS 对齐语义）
 * - shareReplay(1)：多订阅共享同一上游——源只执行一次——缓存最后值——
 *   新订阅立即收缓存——refCount 归零后新订阅重新执行源
 */
export type UnsubscribeFn = () => void

/** teardown：函数或订阅对象（订阅函数统一返回形态） */
export type Teardown = UnsubscribeFn | { unsubscribe(): void }

export interface Observer<T> {
  next(value: T): void
  error(err: unknown): void
  complete(): void
}

export type PartialObserver<T> = Partial<Observer<T>>

export interface Subscription {
  unsubscribe(): void
}

/** 订阅函数（Observable 构造原料）——返回 teardown */
export type SubscribeFn<T> = (observer: Observer<T>) => Teardown | void
