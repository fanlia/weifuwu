#!/usr/bin/env node
/**
 * weifuwu/components 健康审计（LAYOUT-PLAN C3——组件健康度体检三线）
 *
 * ① a11y 静态违规：`h('div'/'span'/'a', { onClick })` 无键盘语义
 *    （role/tabIndex/onKeyDown/href）——div 冒充按钮 = 可达性违规。
 *    豁免登记：遮罩类（ActionSheet/Drawer/Modal overlay——usePopup Esc
 *    关闭 = 键盘等价路径——onClick 仅为鼠标快捷面）。
 *    图标哑按钮（button 无文本无 aria-label）同线检测——0 基线。
 * ② as any 基线（组件面——平台 audit:any 同款机制：只降不升——34 基线）
 * ③ JS 体积 + tree-shake 防回退（app.js 产物——22 重组件特征探针；
 *    4 真使用登记——新增残留特征 = 红——tree-shake 失效防线）
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const COMPONENTS = join(root, 'src/client/components')

const walk = (p, ext, out = []) => {
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const fp = join(p, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(fp, ext, out) }
    else if ((Array.isArray(ext) ? ext.some((x) => e.name.endsWith(x)) : e.name.endsWith(ext))) out.push(fp)
  }
  return out
}

/** ① a11y 违规模板（h('div',{onClick}) 无键盘语义）——豁免：遮罩类 */
const A11Y_EXEMPT = [
  'ActionSheet overlay', 'Drawer overlay', 'Modal overlay', // usePopup Esc 等价——onClick 便捷面
  'HoverCard wrap', // 悬停展开区（hover-only——键盘入口经 trigger 子元素）
]

/** ① 待修登记（W2 波次——修后移出；新增同类 = 红——登记制同 C1/C2） */
const A11Y_PENDING = {
  'Modal/Modal.ts': 'wf-modal-content 的 onClick（内容区点击关闭）——W2 修为 role/tabIndex/onKeyDown 或改原生语义——豁免审核',
  'Popconfirm/Popconfirm.ts': 'wf-popconfirm-wrap span onClick——W2 修为原生 button 或补键盘语义',
  'StatCard/StatCard.ts': 'wf-stat--clickable div onClick——W2 接 Card clickable 模式（role+键盘）——改错即红',
  'Tooltip/Tooltip.ts': 'wf-tooltip-wrap 缺键盘显示面（aria-haspopup 已有——W2 补 onFocus/onBlur——键盘可达性）',
}

/** ③ tree-shake 探针：已知真使用（平台源码 import 验证）——其余出现 = 残留 */
const JS_USED = {
  Chart: 'Reports/Dashboard 真使用', Timeline: 'AgentDetail/LogsSection 真使用',
  SortableList: '平台真使用', Slider: '平台真使用',
}
const JS_PROBES = {
  Editor: 'editor-placeholder|wf-editor', Markdown: 'wf-md-|markdown-body', DatePicker: 'datepicker',
  Kanban: 'kanban', Chart: 'wf-chart|Chart', VideoPlayer: 'video-player', WordCloud: 'wordcloud',
  Transfer: 'wf-transfer', Timeline: 'wf-timeline', SortableList: 'sortable', JsonSchemaForm: 'json-schema',
  QrCode: 'qr-code', ImageCropper: 'cropper', ColorPicker: 'color-picker', Carousel: 'carousel',
  Cascader: 'cascader', Slider: 'wf-slider|Slider', Mentions: 'wf-mentions', PinInput: 'pin-input',
  ExportCSV: 'export-csv', ReasoningBlock: 'reasoning', Sparkline: 'sparkline',
}

let failures = 0
const fail = (msg) => { failures++; console.error(`  ✖ ${msg}`) }

// ── ① a11y 线 ────────────────────────────────────────────
console.log('C3-① a11y 静态违规（div/span/a onClick 无键盘语义）:')
let a11yIssues = 0
const files = walk(COMPONENTS, ['.ts', '.tsx']).filter((f) => !f.endsWith('.test.ts'))
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  const name = f.slice(COMPONENTS.length + 1)
  for (const m of s.matchAll(/h\(['"](div|span|a)['"],\s*\{([^}]*onClick[^}]*)\}/g)) {
    const body = m[2]
    if (/role|tabIndex|onKeyDown|href/.test(body)) continue
    a11yIssues++
    const hint = `${name}: h('${m[1]}', {${body.trim().slice(0, 50)}`
    if (A11Y_EXEMPT.some((e) => name.startsWith(e.split(' ')[0]) && /overlay|wrap/.test(body))) continue
    if (A11Y_PENDING[name]) continue // 待修登记（W2 波次——修后移出）
    fail(`a11y 违规 ${hint.slice(0, 60)}...——补 role/tabIndex/onKeyDown 或登记待修`)
  }
}
console.log(`  ${a11yIssues} 处（豁免遮罩类——usePopup Esc 等价）`)

// 图标哑按钮（button 无文本无 aria-label）——0 基线
let iconDumb = 0
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/Button\(\{([^}]{0,200})\}\)/g)) {
    const body = m[1]
    if (!/children|'[^']*[\u4e00-\u9fa5A-Za-z][^']*'|>/.test(body) && !/aria-label|title=/.test(body)) iconDumb++
  }
}
if (iconDumb) fail(`图标哑按钮 ${iconDumb} 处（button 无文本无 aria-label）`)

// ── ② as any 基线 ────────────────────────────────────────
const ANY_BASE = 34
let anyCount = 0
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  anyCount += (s.match(/\bas any\b/g) || []).length
}
if (anyCount > ANY_BASE) fail(`as any ${anyCount} > 基线 ${ANY_BASE}（只降不升——组件面）`)
console.log(`C3-② as any：${anyCount}（基线 ${ANY_BASE}——只降不升）`)

// ── ③ JS 体积 + tree-shake ───────────────────────────────
const appJs = join(root, 'apps/agent-platform/dist/app.js')
if (existsSync(appJs)) {
  const size = statSync(appJs).size
  const JS_BASE = 511 * 1024
  if (size > JS_BASE * 1.05) fail(`app.js ${(size / 1024).toFixed(0)}KB > 基线 ${JS_BASE / 1024}KB（+5% 容差）`)
  const b = readFileSync(appJs, 'utf8')
  let residual = []
  for (const [c, p] of Object.entries(JS_PROBES)) {
    if (JS_USED[c]) continue
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    if (re.test(b)) residual.push(c)
  }
  if (residual.length) fail(`tree-shake 残留特征：${residual.join(' ')}（未使用组件未被剔除）`)
  console.log(`C3-③ app.js ${(size / 1024).toFixed(0)}KB（基线 511KB+5%）· tree-shake 残留 ${residual.length}（登记真使用 4）`)
} else {
  console.log('C3-③ app.js 产物不存在（跳过——audit:all 中位于 bundle 线后）')
}

if (failures) { console.error(`\nC3 健康审计：${failures} 违例`); process.exit(1) }
console.log('\nC3 健康审计：全绿')
