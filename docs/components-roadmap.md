# weifuwu/components 新组件路线图

> 方法：**实战驱动（dogfooding）** —— 从 agent-platform 手写处找缺口，证据优先；
> 并**对照主流开源组件库**（shadcn/ui ~50 / Ant Design ~60 / Mantine ~80）做共识校验；
> 遵循 AGENTS.md：TDD 先行（红→绿）、零 npm 运行时依赖、style-audit 16 条纪律、
> 诚实裁剪（不支持的能力明确不提供）。

## 主流组件库对照（共识组件 → weifuwu 覆盖）

| 类别 | 主流库共识组件 | weifuwu 已覆盖 | 缺口 → 状态 |
|------|--------------|---------------|------------|
| 通用 | button/input/textarea/select/icon/divider | ✅ 全覆盖 | — |
| 表单 | checkbox/switch/radio/slider/form/field/file-upload/search-input | ✅ 全覆盖 | — |
| 反馈 | alert/toast/modal/drawer/popover/tooltip/confirm(popconfirm)/progress/loading(spin)/skeleton/empty | ✅ 全覆盖 | — |
| 导航 | breadcrumb/tabs/dropdown/pagination/steps/accordion | ✅ 全覆盖 | **Menu（sidebar 导航）→ 第二批** |
| 展示 | avatar/badge/tag/table/card/stat(statistic)/image | ✅ 全覆盖 | **List / Descriptions / Timeline / AvatarGroup → 已计划** |
| AI | chat(assistant) | ✅ AiChat + ToolCallCard + ApprovalCard | **Markdown / CodeBlock → 已计划** |
| 录入增强 | input-number / password-input / tags-input / color-picker / rate / multi-select / pin-input(OTP) | ❌ 缺 | **InputNumber / PasswordInput / TagsInput → 第二批**；其余裁剪 |
| 导航进阶 | menu/sidebar/anchor/affix/command(cmd+k)/context-menu/menubar | ❌ 缺 | **Menu → 第二批**；anchor/affix 可原语实现；command/context-menu 裁剪 |
| 展示进阶 | tree/carousel/list/highlight/result/qrcode/watermark | ❌ 缺 | **List / Highlight / Result → 第三批**；tree/carousel 裁剪；qrcode/watermark 有依赖裁剪 |
| 布局 | grid/stack/space/center/container/flex | ✅ wf-* 原语全覆盖 | —（`wf-grid`/`wf-row`/`wf-stack` 即 shadcn Grid/Stack/Space） |
| 反馈进阶 | result/notification | ❌ 缺 | **Result → 第三批**（notification = Toast 已有） |

## 调研证据（agent-platform 手写处 → 缺口）

| 手写模式 | 位置 | 缺口 |
|---------|------|------|
| `{msg.content}` 纯文本输出 AI 回复（无 markdown） | `ui/pages/Chat.tsx:312`、`AiChat.ts:201` | **Markdown 渲染** |
| 日志行手写 `wf-border-b` 堆叠 | `AgentDetail.tsx:314-320` | **Timeline** |
| 模型参数 `String + parseFloat/parseInt` 手写数字状态 | `NewAgent.tsx:55-95` | **InputNumber** |
| 详情字段展示（label/value 栅格手写） | 多个详情页 | **Descriptions** |
| Chat 页 100+ 行手写消息渲染（气泡/编辑/重试/草稿审批） | `Chat.tsx:290-400` | **MessageBubble**（抽取复用） |
| 导航项循环 + `--active` 手动判断 | `AppLayout.tsx:56-68` | **Menu** |
| 5 处 `Input type="password"`（无可见性切换） | `Login/Register/Settings` | **PasswordInput** |

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

## 第三批：主流库共识 + 实战证据（新增）

### 8. Menu — 导航菜单（shadcn Sidebar/NavigationMenu · antd Menu · Mantine NavLink）

