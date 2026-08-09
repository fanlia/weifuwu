import type { Component } from 'weifuwu/client'
import { Button, PageHeader, Table, Badge } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 1：后台应用壳（App Shell）
//
// 最经典的后台布局：左侧固定导航 + 右侧内容区（顶栏 + 面包屑 + 主体）。
// 使用 weifuwu/layout 应用壳原语：wf-app-shell / wf-sidebar / wf-nav / wf-main
// —— app-shell.css 已内置移动端自适应（窄屏侧栏自动收为顶部抽屉）。
//
// 复制此组件 + 你的路由表即可得到一个标准后台。
// ─────────────────────────────────────────────────────────────

const NAV = [
  { key: 'dashboard', icon: '📊', label: '仪表盘', active: true },
  { key: 'orders', icon: '📦', label: '订单管理' },
  { key: 'users', icon: '👥', label: '用户管理' },
  { key: 'goods', icon: '🏷️', label: '商品管理' },
  { key: 'settings', icon: '⚙️', label: '系统设置' },
]

const ORDERS = [
  { id: 'A-1001', customer: '张伟', amount: '¥1,280', status: '已支付', statusType: 'success' },
  { id: 'A-1002', customer: '李娜', amount: '¥560', status: '待发货', statusType: 'warning' },
  { id: 'A-1003', customer: '王强', amount: '¥3,200', status: '已完成', statusType: 'default' },
  { id: 'A-1004', customer: '赵敏', amount: '¥890', status: '已取消', statusType: 'danger' },
]

export const AppShell: Component = (_init, _ctx) => () => (
  <div class="wf-app-shell" style={{ height: 'calc(100vh - 48px)', borderRadius: 12, overflow: 'hidden' }}>
    {/* ── 左侧导航栏 ── */}
    <aside class="wf-sidebar">
      <div class="wf-sidebar-header">
        <b style={{ fontSize: 16 }}>⛩️ Acme 管理台</b>
      </div>
      <div class="wf-sidebar-body">
        <nav class="wf-nav">
          {NAV.map((n) => (
            <a
              class={`wf-nav-item${n.active ? ' wf-nav-item--active' : ''}`}
              href="#/app-shell"
              key={n.key}
            >
              <span class="wf-nav-icon">{n.icon}</span>
              {n.label}
            </a>
          ))}
        </nav>
      </div>
      <div class="wf-sidebar-footer wf-text-secondary" style={{ fontSize: 12 }}>
        v2.4.0 · 内部系统
      </div>
    </aside>

    {/* ── 右侧主区 ── */}
    <main class="wf-main">
      {/* 顶栏：搜索 + 用户操作 */}
      <div class="wf-row wf-gap-md wf-pad-md" style={{ borderBottom: '1px solid var(--wf-color-border-light)', justifyContent: 'space-between' }}>
        <div class="wf-row wf-gap-md">
          <Button size="sm">📌 收藏</Button>
          <Button size="sm" variant="ghost">🔔 通知</Button>
        </div>
        <div class="wf-row wf-gap-md">
          <span class="wf-text-secondary" style={{ fontSize: 13 }}>管理员</span>
          <Badge>角色</Badge>
        </div>
      </div>

      {/* 内容区（滚动） */}
      <div class="wf-main wf-pad-lg" style={{ overflow: 'auto' }}>
        <PageHeader title="订单管理" sub="查看和处理所有订单" display>
          <Button variant="primary">+ 新建订单</Button>
        </PageHeader>

        <div class="wf-grid" style={{ '--wf-cols': 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {[
            { label: '今日订单', value: '128', trend: 'up' },
            { label: '待发货', value: '23', trend: 'down' },
            { label: '销售额', value: '¥42,860', trend: 'up' },
          ].map((s) => (
            <div key={s.label} class="wf-card wf-pad-md wf-stack wf-gap-none">
              <span class="wf-text-secondary" style={{ fontSize: 13 }}>{s.label}</span>
              <b style={{ fontSize: 22 }}>{s.value}</b>
            </div>
          ))}
        </div>

        <div class="wf-card" style={{ marginTop: 16 }}>
          <Table
            data={ORDERS}
            columns={[
              { key: 'id', label: '订单号' },
              { key: 'customer', label: '客户' },
              { key: 'amount', label: '金额' },
              { key: 'status', label: '状态', render: (v) => <Badge variant={(v as any).statusType}>{v}</Badge> },
            ]}
          />
        </div>
      </div>
    </main>
  </div>
)

// register({ id: 'app-shell', name: '后台应用壳', desc: '侧栏导航 + 顶栏 + 内容区（后台管理标准）', comp: AppShell })
