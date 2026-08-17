/**
 * 首页——六域入口 + 计数（registry 计算，非硬编码）+ 快速开始
 */
import { h } from 'weifuwu/ui-dom'
import type { Component } from 'weifuwu/ui-dom'
import { Badge, Tag } from 'weifuwu/components'
import { fetchIndex } from '../data.ts'
import { DOMAINS } from '../shell.tsx'

export const Home: Component = async (_init: any, _ctx: any) => {
  const idx = await fetchIndex()
  return async (_p: any) => (
    <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:24px;padding:32px 16px">
      <div class="wf-border wf-rounded-lg wf-clip" style="background:linear-gradient(180deg,var(--wf-color-bg) 0%,var(--wf-color-bg-secondary) 100%)">
        <div class="wf-stack wf-gap-md" style="padding:48px 32px;text-align:center">
          <div>
            <h1 class="wf-text-4xl wf-m-0" style="letter-spacing:-0.02em">
              weifuwu <span class="wf-text-primary">发展引擎</span>
            </h1>
            <p class="wf-text-secondary wf-text-base wf-m-0 wf-mt-sm" style="max-width:560px;margin-inline:auto">
              组件 / 布局原语 / 页面模式 / 应用模板 / 后端能力 / 框架能力 / 指南
              ——全部可复制、可验证、可深链
            </p>
          </div>
          {/* 微流明 · 进行态语言的活体示范：流式代码行 */}
          <div>
            <div class="wf-surface wf-border wf-rounded-md wf-text-xs" style="font-family:var(--wf-font-mono);text-align:left;max-width:520px;margin-inline:auto;padding:12px 16px;background:var(--wf-color-bg)">
              <div><span class="wf-text-primary">$</span> npx weifuwu docs</div>
              <div class="wf-text-tertiary">→ http://localhost:4000 · 文档站已就绪（126 组件 · 20 指南）</div>
              <div><span class="wf-text-primary">$</span> node server.ts</div>
              <div class="wf-text-tertiary">→ 你的第一个页面，跑起来了</div>
            </div>
          </div>
          <div class="wf-cluster wf-gap-sm" style="justify-content:center">
            <Badge variant="primary">{idx.counts.components} 组件</Badge>
            <Badge variant="success">{idx.counts.patterns} 页面模式</Badge>
            <Badge variant="info">{idx.counts.apps} 应用模板</Badge>
            <Tag>LLM: curl /llms.txt 即所得</Tag>
            <Tag>随 npm 包发布: node_modules/weifuwu/content/</Tag>
          </div>
        </div>
      </div>

      <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,240px),1fr));--wf-gap:12px">
        {[
          { path: '/components', name: '组件', num: idx.counts.components, desc: '逐组件文档：API 表 + 纪律 + 关系 + 验证', icon: 'grid' },
          { path: '/layout', name: '布局原语', num: idx.counts.primitives, desc: 'wf-* 原语与工具类，按族分组', icon: 'layout' },
          { path: '/patterns', name: '页面模式', num: idx.counts.patterns, desc: '复制即用的完整页面', icon: 'file-text' },
          { path: '/apps', name: '应用模板', num: idx.counts.apps, desc: '完整可运行应用（含生产级案例）', icon: 'server' },
          { path: '/backend', name: '后端能力', num: idx.counts.backend, desc: 'ctx 注入链 / 数据 / 实时 / AI / SaaS', icon: 'database' },
          { path: '/capabilities', name: '框架能力', num: idx.counts.capabilities, desc: '框架怎么工作——平台自证', icon: 'code' },
          { path: '/guides', name: '指南', num: idx.counts.guides, desc: '选型 / 质量标准 / 学习路径', icon: 'book' },
        ].map((d) => (
          <a key={d.path} href={d.path} class="wf-surface wf-border wf-rounded-md wf-p-md wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
            <span class="wf-text-2xl wf-text-bold wf-text-primary" style="font-family:var(--wf-font-mono)">{d.num}</span>
            <b class="wf-text-base">{d.name}</b>
            <span class="wf-text-xs wf-text-secondary">{d.desc}</span>
          </a>
        ))}
      </div>

      <div class="wf-stack wf-gap-sm">
        <div class="wf-row wf-between">
          <b class="wf-text-lg">🎯 我要做什么</b>
          <span class="wf-text-xs wf-text-tertiary">需求 → 模板/模式/组件全链路——场景先于组件</span>
        </div>
        <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,220px),1fr));--wf-gap:10px">
          {idx.needs.map((n) => (
            <a key={n.id} href={n.template ? `/apps/${n.template}` : n.patterns[0] ? `/patterns/${n.patterns[0]}` : `/components`}
              class="wf-surface wf-border wf-rounded-md wf-p-sm wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
              <b class="wf-text-sm">{n.name}</b>
              <span class="wf-text-xs wf-text-secondary">{n.desc}</span>
              <span class="wf-text-xs wf-text-tertiary">{n.components.slice(0, 3).join(' · ')}…</span>
            </a>
          ))}
        </div>
      </div>

      <div class="wf-stack wf-gap-sm">
        <div class="wf-row wf-between">
          <b class="wf-text-lg">🏗️ 用 weifuwu 做的应用</b>
          <a class="wf-text-xs wf-text-secondary" href="https://github.com/weifuwu/weifuwu/issues/new?template=component-request.md" style="text-decoration:none" target="_blank">提交你的案例 →</a>
        </div>
        <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,240px),1fr));--wf-gap:10px">
          {idx.cases.map((c) => (
            <div key={c.id} class="wf-surface wf-border wf-rounded-md wf-p-sm wf-stack wf-gap-xs">
              <div class="wf-row wf-between">
                <b class="wf-text-sm">{c.name}</b>
                <span class="wf-text-xs wf-text-tertiary">{c.type === 'production' ? '🏭 生产级' : c.type === 'showcase' ? '✨ 自举' : '📦 模板'}</span>
              </div>
              <span class="wf-text-xs wf-text-secondary">{c.desc}</span>
              <span class="wf-cluster wf-gap-xs">{c.highlights.slice(0, 3).map((h) => <Tag key={h}>{h}</Tag>)}</span>
              {c.url && <a class="wf-text-xs wf-text-primary" href={c.url} target="_blank" style="text-decoration:none">查看 →</a>}
            </div>
          ))}
        </div>
      </div>

      <div class="wf-surface wf-border wf-rounded-md wf-p-md wf-stack wf-gap-sm">
        <b>⚡ 快速开始（四步走）</b>
        <div class="wf-cluster wf-gap-sm">
          {[
            ['1. 选组件', '/components'],
            ['2. 拼页面', '/patterns'],
            ['3. 组应用', '/apps'],
            ['4. 质量标准', '/guides/quality'],
          ].map(([t, p]) => (
            <a key={p} href={p} class="wf-tag wf-tag--primary" style="text-decoration:none">{t}</a>
          ))}
        </div>
        <p class="wf-text-xs wf-text-tertiary wf-m-0">LLM 路径：read content/index.md → 目标 .md → 复制 examples/ 源码——与本平台同源</p>
      </div>
    </div>
  )
}
