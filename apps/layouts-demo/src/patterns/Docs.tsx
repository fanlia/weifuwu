import type { Component } from 'weifuwu/ui-dom'
import {Title,Paragraph, Anchor, BackTop, Breadcrumb, Button, CodeBlock, Divider, Icon, Tag, Space, } from 'weifuwu/components'


// ─────────────────────────────────────────────────────────────
// 模式 2：文档站（Docs Site）
//
// 顶部导航 + 左侧章节目录（Anchor 滚动跟随）+ 右侧正文（prose 排版）。
// 100% 原语 + 组件：wf-row / wf-gap-* / wf-prose / wf-container / wf-border-t
//   Anchor（目录）、Breadcrumb（面包屑）、CodeBlock（代码）、Tag（版本）
// ─────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'intro', title: '快速开始' },
  { id: 'install', title: '安装' },
  { id: 'usage', title: '基本用法' },
  { id: 'theme', title: '主题定制' },
  { id: 'ssr', title: '服务端渲染' },
  { id: 'api', title: 'API 参考' },
]

export const Docs: Component = async (_init, ctx) => {
  let mainEl: HTMLElement | undefined

  return () => (
    <div class="wf-stack wf-gap-none" style={{ minHeight: 'calc(100vh - 48px)' }}>
      {/* 顶部导航 */}
      <header class="wf-row wf-p-md wf-gap-lg wf-border-b wf-between">
        <Space align="center">
          <Icon name="book-open" size={18} />
          <b class="wf-text-bold">weifuwu 文档</b>
          <span class="wf-text-tertiary wf-text-sm">布局原语指南</span>
        </Space>
        <Space>
          <Button size="sm" variant="ghost"><Icon name="github" size={14} /> GitHub</Button>
          <Tag variant="primary">v0.69.0</Tag>
        </Space>
      </header>

      {/* 主体：左目录 + 右正文 */}
      <div class="wf-row wf-gap-none wf-fill wf-stretch wf-nowrap">
        <aside class="wf-p-lg wf-border-r wf-sticky" style={{ width: 220, flexShrink: 0 }}>
          <span class="wf-text-tertiary wf-text-sm wf-block wf-mb-sm">目录</span>
          <Anchor
            container={() => mainEl ?? window}
            items={SECTIONS.map((s) => ({ href: `#${s.id}`, title: s.title }))}
          />
        </aside>

        <main
          ref={(el: any) => { if (el) mainEl = el }}
          class="wf-fill wf-p-lg wf-scroll"
        >
          <Breadcrumb items={[{ label: '首页' }, { label: '文档' }, { label: '布局指南' }]} />
          <div class="wf-container wf-prose wf-mt-md" style={{ maxWidth: 720 }}>
            <Title level={1}>快速开始</Title>
            <Paragraph>
              在 weifuwu 中，布局由原子原语（wf-stack / wf-row / wf-grid / wf-split…）与组件族组合而成。
              原子原语只做一件事：把元素按某一种空间关系排列。组合它们即可搭建任意界面。
            </Paragraph>
            <CodeBlock lang="html" code={`<div class="wf-stack wf-gap-md">
  <h1>标题</h1>
  <p>纵向堆叠段落</p>
</div>`} />

            <Divider />

            <Title level={2}>安装</Title>
            <Paragraph>安装 weifuwu 并引入布局样式：</Paragraph>
            <CodeBlock lang="bash" code={`npm i weifuwu
# server.ts
app.get('/layout.css', (req, ctx) => ctx.ui.css('weifuwu/layout'))`} />

            <Divider />

            <Title level={2}>基本用法</Title>
            <Paragraph>
              原子原语可以像乐高一样自由嵌套：外层定空间关系，内层定内容呈现。
              间距、断点、圆角、颜色均以 CSS 变量暴露（--wf-gap-*、--wf-bp-*、--wf-color-*），覆盖变量即换肤。
            </Paragraph>

            <Divider />

            <Title level={2}>服务端渲染</Title>
            <Paragraph>布局纯 CSS + 无状态组件，天然适配 SSR——路由级渲染时布局零成本。</Paragraph>

            <Divider />

            <Title level={2}>API 参考</Title>
            <Paragraph>原子原语按用途分组：排列（stack/row/grid/split）、定位（fixed/sticky/fill）、装饰（surface/prose）等。</Paragraph>
          </div>
        </main>
      </div>

      {/* footer */}
      <footer class="wf-cluster wf-p-md wf-border-t">
        <span class="wf-text-tertiary wf-text-sm">weifuwu/layout · 58 布局原语 · 136 工具类 · 开源 MIT</span>
      </footer>

      {/* 返回顶部（BackTop——组件能力展示：target 指向壳内部滚动容器） */}
      <BackTop target={() => ctx.browser?.query('.wf-fill.wf-scroll') as HTMLElement} />
    </div>
  )
}

