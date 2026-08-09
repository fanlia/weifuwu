import type { Component } from 'weifuwu/client'
import {Title,Paragraph,Text, Badge, BackTop, Button, Card, Divider, Icon, Link, Space, Avatar } from 'weifuwu/components'


// ─────────────────────────────────────────────────────────────
// 模式 5：营销落地页（Landing Page）
//
// Hero（全宽居中）+ 特性区（三列网格）+ CTA + Footer。
// 100% 原语 + 组件：wf-center / wf-container / wf-grid / wf-gap-*
//   Badge、Card、Button、Tag
// ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: 'layers' as const, title: '原子原语', desc: '189 个布局原语组合任意界面，无框架锁定' },
  { icon: 'zap' as const, title: '零依赖前端', desc: '纯函数组件 + Proxy 状态驱动，无 npm 运行时依赖' },
  { icon: 'globe' as const, title: 'SSR 透明', desc: '路由级服务端渲染，hydration 零决策' },
  { icon: 'database' as const, title: '全栈一体', desc: 'DB / Redis / 队列 / AI / WebSocket 一个框架搞定' },
]

export const Landing: Component = (_init, ctx) => (
  () => (
    <div class="wf-stack wf-gap-none">
      {/* 顶部导航 */}
      <header class="wf-row wf-p-md wf-gap-lg wf-container wf-between wf-sticky wf-bg-secondary" style={{ maxWidth: 1100, top: 0 }}>
        <Space align="center">
          <Icon name="zap" size={20} className="wf-text-primary" />
          <b class="wf-text-bold wf-text-lg">weifuwu</b>
        </Space>
        <Space size="lg" align="center">
          <Link href="#features" underline={false} variant="muted">特性</Link>
          <Link href="#docs" underline={false} variant="muted">文档</Link>
          <Link href="#pricing" underline={false} variant="muted">定价</Link>
        </Space>
        <Button size="sm" variant="primary">开始使用</Button>
      </header>

      {/* Hero：全宽 + 居中 */}
      <section class="wf-center wf-p-xl wf-bg-primary">
        <div class="wf-stack wf-gap-md wf-text-center" style={{ maxWidth: 640 }}>
          <Badge variant="primary">v0.69.0 已发布</Badge>
          <Title level={1} className="wf-text-display">
            一个框架，<br />构建完整应用
          </Title>
          <Paragraph className="wf-text-secondary" style={{ maxWidth: 480 }}>
            后端中间件 + 前端响应式组件 + SSR，从数据库到像素，全程一个心智模型。
          </Paragraph>
          <div class="wf-row wf-gap-md wf-cluster wf-center">
            <Button size="lg" variant="primary">免费开始</Button>
            <Button size="lg" variant="ghost">查看文档 <Icon name="arrow-right" size={14} /></Button>
          </div>
        </div>
      </section>

      {/* 特性区 */}
      <section class="wf-container wf-p-xl" style={{ maxWidth: 1100 }}>
        <div class="wf-grid" style={{ '--wf-cols': 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {FEATURES.map((f) => (
            <Card outlined key={f.title} padding="lg">
              <Space direction="vertical" size="md">
                <Icon name={f.icon} size={28} className="wf-text-primary" />
                <b>{f.title}</b>
                <Text type="secondary" className="wf-text-sm">{f.desc}</Text>
              </Space>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section class="wf-center wf-p-xl wf-bg-secondary">
        <div class="wf-stack wf-gap-md wf-center wf-text-center">
          <Title level={2}>准备构建你的下一个应用？</Title>
          <Paragraph className="wf-text-secondary">npm i weifuwu — 5 分钟跑通全栈</Paragraph>
          <Button variant="primary" size="lg"><Icon name="zap" size={16} /> 立即上手</Button>
        </div>
      </section>

      {/* Footer */}
      <BackTop target={() => ctx.browser?.query('.wf-fill.wf-scroll') as HTMLElement} />
      <footer class="wf-row wf-p-md wf-gap-lg wf-border-t wf-container wf-between" style={{ maxWidth: 1100 }}>
        <Text type="secondary" className="wf-text-sm">© 2026 weifuwu</Text>
        <Space align="center" size="sm">
          <Avatar size="sm" name="W" />
          <Text type="secondary" className="wf-text-sm">Made with weifuwu</Text>
        </Space>
      </footer>
    </div>
  )
)

