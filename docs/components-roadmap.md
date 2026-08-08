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

> **战略升级**：从"迁移对齐 + 裁剪"转为 **全量实现 antd/EP/shadcn 三库并集 ≈ 90 个组件**。
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
