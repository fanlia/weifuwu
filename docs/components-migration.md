# weifuwu/components × antd / Element Plus / shadcn-ui 覆盖矩阵与迁移指南

> 战略定位（2025 更新）：**三库并集 ≈ 90 个组件全量实现**（含此前"裁剪"项）——
> 实现路线、难度阶梯与组件驱动开发（CDD）闭环见 **`docs/components-cdd.md`**。
> **开发者速查（weifuwu 组件 → 三库对应 + 使用示例）见 `docs/components-map.md`**。
> 本文档保留两大价值：**① 覆盖矩阵**（同场景找组件，状态随实施更新）；**② 迁移指南**（命名映射 + prop 对齐）。
> 遵守框架哲学：零 npm 运行时依赖、TDD 先行、style-audit；组件命名按 weifuwu 独立体系（不逐一对齐）。

## 覆盖矩阵（三库并集 ≈ 90 项 → weifuwu）

图例：✅ 已有等价 · 🟠 新组件（阶梯见 docs/components-cdd.md）· 🟡 增强现有 · 🔵 薄封装 · ⚫ 暂缓（CDD 闭环登记决策）

### 通用 / 布局

| 组件 | antd | EP | shadcn | weifuwu | 方案 |
|------|:----:|:--:|:------:|---------|------|
| Button | ✅ | ✅ | ✅ | ✅ | — |
| Icon | ✅ | ✅ | ✅ | ✅ Icon | — |
| Typography | ✅ | ✅ | ❌ | ❌ | 🟠 Title/Text/Paragraph |
| Layout / Container | ✅ | ✅ | ❌ | wf-* 原语 | 🟡 文档说明 |
| Grid / Row / Col | ✅ | ✅ | ❌ | wf-grid | 🟡 文档说明 |
| Space / Flex | ✅ | ✅ | ❌ | wf-row/wf-stack | 🟡 文档说明 |
| Divider / Separator | ✅ | ✅ | ✅ | ✅ Divider | — |
| ScrollArea / Scrollbar | ❌ | ✅ | ✅ | wf-scroll | 🟡 文档说明 |
| Sidebar | ❌ | ❌ | ✅ | wf-app-shell | 🟡 文档说明 |
| AspectRatio | ❌ | ❌ | ✅ | ❌ | 🟠 纯 CSS，极低成本 |
| Label | ❌ | ❌ | ✅ | Field 集成 | 🟠 独立组件（P2） |

### 导航

| 组件 | antd | EP | shadcn | weifuwu | 方案 |
|------|:----:|:--:|:------:|---------|------|
| Menu / NavigationMenu | ✅ | ✅ | ✅ | ✅ Menu | 🟡 子菜单（P1） |
| Breadcrumb | ✅ | ✅ | ✅ | ✅ | — |
| Tabs | ✅ | ✅ | ✅ | ✅ | — |
| Pagination | ✅ | ✅ | ✅ | ✅ | — |
| Steps | ✅ | ✅ | ❌ | ✅ | — |
| Dropdown | ✅ | ✅ | ✅ | ✅ | — |
| PageHeader | ✅ | ✅ | ❌ | ✅ | — |
| Affix | ✅ | ✅ | ❌ | ❌ | 🟠（P0） |
| Anchor | ✅ | ✅ | ❌ | ❌ | 🟠（P2） |
| BackTop / FloatButton | ✅ | ✅ | ❌ | ❌ | 🟠 BackTop（P0） |
| Command (Cmd+K) | ❌ | ❌ | ✅ | ❌ | 🟠（L4） |
| Menubar / ContextMenu / Resizable | ❌ | ❌ | ✅ | ❌ | 🟠（L3-L4） |

### 表单

