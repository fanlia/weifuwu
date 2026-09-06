/**
 * createItem —— 交互元素状态捆绑原语（原语全面化回馈 #2）
 *
 * 为什么存在：createComponent（组件级声明）在 W3 判负调查中暴露结构性错位——
 * 组件 = 容器 + 可交互子项（Tabs 的 tab / SegmentedControl 的 option /
 * TabBar 的 item），**状态类和 aria 布尔几乎总在子项上**（43 组件含状态面，
 * 12 组件是「同条件驱动类 + aria 双面」的真机械面）。抽象单位切错了——
 * 从「组件」下沉到「交互元素」：
 *
 *   ```ts
 *   const tab = createItem({ cls: 'wf-tab', role: 'tab', aria: 'aria-selected' })
 *   // 循环内：
 *   h('button', tab(act === key, { onClick }), label)
 *   // → { class: 'wf-tab wf-tab--active', role: 'tab', 'aria-selected': true, onClick }
 *   ```
 *
 * 单源回报：类后缀与 aria 布尔**捆绑声明**——不可能改一面漏一面
 * （aria-selected 与 --active 不同步 = a11y bug——同类手写双面同步是历史重复源）。
 * aria 布尔直传内核（ariaBoolValue 归一——回馈 #1 后全库无手写三元冗余）。
 *
 * 边界（诚实）：单活动态（一个元素一个激活布尔）。多状态子项
 * （Menu 的 current+expanded / Tree 的 checked+selected+open）不在契约——
 * 手写保留（判负登记）；aria 多值（Tree checked 'mixed' / Cascader 多态）
 * 用 ariaText 文本值兜底，多值枚举仍判负。
 */
export interface ItemStateDecl {
  /** 基类（如 'wf-tab'）——active 时派生 `cls + suffix` */
  cls: string
  /** 活动态类后缀（默认 '--active'——组件类名约定） */
  suffix?: string
  /** role（所有实例同值——如 'tab'/'option'） */
  role?: string
  /** 活动态 aria 布尔键（布尔直传内核归一——非 active 时 false 保留） */
  aria?: string
  /** 活动态 aria 文本值（active → value；非 active → undefined 移除） */
  ariaText?: { key: string; value: string }
  /** roving tabindex（active → 0 · 非 active → -1——键盘焦点管理面） */
  roving?: boolean
}

/**
 * 生成「交互元素状态 props」工厂——返回 (active, extra) => props。
 * - active=true：类带后缀 · aria 布尔 true（或 ariaText value）
 * - active=false：类无后缀 · aria 布尔 false（保留状态——与属性移除语义不同）
 *   · ariaText undefined（移除）
 * - extra 后置 spread（extra 胜——扩展不用改声明）
 * - **class 例外：extra.class 追加而非覆盖**（disabled/focus/variant 等
 *   第二类面与状态后缀共存——覆盖会丢状态类——契约锁定合并语义）
 */
export function createItem(decl: ItemStateDecl) {
  const { cls, suffix = '--active', role, aria, ariaText, roving } = decl
  return (active: boolean, extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const base = cls + (active ? ` ${cls}${suffix}` : '')
    const extraCls = extra.class
    const classOut = extraCls
      ? base + ' ' + (Array.isArray(extraCls) ? extraCls.filter(Boolean).join(' ') : extraCls)
      : base
    const { class: _omit, ...rest } = extra
    return {
      class: classOut,
      ...(role ? { role } : {}),
      ...(aria ? { [aria]: active } : {}),
      ...(ariaText ? { [ariaText.key]: active ? ariaText.value : undefined } : {}),
      ...(roving ? { tabindex: active ? 0 : -1 } : {}),
      ...rest,
    }
  }
}
