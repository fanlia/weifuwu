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

## 验收（✅ 已全部完成）

- ✅ 框架测试全绿（994 + db 155 + app 79）；新组件测试覆盖：渲染快照、交互状态、键盘、安全边界（Markdown XSS 用例）
- ✅ agent-platform 落地验证（浏览器实测）：Chat 页接入 Markdown + MessageBubble（流式渲染）；
  AgentDetail 日志改 Timeline（6 条执行日志 + 状态色）；NewAgent 参数改 InputNumber（+64 递增/clamp 8192）；
  AppLayout 导航改 Menu（方向键 + active 随路由）；密码输入改 PasswordInput（Login/Register/Settings 共 6 处）
- ✅ style-audit 全绿（白名单补充 0.875em）；README/demo 计数同步（48 → 61 组件）
- ✅ 13 个组件全部落地（两批实施 + 全部测试 + components-demo DemoCard + 浏览器验证）

## 落地后修复

- **messager Redis 环回去重**（流式 token 乱序根因）：broadcast 本地直发 + Redis publish，
  本实例 subscriber 收到自己的 publish 重复广播 → 事件发两次交错 → 前端 token 重复/乱序。
  修复：publish 携带实例唯一 `_pid`，订阅跳过自己。配套环回去重回归测试。

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

---

# 第四批：开发者日常高频场景（61 → 69 组件）

> 视角扩展：前三批以**实战证据**为主，本批补充**开发者日常开发频率**视角——
> 主流库共识组件（antd ~60 / shadcn ~50 / Mantine ~80）里，开发者每天都要用的东西。
> 原则不变：TDD 先行、零 npm 运行时依赖、style-audit 纪律、诚实裁剪；
> 证据标注 [证据] / [共识]，无证据但有强场景的按低频排序。

## 开发者日常场景 → 覆盖 → 缺口

| 日常场景 | 频率 | 现有覆盖 | 缺口（本批） |
|---------|------|---------|-------------|
| 写表单（增删改查核心） | ★★★★★ | Input/Textarea/Select/Checkbox/Radio/Switch/Slider/DatePicker/InputNumber/PasswordInput/TagsInput/FileUpload + Form/Field 校验 | **CheckboxGroup**、**TimePicker**、**PinInput**、MultiSelect |
| 列表 + 筛选 + 分页 | ★★★★★ | Table(sortable)/Pagination/SearchInput/EmptyState | 组合模式业务自拼（可接受）；虚拟滚动裁剪 |
| 详情/展示页 | ★★★★☆ | Descriptions/Timeline/StatCard/Badge/Avatar/List/Result/Highlight | **ImagePreview**（点击放大）、Anchor（长文） |
| 弹层交互 | ★★★★☆ | Modal/Drawer/Popover/Tooltip/Dropdown/Confirm | ContextMenu（表格行右键） |
| 全局反馈 | ★★★☆☆ | Toast/Alert/Result/EmptyState/ProgressBar/Loading/Skeleton | **BackTop**、圆形 Progress |
| 导航骨架 | ★★★☆☆ | Menu/PageHeader/Breadcrumb/Tabs/Steps/Accordion | Command(Cmd+K) 裁剪 |
| AI 场景（weifuwu 特色） | ★★★☆☆ | AiChat/Markdown/CodeBlock/MessageBubble/ToolCallCard/ApprovalCard | 已很全；ImagePreview 可补图片结果 |
| 效率工具 | ★★☆☆☆ | — | **CopyButton** |

## 第四批组件

### P0 — 证据 + 高频刚需（6 项）

#### 1. Accordion 增强 [证据]（现有组件占位 bug，非新增）

- **现状**：`items.map(details open: true)` 全部恒展开、summary 无 toggle 交互、键盘不可达——「可折叠」名不副实
- 增强：受控 `active: string[]` + `onChange`；`multiple` 互斥/多开；summary 点击切换 + 方向键移动焦点；`aria-expanded` 同步；`--wf-dur-*` 过渡
- 测试：先补失败测试（点击切换/受控回传/键盘），再实现

#### 2. Collapse [证据] — 行内折叠面板

