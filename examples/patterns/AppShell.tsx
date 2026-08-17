import type { Component } from 'weifuwu/ui-dom'
import { Button, PageHeader, Table, Badge, Icon, Divider, Pagination, StatCard, Space, Card, Text } from 'weifuwu/components'

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
  { key: 'dashboard', icon: 'dashboard', label: '仪表盘' },
  { key: 'orders', icon: 'box', label: '订单管理' },
  { key: 'users', icon: 'users', label: '用户管理' },
  { key: 'goods', icon: 'tag', label: '商品管理' },
  { key: 'settings', icon: 'settings', label: '系统设置' },
]

// 5 个视图内容（导航联动——每视图独立 PageHeader + 内容）
const USERS = [
  { id: 'U-001', name: '张伟', role: '管理员', email: 'zhang@acme.cn', v: 'primary' },
  { id: 'U-002', name: '李娜', role: '运营', email: 'li@acme.cn', v: 'default' },
  { id: 'U-003', name: '王强', role: '开发', email: 'wang@acme.cn', v: 'default' },
  { id: 'U-004', name: '赵敏', role: '客服', email: 'zhao@acme.cn', v: 'warning' },
]

const GOODS = [
  { id: 'G-101', name: '无线键盘', stock: 320, price: '¥199', status: '在售', v: 'success' },
  { id: 'G-102', name: '机械鼠标', stock: 58, price: '¥89', status: '补货中', v: 'warning' },
  { id: 'G-103', name: '显示器', stock: 12, price: '¥1299', status: '售罄', v: 'danger' },
  { id: 'G-104', name: '扩展坞', stock: 200, price: '¥159', status: '在售', v: 'success' },
]

