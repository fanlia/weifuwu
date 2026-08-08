# weifuwu 组件驱动开发路线图（CDD）

> 战略：实现 **antd + Element Plus + shadcn-ui 三库并集 ≈ 92 个组件**（全量，含此前"裁剪"项），
> 组件命名按 weifuwu 独立体系重新规划。三重目标：
> ① **生态建设**——组件库成为完整 SaaS 地基，覆盖主流库全部能力面；
> ② **client 验证**——每个组件定向测试 `weifuwu/client` 一项能力，难度阶梯 = 能力验证清单；
> ③ **CDD 闭环**——写组件暴露 client 缺陷 → 修复（WFUI-OPTIMIZE 登记）→ client 增强 → 解锁更难组件。
> 这是组件驱动开发：**组件不是终点，是 client 的试金石与演进引擎**。

## 命名规划（weifuwu 独立体系）

原则：语义优先、不逐一对齐任何库；拆分/合并按 weifuwu 语义。

| 三库同名 | weifuwu 命名 | 原则 |
|---------|-------------|------|
| Upload / Upload | **FileUpload** | 语义明确（文件上传） |
| Statistic / Statistic | **StatCard** | 语义明确（统计卡片） |
| Spin / Loading | **Loading** | 短名优先 |
| Dialog / Modal | **Modal** | 短名优先 |
| InputOTP | **PinInput** | 能力命名（验证码输入） |
| InputNumber / InputNumber | **InputNumber** | 同名保留 |
| Typography 命名空间 | **Title / Text / Paragraph** | 拆开（无命名空间） |
| Sheet / Drawer | **Drawer**（四向） | 合并（sheet=bottom drawer） |
| NavigationMenu / Menu | **Menu** | 合并 |
| Collapse / Collapsible | **Collapse** | 合并（行内展开） |
| Combobox / AutoComplete | **Select**（searchable 增强） | 增强而非新组件 |

API 规范统一：弹层 `open/onClose`、数据 `value/onChange`、集合 `items/options`、通用 `size/variant/disabled/loading`。

## 全清单 × 难度阶梯（L1 → L6）

> 每级 = 一组 client 能力验证。✅ 已有 · 🆕 新实现 · ⬆️ 增强。

### L1 静态原语 — client：渲染 / props / children / 样式
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Title / Text / Paragraph | 🆕 | children、class 合并、copyable 剪贴板 |
| Label | 🆕 | htmlFor 关联、required 星号 |
| AspectRatio | 🆕 | CSS 变量、容器响应 |
| Divider / Space / Grid / Flex / ScrollArea / Sidebar | ✅ / wf | —（原语已覆盖） |

### L2 受控表单 — client：受控模式 / 事件 / 键盘
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Input / Textarea / Select / Checkbox / Radio / Switch / Slider / InputNumber / Segmented / TagsInput / Form / Field | ✅ | 受控 value/onChange、focus-visible |
| Select ⬆️ | ⬆️ | 键盘 ↑↓ + Enter（现仅 mousedown）、multiple 标签回显 |
| CheckboxGroup | 🆕 | 数组受控、toggle 状态 |
| Rate | 🆕 | 键盘方向键、受控整数 |
| PinInput | 🆕 | 焦点链（自动聚焦下一格）、粘贴分派、Backspace 回退 |
| ColorPicker | 🆕 | 弹层 + 预设色板 + 键盘 |
| Toggle / ToggleGroup | 🆕 | 单选/多选双模式、aria-pressed |

### L3 弹层浮层 — client：Portal / 定位 / 焦点管理 / Escape
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Modal / Drawer / Popover / Tooltip / Dropdown / Confirm / Toast | ✅ | createPortal、usePopupPosition、焦点 trap、Escape |
| HoverCard | 🆕 | hover 富内容（Tooltip 仅 string 的补全）、延迟显隐 |
| ContextMenu | 🆕 | 右键定位、右键键盘菜单 |
| Notification | 🆕 | 队列式多条、自动关闭计时 |
| BackTop / Affix | 🆕 | 滚动监听、sticky 定位、节流 |
| Mentions | 🆕 | 输入框内嵌弹层、composition 事件 |

### L4 复杂交互 — client：动画 / 拖拽 / 复杂状态机 / 树模型 / 键盘流
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Collapse | 🆕 | 行内展开状态机、异步 loading |
| Accordion ⬆️ | ⬆️ | 受控 active、方向键（现状：恒展开占位） |
| Tree | 🆕 | 递归树模型、展开/选中/勾选三态、异步加载 |
| Cascader | 🆕 | 级联数据模型 + 弹层 + 键盘流 |
| Transfer | 🆕 | 双列表状态、穿梭操作 |
| Carousel | 🆕 | 触摸滑动、自动播放计时、动画事件 |
| Calendar | 🆕 | 日期算法（复用 DatePicker 核心）+ 事件网格布局 |
| Command (Cmd+K) | 🆕 | 全屏 overlay、模糊搜索、键盘流 |
| Menubar | 🆕 | 水平菜单 + 键盘导航 |
| Resizable | 🆕 | 拖拽布局、edge case |
| Watermark | 🆕 | canvas 绘制、观察者检测 |

