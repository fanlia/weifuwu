import type { Component } from 'weifuwu/client'
import {Text, Avatar, Badge, Divider, Icon, List, SearchInput, Space } from 'weifuwu/components'


// ─────────────────────────────────────────────────────────────
// 模式 6：移动端布局（Mobile App Shell）
//
// App 壳：顶部导航（wf-safe-top 避让刘海）+ 内容列表 + 底部 Tab
// （wf-safe-bottom 避让手势条）。固定视口（390px 居中）模拟手机屏。
// 100% 原语 + 组件：wf-safe-top/bottom、wf-fill、wf-row/gap、wf-center
//   SearchInput（搜索）、List（消息流）、Badge（未读数）
// ─────────────────────────────────────────────────────────────

const CONTACTS = [
  { name: '张伟', role: '产品经理', online: true },
  { name: '李娜', role: '设计师', online: true },
  { name: '王强', role: '后端工程师', online: false },
  { name: '赵敏', role: '测试', online: true },
  { name: '陈晨', role: '运营', online: false },
]

const DISCOVER = [
  { title: '前端周刊', meta: '12 篇新文章', icon: 'file-text' },
  { title: 'AI 助手', meta: '对话式工具', icon: 'zap' },
  { title: '设计资源', meta: '图标 / 插画', icon: 'layers' },
  { title: '开源项目', meta: 'weifuwu 生态', icon: 'github' },
]

const CHATS = [
  { name: '产品讨论组', msg: '王强：新的布局原语文档已更新', time: '10:24', unread: 3 },
  { name: '张伟', msg: '收到，明天下午评审', time: '09:58', unread: 0 },
  { name: '前端小分队', msg: '李娜：PR #128 已合并 🎉', time: '昨天', unread: 12 },
  { name: '服务端同学', msg: '部署脚本已就绪', time: '昨天', unread: 0 },
  { name: '设计同步', msg: '新图标包已上传 Figma', time: '周一', unread: 5 },
]

const TABS = [
  { icon: 'message' as const, label: '消息' },
  { icon: 'users' as const, label: '通讯录' },
  { icon: 'grid' as const, label: '发现' },
  { icon: 'user' as const, label: '我' },
]

export const Mobile: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.query = ''
  $.tab = '消息'

  return () => {
    const filtered = CHATS.filter((c) => c.name.includes($.query) || c.msg.includes($.query))
    return (
    <div class="wf-center wf-p-lg wf-bg-tertiary" style={{ minHeight: 'calc(100vh - 48px)' }}>
      {/* 手机视口（390×640 模拟屏——唯一允许的视口容器内联） */}
      <div class="wf-stack wf-gap-none wf-border wf-rounded-lg wf-elevate wf-bg-primary" style={{ width: 390, maxWidth: '100%', height: 640, overflow: 'hidden' }}>
        {/* 顶部导航（安全区避让） */}
        <div class="wf-safe-top wf-row wf-p-md wf-gap-sm wf-border-b wf-between">
          <Icon name="chevron-left" size={18} />
          <b class="wf-text-bold">消息</b>
          <Icon name="plus" size={18} />
        </div>

        {/* 搜索（输入过滤列表） */}
        <div class="wf-p-md wf-border-b">
          <SearchInput
            placeholder="搜索会话"
            onInput={(e) => { $.query = (e.target as HTMLInputElement).value }}
            onClear={() => { $.query = '' }}
          />
        </div>

        {/* 内容区（按底部 Tab 切换） */}
        <div class="wf-fill wf-scroll">
          {$.tab === '消息' && (
          <List
            divided
            items={filtered}
            renderItem={(c) => (
              <div class="wf-row wf-p-md wf-gap-md">
                <Avatar name={c.name[0]} size="md" />
                <div class="wf-fill wf-stack wf-gap-none" style={{ minWidth: 0 }}>
                  <div class="wf-row wf-gap-none wf-between">
                    <Text className="wf-text-sm" strong>{c.name}</Text>
                    <Text type="secondary" className="wf-text-xs">{c.time}</Text>
                  </div>
                  <Text type="secondary" className="wf-text-sm wf-truncate">{c.msg}</Text>
                </div>
                {c.unread > 0 && <Badge variant="danger" dot={false}>{c.unread}</Badge>}
              </div>
            )}
          />
          )}
          {$.tab === '通讯录' && (
            <List
              divided
              items={CONTACTS}
              renderItem={(c) => (
                <div class="wf-row wf-p-md wf-gap-md">
                  <Avatar name={c.name[0]} size="md" />
                  <div class="wf-fill">
                    <Text className="wf-text-sm" strong>{c.name}</Text>
                    <Text type="secondary" className="wf-text-xs wf-block">{c.role}</Text>
                  </div>
                  {c.online && <span class="wf-badge-dot wf-badge-dot--success" />}
                </div>
              )}
            />
          )}
          {$.tab === '发现' && (
            <List
              divided
              items={DISCOVER}
              renderItem={(d) => (
                <div class="wf-row wf-p-md wf-gap-md">
                  <Icon name={d.icon as any} size={20} className="wf-text-primary" />
                  <div class="wf-fill">
                    <Text className="wf-text-sm" strong>{d.title}</Text>
                    <Text type="secondary" className="wf-text-xs wf-block">{d.meta}</Text>
                  </div>
                  <Icon name="chevron-right" size={16} className="wf-text-tertiary" />
                </div>
              )}
            />
          )}
          {$.tab === '我' && (
            <div class="wf-stack wf-gap-md wf-p-md">
              <div class="wf-row wf-gap-md">
                <Avatar name="我" size="lg" />
                <div class="wf-stack wf-gap-none">
                  <Text strong>管理员</Text>
                  <Text type="secondary" className="wf-text-xs">ID: 10086</Text>
                </div>
              </div>
              {['账号与安全', '通知设置', '隐私', '关于'].map((item) => (
                <div key={item} class="wf-between wf-p-sm wf-border-b">
                  <Text className="wf-text-sm">{item}</Text>
                  <Icon name="chevron-right" size={14} className="wf-text-tertiary" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部 Tab（安全区避让——点击切换内容） */}
        <div class="wf-safe-bottom wf-row wf-p-md wf-gap-none wf-border-t wf-around">
          {TABS.map((t) => (
            <div
              key={t.label}
              class={`wf-stack wf-gap-none wf-center wf-pointer${$.tab === t.label ? ' wf-text-primary' : ' wf-text-tertiary'}`}
              onClick={() => { $.tab = t.label }}
            >
              <Icon name={t.icon} size={20} />
              <Text className={`wf-text-xs${$.tab === t.label ? '' : ' wf-text-tertiary'}`}>{t.label}</Text>
            </div>
          ))}
        </div>
      </div>
    </div>
    )
  }
}

