/**
 * Dashboard 设置页面 — 嵌套布局中表单状态保持
 */
import type { WfuiContext } from 'weifuwu/client'

export default function DashboardSettings(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) {
    $.displayName = '张三'
    $.email = 'zhangsan@example.com'
    $.language = 'zh'
    $.notifications = true
    $.saving = false
  }

  function handleSubmit(e: Event) {
    e.preventDefault()
    if ($.saving) return
    $.saving = true
    setTimeout(() => {
      $.saving = false
      console.log('设置已保存:', { displayName: $.displayName, email: $.email, language: $.language, notifications: $.notifications })
      const toast = document.createElement('div')
      toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50'
      toast.textContent = '✅ 设置已保存'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 2000)
    }, 800)
  }

  return (
    <div>
      <h2 class="text-lg font-bold mb-4">设置</h2>
      <form onSubmit={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
          <input value={$.displayName} onInput={(e: any) => { $.displayName = e.target.value }}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
          <input value={$.email} onInput={(e: any) => { $.email = e.target.value }}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">语言</label>
          <select value={$.language} onChange={(e: any) => { $.language = e.target.value }}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <input type="checkbox" checked={$.notifications}
            onChange={(e: any) => { $.notifications = e.target.checked }}
            class="w-4 h-4 accent-blue-500" />
          <label class="text-sm text-gray-700">启用通知</label>
        </div>
        <button type="submit" disabled={$.saving}
          class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-600 disabled:opacity-50 transition-colors">
          {$.saving ? '保存中...' : '保存设置'}
        </button>
      </form>
    </div>
  )
}
