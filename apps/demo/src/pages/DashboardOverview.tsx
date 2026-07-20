/**
 * Dashboard 概览页面
 */
import { signal, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

interface Stat {
  label: string
  value: string
  change: string
  color: string
}

interface Activity {
  id: number
  action: string
  time: string
}

export default function DashboardOverview(_props: {}, _ctx: WfuiContext) {
  const stats = signal<Stat[]>([
    { label: '用户总数', value: '2,847', change: '+12%', color: 'bg-blue-500' },
    { label: '今日活跃', value: '1,203', change: '+5%', color: 'bg-green-500' },
    { label: '订单量', value: '847', change: '+18%', color: 'bg-purple-500' },
    { label: '营收', value: '¥128K', change: '+8%', color: 'bg-amber-500' },
  ])

  const activities = signal<Activity[]>([
    { id: 1, action: '新用户 Alice 注册', time: '2 分钟前' },
    { id: 2, action: '订单 #8842 已完成', time: '15 分钟前' },
    { id: 3, action: 'Bob 升级为 Pro 用户', time: '1 小时前' },
    { id: 4, action: '系统备份完成', time: '2 小时前' },
    { id: 5, action: '新用户 Charlie 注册', time: '3 小时前' },
  ])

  return (
    <div>
      <h2 class="text-lg font-bold mb-4">概览</h2>
      <div class="grid grid-cols-2 gap-4 mb-6">
        <For each={stats}>
          {(s) => (
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div class="flex items-center gap-2 mb-2">
                <div class={`w-2 h-2 rounded-full ${s.color}`} />
                <span class="text-sm text-gray-500">{s.label}</span>
              </div>
              <div class="text-2xl font-bold">{s.value}</div>
              <div class="text-xs text-green-500 mt-1">{s.change}</div>
            </div>
          )}
        </For>
      </div>

      <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">最近活动</h3>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        <For each={activities}>
          {(a) => (
            <div class="flex items-center justify-between px-4 py-3">
              <span class="text-sm text-gray-700">{a.action}</span>
              <span class="text-xs text-gray-400">{a.time}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
