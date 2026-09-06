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
]
