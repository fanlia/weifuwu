# Org — 界面优化方案

> 目标：从"功能可用"到"体验优秀"。
> 评估维度：视觉一致性、交互流畅度、信息层级、响应式、动效。

---

## 当前状态评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⭐⭐⭐⭐ | 5 个 Phase 全部跑通，CRUD + AI + KB 均可用 |
| 视觉一致性 | ⭐⭐ | 颜色/间距/字体未统一，Tailwind 类名散落 |
| 交互流畅度 | ⭐⭐⭐ | 基本交互可用，缺过渡动画和反馈 |
| 信息层级 | ⭐⭐⭐ | 三栏布局合理，但侧栏树信息密度低 |
| 响应式 | ⭐ | 未考虑移动端 |
| 动效 | ⭐⭐ | Transition 基本支持，缺微交互动效 |

---

## Phase 1 — 设计系统（高优先级，1 周）

建立统一的设计 Token，消除散落的 Tailwind 类名。

### 1.1 设计 Token

```typescript
// 统一设计 Token，替代散落的 Tailwind 类名
const theme = {
  // 颜色
  color: {
    primary: '#4f8cff',      // 主色 — 按钮/链接/激活态
    primaryHover: '#3a7aff',
    primaryLight: '#dbeafe',  // 浅色 — 选中背景/气泡
    danger: '#ef4444',       // 危险操作
    success: '#22c55e',      // 成功提示
    warning: '#f59e0b',      // 警告
    text: '#1f2937',         // 主文字
    textSecondary: '#6b7280', // 次要文字
    textTertiary: '#9ca3af', // 辅助文字
    bg: '#f9fafb',           // 页面背景
    bgCard: '#ffffff',       // 卡片背景
    bgSidebar: '#fafafa',    // 侧栏背景
    border: '#e5e7eb',       // 边框
    borderLight: '#f3f4f6',  // 浅边框
  },
  // 间距 (4px 基准)
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  // 圆角
  radius: { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 },
  // 阴影
  shadow: {
    card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    elevated: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04)',
    modal: '0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)',
  },
  // 字体
  font: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'Menlo, Monaco, Consolas, monospace',
    size: { xs: 12, sm: 13, base: 14, lg: 16, xl: 18, xxl: 24 },
  },
}
```

### 1.2 组件级样式架构

```
每个组件用 createStyles 定义局部样式，不再使用散落类名:

const s = createStyles({
  card: `bg-white rounded-${theme.radius.lg} shadow-sm p-${theme.space.lg}`,
  btn: `px-4 py-2 rounded-${theme.radius.md} text-sm font-medium cursor-pointer transition-colors`,
  btnPrimary: `bg-${theme.color.primary} text-white hover:bg-${theme.color.primaryHover}`,
  input: `px-3 py-2 border rounded-${theme.radius.md} text-sm focus:outline-none focus:ring-2 focus:ring-${theme.color.primary}`,
})
```

### 1.3 全局 CSS 变量

在 `style.css` 中定义 CSS 自定义属性，让 Tailwind 和自定义样式共享同一套 Token：

