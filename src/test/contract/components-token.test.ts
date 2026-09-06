/**
 * weifuwu/client/components token 消费哨兵（LAYOUT-PLAN C2）——C1（px 分类）之后的第二防线
 *
 * 背景（探针实证 2027-xx）：C1 四桶后组件 px 面全 token 化——但探针揭示新三宗：
 *   ① line-height 近值未接线：手写 62 处——1.5×6 = `--wf-line-height`（1.5）恒等 ·
 *      1.25×2 = `--wf-line-height-tight`（1.25）恒等——值=token 却手写（近值面）；
 *      1.6×10 代码排版（CodeBlock/DiffView 同义——2 消费者 <3 升档门）· 1.3/1.4/1.2 档位空洞
 *   ② 弹层钩子失效：Popover max-width: 320px · Tooltip max-width: 240px 手写覆盖
 *      `.wf-popup` 基类钩子（min(var(--wf-popup-max, 480px), calc(100vw - 32px))——_popup.css）
 *      ——--wf-popup-max 调不动这两个组件（钩子名存实亡）
 *   ③ token 零消费 86/208：色板深档/暗色档/布局档保留（映射层消费）· bp-* 消费形态是
 *      媒体查询推导（非 var()）不算死 · 真死候选（--wf-letter-spacing-wide 等）W3 定案
 *
 * 哨兵纪律（同 C1/L11）：桶 ⊆ 登记（未登记红）· 登记 ⊆ 桶（幽灵红）· 理由非空。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'

const root = join(import.meta.dirname, '..', '..', '..')
const COMPONENTS = join(root, 'src/client/components')
const TOKENS = (readFileSync(join(root, 'src/client/layout/_tokens.css'), 'utf-8') +
  readFileSync(join(root, 'src/client/layout/_props.css'), 'utf-8')).replace(/\/\*[\s\S]*?\*\//g, '')
const WL = JSON.parse(readFileSync(join(root, 'scripts/components-token-whitelist.json'), 'utf-8'))

/** line-height token 档位（从 _tokens.css 解析——单源） */
const LH_TOKEN_VALUES = new Map(
  [...TOKENS.matchAll(/--wf-line-height(?:-[\w-]+)?:\s*([\d.]+)\s*;/g)].map((m) => [m[1], null]),
)
/** usePopup 家族（portal 自动附加 .wf-popup——max-width 手写 = 基类钩子失效面） */
const POPUP_FAMILY = ['Popover', 'Tooltip']  // 保留（文档语义——usePopup 系面板钩子面）

function classify() {
  const lineHeight = new Map<string, string>()
  const popupWidth = new Map<string, string>()
  const consume = new Map<string, number>()
  const walk = (p: string) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const fp = join(p, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(fp); continue }
      if (!e.name.endsWith('.css')) continue
      const name = fp.slice(COMPONENTS.length + 1)
      const css = readFileSync(fp, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of css.matchAll(/var\(--wf-[\w-]+/g)) consume.set(m[0].slice(4), (consume.get(m[0].slice(4)) || 0) + 1)
      postcss.parse(css).walkDecls((d: any) => {
        const prop = d.prop as string
        const val = String(d.value).trim()
        // ① line-height：手写（无 var）数值——豁免面 {1, 0, Npx}（重置/图标/结构）
        if (prop === 'line-height' && !val.includes('var(') && !/^(1|0|\d+(?:\.\d+)?px)$/.test(val)) {
          lineHeight.set(`${name}#${val}`, `${name} line-height: ${val}`)
        }
        // ② 弹层宽：usePopup 家族组件的 max-width/width 含 px（基数 = .wf-popup 基类
        //    钩子失效面——手写覆盖 min(var(--wf-popup-max,…), calc(100vw - 32px))）
        // ② 弹层面板宽：max-width/width 含 px 且 ≥100（面板级——14-28px 图标/标记宽属
        //    结构面 C1 管）· var()/calc() 豁免（钩子已接/派生面）· %/vw/em 相对值豁免（自适应）
        if ((prop === 'max-width' || prop === 'width') && /\d(?:\.\d+)?px/.test(val) &&
            !/var\(|calc\(/.test(val) && parseInt(val.match(/\d+/) || ['0']) >= 100) {
          popupWidth.set(`${name}#${prop}#${val.slice(0, 40)}`, `${name} ${prop}: ${val.slice(0, 60)}`)
        }
      })
    }
  }
  walk(COMPONENTS)
  return { lineHeight, popupWidth, consume }
}

test('C2 token 消费哨兵（line-height 近值/弹层钩子/零消费三桶登记制）', () => {
  const { lineHeight, popupWidth, consume } = classify()
  const tokensDefined = new Set([...TOKENS.matchAll(/--wf-[\w-]+/g)].map((m) => m[0]))
  // 零消费 token（定义的 token 中组件 0 引用）
  const zero = [...tokensDefined].filter((t) => !consume.has(t)).sort()
  const zeroMap = new Map(zero.map((t) => [t, `token ${t}：组件 0 引用`]))

  const buckets: [string, Map<string, string>, Record<string, { reason?: string }>][] = [
    ['line-height 手写', lineHeight, WL.lineHeight],
    ['弹层宽字面量（钩子失效面）', popupWidth, WL.popupWidth],
    ['token 零消费', zeroMap, WL.zeroConsume],
  ]
  for (const [label, actual, registered] of buckets) {
    const unregistered = [...actual.keys()].filter((k) => !(k in registered))
    assert.equal(
      unregistered.length, 0,
      `${label}：新增形态未登记（接线或登记+理由）:\n  ${unregistered.map((k) => `${k} — ${actual.get(k)}`).slice(0, 8).join('\n  ')}`,
    )
    const stale = Object.keys(registered).filter((k) => !actual.has(k))
    assert.equal(stale.length, 0, `${label}：登记项已不存在（处理完请移出登记）: ${stale.slice(0, 8).join(' ')}`)
    const noReason = Object.entries(registered).filter(([, v]) => !v.reason)
    assert.equal(noReason.length, 0, `${label}：登记项缺理由: ${noReason.map(([k]) => k).slice(0, 8).join(' ')}`)
  }
  console.log(`  ⓘ C2 基线：line-height 手写 ${lineHeight.size} · 弹层宽 ${popupWidth.size} · 零消费 ${zero.length}`)
})
