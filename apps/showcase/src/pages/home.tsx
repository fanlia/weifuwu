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
      <div class="wf-border wf-radius-lg wf-overflow-hidden" style="background:linear-gradient(180deg,var(--wf-color-bg) 0%,var(--wf-color-bg-secondary) 100%)">
        <div class="wf-stack wf-gap-lg" style="padding:48px 32px;text-align:center">
          <div class="wf-stack wf-gap-sm">
            <h1 class="wf-font-4xl wf-margin-none" style="letter-spacing:-0.02em">
              weifuwu <span class="wf-text-primary">发展引擎</span>
            </h1>
            <p class="wf-text-secondary wf-font-base wf-margin-none" style="max-width:560px;margin-inline:auto">
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
            <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-font-xs" style="font-family:var(--wf-font-mono);text-align:left;max-width:520px;margin-inline:auto;padding:12px 16px;background:var(--wf-color-bg)">
              <div><span class="wf-text-primary">$</span> npm install weifuwu</div>
              <div class="wf-text-tertiary">→ 一个包 = 后端 + vdom + {idx.counts.components} 组件 + 布局系统</div>
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
              <div key={t} class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-sm">
                <b class="wf-font-sm wf-text-primary">{t}</b>
                <p class="wf-font-xs wf-text-secondary wf-margin-none wf-margin-top-xs">{d}</p>
              </div>
            ))}
          </div>
          <div class="wf-cluster wf-gap-sm" style="justify-content:center">
            <Badge variant="primary">{idx.counts.components} 组件</Badge>
            <Badge variant="info">{idx.counts.primitives} 布局原语</Badge>
          </div>
        </div>
      </div>

      <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(min(100%,240px),1fr));--wf-gap:12px">
        {[
          { path: '/components', name: '组件', num: idx.counts.components, desc: '逐组件文档：API 表 + 纪律 + 关系 + 验证', icon: 'grid' },
          { path: '/layout', name: '布局原语', num: idx.counts.primitives, desc: 'wf-* 原语与工具类，按族分组', icon: 'layout' },
        ].map((d) => (
          <a key={d.path} href={d.path} class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-md wf-stack wf-gap-xs" style="text-decoration:none;color:inherit">
            <span class="wf-font-2xl wf-bold wf-text-primary" style="font-family:var(--wf-font-mono)">{d.num}</span>
            <b class="wf-font-base">{d.name}</b>
            <span class="wf-font-xs wf-text-secondary">{d.desc}</span>
          </a>
        ))}
      </div>

    </div>
  )
}
