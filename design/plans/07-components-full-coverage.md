# 07 组件全覆盖与命名治理计划（Full Coverage & Naming）

> 目标：**品类/能力全覆盖**（继承 06 缺口清单）+ **命名治理**（组件名独立或合并——
> 家族归并 / 近义区分 / 分类审计）+ **用户入口**（查找与管理的最后一公里）。
> 验收一句话：三库对照全覆盖 + 用户凭直觉能找到任何组件 + registry/文档/搜索三处一致。

## 一、品类全覆盖（继承 06 结论——P0/P1 直接执行）

| 批次 | 组件 | 类型 | 关键点 |
|------|------|------|--------|
| P0 | **TabBar** 底部标签栏 | 新品类（移动端） | 3-5 tab、icon+label、badge、safe-bottom、路由激活 |
| P0 | **ActionSheet** 动作面板 | 新品类（移动端） | usePopup presence 复用、底部滑出 + 取消 |
| P0 | **Slider range** 双滑块 | 能力补全（现有 Slider） | 双 thumb + 区间标签 + 键盘左右键 |
| P1 | **Tree/TreeSelect 虚拟化** | 能力补全 | VirtualList 复用（virtual 7 组件已有成熟模式） |
| P1 | **Tabs editable**（closable/add） | 能力补全 | 关闭中间 tab 激活邻居 |
| P1 | **Table 固定列**（fixed left/right） | 能力补全 | VirtualTable 同补 |
| P1 | **PromptTemplate 编辑器** | 新组件（AI 域） | `{{var}}` 高亮 + 插入 + 预览填充 |
| P2 | 移动端扩展：PullToRefresh / Picker（滚轮选择）/ 日历移动视图 | 新品类候选 | 07 的移动端品类（06 口径：桌面三库外）——**等场景数据再立项** |

> 冲突裁决（06 已定）：Select 虚拟化 / Img 画廊维持裁剪登记（零依赖成本 / 低频）——
> 真实场景出现先撤销登记再实现。

## 二、命名治理（名字独立 or 合并——两通道并存）

### 2.1 家族合并（同域组件 → 命名空间 + 顶层独立导出双通道，零破坏）

**FilePreview 家族**（office 文档域——03 遗留任务执行）：

```
FilePreview            ← 保留（多类型预览入口）
FilePreview.Office     ← OfficeEditor 命名空间访问
FilePreview.Sheet      ← SheetGrid 命名空间访问
FilePreview.Slide      ← SlideCanvas 命名空间访问
顶层导出 OfficeEditor/SheetGrid/SlideCanvas 保留（向后兼容——deprecated 注释引导新用法）
```

理由：同域（office 文档）、用户从 FilePreview 进入自然发现全部能力、分类从 editor 并入 display（或保留 editor 但家族标注）。

**AI 会话家族**（9 个组件——**不合并**，独立使用高频）：

```
AiChat / ChatInput / MessageBubble / SessionList
ReasoningBlock / ToolCallCard / CitationCard / ApprovalCard / PromptTemplate(新)
```

理由：AI 场景是 weifuwu 差异化，每个组件独立深度使用；合并成命名空间反而增加心智负担。
治理动作：统一归 `ai` 分类 + content 文档新增「AI 家族」导航页 + registry 家族字段。

### 2.2 命名独立（近义组件——不合并，但选型必须可推导）

用户最容易困惑的 9 组——**新增「易混组件对照」文档**（components-map.md 章节 + choose.md 决策树扩充）：

