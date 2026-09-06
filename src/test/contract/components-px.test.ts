/**
 * weifuwu/client/components px 分类登记制（LAYOUT-PLAN C1）——对标 layout L14 的组件面防线
 *
 * 背景（探针实证 2027-xx）：组件 CSS 133 文件 · var(--wf-*) 引用 3343 次 · 硬编码色 0 ·
 * !important 0——token 化基础已高，但残留三宗手写：
 *   ① 发丝半 token：`border: 1px solid var(--wf-color-border)`——色走 token、宽仍字面量
 *      （`--wf-border-width: 1px` 早已存在；layout 侧 .wf-card-outline 已 token 化）59 形态
 *   ② 标尺档手写：padding/margin/gap = 4/8/12/16/24/32px（base 标尺值恒等）42 形态
 *      ——compact 预设（间距缩一档）对手写组件不生效（Button 已 token 化 → 缩放跟随 36→32）
 *   ③ 结构值：组件域魔数/var 回退混合（492 形态）——不 token 化（标尺爆炸），登记制
 *
 * 哨兵纪律（同 L2/L8/L14 登记制）：实际桶 ⊆ 登记集（新增形态即红）·
 * 登记集 ⊆ 实际桶（已处理未移出 = 幽灵登记红）· 每项必须有理由。
 * W1/W2 每 token 化一处即从登记移出——迁移路径可追踪。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'

const root = join(import.meta.dirname, '..', '..', '..')
const COMPONENTS = join(root, 'src/client/components')
const WL = JSON.parse(readFileSync(join(root, 'scripts/components-px-whitelist.json'), 'utf-8'))

/** 标尺档位（base 值——与 _tokens.css space/gap 标尺全等；4=space-xs · 8=space-sm ·
 *  12=space(裸)/gap-md · 16=space-md · 24=space-lg · 32=space-xl） */
const SCALE_STEPS = new Set(['4', '8', '12', '16', '24', '32'])
const SCALE_PROPS = new Set([
  'padding', 'margin', 'gap', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
])

/** 剥 var() 表达式（含嵌套）——回退值面豁免 */
function stripVars(v: string): string {
  let out = v, i
  while ((i = out.indexOf('var(')) !== -1) {
    let depth = 0, j = i + 3
    for (; j < out.length; j++) {
      if (out[j] === '(') depth++
      else if (out[j] === ')') { depth--; if (depth === 0) break }
    }
    out = out.slice(0, i) + out.slice(j + 1)
  }
  return out
}

