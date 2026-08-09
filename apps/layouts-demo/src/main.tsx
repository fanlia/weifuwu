/**
 * weifuwu/layout — 布局模式蓝本
 *
 * 每个布局模式是一个独立可复制的完整页面结构（patterns/ 下）：
 * 开发者点左侧列表查看，复制对应文件即可得到一种布局。
 *
 * 纪律（AGENTS.md §8 布局蓝本纪律）：
 * 布局只用 weifuwu/layout 原语 + weifuwu/components 组件，零手写样式。
 * 壳本身也遵守——导航用 NavMenu、描述用 Typography、图标用 Icon。
 *
 * 启动: node apps/layouts-demo/server.ts → http://localhost:3001
 */

import { createApp, h } from 'weifuwu/client'
import type { Component } from 'weifuwu/client'
import { Badge, Button, CodeBlock, Drawer, Icon, Tag, Text, Space } from 'weifuwu/components'

import { PATTERNS, GROUPS, getPattern } from './patterns/index'


// 模式 id → 文件名（显示用）——显式 file 字段优先（id 驼峰 ≠ 文件名时）
const fileOf = (id: string) => 'patterns/' + getPattern(id).file + '.tsx'

// ── 壳：左侧模式列表 + hash 路由切换（#/app-shell 等）──
const Shell: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.active = getPattern(location.hash.replace('#/', '')).id
  $.showCode = false
  $.code = ''

  const onHash = () => {
    $.active = getPattern(location.hash.replace('#/', '')).id
    $.showCode = false
  }
  window.addEventListener('hashchange', onHash)

  return () => {
    const active = PATTERNS.find((p) => p.id === $.active) ?? PATTERNS[0]
    return (
      <div class="wf-row wf-gap-none wf-stretch wf-nowrap" style={{ height: '100vh' }}>
        {/* 左侧模式列表 */}
        <aside class="wf-hidden wf-block@lg wf-stack wf-gap-none wf-p-md wf-bg-secondary wf-border-r" style={{ width: 240, flexShrink: 0, overflow: 'auto' }}>
          <div class="wf-pb-md wf-border-b">
            <Space align="center">
              <Icon name="layout" size={18} className="wf-text-primary" />
              <b class="wf-text-bold">weifuwu/layout</b>
            </Space>
            <Text type="secondary" className="wf-text-sm">布局模式蓝本 · {PATTERNS.length} 种</Text>
          </div>

          <nav
            class="wf-nav"
            tabindex="0"
            aria-label="布局模式列表"
            onKeyDown={(e: KeyboardEvent) => {
              const idx = PATTERNS.findIndex((p) => p.id === active.id)
              if (e.key === 'ArrowDown') { e.preventDefault(); location.hash = '#/' + (PATTERNS[(idx + 1) % PATTERNS.length]?.id ?? PATTERNS[0].id) }
              if (e.key === 'ArrowUp') { e.preventDefault(); location.hash = '#/' + (PATTERNS[(idx - 1 + PATTERNS.length) % PATTERNS.length]?.id ?? PATTERNS[0].id) }
            }}
          >
            {GROUPS.map((g) => (
              <div key={g}>
                <div class="wf-nav-group">{g}</div>
                {PATTERNS.filter((p) => p.group === g).map((p) => (
                  <a
                    key={p.id}
                    href={`#/${p.id}`}
                    class={`wf-nav-item${p.id === active.id ? ' wf-nav-item--active' : ''}`}
                  >
                    {p.name}
                  </a>
                ))}
              </div>
            ))}
          </nav>

          <div class="wf-stack wf-gap-sm wf-mt-auto wf-pt-md wf-border-t">
            <Text type="secondary" className="wf-text-sm">189 个布局原语</Text>
            <Tag variant="primary">复制即用</Tag>
          </div>
        </aside>

        {/* 右侧：模式描述 + 模式本体 */}
        <main class="wf-fill wf-stack wf-gap-none" style={{ minWidth: 0 }}>
          <div class="wf-stack wf-gap-none wf-border-b">
            {/* 窄屏模式切换（横向滚动）——lg 起隐藏（左侧栏接管） */}
            <nav class="wf-hidden@lg wf-nav wf-row wf-nowrap wf-scroll wf-p-sm wf-gap-xs wf-border-b">
              {PATTERNS.map((p) => (
                <a
                  key={p.id}
                  href={`#/${p.id}`}
                  class={`wf-nav-item wf-text-nowrap${p.id === active.id ? ' wf-nav-item--active' : ''}`}
                >
                  {p.name}
                </a>
              ))}
            </nav>
            <div class="wf-row wf-p-md wf-gap-lg">
              <div class="wf-stack wf-gap-none">
                <b class="wf-text-bold">{active.name}</b>
                <Text type="secondary" className="wf-text-sm">{active.desc}</Text>
              </div>
              <Space size="md" align="center">
                <Text className="wf-text-tertiary wf-text-xs" style={{ fontFamily: 'monospace' }}>
                  {fileOf(active.id)}
                </Text>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    $.showCode = true
                    const res = await fetch(`/src/patterns/${active.file}`)
                    $.code = await res.text()
                  }}
                >
                  <Icon name="file-text" size={14} /> 查看代码
                </Button>
              </Space>
            </div>
          </div>

          {/* 查看代码 Drawer（children 中间位置——框架 mapChildDomNodes null 修复后不再错位） */}
          <Drawer
            open={$.showCode}
            title={`源码 · ${fileOf(active.id)}`}
            onClose={() => { $.showCode = false }}
            position="right"
            width="46%"
          >
            <CodeBlock lang="tsx" title={fileOf(active.id)} code={$.code} />
          </Drawer>
          <div class="wf-fill wf-scroll wf-p-md">
            {h(active.comp, {})}
          </div>
        </main>
      </div>
    )
  }
}

createApp().mount('#root', Shell)
