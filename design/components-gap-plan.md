# weifuwu/components 新增组件缺口计划（2026-12）
> **状态（2026-12 确认）**：✅ 已完成——W1-W4 全落地（ChatInput/AuthPage ✅，PageForm CUT）

> 目的：回答「组件库还需要增加什么组件」——基于 **113 组件现状 + 三库对照基线 +
> 消费方手搓模式扫描 + AI 差异化定位** 四维分析，给出 DO/CUT/评估 三分类结论。
> 方法论：TDD 红→绿；组件纪律全过（AGENTS.md §5）；demo ≥3 示例；SSR 安全；文档同步。

## 一、基线事实（现状摸底）

| 维度 | 现状 | 结论 |
|------|------|------|
| 组件总数 | **113 个**（src/components/） | 三库（antd 84/EP 74/shadcn 50）业务组件 **100% 有对应**（208 项对照） |
| 三库对照 | 剩余全部为 `design/components-cuts.md` 已登记裁剪项（组件级 3 项 + 能力级 ~40 项） | **对照维度无新组件缺口**（除非三库新增） |
| AI 特色族 | 推理展示层齐全：AiChat/Markdown/CodeBlock/MessageBubble/ToolCallCard/JsonSchemaForm/ReasoningBlock/CitationCard/SessionList/ApprovalCard/Editor | 展示层 ✅ |
| 消费方手搓 | agent-platform 手搓 3 类模式（见 §三） | **业务驱动缺口存在** |
| AI 输入层 | AiChat 内置输入条（§5.3 IME 纪律完整实现）但**不可独立复用** | **差异化缺口存在** |

## 二、缺口分析（四维）

### 维度 1：三库对照 —— 无组件级缺口 ✅
208 项 100% 对应；antd App/ConfigProvider、EP Teleport 属框架机制（非组件）；Statistic.Countdown 已并入 StatCard。
**本轮不需对照补组件。**

### 维度 2：AI 差异化 —— 输入层缺口（docs/components-map.md 已指方向）
docs 明确「补 AI **输入层** + 推理展示层」——推理展示层已齐（第九批完成），**输入层未独立**：
- AiChat 内置输入条（受控输入纪律/IME/streaming 停止/Enter 发送）——agent-platform Chat 页**手搓了同款**（`<form>` + Input + Button 组合，22 处 wf- 类）
- 缺独立复用的 **ChatInput**（消 AiChat 内部重复 + 外部手搓）

### 维度 3：消费方手搓模式（apps 真实重复代码 → 组件化）
agent-platform（唯一完整业务应用）grep 扫描：

| 手搓模式 | 出现位置 | 重复度 | 候选组件 |
|---------|---------|--------|---------|
| 认证页骨架（居中卡片 + Avatar/logo + 标题 + 表单 + 错误条 + 提交 loading） | Login.tsx / Register.tsx | ×2 | **AuthPage** |
| 表单页骨架（页头 + 卡片表单 + 提交/取消 + 错误 + loading） | NewAgent / NewCompany / NewDepartment / Register | ×4 | **PageForm**（评估项） |
| 聊天输入区（Input + 发送按钮 + 禁用态） | Chat.tsx | ×1（AiChat 内部 ×1） | **ChatInput** |

### 维度 4：现代组件库新增（2024-2026 高频）—— 已覆盖 ✅
Combobox（Select searchable）/ MultiSelect（Select `multiple` ✓）/ Stepper（Steps）/ DataTable（Table+排序分页）/ Dropzone（FileUpload drag/multiple/accept ✓）/ Resizable（已有）/ Sheet（Drawer）/ Dialog（Modal）——**均已覆盖，无新缺口。**

## 三、新组件 triage（DO / CUT / 评估）

> **实施状态（2026-12）**：W1 ChatInput ✅（8 测试 + AiChat 重构 + agent-platform Chat 替换 + demo 实测）；
> W2 AuthPage ✅（4 测试 + Login/Register 复用 + demo）；W3 PageForm → **CUT**（评估完成，见下）；
> W4 文档同步 ✅（docs/components.md + components-map.md + cuts 登记）。

### DO-1：ChatInput（AI 输入层——差异化核心，最高价值）

**动机**：一处实现消三处重复——AiChat 内置输入条（抽取）+ agent-platform Chat 手搓输入区（替换）+ 未来 AI 应用直接复用。

**规格**（从 AiChat 输入条抽取，保持纪律）：

| 能力 | 说明 |
|------|------|
| 输入 | 自适应多行 textarea（Enter 发送 / Shift+Enter 换行；内容增高自动长高） |
| 受控纪律 | §5.3 `ctx.ui.useControlledInput` + IME composition 门控（中文输入法不打断——AiChat 已验证的根因修复） |
| streaming 态 | `streaming` prop → 发送按钮变「停止」图标（stop 回调） |
| 禁用/错误 | `disabled` / `error` 态（错误提示行） |
| 扩展位 | `actions` 插槽（附件/知识库/模型选择按钮位）——AI 输入层后续扩展锚点 |
| 协议 | `value/onSend/streaming/onStop/disabled/placeholder/actions`——**不自带聊天逻辑**（useChat 组合在消费方） |
| 样式 | wf- 原语 + `--wf-*` token；小尺寸按钮固定 min/max-height（§5.6） |
| SSR | 无浏览器全局（textarea 原生）；shim 无害 |

