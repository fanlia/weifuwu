/**
 * weifuwu/client/layout — 原语声明（defineLayout——生成器消费——BEM 直拼单源）
 *
 * W4 样本：row/stack 族（机制验证——生成 = 手写逐属性等价——等价后手写
 * _row.css/_stack.css 删除——生成器输出进 bundle 汇编）。
 * 声明添加 = 新原语（组合缺省（gap/align defaults）声明即生成）。
 */
import type { StructureDecl } from './define.ts'

export const structures: StructureDecl[] = [
  {
    class: 'wf-stack',
    base: { display: 'flex', 'flex-direction': 'column' },
    defaults: { gap: 'var(--wf-gap, var(--wf-gap-md))', 'align-items': 'var(--wf-align, stretch)' },
  },
  {
    class: 'wf-row',
    base: { display: 'flex', 'flex-wrap': 'wrap' },
    defaults: { gap: 'var(--wf-gap, var(--wf-gap-md))', 'align-items': 'var(--wf-align, center)' },
    variants: {
      'wf-row-reverse': { cover: { 'flex-direction': 'row-reverse' } },
    },
  },
  // items — 交叉轴对齐（单机制——设 --wf-align 变量，wf-row/wf-stack 等消费；
  // 值为 CSS align-items 值词。物理方向词（top/bottom）禁入对齐域）
  { class: 'wf-items-start', base: { '--wf-align': 'flex-start' } },
  { class: 'wf-items-center', base: { '--wf-align': 'center' } },
  { class: 'wf-items-end', base: { '--wf-align': 'flex-end' } },
  { class: 'wf-items-stretch', base: { '--wf-align': 'stretch' } },
  // W5 扩容（结构原语同构面——base+defaults 验证）：
  // grid — 栅格（--wf-cols 列数变量）
  {
    class: 'wf-grid',
    base: { display: 'grid', 'grid-template-columns': 'var(--wf-cols, repeat(auto-fill, minmax(280px, 1fr)))' },
    defaults: { gap: 'var(--wf-gap, var(--wf-gap-lg))' },
  },
  // center — 居中（base-only）
  {
    class: 'wf-center',
    base: { display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center' },
  },
  // justify 家族（base+defaults 同构——变体即独立类）
  { class: 'wf-justify-between', base: { display: 'flex', 'justify-content': 'space-between' }, defaults: { 'align-items': 'var(--wf-align, center)', gap: 'var(--wf-gap, var(--wf-gap-md))' } },
  { class: 'wf-justify-end', base: { display: 'flex', 'justify-content': 'flex-end' }, defaults: { 'align-items': 'var(--wf-align, center)', gap: 'var(--wf-gap, var(--wf-gap-md))' } },
  { class: 'wf-justify-center', base: { display: 'flex', 'justify-content': 'center' }, defaults: { 'align-items': 'var(--wf-align, center)', gap: 'var(--wf-gap, var(--wf-gap-md))' } },
  // fill — 弹性填充（base-only）
  { class: 'wf-fill', base: { flex: '1', 'min-width': '0', 'min-height': '0' } },
  // fill-hover — 填充悬停面（消费侧欠账补定义——消费证据：平台行按钮）
  {
    class: 'wf-fill-hover',
    base: {
      'border-radius': 'var(--wf-radius-sm)', padding: '2px 4px',
      margin: '-2px -4px', transition: 'background 0.15s ease',
    },
  },
  // cover — 全屏覆盖（base-only——z-index token 化）
  {
    class: 'wf-cover',
    base: { position: 'fixed', inset: '0', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 'var(--wf-z, var(--wf-cover-z))' },
  },
]
