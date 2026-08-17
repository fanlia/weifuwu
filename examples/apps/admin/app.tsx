/**
 * admin 应用模板——管理后台（AppShell + 多页 + 表格，完整全栈复制即用）
 *
 * 演示能力：
 *   - Layout 组件骨架（Sider 折叠 + Header + Content）+ 路由 layout 包裹复用
 *   - Table 排序 + StatCard KPI + 菜单导航（源于 agent-platform 架构提炼）
 *   - 后端：MemorySql 订单表（api.ts 注册函数——独立/嵌入共享）
 */
import { createRouter, h, createStore } from 'weifuwu/ui-dom'
import type { Component } from 'weifuwu/ui-dom'
import { Layout, LayoutHeader, LayoutSider, LayoutContent, Menu, StatCard, Table, Badge, Tag, ThemeSwitch, PageHeader, EmptyState } from 'weifuwu/components'

export interface Order { id: string; customer: string; amount: number; status: 'pending' | 'paid' | 'shipped'; date: string }

export const adminStore = createStore<{ orders: Order[]; loading: boolean }>({ orders: [], loading: true })

export async function loadOrders(): Promise<void> {
  const res = await fetch('/api/admin/orders')
  const data = await res.json()
  adminStore.update((s) => { s.orders = data.rows; s.loading = false })
}

const statusTag = (s: Order['status']) =>
  s === 'paid' ? <Tag variant="success">已支付</Tag> : s === 'shipped' ? <Tag variant="primary">已发货</Tag> : <Tag>待支付</Tag>

/** 仪表盘页 */
export const DashboardPage: Component = async (_init: any, ctx: any) => {
  void loadOrders()
  const state = ctx.ui.useExternal(adminStore)
  const paid = state.state.orders.filter((o: Order) => o.status === 'paid' || o.status === 'shipped')
  const total = state.state.orders.reduce((a: number, o: Order) => a + o.amount, 0)
  return async (_p: any) => (
    <div class="wf-stack wf-gap-md">
      <PageHeader title="仪表盘" sub="KPI + 订单概览（数据来自 MemorySql）" />
      <div class="wf-grid" style="--wf-cols:repeat(auto-fit,minmax(180px,1fr));--wf-gap:12px">
        <StatCard label="订单总数" value={state.state.orders.length} />
        <StatCard label="已支付/发货" value={paid.length} />
        <StatCard label="销售总额" value={`¥${total.toLocaleString()}`} />
        <StatCard label="待处理" value={state.state.orders.filter((o: Order) => o.status === 'pending').length} />
      </div>
      {state.state.loading ? <div class="wf-text-secondary">加载中…</div> : (
        <Table
          columns={[
            { key: 'id', label: '订单号' },
            { key: 'customer', label: '客户' },
            { key: 'amount', label: '金额', sortable: true, render: (v: any) => `¥${Number(v).toLocaleString()}` },
            { key: 'date', label: '日期' },
            { key: 'status', label: '状态', render: (v: any) => statusTag(v) },
          ]}
          data={state.state.orders}
         
        />
      )}
    </div>
  )
}

/** 订单页（全量表格 + 筛选） */
export const OrdersPage: Component = async (_init: any, ctx: any) => {
  void loadOrders()
  const state = ctx.ui.useExternal(adminStore)
  let q = ''
  return async (_p: any) => {
    const list = state.state.orders.filter((o: Order) => !q || o.customer.toLowerCase().includes(q.toLowerCase()) || o.id.includes(q))
    return (
      <div class="wf-stack wf-gap-md">
        <PageHeader title="订单管理" sub={`共 ${list.length} 条`}>
          <input class="wf-input" style="max-width:200px" placeholder="搜索客户/订单号…" value={q}
            onInput={(e: any) => { q = (e.target as HTMLInputElement).value; ctx.ui.render() }} />
        </PageHeader>
        {list.length === 0 && !state.state.loading ? <EmptyState text="无匹配订单" /> : (
          <Table
            columns={[
              { key: 'id', label: '订单号' },
              { key: 'customer', label: '客户', sortable: true },
              { key: 'amount', label: '金额', sortable: true, render: (v: any) => `¥${Number(v).toLocaleString()}` },
              { key: 'date', label: '日期' },
              { key: 'status', label: '状态', render: (v: any) => statusTag(v) },
            ]}
            data={list}
           
          />
        )}
      </div>
    )
  }
}

// ── 路由（layout 包裹 = AppShell 复用——跨页保持侧栏/折叠状态） ──
export const adminRoutes = [
  { path: '/', render: () => h(DashboardPage, {}) },
  { path: '/orders', render: () => h(OrdersPage, {}) },
]

const AppShell: Component = async (_init: any, ctx: any) => {
  let collapsed = false
  const current = () => location.hash.replace('#/', '') || '/'
  return async (props: any) => (
    <Layout style="min-height:420px;border:1px solid var(--wf-color-border);border-radius:8px;overflow:hidden">
      <LayoutSider collapsed={collapsed} collapsible onCollapse={(c) => { collapsed = c; ctx.ui.render() }} width={200}>
        <div style={{ background: "var(--wf-color-bg-secondary)", height: "100%" }}>
        <div class="wf-p-sm wf-text-bold" style="color:var(--wf-color-text)">⚙️ 管理后台</div>
        <Menu
          items={[
            { key: '/', label: '仪表盘' },
            { key: '/orders', label: '订单管理' },
          ]}
          activeKey={current()}
          collapsible
          collapsed={collapsed}
          onCollapseChange={(c) => { collapsed = c; ctx.ui.render() }}
          onSelect={(k: string) => { location.hash = `#/${k === '/' ? '' : k}` }}
        />
        </div>
      </LayoutSider>
      <Layout>
        <LayoutHeader style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
          <Badge variant="success">admin 模板</Badge>
          <ThemeSwitch />
        </LayoutHeader>
        <LayoutContent style="padding:16px">{props.page}</LayoutContent>
      </Layout>
    </Layout>
  )
}

export const adminAppShell = AppShell

export function createAdminApp(root: HTMLElement, options?: { history?: boolean }): ReturnType<typeof createRouter> {
  const routes = adminRoutes.map((r) => ({ ...r, layout: (page: any) => h(AppShell, { page }) }))
  return createRouter(routes, root, options?.history === false
    ? { history: false, initialPath: location.hash.replace('#/', '') || '/' }
    : undefined)
}

export const pathFromHash = (): string => location.hash.replace(/^#/, '') || '/'
