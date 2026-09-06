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
 * ## 多状态槽（2027-09——回馈 #4：单槽边界打开）
 *
 * 单活动态边界在 Menu/NavMenu 判负（submenu title = isActive roving +
 * popupOpen expanded 双布尔——同一元素两个独立状态面）。设计：
 *
 *   ```ts
 *   const title = createItem({
 *     cls: 'wf-menu-submenu-title',
 *     role: 'menuitem',
 *     states: {
 *       active: { roving: true },            // 槽名 active → 默认后缀 '--active'
 *       open: { aria: 'aria-expanded' },     // 布尔型（false 保留）
 *     },
 *   })
 *   // 调用：
 *   h('div', title({ active: isActive, open: popupOpen }, { onClick }), ...)
 *   ```
 *
 * 槽语义（每槽独立）：
 * - `suffix`（默认 `--${槽名}`；`false` = 无类面——roving-only 槽）
 * - `aria` 布尔（槽真 → true · 假 → false **保留**——Menu popupOpen 原语义）
 * - `ariaText` 文本（槽真 → value · 假 → undefined **移除**——NavMenu
 *   hasChildren gated 原语义）
 * - `roving`（槽真 → 0 · 假 → -1）
 *
 * 兼容：单槽便捷形态（states 未声明 = `{ active: {...} }`——boolean 调用
 * 不变——既有 8 契约与 9 组件零改动）。
 *
 * 边界（诚实）：槽值是布尔——aria 多值枚举（Tree 'mixed' / Cascader
 * String() 多态）仍在契约外（判负登记）；槽间互斥衍生态（TabBar
 * disabled 与 active 互斥——disabled 槽有独立 suffix）按独立面处理。
 */
export interface ItemStateSlot {
  /** 槽态类后缀（默认 `--${槽名}`；false = 无类面） */
  suffix?: string | false
  /** 槽态 aria 布尔键（真 → true · 假 → false 保留——内核归一） */
  aria?: string
  /** 槽态 aria 文本值（真 → value · 假 → undefined 移除） */
  ariaText?: { key: string; value: string }
  /** roving tabindex（真 → 0 · 假 → -1） */
  roving?: boolean
}

export interface ItemStateDecl {
  /** 基类（如 'wf-tab'）——槽态时派生 `cls + 槽后缀` */
  cls: string
  /** role（所有实例同值——如 'tab'/'option'） */
  role?: string
  /** 单槽便捷（等效 states: { active: {...} }——兼容既有用法） */
  suffix?: string
  aria?: string
  ariaText?: { key: string; value: string }
  roving?: boolean
  /** 多状态槽（槽名 = 类后缀词干——'active' → '--active'） */
  states?: Record<string, ItemStateSlot>
}

export type ItemStateArg = boolean | Record<string, boolean>

/**
 * 生成「交互元素状态 props」工厂——返回 (state, extra) => props。
 * - 单槽（boolean 调用）：active=true 类带后缀 · aria 布尔 true · ariaText value
 * - 多槽（对象调用）：每槽独立判定（类后缀 · aria · ariaText · roving）
 * - 槽假值：aria 布尔 false（保留——与属性移除语义不同）· ariaText undefined（移除）
 * - extra 后置 spread（extra 胜——扩展不用改声明）
 * - **class 例外：extra.class 追加而非覆盖**（disabled/focus/variant 等
 *   第二类面与状态后缀共存——覆盖会丢状态类——契约锁定合并语义）
 */
export function createItem(decl: ItemStateDecl) {
  const { cls, role } = decl
  const multi = decl.states !== undefined
  // 归一为槽表（单槽便捷 → 单一 active 槽）
  type SlotNorm = { suffix: string | false; aria?: string; ariaText?: { key: string; value: string }; roving?: boolean }
  const slots: Array<[string, SlotNorm]> = multi
    ? Object.entries(decl.states!).map(([k, v]) => [k, {
        suffix: v.suffix === undefined ? `--${k}` : v.suffix,
        aria: v.aria, ariaText: v.ariaText, roving: v.roving,
      }])
    : [['active', {
        suffix: decl.suffix ?? '--active',
        aria: decl.aria, ariaText: decl.ariaText, roving: decl.roving,
      } satisfies SlotNorm]]

  return (state: ItemStateArg, extra: Record<string, unknown> = {}): Record<string, unknown> => {
    // 单槽 boolean 直判；多槽对象取槽值（undefined → false）
    const on = (name: string): boolean => typeof state === 'boolean' ? state : !!state[name]
    const classParts = [cls]
    for (const [name, slot] of slots) {
      const act = on(name)
      if (slot.suffix && act) classParts.push(cls + slot.suffix)
    }
    const base = classParts.join(' ')
    const extraCls = extra.class
    const classOut = extraCls
      ? base + ' ' + (Array.isArray(extraCls) ? extraCls.filter(Boolean).join(' ') : extraCls)
      : base
    const { class: _omit, ...rest } = extra
    const out: Record<string, unknown> = { class: classOut }
    if (role) out.role = role
    for (const [name, slot] of slots) {
      const act = on(name)
      if (slot.aria) out[slot.aria] = act
      if (slot.ariaText) out[slot.ariaText.key] = act ? slot.ariaText.value : undefined
      if (slot.roving) out.tabindex = act ? 0 : -1
    }
    return { ...out, ...rest }
  }
}
