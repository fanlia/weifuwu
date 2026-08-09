import type { Component } from 'weifuwu/client'
import { StatCard, PageHeader, SegmentedControl, Table, Badge } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 3：仪表盘（Dashboard）
//
// 响应式卡片网格：KPI 行（4 个 StatCard）+ 数据表格。
// 使用 wf-grid（--wf-cols 控制列数）+ wf-stack 移动优先堆叠。
// 窄屏（<768px）自动单列，宽屏四列——零媒体查询代码。
// ─────────────────────────────────────────────────────────────

const KPIS: { label: string; value: string; trend: 'up' | 'down'; trendLabel: string; icon: string }[] = [
  { label: '总营收', value: '¥128.6万', trend: 'up', trendLabel: '12.4% 环比', icon: '💰' },
  { label: '活跃用户', value: '8,432', trend: 'up', trendLabel: '3.2% 环比', icon: '👥' },
  { label: '转化率', value: '6.8%', trend: 'up', trendLabel: '0.5% 环比', icon: '📈' },
  { label: '客单价', value: '¥286', trend: 'down', trendLabel: '2.1% 环比', icon: '🛒' },
]

const RANK = [
  { name: '商品 A', sales: '¥42.8万', growth: '18.2%', status: '热销', v: 'success' },
  { name: '商品 B', sales: '¥36.5万', growth: '9.7%', status: '稳定', v: 'default' },
  { name: '商品 C', sales: '¥21.3万', growth: '-4.1%', status: '下滑', v: 'warning' },
  { name: '商品 D', sales: '¥15.9万', growth: '22.6%', status: '热销', v: 'success' },
]

export const Dashboard: Component = (_init, _ctx) => (
  () => (
    <div class="wf-stack wf-gap-lg wf-pad-lg" style={{ minHeight: 'calc(100vh - 48px)' }}>
      {/* 页头 + 时间范围切换 */}
      <div class="wf-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
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

      {/* KPI 行：wf-grid 自适应列（窄屏自动单列） */}
      <div class="wf-grid" style={{ '--wf-cols': 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {KPIS.map((k) => (
          <StatCard key={k.label} label={k.label} value={k.value} trend={k.trend} trendLabel={k.trendLabel} icon={k.icon} />
        ))}
      </div>

      {/* 内容区：销售排行表格 */}
      <div class="wf-grid" style={{ '--wf-cols': '2fr 1fr', flex: 1, alignItems: 'start' }}>
        <div class="wf-card wf-pad-md">
          <b>商品销售排行</b>
          <Table
            data={RANK}
            columns={[
              { key: 'name', label: '商品' },
              { key: 'sales', label: '销售额' },
              { key: 'growth', label: '增长率' },
              { key: 'status', label: '状态', render: (v) => <Badge variant={(v as any).v}>{v}</Badge> },
            ]}
          />
        </div>

        {/* 侧栏：概览 + 操作 */}
        <div class="wf-stack wf-gap-md">
          <div class="wf-card wf-pad-md wf-stack wf-gap-none">
            <span class="wf-text-secondary" style={{ fontSize: 13 }}>今日实时</span>
            <b style={{ fontSize: 24 }}>¥6,284</b>
            <span class="wf-text-success" style={{ fontSize: 13 }}>↑ 18.6% vs 昨日</span>
          </div>
          <div class="wf-card wf-pad-md wf-stack wf-gap-sm">
            <span class="wf-text-secondary" style={{ fontSize: 13 }}>数据刷新</span>
            <span style={{ fontSize: 13 }}>每 30 秒自动拉取最新数据（scheduler 驱动）</span>
          </div>
        </div>
      </div>
    </div>
  )
)

// register({ id: 'dashboard', name: '仪表盘', desc: '响应式 KPI 网格 + 数据表（wf-grid 自适应）', comp: Dashboard })
