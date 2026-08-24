/**
 * vdom core2 — vnode（节点类型定义——6 类型判别联合）
 *
 * 设计目标（core1 教训——消灭"模型 → 代码"映射鸿沟）：
 * ① **类型判别联合（Child）**：classify 唯一判定点——消费点 switch(kind)
 *    穷尽——遗漏分支 = 编译错误（core1 的 kindOf 返回 string——运行时
 *    分支遗漏静默——CompOutput 方案 3 的全面推广——本轮 G9-G11 的 11 个
 *    bug 全部源于"同一规则多处实现/隐式约定"——判别联合把类型面显式化）
 * ② **纯数据面**：vnode 零回填字段（可克隆/比较/序列化——h/jsx 零转换）
 * ③ **id 空间显式化**：id 推导规则（投影/输出形态特判）将在 id.ts 收敛
 *    为单一纯函数（idOf）——本文件只定义类型与判定——不涉及位置/id
 *
 * 核心公理（vdom ⟷ DOM 双向转换——唯一性——core2 的验证基准）：
 *   A1 编码唯一：enc: vnode（内部结构 + 位置参数）→ DOM 子树是函数——
 *      无隐藏状态（注册表历史/渲染顺序/隐式形态约定不参与转换）
 *   A2 可逆唯一：dec(enc(v)) = v——DOM 含足够信息恢复 vnode（round-trip
 *      恒等——可序列化面；函数面经函数表）
 *   A3 单射：同位置的异 vnode → 结构可区分的 DOM
 *   ——组件/数组无直接 DOM 实体——唯一对应**展开区间**（slotCount 纯函数
 *   推导——区间边界显式——不依赖消费端前缀猜测）
 *
 * 节点类型（6 种——fragment 取消特殊性：Fragment 符号 = 数组——
 *  classify 归一为 array——消费点零特判）：
 *   text       —— string/number → DOM 文本节点
 *   hole       —— null/undefined/boolean → 空洞占位锚（DOM Comment——
 *                同构不变量：childNodes 长度恒定——禁止 filter 塌缩）
 *   element    —— type: string → DOM 元素节点
 *   component  —— type: 函数 → 两阶段组件（工厂 + renderFn——无 DOM 实体——
 *                输出经 sink 展开——输出形态决定 id 空间）
 *   array      —— 数组 / Fragment 符号（`<></>`）→ 隐式 Fragment——多节点
 *                展开（无 DOM 实体——items 一律展开——嵌套摊平）
 *   invalid    —— 非法输入（对象/数字 type/未知符号）→ 诊断占位 + warn
 *                （不崩溃不静默——core1 纪律）
 */

import type { UIContext } from '../context/UIContext.ts'

/** Fragment 内部符号（`<></>`——JSX 编译目标——**语义 = 数组**：classify
 *  归一为 array——消费点零特判——无任何特殊性） */
export const Fragment: unique symbol = Symbol.for('wf.fragment')

/** renderFn——每次渲染（读最新 props——同步或 async——异步边界 = ctx.data） */
export type RenderFn<P = Record<string, unknown>> = (
  props: P,
) => VNodeChild | Promise<VNodeChild>

/** 组件（两阶段）：工厂 = mount（一次——初始化/订阅/取数）；renderFn = 每次渲染 */
export type Component<P = Record<string, unknown>> = (
  initProps: P,
  ctx: UIContext,
) => RenderFn<P> | Promise<RenderFn<P>>

/** vnode——纯数据（type 三态：元素标签 / 组件函数 / Fragment 符号） */
export interface VNode {
  type: string | Component | typeof Fragment
  props: Record<string, unknown>
  /** 业务身份声明（key 从 props 剥离进 vnode.key——组件 props 不见 key——
   *  无自动生成——无 key = 位置身份） */
  key: string | null
  /** children 快照（h 单子节点直接存——多子节点存数组——无子节点不存） */
  children?: VNodeChild[]
}

/** children 值域（数组 = 隐式 Fragment——空洞保留——占位法保长度恒定） */
export type VNodeChild = VNode | string | number | boolean | null | undefined | VNodeChild[]

/** 数组槽位迭代（**单一实现源——emitNew/removeOld/渲染共用**）：start 锚
 *  → 各项（连续文本间插 split 锚）→ end 锚——槽位推进与 slotCount 一致
 *  ——emitNew（create）、removeOld（delete）全部走本迭代——消灭 split
 *  位置的双实现漂移——fn 收（槽位, 种类, 项索引） */
