# 06 组件缺口计划（Components Gap）

> 目标：三库对照（AntD5 / Element Plus / shadcn-ui / MUI）审查 126 组件库的**真实缺口**
> ——不是"越多越好"，而是"该有的都有、缺口有使用场景证据、裁剪有明确声明"。
>
> 调研方法（2026-12，本轮数据）：
> ① 能力矩阵对照：四库组件清单 vs weifuwu 127 目录 / 154 registry 条目（含 17 个 v2 变体）
> ② 使用场景证据：examples/patterns（11 模式）+ apps/showcase demos 中**手搓**的组件级结构
> ③ 能力深度检查：现有组件的常见能力缺失（range/editable/虚拟化/固定列……）

## 结论摘要

**总体：三库对照无重大缺失**（126 组件覆盖 AntD 5 全量 80%+，AI 域超集）。
真实缺口集中在 4 个方向：

| 方向 | 缺口数 | 代表 | 证据 |
|------|--------|------|------|
| 移动端（新增品类） | 2 | TabBar / ActionSheet | examples/patterns/Mobile.tsx 手搓底部导航 |
| 大列表虚拟化（深度） | 3 | Select / Tree / TreeSelect | 无虚拟化——万级选项卡顿 |
| 高频交互能力（深度） | 5 | Slider range / Tabs editable / Pagination 跳转 / Table 固定列 / Img 画廊 | 主流库标配，全部缺失 |
| AI 域组合件（差异化） | 2 | PromptTemplate 编辑器 / 知识库管理 | agent-platform 类应用的拼装痛点 |

## 三库对照结论（本轮审计，2026-12）

**「P0+P1 补充后，三库（antd 84 / EP 74 / shadcn 50）组件品类是否全覆盖」——是。**
依据：components-cuts.md 既有对照（100% 有对应）+ 本轮逐项复核（AntD 5 全量 / EP 全量 / shadcn 全量 / MUI 全量）。

但「全覆盖」的准确边界有三层，缺一不可：

1. **品类层（组件清单）= 全覆盖**：每库每个组件在 weifuwu 都有对应物——组件 / wf-* 原语 / 架构等价（antd App·ConfigProvider → 中间件注入；EP Teleport → createPortal；Flex → 原语类）。P0 补齐后 MUI 的 BottomNavigation（=TabBar）、SpeedDial（=FloatButton group）也已覆盖。
2. **能力层 = 有意的裁剪，不是缺失**：components-cuts.md 登记了 ~60 项能力级裁剪（树形表格 / 词级 diff / 语法高亮 / Select 虚拟化 / Img 画廊……），每项有理由（零依赖红线 / 复杂度边界 / 低频）与替代方案。**实现它们违反零 npm 运行时依赖红线或复杂度边界——这是设计决策，不是缺口**。
3. **口径层 = 桌面三库，非移动端库**：TabBar / ActionSheet 来自移动端品类（MUI BottomNavigation / 移动端库 ActionSheet），桌面三库无此组件——所以 P0 是「品类扩展」而非「补齐桌面缺口」。移动端专属（Picker 滚轮选择 / 日历滚动 / PullToRefresh）不在三库对照内，属 07 移动端计划（若立项）。

**诚实声明**：`全覆盖` 不等价于 `每一个 API 对齐`——antd Table 的 40+ props 对齐到 weifuwu 是 20 个（裁剪登记）；对齐是退化不是进步。

## 任务清单（按优先级）

### P0 — 使用场景证据确凿（examples/patterns 手搓 = 框架缺口）

| 组件 | 证据 | 说明 |
|------|------|------|
| **TabBar** 底部标签栏 | `examples/patterns/Mobile.tsx` 手搓 `wf-safe-bottom wf-row wf-around`（4 tab + 状态切换） | 移动端标配（MUI BottomNavigation）。3-5 tab、icon+label、badge 角标、safe-bottom 避让、路由激活态 |
| **ActionSheet** 动作面板 | 移动端弹层缺位（现有 overlay 11 个全为桌面定位语义） | 底部滑出 + 取消按钮 + 命令列表（iOS 风格）。usePopup presence 复用 |
| **Slider range** 双滑块 | Slider 仅单值（`value: number`，无 range 模式） | 区间筛选（价格/日期/年龄）高频。双 thumb + 区间标签 + 键盘左右键 |

