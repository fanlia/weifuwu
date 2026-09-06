#!/usr/bin/env node
/**
 * weifuwu/layout 参考文档生成器（LAYOUT-PLAN W5）
 *
 * 单源：inventory()（类清单/计数）+ _props.css（@property 钩子）+ _tokens.css/
 * _presets.css（标尺/断点）+ bundle.ts（层序）。产物 docs/layout.md = 官方参考面——
 * 取代历史悬空的三份设计文档引用（design 目录不存在——单源收拢到 docs）。
 *
 * 用法：
 *   node scripts/layout-reference.mjs          # 生成/覆盖 docs/layout.md（幂等）
 *   node scripts/layout-reference.mjs --check  # 校验最新（漂移即 exit 1——契约 L15 调用）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inventory, LIB_SURFACE_KEEP } from './layout-inventory.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LAYOUT = join(root, 'src/client/layout')
const OUT = join(root, 'docs/layout.md')

/** 从 CSS 提取声明摘要（props + 冲突值 + 断点/修饰）——解析逻辑与 inventory 同构 */
function buildReference() {
  const inv = inventory()
  const L = []
  L.push('# weifuwu/layout 参考')
  L.push('')
  L.push('> **机器生成**（`scripts/layout-reference.mjs`）——勿手改：改布局源码后跑 `node scripts/layout-reference.mjs`。')
  L.push('> 单源校对：类清单 = `layout-inventory.mjs inventory()` · 层序 = `bundle.ts LAYER_ORDER` ·')
  L.push('> 钩子 = `_props.css @property` · 标尺/断点 = `_tokens.css`。计数口径与 README/`docs/client.md` 全等（L6 哨兵）。')
  L.push('')
  L.push('## 1. 层叠与覆盖规则（L9 机制锁定）')
  L.push('')
  L.push(`- **层序**：@layer \`${LAYER_ORDER.join(', ')}\`——工具类在 components 之后 = 消费侧显式覆盖恒胜组件样式（旧序相反——W2 修正）`)
  L.push('- **display 族基类**（wf-block/wf-flex/wf-hidden）`:where()` 零优先级——断点变体（@sm/@lg）正常优先级 → 变体恒胜基类（跨文件亦然）')
  L.push('- **`!important` 白名单**：仅 `prefers-reduced-motion`（无障碍强制）——其余位置禁（变体靠 specificity 胜出）')
  L.push('- **变量钩子**：`@property inherits:false`（W2）——外层内联赋值不污染子孙原语；syntax `*` 且不写 initial-value（保各原语不同回退值）')
  L.push('')
  L.push('## 2. 断点（`--wf-bp-*` = 媒体查询白名单单源——L10）')
  L.push('')
  L.push('| 档 | 值 | 合法媒体查询字面量 |')
  L.push('| --- | --- | --- |')
  const bpCss = readFileSync(join(LAYOUT, '_tokens.css'), 'utf-8')
  for (const m of bpCss.matchAll(/--wf-bp-([a-z0-9]+):\s*([\d.]+)px/g)) {
    const v = parseFloat(m[2])
    L.push(`| \`--wf-bp-${m[1]}\` | \`${v}px\` | \`min-width:${v}px\` / \`max-width:${(v - 0.02).toFixed(2)}px\` |`)
  }
  L.push('')
  L.push('## 3. 变量钩子（内联覆盖面——`@property` 注册 9 条）')
  L.push('')
  L.push('| 钩子 | 回退值（layout 内首个消费） | 说明 |')
  L.push('| --- | --- | --- |')
  const propsCss = readFileSync(join(LAYOUT, '_props.css'), 'utf-8')
  const layoutAll = readFileSync(join(LAYOUT, 'weifuwu-layout.css'), 'utf-8')
  const hookNotes = {
    '--wf-gap': '容器间距默认（stack/row/cluster/grid 原语共用）',
    '--wf-align': '对齐默认（cross-axis）',
    '--wf-justify': '主轴对齐默认',
    '--wf-cols': 'grid 列模板（grid 原语）',
    '--wf-max': '容器最大宽（container 原语）',
    '--wf-w-sm': 'width-sm 工具类默认',
    '--wf-z': 'z 档位默认',
    '--wf-offset': 'sticky 偏移',
    '--wf-popup-max': '弹层最大宽（popup 原语）',
  }
  for (const m of propsCss.matchAll(/@property\s+(--wf-[a-z0-9-]+)\s*\{/g)) {
    const hook = m[1]
    const fb = layoutAll.match(new RegExp(`var\\(\\s*${hook.replace(/-/g, '\\-')}\\s*,\\s*([^)]+)\\)`))
    const fbVal = fb ? fb[1].trim().replace(/\s+/g, ' ') : '（无回退——必填钩子）'
    L.push(`| \`${hook}\` | \`${fbVal}\` | ${hookNotes[hook] ?? ''} |`)
  }
  L.push('')
  L.push('## 4. 类清单（inventory 全量——含状态修饰与断点变体）')
  L.push('')
  for (const [category, title] of [['primitive', '原语'], ['utility', '工具'], ['internal', '内部']]) {
    const rows = inv.classes.filter((c) => c.category === category)
    L.push(`### ${title}（${rows.length}）`)
    L.push('')
    L.push('| 类 | 文件 | 声明摘要 | 断点变体 | 状态修饰 |')
    L.push('| --- | --- | --- | --- | --- |')
    for (const c of rows) {
      if (c.modifierOf) {
        L.push(`| \`${c.name}\` | ${c.file} | （基类 \`${c.modifierOf}\` 的状态修饰） | | |`)
      } else {
        const summary = c.props.map((p) => p).join(' · ')
        const vals = Object.entries(c.values)
          .map(([k, v]) => `${k}:${v}`)
          .join(' · ')
        L.push(`| \`${c.name}\` | ${c.file} | ${(summary + (vals ? ` · ${vals}` : '')).slice(0, 110)}${summary.length + vals.length > 110 ? '…' : ''} | ${c.breakpoints.map((b) => `@${b}`).join(' ') || '—'} | ${c.modifiers.map((mod) => `\`${mod}\``).join(' ') || '—'} |`)
      }
    }
    L.push('')
  }
  L.push('## 5. 间距标尺（双标尺定案——L13：gap 派生自 space 紧一档）')
  L.push('')
  L.push('| 档 | space（内/外边距） | gap（容器内间距——派生） | 关系 |')
  L.push('| --- | --- | --- | --- |')
  const SPACE_BASE = { xs: '4px', sm: '8px', '': '12px', md: '16px', lg: '24px', xl: '32px', '2xl': '40px' }
  const GAP_FROM = { xs: 'space-xs', sm: 'space-sm', md: 'space(裸)', lg: 'space-md', xl: 'space-lg', '2xl': 'space-xl' }
  L.push(`| — | \`--wf-space\` = \`12px\` | \`--wf-gap-md = var(--wf-space)\` | 裸档即 md 档源 |`)
  for (const step of ['xs', 'sm', 'md', 'lg', 'xl', '2xl']) {
    L.push(`| ${step} | \`${SPACE_BASE[step]}\` | \`var(--wf-${GAP_FROM[step]})\` | gap 比 space 紧一档 |`)
  }
  L.push('')
  L.push('> 关系入代码：预设（compact）只覆写 space 标尺——gap 自动跟随；值冻结由 L13 守卫。')
  L.push('')
  L.push('## 6. 零消费公共面（文档化定案——「示例 = 可发现」，不做裁剪）')
  L.push('')
  L.push('以下类在代码语料（apps + src/client/components）零引用——属 weifuwu/layout npm 公共清单，')
  L.push('退出消费或库侧裁剪时才移除（登记单源：`layout-inventory.mjs` QUARTET_KEEP / LIB_SURFACE_KEEP）；')
  L.push('现文档化（示例 = 可发现）：')
  L.push('')
  const USAGE = {
    'wf-absolute': '定位：`<div class="wf-absolute wf-inset-0">`（绝对定位铺满——需 position 上下文）',
    'wf-cover': '媒体覆盖：`<div class="wf-cover"><img /></div>`（绝对定位全铺容器）',
    'wf-layer': '层叠原语：`<div class="wf-layer wf-z-pop">`（相对定位层，按 z 叠放）',
    'wf-nav': '导航条：`<nav class="wf-nav"><a class="wf-nav-item">…`（横向导航——内部项自带命中区）',
    'wf-nav-group': '导航分组：`<div class="wf-nav-group">`（导航项分组容器/标签）',
    'wf-radius-lg': '圆角档：`class="wf-radius-lg"`（大圆角——不在半径标尺逐档之外的独立值）',
    'wf-safe-bottom': '底部安全区：`class="wf-safe-bottom"`（env(safe-area-inset-bottom)——iOS 底部）',
    'wf-safe-top': '顶部安全区：`class="wf-safe-top"`（env(safe-area-inset-top)——刘海屏）',
    'wf-self-start': 'cross-axis 单项定位：`class="wf-self-start"`（align-self: flex-start——与 wf-self-stretch 同族）',
  }
  const publicZero = [...LIB_SURFACE_KEEP, 'wf-self-start']
  const uncovered = publicZero.filter((n) => !USAGE[n])
  if (uncovered.length) throw new Error(`生成失败：零消费公共面清单与 USAGE 示例不匹配（缺示例）: ${uncovered.join(' ')}`)
  for (const name of publicZero) L.push(`- \`${name}\`：${USAGE[name]}`)
  L.push('')
  L.push('> showcase 演示页私有类（`wf-variant-toggle/chevron/name/desc`——页面上下文定义，非库面）不计入。')
  L.push('')
  L.push('## 7. 计数速览（L1/L6 哨兵口径）')
  L.push('')
  L.push(`| 面 | 数量 |`)
  L.push(`| --- | --- |`)
  L.push(`| 布局原语 | ${inv.primitives} |`)
  L.push(`| 工具类 | ${inv.utilities} |`)
  L.push(`| 内部类 | ${inv.internals} |`)
  L.push(`| 主题 token | ${inv.tokens} |`)
  L.push('')
  return L.join('\n')
}

import { LAYER_ORDER } from '../src/client/layout/bundle.ts'

const target = process.argv[2] === '--check'
if (target) {
  const current = readFileSync(OUT, 'utf-8')
  const expected = buildReference()
  if (current !== expected) {
    console.error(`docs/layout.md 漂移——运行 \`node scripts/layout-reference.mjs\` 重新生成（契约 L15）`)
    process.exit(1)
  }
  console.log('docs/layout.md 最新 ✓')
} else {
  writeFileSync(OUT, buildReference())
  console.log(`docs/layout.md 已生成（${buildReference().split('\n').length} 行）`)
}