- 证据：`AgentDetail.tsx:350-375` 知识库文档展开（📄/📂 + expandedDoc + 异步 chunk，~25 行）
- 与 Accordion 边界：Accordion = 整块卡片面板；Collapse = **标题行 + 行内展开区**（无卡片边框，适配列表行内展开），支持 `loading` 态
- API：`<Collapse items={[{ key, title, icon?, extra?, content?, loading? }]} active={string[]} onChange? />`
- 键盘：标题可 focus + Enter/Space + 方向键；裁剪：不做互斥/高度动画

#### 3. CheckboxGroup [证据] — 复选框组

- 证据：`NewDepartment.tsx:58-66` 成员多选（Checkbox + toggle + 已选计数，~15 行）
- API：`<CheckboxGroup options={[{ value, label, desc? }]} value={string[]} onChange? columns? size? disabled? />`；对齐 Field 体系
- 原生 checkbox（天然可聚焦可操作）；裁剪：不做全选/搜索过滤

#### 4. CopyButton [证据] — 复制按钮

- 证据：`Chat.tsx:187,292` 消息复制状态机 2 处；CodeBlock 内部同类逻辑待抽取统一
- API：`<CopyButton value label? size variant? />` — 成功 → icon 变 `check` + "已复制" 2s 复原；clipboard 失败 → execCommand 兜底
- 复用 Icon `copy`/`check`（已有）

#### 5. PinInput [共识] — 验证码输入（国内应用高频）

- 场景：登录/注册/双因子验证码——国内 SaaS 标配，antd/Mantine 均有
- API：`<PinInput length={6} value onChange? size? type="number" />` — 自动聚焦下一个框、粘贴分派、Backspace 回退、方向键移动
- 裁剪：不做"发送验证码"倒计时按钮（业务自配）、不做邮箱/短信（框架 email 中间件可组合）

#### 6. ImagePreview [共识] — 图片点击放大

- 场景：上传后查看/头像预览/图片结果——`Img` 只有展示，无查看交互；antd Image 画廊
- 实现：`Img` 加 `preview` prop（或独立组件）— 点击 → Modal 复用居中放大 + Escape/遮罩关闭 + `--wf-dur-*` 淡入
- 裁剪：不做缩放/旋转/左右画廊切换、不做缩略图列表

### P1 — 常见（4 项）

#### 7. TimePicker [共识] — 时间选择

- 场景：预约/调度/定时任务——框架已有 scheduler 中间件，天然配套场景
- API：`<TimePicker value="09:30" onChange? hour12? />` — HH:mm 下拉/输入选择
- 裁剪：不做秒/时区/范围联动（DatePicker + TimePicker 组合可覆盖 datetime）

#### 8. MultiSelect [共识] — Select 增强 multiple（非新组件）

- `Select` 加 `multiple`：下拉多选 + 已选标签回显 + 移除；与 TagsInput（自由输入标签）区分——MultiSelect 是**选项多选**
- 场景：权限/多值字段/成员指派（NewDepartment 垂直列表场景用 CheckboxGroup，横向下拉用这个）
- 裁剪：不做搜索建议（searchable 已有）、不做全选

#### 9. BackTop [共识] — 回到顶部（成本极低）

- `visibilityHeight` 阈值内隐藏，点击平滑回顶（`window.scrollTo` behavior smooth）
- 固定右下角，复用 Popover 的定位/动效 token；裁剪：不做自定义按钮动画

#### 10. Rate [共识] — 评分

- 需先新增 `star` 图标（`Icon.PATHS` + `IconName` + Icon.test）
- API：`<Rate value onChange count={5} size readOnly disabled />`；键盘：方向键 + Home/End
- 裁剪：不做半星/任意值/hover 预览；无实战证据，实施中觉鸡肋可砍

### P2 — 场景化，按需（不排期）

| 组件 | 场景 | 为何暂缓 |
|------|------|---------|
| ContextMenu | 表格/列表行右键操作 | 右键交互模型 + 位置计算，成本中；Dropdown 可组合（触发改 contextmenu） |
| Anchor | 长文档锚点导航 | 无证据；`wf-*` 原语 + scroll 事件可拼 |
| Tree | 组织架构/权限树 | 需树模型 + 展开/选中，成本高；知识库单层列表已由 Collapse 覆盖 |

## 暂缓复查（第三批清单 → 第四批结论）