- **证据**：AppLayout 手写 `wf-nav/wf-nav-group/wf-nav-item` 循环 + `--active` 判断（5 处导航）
- 分组导航项 + 图标 + 选中态 + `onSelect`；`type="nav"`（侧栏，align 竖排）
- API：`<Menu items={[{ key, label, icon, group?, href?, active? }]} onSelect={k => ...} />`
- 键盘：方向键导航 + Enter 激活（对齐 AGENTS.md 键盘可达红线）
- 裁剪：不做子菜单展开/折叠（Dropdown 可组合）、水平菜单栏（Menubar 裁剪）

### 9. PasswordInput — 密码可见切换（Mantine PasswordInput · antd Input.Password）

- **证据**：Login/Register/Settings 共 5 处手写 `Input type="password"`，无可见性切换
- `Input` 子集 + 眼睛按钮（Icon eye/eye-off 已有？——需新增图标）+ `autoComplete` 透传
- API：`<PasswordInput label value onChange placeholder autoComplete />`
- 键盘：眼睛按钮可 focus + Enter/Space 切换

### 10. TagsInput — 标签输入（Mantine TagsInput · antd Select mode=tags）

- 回车/逗号添加标签、Backspace 删除、`maxTags`、去重；受控 `value: string[]` + `onChange`
- 应用：技能绑定、关键词标签、分类维护
- 裁剪：不做下拉建议（Select searchable 可组合）、中文输入法 composition 需处理（关键）

### 11. Highlight — 搜索词高亮（Mantine Highlight）

- 给定文本 + 高亮词数组 → 分词渲染 `<mark>`（零依赖，VNode 拼接）
- 配合 SearchInput/Table 搜索结果命中展示
- API：`<Highlight text="..." query={['关键词']} />`

### 12. List — 通用列表（antd List · shadcn List）

- `items + renderItem` + 可选 `header`/`footer`/`empty`；每项骨架由业务自定
- 定位：避免 Table 大材小用的场景（消息列表/文件列表/成员列表）

### 13. Result — 结果页（antd Result）

- `status="success|error|warning|info"` + `title` + `desc` + `extra`（操作按钮区）
- 应用：注册完成/操作成功/404/403 页
- 裁剪：不做内置路由跳转（页面自身处理）

## 暂缓（主流库有，但裁剪边界大 / 依赖重 / 无实战证据）

| 组件 | 原因 |
|------|------|
| Transfer 穿梭框 | 交互复杂，零依赖成本高，无证据 |
| Cascader / TreeSelect | 级联数据模型 + 复杂弹层 |
| Mentions @提及 | 输入框内嵌弹层，composition 复杂 |
| ContextMenu / Menubar | 右键/菜单栏交互模型重 |
| Command (Cmd+K) | 全屏命令面板 + 键盘流，单组件成本高 |
| Resizable 分割面板 | 拖拽布局，edge case 多 |
| Tree 树形 | 需树模型 + 展开/选中/拖拽，暂缓（org 已删，需求弱） |
| Carousel 轮播 | 动画/触摸/自动播放组合 |
| ColorPicker | NewAgent 无 color 输入证据；画布/弹层/格式解析成本 |
| Rate 评分 | 无证据；Icon star 可快速组合 |
| PinInput/OTP | 无证据；可用 Input 组合 |
| QRCode / Watermark | 依赖（qrcode 库）/ 偏门 |
| Anchor / Affix | 可用 wf-* 原语 + 少量 JS 实现，组件化收益低 |

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
  NewAgent 参数改 InputNumber；AppLayout 导航改 Menu；密码输入改 PasswordInput —— 减少手写处可量化
- style-audit 全绿；README/demo 计数同步

## 诚实裁剪（不做，明确声明）

- Markdown：GFM 表格/任务列表/删除线/脚注/raw HTML/语法高亮
- CodeBlock：语法高亮（依赖）——语言标签仅展示
- Timeline：横向/折叠展开节点
- InputNumber：长按连增、千分位货币格式
- AvatarGroup：hover 展开、tooltip
- MessageBubble：打字动画、markdown 内嵌（由 Markdown 组件组合）
- Menu：子菜单展开/水平菜单栏（Menubar）
- TagsInput：下拉建议（组合 Select searchable）
- Result：内置路由跳转
