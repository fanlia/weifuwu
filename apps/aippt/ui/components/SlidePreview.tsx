/**
 * SlidePreview — 语义 JSON → HTML 幻灯片预览
 *
 * 与 PPTX 导出同源（同一份 DeckData），预览所见即导出所得。
 * 主题色直接复用引擎 theme.ts（单一来源，不重复定义）。
 */

import { h } from 'weifuwu/client'
import { getTheme } from '../../src/pptx/theme.ts'
import type { SlideData } from '../../src/pptx/components/layouts.ts'

/** 480×270 卡片内的版式渲染（字号已按 1/27.8 比例折算） */
export const SlidePreview = (_init: any, _ctx: any) => (props: { slide: SlideData; themeId: string; index: number }) => {
  const t = getTheme(props.themeId).colors
  const s = props.slide

  const common = {
    width: 480,
    height: 270,
    background: t.bg,
    color: t.text,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    borderRadius: 6,
    boxShadow: '0 1px 4px rgba(0,0,0,.15)',
    fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
  }

  const bar = (w = 100, h = 3) => ({ position: 'absolute' as const, top: 0, left: 0, width: w, height: h, background: t.primary })
  const abs = (x: number, y: number, w: number) => ({ position: 'absolute' as const, left: x, top: y, width: w })
  const title = (x: number, y: number, size: number, w = 400) => ({ ...abs(x, y, w), fontSize: size, fontWeight: 700, color: t.text })
  const sub = (x: number, y: number, size: number, color = t.textSecondary, w = 400) => ({ ...abs(x, y, w), fontSize: size, color })
  const hline = (x: number, y: number, w: number) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: 3, background: t.primary })

  // ── 版式渲染 ──
  let body: any = null
  switch (s.layout) {
    case 'cover':
      body = [
        h('div', { style: bar() }),
        h('div', { style: { ...abs(36, 60, 70), height: 15, borderRadius: 8, background: t.primarySoft, color: t.primary, fontSize: 8, fontWeight: 700, lineHeight: '15px', textAlign: 'center' } }, 'AI 生成'),
        h('div', { style: title(36, 86, 30) }, s.title),
        s.subtitle ? h('div', { style: sub(36, 130, 12) }, s.subtitle) : null,
        s.meta ? h('div', { style: sub(36, 240, 8, t.muted) }, s.meta) : null,
      ]
      break
    case 'section':
      body = [
        h('div', { style: { ...abs(30, 36, 160), fontSize: 66, fontWeight: 700, color: t.primarySoft } }, String(s.number).padStart(2, '0')),
        h('div', { style: { ...abs(36, 122, 30), height: 4, background: t.primary } }),
        h('div', { style: title(36, 134, 22) }, s.title),
        s.subtitle ? h('div', { style: sub(36, 172, 10) }, s.subtitle) : null,
      ]
      break
    case 'bullets':
      body = [
        h('div', { style: title(22, 16, 18) }, s.title),
        h('div', { style: hline(22, 42, 130) }),
        h('div', { style: { position: 'absolute' as const, left: 22, top: 56, width: 436 } },
          (s.points ?? []).map((p) =>
            h('div', { style: { display: 'flex', gap: 8, marginBottom: 10, fontSize: 11, lineHeight: 1.5, color: t.textSecondary } },
              h('span', { style: { color: t.primary, fontWeight: 700 } }, '•'),
              h('span', {}, p))),
        ),
      ]
      break
    case 'twoColumn':
      body = [
        h('div', { style: title(22, 16, 18) }, s.title),
        h('div', { style: hline(22, 42, 130) }),
        h('div', { style: { position: 'absolute' as const, left: 22, top: 56, width: 200, borderRight: `1px solid ${t.line}` } },
          h('div', { style: { fontSize: 12, fontWeight: 700, marginBottom: 8, color: t.text } }, s.leftTitle),
          (s.leftPoints ?? []).map((p) => h('div', { style: { fontSize: 10, color: t.textSecondary, marginBottom: 6, lineHeight: 1.5 } }, `• ${p}`)),
        ),
        h('div', { style: { position: 'absolute' as const, left: 244, top: 56, width: 214 } },
          h('div', { style: { fontSize: 12, fontWeight: 700, marginBottom: 8, color: t.text } }, s.rightTitle),
          (s.rightPoints ?? []).map((p) => h('div', { style: { fontSize: 10, color: t.textSecondary, marginBottom: 6, lineHeight: 1.5 } }, `• ${p}`)),
        ),
      ]
      break
    case 'data':
      body = [
        h('div', { style: title(22, 16, 18) }, s.title),
        h('div', { style: hline(22, 42, 130) }),
        h('div', { style: { position: 'absolute' as const, left: 22, top: 60, display: 'flex', gap: 12 } },
          (s.stats ?? []).map((st) =>
            h('div', { style: { width: 138, height: 130, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 6, padding: 12 } },
              h('div', { style: { fontSize: 20, fontWeight: 700, color: t.primary } }, st.value),
              st.delta ? h('div', { style: { fontSize: 9, fontWeight: 700, color: t.success, marginTop: 4 } }, st.delta) : null,
              h('div', { style: { fontSize: 10, color: t.textSecondary, marginTop: 12 } }, st.label),
            )),
        ),
      ]
      break
    case 'thanks':
      body = [
        h('div', { style: { position: 'absolute' as const, left: 0, top: 105, width: 480, textAlign: 'center', fontSize: 26, fontWeight: 700, color: t.text } }, s.title),
        s.subtitle ? h('div', { style: { position: 'absolute' as const, left: 0, top: 150, width: 480, textAlign: 'center', fontSize: 10, color: t.textSecondary } }, s.subtitle) : null,
      ]
      break
  }

  return h('div', { class: 'slide-card', style: common, 'data-index': props.index }, body)
}
