import type { Component } from 'weifuwu/client'
import {Title,Text, StatCard, PageHeader, SegmentedControl, Table, Badge, Card, Divider, Space, } from 'weifuwu/components'


// ─────────────────────────────────────────────────────────────
// 模式 3：仪表盘（Dashboard）
//
// 响应式卡片网格：KPI 行（StatCard）+ 数据表 + 侧栏概览。
// 100% 原语 + 组件：wf-grid（--wf-cols 控制列数）窄屏自动单列——
// 零媒体查询代码。
// ─────────────────────────────────────────────────────────────

const KPIS = [
  { label: '总营收', value: '¥128.6万', trend: 'up' as const, trendLabel: '12.4% 环比', icon: '💰' },
  { label: '活跃用户', value: '8,432', trend: 'up' as const, trendLabel: '3.2% 环比', icon: '👥' },
  { label: '转化率', value: '6.8%', trend: 'up' as const, trendLabel: '0.5% 环比', icon: '📈' },
  { label: '客单价', value: '¥286', trend: 'down' as const, trendLabel: '2.1% 环比', icon: '🛒' },
]

export const Dashboard: Component = (_init, _ctx) => (
  () => (
    <div class="wf-stack wf-gap-lg wf-p-lg wf-scroll" style={{ minHeight: 'calc(100vh - 48px)' }}>
      {/* 页头 + 时间范围切换 */}
      <div class="wf-row wf-between">
        <PageHeader title="经营仪表盘" sub="实时经营数据 · 自动刷新" />
        <SegmentedControl
          value="30d"
          onChange={() => {}}
          options={[
            { value: '7d', label: '近 7 天' },
            { value: '30d', label: '近 30 天' },
            { value: '90d', label: '近 90 天' },
          ]}
        />
      </div>

      {/* KPI 行：wf-grid 自适应（窄屏自动单列） */}
      <div class="wf-grid" style={{ '--wf-cols': 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {KPIS.map((k) => (
          <StatCard key={k.label} label={k.label} value={k.value} trend={k.trend} trendLabel={k.trendLabel} icon={k.icon} />
        ))}
      </div>

      {/* 内容区：销售排行 + 侧栏 */}
      <div class="wf-grid" style={{ '--wf-cols': '2fr 1fr', alignItems: 'start' }}>
        <Card outlined>
          <Space direction="vertical">
            <Title level={4}>商品销售排行</Title>
            <Table
              data={[
                { name: '商品 A', sales: '¥42.8万', growth: '18.2%', status: '热销', v: 'success' },
                { name: '商品 B', sales: '¥36.5万', growth: '9.7%', status: '稳定', v: 'default' },
                { name: '商品 C', sales: '¥21.3万', growth: '-4.1%', status: '下滑', v: 'warning' },
                { name: '商品 D', sales: '¥15.9万', growth: '22.6%', status: '热销', v: 'success' },
              ]}
              columns={[
                { key: 'name', label: '商品' },
                { key: 'sales', label: '销售额' },
                { key: 'growth', label: '增长率' },
                { key: 'status', label: '状态', render: (v, row) => <Badge variant={row.v}>{v}</Badge> },
              ]}
            />
          </Space>
        </Card>

        {/* 侧栏概览 */}
        <div class="wf-stack wf-gap-md">
          <Card outlined>
            <Space direction="vertical" size="sm">
              <Text type="secondary" className="wf-text-sm">今日实时</Text>
              <Text strong className="wf-text-lg">¥6,284</Text>
              <Text type="success" className="wf-text-sm">↑ 18.6% vs 昨日</Text>
            </Space>
          </Card>
          <Card outlined>
            <Space direction="vertical" size="sm">
              <Text type="secondary" className="wf-text-sm">数据刷新</Text>
              <Text className="wf-text-sm">每 30 秒自动拉取最新数据（scheduler 驱动）</Text>
            </Space>
          </Card>
          <Divider />
          <Text type="secondary" className="wf-text-sm">本页展示了 wf-grid + StatCard 的组合——无需任何媒体查询即可响应式。</Text>
        </div>
      </div>
    </div>
  )
)

