/**
 * UI 路由 — 提供 SPA 入口和静态资源
 */

import { resolve, join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import type { Router, Context } from 'weifuwu'

/** 全局设计系统 CSS — 设计令牌 + 布局 + 组件类 */
const GLOBAL_CSS = `
/* ── 设计令牌 ─────────────────────────────── */
:root {
  --primary: #6366f1;
  --primary-2: #4f46e5;
  --primary-50: #eef2ff;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --border: #e5e7eb;
  --border-2: #d1d5db;
  --text: #111827;
  --text-2: #6b7280;
  --text-3: #9ca3af;
  --danger: #ef4444;
  --success: #10b981;
  --warning: #f59e0b;
  --side-bg: #101828;
  --side-text: #98a2b3;
  --side-active: #a5b4fc;
  --radius: 10px;
  --shadow-sm: 0 1px 2px rgba(16,24,40,.05);
  --shadow-md: 0 4px 12px rgba(16,24,40,.08);
  --shadow-lg: 0 12px 32px rgba(16,24,40,.14);
}

/* ── 重置 ─────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
button { font-family: inherit; }
a { color: inherit; }
input, select, textarea { font-family: inherit; }
::placeholder { color: var(--text-3); }

/* ── 布局：侧边栏 + 主区 ──────────────────── */
.app-shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 236px; position: fixed; inset: 0 auto 0 0; z-index: 20;
  background: var(--side-bg); color: var(--side-text);
  display: flex; flex-direction: column;
}
.side-brand { display: flex; align-items: center; gap: 10px; padding: 20px 18px 16px; }
.side-logo {
  width: 34px; height: 34px; border-radius: 9px; flex: none;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; color: #fff; font-weight: 800;
}
.side-name { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: .2px; }
.side-name small { display: block; font-size: 10px; font-weight: 400; color: #667085; letter-spacing: .4px; }
.side-nav { flex: 1; padding: 8px 12px; overflow-y: auto; }
.nav-group { font-size: 11px; font-weight: 600; color: #475467; letter-spacing: .8px; text-transform: uppercase; padding: 14px 10px 6px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 9px 10px; margin-bottom: 2px; border-radius: 8px;
  color: var(--side-text); font-size: 14px; cursor: pointer;
  background: none; border: none; text-align: left; text-decoration: none;
  transition: background .12s, color .12s;
}
.nav-item:hover { background: rgba(255,255,255,.06); color: #fff; }
.nav-item.active { background: rgba(99,102,241,.18); color: var(--side-active); font-weight: 600; }
.nav-ico { width: 20px; text-align: center; font-size: 15px; flex: none; }
.side-footer { padding: 12px; border-top: 1px solid rgba(255,255,255,.08); }
.user-chip { display: flex; align-items: center; gap: 10px; padding: 6px; border-radius: 8px; }
.user-chip:hover { background: rgba(255,255,255,.05); }
.user-ava {
  width: 34px; height: 34px; border-radius: 50%; flex: none;
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700;
}
.user-meta { flex: 1; min-width: 0; }
.user-name { font-size: 13px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-mail { font-size: 11px; color: #667085; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.btn-logout {
  background: none; border: none; color: #667085; cursor: pointer;
  font-size: 15px; padding: 6px; border-radius: 6px; flex: none;
}
.btn-logout:hover { background: rgba(239,68,68,.15); color: #f87171; }

.main { flex: 1; margin-left: 236px; min-height: 100vh; display: flex; flex-direction: column; }
.page { width: 100%; max-width: 1060px; margin: 0 auto; padding: 32px; flex: 1; }
.page-narrow { max-width: 640px; }

/* ── 页头 ─────────────────────────────────── */
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.page-title { font-size: 22px; font-weight: 700; letter-spacing: -.2px; }
.page-sub { color: var(--text-2); font-size: 13px; margin-top: 4px; }
.page-actions { display: flex; gap: 10px; flex: none; }

/* ── 按钮 ─────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 500;
  cursor: pointer; border: 1px solid transparent; text-decoration: none;
  transition: background .12s, border-color .12s, color .12s; white-space: nowrap;
}
.btn:disabled { opacity: .55; cursor: not-allowed; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--primary-2); }
.btn-ghost { background: var(--surface); border-color: var(--border); color: var(--text-2); }
.btn-ghost:hover:not(:disabled) { background: #f9fafb; color: var(--text); }
.btn-danger { background: var(--surface); border-color: var(--border); color: var(--danger); }
.btn-danger:hover:not(:disabled) { background: #fef2f2; border-color: #fecaca; }
.btn-sm { padding: 5px 12px; font-size: 13px; border-radius: 7px; }
.btn-block { width: 100%; }

/* ── 卡片 ─────────────────────────────────── */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); }
.card-pad { padding: 24px; }

/* ── 徽章 ─────────────────────────────────── */
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 500;
}
.badge-ai { background: #ede9fe; color: #7c3aed; }
.badge-webhook { background: #fef3c7; color: #b45309; }
.badge-knowledge_base { background: #d1fae5; color: #047857; }
.badge-user { background: #e0f2fe; color: #0369a1; }
.badge-gray { background: #f3f4f6; color: var(--text-2); }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.dot-on { background: var(--success); }
.dot-off { background: var(--text-3); }

/* ── 表单 ─────────────────────────────────── */
.field { margin-bottom: 18px; }
.field-label { display: block; font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.field-hint { font-size: 12px; color: var(--text-3); margin-top: 5px; }
.req { color: var(--danger); }
.input, .select, .textarea {
  width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 8px;
  font-size: 14px; background: var(--surface); color: var(--text);
  transition: border-color .12s, box-shadow .12s;
}
.input:focus, .select:focus, .textarea:focus {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,.13);
}
.textarea { resize: vertical; min-height: 90px; }
.form-row { display: flex; gap: 16px; }
.form-row > .field { flex: 1; }
.form-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border); }

/* 类型选择卡 */
.type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.type-opt {
  border: 2px solid var(--border); border-radius: 10px; padding: 13px 14px;
  cursor: pointer; transition: border-color .12s, background .12s; background: var(--surface);
}
.type-opt:hover { border-color: var(--border-2); }
.type-opt.on { border-color: var(--primary); background: var(--primary-50); }
.type-opt-t { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
.type-opt-d { font-size: 12px; color: var(--text-2); line-height: 1.4; }

/* 复选列表 */
.check-list { max-height: 240px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; }
.check-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; font-size: 14px; }
.check-item + .check-item { border-top: 1px solid #f3f4f6; }
.check-item:hover { background: #f9fafb; }
.check-item input { accent-color: var(--primary); }
.check-item .badge { margin-left: auto; }

/* ── 提示条 ───────────────────────────────── */
.alert { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; border: 1px solid; }
.alert-err { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
.alert-ok { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }

/* ── 头像 ─────────────────────────────────── */
.ava {
  width: 40px; height: 40px; border-radius: 10px; flex: none;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 15px;
}
.ava-sm { width: 30px; height: 30px; border-radius: 50%; font-size: 12px; }
.ava-ai { background: linear-gradient(135deg, #8b5cf6, #6366f1); }
.ava-webhook { background: linear-gradient(135deg, #f59e0b, #f97316); }
.ava-knowledge_base { background: linear-gradient(135deg, #10b981, #059669); }
.ava-user { background: linear-gradient(135deg, #0ea5e9, #2563eb); }

/* ── 列表网格 ─────────────────────────────── */
.grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }

.item-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px; cursor: pointer; box-shadow: var(--shadow-sm);
  transition: box-shadow .15s, border-color .15s, transform .15s;
}
.item-card:hover { box-shadow: var(--shadow-md); border-color: var(--border-2); transform: translateY(-1px); }
.item-top { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.item-name { font-size: 15px; font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-desc { font-size: 13px; color: var(--text-2); line-height: 1.5; min-height: 20px; margin-bottom: 12px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.item-foot { display: flex; align-items: center; justify-content: space-between; }
.item-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-3); }
.item-acts { display: flex; gap: 6px; opacity: 0; transition: opacity .15s; }
.item-card:hover .item-acts { opacity: 1; }

/* ── 空状态 / 加载 ────────────────────────── */
.empty { text-align: center; padding: 72px 24px; color: var(--text-3); }
.empty-ico { font-size: 38px; margin-bottom: 10px; }
.empty-txt { font-size: 15px; color: var(--text-2); margin-bottom: 4px; }
.empty-hint { font-size: 13px; }
.loading-wrap { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 72px 0; color: var(--text-3); }
.spinner {
  width: 18px; height: 18px; border-radius: 50%; flex: none;
  border: 2px solid var(--border); border-top-color: var(--primary);
  animation: wfspin .7s linear infinite;
}
@keyframes wfspin { to { transform: rotate(360deg); } }

/* ── Dashboard ────────────────────────────── */
.dash-hello { margin-bottom: 26px; }
.dash-hello h1 { font-size: 24px; font-weight: 700; letter-spacing: -.3px; }
.dash-hello p { color: var(--text-2); margin-top: 5px; font-size: 14px; }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
.stat-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 18px 20px; cursor: pointer; box-shadow: var(--shadow-sm);
  transition: box-shadow .15s, transform .15s;
}
.stat-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.stat-ico {
  width: 38px; height: 38px; border-radius: 9px; margin-bottom: 12px;
  display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.stat-num { font-size: 26px; font-weight: 700; letter-spacing: -.5px; line-height: 1.1; }
.stat-label { font-size: 13px; color: var(--text-2); margin-top: 3px; }
.sect-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
.quick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.quick-card {
  background: var(--surface); border: 1px dashed var(--border-2); border-radius: var(--radius);
  padding: 18px; cursor: pointer; transition: border-color .15s, background .15s;
}
.quick-card:hover { border-color: var(--primary); background: var(--primary-50); }
.quick-card .q-ico { font-size: 20px; margin-bottom: 8px; }
.quick-card .q-t { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
.quick-card .q-d { font-size: 12px; color: var(--text-2); }

/* ── 聊天 ─────────────────────────────────── */
.chat-shell { display: flex; flex-direction: column; height: 100vh; }
.chat-head {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 24px; background: var(--surface); border-bottom: 1px solid var(--border); flex: none;
}
.chat-head-info { flex: 1; min-width: 0; }
.chat-head-name { font-size: 15px; font-weight: 700; }
.chat-head-sub { font-size: 12px; color: var(--text-3); }
.chat-body { flex: 1; overflow-y: auto; padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
.msg-row { display: flex; gap: 9px; max-width: 72%; }
.msg-row.own { align-self: flex-end; flex-direction: row-reverse; }
.msg-col { display: flex; flex-direction: column; }
.msg-row.own .msg-col { align-items: flex-end; }
.msg-meta { font-size: 11px; color: var(--text-3); margin-bottom: 4px; display: flex; gap: 6px; }
.bubble {
  padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.6;
  background: var(--surface); border: 1px solid var(--border);
  border-bottom-left-radius: 4px; white-space: pre-wrap; word-break: break-word;
  box-shadow: var(--shadow-sm);
}
.msg-row.own .bubble {
  background: var(--primary); color: #fff; border-color: transparent;
  border-radius: 14px; border-bottom-right-radius: 4px; box-shadow: none;
}
.sys-pill {
  align-self: center; background: #eef0f4; color: var(--text-2);
  font-size: 12px; padding: 4px 14px; border-radius: 999px;
}
.draft-flag {
  display: inline-flex; align-items: center; gap: 4px; margin-top: 6px;
  font-size: 11px; color: #b45309; background: #fef3c7;
  padding: 2px 8px; border-radius: 999px;
}
.chat-bar {
  display: flex; gap: 10px; padding: 14px 24px 18px;
  background: var(--surface); border-top: 1px solid var(--border); flex: none;
}
.chat-input {
  flex: 1; padding: 10px 18px; border: 1px solid var(--border); border-radius: 999px;
  font-size: 14px; background: var(--bg); transition: border-color .12s, box-shadow .12s, background .12s;
}
.chat-input:focus { outline: none; border-color: var(--primary); background: #fff; box-shadow: 0 0 0 3px rgba(99,102,241,.13); }
.chat-send {
  width: 42px; height: 42px; border-radius: 50%; border: none; flex: none;
  background: var(--primary); color: #fff; font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.chat-send:hover { background: var(--primary-2); }
.chat-send:disabled { opacity: .5; cursor: not-allowed; }

/* ── 认证页 ───────────────────────────────── */
.auth-page {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, #eef2ff 0%, #f6f7f9 45%, #ecfdf5 100%);
  padding: 24px;
}
.auth-card {
  width: 100%; max-width: 392px; background: var(--surface);
  border-radius: 16px; padding: 36px 34px; box-shadow: var(--shadow-lg);
  border: 1px solid rgba(255,255,255,.6);
}
.auth-logo {
  width: 46px; height: 46px; border-radius: 12px; margin: 0 auto 14px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: #fff; font-weight: 800;
}
.auth-title { font-size: 20px; font-weight: 700; text-align: center; letter-spacing: -.2px; }
.auth-sub { font-size: 13px; color: var(--text-2); text-align: center; margin: 6px 0 24px; }
.auth-alt { text-align: center; margin-top: 18px; font-size: 13px; color: var(--text-2); }
.auth-alt a { color: var(--primary); font-weight: 600; text-decoration: none; cursor: pointer; }
.auth-alt a:hover { text-decoration: underline; }

/* ── 详情页 ───────────────────────────────── */
.detail-hero {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px; margin-bottom: 16px;
}
.detail-hero-info { flex: 1; min-width: 0; }
.detail-hero-name { font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
.detail-hero-sub { font-size: 13px; color: var(--text-2); margin-top: 3px; }
.back-link {
  display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
  color: var(--text-2); font-size: 13px; margin-bottom: 14px; text-decoration: none;
}
.back-link:hover { color: var(--primary); }
.member-row { display: flex; align-items: center; gap: 12px; padding: 11px 24px; }
.member-row + .member-row { border-top: 1px solid #f3f4f6; }
.member-row:hover { background: #f9fafb; }
.member-meta { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
.member-name { font-weight: 600; font-size: 14px; }
.member-role { font-size: 12px; color: var(--text-3); }

/* ── 其它 ─────────────────────────────────── */
.boot-loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: var(--text-3); gap: 10px; }
.muted { color: var(--text-3); }
.mt-8 { margin-top: 8px; } .mt-16 { margin-top: 16px; } .mt-24 { margin-top: 24px; }
.flex { display: flex; align-items: center; gap: 10px; }
.grow { flex: 1; min-width: 0; }
`

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/** 生产模式：预构建的 dist 目录路径 */
function distDir(baseDir: string): string {
  return resolve(baseDir, 'dist')
}

export function registerUiRoutes(app: Router, baseDir: string): void {
  // ── 客户端 JS bundle ─────────────────────────────────
  if (IS_PRODUCTION) {
    const dist = distDir(baseDir)
    // 生产模式：服务预构建的静态文件
    app.get('/static/app.js', async (_req: Request, _ctx: Context): Promise<Response> => {
      const jsPath = join(dist, 'app.js')
      if (!existsSync(jsPath)) {
        return new Response('/* app.js not built */', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        })
      }
      const js = readFileSync(jsPath, 'utf-8')
      return new Response(js, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      })
    })
  } else {
    // 开发模式：动态编译
    app.get('/static/app.js', async (req: Request, ctx: Context): Promise<Response> =>
      ctx.ui.js(resolve(baseDir, 'ui', 'main.tsx'))
    )
  }

  // ── SPA 入口页面 ───────────────────────────────────
  if (IS_PRODUCTION) {
    const dist = distDir(baseDir)
    const htmlPath = join(dist, 'index.html')
    let htmlTemplate = ''
    if (existsSync(htmlPath)) {
      htmlTemplate = readFileSync(htmlPath, 'utf-8')
        .replace('{{script}}', '/static/app.js')
    }

    const spaPaths = [
      '/', '/login', '/register', '/dashboard',
      '/agents', '/agents/new', '/agents/:id',
      '/companies', '/companies/new',
      '/departments', '/departments/new', '/departments/:id',
      '/chat/new', '/chat/:id',
      '/settings',
    ]

    for (const path of spaPaths) {
      app.get(path, async (): Promise<Response> => {
        if (htmlTemplate) {
          return new Response(htmlTemplate, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
        return new Response(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Platform</title>
  <style>${GLOBAL_CSS}</style>
</head>
<body>
  <div id="root"><div class="boot-loading"><div class="spinner"></div>加载中...</div></div>
  <script src="/static/app.js"></script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      })
    }
  } else {
    const spaPaths = [
      '/', '/login', '/register', '/dashboard',
      '/agents', '/agents/new', '/agents/:id',
      '/companies', '/companies/new',
      '/departments', '/departments/new', '/departments/:id',
      '/chat/new', '/chat/:id',
      '/settings',
    ]

    for (const path of spaPaths) {
      app.get(path, async (req: Request, ctx: Context): Promise<Response> => ctx.ui.html`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Agent Platform</title>
          <style>${ctx.ui.html.unsafe(GLOBAL_CSS)}</style>
        </head>
        <body>
          <div id="root"><div class="boot-loading"><div class="spinner"></div>加载中...</div></div>
          <script src="/static/app.js"></script>
        </body>
        </html>
      `)
    }
  }
}
