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
 * ④ i18n 裸文案（C4——有机制面组件接线补漏——裸字面量 = 红；
 *    文件级登记：C4_I18N_PENDING 待修（W1 清）· C4_I18N_EXEMPT 无机制面
 *    （fallback 默认 = 设计——locale 包面随下一阶段））
 * ⑤ CSS 死类（C4——css 定义类全库词干无生成者 = 红；登记表
 *    components-dead-class-whitelist.json——W2 清 0 · 动态拼接豁免内联）
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
  'Modal content', // onClick = stopPropagation 防冒泡（内容区点击不触发遮罩关闭）——拦截语义非交互
  'Drawer panel', // 同 Modal content——stopPropagation 拦截语义
  'VirtualTable sort-icon', // 排序图标——父 th 有 role=button+tabIndex+onKeyDown（134）——图标仅鼠标便捷
  'SlideCanvas shape', // 画布指针选择面——键盘等价在 shape-edit（onKeyDown 311）
  'Editor table-grid cell', // 表格单元格指针选择——键盘面随表格编辑波次（诚实裁剪）
  'Wave wave', // 波纹点击=装饰反馈（无功能语义——非交互——波纹动画源）
]

/** ① 待修登记（W2 波次——修后移出；新增同类 = 红——登记制同 C1/C2） */
const A11Y_PENDING = {} // W2 完成——Modal 豁免（拦截语义）· Popconfirm/StatCard/Tooltip 已修（role/键盘/焦点面）

