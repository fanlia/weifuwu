/**
 * weifuwu/layout — 布局模式蓝本
 *
 * 每个布局模式是一个独立可复制的完整页面结构（patterns/ 下）：
 * 开发者点左侧列表查看，复制对应文件即可得到一种布局。
 *
 * 启动: node apps/layouts-demo/server.ts → http://localhost:3001
 */

import { createApp, h } from 'weifuwu/client'
import type { Component } from 'weifuwu/client'
import { Badge } from 'weifuwu/components'

import { PATTERNS, getPattern } from './patterns/index'

// 模式 id → 文件名（显示用）
const fileOf = (id: string) =>
  'patterns/' + id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('') + '.tsx'

// ── 壳：左侧模式列表 + hash 路由切换（#/app-shell 等）──
const Shell: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.active = getPattern(location.hash.replace('#/', '')).id

  const onHash = () => { $.active = getPattern(location.hash.replace('#/', '')).id }
  window.addEventListener('hashchange', onHash)

  return () => {
    const active = PATTERNS.find((p) => p.id === $.active) ?? PATTERNS[0]
    return (
      <div class="wf-row" style={{ height: '100vh', gap: 0, alignItems: 'stretch', flexWrap: 'nowrap' }}>
        {/* 左侧模式列表 */}
        <aside class="wf-stack wf-gap-none wf-pad-md" style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--wf-color-border-light)', overflow: 'auto', background: 'var(--wf-color-bg-subtle)' }}>
          <div class="wf-pad-md" style={{ borderBottom: '1px solid var(--wf-color-border-light)' }}>
            <b style={{ fontSize: 15 }}>🧱 weifuwu/layout</b>
            <div class="wf-text-secondary" style={{ fontSize: 12, marginTop: 2 }}>布局模式蓝本 · {PATTERNS.length} 种</div>
          </div>
          <nav class="wf-stack wf-gap-sm" style={{ marginTop: 12 }}>
            {PATTERNS.map((p) => (
              <a
                key={p.id}
                href={`#/${p.id}`}
                class={`wf-nav-item${p.id === active.id ? ' wf-nav-item--active' : ''}`}
                style={{ display: 'block', padding: '8px 12px', borderRadius: 8, fontSize: 14 }}
              >
                {p.name}
              </a>
            ))}
          </nav>
          <div class="wf-pad-md wf-stack wf-gap-sm wf-text-secondary" style={{ marginTop: 'auto', fontSize: 12, borderTop: '1px solid var(--wf-color-border-light)' }}>
            <span>189 个布局原语</span>
            <Badge variant="primary">复制即用</Badge>
          </div>
        </aside>

        {/* 右侧：模式描述 + 模式本体 */}
        <main class="wf-fill wf-stack wf-gap-none" style={{ minWidth: 0 }}>
          <div class="wf-row wf-pad-md wf-gap-lg" style={{ borderBottom: '1px solid var(--wf-color-border-light)', alignItems: 'center' }}>
            <div class="wf-stack wf-gap-none">
              <b style={{ fontSize: 15 }}>{active.name}</b>
              <span class="wf-text-secondary" style={{ fontSize: 12 }}>{active.desc}</span>
            </div>
            <span class="wf-text-tertiary" style={{ fontSize: 12, marginLeft: 'auto', fontFamily: 'monospace' }}>
              {fileOf(active.id)}
            </span>
          </div>
          <div class="wf-fill" style={{ overflow: 'auto', padding: 16 }}>
            {h(active.comp, {})}
          </div>
        </main>
      </div>
    )
  }
}

createApp().mount('#root', Shell)
