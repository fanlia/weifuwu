/**
 * contracts/ctx — 组件 ctx 契约（引擎无关——vdom4 端口化 UI-1）
 *
 * 组件可见面：V3Ctx（render/onUnmount/ui/browser + 中间件扩展面）与 V3Ui
 * （hooks 兼容面）。引擎（engines/）实现本契约；组件库只经 ui-dom 门面消费——
 * v5 换引擎时本文件不动（HookEnv 引擎无关形状见 UI-3——届时 V3Ui 转发之）。
 */

/** WfuiContext（组件 ctx 类型源——192 处组件消费）——V3Ctx extends 统一 */
import type { WfuiContext } from '../types.ts'

/** vdom3 组件 ctx（正式契约——与 WfuiContext 类型唯一化：
 *  V3Ctx extends WfuiContext——vdom2 时代内联标注 ctx: WfuiContext 的组件
 *  类型兼容（逆变：接受 WfuiContext 的函数可接收 V3Ctx）；组件库 192 处
 *  WfuiContext 消费零改动——严格类型，无 any 绕开） */
export interface V3Ctx extends WfuiContext {
  /** 调度自身重渲染（同 tick 合并）——render-only 唯一触发 */
  render(): void
  /** 卸载清理注册（COMP_UNMOUNT 时执行） */
  onUnmount(fn: () => void): void
  /** vdom2 兼容面（hooks shim——组件库零改动运行——V3Ui 满足放宽后的
   *  WfuiContext['ui']（render: void ⊂ void | Promise<void>）） */
  ui: V3Ui
}

/** ctx.ui 兼容面（vdom2 hooks 契约——组件库零改动运行）
 *  方法签名继承 vdom2 ui（hooks 类型源——vdom2 删除后 hooks 保留为共享层）；
 *  render/onUnmount 覆盖为 vdom3 语义（同步 render）。 */
export interface V3Ui
  extends Omit<WfuiContext['ui'], 'render' | 'onUnmount'> {
  render(ids?: string[]): void
  onUnmount(fn: () => void): (() => void) | undefined
  /** 实例标记（debug：ctx.ui 来源审计——双实例定位） */
  __v3ui?: boolean
  /** 实例绑定的组件 id（debug：compId 错位定位） */
  __compId?: string
}