### P1 — 深度补全（**已与 components-cuts.md 裁剪登记交叉核对**）

> ⚠️ 冲突裁决：`Select 虚拟化` 与 `Img 画廊` 在 components-cuts.md 已登记为**能力级裁剪**（零依赖成本高 / 画廊低频）。
> 裁决：维持裁剪——真实场景未现（agent-platform 无万级选项/多图画廊）；有场景数据时先撤销裁剪登记再实现。
> 以下 P1 为未登记裁剪的真实缺口：

| 组件/能力 | 说明 |
|-----------|------|
| **Tree / TreeSelect 虚拟化** | 大数据树（组织架构/文件树）——VirtualList 复用（cuts 表未登记，缺口真实） |
| **Tabs editable**（closable / add） | 浏览器标签类应用（agent-platform 会话标签场景）；关闭中间 tab 自动激活邻居 |
| **Table 固定列**（fixed left/right） | 宽表横向滚动时首列（名称）固定——VirtualTable 同补（cuts 表未登记，缺口真实） |
| **PromptTemplate 编辑器** | 提示词模板：变量占位 `{{var}}` 高亮 + 插入 + 预览填充——agent-platform 类应用拼装痛点（CodeEditor + Tag 组合） |

### P2 — 锦上添花（有替代拼装，等场景数据）

| 组件 | 替代方案 | 决策 |
|------|---------|------|
| TimeSelect（固定时间列表） | DatePicker `mode:time` 已覆盖 | 不做，场景未现 |
| ButtonGroup | ToggleGroup + Space | 不做 |
| Pagination 跳转（jumper） | 输入框手拼 | 等真实场景（当前 Pagination 无 jumper） |
| DatePicker 周/季度模式 | — | 等场景 |
| Masonry 瀑布流 | wf-grid + CSS columns | 等场景（无图片流应用） |
| NumberFormat 千分位 | **已裁剪登记**（components-cuts.md：业务自拼） | 维持裁剪 |
| Dropdown 子菜单 | Menu 已支持嵌套 | 等场景 |
| Tree 拖拽重排 | Kanban/SortableList 有拖拽基建 | 等场景 |
| Steps vertical | — | 等场景 |

### 明确裁剪（不做的，登记在册）

- **Map**（真实地图需瓦片服务，零依赖不可实现——已登记）
- **富文本编辑器**（Editor 已为轻量 markdown；重型 Quill/Tiptap 违反零 npm 运行时依赖红线）
- **千分位格式化**（业务自拼——已登记）
- **Suspense/并发渲染**（vdom3 无异步边界，属引擎裁剪非组件）

## 新组件质量门槛（复用 03 计划）

```
□ 三件套（.ts/.css/.test.ts）+ 单元测试（渲染/交互/键盘）
□ 场景化 demo（showcase 活体——Mobile demo 增 TabBar 活体场景）
□ registry 登记 + gen-content 文档（API 表自动提取）
□ quality checklist（键盘/响应式/主题/状态矩阵）
□ style-audit 合规 + 防漂移测试更新
□ 移动端组件：touch 事件经 ctx.browser / useDrag 原语（浏览器环境纪律 §5.5）
```

## 验收标准

```
□ P0 三个组件落地（三件套 + demo + registry + 文档）
□ P1 六个深度补全落地（或裁剪登记）
□ Mobile.tsx 模式改用 TabBar 组件（手搓证据清零——验收"缺组件证据"）
□ 全量测试绿 + agent-browser 活体验证（移动端 390×640 视口）
```

## 状态

**P0+P1 全部完成 ✅**（07 计划实施）——TabBar/ActionSheet/Slider range + Tabs editable /
Table 固定列 / Tree·TreeSelect 虚拟化 / PromptTemplate 落地；Select 虚拟化与 Img 画廊
维持裁剪登记（零依赖成本/低频——冲突裁决见 07）。