export function forEachArraySlot(
  items: VNodeChild[],
  fn: (slot: number, kind: 'start' | 'split' | 'item' | 'end', index: number) => void,
): void {
  let slot = 0
  fn(slot, 'start', -1)
  slot += 1
  const marks = textMarks(items)
  let mi = 0
  for (let i = 0; i < items.length; i++) {
    while (mi < marks.length && marks[mi]!.index === i) {
      fn(slot, 'split', i)
      slot += 1
      mi += 1
    }
    fn(slot, 'item', i)
    slot += slotCount(items[i]!)
  }
  fn(slot, 'end', -1)
}

/** 节点 id（位置参数——确定性路径——'root.0.1'——锚点法——与渲染/事件流
 *  槽位推进一致——**data-wf-id 注入的唯一来源**——idOf 与 pathId 同义
 *  （pathId 为历史别名——新代码用 idOf）） */
export function idOf(parent: string, i: number): string {
  return `${parent}.${i}`
}

/** pathId 别名（与 idOf 同实现——历史调用方） */
export function pathId(parent: string, i: number): string {
  return idOf(parent, i)
}

/** keyed 组件 id（**key 注入防御——core1 G9 教训**）：compId 直接拼接 key——
 *  key 含 '.'（数据 id 'a.b'）与 'ka' 产生前缀关系——dispose/remap 的
 *  startsWith 前缀匹配误删兄弟实例——统一转义（'%'→'%25' 先行、'.'→
 *  '%2E'——互不碰撞——单射） */
export function keyedIdOf(id: string, key: string): string {
  const esc = key.replace(/%/g, '%25').replace(/\./g, '%2E')
  return `${id}.k${esc}`
}

/** 节点类型（6 种——fragment 已归一为 array） */
export type NodeKind =
  | 'text'      // string/number——文本节点
  | 'hole'      // null/undefined/boolean——空洞占位锚
  | 'element'   // type: string——原生元素
  | 'component' // type: 函数——两阶段组件
  | 'array'     // 数组 / Fragment 符号——多节点展开（items 一律摊平）
  | 'invalid'   // 非法输入——诊断占位 + warn

/** 节点判别联合（classify 产物——消费点 switch(kind) 穷尽——编译期强制）：
 *  text 直接携带字符串化值（string/number 统一——fuzz#79 教训）；
 *  **hole 携带原始值（null/undefined/boolean——值保真——逆向恢复原始
 *  vnode 状态——DOM 注释编码 wf-hole: null/true/false）**；array 携带
 *  **展开后**的 items（嵌套摊平——Fragment vnode 的 children 同样展开——
 *  消费点不再处理嵌套）；invalid 携带原始输入（诊断） */
export type Child =
  | { kind: 'text'; value: string | number } // 原值保留（number 由渲染层插 tn 标记）
  | { kind: 'hole'; value: null | boolean | undefined } // 值全保真（undefined 独立）
  | { kind: 'element'; v: VNode }
  | { kind: 'component'; v: VNode }
  | { kind: 'array'; items: VNodeChild[] }
  | { kind: 'invalid'; v: unknown }

/** children 读取（单一规则源）：元素 vnode 的 props.children 展开——
 *  单子节点包成单元素数组；**嵌套数组保留**（数组项独立——消费点递归
 *  classify——嵌套 = 子区间——start/end 锚保真嵌套层级——不摊平）——
 *  空洞（null/false）保留（占位法——不 filter）——**Fragment vnode 不
 *  展开**（classify 归一 array 标记——items 中保持原样——消费点对每项
 *  递归 classify 时自然归一——递归发生在消费点而非展开期） */
export function childrenOf(v: VNode): VNodeChild[] {
  const c = v.children ?? (v.props.children === undefined ? [] : v.props.children)
  return (Array.isArray(c) ? c : [c]) as VNodeChild[]
}

/** 数组归一（**保留嵌套**——数组项独立——消费点递归 classify——嵌套
 *  层级由 start/end 锚保真——不摊平） */
export function expandItems(xs: VNodeChild[]): VNodeChild[] {
  return xs
}

/** 槽位计数（**投影维度——单一实现源**）：array（含 Fragment）占
 *  **项和 + 2（start/end 边界锚）+ 序列文本标记数（textMarks）**——
 *  **number 文本自含 tn 标记（slotCount = 2）**——其他形态 = 1——
 *  所有槽位推进统一调用 */
