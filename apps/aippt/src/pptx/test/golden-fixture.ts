/**
 * golden fixture — 黄金文件测试的标准 deck（覆盖全部 6 种版式）
 * 同一份 slides 换 5 个主题，字节级输出作为回归基线。
 */

import type { DeckData } from '../components/layouts.ts'

export function goldenDeck(theme: string): DeckData {
  return {
    title: '黄金测试',
    theme,
    slides: [
      { layout: 'cover', title: '黄金测试', subtitle: '字节级回归基线', meta: 'fixture | 2025' },
      { layout: 'section', number: 1, title: '章节一', subtitle: '章节说明' },
      { layout: 'bullets', title: '要点页', points: ['要点一', '要点二', '要点三'] },
      {
        layout: 'twoColumn',
        title: '双栏页',
        leftTitle: '左栏',
        leftPoints: ['左一', '左二'],
        rightTitle: '右栏',
        rightPoints: ['右一', '右二'],
      },
      {
        layout: 'data',
        title: '数据页',
        stats: [
          { label: '指标一', value: '100', delta: '↑ 10%' },
          { label: '指标二', value: '50%', delta: '↓ 5%' },
        ],
      },
      { layout: 'thanks', title: '谢谢观看', subtitle: '感谢聆听' },
    ],
  }
}

export const GOLDEN_THEMES = ['corporate', 'minimal', 'tech', 'academic', 'vibrant'] as const