| 组件 | antd | EP | shadcn | weifuwu | 方案 |
|------|:----:|:--:|:------:|---------|------|
| Form / Field 校验 | ✅ | ✅ | ✅ | ✅ | — |
| Input / Textarea | ✅ | ✅ | ✅ | ✅ | — |
| InputNumber | ✅ | ✅ | ❌ | ✅ | — |
| Select | ✅ | ✅ | ✅ | ✅ | 🟡 键盘导航 + multiple（P1） |
| Combobox / AutoComplete | ✅ | ✅ | ✅ | Select searchable | 🟡 Select 增强 |
| Cascader / TreeSelect | ✅ | ✅ | ❌ | ❌ | 🟠（L4，级联） |
| Checkbox / Radio / Switch / Slider | ✅ | ✅ | ✅ | ✅ | — |
| CheckboxGroup | ✅ | ✅ | ❌ | ❌ | 🟠（P0） |
| Rate | ✅ | ✅ | ❌ | ❌ | 🟠（P0） |
| DatePicker | ✅ | ✅ | ✅ | ✅ 四合一 | — |
| TimePicker | ✅ | ✅ | ❌ | mode="time" | 🔵 薄封装 |
| RangePicker | ✅ | ✅ | ❌ | mode="range" | 🔵 薄封装 |
| DateTimePicker | ❌ | ✅ | ❌ | mode="datetime" | 🔵 薄封装 |
| ColorPicker | ✅ | ✅ | ❌ | ❌ | 🟠（L2） |
| Transfer | ✅ | ✅ | ❌ | ❌ | 🟠（L4） |
| Upload | ✅ | ✅ | ❌ | ✅ FileUpload(拖拽) | 🟡 文件列表+预览+进度（P1） |
| Mentions | ✅ | ❌ | ❌ | ❌ | 🟠（L3） |
| PinInput / InputOTP | ❌ | ❌ | ✅ | ❌ | 🟠（P0） |
| Toggle / ToggleGroup | ❌ | ❌ | ✅ | SegmentedControl 近似 | 🟠 ToggleGroup（P0） |
| Segmented | ✅ | ✅ | ❌ | ✅ SegmentedControl | — |
| TagsInput | ❌(Select tags) | ❌ | ❌ | ✅ | — |

### 数据展示

| 组件 | antd | EP | shadcn | weifuwu | 方案 |
|------|:----:|:--:|:------:|---------|------|
| Table | ✅ | ✅ | ✅ | ✅ sortable | 🟡 行选择+筛选（P1，DataTable 对齐） |
| Tree | ✅ | ✅ | ❌ | ❌ | 🟠（P0，转正） |
| Card / Avatar / Badge / Tag | ✅ | ✅ | ✅ | ✅ | — |
| List / Timeline / Descriptions | ✅ | ✅ | ❌ | ✅ | — |
| Statistic | ✅ | ✅ | ❌ | ✅ StatCard | — |
| Image（预览） | ✅ | ✅ | ❌ | ✅ Img | 🟡 preview（P0） |
| Carousel | ✅ | ✅ | ✅ | ❌ | 🟠（L4） |
| Calendar（事件视图） | ✅ | ✅ | ❌ | ❌ | 🟠（L4，复用 DatePicker 核心） |
| Collapse / Collapsible | ✅ | ✅ | ✅ | ❌ | 🟠（P0） |
| Result / Empty / Skeleton | ✅ | ✅ | ✅ | ✅ | — |
| QRCode / Watermark | ✅ | ❌ | ❌ | ❌ | 🟠（L6/L4） |
| Chart | ❌ | ❌ | ✅ | ✅ 自研 | — |
| Highlight / CopyButton | ❌ | ❌ | ❌ | ✅/🟠 | — |

### 反馈

| 组件 | antd | EP | shadcn | weifuwu | 方案 |
|------|:----:|:--:|:------:|---------|------|
| Alert | ✅ | ✅ | ✅ | ✅ | — |
| Modal / Dialog / AlertDialog | ✅ | ✅ | ✅ | ✅ Modal + Confirm | — |
| Drawer / Sheet | ✅ | ✅ | ✅ | ✅ Drawer(四向) | — |
| Popover / Tooltip | ✅ | ✅ | ✅ | ✅ | — |
| HoverCard | ❌ | ❌ | ✅ | ❌ | 🟠（P0） |
| Popconfirm | ✅ | ✅ | ❌ | ✅ Confirm | — |
| Toast / Message / Sonner | ✅ | ✅ | ✅ | ✅ Toast | — |
| Notification | ✅ | ✅ | ❌ | ❌ | 🟠（P2，队列式） |
| Progress | ✅ | ✅ | ✅ | ✅ ProgressBar | — |
| Spin / Loading | ✅ | ✅ | ❌ | ✅ Loading | — |
| Result | ✅ | ✅ | ❌ | ✅ | — |
| App（命令式） | ✅ | ❌ | ❌ | confirm()/toast() | 🟡 文档说明 |
| InfiniteScroll | ❌ | ✅ | ❌ | InView | 🟡 InView 可组合 |
| VirtualTable / VirtualList | ❌ | ✅(实验) | ❌ | ❌ | 🟠（L5，WFUI-OPTIMIZE Phase 5） |

