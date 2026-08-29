/**
 * vdom store — createStore（共享状态原语——跨组件状态）
 *
 * 设计（设计规则 §4.5——render-only 无响应式引擎）：
 * - state = 普通对象（**非 Proxy**——无 set trap 无隐式 dirty）
 * - set(partial) 合并写 + notify；update(fn) 可变写 + notify；notify() 手动
 * - subscribe(cb) → 退订函数（useExternal 订阅——unmount 自动退订）
 * - **触发渲染**：订阅方（useExternal——store 变化 → 组件重渲染）——
 *   写者不直接渲染（高频 notify 由写者控制频率）
 */
import { Subject, type Observable } from './observable/index.ts'

export interface ExternalStore<T> {
  /** 当前状态（普通对象——getter 读最新——非快照） */
  readonly state: T
  /** 订阅（变化通知——返回退订函数） */
  subscribe(cb: () => void): () => void
  /** 合并写（partial → {...state, ...partial}）+ notify */
  set(partial: Partial<T>): void
  /** 可变写（fn 原地改 state）+ notify */
  update(fn: (state: T) => void): void
  /** 手动通知（高频场景由写者控制频率） */
  notify(): void
  /** **变化值流（波次 7——值源 Observable 视图）**：set/update/notify →
   *  发射当前 state——订阅即收当前值（BehaviorSubject 语义）——可
   *  pipe/takeUntil——与 subscribe 同源（同一变化事件） */
  readonly changes$: Observable<T>
}

export function createStore<T>(init: T): ExternalStore<T> {
  const subs = new Set<() => void>()
  const changes = new Subject<T>()
  let state = init

  const notify = (): void => {
    for (const cb of [...subs]) cb()
    changes.next({ ...state }) // 值源流视图（**浅拷贝快照**——原地 update 不污染历史值）
  }

  return {
    get state(): T {
      return state
    },
    subscribe(cb: () => void): () => void {
      subs.add(cb)
      return () => { subs.delete(cb) }
    },
    set(partial: Partial<T>): void {
      state = { ...state, ...partial }
      notify()
    },
    update(fn: (state: T) => void): void {
      fn(state)
      notify()
    },
    notify,
    changes$: changes.asObservable(),
  }
}

/** 响应式信号（signal 原语——store 的获取器形态归一）
 * - 读 = `sig()`（getter 函数——**任何时刻调用都返回最新值**——无快照
 *   失效概念——mount 闭包持有 signal 永远最新——「调用位置规则」在
 *   API 形状上不存在）
 * - 写 = `sig.set(v)` / `sig.update(fn)`（写入 → notify 订阅者）
 * - 订阅 = `sig.subscribe(cb)`（返回退订——useExternal 自动清理）
 * - **存储本来就是 ExternalStore**（readonly state + subscribe/set/update/
 *   notify）——signal 是它的 getter 面向——二者互换（useExternal 同源
 *   消费——createSignal 结果可直接订阅） */
export interface Signal<T> {
  /** 读（getter——永远最新） */
  (): T
  /** 合并写（partial → {...state, ...partial}）+ notify */
  set(partial: Partial<T>): void
  /** 可变写（fn 原地改 state）+ notify */
  update(fn: (state: T) => void): void
  /** 订阅（变化通知——返回退订函数） */
  subscribe(cb: () => void): () => void
  /** 手动通知（高频场景由写者控制频率） */
  notify(): void
  /** 底层存储（ExternalStore 面——useExternal 等消费） */
  store: ExternalStore<T>
}

export function createSignal<T>(init: T): Signal<T> {
  const store = createStore(init)
  const sig = ((): T => store.state) as Signal<T>
  sig.set = (partial) => store.set(partial)
  sig.update = (fn) => store.update(fn)
  sig.subscribe = (cb) => store.subscribe(cb)
  sig.notify = () => store.notify()
  sig.store = store
  return sig
}
