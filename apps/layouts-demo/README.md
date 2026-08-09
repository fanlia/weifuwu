# apps/layouts-demo — 布局模式蓝本

用 weifuwu/layout 原语 + weifuwu/components 组件搭建的**完整布局蓝本**——开发者
点左侧列表查看，复制对应文件即可得到一种布局。

## 启动

```bash
cd apps/layouts-demo
node server.ts        # → http://localhost:3001
```

## 布局模式（8 种）

| 分组 | 模式 | 文件 | 核心能力 |
|------|------|------|---------|
| 工作台 | 后台应用壳 | `src/patterns/AppShell.tsx` | wf-app-shell 可折叠侧栏（wf-nav--collapsed）+ 内容区 |
| 工作台 | 分栏工作台 | `src/patterns/SplitWorkspace.tsx` | wf-grid 三栏 + 文件树选中 ↔ Tabs 联动 |
| 工作台 | 聚焦任务页 | `src/patterns/FocusTask.tsx` | wf-center 居中 + Form 校验错误展示 |
| 内容展示 | 文档站 | `src/patterns/Docs.tsx` | Anchor 目录 + prose 正文 + CodeBlock |
| 内容展示 | 仪表盘 | `src/patterns/Dashboard.tsx` | wf-grid 响应式 KPI + 时间范围数据联动 |
| 内容展示 | 数据大屏 | `src/patterns/DataScreen.tsx` | wf-fill 全屏 + wf-layer/wf-pop 容器内角标 + Sparkline |
| 营销推广 | 营销落地页 | `src/patterns/Landing.tsx` | wf-center Hero + wf-grid 特性 + CTA |
| 营销推广 | 移动端 App | `src/patterns/Mobile.tsx` | wf-safe-top/bottom + 搜索过滤 + 底部 Tab |

## 壳能力

- 左侧分组导航（工作台/内容展示/营销推广）+ **↑↓ 键盘导航**
- **查看代码** Drawer（描述条按钮——展示当前模式源码）
- hash 深链（`#/dashboard` 直达）+ 无效 hash 回退
- 响应式：<1024px 侧栏隐藏 → 顶部横向切换条

## 纪律（AGENTS.md §8 布局蓝本纪律）

- 布局只用 weifuwu/layout 原语 + weifuwu/components 组件——**零手写样式**
- 图标一律 Icon 组件（禁 emoji 装饰）
- 能力缺口 → 补到 weifuwu/layout / weifuwu/components（绝不绕过）
- 唯一样式来源：`components.css`（内嵌 layout 原语）

## 断点矩阵（agent-browser 验证）

| 断点 | 1280 | 1024 | 768 | 375 |
|------|------|------|-----|-----|
| 横向溢出 | 0/8 | 0/8 | 0/8 | 0/8 |
| 侧栏 | 可见 | 可见 | 隐藏→顶部条 | 隐藏→顶部条 |
| 模式切换 | ✓ | ✓ | ✓ | ✓ |
