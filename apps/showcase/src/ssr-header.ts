/**
 * SSR 共享 header（shellHeader）——首页/文档页 SSR 首帧的导航壳
 * 与 SPA Shell（shell.tsx）视觉一致——抽独立模块供测试对比（SSR vs SPA 差异分析）
 */
export const NAV_ITEMS = [
  ['components', '组件'], ['layout', '布局原语'], ['patterns', '页面模式'],
  ['apps', '应用模板'], ['backend', '后端能力'], ['capabilities', '框架能力'], ['guides', '指南'],
] as const

/** SSR header HTML（inline style——与 SPA Shell 的 wf-* 类等效；active 为当前域高亮）
 * 含 ThemeSwitch 静态占位（与 SPA 同宽同文——接管时右侧不重排——header 闪白/变样的主因） */
export const shellHeader = (active: string): string => `<div style="position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--wf-color-bg-primary,#fff);border-bottom:1px solid var(--wf-color-border,#e2e8f0)">
  <a href="/" style="display:flex;align-items:center;gap:6px;text-decoration:none;color:inherit;white-space:nowrap;font-weight:700;font-size:14px">wf/showcase</a>
  <nav style="display:flex;gap:4px;flex:1;overflow-x:auto">
    ${NAV_ITEMS.map(([id, name]) => `<a href="/${id}" style="padding:4px 10px;border-radius:6px;text-decoration:none;font-size:13px;white-space:nowrap;${active === id ? 'color:var(--wf-color-primary,#2563eb);font-weight:600' : 'color:var(--wf-color-text-secondary,#64748b)'}">${name}</a>`).join('')}
  </nav>
  <span style="font-family:var(--wf-font-mono);font-size:11px;color:var(--wf-color-text-tertiary,#94a3b8)">LLM: /llms.txt · /content/:id.md</span>
  ${themeSwitchPlaceholder}
</div>`

/** ThemeSwitch 静态占位（SSR 首帧——与 SPA 同宽同文：自动/亮色/暗色——接管时无布局重排） */
export const themeSwitchPlaceholder = `<span data-wf-role="theme-placeholder" style="display:inline-flex;align-items:center;gap:2px;background:var(--wf-color-bg-secondary,#f1f5f9);border-radius:6px;padding:2px">
  <span style="padding:3px 10px;font-size:12px;line-height:1;color:var(--wf-color-text-secondary,#64748b)">自动</span>
  <span style="padding:3px 10px;font-size:12px;line-height:1;color:var(--wf-color-text-secondary,#64748b)">亮色</span>
  <span style="padding:3px 10px;font-size:12px;line-height:1;color:var(--wf-color-text-secondary,#64748b)">暗色</span>
</span>`
