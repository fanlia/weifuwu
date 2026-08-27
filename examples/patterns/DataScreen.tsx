import type { Component } from 'weifuwu/vdom'
import {Text, Badge, Card, Icon, Sparkline, StatCard, Space } from 'weifuwu/components'


// ─────────────────────────────────────────────────────────────
// 模式 7：数据大屏（Data Screen）
//
// 全屏网格 + 固定角标（标题/时间/状态灯）。
// 100% 原语 + 组件：wf-fill（撑满）、wf-layer + wf-absolute（容器内角标——
// 嵌进任意父容器不错位；全屏使用等价 wf-cover）、wf-grid（大屏格）
//   Sparkline（曲线）、StatCard、Badge dot（状态灯）
// ─────────────────────────────────────────────────────────────

const SERIES = {
  cpu: [42, 45, 38, 52, 48, 61, 55, 72, 68, 75, 70, 66, 78, 82],
  mem: [30, 32, 35, 33, 38, 42, 40, 45, 43, 48, 52, 50, 55, 58],
  net: [20, 28, 25, 40, 35, 52, 48, 44, 60, 55, 68, 62, 74, 80],
  qps: [120, 145, 138, 162, 158, 190, 175, 210, 198, 235, 220, 245, 260, 280],
  latency: [38, 42, 35, 48, 52, 45, 58, 62, 55, 68, 72, 65, 74, 70],
  disk: [45, 46, 48, 47, 50, 52, 51, 55, 58, 57, 62, 64, 66, 68],
}

const CARDS = [
  { title: 'CPU 使用率', key: 'cpu', unit: '%' },
  { title: '内存占用', key: 'mem', unit: '%' },
  { title: '网络吞吐', key: 'net', unit: 'MB/s' },
  { title: '请求 QPS', key: 'qps', unit: '/s' },
  { title: '接口延迟', key: 'latency', unit: 'ms' },
  { title: '磁盘使用', key: 'disk', unit: '%' },
]

const tick = (series: number[]) => {
  const base = series[series.length - 1]
  const next = Math.max(5, Math.min(95, base + (Math.random() * 8 - 4)))
  return [...series.slice(1), Math.round(next)]
}

export const DataScreen: Component = async (_init, ctx) => {
  // render-only：内部状态 let + 显式 render（实时曲线数据 + 时间）
  const series: Record<string, number[]> = {}
  for (const c of CARDS) series[c.key] = [...SERIES[c.key as keyof typeof SERIES]]
  let time = new Date().toTimeString().slice(0, 8)
  const today = new Date().toISOString().slice(0, 10)
  // 实时刷新：2 秒滚动更新全部曲线 + 时间（布局蓝本演示实时监控）
  const timer = setInterval(() => {
    for (const c of CARDS) series[c.key] = tick(series[c.key])
    time = new Date().toTimeString().slice(0, 8)
    ctx.render()
  }, 2000)

  // ref 纪律：稳定引用定义在 mount 作用域——ref(null) 只在真正卸载时调用
  // （内联 ref 每次渲染新引用 → 反复 clearInterval → 数据永不更新）
  const rootRef = (el: any) => { if (!el) clearInterval(timer) }

  return async () => (
    <div ref={rootRef} class="wf-fill wf-layer wf-stack wf-gap-md wf-padding-md wf-bg-tertiary" style={{ height: 'calc(100vh - 48px)' }}>
      {/* 顶部标题（容器内角标——wf-layer + wf-absolute） */}
      <div class="wf-absolute wf-center" style={{ top: 16, left: 0, right: 0 }}>
        <Space size="sm" align="center">
          <Icon name="zap" size={18} className="wf-text-primary" />
          <b class="wf-font-lg wf-bold wf-tracking-wider">实时运维监控中心</b>
        </Space>
      </div>
      {/* 右上时间（实时） */}
      <div class="wf-absolute" style={{ top: 16, right: 24 }}>
        <Text type="secondary" className="wf-font-sm wf-nums">{today} {time}</Text>
      </div>
      {/* 左上状态灯 */}
      <div class="wf-absolute wf-row wf-gap-sm" style={{ top: 16, left: 24, alignItems: 'center' }}>
        <Badge variant="success" dot />
        <Text type="secondary" className="wf-font-sm">运行正常</Text>
      </div>

      {/* 主体：指标网格 */}
      <div class="wf-grid wf-fill wf-padding-lg" style={{ '--wf-cols': 'repeat(auto-fill, minmax(280px, 1fr))', alignContent: 'center', paddingTop: 60 }}>
        {CARDS.map((m) => (
          <Card outlined key={m.title} padding="lg">
            <Space direction="vertical" size="md">
              <div class="wf-row wf-justify-between">
                <Text strong>{m.title}</Text>
                <Space size="sm" align="center">
                  <Badge variant="success" dot />
                  <Text type="success" className="wf-font-sm">实时</Text>
                </Space>
              </div>
              <Sparkline data={series[m.key]} width={280} height={64} />
              <StatCard label="当前值" value={`${series[m.key][series[m.key].length - 1]}${m.unit}`} trend="up" trendLabel="最近采样" />
            </Space>
          </Card>
        ))}
      </div>

      {/* 底部滚动信息 */}
      <div class="wf-absolute wf-padding-sm wf-border-top" style={{ bottom: 12, left: 24, right: 24 }}>
        <Space size="lg">
          <Text type="secondary" className="wf-font-xs">[INFO] 集群 12 节点健康 · 2s 实时刷新</Text>
          <Text type="secondary" className="wf-font-xs">[INFO] 自动扩容已触发（us-east-1）</Text>
          <Text type="warning" className="wf-font-xs">[WARN] 磁盘余量 18%</Text>
        </Space>
      </div>
    </div>
  )
}