**验收**：TDD（IME 组合/Enter/Shift+Enter/streaming 切换/禁用）；AiChat 重构内部复用（行为不回归——全量测试 + agent-browser 实测流式）；agent-platform Chat 页替换手搓输入区；demo ≥3 示例。

### DO-2：AuthPage（认证页骨架——业务模式）

**规格**：居中卡片布局（`wf-center` + Card）+ logo/Avatar 位 + 标题/副标题 + 表单插槽 + 错误条（Alert）+ 提交按钮 loading + 底部链接位（登录↔注册）。props：`title/subtitle/logo/children/footer/submitLabel/loading/error/onSubmit`。
**验收**：agent-platform Login/Register 复用（消 2 处手搓）；SSR 安全；demo 2 态（登录/注册）。

### 评估项：PageForm（表单页骨架）

**先验证后定**（布局蓝本纪律：能用 wf-* 原语 + 现有组件组合就不加组件）：
- 用 PageHeader + Card + Field + Button 组合能否覆盖 4 个表单页（NewAgent/NewCompany/NewDepartment/Register）？
- 若重复集中在「页头 + 卡片 + 提交/取消 + 错误条」这一结构性骨架 → **做 PageForm**（约 60 行，组合语义）
- 若各表单差异过大（骨架本身不重复）→ **CUT**，登记理由，demo 用原语组合示范

### CUT（登记裁剪，design/components-cuts.md）

| 候选 | 理由/替代 |
|------|----------|
| Typewriter（打字机） | AiChat 内置流式已够；独立无消费点 |
| TokenUsageCard | StatCard + Sparkline 组合即够（无独立语义） |
| EmojiPicker | 低价值；输入法 emoji 面板即够 |
| Combobox / MultiSelect / Stepper / Dropzone | Select searchable / Select multiple / Steps / FileUpload 已覆盖（对照确认） |
| 聊天列表 VirtualList 化 | SessionList 已含；VirtualList 可组合 |

### 归 components-completeness（非新组件——功能补全，不在本计划）
Menu 子菜单 / Timeline 横向 / VirtualTable 行选择 / Cascader 搜索 / InputNumber 长按等 roadmap 未决项 → `design/components-completeness.md`（W0 triage 已规划，本计划不重复）。

## 四、阶段（Wave）

| Wave | 内容 | 工作量 | 依赖 | 验收 |
|------|------|--------|------|------|
| W1 | **ChatInput**（TDD + AiChat 重构复用 + agent-platform Chat 替换 + demo） | L | — | 测试 +N；流式实测不回归；Chat 页消手搓 |
| W2 | **AuthPage**（TDD + Login/Register 复用 + demo） | M | — | 测试 +N；两页消手搓；agent-browser 认证流 |
| W3 | **PageForm 评估**（组合验证 → DO 或 CUT 登记） | S | W2 | triage 结论入 cuts 或实现 |
| W4 | 文档同步 + 全量回归 + 三 app tsc + 冒烟面 | S | W1-3 | docs/components.md + components-map.md 更新；全绿 |

## 五、全局纪律（每个新组件必过）

- **TDD 红→绿**（测试先写）；测试用官方原语（`weifuwu/ui-dom/testing`——renderVNode/mountComponent/createTestCtx/createPopupMock）
- **受控 props 无回调必须 console.warn**（§5.2）；受控输入走 `useControlledInput`（§5.3）
- 浮层一律 `createPortal` + `usePopup`（§5.4）；浏览器能力经 `ctx.browser`/`ctx.ui.useXXX`（§5.5 三态：客户端/SSR shim/测试 mock）
- 图标用 `Icon` 组件（禁裸字形）；语义色用 `-text` 变体；动效 token（§5.6 + 设计系统）
- demo ≥3 示例 + 状态矩阵（audit R-39/40）；键盘可达（Enter/Space/方向键/Escape）
- 裁剪声明引用 `design/components-cuts.md`（audit R-44）
- 文档：docs/components.md 组件表 + components-map.md 对照表 + README 导航同步
- 新组件入组件库 map（`src/components/index.ts` 导出 + components-demo 收录）

## 六、验收矩阵（W1-4 完成后）

| 项 | 标准 |
|----|------|
| ChatInput | IME 中文输入流式不打断（agent-browser 实测）；AiChat 重构后全量测试无回归；Chat 页手搓输入区替换（grep 验证 0 手搓） |
| AuthPage | Login/Register 复用后两页行为不变（agent-browser 认证流：注册→登录→跳转） |
| PageForm | triage 结论明确（DO 实现 / CUT 登记） |
| 全局 | 框架全量测试全绿（1797 + N）；agent-platform 测试全绿（81）；三 app tsc 零错误；demo 徽章增长 |
