/**
 * Dashboard 设置页面 — 演示嵌套布局中表单状态保持
 */
import { useForm, Show } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

export default function DashboardSettings(_props: {}, _ctx: WfuiContext) {
  const form = useForm({
    initial: { displayName: '张三', email: 'zhangsan@example.com', language: 'zh', notifications: true },
    onSubmit: async (values) => {
      await new Promise(r => setTimeout(r, 800))
      console.log('设置已保存:', values)
    },
  })

  const saved = (v: boolean) => { /* noop for demo */ }

  return (
    <div>
      <h2 class="text-lg font-bold mb-4">设置</h2>
      <form onSubmit={(e: Event) => {
        e.preventDefault()
        if (form.submitting.value) return
        form.submitting.value = true
        setTimeout(() => {
          form.submitting.value = false
          // 显示保存成功
          const toast = document.createElement('div')
          toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50'
          toast.textContent = '✅ 设置已保存'
          document.body.appendChild(toast)
          setTimeout(() => toast.remove(), 2000)
        }, 800)
      }} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
          <input {...form.field('displayName')}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
          <input {...form.field('email')}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">语言</label>
          <select {...form.field('language')}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <input type="checkbox" checked={form.values.value.notifications}
            onChange={(e: any) => form.setValue('notifications', e.target.checked)}
            class="w-4 h-4 accent-blue-500" />
          <label class="text-sm text-gray-700">启用通知</label>
        </div>
        <button type="submit" disabled={form.submitting}
          class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer
                 hover:bg-blue-600 disabled:opacity-50 transition-colors">
          <Show when={form.submitting} fallback={<span>保存设置</span>}>
            <span>保存中...</span>
          </Show>
        </button>
      </form>
    </div>
  )
}