### L5 数据密集 — client：虚拟滚动 / 增量更新 / 大数据
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Table ⬆️ | ⬆️ | 行选择、内置筛选、列宽拖拽、冻结列 |
| VirtualTable / VirtualList | 🆕 | **For 虚拟化 + item 级响应式（WFUI-OPTIMIZE Phase 5）** |
| InfiniteScroll（InView ⬆️） | ⬆️ | 交叉观察 + 追加渲染 |

### L6 算法挑战 — client：canvas / 编码 / 零依赖极限
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| QRCode | 🆕 | 自研 QR 编码 + Reed-Solomon 纠错（零依赖挑战） |
| ImagePreview（Img ⬆️） | ⬆️ | 图片缩放/旋转、canvas 导出 |
| Editor 深化 | ⬆️ | contentEditable 光标/IME/粘贴清洗（已有基础） |
| Chart 深化 | ⬆️ | canvas/SVG 渲染、动画 |

### AI / 特色（三库无，weifuwu 差异化，已完成）
AiChat · Markdown · CodeBlock · MessageBubble · ToolCallCard · ApprovalCard · Editor · ThemeSwitch · Highlight · CopyButton

## CDD 闭环机制（核心）

```
┌─────────────────────────────────────────────────────────┐
│ 实现组件（难度阶梯 L1→L6）                                │
│   ↓ 发现 client 缺陷                                      │
│ 登记 WFUI-OPTIMIZE.md（编号 + 组件来源 + 表象 + 根因）     │
│   ↓ TDD 修复 + 回归测试                                   │
│ client 能力增强 → 解锁下一级组件                           │
└─────────────────────────────────────────────────────────┘
```

- **登记纪律**：组件实现中发现 client 缺陷，必须记入 `WFUI-OPTIMIZE.md`（含来源组件）——防止"绕过问题"（在组件里 workaround）
- **回归纪律**：client 修复后，上一级全部组件测试必须重跑（阶梯回灌）
- **验证纪律**：每个新组件标注其验证的 client 能力点（上表右列），实现完核对

## client 预期优化点（按阶梯）

| 阶梯 | 预期 client 增强 | 关联 |
|------|----------------|------|
| L2 | 事件委托优化、受控组件模式规范化 | — |
| L3 | Portal 批量管理、定位边界（视口夹紧已有）、焦点归还链 | popup-clamp 已有基础 |
| L4 | 动画系统（animateOut 已有）、拖拽辅助、树模型辅助 | motion.ts 已有基础 |
| L5 | **For 虚拟滚动 + item 级响应式**（重头戏） | WFUI-OPTIMIZE Phase 5 |
| L6 | canvas 工具、二进制处理辅助 | — |

## 里程碑与验收

| 里程碑 | 内容 | 验收 |
|--------|------|------|
| M1 (L1-L2) | 4 🆕 + Select 增强 | 表单迁移面全绿；键盘/受控测试覆盖 |
| M2 (L3) | 7 🆕 + 弹层增强 | 弹层矩阵测试（定位/焦点/Escape）全绿 |
| M3 (L4) | 11 🆕（重难点） | 动画/拖拽/树模型测试全绿；client Phase 2/3 修复项关闭 |
| M4 (L5) | VirtualList + Table 增强 | **client Phase 5（For 虚拟化）落地** |
| M5 (L6) | QRCode/Watermark/ImagePreview | 零依赖算法验证 |
| 终验 | 三库并集 ~90 项全绿 | client 测试全绿 + 组件 61 → ~90 + README/demo 同步 |

每个里程碑：组件全绿 + client 测试全绿 + WFUI-OPTIMIZE 更新 + README 计数同步 + 浏览器实测。

## 与现有文档的关系

- `docs/components-migration.md`：三库覆盖矩阵 + 迁移指南（保留；"裁剪"列改为"实施中/已实现"状态）
- `docs/components-roadmap.md`：前四批证据驱动路线（保留；第五批并入本路线图阶梯）
- `WFUI-OPTIMIZE.md`：client 缺陷登记处（CDD 闭环的"问题单"）

## 诚实边界

- 全量实现 ≠ 全量完美：每个组件仍遵守零依赖、TDD、style-audit；L6 的 QRCode 是自研算法挑战，若 Reed-Solomon 成本失控，裁剪为"外部库接入示例"（在 CDD 闭环中登记决策）
- 命名独立：不承诺 antd/EP/shadcn 的 prop 逐一对齐，只保证"同场景有对应组件 + 迁移指南给映射"
