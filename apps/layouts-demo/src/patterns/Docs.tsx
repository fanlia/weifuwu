import type { Component } from 'weifuwu/client'
import { Anchor, Breadcrumb, Button } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 2：文档站（Docs Site）
//
// 顶部导航 + 左侧章节目录（Anchor 滚动跟随）+ 右侧正文（prose 排版）。
// 使用 weifuwu/layout：wf-row / wf-gap-* / wf-prose / wf-container / wf-sticky
// ─────────────────────────────────────────────────────────────

const DOC_SECTIONS = [
  { id: 'intro', title: '快速开始' },
  { id: 'install', title: '安装' },
  { id: 'usage', title: '基本用法' },
  { id: 'theme', title: '主题定制' },
  { id: 'ssr', title: '服务端渲染' },
  { id: 'api', title: 'API 参考' },
]

const LOREM = '在 weifuwu 中，布局由 189 个原子原语（wf-stack / wf-row / wf-grid / wf-split…）与组件族（Layout / NavMenu / PageHeader…）组合而成。原子原语只做一件事：把元素按某一种空间关系排列。组合它们，就能搭建任意界面——从后台管理台到数据大屏。'

export const Docs: Component = (_init, _ctx) => (
  () => (
    <div class="wf-stack wf-gap-none" style={{ minHeight: 'calc(100vh - 48px)' }}>
      {/* 顶部导航 */}
      <header class="wf-row wf-pad-md wf-gap-lg" style={{ borderBottom: '1px solid var(--wf-color-border-light)', justifyContent: 'space-between', alignItems: 'center' }}>
        <div class="wf-row wf-gap-md" style={{ alignItems: 'center' }}>
          <b style={{ fontSize: 16 }}>📖 weifuwu 文档</b>
          <span class="wf-text-secondary" style={{ fontSize: 13 }}>布局原语指南</span>
        </div>
        <div class="wf-row wf-gap-md">
          <Button size="sm" variant="ghost">GitHub</Button>
          <Button size="sm" variant="primary">v0.69.0</Button>
        </div>
      </header>

      {/* 主体：左目录 + 右正文 */}
      <div class="wf-row" style={{ flex: 1, alignItems: 'stretch', gap: 0, flexWrap: 'nowrap' }}>
        {/* 左侧章节目录（sticky 跟随滚动） */}
        <aside class="wf-pad-lg wf-stack wf-gap-sm wf-hidden@md" style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--wf-color-border-light)' }}>
          <span class="wf-text-secondary" style={{ fontSize: 13, paddingBottom: 8 }}>目录</span>
          <Anchor items={DOC_SECTIONS.map((s) => ({ href: `#${s.id}`, title: s.title }))} />
        </aside>

        {/* 右侧正文（prose 排版 + 章节锚点） */}
        <main class="wf-fill wf-pad-lg" style={{ overflow: 'auto' }}>
          <Breadcrumb items={[{ label: '首页' }, { label: '文档' }, { label: '布局指南' }]} />
          <div class="wf-container" style={{ maxWidth: 720 }}>
            <div class="wf-prose">
              <h1 id="intro">快速开始</h1>
              <p>{LOREM}</p>
              <pre>{`<div class="wf-stack wf-gap-md">
  <h1>标题</h1>
  <p>纵向堆叠段落</p>
</div>`}</pre>

              <h2 id="install">安装</h2>
              <p>安装 weifuwu 并引入布局样式：</p>
              <pre>{`npm i weifuwu
// server.ts
app.get('/layout.css', (req, ctx) => ctx.ui.css('weifuwu/layout/weifuwu-layout.css'))`}</pre>

              <h2 id="usage">基本用法</h2>
              <p>{LOREM} 原子原语可以像乐高一样自由嵌套：外层定空间关系，内层定内容呈现。</p>

              <h2 id="theme">主题定制</h2>
              <p>所有间距、断点、圆角、颜色均以 CSS 变量暴露（--wf-gap-*、--wf-bp-*、--wf-color-*），覆盖变量即换肤。</p>

              <h2 id="ssr">服务端渲染</h2>
              <p>布局纯 CSS + 无状态组件，天然适配 SSR——uiSsr 路由级渲染时布局零成本。</p>

              <h2 id="api">API 参考</h2>
              <p>189 个原语按用途分组：排列（stack/row/grid/split）、定位（fixed/sticky/fill）、装饰（surface/prose）等。</p>
            </div>
          </div>
        </main>
      </div>

      {/* footer */}
      <footer class="wf-pad-md wf-text-secondary wf-center" style={{ borderTop: '1px solid var(--wf-color-border-light)', fontSize: 13 }}>
        weifuwu/layout · 189 原语 · 开源 MIT
      </footer>
    </div>
  )
)

// register({ id: 'docs', name: '文档站', desc: '顶部导航 + 左侧目录锚点 + prose 正文', comp: Docs })