| 组件 | 复查结论 |
|------|---------|
| Tree / Carousel / ImagePreview(画廊版) / BackTop(带滚动进度) | 无证据或裁剪边界大 |
| TimePicker(秒/时区) / ColorPicker / PinInput(倒计时) | 裁剪到最小可用版本 |
| MultiSelect(搜索) / Transfer / Mentions / Command / Cascader | 交互模型重，维持暂缓 |
| Watermark / QRCode | 依赖重，偏门 |

## 实施顺序与验证（每组件 TDD）

```
1. 先写失败测试（renderVNode 断言 + jsdom 事件级，按 UI 组件测试纪律）
   → 最小实现 → 重构
2. 顺序：P0 六项（Accordion 增强 → Collapse → CheckboxGroup → CopyButton
   → PinInput → ImagePreview）→ P1 四项（TimePicker → Select multiple → BackTop → Rate）
3. CSS 遵守 style-audit：动效 token（--wf-dur-*）、语义色 -text 变体、
   禁裸文本字形（Icon）、focus-visible、CJK 感知（--wf-heading-case）
4. 导出：src/components/index.ts + 类型（IconName 加 star）
5. components-demo 加 DemoCard（每组件）
6. README 组件列表 + 计数同步（61 → 69）
7. agent-platform 落地（浏览器实测）：
   - AgentDetail 知识库 → Collapse（异步 chunk loading）
   - NewDepartment 成员 → CheckboxGroup
   - Chat 消息复制 → CopyButton；CodeBlock 内部复用
   - 登录/注册可加 PinInput 验证码示例（email 中间件发送）
8. 全量测试 + 构建验证（node scripts/build.mjs）
```

## 验收

- ✅ 框架测试全绿（P0+P1 十项：渲染快照、交互状态、键盘、受控/非受控）
- ✅ agent-platform 手写处消失（diff 证据）
- ✅ style-audit 全绿；README/demo 计数同步（61 → 69）
- ✅ 浏览器实测（agent-browser）：交互 + 键盘 + 视口

## 诚实裁剪（不做，明确声明）

- Collapse：互斥模式、高度动画过渡
- CheckboxGroup：全选/反选、搜索过滤
- CopyButton：成功 toast
- PinInput：发送验证码倒计时、邮箱/短信发送
- ImagePreview：缩放/旋转/画廊切换、缩略图列表
- TimePicker：秒/时区、datetime 范围联动
- MultiSelect：选项搜索建议、全选
- BackTop：滚动进度/自定义动画
- Rate：半星、任意值、hover 预览
- Accordion 增强：保持卡片面板语义，不做动画高度

---

# 第五批起：三库全量实现（组件驱动开发 CDD，61 → ~90 组件）

> **战略升级**：从"迁移对齐 + 裁剪"转为 **全量实现 antd/EP/shadcn 三库并集 ≈ 92 个组件**。
> 三重目标：① 生态建设（组件库 = 完整 SaaS 地基）；② client 验证（每组件定向测试 client 一项能力）；
> ③ CDD 闭环（组件暴露 client 缺陷 → 修复 WFUI-OPTIMIZE → 解锁更难组件）。
> 完整路线图（难度阶梯 L1-L6、全清单、client 优化映射、里程碑）见 **`docs/components-cdd.md`**；
> 覆盖矩阵与迁移指南见 **`docs/components-migration.md`**。

## 与前三批的衔接

- 第一批（AI 场景）/ 第二批（表单展示）/ 第三批（Menu 等 13 组件）/ 第四批（P0-P2 表单选择+折叠）
  → 全部并入 CDD 难度阶梯（L1-L4），作为已有基础
- 此前"暂缓/裁剪"项（Tree/Carousel/Calendar/Command/QRCode/Watermark/Transfer 等）
  → **转正**：它们不是为对齐而做，而是 client 能力（树模型/动画/拖拽/键盘流/canvas/虚拟滚动）的试金石

## 首批实施（M1: L1-L2，表单迁移面）

1. Title / Text / Paragraph（Typography 拆分）
2. Label · AspectRatio
3. CheckboxGroup · Rate · PinInput · ColorPicker · Toggle / ToggleGroup
4. Select 增强（键盘 ↑↓ + Enter + multiple）

