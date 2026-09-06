/**
 * vdom core — createComponent（组件声明抽象——状态类/aria/role 机械面生成）
 *
 * 设计（2027-09——分层抽象 W3）：组件层 80 状态类 · 240 aria 手写实证——
 * 类名拼接与布尔 aria 是**派生面**（prop 状态 → 类/aria 的确定性映射）——
 * 声明化（BEM 规则单源在 createComponent——组件内无 `--${variant}` 模板）。
 *
 * 抽象边界（防配置地狱护栏）：只生成**机械部分**（类 + aria 布尔 + role）——
 * 结构/内容/事件/业务 = render 自由面（皮）。判据：声明比实现短且机械部分
 * 全消失——否则抽象失败（判负登记）。
 *
 * 用法：
 *   const PayBtn = createComponent<PayProps>({
 *     class: 'wf-pay-btn',
 *     enumStates: { variant: null },          // 直拼 wf-pay-btn--<v>
 *     boolStates: { active: 'wf-pay-btn--active' },
 *     ariaBools: { active: 'aria-pressed' },
 *     render: (root, props) => h('button', { ...root, onClick: props.onClick }, props.label),
 *   })
 *   // 旧：cls 数组 7 行 + aria 2 行 → 新：声明行 + render
 */
import type { Component, VNode, RenderFn } from './vnode.ts'
import { h } from './vnode.ts'
import type { UIContext } from '../context/UIContext.ts'

export interface CreateComponentDecl<P = Record<string, unknown>> {
  /** BEM 词根（wf-btn——直拼 `wf-btn--<v>`；布尔状态用 boolStates 显式类） */
  class: string
  /** 布尔状态 → 类变体（{ checked: 'wf-x--checked' }） */
  boolStates?: Record<string, string>
  /** 枚举状态 → 类变体（值直拼 `wf-x--<v>`（null）或显式映射） */
  enumStates?: Record<string, Record<string, string> | null>
  /** 布尔 → aria 属性（{ loading: 'aria-busy' }——真值写出属性） */
  ariaBools?: Record<string, string>
  /** 根 role（静态） */
  role?: string
  /** 皮（rootProps 组装毕——class/aria/role/class 透传已含——缺省
   *  根元素直接透传——render 负责结构/内容/事件——ctx 透传（i18n 等）） */
  render?: (rootProps: Record<string, unknown>, props: P, ctx: UIContext) => VNode | null
  /** 缺省渲染的根标签（render 未提供时——button） */
  tag?: string
}

/** 组件声明 → 组件工厂（同步——两阶段语义与手写一致） */
export function createComponent<P = Record<string, unknown>>(
  decl: CreateComponentDecl<P>,
): Component<P> {
  return (initProps: P, ctx: UIContext) => {
    const renderFn = (props: P) => {
      void initProps
      // 根 props 组装（机械面——单源）
      const rootProps: Record<string, unknown> = {}
      const cls = [decl.class]
      for (const [k, v] of Object.entries(decl.enumStates ?? {})) {
        const val = props[k as keyof P]
        if (val == null) continue
        if (v === null) cls.push(`${decl.class}--${String(val)}`)
        else cls.push(v[String(val)] ??
          `${decl.class}--${String(val)}` /* 映射缺口 = 直拼（显式映射不吞） */)
      }
      for (const [k, v] of Object.entries(decl.boolStates ?? {})) {
        if (props[k as keyof P]) cls.push(v)
      }
      // class 透传（Button 先例：调用方响应式类 wf-hidden@lg 等——追加尾部）
      const pc = (props as { class?: unknown }).class
      if (pc) cls.push(pc as string)
      rootProps.class = cls.join(' ')
      for (const [k, attr] of Object.entries(decl.ariaBools ?? {})) {
        if (props[k as keyof P]) rootProps[attr] = true
      }
      if (decl.role) rootProps.role = decl.role
      if (decl.render) return decl.render(rootProps, props, ctx)
      return h((decl.tag ?? 'div') as string, rootProps, (props as { children?: unknown }).children as never)
    }
    return renderFn as RenderFn<P>
  }
}