export const AppShell: Component = async (_init, ctx) => {
  // render-only：内部状态 let + 显式 render（design 归档）
  let collapsed = false
  let nav = 'dashboard'
  let page = 1
  const rerender = () => ctx.ui.render()

  // 订单数据（分页演示——12 条 → 每页 5 条）
  const ORDERS_ALL = Array.from({ length: 12 }, (_, i) => ({
    id: `A-${2000 + i}`,
    customer: ['张伟', '李娜', '王强', '赵敏', '陈晨', '刘洋', '孙丽', '周杰', '吴磊', '郑爽', '钱进', '冯刚'][i],
    amount: `¥${(Math.round(Math.random() * 300) + 100) * 10}`,
    status: ['已支付', '待发货', '已完成', '已取消'][i % 4],
    v: (['success', 'warning', 'default', 'danger'] as const)[i % 4],
  }))
  return async () => (
    <div
      class="wf-app-shell wf-rounded-lg"
      style={{ height: 'calc(100vh - 48px)', overflow: 'hidden', '--wf-sidebar-width': collapsed ? '64px' : '240px' }}
    >
      {/* ── 左侧导航栏 ── */}
      <aside class="wf-sidebar">
        <div class="wf-sidebar-header wf-between">
          {collapsed ? (
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
            title={collapsed ? '展开侧栏' : '折叠侧栏'}
            onClick={() => { collapsed = !collapsed; rerender() }}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
          </Button>
        </div>
        <div class="wf-sidebar-body">
          <nav class={`wf-nav${collapsed ? ' wf-nav--collapsed' : ''}`}>
            {NAV.map((n) => (
              <a
                key={n.key}
                href="#/app-shell"
                class={`wf-nav-item wf-pointer${nav === n.key ? ' wf-nav-item--active' : ''}`}
                title={collapsed ? n.label : undefined}
                onClick={() => { nav = n.key; rerender() }}
              >
                <span class="wf-nav-icon"><Icon name={n.icon as any} size={16} /></span>
                <span class="wf-nav-label">{n.label}</span>
              </a>
            ))}
          </nav>
        </div>
        <div class="wf-sidebar-footer">
          {collapsed
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

        {/* 内容区（按导航切换） */}
        <div class="wf-main wf-p-lg wf-scroll">
          {nav === 'dashboard' && (
            <>
              <PageHeader title="仪表盘" sub="经营概览" display>
                <Button variant="primary" onClick={() => { nav = 'orders'; rerender() }}><Icon name="plus" size={14} /> 去下单</Button>
              </PageHeader>
              <div class="wf-grid" style={{ '--wf-cols': 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                <StatCard label="今日订单" value="128" trend="up" trendLabel="+12% 昨日" icon={<Icon name="box" size={24} className="wf-text-primary" />} />
                <StatCard label="待发货" value="23" trend="down" trendLabel="-5% 昨日" icon={<Icon name="inbox" size={24} className="wf-text-primary" />} />
                <StatCard label="销售额" value="¥42,860" trend="up" trendLabel="+8.6% 昨日" icon={<Icon name="bar-chart" size={24} className="wf-text-primary" />} />
                <StatCard label="客户数" value="1,024" trend="up" trendLabel="+3.2% 昨日" icon={<Icon name="users" size={24} className="wf-text-primary" />} />
              </div>
            </>
          )}
          {nav === 'orders' && (
            <>
              <PageHeader title="订单管理" sub="查看和处理所有订单" display>
                <Button variant="primary"><Icon name="plus" size={14} /> 新建订单</Button>
              </PageHeader>

          <div class="wf-grid wf-mt-md" style={{ '--wf-cols': 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            <StatCard label="今日订单" value="128" trend="up" trendLabel="+12% 昨日" icon={<Icon name="box" size={24} className="wf-text-primary" />} />
            <StatCard label="待发货" value="23" trend="down" trendLabel="-5% 昨日" icon={<Icon name="inbox" size={24} className="wf-text-primary" />} />
            <StatCard label="销售额" value="¥42,860" trend="up" trendLabel="+8.6% 昨日" icon={<Icon name="bar-chart" size={24} className="wf-text-primary" />} />
          </div>

          <Divider />

              <Card outlined>
                <Table
                  data={ORDERS_ALL.slice((page - 1) * 5, page * 5)}
                  columns={[
                    { key: 'id', label: '订单号' },
                    { key: 'customer', label: '客户' },
                    { key: 'amount', label: '金额' },
                    { key: 'status', label: '状态', render: (v, row) => <Badge variant={row.v}>{v}</Badge> },
                  ]}
                />
                <div class="wf-p-md wf-between">
                  <Text className="wf-text-sm">共 {ORDERS_ALL.length} 条</Text>
                  <Pagination total={ORDERS_ALL.length} page={page} pageSize={5} onChange={(p) => { page = p; rerender() }} />
                </div>
              </Card>
            </>
          )}
          {nav === 'users' && (
            <>
              <PageHeader title="用户管理" sub="平台用户与角色" display>
                <Button variant="primary"><Icon name="plus" size={14} /> 邀请用户</Button>
              </PageHeader>
              <Card outlined>
                <Table
                  data={USERS}
                  columns={[
                    { key: 'id', label: '用户 ID' },
                    { key: 'name', label: '姓名' },
                    { key: 'role', label: '角色', render: (v, row) => <Badge variant={row.v}>{v}</Badge> },
                    { key: 'email', label: '邮箱' },
                  ]}
                />
              </Card>
            </>
          )}
          {nav === 'goods' && (
            <>
              <PageHeader title="商品管理" sub="库存与销售状态" display>
                <Button variant="primary"><Icon name="plus" size={14} /> 上架商品</Button>
              </PageHeader>
              <Card outlined>
                <Table
                  data={GOODS}
                  columns={[
                    { key: 'id', label: '商品 ID' },
                    { key: 'name', label: '名称' },
                    { key: 'stock', label: '库存' },
                    { key: 'price', label: '价格' },
                    { key: 'status', label: '状态', render: (v, row) => <Badge variant={row.v}>{v}</Badge> },
                  ]}
                />
              </Card>
            </>
          )}
          {nav === 'settings' && (
            <>
              <PageHeader title="系统设置" sub="基础配置" display>
                <Button variant="primary"><Icon name="check" size={14} /> 保存</Button>
              </PageHeader>
              <Card outlined>
                <div class="wf-stack wf-gap-md">
                  {[
                    ['站点名称', 'Acme 管理台'],
                    ['默认语言', '中文（简体）'],
                    ['数据保留', '90 天'],
                    ['时区', 'Asia/Shanghai'],
                  ].map(([k, v]) => (
                    <div key={k} class="wf-between wf-p-md wf-border-b">
                      <span class="wf-text-secondary">{k}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

