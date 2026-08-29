/**
 * vdom observable — 统一出口
 *
 * 自研零依赖 Observable（2027-08——weifuwu/client 数据流地基）：
 * - 语义规格：types.ts（先文档后实现——契约测试锁定）
 * - 核心：observable.ts（class/create/pipe）
 * - 源：sources.ts（Subject/BehaviorSubject/fromPromise/fromEventPattern）
 * - 算子：operators.ts（7 个——场景驱动裁剪）
 */
export { Observable, create } from './observable.ts'
export type { Observer, PartialObserver, Subscription, SubscribeFn, OperatorFn, UnsubscribeFn } from './observable.ts'
export { Subject, BehaviorSubject, fromPromise, fromEventPattern } from './sources.ts'
export { map, filter, tap, toArray, scan, switchMap, mergeMap, takeUntil, shareReplay } from './operators.ts'