### AI / 特色（weifuwu 独有，加分项）

AiChat · Markdown · CodeBlock · MessageBubble · ToolCallCard · ApprovalCard · Editor · InView · ThemeSwitch · Highlight —— 三库均无，weifuwu 差异化。

## API 对齐原则（迁移平稳的核心）

1. **弹层命名对齐 antd**：`open` / `onClose` / `title` / `footer`（Modal/Drawer/Popover 已对齐）
2. **数据命名对齐 antd**：`value` / `onChange` / `options` / `items` / `loading` / `disabled` / `size` / `variant`
3. **树命名对齐 antd**：Tree 用 `selectedKeys` / `expandedKeys` / `checkedKeys` / `onSelect` / `onExpand` / `onCheck`
4. **EP 的 `v-model` 语法不逐一对齐**（模板语法，React 系统一 `value`/`onChange`），迁移指南给等价表
5. **shadcn 的原子组合（Trigger/Content 子组件）不照搬**——weifuwu 是成品模式（props 单组件），文档说明等价写法

### prop 迁移速查（antd → weifuwu）

```tsx
// 弹层
<Modal open={o} onClose={f} />            // antd visible/onCancel → weifuwu open/onClose
<Drawer open={o} onClose={f} position="right" />
<Popconfirm message="..." onConfirm={f} /> // antd → weifuwu Confirm
// 数据
<Select options={opts} value={v} onChange={f} />
<Tree data={nodes} selectedKeys={k} onSelect={f} />   // 第五批
// 反馈
toast('已保存', 'success')                  // antd message.success → weifuwu toast
await confirm('确定删除？')                 // antd Modal.confirm → weifuwu 命令式 confirm
```

## 实施中组件的迁移替代（🟠 → 已实现前的过渡路径）

> CDD 路线图（`docs/components-cdd.md`）已将这些全部纳入实现计划（L3-L6 阶梯）。
> 本表保留为**过渡期迁移指南**——在组件未落地前，开发者可用的替代写法。

| 待实现组件 | 过渡替代 | 计划阶梯 |
|-----------|---------|:--------:|
| QRCode | 外部 `qrcode` 库 + `<Img>` | L6（自研 Reed-Solomon） |
| Watermark | 无 | L4（canvas） |
| Carousel | `wf-scroll-x` + 手写翻页 | L4 |
| Calendar（事件视图） | `DatePicker` 覆盖单日场景 | L4 |
| ColorPicker | `<Input type="color">` | L2 |
| Cascader / TreeSelect | Tree 或 Select 扁平化 | L4 |
| Transfer | CheckboxGroup + List 组合 | L4 |
| Mentions | 裁剪 | L3 |
| Command / Menubar / ContextMenu | Dropdown 组合 | L3-L4 |
| Resizable | 裁剪 | L4 |
| VirtualTable | VirtualList（L5，WFUI-OPTIMIZE Phase 5） | L5 |

## 迁移验证（每组件）

```
1. 对照三库 API 写迁移用例（同场景三份代码 → weifuwu 一份）进测试
2. TDD 先行：失败测试（renderVNode + jsdom 事件级）→ 最小实现 → 重构
3. style-audit：动效 token、语义色 -text、禁裸字形、focus-visible、CJK
4. 导出 + demo + README 计数同步
5. 浏览器实测（agent-browser）
```

## 实施路线（详见 docs/components-cdd.md 难度阶梯）

- **L1-L2**（M1）：Title/Text/Paragraph · Label · AspectRatio · CheckboxGroup · Rate · PinInput · ColorPicker · Toggle/ToggleGroup · Select 增强
- **L3**（M2）：HoverCard · ContextMenu · Notification · BackTop · Affix · Mentions · 弹层增强
- **L4**（M3）：Collapse · Accordion 增强 · Tree · Cascader · Transfer · Carousel · Calendar · Command · Menubar · Resizable · Watermark
- **L5**（M4）：VirtualTable/VirtualList · Table 增强（行选择/筛选/列宽）· InfiniteScroll
- **L6**（M5）：QRCode · ImagePreview · Editor/Chart 深化
- **AI/特色**（已完成）：AiChat · Markdown · CodeBlock · MessageBubble · ToolCallCard · ApprovalCard 等