```css
:root {
  --color-primary: #4f8cff;
  --color-primary-hover: #3a7aff;
  --color-primary-light: #dbeafe;
  --color-danger: #ef4444;
  --color-success: #22c55e;
  --sidebar-width: 260px;
  --header-height: 52px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

---

## Phase 2 — 页面级优化（高优先级，1.5 周）

### 2.1 登录/注册页

| 问题 | 优化方案 |
|------|---------|
| 纯白背景太空 | 加入渐变背景或品牌图案 |
| 没有 Logo | 设计 Org 字标 + 图标 |
| 错误提示不明显 | 红色边框 + 图标 + 动效出现 |
| 表单无验证 | 实时校验邮箱格式/密码长度 |
| 无加载状态 | 按钮提交时显示 loading spinner |
| 缺少品牌感 | 底部加 "Powered by weifuwu" |

优化后的结构：
```
┌─────────────────────────────┐
│         🏢 Org              │
│   Enterprise AI Collab      │
│                             │
│  ┌───────────────────────┐  │
│  │  昵称（注册时）       │  │
│  │  邮箱                 │  │
│  │  密码                 │  │
│  │                       │  │
│  │  [◌ 登录 / 注册]      │  │
│  │                       │  │
│  │  没有账号？注册        │  │
│  └───────────────────────┘  │
│                             │
│  ── Powered by weifuwu ──   │
└─────────────────────────────┘
```

### 2.2 首页（租户列表）

| 问题 | 优化方案 |
|------|---------|
| 卡片太素 | 加入 tenant slug 作为子域名预览 |
| 无创建引导 | 空态时显示大号引导卡片 |
| 创建表单弹出突兀 | 改为 Modal 弹窗 |
| 无快捷操作 | 卡片加"进入"按钮浮层 |

### 2.3 组织树（侧栏）

| 问题 | 优化方案 |
|------|---------|
| 信息密度低 | 每项只占一行，浪费空间 |
| 无图标区分层级 | Tenant/Company/Department 用不同图标 |
| 无未读消息标记 | 部门后显示未读数红点 |
| 展开/收起无动画 | 添加高度过渡 |
| 当前选中不明显 | 用左侧色条替代背景色 |

优化后：
```
┌────────────────┐
│  Org      👤   │
├────────────────┤
│ ▼ 🏢 Acme Inc  │
│   ▼ 🏗️ Eng    │
│     💬 AI Team  │
│     💬 Backend  │
│   ▶ 🏗️ Design  │
│ ▶ 🏢 Demo Corp │
├────────────────┤
│ v0.1    退出   │
└────────────────┘
```

### 2.4 部门聊天页

| 问题 | 优化方案 |
|------|---------|
| 消息气泡样式简单 | 圆角+阴影+渐变色，区分用户/AI |
| 无时间分组 | 今天/昨天/更早 分隔线 |
| 无已读状态 | 消息右下角小勾 |
| 输入框简陋 | 加入 @ 快捷提示浮层 + emoji 按钮 |
| AI 流式显示 | 打字机光标动画 |
| 成员侧栏折叠 | 改为右侧滑出面板 |
| 知识库管理 | 独立 tab 页切换 |

消息气泡优化：
```
┌────────────────────────────────┐
│           昨天 14:30             │
│                                │
│  ┌─────────────────────┐       │
│  │ @智能助手 你好！     │  → 我  │
│  └─────────────────────┘       │
│                                │
│       ┌──────────────────────┐ │
│       │ 🤖 智能助手           │ │
│       │                      │ │
│       │ 你好！我是 Org 的     │ │
│       │ AI 助手，有什么可以   │ │
│       │ 帮你的？ █           │ │
│       │                      │ │
│       │ 参考: 内部知识库[1]  │ │
│       └──────────────────────┘ │
│                                │
│  ── 下午 2:15 ──               │
│                                │
│  ┌─────────────────────┐       │
│  │ 这个功能怎么配置？   │  → 我  │
│  └─────────────────────┘       │
│                                │
├────────────────────────────────┤
│ 📎 🔍 @ 🤖 输入消息...  [发送] │
└────────────────────────────────┘
```

---

## Phase 3 — 交互增强（中优先级，1 周）

### 3.1 过渡动画

| 场景 | 动画方案 |
|------|---------|
| 页面切换 | 左右滑动（已有 page transition） |
| 弹窗出现 | 淡入 + 向上位移 + backdrop 淡入 |
| 消息出现 | 淡入 + 轻微上移 |
| 组织树展开 | 高度过渡 + 淡入 |
| Toast 出现 | 从右上角滑入，3 秒后滑出 |
| 按钮点击 | 微缩放 (transform: scale(0.97)) |
| 列表项 hover | 轻微上移 + 阴影增强 |

### 3.2 骨架屏

```tsx
// 统一骨架屏组件，替换现有简单版本
function Skeleton({ width = '100%', height = 16, radius = 4 }: {
  width?: string | number
  height?: number
  radius?: number
}) {
  return (
    <div
      class="bg-gray-200 animate-pulse"
      style={{
        width: typeof width === 'number' ? width + 'px' : width,
        height: height + 'px',
        borderRadius: radius + 'px',
      }}
    />
  )
}

