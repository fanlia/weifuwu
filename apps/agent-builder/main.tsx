/**
 * agent-builder 入口——纯框架消费（零自定义组件/中间件）
 *
 * 形态：UIRouter（路径 → 页面 handler）+ uiServe（渲染落地）——
 * 页面组件全部用 weifuwu/components 组装 + wf-* 布局原语。
 */
import { UIRouter, uiServe, h } from 'weifuwu/vdom'
import type { Component, RenderCtx } from 'weifuwu/vdom'
import { Avatar, Button, Card, Icon, Tag } from 'weifuwu/components'

/** 首页——交互计数器（ctx.render 状态管理） */
const Home: Component = async (_props, ctx) => {
  let count = 0
  return async () => (
    <div class="wf-container wf-stack" style="--wf-max:640px;--wf-gap:16px;padding:48px 16px">
      <Card pad="lg">
        <div class="wf-stack wf-gap-sm wf-center" style="--wf-gap:12px">
          <Avatar name="W" size="lg" />
          <h1 class="wf-text-2xl wf-m-0">Hello, weifuwu!</h1>
          <p class="wf-text-secondary wf-m-0 wf-text-sm">
            纯框架应用——UIRouter + uiServe + weifuwu/components 组装，零自定义组件/中间件。
          </p>
          <div class="wf-row wf-gap-sm wf-center">
            <Tag>vdom</Tag>
            <Tag>components</Tag>
            <Tag>layout</Tag>
          </div>
          <Button variant="primary" onClick={() => { count++; ctx.render() }}>
            <Icon name="plus" size={14} /> 点击计数：{count}
          </Button>
          <div class="wf-row wf-gap-sm">
            <a href="/about" class="wf-text-sm" style="color:var(--wf-primary)">关于 →</a>
          </div>
        </div>
      </Card>
    </div>
  )
}

/** 关于页——展示组件组合 */
const About: Component = async (_props, _ctx) => {
  return async () => (
    <div class="wf-container wf-stack" style="--wf-max:640px;--wf-gap:16px;padding:48px 16px">
      <Card pad="lg">
        <div class="wf-stack wf-gap-sm" style="--wf-gap:8px">
          <h2 class="wf-text-xl wf-m-0">关于</h2>
          <p class="wf-text-sm wf-text-secondary wf-m-0">
            这是 apps/agent-builder——weifuwu 框架的最简消费形态：
            后端 serve + Router + ui 中间件，前端 UIRouter + uiServe，
            组件全部来自 weifuwu/components，布局用 wf-* 原语。
          </p>
          <a href="/" class="wf-text-sm" style="color:var(--wf-primary)">← 返回首页</a>
        </div>
      </Card>
    </div>
  )
}

const router = new UIRouter()
router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Home, {})))
router.get('/about', (req, ctx) => (ctx as RenderCtx).stream(h(About, {})))

uiServe(router, { root: '#root' })