/** 三桶分类（与 W0 基线生成器同构——本文件即逻辑单源） */
function classify(): { hairline: Map<string, string>; scale: Map<string, string>; structural: Map<string, string>; zIndex: Map<string, string> } {
  const hairline = new Map<string, string>()
  const scale = new Map<string, string>()
  const structural = new Map<string, string>()
  const zIndex = new Map<string, string>()
  const walk = (p: string) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const fp = join(p, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(fp); continue }
      if (!e.name.endsWith('.css')) continue
      const name = fp.slice(COMPONENTS.length + 1)
      const css = readFileSync(fp, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')
      postcss.parse(css).walkDecls((d: any) => {
        const prop = d.prop as string
        const val = String(d.value).trim()
        // ① 发丝：border* 宽 = **1px**（--wf-border-width 等价面）+ 样式 solid/dashed
        //    （色可走 var/currentColor/transparent——hex 硬编码面已锁 0；宽才是本面）
        //    （非 1px 宽度 = 强调边框——无 token 面，落结构桶登记：判负：--wf-border-width 只有 1px 发丝档）
        const hair = val.match(/^(\d+(?:\.\d+)?)px\s+(?:solid|dashed)\s+/)
        if (hair && hair[1] === '1' && /^border/.test(prop) && !/^var\(--wf-border-width\)/.test(val)) {
          hairline.set(`${name}#${prop}#1px`, `${name} ${prop}: ${val.slice(0, 60)}`)
          return
        }
        // 派生面豁免（L13 同款）：含 calc/env/min/max/clamp 的声明是表达式值——
        //   一个字面量面之外的派生面（如 calc(var(--wf-space) - 1px) / env(safe-area)）——
        //   标尺桶与结构桶都不抓（作者手写的不是最终值）
        if (/\b(?:calc|env|min|max|clamp)\(/.test(val)) return
        // 零值形态豁免：0px ≡ 0——零值语义非标尺非魔数（覆盖默认的常见强写——L5d 零值同款）
        const pxsAll = [...val.matchAll(/\b(\d+(?:\.\d+)?)px\b/g)].map((m) => m[1])
        if (pxsAll.length && pxsAll.every((p) => p === '0')) return
        // ② 标尺档：px 值全在标尺档内（纯字面量或多值缩写如 4px 8px；**含 var 的混合声明**
        //    也应标尺化——px 部分在档位即不完整标准化（W3 半标尺面；已 token 的面 pxs=0 天然豁免）
        const pxs = [...val.matchAll(/\b(\d+(?:\.\d+)?)px\b/g)].map((m) => m[1])
        if (pxs.length && SCALE_PROPS.has(prop) && pxs.every((p) => SCALE_STEPS.has(p))) {
          scale.set(`${name}#${prop}#${[...new Set(pxs)].join('/')}px`, `${name} ${prop}: ${val.slice(0, 60)}`)
          return
        }
        // ③ 结构值：剥 var 后仍有 px（var 回退面豁免——剥后无 px）
        const rest = stripVars(val).match(/\b(\d+(?:\.\d+)?)px\b/)
        if (rest) structural.set(`${name}#${prop}#${rest[1]}px`, `${name} ${prop}: ${val.slice(0, 60)}`)
        // ④ z-index：无单位数值面（px 哨兵盲区——W0 探针发现 z-index: 1 ×8）
        //    ——「同层 DOM 顺序裁决」惯用，非 z 标尺档（--wf-z-popover 等弹层档才属）
        if (prop === 'z-index' && /^\d+$/.test(val)) zIndex.set(`${name}#${val}`, `${name} z-index: ${val}`)
      })
    }
  }
  walk(COMPONENTS)
  return { hairline, scale, structural, zIndex }
}

test('C1 组件 px 分类登记制（发丝/标尺必须 token 化 · 结构值登记 + 理由）', () => {
  const { hairline, scale, structural, zIndex } = classify()
  const buckets: [string, Map<string, string>, Record<string, { reason?: string }>][] = [
    ['发丝半 token', hairline, WL.hairline],
    ['标尺档手写', scale, WL.scale],
    ['结构值', structural, WL.structural],
    ['z-index 字面量', zIndex, WL.zIndex],
  ]
  for (const [label, actual, registered] of buckets) {
    // 实际 ⊆ 登记（新增形态即红——必须 token 化或登记理由）
    const unregistered = [...actual.keys()].filter((k) => !(k in registered))
    assert.equal(
      unregistered.length, 0,
      `${label}：新增形态未登记（token 化或登记+理由）:\n  ${unregistered.map((k) => `${k} — ${actual.get(k)}`).slice(0, 10).join('\n  ')}`,
    )
    // 登记 ⊆ 实际（已处理未移出 = 幽灵登记——迁移路径必须同步）
    const stale = Object.keys(registered).filter((k) => !actual.has(k))
    assert.equal(stale.length, 0, `${label}：登记项已不存在（处理完请移出登记）: ${stale.slice(0, 10).join(' ')}`)
    // 每项必须有理由
    const noReason = Object.entries(registered).filter(([, v]) => !v.reason)
    assert.equal(noReason.length, 0, `${label}：登记项缺理由: ${noReason.map(([k]) => k).slice(0, 8).join(' ')}`)
  }
  // 基线锚（波次进展可见——W1: 发丝 → 0 · W2: 标尺 → 0；只降不升）
  console.log(`  ⓘ C1 基线：发丝 ${hairline.size} · 标尺 ${scale.size} · 结构 ${structural.size} · z-index ${zIndex.size}`)
})
