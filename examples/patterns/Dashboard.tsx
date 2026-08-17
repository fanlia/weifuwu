import type { Component } from 'weifuwu/ui-dom'
import { Title, Text, StatCard, PageHeader, ProgressBar, SegmentedControl, Switch, Table, Badge, Card, Divider, Icon, Space } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 3：仪表盘（Dashboard）
//
// 响应式卡片网格：KPI 行（StatCard）+ 数据表 + 侧栏概览。
// SegmentedControl 切换时间范围 → KPI/表格数据联动（let + render()）。
// 100% 原语 + 组件：wf-grid（--wf-cols 控制列数）窄屏自动单列。
// ─────────────────────────────────────────────────────────────

interface PeriodData {
  kpis: { label: string; value: string; trend: 'up' | 'down'; trendLabel: string; icon: string }[]
  rows: { name: string; sales: string; growth: string; status: string; v: 'success' | 'default' | 'warning' | 'danger' }[]
  total: string
}

const DATA: Record<string, PeriodData> = {
  '7d': {
    kpis: [
      { label: '总营收', value: '¥32.4万', trend: 'up' as const, trendLabel: '8.2% 环比', icon: 'bar-chart' },
      { label: '活跃用户', value: '2,156', trend: 'up' as const, trendLabel: '5.1% 环比', icon: 'users' },
      { label: '转化率', value: '7.4%', trend: 'up' as const, trendLabel: '1.2% 环比', icon: 'trending-up' },
      { label: '客单价', value: '¥312', trend: 'up' as const, trendLabel: '3.8% 环比', icon: 'tag' },
    ],
    rows: [
      { name: '新品 B', sales: '¥12.8万', growth: '22.6%', status: '热销', v: 'success' },
      { name: '商品 A', sales: '¥10.5万', growth: '15.2%', status: '热销', v: 'success' },
      { name: '商品 C', sales: '¥6.3万', growth: '2.4%', status: '稳定', v: 'default' },
    ],
    total: '¥32,480',
  },
  '30d': {
    kpis: [
      { label: '总营收', value: '¥128.6万', trend: 'up' as const, trendLabel: '12.4% 环比', icon: 'bar-chart' },
      { label: '活跃用户', value: '8,432', trend: 'up' as const, trendLabel: '3.2% 环比', icon: 'users' },
      { label: '转化率', value: '6.8%', trend: 'up' as const, trendLabel: '0.5% 环比', icon: 'trending-up' },
      { label: '客单价', value: '¥286', trend: 'down' as const, trendLabel: '2.1% 环比', icon: 'tag' },
    ],
    rows: [
      { name: '商品 A', sales: '¥42.8万', growth: '18.2%', status: '热销', v: 'success' },
      { name: '商品 B', sales: '¥36.5万', growth: '9.7%', status: '稳定', v: 'default' },
      { name: '商品 C', sales: '¥21.3万', growth: '-4.1%', status: '下滑', v: 'warning' },
      { name: '商品 D', sales: '¥15.9万', growth: '22.6%', status: '热销', v: 'success' },
    ],
    total: '¥1,286,400',
  },
  '90d': {
    kpis: [
      { label: '总营收', value: '¥356.2万', trend: 'up' as const, trendLabel: '18.6% 环比', icon: 'bar-chart' },
      { label: '活跃用户', value: '24,680', trend: 'up' as const, trendLabel: '9.8% 环比', icon: 'users' },
      { label: '转化率', value: '6.1%', trend: 'down' as const, trendLabel: '0.3% 环比', icon: 'trending-up' },
      { label: '客单价', value: '¥268', trend: 'down' as const, trendLabel: '4.2% 环比', icon: 'tag' },
    ],
    rows: [
      { name: '商品 B', sales: '¥98.5万', growth: '31.4%', status: '热销', v: 'success' },
      { name: '商品 A', sales: '¥86.2万', growth: '12.8%', status: '稳定', v: 'default' },
      { name: '新品 D', sales: '¥52.1万', growth: '45.2%', status: '热销', v: 'success' },
      { name: '商品 C', sales: '¥38.9万', growth: '-6.3%', status: '下滑', v: 'warning' },
    ],
    total: '¥3,562,000',
  },
}

export const Dashboard: Component = async (_init, ctx) => {
  let period = '30d'
  let showGoal = true
  const rerender = () => ctx.ui.render()

  return async () => {
    const data = DATA[period] ?? DATA['30d']
    return (
      <div class="wf-stack wf-gap-lg wf-p-lg wf-scroll" style={{ minHeight: 'calc(100vh - 48px)' }}>
        {/* 页头 + 时间范围切换（wf-row 提供 wrap——窄屏切换器折行，不挤压标题） */}
        <div class="wf-row wf-between">
          <PageHeader title="经营仪表盘" sub="实时经营数据 · 自动刷新" />
          <SegmentedControl
            value={period}
            onChange={(v) => { period = v; rerender() }}
            options={[
              { value: '7d', label: '近 7 天' },
              { value: '30d', label: '近 30 天' },
              { value: '90d', label: '近 90 天' },
            ]}
          />
        </div>

        {/* KPI 行：wf-grid 自适应（窄屏自动单列） */}
        <div class="wf-grid" style={{ '--wf-cols': 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {data.kpis.map((k) => (
            <StatCard key={k.label} label={k.label} value={k.value} trend={k.trend} trendLabel={k.trendLabel} icon={<Icon name={k.icon as any} size={24} className="wf-text-primary" />} />
          ))}
        </div>

        {/* 内容区：销售排行 + 侧栏 */}
        <div class="wf-grid" style={{ '--wf-cols': '2fr 1fr', alignItems: 'start' }}>
          <Card outlined>
            <Space direction="vertical">
              <Title level={4}>商品销售排行 · {period}</Title>
              <Table
                data={data.rows}
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
                <Text type="secondary" className="wf-text-sm">本期总额</Text>
                <Text strong className="wf-text-lg">{data.total}</Text>
                <Text type="success" className="wf-text-sm">↑ 18.6% vs 上一期</Text>
              </Space>
            </Card>
            <Card outlined>
              <Space direction="vertical" size="sm">
                <div class="wf-between">
                  <Text type="secondary" className="wf-text-sm">季度目标</Text>
                  <Switch
                    label="展示"
                    checked={showGoal}
                    onChange={(v) => { showGoal = v; rerender() }}
                  />
                </div>
                {showGoal && (
                  <Space direction="vertical" size="sm">
                    <ProgressBar value={78} max={100} label="达成率" showValue />
                    <Text type="secondary" className="wf-text-xs">距离 ¥150 万目标还差 ¥21.4 万</Text>
                  </Space>
                )}
              </Space>
            </Card>
            <Card outlined>
              <Space direction="vertical" size="sm">
                <Text type="secondary" className="wf-text-sm">数据刷新</Text>
                <Text className="wf-text-sm">切换时间范围观察数据联动（let + render() 状态）</Text>
              </Space>
            </Card>
            <Divider />
            <Text type="secondary" className="wf-text-sm">本页展示了 wf-grid + StatCard + $ 状态组合——无需任何媒体查询即可响应式。</Text>
          </div>
        </div>
      </div>
    )
  }
}

