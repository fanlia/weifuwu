import type { Component } from 'weifuwu/client'
import {Text, Badge, Card, Icon, Sparkline, StatCard, Space } from 'weifuwu/components'


// ─────────────────────────────────────────────────────────────
// 模式 7：数据大屏（Data Screen）
//
// 全屏网格 + 固定角标（标题/时间/状态灯）。
// 100% 原语 + 组件：wf-fill（撑满）、wf-pin（角标）、wf-grid（大屏格）
//   Sparkline（曲线）、StatCard、Badge dot（状态灯）
// ─────────────────────────────────────────────────────────────

const SERIES = {
  cpu: [42, 45, 38, 52, 48, 61, 55, 72, 68, 75, 70, 66, 78, 82],
  mem: [30, 32, 35, 33, 38, 42, 40, 45, 43, 48, 52, 50, 55, 58],
  net: [20, 28, 25, 40, 35, 52, 48, 44, 60, 55, 68, 62, 74, 80],
}

const tick = (series: number[]) => {
  const base = series[series.length - 1]
  const next = Math.max(5, Math.min(95, base + (Math.random() * 8 - 4)))
  return [...series.slice(1), Math.round(next)]
}

export const DataScreen: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.cpu = [...SERIES.cpu]
  $.mem = [...SERIES.mem]
  $.net = [...SERIES.net]
  $.time = '10:24:36'
  // 实时刷新：2 秒滚动更新曲线 + 时间（布局蓝本演示实时监控——组件卸载自动停止）
  const timer = setInterval(() => {
    $.cpu = tick($.cpu)
    $.mem = tick($.mem)
    $.net = tick($.net)
    $.time = new Date().toTimeString().slice(0, 8)
  }, 2000)

  return () => (
    <div class="wf-fill wf-stack wf-gap-md wf-p-md wf-bg-tertiary" style={{ height: 'calc(100vh - 48px)' }}>
      {/* 顶部标题（fixed 角标） */}
      <div class="wf-pin wf-center" style={{ top: 16, left: 0, right: 0, zIndex: 5 }}>
        <b class="wf-text-lg wf-text-bold wf-tracking-wider">⚡ 实时运维监控中心</b>
      </div>
      {/* 右上时间（实时） */}
      <div class="wf-pin" style={{ top: 16, right: 24, zIndex: 5 }}>
        <Text type="secondary" className="wf-text-sm">2026-02-18 {$.time}</Text>
      </div>
      {/* 左上状态灯 */}
      <div class="wf-pin wf-row wf-gap-sm" style={{ top: 16, left: 24, zIndex: 5, alignItems: 'center' }}>
        <Badge variant="success" dot />
        <Text type="secondary" className="wf-text-sm">运行正常</Text>
      </div>

      {/* 主体：指标网格 */}
      <div class="wf-grid wf-fill wf-p-lg" style={{ '--wf-cols': 'repeat(auto-fill, minmax(300px, 1fr))', alignContent: 'center', paddingTop: 60 }}>
        {[
          { title: 'CPU 使用率', series: $.cpu, unit: '%' },
          { title: '内存占用', series: $.mem, unit: '%' },
          { title: '网络吞吐', series: $.net, unit: 'MB/s' },
        ].map((m) => (
          <Card outlined key={m.title} padding="lg">
            <Space direction="vertical" size="md">
              <div class="wf-row wf-between">
                <Text strong>{m.title}</Text>
                <Text type="success" className="wf-text-sm">● 实时</Text>
              </div>
              <Sparkline data={m.series} width={280} height={64} />
              <StatCard label="当前值" value={`${m.series[m.series.length - 1]}${m.unit}`} trend="up" trendLabel="最近采样" />
            </Space>
          </Card>
        ))}
      </div>

      {/* 底部滚动信息 */}
      <div class="wf-pin wf-p-sm wf-border-t" style={{ bottom: 12, left: 24, right: 24, zIndex: 5 }}>
        <Space size="lg">
          <Text type="secondary" className="wf-text-xs">[INFO] 集群 12 节点健康 · 2s 实时刷新</Text>
          <Text type="secondary" className="wf-text-xs">[INFO] 自动扩容已触发（us-east-1）</Text>
          <Text type="warning" className="wf-text-xs">[WARN] 磁盘余量 18%</Text>
        </Space>
      </div>
    </div>
  )
}

