import type { Component } from 'weifuwu/vdom'
import { PageHeader, SearchInput, Table, Tag, Pagination, Button, Icon, EmptyState, Card } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 9：列表页（List Page）
//
// 最常见的业务页面：搜索 + 表格 + 分页 + 状态标签组合。
// 复制此文件即可得到一个标准的"列表页"：
//   - PageHeader（标题 + 操作区）
//   - SearchInput（搜索过滤——客户端即时过滤）
//   - Table（列配置 + 状态 Tag 渲染）
//   - Pagination（分页——当前为前端分页，接 API 时分页参数同理）
// 改造：换 columns/data → 自己的业务列表。
// ─────────────────────────────────────────────────────────────

const ORDERS = [
  { id: 'SO-1001', customer: '张伟', amount: 1280, status: '已支付', date: '2026-08-10' },
  { id: 'SO-1002', customer: '李娜', amount: 560, status: '待支付', date: '2026-08-11' },
  { id: 'SO-1003', customer: '王强', amount: 3200, status: '已发货', date: '2026-08-12' },
  { id: 'SO-1004', customer: '赵敏', amount: 890, status: '已支付', date: '2026-08-13' },
  { id: 'SO-1005', customer: '陈杰', amount: 2100, status: '待支付', date: '2026-08-14' },
  { id: 'SO-1006', customer: '刘洋', amount: 450, status: '已支付', date: '2026-08-15' },
  { id: 'SO-1007', customer: '孙丽', amount: 1750, status: '已发货', date: '2026-08-16' },
  { id: 'SO-1008', customer: '周涛', amount: 980, status: '已支付', date: '2026-08-17' },
]

const statusTag = (s: string) =>
  s === '已支付' ? <Tag variant="success">{s}</Tag> : s === '已发货' ? <Tag variant="primary">{s}</Tag> : <Tag>{s}</Tag>

export const ListPage: Component = async (_init: any, ctx: any) => {
  let q = ''
  let page = 1
  const PAGE_SIZE = 5
  return async (_p: any) => {
    const filtered = ORDERS.filter((o) => !q || o.customer.toLowerCase().includes(q.toLowerCase()) || o.id.toLowerCase().includes(q.toLowerCase()))
    const total = filtered.length
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const cur = Math.min(page, pages)
    const rows = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)
    return (
      <div class="wf-container wf-stack" style="--wf-max:960px;--wf-gap:16px;padding:24px 16px">
        <PageHeader title="订单列表" sub={`共 ${total} 条订单`}>
          <div class="wf-row wf-gap-sm">
            <SearchInput placeholder="搜索客户/订单号…" value={q}
              onInput={(e: any) => { q = (e.target as HTMLInputElement).value; page = 1; ctx.render() }}
              onClear={() => { q = ''; page = 1; ctx.render() }} />
            <Button variant="primary" onClick={() => ctx.render()}>
              <Icon name="plus" size={14} /> 新建订单
            </Button>
          </div>
        </PageHeader>

        {rows.length === 0 ? (
          <Card><EmptyState text={q ? `无匹配「${q}」的订单` : '暂无订单'} /></Card>
        ) : (
          <Table
            columns={[
              { key: 'id', label: '订单号' },
              { key: 'customer', label: '客户' },
              { key: 'amount', label: '金额', render: (v: any) => `¥${Number(v).toLocaleString()}` },
              { key: 'date', label: '日期' },
              { key: 'status', label: '状态', render: (v: any) => statusTag(v) },
              { key: 'id', label: '操作', render: () => <a class="wf-link" style="cursor:pointer">查看</a> },
            ]}
            data={rows}
          />
        )}

        <div class="wf-row wf-between">
          <span class="wf-text-xs wf-text-tertiary">第 {cur}/{pages} 页 · 每页 {PAGE_SIZE} 条</span>
          <Pagination total={total} page={cur} pageSize={PAGE_SIZE}
            onChange={(p: number) => { page = p; ctx.render() }} />
        </div>
      </div>
    )
  }
}
