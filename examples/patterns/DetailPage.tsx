import type { Component } from 'weifuwu/ui-dom'
import { PageHeader, Descriptions, Timeline, Tag, Button, Space, Card, Divider } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 10：详情页（Detail Page）
//
// 业务对象详情：标题栏 + 描述列表 + 状态时间线 + 操作区。
// 复制此文件即可得到一个标准的"详情页"：
//   - PageHeader（对象名 + 状态 Tag + 操作按钮）
//   - Descriptions（label/value 栅格——详情字段）
//   - Timeline（执行历史/审批流）
//   - Card 分区（补充信息块）
// 改造：换 data 字段 → 自己的业务对象。
// ─────────────────────────────────────────────────────────────

const ORDER = {
  id: 'SO-1003',
  customer: '王强',
  amount: 3200,
  status: '已发货',
  date: '2026-08-12',
  address: '杭州市西湖区文三路 138 号',
  note: '加急——客户要求周五前送达',
}

const HISTORY = [
  { title: '订单创建', time: '2026-08-12 09:12', tone: 'success' as const },
  { title: '已支付', time: '2026-08-12 09:15' },
  { title: '仓库发货', time: '2026-08-12 16:40' },
  { title: '运输中', time: '2026-08-13 08:05' },
]

export const DetailPage: Component = async (_init: any, ctx: any) => {
  let cancelled = false
  return async (_p: any) => (
    <div class="wf-container wf-stack" style="--wf-max:960px;--wf-gap:16px;padding:24px 16px">
      <PageHeader title={`订单 ${ORDER.id}`} sub={`客户：${ORDER.customer} · 下单时间：${ORDER.date}`}>
        <Space size="md">
          <Tag variant="primary">{ORDER.status}</Tag>
          <Button variant="ghost" onClick={() => ctx.ui.render()}>
            <Icon name="copy" size={14} /> 导出
          </Button>
          <Button variant="danger" disabled={cancelled} onClick={() => { cancelled = true; ctx.ui.render() }}>
            {cancelled ? '已取消' : '取消订单'}
          </Button>
        </Space>
      </PageHeader>

      <Descriptions
        items={[
          { label: '订单号', value: ORDER.id },
          { label: '客户', value: ORDER.customer },
          { label: '金额', value: `¥${ORDER.amount.toLocaleString()}` },
          { label: '状态', value: ORDER.status },
          { label: '收货地址', value: ORDER.address, span: 2 },
          { label: '备注', value: cancelled ? '（已取消）' : ORDER.note, span: 2 },
        ]}
        bordered
      />

      <div class="wf-grid" style="--wf-cols:2fr 1fr;--wf-gap:16px">
        <Card>
          <div class="wf-text-bold wf-mb-sm">补充信息</div>
          <div class="wf-text-secondary wf-text-sm wf-stack wf-gap-xs">
            <span>支付方式：对公转账</span>
            <span>发票：已开具（¥3,200.00）</span>
            <span>业务员：陈晨</span>
          </div>
        </Card>
        <Card>
          <div class="wf-text-bold wf-mb-sm">执行历史</div>
          <Timeline items={HISTORY.map((h, i) => ({ ...h, key: String(i) }))} />
        </Card>
      </div>
    </div>
  )
}

import { Icon } from 'weifuwu/components'