export function slotCount(c: VNodeChild): number {
  const ch = classify(c)
  if (ch.kind === 'text') return typeof ch.value === 'number' ? 2 : 1 // text-number 标记 + 文本
  if (ch.kind === 'array') {
    let n = 2 // start/end 边界锚
    for (const x of ch.items) n += slotCount(x)
    return n + textMarks(ch.items).length
  }
  return 1
}

/** 序列文本标记（**单一实现源——元素 children/数组项统一规则**）：
 *  **number 文本的 tn 标记在文本自身**（slotCount 已含）——本函数只算
 *  **string 的 split 标记**（当前项是 string 且前项是 text（string 或
 *  number）——number 的前置 tn 已天然分隔——故只对 string 插 split）——
 *  渲染层（dom/html/transform）按返回位置插 split 锚 */
export function textMarks(items: VNodeChild[]): { index: number }[] {
  const out: { index: number }[] = []
  let prevText = false
  for (let i = 0; i < items.length; i++) {
    const c = classify(items[i]!)
    if (c.kind === 'text') {
      if (typeof c.value === 'string' && prevText) out.push({ index: i })
      prevText = true
    } else prevText = false
  }
  return out
}

/** 唯一判定点（core1 的 kindOf/stateOf/textOf 三函数收敛为单一实现源——
 *  消费点不再各自推理形态判定——消灭判定漂移）——**fragment 归一 array**：
 *  Fragment 符号 vnode → { kind: 'array', items: childrenOf(v) }——
 *  **hole 值保真**（null/undefined → null；boolean 原样） */
export function classify(v: VNodeChild | null | undefined): Child {
  // **null/undefined 分列保真**（wf-hole: null / undefined——不再归一——
  //  A3 单射：两个不同 vnode → 结构可区分 DOM）
  if (v === null) return { kind: 'hole', value: null }
  if (v === undefined) return { kind: 'hole', value: undefined }
  if (typeof v === 'boolean') return { kind: 'hole', value: v }
  // **text 保留原始值（string | number）**——number 由渲染层前置
  // text-number 标记（类型保真——A3）——String() 在渲染端
  if (typeof v === 'string' || typeof v === 'number') return { kind: 'text', value: v }
  if (Array.isArray(v)) return { kind: 'array', items: expandItems(v) }
  const vn = v as VNode
  if (typeof vn.type === 'string') return { kind: 'element', v: vn }
  if (typeof vn.type === 'function') return { kind: 'component', v: vn }
  if (vn.type === Fragment) return { kind: 'array', items: childrenOf(vn) }
  return { kind: 'invalid', v }
}

/** 节点类型（判别联合的 kind 标签——classify 同源） */
export function kindOf(v: VNodeChild | null | undefined): NodeKind {
  return classify(v).kind
}

// ── 构造（h/jsx——纯数据——零转换——key 剥离） ──

type HType = string | Component<any> | typeof Fragment

/** h()——创建 vnode（纯数据——除 key 剥离外零转换——children 原样保留
 *  空洞/嵌套数组——不 filter——占位法在消费侧） */
export function h(type: HType, props?: Record<string, unknown> | null, ...children: VNodeChild[]): VNode {
  const p: Record<string, unknown> = props ? { ...props } : {}
  const key = typeof p.key === 'string' ? p.key : null
  delete p.key
  if (children.length === 1) p.children = children[0]
  else if (children.length > 1) p.children = children
  return { type: type as VNode['type'], props: p, key }
}

/** jsx 运行时（自动导入——`<div/>` 编译目标——jsx(type, props, key)——
 *  props 内 key 同样剥离；jsxs/jsxDEV 同形状（children 已在 props.children） */
export function jsx(type: HType, props: Record<string, unknown> | null, key?: string | null): VNode {
  const p: Record<string, unknown> = props ? { ...props } : {}
  const k = key ?? (typeof p.key === 'string' ? p.key : null) ?? null
  delete p.key
  return { type: type as VNode['type'], props: p, key: k }
}
export const jsxs = jsx
export const jsxDEV = jsx

/** 非法输入诊断（classify invalid 的载荷描述——warn 用——不崩溃不静默） */
export function invalidDiagnostic(v: unknown): string {
  if (v !== null && typeof v === 'object') {
    const t = (v as { type?: unknown }).type
    return `对象节点 type=${typeof t === 'function' ? (t as { name?: string }).name ?? '?' : String(t)}（非法——type 必须是 string/函数/Fragment）`
  }
  return `非法子节点 ${String(v)}`
}
