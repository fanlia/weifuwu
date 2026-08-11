/**
 * hooks/input — 受控/输入/异步取数 hooks
 *
 * useControlled / useControlledInput / useAsync
 */

import type { HookEnv } from './types.ts'
import type { UseAsyncHandle } from '../types.ts'

/** 受控/非受控状态统一：value !== undefined → 受控（setValue 只走 onChange） */
export function useControlled<T>(env: HookEnv, options: {
  value?: T
  onChange?: (v: T) => void
  name?: string
}): { value: T | undefined; setValue: (v: T) => void; controlled: boolean } {
  const selfId = env.selfId()
  const controlled = options.value !== undefined
  // 受控缺回调 warn：按 name 幂等（一次提示即可）
  if (controlled && !options.onChange && options.name) {
    if (!env.warned.has(options.name)) {
      env.warned.add(options.name)
      console.warn(
        `[weifuwu/${options.name}] 受控模式（value 已传）但未提供 onChange，交互无法生效。\n` +
        `非受控：去掉 value；受控：传入 onChange={(v) => setValue(v)}`
      )
    }
  }
  // 非受控内部值：首次用当前 value 初始化，后续跨渲染保持
  if (!controlled && selfId && !env.uncontrolledValues.has(selfId)) {
    env.uncontrolledValues.set(selfId, options.value)
    const unsub = env.onUnmount((id) => { if (id === selfId) { env.uncontrolledValues.delete(selfId); unsub() } })
  }
  const setValue = (v: T) => {
    if (controlled) {
      options.onChange?.(v)
      return
    }
    if (selfId) env.uncontrolledValues.set(selfId, v)
    if (selfId) env.render([selfId])
    else env.render()
  }
  return {
    value: controlled ? options.value : (selfId ? env.uncontrolledValues.get(selfId) : options.value),
    setValue,
    controlled,
  }
}

/** 受控输入原语（C3）：useControlled + 内部输入态/选中态（输入焦点保持） */
export function useControlledInput(env: HookEnv, options: {
  value?: string
  onChange?: (v: string) => void
  name?: string
}) {
  const selfId = env.selfId()
  const ctrl = useControlled(env, { value: options.value, onChange: options.onChange, name: options.name })
  // render 阶段调用（读最新 props）——内部态 Map 缓存跨渲染保持
  if (selfId && !env.inputStates.has(selfId)) {
    env.inputStates.set(selfId, { keyword: '', selectedLabel: '' })
    const unsub = env.onUnmount((id) => { if (id === selfId) { env.inputStates.delete(selfId); unsub() } })
  }
  const state = selfId ? env.inputStates.get(selfId)! : { keyword: '', selectedLabel: '' }
  const dirty = () => {
    if (selfId) env.render([selfId])
    else env.render()
  }
  return {
    ...ctrl,
    get keyword() { return state.keyword },
    setKeyword(v: string) { state.keyword = v; dirty() },
    get selectedLabel() { return state.selectedLabel },
    setSelectedLabel(v: string) { state.selectedLabel = v; dirty() },
  }
}

/** 异步取数工具（mount 阶段调用）：loading/error 自动管理 + 数据就绪自动渲染 */
export function useAsync<T>(env: HookEnv, fetcher: () => Promise<T>): UseAsyncHandle<T> {
  const selfId = env.selfId()
  let disposed = false
  // 组件卸载：丢弃后续 resolve 的 render（in-flight 结果不再渲染已卸载组件）
  if (selfId) {
    const unsub = env.onUnmount((id) => { if (id === selfId) { disposed = true; unsub() } })
  }
  // render-only：普通对象状态（非 Proxy）——每次变更显式 render
  const render = () => {
    if (disposed) return
    if (selfId) env.render([selfId])
    else env.render()
  }
  const state: any = { data: undefined, loading: false, error: undefined }
  // stale-close 保护：每次 reload 递增 token，过期 Promise resolve 静默丢弃
  let token = 0
  const run = () => {
    const cur = ++token
    state.loading = true
    state.error = null
    render()
    Promise.resolve()
      .then(() => fetcher())
      .then((d) => { if (token === cur) { state.data = d; state.loading = false; render() } })
      .catch((e) => { if (token === cur) { state.error = e; state.loading = false; render() } })
  }
  run()
  state.reload = run
  return state as unknown as UseAsyncHandle<T>
}
