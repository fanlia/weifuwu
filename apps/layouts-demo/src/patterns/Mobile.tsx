import type { Component } from 'weifuwu/client'

// ─────────────────────────────────────────────────────────────
// 模式 6：移动端布局（Mobile App Shell）
//
// App 壳：顶部导航（safe-top 避让刘海）+ 内容列表 + 底部 Tab（safe-bottom 避让手势条）。
// 使用 _safe-area 原语：wf-safe-top / wf-safe-bottom。
// 用固定视口（390px 居中预览）模拟手机屏——开发者可缩放窗口看窄屏效果。
// ─────────────────────────────────────────────────────────────

const CHATS = [
  { name: '产品讨论组', msg: '王强：新的布局原语文档已更新', time: '10:24', unread: 3 },
  { name: '张伟', msg: '收到，明天下午评审', time: '09:58', unread: 0 },
  { name: '前端小分队', msg: '李娜：PR #128 已合并 🎉', time: '昨天', unread: 12 },
  { name: '服务端同学', msg: '部署脚本已就绪', time: '昨天', unread: 0 },
  { name: '设计同步', msg: '新图标包已上传 Figma', time: '周一', unread: 5 },
]

export const Mobile: Component = (_init, _ctx) => (
  () => (
    <div class="wf-center wf-pad-lg" style={{ minHeight: 'calc(100vh - 48px)', background: 'var(--wf-color-bg-subtle)' }}>
      {/* 手机视口（390px 宽模拟） */}
      <div class="wf-stack wf-gap-none" style={{ width: 390, maxWidth: '100%', height: 640, borderRadius: 24, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,.15)', background: 'var(--wf-color-bg)' }}>
        {/* 顶部导航（安全区避让） */}
        <div class="wf-safe-top wf-row wf-pad-md wf-gap-sm" style={{ justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--wf-color-border-light)' }}>
          <span style={{ fontSize: 13 }}>‹ 返回</span>
          <b style={{ fontSize: 15 }}>消息</b>
          <span style={{ fontSize: 13 }}>＋</span>
        </div>

        {/* 搜索 */}
        <div class="wf-pad-md" style={{ borderBottom: '1px solid var(--wf-color-border-light)' }}>
          <div class="wf-pad-sm wf-text-secondary" style={{ background: 'var(--wf-color-bg-subtle)', borderRadius: 8, fontSize: 13, textAlign: 'center' }}>
            🔍 搜索会话
          </div>
        </div>

        {/* 消息列表（滚动） */}
        <div class="wf-fill wf-stack wf-gap-none" style={{ overflow: 'auto' }}>
          {CHATS.map((c) => (
            <div key={c.name} class="wf-row wf-pad-md wf-gap-md" style={{ borderBottom: '1px solid var(--wf-color-border-light)', alignItems: 'center' }}>
              <div class="wf-center" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--wf-color-primary-bg)', color: 'var(--wf-color-primary-text)', fontWeight: 600, flexShrink: 0 }}>
                {c.name[0]}
              </div>
              <div class="wf-fill wf-stack wf-gap-none" style={{ minWidth: 0 }}>
                <div class="wf-row" style={{ justifyContent: 'space-between' }}>
                  <b style={{ fontSize: 14 }}>{c.name}</b>
                  <span class="wf-text-tertiary" style={{ fontSize: 12 }}>{c.time}</span>
                </div>
                <span class="wf-text-secondary" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.msg}
                </span>
              </div>
              {c.unread > 0 && (
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--wf-color-error)', color: '#fff', fontSize: 11, textAlign: 'center', lineHeight: '18px', flexShrink: 0 }}>
                  {c.unread}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* 底部 Tab（安全区避让） */}
        <div class="wf-safe-bottom wf-row wf-pad-md wf-gap-none" style={{ borderTop: '1px solid var(--wf-color-border-light)', justifyContent: 'space-around' }}>
          {[
            ['💬', '消息', true],
            ['👥', '通讯录', false],
            ['✨', '发现', false],
            ['👤', '我', false],
          ].map(([icon, label, active]) => (
            <div key={label as string} class="wf-stack wf-gap-none" style={{ alignItems: 'center', color: active ? 'var(--wf-color-primary)' : 'var(--wf-text-tertiary, var(--wf-color-text-tertiary))' }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontSize: 11 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
)

// register({ id: 'mobile', name: '移动端 App', desc: '安全区避让 + 顶部导航 + 底部 Tab', comp: Mobile })
