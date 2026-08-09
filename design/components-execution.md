# weifuwu/components 全量实现执行计划（71 → 95 组件）

> 依据：`docs/components-cdd.md`（L1-L6 难度阶梯 + CDD 闭环）。
> 每组件流程：**TDD（红→绿）→ style-audit → 导出 → 全量回归 → 更新本表状态**。
> 已完成：M1a（Rate/Typography/Label/AspectRatio）+ M1b（Toggle/ToggleGroup/CheckboxGroup/PinInput）✅

## Phase A — 表单面补齐（L2）

| # | 组件 | 对齐 | client 能力验证点 | 状态 |
|---|------|------|------------------|:----:|
| A1 | Rate · Title/Text/Paragraph · Label · AspectRatio | antd/EP/shadcn | 渲染/props/键盘 | ✅ |
| A2 | Toggle/ToggleGroup · CheckboxGroup · PinInput | shadcn/antd | 受控数组/焦点链 | ✅ |
| A3 | **CopyButton** | weifuwu 独有 | clipboard 降级、成功状态机 | ✅ |
| A4 | **Select 增强**（键盘 ↑↓+Enter · multiple） | shadcn Combobox/antd | 弹层键盘流、多选标签回显 | ✅ |
| A5 | **ColorPicker**（预设色板+弹层） | antd/EP ColorPicker | 弹层定位、键盘 | ✅ |

## Phase B — 弹层浮层（L3）

| # | 组件 | 对齐 | client 能力验证点 | 状态 |
|---|------|------|------------------|:----:|
| B1 | **BackTop** · **Affix** | EP/antd | 滚动监听、sticky、节流 | ✅ |
| B2 | **HoverCard** | shadcn | hover 延迟显隐（Tooltip 富内容补全） | ✅ |
| B3 | **Notification** | antd/EP | 队列式多条、自动关闭计时 | ✅ |
| B4 | **ContextMenu** | shadcn | 右键定位、右键菜单键盘 | ✅ |
| B5 | **Mentions** | antd | 输入框内嵌弹层、composition | ✅ |

## Phase C — 复杂交互（L4）

| # | 组件 | 对齐 | client 能力验证点 | 状态 |
|---|------|------|------------------|:----:|
| C1 | **Collapse** | antd/EP/shadcn | 行内展开状态机、异步 loading | ✅ |
| C2 | **Accordion 增强** | antd Collapse | 受控 active、方向键 | ✅ |
| C3 | **Tree** | antd/EP | 递归树模型、展开/选中/勾选、异步加载 | ✅ |
| C4 | **Cascader** | antd/EP | 级联模型 + 弹层 + 键盘流 | ✅ |
| C5 | **Transfer** | antd/EP | 双列表状态、穿梭操作 | ✅ |
| C6 | **Command** (Cmd+K) | shadcn | 全屏 overlay、模糊搜索、键盘流 | ✅ |
| C7 | **Menubar** | shadcn | 水平菜单 + 键盘导航 | ✅ |
| C8 | **Carousel** | antd/EP/shadcn | 触摸滑动、自动播放、动画 | ✅ |
| C9 | **Resizable** | shadcn | 拖拽布局 | ✅ |
| C10 | **Calendar** | antd/EP | 日期算法 + 事件网格（复用 calendar-utils） | ✅ |
| C11 | **Watermark** | antd | canvas 绘制、观察者 | ✅ |

## Phase D — 数据密集（L5）

| # | 组件 | 对齐 | client 能力验证点 | 状态 |
|---|------|------|------------------|:----:|
| D1 | **Table 增强**（行选择） | shadcn DataTable | 行选择受控、组合模式 | ✅ |
| D2 | **VirtualList** | EP VirtualTable | 固定高度虚拟滚动（spacer + 可见窗口） | ✅ |
| D3 | **InfiniteScroll**（InView 增强） | EP | 交叉观察 + 追加渲染 | ✅ |

## Phase E — 算法挑战（L6）

| # | 组件 | 对齐 | client 能力验证点 | 状态 |
|---|------|------|------------------|:----:|
| E1 | **QRCode** | antd | 自研 QR 编码 + Reed-Solomon | ✅ |
| E2 | **ImagePreview**（Img 增强） | antd/EP Image | 点击放大 + 缩放切换 | ✅ |
| E3 | **Editor/Chart 深化** | — | 已有基础完整；深化裁剪（SVG d 无法过渡） | ✅ |

## 依赖顺序（实施依据）

```
A3 CopyButton（独立）→ A4 Select（弹层键盘流，为 B4/B5 铺路）→ A5 ColorPicker（弹层）
→ B1 BackTop/Affix（滚动，简单）→ B2 HoverCard（复用 Tooltip 定位）→ B3 Notification（复用 Toast 队列）
→ B4 ContextMenu（复用 Popover 定位 + 右键）→ B5 Mentions（弹层 + composition）
→ C1 Collapse → C2 Accordion 增强 → C3 Tree（Cascader/Transfer 的基础）
→ C4 Cascader → C5 Transfer → C6 Command → C7 Menubar → C8 Carousel → C9 Resizable → C10 Calendar → C11 Watermark
→ D1 Table 增强 → D2 VirtualList（client Phase 5：For 虚拟化 + item 级响应式）→ D3 InfiniteScroll
→ E1 QRCode → E2 ImagePreview → E3 Editor/Chart 深化
```

## 每组件验收标准（统一）

1. 失败测试先行（renderVNode 断言 + jsdom 事件级，按 UI 测试纪律）→ 最小实现 → 重构
2. style-audit 全绿（动效 token、语义色 -text、禁裸字形走 Icon、focus-visible、--wf-heading-case）
3. 导出 src/components/index.ts + 类型
4. 新增组件测试全绿 + 既有组件回归全绿
5. 更新本表状态 + README 计数同步
6. 浏览器实测（agent-browser）——里程碑级组件（Tree/VirtualList/Calendar/QRCode）必做

## 里程碑

| 里程碑 | Phase | 验收 |
|--------|-------|------|
| M1 | A | 表单迁移面全绿（71 → 76） |
| M2 | B | 弹层矩阵全绿（76 → 82） |
| M3 | C | 动画/拖拽/树模型全绿（82 → 92） |
| M4 | D | **client Phase 5（For 虚拟化）落地**（92 → 94） |
| M5 | E | 零依赖算法验证（94 → 95） |
| 终验 | 全部 | client 745 测试全绿 + 组件 61 → 92 + README/demo 同步 + 浏览器实测通过 | ✅ |
