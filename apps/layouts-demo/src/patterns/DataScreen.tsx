import type { Component } from 'weifuwu/client'
import { Sparkline, StatCard } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 7：数据大屏（Data Screen）
//
// 全屏网格 + 固定角标（标题/时间/状态灯）。
// 使用 wf-fill（撑满容器）+ wf-fixed（四角角标）+ wf-grid（大屏格）。
// 适合监控中心、作战室、运营大屏。
// ─────────────────────────────────────────────────────────────

const SERIES = {
  cpu: [42, 45, 38, 52, 48, 61, 55, 72, 68, 75, 70, 66, 78, 82],
  mem: [30, 32, 35, 33, 38, 42, 40, 45, 43, 48, 52, 50, 55, 58],
  net: [20, 28, 25, 40, 35, 52, 48, 44, 60, 55, 68, 62, 74, 80],
}

export const DataScreen: Component = (_init, _ctx) => (
  () => (
    <div class="wf-fill wf-stack wf-gap-md wf-pad-md" style={{ height: 'calc(100vh - 48px)', borderRadius: 12, overflow: 'hidden', background: 'var(--wf-color-bg-tertiary)', position: 'relative' }}>
      {/* 顶部标题（fixed 角标） */}
      <div class="wf-fixed wf-center" style={{ top: 16, left: 0, right: 0, zIndex: 5, pointerEvents: 'none' }}>
        <b style={{ fontSize: 22, letterSpacing: 4 }}>⚡ 实时运维监控中心</b>
      </div>
      {/* 右上时间 */}
      <div class="wf-fixed wf-text-secondary" style={{ top: 16, right: 24, fontSize: 13, zIndex: 5 }}>
        2026-02-18 10:24:36
      </div>
      {/* 左上状态灯 */}
      <div class="wf-fixed wf-row wf-gap-sm" style={{ top: 16, left: 24, fontSize: 13, zIndex: 5, alignItems: 'center' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--wf-color-success)', display: 'inline-block' }} />
        <span class="wf-text-secondary">运行正常</span>
      </div>

      {/* 主体：指标网格 */}
      <div class="wf-grid wf-fill wf-pad-lg" style={{ '--wf-cols': 'repeat(auto-fill, minmax(300px, 1fr))', alignContent: 'center', paddingTop: 60 }}>
        {[
          { title: 'CPU 使用率', series: SERIES.cpu, unit: '%' },
          { title: '内存占用', series: SERIES.mem, unit: '%' },
          { title: '网络吞吐', series: SERIES.net, unit: 'MB/s' },
        ].map((m) => (
          <div key={m.title} class="wf-card wf-pad-lg wf-stack wf-gap-md" style={{ borderRadius: 12 }}>
            <div class="wf-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 15 }}>{m.title}</b>
              <span class="wf-text-success" style={{ fontSize: 13 }}>● 实时</span>
            </div>
            <Sparkline data={m.series} width={280} height={64} />
            <StatCard label="当前值" value={`${m.series[m.series.length - 1]}${m.unit}`} trend="up" trendLabel="最近采样" />
          </div>
        ))}
      </div>

      {/* 底部滚动信息 */}
      <div class="wf-fixed wf-pad-sm wf-text-secondary" style={{ bottom: 12, left: 24, right: 24, fontSize: 12, zIndex: 5, borderTop: '1px solid var(--wf-color-border-dark)', paddingTop: 8 }}>
        [INFO] 集群 12 节点健康 · [INFO] 自动扩容已触发（us-east-1） · [WARN] 磁盘余量 18%
      </div>
    </div>
  )
)

// register({ id: 'data-screen', name: '数据大屏', desc: '全屏网格 + 固定角标 + 实时曲线', comp: DataScreen })