| 易混组 | 选型规则（一句话） |
|--------|------------------|
| Toast vs Notification | 操作反馈（轻） vs 系统通知（重/持久）——命令式 API 同源 |
| Menu vs Menubar vs NavMenu | 侧栏导航 vs 水平菜单栏 vs 页面主导航（含子菜单折叠） |
| List vs VirtualList | 数据量 <500 用 List；>500 或未知用 VirtualList |
| Table vs VirtualTable | 同 List 规则（VirtualTable 含列宽/行高优化） |
| Select vs AutoComplete vs SearchInput | 固定选项单选 vs 自由输入联想 vs 搜索框（无下拉语义） |
| Editor vs CodeEditor vs MarkdownEditor | 轻量 markdown vs 代码（行号/Tab） vs 分屏预览 |
| Collapse vs Accordion | 多开（互不干扰） vs 单开（互斥语义） |
| Alert vs AlertGroup | 单条静态 vs 多条轮播（自动/手动切换） |
| ToggleGroup vs SegmentedControl | shadcn 语义（pressed 状态） vs antd 语义（选中态样式）——见 style-guide |
| Img vs ImageCropper vs Avatar | 展示+预览 vs 裁剪流程 vs 头像（名字哈希色） |

### 2.3 分类治理（12 类成员审计 + 顺序 + 显示名）

现状审计发现（registry 计数防线要求 src/components 目录 ↔ registry 同步，改动自动检测）：

| 动作 | 项 | 理由 |
|------|-----|------|
| 归位 | MessageBubble display→**ai**（03 遗留） | 会话族 |
| 归位 | Pipeline viz→**ai**（03 遗留：Agent 族） | 数据流可视化是 agent 工具链展示 |
| 归位 | StatCard display→**viz**（数据指标卡） | 与 Sparkline/Chart 同域 |
| 归位 | SessionList 已 ai ✅、ApprovalCard/ToolCallCard/CitationCard 已 ai ✅ | 核对通过 |
| 家族标注 | registry 增加 `family` 字段（file-preview / ai-chat / virtual 等） | 家族页与搜索反链的数据源 |
| 顺序/显示名 | 12 类固定顺序（core→input→form→display→viz→feedback→navigation→overlay→editor→ai→virtual→advanced）+ 中文显示名 | 用户浏览稳定 |

### 2.4 命名纪律固化（防回潮）

- 新组件命名查表：`docs/style-guide.md` 命名规范 + 近义组对照（新增组件先过「是否近义」检查——scaffold 输出检查项）
- **禁 `-v2` 后缀**（现状 17 个 `-v2` 均为 registry demo 条目非组件——审计确认无组件级 v2；新组件/能力演进用**新名或能力扩展**，不产生 v2 组件）
- 家族归并走「命名空间 + 顶层别名」双通道——**禁止改名破坏性删除导出**

## 三、用户入口（使用与管理）

| 入口 | 动作 |
|------|------|
| content/guides/components-map.md | +「易混组件对照」节（§2.2 九组）+ 家族导航（file-preview / ai-chat） |
| content/guides/choose.md 决策树 | 扩充近义组选型分支（§2.2 规则入树） |
| content/components/*.md | 家族页（file-preview-family.md / ai-family.md——家族成员清单 + 选型） |
| registry | 增加 family 字段 + 分类顺序修正（gen-content 自动重生成，content-sync 测试驱动） |
| showcase 搜索 | 依赖 02 计划组件搜索（07 的 family 字段是其数据源之一） |

## 四、兼容性与纪律

- **零破坏**：id 不变（URL 不变）、顶层导出不变（新增命名空间访问）、分类变更只影响展示层
- 三件套门槛 + style-audit 合规 + content-sync 测试（复用 03/06 标准）
- 每批完成后 agent-browser 活体走查（showcase 组件页 + Mobile demo 390×640）

## 五、验收标准

```
□ 品类：126 → 133（P0 3 + P1 4）+ P2 移动端候选登记（PullToRefresh/Picker 等场景）
□ 命名：FilePreview 家族命名空间落地（顶层别名保留）；AI 家族导航页上线
□ 分类：12 类成员审计修正完成 + family 字段上线 + registry 计数防线绿
□ 文档：易混对照表 9 组入 components-map + choose.md 决策树扩充
□ 搜索：showcase 组件搜索可用（family 字段驱动反链）
□ 全量测试绿 + 活体走查（含 390×640 移动端）
```

## 状态

**规划中**——P0 品类（TabBar/ActionSheet/Slider range）与命名治理（家族归并）并行推进；
P1 深度补全随后；P2 移动端扩展等场景数据。