每组件流程：迁移用例进测试（红）→ 实现（绿）→ style-audit → 导出 + demo → client 能力点核对。

## 里程碑

| 里程碑 | 阶梯 | 验收 |
|--------|------|------|
| M1 | L1-L2 表单 | 表单迁移面全绿；键盘/受控测试覆盖 |
| M2 | L3 弹层 | 弹层矩阵（定位/焦点/Escape）全绿 |
| M3 | L4 复杂交互 | 动画/拖拽/树模型全绿；client Phase 2/3 关闭 |
| M4 | L5 数据密集 | **client Phase 5（For 虚拟滚动 + item 级响应式）落地** |
| M5 | L6 算法挑战 | QRCode 自研 Reed-Solomon / canvas |
| 终验 | ~90 项 | client 全绿 + 组件 61 → ~90 + 文档同步 |

---

# 第六批：导航/上传/数据密集/AI 开发者工具（91 → 96 组件）

> 视角扩展（前三批实战证据 + 第四批开发频率）：本批以**缺口补齐**为主线——
> `docs/components-map.md` 真实未实现清单的 4 项全部转正，外加 2 个 AI 差异化组件
> （三库没有、weifuwu 生态独有）。原则不变：TDD 先行（红→绿）、零 npm 运行时依赖、
> style-audit 18 条纪律、诚实裁剪（不支持的能力明确不提供）、真库/真浏览器验证。

## 决策依据（缺口 → 证据）

| 缺口 | 证据/理由 | 来源 |
|------|----------|------|
| Menu 子菜单/折叠 | AppLayout 5 处手写导航循环；Sidebar 折叠 = SaaS 标配 | [证据]+[共识] |
| FileUpload 列表/预览/进度 | 任何含附件的后台都要（上传状态可见性）；当前只有拖拽框 | [共识] |
| VirtualTable | 数据密集页（日志/订单）性能刚需；VirtualList 已有滚动基座 | [证据] |
| LogViewer | AgentDetail 日志手写 `wf-border-b` 堆叠；CI/执行日志是 AI 场景刚需 | [证据]+[差异化] |
| JSON 查看器 | ToolCallCard args 现在 `JSON.stringify` 裸文本；API 响应/工具参数可读性 | [差异化] |

## 第五批组件

### P0 — 缺口转正（三库共识 + 实战证据，4 项）

#### 1. Menu 子菜单/折叠 [证据+共识]（增强，非新增）

- **现状**：Menu 仅 group 分组 + activeKey/onSelect；无子级、无折叠
- **增强**：
  - `submenu`：`items: [{ key, label, children: [{ key, label, onClick }] }]`——子菜单展开/收起（点击箭头或 hover）
  - `collapsible`：整树折叠为图标条（`collapsed` 受控 + `onCollapseChange`），tooltip 浮层显示折叠项文本
  - 键盘：子菜单 Enter 展开/收起、方向键在子级间移动、Escape 收回到父级
  - 状态：`openKeys: string[]`（受控可选）+ `onOpenChange`
- **TDD 测试点**：子菜单点击展开（受控/非受控）、折叠切换、方向键进入子级、Escape 回收、aria-expanded 同步
- **client 能力验证**：受控 + 非受控双模式、多级键盘流（L4）
- **裁剪**：水平菜单栏（Menubar 已有）、手风琴式自动互斥子菜单

#### 2. FileUpload 增强 [共识]（增强，非新增）

- **现状**：拖拽/点击选择 → onChange(Files)；无文件列表、无进度、无预览
- **增强**：
  - `fileList: File[]`（受控可选）+ `onChange(files)`（现状兼容）
  - 列表展示：文件名/大小/类型图标 + 删除按钮（`onRemove` 回调，受控需父层更新）
  - 进度：`uploading?: boolean` + `progress?: number`（0-100，父层驱动——组件不做 xhr，诚实裁剪）
  - 预览：图片文件缩略图（`URL.createObjectURL` 生命周期：组件卸载时 revoke）
  - 受控纪律：`fileList` 已传但无 `onChange` 时 `console.warn`（与 Collapse/Tree 一致）
