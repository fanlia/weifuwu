/**
 * 生成示例 deck（语义 JSON → deckToPptx）
 * 用法: node scripts/gen-demo.mjs [theme] [out]
 */
import { deckToPptx } from '../src/pptx/components/layouts.ts'
import { writeFileSync, mkdirSync } from 'node:fs'

const theme = process.argv[2] ?? 'corporate'
const out = process.argv[3] ?? `dist/demo-${theme}.pptx`

const deck = {
  title: 'AI PPT 生成引擎',
  theme,
  slides: [
    { layout: 'cover', title: 'AI PPT 生成引擎', subtitle: '可部署 · 可编程 · 可批量 · 可证明', meta: `主题：${theme}` },
    { layout: 'section', number: 1, title: '为什么自研引擎', subtitle: '零依赖 · 可测试 · 可证明' },
    {
      layout: 'bullets',
      title: '核心观点',
      points: ['自研 pptx-vdom 引擎 — 零第三方依赖', '确定性输出，同一输入永远同一字节', '三层防线：引擎校验 / 黄金文件 / 兼容性矩阵'],
    },
    {
      layout: 'twoColumn',
      title: '两种模式对比',
      leftTitle: '云 SaaS',
      leftPoints: ['数据在别人服务器', '封闭产品，交互式', '按订阅付费'],
      rightTitle: 'aippt',
      rightPoints: ['可私有化部署', 'API/SDK 可编程', '边际成本几分钱'],
    },
    {
      layout: 'data',
      title: '核心指标',
      stats: [
        { label: '生成耗时', value: '5-15 分钟', delta: '↓ 90%' },
        { label: '边际成本', value: '¥0.05', delta: '↓ 99%' },
        { label: '兼容性', value: '4/4', delta: '已实测' },
      ],
    },
    { layout: 'thanks', title: '谢谢观看', subtitle: 'AI 生成的演示文稿' },
  ],
}

mkdirSync('dist', { recursive: true })
const buf = deckToPptx(deck)
writeFileSync(out, buf)
console.log(`${out} 已生成 (${(buf.length / 1024).toFixed(1)} KB, ${deck.slides.length} 页, 主题: ${theme})`)
