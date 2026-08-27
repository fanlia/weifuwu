/**
 * 布局原语族表——按族分组（49 原语 + 89 工具类 → 20 族）。
 * 计数与 scripts/layout-inventory.mjs 同源（契约测试断言零漂移）。
 * 命名规则：design/layout-naming.md（概念原语/属性根/裸值词 + 三后缀语法）。
 */
import type { PrimitiveFamily } from './types.ts'

export const primitives: PrimitiveFamily[] = [
  { id: 'grid', name: '网格', cssFile: '_grid.css', kind: 'primitive', desc: 'CSS Grid 容器——--wf-cols 控制列（auto-fill/模板/比例）', classes: ['wf-grid'] },
  { id: 'stack', name: '纵向堆叠', cssFile: '_stack.css', kind: 'primitive', desc: 'flex column 容器——--wf-gap 控制间距（页面/卡片骨架首选）', classes: ['wf-stack'] },
  { id: 'row', name: '横向行', cssFile: '_row.css', kind: 'primitive', desc: 'flex row 容器（自动换行）+ items-* 交叉轴对齐', classes: ['wf-row', 'wf-row-reverse', 'wf-items-center', 'wf-items-end'] },
  { id: 'center', name: '居中', cssFile: '_center.css', kind: 'primitive', desc: '双向居中（Hero/空状态/认证页）', classes: ['wf-center'] },
  { id: 'justify', name: '主轴分布', cssFile: '_justify.css', kind: 'primitive', desc: 'justify-content 分布（对齐域统一 CSS 词根）', classes: ['wf-justify-between', 'wf-justify-end'] },
  { id: 'fill', name: '填满/收缩', cssFile: '_fill.css', kind: 'primitive', desc: 'flex:1 撑满 + flex 收缩约束（内容溢出标配）', classes: ['wf-fill', 'wf-shrink', 'wf-min-width-0'] },
  { id: 'container', name: '页面容器', cssFile: '_container.css', kind: 'primitive', desc: '水平居中定宽容器——--wf-max 控制宽度', classes: ['wf-container'] },
  { id: 'cluster', name: '自动换行簇', cssFile: '_cluster.css', kind: 'primitive', desc: 'flex-wrap 簇布局（标签/按钮组）', classes: ['wf-cluster'] },
  { id: 'split', name: '分栏', cssFile: '_split.css', kind: 'primitive', desc: '两端展开——左弹性右固定', classes: ['wf-split'] },
  { id: 'layer', name: '层叠', cssFile: '_layer.css', kind: 'primitive', desc: 'relative + z-index 层叠容器（角标/覆盖层父级）', classes: ['wf-layer'] },
  { id: 'app-shell', name: '应用外壳', cssFile: '_app-shell.css', kind: 'primitive', desc: 'wf-app-shell 静态壳 + wf-sidebar/wf-main + wf-nav 导航（菜单/分组/激活态）', classes: ['wf-app-shell', 'wf-nav', 'wf-nav-item', 'wf-nav-group', 'wf-sidebar', 'wf-main'] },
  { id: 'hidden', name: '显隐与显示类型', cssFile: '_hidden.css', kind: 'primitive', desc: 'display 族——响应式显隐唯一模式 `wf-hidden wf-flex@lg`', classes: ['wf-hidden', 'wf-hidden@lg', 'wf-flex@lg', 'wf-block', 'wf-dim', 'wf-pointer'] },
  { id: 'position', name: '定位', cssFile: '_position.css', kind: 'primitive', desc: 'position 属性名即类名——relative/absolute 配对 + sticky/固定覆盖', classes: ['wf-relative', 'wf-absolute', 'wf-sticky', 'wf-cover'] },
  { id: 'overflow', name: '溢出与滚动', cssFile: '_overflow.css', kind: 'primitive', desc: 'overflow 属性名即类名——滚动容器/裁剪/横滚 + nowrap 不换行', classes: ['wf-overflow-auto', 'wf-overflow-hidden', 'wf-overflow-x', 'wf-nowrap'] },
  { id: 'safe-area', name: '安全区', cssFile: '_safe-area.css', kind: 'primitive', desc: 'wf-safe-top/bottom（移动端刘海/底部栏适配）', classes: ['wf-safe-top', 'wf-safe-bottom'] },
  { id: 'align', name: '子项对齐', cssFile: '_align-self.css', kind: 'primitive', desc: 'align-self 系列（start/center/end/stretch——弹性/网格子项单独对齐）', classes: ['wf-self-start', 'wf-self-center', 'wf-self-end'] },
  { id: 'spacing', name: '间距工具', cssFile: '_spacing.css', kind: 'utility', desc: 'padding/margin/gap/尺寸——属性根全名 + 刻度阶梯（--wf-space-*）', classes: ['wf-padding-md', 'wf-margin-none', 'wf-gap-sm', 'wf-gap-lg', 'wf-width-full'] },
  { id: 'surface', name: '表面工具', cssFile: '_surface.css', kind: 'utility', desc: '背景/圆角/阴影/气泡（卡片/表单面；flat 变体=平面表面）', classes: ['wf-surface', 'wf-surface--flat', 'wf-bg-secondary', 'wf-radius-md', 'wf-shadow'] },
  { id: 'border', name: '边框工具', cssFile: '_border.css', kind: 'utility', desc: '边框/分隔线（方向全词）', classes: ['wf-border', 'wf-border-bottom', 'wf-border-none'] },
  { id: 'text', name: '文本工具', cssFile: '_text.css', kind: 'utility', desc: '字号 wf-font-* / 颜色对齐 wf-text-* / 字重裸词（-text 语义色变体）', classes: ['wf-font-sm', 'wf-bold', 'wf-text-secondary', 'wf-text-primary'] },
]