- **TDD 测试点**：拖入 → fileList 更新、图片缩略图生成、删除项回传、受控无回调 warn、URL revoke（卸载路径）
- **client 能力验证**：useDragDrop 复用 + 受控纪律 + 资源生命周期（L3）
- **裁剪**：真实上传进度（xhr/fetch 由业务层驱动）、分片上传、拖拽排序

#### 3. VirtualTable [证据]（新增，L5 数据密集）

- **现状**：Table 全量渲染；VirtualList 像素级 scrollTop 已有——打通为表格虚拟化
- **实现**：
  - `columns`（宽度/对齐/排序复用 Table 列定义）+ `rows: any[]` + `rowHeight`（默认 40）
  - 复用 VirtualList 滚动基座（useScrollPosition 已就位）：固定表头 + 虚拟滚动体
  - 列宽：`width?: number`（px）/ `minWidth` + `flexGrow`（1fr 语义）
  - 排序：列头点击（复用 Table sortable 模式）
- **TDD 测试点**：10k 行只渲染可见窗口（DOM 节点数 < overscan×2）、滚动后窗口更新、排序、固定表头不随滚动
- **client 能力验证**：L5 虚拟滚动 + item 级响应式（Phase 5 核心验收项）
- **裁剪**：横向虚拟滚动（列虚拟化）、行编辑、单元格合并

#### 4. Anchor 锚点导航 [共识]（新增，L2）

- **现状**：Affix + scroll 原语已有；长文页锚点跳转缺组件化封装
- **实现**：
  - `items: [{ href, title }]` + `container`（滚动容器，默认视口）
  - 滚动侦听（useScrollPosition）：当前锚点高亮 + 点击平滑滚动（scroll-behavior: smooth 降级）
  - 点击：`history.pushState` 或 `location.hash` 可选（`useHash` 默认 false）
  - 键盘：锚点列表方向键移动焦点
- **TDD 测试点**：点击滚动到目标、滚动经过时高亮切换、hash 模式 URL 更新
- **client 能力验证**：useScrollPosition 复用 + 定位（L2）
- **裁剪**：滚动容器非视口检测、嵌套滚动容器

### P1 — AI 差异化（三库没有，weifuwu 生态独有，2 项）

#### 5. LogViewer 日志流 [证据+差异化]（新增，L4）

- **现状**：AgentDetail 日志手写堆叠；执行日志/CI 输出无专用组件
- **实现**：
  - `lines: string[]` + 自动跟随（`follow`：新行到达时若已在底部则滚到底）
  - ANSI 着色子集（16 色 + 粗体 + 背景，自研 parser——零依赖）
  - 虚拟滚动（复用 VirtualList 基座，10k+ 行）
  - `maxLines` 环形截断（内存保护）、行号、复制按钮
- **TDD 测试点**：ANSI 转义解析（颜色类映射）、跟随开关行为、10k 行虚拟滚动、截断
- **client 能力验证**：L4 增量更新 + 虚拟滚动组合
- **裁剪**：正则表达式高亮、多日志源合并、流式尾部重绘（增量 append 已支持）

#### 6. JSONViewer JSON 查看器 [差异化]（新增，L3）

- **现状**：ToolCallCard args `JSON.stringify` 裸文本；API 响应无结构化浏览
- **实现**：
  - `data: unknown` + 递归树：对象/数组折叠（`defaultExpandDepth` 默认 2）+ 类型色（string/number/boolean/null）
  - 键值路径显示 + 点击复制（`navigator.clipboard`）
  - 大数据节流：顶层 > 100 键时懒展开（不一次性渲染）
- **TDD 测试点**：嵌套折叠展开、类型着色类、路径复制、100 键懒展开
- **client 能力验证**：递归渲染 + 懒展开（L3）
- **裁剪**：JSON 编辑、大文本截断省略号

## 实施顺序与验收

| 步骤 | 组件 | 依赖 | 验收 |
|------|------|------|------|
| 1 | Menu 子菜单/折叠 | 无 | 受控/非受控 + 键盘流测试全绿；demo 折叠侧栏实测 |
| 2 | FileUpload 增强 | 无 | 列表/预览/进度测试全绿；agent-browser 拖入实测 |
| 3 | VirtualTable | VirtualList 基座 | 10k 行窗口化测试 + 排序；demo 实测滚动无卡顿 |
| 4 | Anchor | useScrollPosition | 高亮/滚动测试；demo 长文页实测 |
| 5 | LogViewer | VirtualList 基座 + ANSI parser | ANSI/跟随/截断测试；demo 模拟流实测 |
| 6 | JSONViewer | 无 | 折叠/复制/懒展开测试；ToolCallCard 接入 |

