/**
 * 布局原语族表——按族分组（66 原语 + 157 工具类 → 20 族）。
 * 计数与 scripts/layout-inventory.mjs 同源（style-audit 断言零漂移）。
 */
import type { PrimitiveFamily } from './types.ts'

export const primitives: PrimitiveFamily[] = [
  { id: 'grid', name: '网格', cssFile: '_grid.css', kind: 'primitive', desc: 'CSS Grid 容器——--wf-cols 控制列（auto-fill/模板/比例）', classes: ['wf-grid'] },
  { id: 'stack', name: '纵向堆叠', cssFile: '_stack.css', kind: 'primitive', desc: 'flex column 容器——--wf-gap 控制间距（页面/卡片骨架首选）', classes: ['wf-stack'] },
  { id: 'row', name: '横向行', cssFile: '_row.css', kind: 'primitive', desc: 'flex row 容器——/between/around/evenly/right 分布变体', classes: ['wf-row', 'wf-between', 'wf-around', 'wf-evenly', 'wf-right'] },
  { id: 'center', name: '居中', cssFile: '_center.css', kind: 'primitive', desc: '双向居中（Hero/空状态/认证页）', classes: ['wf-center'] },
  { id: 'fill', name: '填满', cssFile: '_fill.css', kind: 'primitive', desc: 'flex:1 占满剩余空间（内容区/弹性布局）', classes: ['wf-fill'] },
  { id: 'container', name: '页面容器', cssFile: '_container.css', kind: 'primitive', desc: '水平居中定宽容器——--wf-max 控制宽度', classes: ['wf-container'] },
  { id: 'cluster', name: '自动换行簇', cssFile: '_cluster.css', kind: 'primitive', desc: 'flex-wrap 簇布局（标签/按钮组）', classes: ['wf-cluster'] },
  { id: 'split', name: '分栏', cssFile: '_split.css', kind: 'primitive', desc: '两栏拆分——--wf-split-ratio 控制比例', classes: ['wf-split'] },
  { id: 'layer', name: '层叠', cssFile: '_layer.css', kind: 'primitive', desc: 'absolute 层叠容器（角标/覆盖层）', classes: ['wf-layer'] },
  { id: 'app-shell', name: '应用外壳', cssFile: '_app-shell.css', kind: 'primitive', desc: 'wf-app-shell 可折叠侧栏 + wf-nav 导航（菜单/分组/激活态）', classes: ['wf-app-shell', 'wf-nav', 'wf-nav-item', 'wf-nav-group', 'wf-sidebar'] },
  { id: 'hidden', name: '显隐与显示类型', cssFile: '_hidden.css', kind: 'primitive', desc: 'wf-hidden/wf-block/wf-flex…（含 @lg 断点变体——响应式切换）', classes: ['wf-hidden', 'wf-hidden@lg', 'wf-flex@lg', 'wf-block'] },
  { id: 'position', name: '定位', cssFile: '_fixed.css', kind: 'primitive', desc: 'fixed/sticky + top/bottom/right 吸附（吸顶/悬浮/回顶）', classes: ['wf-fixed', 'wf-sticky', 'wf-top', 'wf-bottom'] },
  { id: 'scroll', name: '滚动与裁剪', cssFile: '_scroll.css', kind: 'primitive', desc: '溢出滚动容器 + clip/nowrap（横向滚动条/卡片裁剪）', classes: ['wf-scroll', 'wf-clip', 'wf-nowrap'] },
  { id: 'safe-area', name: '安全区', cssFile: '_safe-area.css', kind: 'primitive', desc: 'wf-safe-top/bottom（移动端刘海/底部栏适配）', classes: ['wf-safe-top', 'wf-safe-bottom'] },
  { id: 'anchor', name: '锚点定位', cssFile: '_anchor.css', kind: 'primitive', desc: 'wf-anchor（锚定定位——fixed 相对容器）', classes: ['wf-anchor'] },
  { id: 'align', name: '对齐', cssFile: '_align-self.css', kind: 'primitive', desc: 'align-self 系列（stretch/start/end/center——单元格对齐）', classes: ['wf-stretch', 'wf-align-self-start'] },
  { id: 'spacing', name: '间距工具', cssFile: '_spacing.css', kind: 'utility', desc: '90 个 p/m/gap 类——刻度阶梯（--wf-space-*）', classes: ['wf-p-md', 'wf-m-0', 'wf-gap-sm', 'wf-gap-lg'] },
  { id: 'surface', name: '表面工具', cssFile: '_surface.css', kind: 'utility', desc: '20 个背景/圆角/边框类（卡片/表单面；flat 变体=平面表面）', classes: ['wf-surface', 'wf-surface--flat', 'wf-bg-secondary', 'wf-rounded-md', 'wf-border-t'] },
  { id: 'border', name: '边框工具', cssFile: '_border.css', kind: 'utility', desc: '边框/分隔线（wf-border/b/t/l/r）', classes: ['wf-border', 'wf-border-b'] },
  { id: 'text', name: '文本工具', cssFile: '_text.css', kind: 'utility', desc: '42 个字号/字重/颜色/对齐类（-text 语义色变体）', classes: ['wf-text-sm', 'wf-text-bold', 'wf-text-secondary', 'wf-text-primary'] },
]