// 页面级骨架屏
function PageSkeleton() {
  return (
    <div class="p-8 space-y-4">
      <Skeleton width="60%" height={28} />
      <Skeleton width="40%" height={14} />
      <div class="grid gap-4 mt-6">
        <Skeleton height={80} radius={12} />
        <Skeleton height={80} radius={12} />
        <Skeleton height={80} radius={12} />
      </div>
    </div>
  )
}
```

### 3.3 Toast 增强

```typescript
// 增加图标 + 进度条自动消失动画
interface ToastItem {
  id: number
  type: 'success' | 'error' | 'info' | 'warning'
  msg: string
  duration?: number  // 每个 toast 可自定义持续时间
  action?: { label: string; onClick: () => void }  // 可操作按钮
}
```

---

## Phase 4 — 响应式布局（中优先级，1 周）

### 4.1 断点方案

| 断点 | 宽度 | 布局 |
|------|------|------|
| Mobile | < 640px | 单栏，侧栏隐藏为汉堡菜单 |
| Tablet | 640-1024px | 侧栏折叠为图标 |
| Desktop | > 1024px | 完整三栏 |

### 4.2 移动端适配

```
Desktop:            Mobile:
┌────┬──────────┐   ┌──────────────┐
│ 侧 │  主内容   │   │  ☰ Org  👤  │
│ 栏 │          │   ├──────────────┤
│    │          │   │              │
│    │          │   │   主内容      │
│    │          │   │              │
│    │          │   │              │
└────┴──────────┘   └──────────────┘

侧栏 → 滑出式抽屉 (Drawer)
聊天输入 → 跟随键盘
卡片列表 → 单列
按钮 → 更大触控区域 (min 44px)
```

### 4.3 响应式组件清单

| 组件 | 移动端行为 |
|------|-----------|
| 侧栏 | 隐藏，汉堡按钮展开 Drawer |
| 组织树 | 在 Drawer 中展示 |
| 聊天 | 全屏，返回按钮回到上一级 |
| 成员侧栏 | 底部弹出 Sheet |
| 知识库面板 | 底部弹出 Sheet |
| Modal 弹窗 | 全屏 Modal |
| 表格/列表 | 卡片模式替代 |

---

## Phase 5 — 进阶体验（低优先级，1 周）

### 5.1 暗色模式

```css
:root { /* 亮色 */ }
:root[data-theme="dark"] {
  --color-bg: #1a1a2e;
  --color-bg-card: #16213e;
  --color-text: #e0e0e0;
  --color-border: #2a2a4a;
}
```

通过 `matchMedia('(prefers-color-scheme: dark)')` 自动切换 + 手动切换按钮。

### 5.2 快捷操作

| 快捷键 | 操作 |
|--------|------|
| `Ctrl+K` | 命令面板（搜索租户/公司/部门/Agent）|
| `Ctrl+N` | 新建当前上下文实体 |
| `/` | 聚焦搜索 |
| `Escape` | 关闭弹窗/取消 |

### 5.3 空态与引导

每个空态页面提供：
1. 大号图标（72px）表达情感
2. 简洁说明文字
3. 明确的下一步操作按钮
4. 可选的"查看教程"链接

### 5.4 错误边界

全局 ErrorBoundary 包裹每个页面组件：
```
┌──────────────────────┐
│   😅 出错了          │
│                       │
│   页面加载失败        │
│   [重新加载] [返回首页] │
└──────────────────────┘
```

---

## 实施路线图

| Phase | 内容 | 工作量 | 影响面 |
|-------|------|--------|--------|
| **P1** 设计系统 | Token 化 + createStyles 重构 | ~20 个组件 × 0.5h = 10h | 全局 |
| **P2** 页面优化 | 登录/首页/聊天/侧栏 4 个核心页面 | 4 页面 × 3h = 12h | 用户主要路径 |
| **P3** 交互增强 | 动画 + 骨架屏 + Toast 升级 | 6h | 全局感知 |
| **P4** 响应式 | 移动端适配 | 8h | 移动用户 |
| **P5** 进阶体验 | 暗色模式 + 快捷键 + 空态 | 6h | 深度用户 |

**总计：约 42 小时（1 人全职 1 周 + 2 天）**

---

## 快速见效项（推荐优先做）

以下 5 项投入最小、视觉提升最大：

| # | 项目 | 预计时间 | 效果 |
|---|------|---------|------|
| 1 | 统一颜色 Token + 按钮/卡片样式 | 2h | 视觉一致性提升 60% |
| 2 | Modal 弹窗替代内联表单 | 1h | 交互清晰度提升 |
| 3 | 消息气泡样式优化 + 时间分组 | 2h | 聊天可读性提升 50% |
| 4 | 骨架屏替换 loading 文字 | 1h | 加载感知提升 |
| 5 | Toast 加图标 + 动画 | 1h | 反馈体验提升 |

要从哪一项开始？
