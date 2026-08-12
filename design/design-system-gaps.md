# weifuwu/layout + weifuwu/components 缺口走查（P5）
> **状态（2026-12 确认）**：✅ 已完成——P5 缺口走查——零自定义 CSS 达成

> 目标：**开发者零自定义 CSS** —— 业务代码只写 `wf-*` 原语 + 组件，不再手写 `style="..."`。
> 方法：dogfooding 走查（agent-platform / components-demo + 已归档的 aippt / weifuwu-demo）+ 运行时 DOM 审计。
> 结论：P0-P4 打好的是**设计基线**（层级/无障碍/暗色/排版），本阶段补**表达力缺口**——开发者仍要手写的样式。

## 走查发现的缺口（按手写频率排序）

### 1. 应用外壳缺失 —— agent-platform 整个布局无样式 ⚠️ 最严重

`AppLayout.tsx` 使用了 `app-shell / sidebar / side-nav / nav-item / nav-group / user-chip / main` 等类，
**weifuwu/layout 中一个都没有** —— 渲染结果完全无样式（白底、无边框、无导航态）。

SaaS 应用普遍需要：侧边栏（品牌区 + 导航 + 底部用户区）+ 主内容区。这是"开发者必须写自定义 style"
的最大单一来源。

### 2. 间距/尺寸工具类缺失 —— 手写频率第一

`apps/weifuwu-demo`/aippt 等早期示例中 14 处 `padding: var(--wf-space-*)`、`margin-bottom: var(--wf-space-*)`；
`.row/.field/.lbl` 全是 `gap: 8px/12px` 复写；`width: 100%` 出现 6 次。
Token 存在但没有**消费 token 的类**，开发者被迫内联。（示例应用已归档，现状以 components-demo 为验证面）

### 3. 排版工具类不全

- 无 `white-space: pre-wrap` / `word-break: break-word`（聊天气泡 `.bubble` 手写）
- 无 `text-transform` 工具（aippt `.history-theme`、weifuwu-demo 表头 `uppercase + letter-spacing` 手写——应用已归档）

### 4. 组件能力缺口

| 缺口 | 证据（手写处） | 补法 |
|------|---------------|------|
| 分段控件 SegmentedControl | aippt `.mode-tabs` / `.template-chip`、agent-platform 状态筛选 | 新组件 |
| Card hover 抬升 | aippt `.history-card:hover { translateY(-2px) }` | Card 加 `hover` prop |
| Avatar 指定色 | agent-platform `.ava-user/.ava-ai/.ava-webhook`（按类型着色） | Avatar 加 `color` prop |
| 字数统计 | aippt `.doc-count` | Textarea 加 `showCount`/`maxLength` |
| 状态点 + 文字 | agent-platform `StatusDot`、weifuwu-demo 手写 6px 圆点 | Badge dot 已覆盖（8px），文档提示即可 |
| 控件高度一致 | Button md=36px，Input 实测 41.5px | Input/Select 补 `min-height` |

### 5. 文档/计数不同步

README「35 布局原语 / 91 Token / 43 组件」与 demo 文案「41 组件」互相矛盾（P4 后已 +2 组件）。

## 诚实裁剪（不做）

- 响应式侧边栏抽屉（需要 JS 开关，属应用层职责——layout 提供静态外壳，移动端降级堆叠）
- 断点前缀版间距工具（`wf-p-md@sm`）—— 组合爆炸，按需再议
- `wf-mx-*` / `wf-m-*` 全量 margin 变体 —— 只提供高频 `mt/mb/my`
- 任意值工具（`wf-p-[13px]`）—— 与 Token 体系相悖

## 执行清单

### 第一轮：表达力缺口（P5）

- [x] `_app-shell.css`：`wf-app-shell/sidebar/…/nav/main` 外壳原语
- [x] `_spacing.css`：`wf-p-*` `wf-px-*` `wf-py-*` `wf-mt-*` `wf-mb-*` `wf-my-*` `wf-gap-*` `wf-w-full` `wf-h-full`
- [x] `_text.css` 扩展：`wf-pre-wrap` `wf-break-word` `wf-uppercase/lowercase/capitalize` `wf-text-nowrap` `wf-tracking-*`
- [x] `SegmentedControl` 组件（含 CSS/测试/导出/demo）
- [x] `Card` hover 抬升变体
- [x] `Avatar` `color` prop（指定色覆盖哈希色）
- [x] `Input/Select/Textarea` `min-height` 与 Button 对齐（36px）
- [x] `Textarea` `showCount`/`maxLength` 字数统计
- [x] README 计数同步（Token 92 / 布局原语 62 / 组件 44）+ demo 文案
- [x] 全量测试 + 构建验证

### 第二轮：零 style.css 文件（P6）

- [x] `_text.css` 加语义色文本：`wf-text-success/warning/error/info`
- [x] `_surface.css` 加面工具：`wf-bg-secondary/tertiary/brand/success/warning/error/info` + `wf-pill` + `wf-bubble/--own/--ai` 聊天气泡
- [x] `_hidden.css` 加 `wf-dim`（视觉淡化）
- [x] `Input` 加 `variant="borderless"`（可编辑标题/内联编辑）
- [x] **weifuwu-demo 完全删除 style.css**：改为引用 `weifuwu/components/style.css`，业务代码 = 组件 + 原语，主题覆盖内联 HTML
- [x] README 加「零自定义 CSS 模式」指南段 + 诚实例外（打印样式/第三方宿主/业务特有交互）
- [x] 全量测试 + 浏览器实测（页面 0 个非 `wf-*` 类）

### 第三轮：应用全量转换（零 style.css 落地）

| 应用 | 删除的自定义 CSS | 转换结果（浏览器实测） |
|------|----------------|----------------------|
| agent-platform | `src/ui/routes.ts` GLOBAL_CSS **409 行** + index.html `<style>` 27 行 | 14 个页面全部改用组件/原语；登录/仪表盘/Agents/NewChat 页 0 非 `wf-*` 类 |
| aippt | `public/style.css` **190 行** | 5 个页面 + SlidePreview 转换；Home/History/Deck/Share 实测通过；打印样式降级为 HTML 内联 `<style>`（诚实例外） |
| components-demo | `public/style.css` 61 行 + **94 处**内联样式 | 脚手架改 `wf-*`，内联全清；44 个 DemoCard 渲染正常 |
| weifuwu-demo | `style.css`（上轮已删） | 纯组件 + 原语 |

框架侧顺带补齐：`StatCard onClick`（可点击指标卡）、`Card active`（选择卡选中态）、`wf-rounded-*`（圆角工具）、`wf-print-hidden/block`（打印工具）。