- 每组件：失败测试（红）→ 实现（绿）→ style-audit（18 条）→ 导出 index + demo DemoCard → agent-browser 实测
- 收尾：`docs/components-map.md` 待补清单（4 项 → 0 项 + 新增 2 项记录）、README 组件计数（92 → 96）、
  `docs/custom-components.md` 若涉及新 client 原语同步

## 诚实裁剪（不做，明确声明）

- Menu：水平菜单栏（Menubar）、子菜单自动互斥、折叠动画（CSS 过渡即可）
- FileUpload：真实上传进度（xhr/fetch 父层驱动）、分片、拖拽排序、目录上传
- VirtualTable：列虚拟化（横向）、行编辑、单元格合并、树形表格
- Anchor：嵌套滚动容器、滚动容器非视口
- LogViewer：正则高亮、多源合并、搜索定位
- JSONViewer：编辑、超大对象流式渲染（懒展开已覆盖 100 键级）

> 本批完成后：`components-map.md` 真实未实现清单清零（0 项），
> 组件总数 92 → 96，三库共识覆盖度 ~100%（剩余均为已声明裁剪项）。

---

# 第七批：AI 开发者工具深化（96 → 102 组件）

> 追平期结束（三库共识 ~100%），进入差异化期——本批做三库没有的
> AI 开发者工具 + 数据密集 + 完成度标志组件。

## 目标组件（6 个）

| # | 组件 | 定位 | 差异化评分 | 依赖 |
|---|------|------|-----------|------|
| 1 | **DiffView** | AI 代码生成/审查 diff 展示 | ★★★★★ | LCS 行 diff 算法（自研） |
| 2 | **Sparkline** | 迷你趋势线（仪表盘/StatCard 生态） | ★★★★ | SVG 自绘 |
| 3 | **Tour** | 新手引导（组件库成熟度标志） | ★★★★ | 浮层定位（usePopupPosition）+ 遮罩 |
| 4 | **Kanban** | 看板（任务流拖拽） | ★★★★ | useDragDrop + 列模型 |
| 5 | **Pipeline/DAG** | Agent 多步工作流可视化 | ★★★★★ | 节点布局 + SVG 连线 |
| 6 | **TreeSelect** | 树形选择（Tree/Popover 组合） | ★★★★ | Tree + Popover + 键盘流 |

## 每组件设计要点

### 1. DiffView（先做——AI 代码展示刚需）

- **props**：`oldCode/newCode`、`oldTitle/newTitle`、`foldThreshold?`（默认 5 行不变折叠）
- **算法**：LCS 行 diff（自研——O(n·m) 最长公共子序列，行级粒度）
- **渲染**：三态行（add/remove/unchanged）+ 折叠块（↕ N 行展开）+ 行号双栏
- **TDD 测试点**：纯增/纯删/修改（删+增）/交错 diff/折叠块渲染/展开/空输入
- **client 能力验证**：纯函数算法（可 SSR）+ VNode 列表渲染
- **裁剪**：词级 diff（char-level）、语法高亮（复用 CodeBlock 的 lang 标签）、忽略空白模式、merge 编辑

### 2. Sparkline（低成本）

- **props**：`data: number[]`、`width/height`（默认 120/32）、`stroke?`、`fill?`、`smooth?`
- **实现**：SVG polyline/path + area fill；min/max 归一化；尾点动画可选
- **TDD 测试点**：归一化正确性（min/max 映射）、空数据、单点、等值、smooth path
- **裁剪**：多序列、交互 tooltip、实时流式

### 3. Tour（成熟度标志）

- **props**：`steps: { target?: string(selector), title, content, placement? }[]`、`open` 受控 + 回调
- **实现**：遮罩 + 高亮框（目标 boundingRect 定位）+ 步骤气泡 + 上一步/下一步/跳过/完成
- **复用**：usePopupPosition 定位（scroll/resize 跟随）+ Portal
- **TDD 测试点**：步骤推进、定位跟随（mock rect）、Escape 关闭、最后一步完成回调、受控纪律
- **裁剪**：步骤动画过渡、多目标高亮、键盘流完整（保留基础 Escape/箭头）

