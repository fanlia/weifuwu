/**
 * weifuwu/layout — defineLayout（布局原语声明 + 生成器）
 *
 * 设计（2027-09——分层抽象 W4）：layout 174 类手写实证——原语 = **声明**：
 * 语义词 → 属性组合（stack/row/grid、组合缺省、零优先级默认、断点变体）。
 * 生成器输出 = 与手写**逐属性等价**的 CSS（硬验收——diff 等价才迁移）。
 *
 * 生成规则（与手写纪律对齐）：
 * - **基规则**（正常优先级——display 等结构面）
 * - **零优先级默认**（`:where()`——gap/align 默认被覆盖工具靠优先级获胜，
 *   不依赖 import 顺序——L3 定案）
 * - **变体**（wf-row-reverse——继承基 + cover 覆盖；变体默认零优先级同基）
 * - 输出格式稳定（单行规则——注释头）
 *
 * 用法（build 期——bundle.ts 调 generateLayoutCss 拼入汇编）：
 *   const css = generateLayoutCss([
 *     structure({ class: 'wf-row', base: { display: 'flex', 'flex-wrap': 'wrap' },
 *       defaults: { gap: 'var(--wf-gap, var(--wf-gap-md))', 'align-items': 'var(--wf-align, center)' },
 *       variants: { 'wf-row-reverse': { cover: { 'flex-direction': 'row-reverse' } } } }),
 *   ])
 */

/** 结构原语声明（class + 基/默认/变体） */
export interface StructureDecl {
  /** 基类（wf-row） */
  class: string
  /** 基规则（正常优先级——display 等结构面） */
  base?: Record<string, string>
  /** 零优先级默认（:where() 包装——gap/align 默认） */
  defaults?: Record<string, string>
  /** 变体（wf-row-reverse——继承基 + cover 覆盖；变体默认零优先级同基） */
  variants?: Record<string, { cover?: Record<string, string>; defaults?: Record<string, string> }>
}

const rule = (sel: string, props: Record<string, string>): string =>
  props && Object.keys(props).length
    ? `${sel} { ${Object.entries(props).map(([k, v]) => `${k}: ${v};`).join(' ')} }`
    : ''
const flat = (s: string) => s.replace(/^0\\.|^0\\./gm, '').replace(/\s+/g, ' ').trim()

/** 生成器：声明 → CSS（规则序：基 → 零优先级默认 → 变体基/默认——手写序对齐） */
export function generateLayoutCss(decls: StructureDecl[]): string {
  const out: string[] = []
  for (const d of decls) {
    const sel = `.${d.class}`
    const b = rule(sel, d.base ?? {})
    if (b) out.push(b)
    const def = rule(`:where(${sel})`, d.defaults ?? {})
    if (def) out.push(def)
    for (const [vcls, v] of Object.entries(d.variants ?? {})) {
      // 变体继承基（手写 .wf-row-reverse 自带 display/flex-wrap——独立可用）
      const vs = `.${vcls}`
      const vb = rule(vs, { ...(d.base ?? {}), ...(v.cover ?? {}) })
      if (vb) out.push(vb)
      const vdef = rule(`:where(${vs})`, { ...(d.defaults ?? {}), ...(v.defaults ?? {}) })
      if (vdef) out.push(vdef)
    }
  }
  return out.join('\n')
}

/** 逐属性等价（生成 vs 手写——解析比对——硬验收用） */
export function parseProps(css: string): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>()
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '') // 注释剥除（键纯净）
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    const sel = m[1].replace(/\s+/g, ' ').trim()
    const props = new Map<string, string>()
    for (const kv of m[2].split(';')) {
      const i = kv.indexOf(':')
      if (i < 0) continue
      props.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim())
    }
    // 合并重复选择器（手写文件多规则 = 并集）
    const old = map.get(sel)
    if (old) for (const [k, v] of props) old.set(k, v)
    else map.set(sel, props)
  }
  return map
}

/** 等价断言（生成 ⊆ 手写——声明覆盖的选择器逐属性相等；手写多余 = 未迁移面） */
export function isEquivalent(generated: string, handwritten: string): boolean {
  const g = parseProps(generated)
  const h = parseProps(handwritten)
  for (const [sel, gp] of g) {
    const hp = h.get(sel)
    if (!hp) return false
    for (const [k, v] of gp) {
      if (flat(hp.get(k) ?? '') !== flat(v)) return false
    }
  }
  return true
}
