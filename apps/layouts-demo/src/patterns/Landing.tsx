import type { Component } from 'weifuwu/client'
import { Button, Badge, Avatar } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 5：营销落地页（Landing Page）
//
// Hero（全宽居中）+ 特性区（三列网格）+ CTA + Footer。
// 使用 wf-center / wf-container / wf-prose / wf-grid / wf-stack。
// 移动优先：窄屏单列堆叠，lg 起横向（wf-stack@lg）。
// ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '🧩', title: '原子原语', desc: '189 个布局原语组合任意界面，无框架锁定' },
  { icon: '⚡', title: '零依赖前端', desc: '纯函数组件 + Proxy 状态驱动，无 npm 运行时依赖' },
  { icon: '🌐', title: 'SSR 透明', desc: '路由级服务端渲染，hydration 零决策' },
  { icon: '🗄️', title: '全栈一体', desc: 'DB / Redis / 队列 / AI / WebSocket 一个框架搞定' },
]

export const Landing: Component = (_init, _ctx) => (
  () => (
    <div class="wf-stack wf-gap-none">
      {/* 顶部导航 */}
      <header class="wf-row wf-pad-md wf-gap-lg wf-container" style={{ justifyContent: 'space-between', alignItems: 'center', maxWidth: 1100 }}>
        <b style={{ fontSize: 18 }}>⚡ weifuwu</b>
        <nav class="wf-row wf-gap-lg wf-text-secondary" style={{ fontSize: 14 }}>
          <span>特性</span><span>文档</span><span>定价</span>
        </nav>
        <Button size="sm" variant="primary">开始使用</Button>
      </header>

      {/* Hero：全宽渐变 + 居中 */}
      <section class="wf-center wf-pad-xl" style={{ minHeight: 340, background: 'linear-gradient(135deg, var(--wf-color-primary-bg), var(--wf-color-bg-subtle))' }}>
        <div class="wf-stack wf-gap-md" style={{ maxWidth: 640, textAlign: 'center', alignItems: 'center' }}>
          <Badge variant="primary">v0.69.0 已发布</Badge>
          <h1 style={{ fontSize: 40, margin: 0, lineHeight: 1.2 }}>
            一个框架，
            <br />构建完整应用
          </h1>
          <p class="wf-text-secondary" style={{ fontSize: 16, maxWidth: 480 }}>
            后端中间件 + 前端响应式组件 + SSR，从数据库到像素，全程一个心智模型。
          </p>
          <div class="wf-row wf-gap-md wf-cluster" style={{ justifyContent: 'center' }}>
            <Button size="lg" variant="primary">免费开始</Button>
            <Button size="lg" variant="ghost">查看文档 →</Button>
          </div>
        </div>
      </section>

      {/* 特性区：三/四列网格 */}
      <section class="wf-container wf-pad-xl" style={{ maxWidth: 1100 }}>
        <div class="wf-grid" style={{ '--wf-cols': 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {FEATURES.map((f) => (
            <div key={f.title} class="wf-card wf-pad-lg wf-stack wf-gap-sm" style={{ borderRadius: 12 }}>
              <span style={{ fontSize: 28 }}>{f.icon}</span>
              <b>{f.title}</b>
              <span class="wf-text-secondary" style={{ fontSize: 14 }}>{f.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section class="wf-center wf-pad-xl" style={{ background: 'var(--wf-color-bg-subtle)' }}>
        <div class="wf-stack wf-gap-md" style={{ textAlign: 'center', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>准备构建你的下一个应用？</h2>
          <p class="wf-text-secondary">npm i weifuwu — 5 分钟跑通全栈</p>
          <Button variant="primary">🚀 立即上手</Button>
        </div>
      </section>

      {/* Footer */}
      <footer class="wf-row wf-pad-md wf-gap-lg wf-text-secondary" style={{ justifyContent: 'space-between', fontSize: 13, borderTop: '1px solid var(--wf-color-border-light)' }}>
        <span>© 2026 weifuwu</span>
        <div class="wf-row wf-gap-md">
          <Avatar size="sm" name="W" /> <span>Made with weifuwu</span>
        </div>
      </footer>
    </div>
  )
)

// register({ id: 'landing', name: '营销落地页', desc: 'Hero + 特性网格 + CTA + Footer', comp: Landing })
