# 仪表盘模板

**使用场景**：展示关键业务指标和趋势

**使用的组件**：StatCard / Card / Table / Loading

## 模板代码

```tsx
import { StatCard, Card, Table, Loading, Alert } from 'weifuwu/components'
import type { WfuiContext } from 'weifuwu/client'

export function Dashboard(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  if (!ctx.ui.ready) {
    $.loading = true; $.error = ''
    // ★ 改这里：加载 API
    ctx.api.get('/api/stats').then(data => {
      $.stats = data
      $.loading = false
    }).catch(e => { $.error = e.message; $.loading = false })
  }

  if ($.loading) return <Loading />
  if ($.error) return <Alert variant="error">{$.error}</Alert>

  // ★ 改这里：KPI 字段
  return (
    <div class="wf-stack" style="padding:var(--wf-space-lg)">
      <h2>仪表盘</h2>

      <div class="wf-grid" style="--wf-cols:repeat(auto-fill,minmax(200px,1fr))">
        <StatCard label="总用户" value={$.stats?.total_users ?? 0} icon="👤" trend="up" trendLabel="12%" />
        <StatCard label="活跃用户" value={$.stats?.active_users ?? 0} icon="⚡" />
        <StatCard label="今日订单" value={$.stats?.today_orders ?? 0} icon="📦" trend="up" trendLabel="8%" />
        <StatCard label="收入 (月)" value={`¥${$.stats?.monthly_revenue ?? 0}`} icon="💰" trend="down" trendLabel="3%" />
      </div>

      <Card>
        <h3>最近数据</h3>
        <Table data={$.stats?.recent_items ?? []}
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'name', label: '名称' },
            { key: 'created_at', label: '时间' },
          ]} />
      </Card>
    </div>
  )
}
```

## 可修改的部分

| 位置 | 说明 |
|------|------|
| API 地址 | `/api/stats` |
| StatCard 定义 | 每个指标一个卡片，修改 label/value |
| 表格列 | 最近数据的字段定义 |
