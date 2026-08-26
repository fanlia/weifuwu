/**
 * 首页——六域入口 + 计数（registry 计算，非硬编码）+ 快速开始
 */
import { h } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { Badge, Tag } from 'weifuwu/components'
import { fetchIndex } from '../data.ts'
import { createClientBrowser } from 'weifuwu/vdom'
import { DOMAINS } from '../shell.tsx'

export const Home: Component = async (_init: any, ctx: any) => {
  const idx = await fetchIndex()
  // ── 进行态语言活体（微流明·流）：打字机循环——"进行中"是可见的流 ──
  const WORDS = ['AI 对话', '数据看板', '管理后台', 'SaaS 地基']
  const browser = ctx.browser ?? createClientBrowser()
  let word = 0
  let chars = 0
  let timerId = 0
  const tick = () => {
    const w = WORDS[word]
    chars += 1
    if (chars > w.length + 6) { word = (word + 1) % WORDS.length; chars = 0 }
    ctx.render()
    timerId = browser.timeout(tick, chars > w.length ? 500 : 120)
  }
  timerId = browser.timeout(tick, 400)
  ctx.ui.onUnmount?.(() => { if (timerId) clearTimeout(timerId) })
  const typed = () => WORDS[word].slice(0, chars)

  return async (_p: any) => (
    <div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:24px;padding:32px 16px">
      <div class="wf-border wf-rounded-lg wf-clip" style="background:linear-gradient(180deg,var(--wf-color-bg) 0%,var(--wf-color-bg-secondary) 100%)">
        <div class="wf-stack wf-gap-lg" style="padding:48px 32px;text-align:center">
          <div class="wf-stack wf-gap-sm">
            <h1 class="wf-text-4xl wf-m-0" style="letter-spacing:-0.02em">
              weifuwu <span class="wf-text-primary">发展引擎</span>
            </h1>
            <p class="wf-text-secondary wf-text-base wf-m-0" style="max-width:560px;margin-inline:auto">
              一个 npm 包 = 后端 HTTP + 前端 VDOM + <b class="wf-text-primary">{idx.counts.components}</b> 组件
              + CSS 设计系统 + SaaS 地基——全自研、零构建
            </p>
          </div>
          {/* 进行态语言活体：打字机（微流明·流——AI 界面活着） */}
          <div class="wf-center">
            <div class="wf-row wf-gap-xs" style="font-size:15px">
              <span class="wf-text-tertiary">你正在构建</span>
              <span class="wf-text-primary" style="font-weight:600;min-width:130px;text-align:left">{typed()}<span class="wf-hero-cursor">▍</span></span>
            </div>
          </div>
          {/* 流式代码行（可解释表面：命令即所得） */}
          <div>
            <div class="wf-surface wf-surface--flat wf-border wf-rounded-md wf-text-xs" style="font-family:var(--wf-font-mono);text-align:left;max-width:520px;margin-inline:auto;padding:12px 16px;background:var(--wf-color-bg)">
              <div><span class="wf-text-primary">$</span> npx weifuwu docs</div>
              <div class="wf-text-tertiary">→ http://localhost:4000 · 文档站已就绪（{idx.counts.components} 组件 · {idx.counts.guides} 指南）</div>
              <div><span class="wf-text-primary">$</span> node server.ts</div>
              <div class="wf-text-tertiary">→ 你的第一个页面，跑起来了</div>
            </div>
          </div>
          {/* 微流明三面孔（边界即结构：1px 细边框卡片——层级 = 表面 + 边界） */}
          <div class="wf-grid" style="--wf-cols:repeat(auto-fit,minmax(min(100%,210px),1fr));--wf-gap:10px;text-align:left">
            {[
              ['微 · 边界即结构', '1px 细边框是设计主角——层级 = 表面 + 边界组合，非阴影堆叠'],
              ['流 · 进行态语言', '加载是流动的进行态——流式渐显 / thinking 脉冲 / 进度透明'],
              ['明 · 可解释表面', '状态链完整可推导——数据身份可见（data-wf-key / data-wf-id 落 DOM）'],
            ].map(([t, d]) => (
              <div key={t} class="wf-surface wf-surface--flat wf-border wf-rounded-md wf-p-sm">
                <b class="wf-text-sm wf-text-primary">{t}</b>
                <p class="wf-text-xs wf-text-secondary wf-m-0 wf-mt-xs">{d}</p>
              </div>
            ))}
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
          <a key={d.path} href={d.path} class="wf-surface wf-surface--flat wf-border wf-rounded-md wf-p-md wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
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
              class="wf-surface wf-surface--flat wf-border wf-rounded-md wf-p-sm wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
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
            <div key={c.id} class="wf-surface wf-surface--flat wf-border wf-rounded-md wf-p-sm wf-stack wf-gap-xs">
              <div class="wf-row wf-between">
                <b class="wf-text-sm">{c.name}</b>
                <span class="wf-text-xs wf-text-tertiary">{c.type === 'production' ? '🏭 生产级' : c.type === 'showcase' ? '✨ 自举' : '📦 模板'}</span>
              </div>
              <span class="wf-text-xs wf-text-secondary">{c.desc}</span>
              <span class="wf-cluster wf-gap-xs">{c.highlights.slice(0, 3).map((h) => <Tag key={h}>{h}</Tag>)}</span>
              {c.url && <a class="wf-text-xs wf-text-primary" href={c.url} target="_blank" style="text-decoration:none">查看 →</a>}
            </div>
          ))}
          <a href="/community" class="wf-surface wf-surface--flat wf-border wf-rounded-md wf-p-sm wf-stack wf-gap-xs" style="text-decoration:none;color:inherit;border-style:dashed">
            <b class="wf-text-sm wf-text-primary">+ 社区组件</b>
            <span class="wf-text-xs wf-text-secondary">外部贡献收录——你的第一个组件从这里开始</span>
          </a>
        </div>
      </div>

      <div class="wf-surface wf-surface--flat wf-border wf-rounded-md wf-p-md wf-stack wf-gap-sm">
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