### 4. Kanban（数据密集交互）

- **props**：`columns: { key, title, items: { id, title, tag? }[] }[]`、`onMove` 受控回调、`draggable?`
- **实现**：列布局 + 卡片拖拽（useDragDrop/useDrag）+ 拖起高亮 + 落点占位
- **TDD 测试点**：跨列移动回调（受控纪律）、同列重排、空列、拖拽高亮状态
- **裁剪**：列增删、卡片编辑、泳道、跨看板

### 5. Pipeline/DAG（最高差异化）

- **props**：`nodes: { id, label, status? }[]`、`edges: { from, to }[]`、`layout?`（上下/左右）
- **实现**：层级布局（BFS 分层 + 同层对齐）+ SVG 连线（贝塞尔）+ 状态着色（同语义色 token）
- **TDD 测试点**：分层正确性（依赖图→层分配）、环检测（抛错/警告）、边渲染、状态色
- **裁剪**：手动拖拽布局、缩放平移、嵌套子图、循环图

### 6. TreeSelect（表单补全）

- **props**：`options: TreeSelectOption[]`（同 Tree 结构）、`value/onChange` 受控、`multiple?`
- **实现**：Tree + Popover 组合——触发框（选中显示）+ 下拉树 + 键盘流（Tree 复用）
- **TDD 测试点**：选择回调、清空、多选、键盘导航（复用 Tree 测试模式）、受控纪律
- **裁剪**：搜索过滤、虚拟滚动（选项量小时）、级联选择父级联动

## 实施顺序与验收

| 步骤 | 组件 | 依赖 | 验收 |
|------|------|------|------|
| 1 | DiffView | LCS 算法（自研纯函数） | 5+ diff 场景测试全绿；demo 双代码对比实测 |
| 2 | Sparkline | SVG 自绘 | 归一化/边界测试；StatCard 趋势接入 demo |
| 3 | Tour | usePopupPosition + Portal | 步骤推进/定位测试；demo 引导实测 |
| 4 | Kanban | useDragDrop | 跨列/重排测试；demo 拖拽实测 |
| 5 | Pipeline | 布局算法（纯函数） | 分层/环检测测试；demo Agent 工作流实测 |
| 6 | TreeSelect | Tree + Popover | 选择/键盘流测试；demo 表单实测 |

- 每组件：失败测试（红）→ 实现（绿）→ style-audit（18 条）→ 导出 index + demo DemoCard → agent-browser 实测
- 收尾：`docs/components-map.md` 新增 6 项记录、README 组件计数（96 → 102）、
  `docs/frontend.md` 若涉及新 client 原语同步

## 诚实裁剪（不做，明确声明）

- DiffView：词级 diff、语法高亮、忽略空白、merge 编辑、侧边折叠条
- Sparkline：多序列、tooltip、实时流式、动画帧
- Tour：步骤动画、多目标高亮、完整键盘流、mask 镂空动画
- Kanban：列增删/编辑、泳道、跨看板、虚拟滚动
- Pipeline：手动拖拽、缩放平移、嵌套子图、循环图、自动布局参数
- TreeSelect：搜索过滤、虚拟滚动、级联父级联动、多选 tag 折叠

> 本批完成后：组件总数 96 → 102，AI 开发者工具线（AiChat/Command/JSONViewer/
> LogViewer/DiffView/Pipeline）成为三库差异化最深的完整工具链。

> **完成状态（2026-08）：第七批 6/6 全部落地**
> - DiffView（LCS 行 diff + 折叠）· Sparkline（SVG 归一化）· Tour（引导+高亮）
> - Kanban（原生 DnD 拖拽）· Pipeline（拓扑分层 DAG）· TreeSelect（树形选择）
> - 测试 1620 → 1678；README token 143 → 150；组件 96 → 102
> - agent-browser 全组件实测（DiffView 折叠/Sparkline 坐标/Tour 定位/Kanban 跨列/
>   Pipeline 连线/TreeSelect 回显）
