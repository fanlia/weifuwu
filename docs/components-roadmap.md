# weifuwu/components 新组件路线图

> 方法：**实战驱动（dogfooding）** —— 从 agent-platform 手写处找缺口，证据优先；
> 遵循 AGENTS.md：TDD 先行（红→绿）、零 npm 运行时依赖、style-audit 16 条纪律、
> 诚实裁剪（不支持的能力明确不提供）。

## 调研证据（agent-platform 手写处 → 缺口）

| 手写模式 | 位置 | 缺口 |
|---------|------|------|
| `{msg.content}` 纯文本输出 AI 回复（无 markdown） | `ui/pages/Chat.tsx:312`、`AiChat.ts:201` | **Markdown 渲染** |
| 日志行手写 `wf-border-b` 堆叠 | `AgentDetail.tsx:314-320` | **Timeline** |
| 模型参数 `String + parseFloat/parseInt` 手写数字状态 | `NewAgent.tsx:55-95` | **InputNumber** |
| 详情字段展示（label/value 栅格手写） | 多个详情页 | **Descriptions** |
| Chat 页 100+ 行手写消息渲染（气泡/编辑/重试/草稿审批） | `Chat.tsx:290-400` | **MessageBubble**（抽取复用） |

## 第一批：AI 场景核心（优先，agent-platform 直接受益）

### 1. Markdown — AI 回复渲染

- 零依赖自研**安全子集** parser：标题 `#`-`####`、列表（有序/无序）、代码块 ` ``` `、
  行内代码、粗体/斜体、链接、引用、分割线、段落
- **安全基线**：无 raw HTML 透传（禁止 innerHTML 注入用户/AI 内容——解析后以 VNode 渲染，天然转义）；链接强制 `rel="noopener"` 且 `https:` 白名单
- API：`<Markdown content="..." />`，可选 `className`
- 裁剪：不做 GFM 表格/任务列表/删除线/脚注/HTML 内嵌/语法高亮（SyntaxHighlighter 是运行时依赖，违背零依赖）——这些以文档声明"不支持"

### 2. CodeBlock — 代码展示块

- 语言标签（从代码围栏提取）+ 复制按钮（`navigator.clipboard` + 成功反馈）+ 横向滚动
- API：`<CodeBlock code="..." lang="ts" title="示例.ts" />`；Markdown 内部复用
- 裁剪：不做语法高亮（零依赖）；复制失败降级 `execCommand` 兜底

### 3. Timeline — 时间线/执行日志

- 竖向时间线：节点（圆点/图标/自定义）+ 时间 + 标题 + 内容 + 连接线
- 支持 `mode="left|right|alternate"`、节点状态色（default/info/success/warning/error）、`reverse`
- API：`<Timeline items={[{ key, title, time, content, status, dot }]} />`
- 键盘可达：无交互则非 focusable（纯展示）；若有 onClick 节点则 role=button + Enter 处理
- 裁剪：不做横向时间线

## 第二批：SaaS 通用表单/展示

### 4. InputNumber — 数字输入

- `min/max/step` + 增减按钮（长按连增可裁剪，首版只做单击）+ `precision` 格式化
- 受控 `value: number | null` + `onChange(n)`；空值 → null；失焦 clamp 到 min/max
- 键盘：上下箭头增减（可裁剪为按钮 + 直接输入）
- API 对齐 Input（label/error/hint/disabled/required）

### 5. Descriptions — 描述列表

- `label/value` 项栅格：`column={1|2|3|4}`、`bordered`、`size`
- API：`<Descriptions items={[{ label, value, span }]} column={2} bordered />`
- 语义：`<dl>` 结构（dt/dd），屏幕阅读器友好

### 6. AvatarGroup — 头像组

- 堆叠头像（负 margin 重叠）+ `max={3}` 溢出显示 `+N`（hover 展开裁剪为不可展开）
- API：`<AvatarGroup items={[{ name, src, color }]} max={3} size="md" />`
- 裁剪：不做 hover 展开 tooltip

### 7. MessageBubble — 独立消息气泡

- 从 AiChat 抽出气泡层复用：`content`（纯文本/自定义 VNode）+ `role="user|assistant"` +
  `status="complete|streaming|error"` + 可选 `actions`（重试/复制）
- 目的：业务聊天页（agent-platform Chat 页，DB 持久化消息）复用标准气泡样式，
  不再手写 `wf-bubble` 类拼接
- 裁剪：不做打字指示器动画（Loading 已有）

## 实施顺序与验证（每组件 TDD）

```
1. 写失败测试（renderVNode 断言 + jsdom 事件级测试，按 UI 组件测试纪律）
   → 最小实现 → 重构
2. CSS 遵守 style-audit：动效 token（--wf-dur-*）、语义色 -text 变体、
   禁裸文本字形（Icon）、focus-visible、CJK 感知（--wf-heading-case）
3. 导出：src/components/index.ts + 类型
4. components-demo 加 DemoCard（交互 + code 字符串）
5. README 组件列表 + 计数同步（组件数/测试数）
6. 浏览器实测（agent-browser）：交互 + 键盘 + 视口
```

## 验收

- 框架测试全绿（现有 1056 + 新增）；新组件测试覆盖：渲染快照、交互状态、键盘、安全边界（Markdown XSS 用例）
- agent-platform 落地验证：Chat 页接入 Markdown + MessageBubble；AgentDetail 日志改 Timeline；
  NewAgent 参数改 InputNumber —— 减少手写处可量化
- style-audit 全绿；README/demo 计数同步

## 诚实裁剪（不做，明确声明）

- Markdown：GFM 表格/任务列表/删除线/脚注/raw HTML/语法高亮
- CodeBlock：语法高亮（依赖）——语言标签仅展示
- Timeline：横向/折叠展开节点
- InputNumber：长按连增、千分位货币格式
- AvatarGroup：hover 展开、tooltip
- MessageBubble：打字动画、markdown 内嵌（由 Markdown 组件组合）
