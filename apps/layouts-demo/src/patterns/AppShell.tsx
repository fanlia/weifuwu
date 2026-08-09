import type { Component } from 'weifuwu/client'
import { Button, PageHeader, Table, Badge, Icon, Divider, StatCard, Space, Card } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 1：后台应用壳（App Shell）
//
// 最经典的后台布局：左侧可折叠导航 + 右侧内容区。
// 100% 使用 weifuwu/layout 原语 + weifuwu/components 组件：
//   - wf-app-shell / wf-sidebar / wf-nav / wf-nav--collapsed / wf-main
//   - 折叠 = --wf-sidebar-width 收窄 + wf-nav--collapsed（原语组合）
// 复制此文件即可得到一个标准后台。
// ─────────────────────────────────────────────────────────────

const NAV = [
  { key: 'dashboard', icon: 'dashboard', label: '仪表盘', active: true },
  { key: 'orders', icon: 'box', label: '订单管理', active: false },
  { key: 'users', icon: 'users', label: '用户管理', active: false },
  { key: 'goods', icon: 'tag', label: '商品管理', active: false },
  { key: 'settings', icon: 'settings', label: '系统设置', active: false },
]

export const AppShell: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.collapsed = false

  return () => (
    <div
      class="wf-app-shell wf-rounded-lg"
      style={{ height: 'calc(100vh - 48px)', overflow: 'hidden', '--wf-sidebar-width': $.collapsed ? '64px' : '240px' }}
    >
      {/* ── 左侧导航栏 ── */}
      <aside class="wf-sidebar">
        <div class="wf-sidebar-header wf-between">
          {$.collapsed ? (
            <Icon name="zap" size={18} className="wf-text-primary" />
          ) : (
            <Space>
              <Icon name="zap" size={18} className="wf-text-primary" />
              <b class="wf-text-bold">Acme 管理台</b>
            </Space>
          )}
          <Button
            size="sm"
            variant="ghost"
            title={$.collapsed ? '展开侧栏' : '折叠侧栏'}
            onClick={() => { $.collapsed = !$.collapsed }}
          >
            <Icon name={$.collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
          </Button>
        </div>
        <div class="wf-sidebar-body">
          <nav class={`wf-nav${$.collapsed ? ' wf-nav--collapsed' : ''}`}>
            {NAV.map((n) => (
              <a
                key={n.key}
                class={`wf-nav-item${n.active ? ' wf-nav-item--active' : ''}`}
                href="#/app-shell"
                title={$.collapsed ? n.label : undefined}
              >
                <span class="wf-nav-icon"><Icon name={n.icon as any} size={16} /></span>
                <span class="wf-nav-label">{n.label}</span>
              </a>
            ))}
          </nav>
        </div>
        <div class="wf-sidebar-footer">
          {$.collapsed
            ? <Icon name="shield" size={14} className="wf-text-tertiary" />
            : <span class="wf-text-tertiary wf-text-xs">v2.4.0 · 内部系统</span>}
        </div>
      </aside>

      {/* ── 右侧主区 ── */}
      <main class="wf-main">
        {/* 顶栏 */}
        <div class="wf-between wf-p-md wf-border-b">
          <Space>
            <Button size="sm" variant="ghost"><Icon name="star" size={14} /> 收藏</Button>
            <Button size="sm" variant="ghost"><Icon name="bell" size={14} /> 通知</Button>
          </Space>
          <Space>
            <span class="wf-text-secondary wf-text-sm">管理员</span>
            <Badge variant="primary">角色</Badge>
          </Space>
        </div>

        {/* 内容区 */}
        <div class="wf-main wf-p-lg wf-scroll">
          <PageHeader title="订单管理" sub="查看和处理所有订单" display>
            <Button variant="primary"><Icon name="plus" size={14} /> 新建订单</Button>
          </PageHeader>

          <div class="wf-grid wf-mt-md" style={{ '--wf-cols': 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            <StatCard label="今日订单" value="128" trend="up" trendLabel="+12% 昨日" icon="📦" />
            <StatCard label="待发货" value="23" trend="down" trendLabel="-5% 昨日" icon="📬" />
            <StatCard label="销售额" value="¥42,860" trend="up" trendLabel="+8.6% 昨日" icon="💰" />
          </div>

          <Divider />

          <Card outlined>
            <Table
              data={[
                { id: 'A-1001', customer: '张伟', amount: '¥1,280', status: '已支付', v: 'success' },
                { id: 'A-1002', customer: '李娜', amount: '¥560', status: '待发货', v: 'warning' },
                { id: 'A-1003', customer: '王强', amount: '¥3,200', status: '已完成', v: 'default' },
                { id: 'A-1004', customer: '赵敏', amount: '¥890', status: '已取消', v: 'danger' },
              ]}
              columns={[
                { key: 'id', label: '订单号' },
                { key: 'customer', label: '客户' },
                { key: 'amount', label: '金额' },
                { key: 'status', label: '状态', render: (v, row) => <Badge variant={row.v}>{v}</Badge> },
              ]}
            />
          </Card>
        </div>
      </main>
    </div>
  )
}

