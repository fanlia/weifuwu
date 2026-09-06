/**
 * semantic —— 语义面原语（三面论·语义面——role 模板表）
 *
 * 为什么存在：组件的语义身份（role）携带**标准 aria 契约**（ARIA 1.2 角色
 * 面）——dialog 必须 aria-modal · progressbar 必须 valuenow/min/max · 
 * switch 必须 aria-checked。325 处手写 role/aria 面中，这些键面是**可模板化
 * 的机械面**（键集固定——值组件特异）。
 *
 * 单源回报：role 模板表 ROLE_SEMANTICS 是角色契约的**唯一声明**——
 * 契约测试扫描全库（组件用了 role 却缺键面 = 红——FileUpload/ToolCallCard
 * progressbar 缺 valuemin 即被审计抓出）。键面归一（aria 布尔直传内核——
 * 回馈 #1 后无手写三元）。
 *
 * 边界（诚实）：
 * - aria-label 是成分面（值组件特异/i18n/插值）——labelable 只声明
 *   "可被标注"的契约，值由组件传（不模板化值）
 * - 非 ARIA 角色面（结构语义——navigation/main 的 landmark 面）走
 *   结构面（h 直写——不模板化——landmark 值组件特异）
 * - createItem 的 aria 槽是状态面（动态值）· semantic 的 keys 是契约面
 *   （必备键集合）——正交：组件可同时用（progressbar 的 valuenow 若
 *   动态也可走 createItem 的 enum/aria 面——两者收敛于同一键）
 */

/** 角色语义模板（ARIA 1.2 角色契约面摘要——28 角色） */
export const ROLE_SEMANTICS: Record<string, {
  /** 必备固定键（值常量——声明的角色即必须带） */
  fixed?: Record<string, unknown>
  /** **必备键面**（ARIA 要求的最小契约——缺失 = 语义缺口——审计查这层） */
  keys?: string[]
  /** 条件键面（角色可能面——hasChildren/combobox 模式等——审计不查） */
  optional?: string[]
  /** labelable（aria-label/labelledby 连接面——值组件特异） */
  labelable?: boolean
}> = {
  // 窗口/弹层
  dialog: { fixed: { 'aria-modal': true }, labelable: true },
  alertdialog: { fixed: { 'aria-modal': true }, labelable: true },
  // 进度/滑杆（数值面）
  progressbar: { keys: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'], labelable: true },
  slider: { keys: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'], labelable: true },
  scrollbar: { keys: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'], labelable: true },
  // 选择类（布尔状态面）
  switch: { keys: ['aria-checked'], labelable: true },
  radio: { keys: ['aria-checked'], labelable: true },
  checkbox: { keys: ['aria-checked'], labelable: true },
  option: { keys: ['aria-selected'], labelable: true },
  tab: { keys: ['aria-selected'], labelable: true },
  menuitem: { keys: [], optional: ['aria-haspopup', 'aria-expanded', 'aria-current'], labelable: true },
  treeitem: { keys: [], optional: ['aria-level', 'aria-selected', 'aria-expanded', 'aria-checked'], labelable: true },
  // 容器（labelable——命名面）
  group: { labelable: true },
  listbox: { labelable: true },
  combobox: { keys: ['aria-expanded'], optional: ['aria-controls', 'aria-activedescendant'], labelable: true },
  menu: { labelable: true },
  tablist: { labelable: true },
  radiogroup: { labelable: true },
  toolbar: { labelable: true },
  navigation: { labelable: true },
  menubar: { labelable: true },
  tabpanel: { optional: ['aria-labelledby'], labelable: true },
  // 图文（label 面）
  img: { labelable: true },
  // 嵌入（iframe 面）
  article: { labelable: true },
  // 活区
  status: { labelable: true },
  alert: { labelable: true },
  // 原语（键面少或无）
  button: { labelable: true },
  link: { labelable: true },
  separator: {},
  tooltip: {},
  tree: { labelable: true },
  list: { labelable: true },
}

export interface SemanticOpts {
  /** aria-label 值（组件特异——labelable 面） */
  label?: string
  /** aria-labelledby 引用（组件特异——labelable 面） */
  labelledBy?: string
  /** aria-describedby 引用 */
  describedBy?: string
  /** 键面值（role 的 keys——如 progressbar 的 valuenow） */
  values?: Record<string, unknown>
}

/**
 * 语义面组装（纯函数）：role + 模板固定键 + 键面值 + labelable 连接。
 * - 未知 role → 只 { role }（白名单外诚实——不静默造键）
 * - label/labelledBy 互斥优先（显式 labelledBy > label > 无）
 * - mode: 'strict'（模板 keys 缺值——缺失键不写（调用方决定——组件特异）
 *   ——**契约审计扫描**保证键面（与语义缺口防线的分工）
 */
export function semantic(role: string, opts: SemanticOpts = {}): Record<string, unknown> {
  const tpl = ROLE_SEMANTICS[role]
  const out: Record<string, unknown> = { role }
  if (tpl?.fixed) Object.assign(out, tpl.fixed)
  const allKeys = [...(tpl?.keys ?? []), ...(tpl?.optional ?? [])]
  if (allKeys.length) {
    for (const k of allKeys) {
      const v = opts.values?.[k]
      if (v !== undefined) out[k] = v
    }
  }
  const label = opts.labelledBy ?? opts.label
  if (tpl?.labelable && label !== undefined) {
    if (opts.labelledBy !== undefined) out['aria-labelledby'] = opts.labelledBy
    else out['aria-label'] = opts.label
  }
  if (opts.describedBy !== undefined) out['aria-describedby'] = opts.describedBy
  return out
}