/** ④ i18n 裸文案——文件级待修登记（W1 清 0；修后移出） */
const C4_I18N_PENDING = [] // W1 完成——ThemeSwitch(5)/Editor(title·aria 4)/AppShell(2) 已接线
// Editor commit label（'输入'）数据层豁免——pushCommit 持久标签（跨渲染/跨实例）非纯 UI 文案
// （渲染转译需 tag→key 映射——locale 包面就位 + commit 消费方明确时推翻——C4-I18N-D3）
/** ④ i18n 裸文案——无机制面豁免（中文 fallback = 设计；locale 包面随下一阶段） */
const C4_I18N_EXEMPT = [
  'AiChat', 'ApprovalCard', 'CodeBlock', 'PromptTemplate', 'SessionList',
  'SheetGrid', 'SlideCanvas', 'ChatInput', // ChatInput 有 labels prop 覆盖面（设计即 i18n）
]

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
  // 括号平衡扫描（模板字符串 ${...} 的 } 不截断——onClick 出现在类名条件里不误报）
  for (const m of s.matchAll(/h\(['"](div|span|a)['"],\s*\{/g)) {
    const start = m.index + m[0].length // { 之后一位（body 不含开括号）
    let depth = 1, i = start
    for (; i < s.length && depth > 0; i++) {
      if (s[i] === '{') depth++
      else if (s[i] === '}') depth--
    }
    const body = s.slice(start, i - 1)
    // 事件面判定：onClick/Xxx 作为 prop 键（非模板字符串内引用）
    const hasClick = /on(Click|PointerDown)['"]?\s*:/.test(body)
    if (!hasClick) continue
    if (/role['"]?\s*:|tabIndex['"]?\s*:|onKeyDown['"]?\s*:|onFocusIn['"]?\s*:|onFocusOut['"]?\s*:|href['"]?\s*:/.test(body)) continue
    a11yIssues++
    const hint = `${name}: h('${m[1]}', {${body.trim().slice(0, 50)}`
    if (A11Y_EXEMPT.some((e) => name.startsWith(e.split(' ')[0]) && body.includes(e.split(' ')[1]))) continue
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

// svg 可访问性（C3-svg——role/aria-hidden/aria-label 至少其一；登记表 W2 清）
const SVG_PENDING = JSON.parse(readFileSync(join(root, 'scripts/components-svg-whitelist.json'), 'utf8'))
let svgBare = 0
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  const name = f.slice(COMPONENTS.length + 1)
  for (const m of s.matchAll(/h\(['"]svg['"],\s*\{/g)) {
    const start = m.index + m[0].length - 1
    let depth = 1, i = start
    for (; i < s.length && depth > 0; i++) {
      if (s[i] === '{') depth++
      else if (s[i] === '}') depth--
    }
    const body = s.slice(start, i - 1)
    if (/role['"]?\s*:|aria-?hidden['"]?\s*:|aria-?label['"]?\s*:/.test(body)) continue
    svgBare++
    if (SVG_PENDING[name]) continue // 登记在册（W2 清）
    fail(`svg 无 aria ${name}——补 role/img 或 aria-hidden（装饰面）或登记待修`)
  }
}
console.log(`  svg 线：${svgBare} 处（登记表 ${Object.keys(SVG_PENDING).length} 文件）`)

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

// ── ④ i18n 裸文案（C4-① —— 剥注释 · children/文案属性面 · 上下文接线信号）──
console.log('C4-① i18n 裸文案（中文用户可见文案无接线信号——fallback 形态豁免）:')
const I18N_ATTR = /(placeholder|title|aria-?label|label|empty|emptyText|text|content|description|alt|okText|cancelText|closeText|tip|hint|prefix|suffix|loading)\s*:\s*['"`]([^'"`]*[\u4e00-\u9fa5][^'"`]*)['"`]/g
const I18N_CHILD = /\],\s*['"`]([^'"`]*[\u4e00-\u9fa5][^'"`]*)['"`]/g
const WIRED = /\?\?|editorText|SL\.|ML\.|L\[|labels|\.t\(|i18n|getText|fmt\(/
let i18nBare = 0
for (const f of files) {
  const name = f.slice(COMPONENTS.length + 1)
  let s = readFileSync(f, 'utf8')
  s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  let m
  while ((m = I18N_ATTR.exec(s)) || (m = I18N_CHILD.exec(s))) {
    if (m[2]) { // 属性面命中（child 场复用捕获组）
      const ctx = s.slice(Math.max(0, m.index - 60), m.index)
      if (WIRED.test(ctx)) continue
      // 定义表/数据层豁免：① id:/value: 配对 label（定义表 fallback——消费处已接线）
      //   ② pushCommit/editEmit/tag:（Editor 持久标签/数据事件——非纯 UI 文案——C4-I18N-D3）
      if (/(?:id|value): '[\w-]+',\s*label:|pushCommit|editEmit|tag:/.test(ctx + m[0].slice(0, 24))) continue
      i18nBare++
      const [fileBase] = name.split('/')
      if (C4_I18N_PENDING.includes(fileBase) || C4_I18N_EXEMPT.includes(fileBase)) continue
      fail(`i18n 裸文案 ${name}:${m[1]}:'${m[2].slice(0, 12)}'——接机制（editorText/SL./labels）或登记豁免`)
    }
  }
}
console.log(`  ${i18nBare} 处（待修 ${C4_I18N_PENDING.length} 文件 · 豁免 ${C4_I18N_EXEMPT.length} 组件——W1 清）`)

// ── ⑤ CSS 死类（C4-② —— 全库词干生成者检测——登记表防回潮）──
console.log('C4-② CSS 死类（css 定义类全库词干无生成者——动态拼接豁免 wf-hl-*/wf-md-*）:')
const deadWhitelist = JSON.parse(readFileSync(join(root, 'scripts/components-dead-class-whitelist.json'), 'utf8'))
const DYNAMIC_CLASS = [/^wf-hl-/, /^wf-md-h\d+$/, /^wf-md-(ol|ul)$/]
const allTsText = files.map((f) => readFileSync(f, 'utf8'))
let deadCount = 0
for (const f of files) {
  const css = f.replace(/\.tsx?$/, '.css')
  let c
  try { c = readFileSync(css, 'utf8') } catch { continue }
  const name = f.slice(COMPONENTS.length + 1)
  for (const n of new Set([...c.matchAll(/\.(wf-[\w-]+)\b/g)].map((m) => m[1]))) {
    if (DYNAMIC_CLASS.some((re) => re.test(n))) continue
    const stem = n.split('--')[0]
    if (allTsText.some((t) => t.includes(stem))) continue
    if ((deadWhitelist[name] || []).includes(n)) continue // 登记在册（W2 清）
    deadCount++
    fail(`CSS 死类 ${name}: ${n}（css 定义无生成者——新增 = 红线）`)
  }
}
console.log(`  ${deadCount} 处（登记表 ${Object.values(deadWhitelist).reduce((a, v) => a + v.length, 0)} 处——W2 清）`)

// ── ⑥ 文件头注释（C5-① —— 组件文件头 = registry desc 单源派生——防漂移）──
console.log('C5-① 文件头注释（组件文件无头注释 = 红——banner 登记表 W1 清）:')
const bannerWhitelist = JSON.parse(readFileSync(join(root, 'scripts/components-banner-whitelist.json'), 'utf8'))
// registry desc 单源（id/name/desc 三列——跨行提取）
const descOf = new Map()
{
  const txt = readFileSync(join(root, 'apps/showcase/src/registry/components.ts'), 'utf8')
  for (const m of txt.matchAll(/"id": "([\w-]+)",[\s\S]{0,260}?"name": "([A-Za-z0-9]+)",[\s\S]{0,260}?"desc": "([^"]+)"/g)) {
    descOf.set(m[2], { desc: m[3], id: m[1] })
  }
}
let bannerBare = 0
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  if (!/export const \w+:\s*Component/.test(s)) continue
  const name = f.slice(COMPONENTS.length + 1)
  const firstLine = s.trim().split('\n')[0]
  // banner 首行单源：/** <Name>：<desc>（showcase /components/<id>） */
  if (/^\/\*\* [A-Za-z0-9]+：.+（showcase \/components\/[\w-]+） \*\/$/.test(firstLine)) continue
  bannerBare++
  if (bannerWhitelist.includes(name)) continue // 登记在册（W1 清）
  fail(`文件头注释缺失 ${name}——补 /\*\* <Name>：<desc>（showcase /components/<id>）\*\/（desc 单源 registry）或登记`)
}
console.log(`  ${bannerBare} 处（登记表 ${bannerWhitelist.length}——W1 清 · registry desc 面 ${descOf.size}）`)

// ── ⑦ props 类型注解 any（C6-① —— 组件 props 接口内 any = 红——VNodeChild 单源化 W1）──
console.log('C6-① props `?: any`（组件 props 接口类型注解——VNodeChild 单源化）:')
const anyPropsWhitelist = JSON.parse(readFileSync(join(root, 'scripts/components-anyprops-whitelist.json'), 'utf8'))
let anyProps = 0
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  const name = f.slice(COMPONENTS.length + 1)
  for (const m of s.matchAll(/([a-zA-Z]+)\??\s*:\s*any(\[\])?\s*[,;\n\}]/g)) {
    anyProps++
    const key = `${m[1]}${m[2] ?? ''}`
    if ((anyPropsWhitelist[name] || []).includes(key)) continue // 登记在册（W1 清）
    fail(`props any 注解 ${name}: ${key}——VNodeChild 单源化（children/title/icon/content 家族）或登记`)
  }
}
console.log(`  ${anyProps} 处（登记表 ${Object.values(anyPropsWhitelist).reduce((a, v) => a + v.length, 0)}——数据面登记）`)
  // 反向：登记键已不存在（幽灵——清后未移出）
  const actualKeys = new Set()
  for (const f of files) {
    const s = readFileSync(f, 'utf8')
    const name = f.slice(COMPONENTS.length + 1)
    for (const m of s.matchAll(/([a-zA-Z]+)\??\s*:\s*any(\[\])?\s*[,;\n\}]/g)) actualKeys.add(`${name}#${m[1]}${m[2] ?? ''}`)
  }
  const stale = Object.entries(anyPropsWhitelist).flatMap(([n, ks]) => ks.filter((k) => !actualKeys.has(`${n}#${k}`)).map((k) => `${n}:${k}`))
  if (stale.length) fail(`C6 幽灵登记（已清未移出）: ${stale.slice(0, 5).join(' ')}`)

if (failures) { console.error(`\nC3/C4/C5/C6 健康审计：${failures} 违例`); process.exit(1) }
console.log('\nC3/C4/C5/C6 健康审计：全绿')
