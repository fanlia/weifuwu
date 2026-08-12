# 第九批：AI 差异化组件（109 → 113 组件）
> **状态（2026-12 确认）**：✅ 已完成——AI 差异化组件第九批（推理展示层 109→113）

> 追平期结束（三库业务组件覆盖 ~100%），继续差异化——本批做三库没有的
> **AI 输入层 + 推理展示层**。此前 AI 工具链只有展示（ToolCallCard/JSONViewer/
> LogViewer/DiffView），缺「让用户填工具参数」「看模型推理过程」两个交互面。
> 原则不变：TDD 先行（红→绿）、零 npm 运行时依赖、style-audit 纪律、
> 诚实裁剪（不支持的能力明确不提供）、受控纪律（§5.2/5.3）。

## 决策依据（缺口 → 证据）

| 缺口 | 证据/理由 | 来源 |
|------|----------|------|
| JsonSchemaForm（schema → 参数输入表单） | ToolCallCard 只展示 args；审批「modified 修改参数」无输入面；Agent 配置页/工具参数确认都是 schema 驱动 | [差异化]+[共识] |
| ReasoningBlock（CoT 推理展开） | ChatMessage.reasoning_content 已在协议（DeepSeek thinking 回传），但前端无展示；主流 AI 产品推理过程折叠展示是标配 | [差异化]+[共识] |
| AiChat 集成推理 | UiMessage 无 reasoning 字段；`wf:done` 丢弃 finish.reasoning_content（agent.ts:189） | [证据] |
| Select optgroup 分组 | antd/EP 均有 OptGroup，weifuwu 只有平铺 options（components-map 残渣） | [共识] |

## 批次规划

| 阶段 | 内容 | 验收 |
|------|------|------|
| B9-1 | **JsonSchemaForm**（对象 schema → 表单：string/number/integer/boolean/enum/object/array + required/range 校验） | ✅ 已落地 |
| B9-2 | **ReasoningBlock** + **协议集成**（WfDone.reasoning） | ✅ 已落地 |
| B9-3 | **Select optgroup** | ✅ 已落地 |
| B9-4 | `design/components-cuts.md` 集中登记 | ✅ 已落地 |
| **B9-5** | **审批修改参数闭环**（use-chat `approve` 支持 modifiedArgs + ApprovalCard 修改参数 UI + AiChat 透传） | 🔴 本阶段 |
| **B9-6** | **CitationCard**（RAG 引用卡片，AI 差异化） | ✅ 已落地 |
| **B9-7** | **SessionList**（会话管理列表） | 🔴 本阶段 |

## 组件设计要点

### 1. JsonSchemaForm（B9-1，P0）

- **定位**：JSON Schema（对象子集）→ 表单，零依赖自研——AI 工具参数输入面
  （ToolCallCard `renderArgs` 的输入对偶；审批 `modified` 决策的取参来源）
- **API**：
  ```tsx
  <JsonSchemaForm
    schema={schema}                       // 顶层 type: 'object'
    value?={初始值}                        // 非受控（内部 state）；传了即读初始
    onChange?={(values) => ...}           // 每次编辑通知（不回流控制 → 无焦点问题）
    onSubmit?={(values) => ...}           // 提交（校验通过才触发）
    submitLabel?="执行"                    // 默认「提交」；不传则不显示按钮
  />
  ```
- **类型映射**：string→Input / number|integer→InputNumber / boolean→Switch /
  string+enum→Select / object→嵌套 fieldset（递归）/ array→items 列表 + 添加/删除
- **校验**（submit 时）：required、enum 包含、number min/max、string minLength/maxLength——
  错误 Field error 展示，不触发 onSubmit
- **裁剪（CS-05 登记）**：`$ref`/`allOf`/`oneOf`/`anyOf`/`format` 语义/递归数组/
  `additionalProperties`——不支持抛 `ProtocolError('unsupported')` 语义的
  console.warn + 降级 Input（诚实：props 缺省即降级，schema 不支持项 warn）
- **TDD 测试点**：各类型渲染、required 校验拦截、enum Select、嵌套 object 递归、
  array 增删、onChange 通知、unsupported 项 warn

### 2. ReasoningBlock（B9-2，P0）

- **定位**：CoT 推理过程折叠展示——「已思考」头部 + 展开显示推理文本
- **API**：`<ReasoningBlock content label? defaultExpanded? streaming? />`
- **实现**：手动优先（`let expanded` + `render()`）；头部 button（chevron 旋转 +
  label）；正文次级色/等宽；`streaming` 时头部脉冲动画
- **裁剪**：不做流式逐字、不做 token 耗时统计
- **TDD 测试点**：默认折叠、点击展开、defaultExpanded、streaming 类

### 3. 协议集成（B9-2，additive 向后兼容）

- `WfDone` 加 `reasoning?: string`（v1 协议「reasoning 不进流式」既定设计保持——
  只随 done 一次性下发，client.ts:14 注释不改）
- `agent.ts:189` `emit('wf:done', { content, usage, reasoning: finish.reasoning_content })`
- `use-chat.ts`：`UiMessage.reasoning?`；`apply('wf:done')` 挂 reasoning；
  `toChatMessages` 回传 `reasoning_content`（Thinking 模式闭环）
- `AiChat`：assistant 消息有 reasoning → 气泡上方渲染 ReasoningBlock
- `design/ai-contract.md`：WfDone 字段表补 reasoning

### 4. Select optgroup（B9-3，P1）

- `SelectOptionGroup { label: string; options: SelectOption[] }`，`options` 元素
  支持 group（`{ label, options }`）——渲染 optgroup 语义 + 分组标题样式
- **裁剪**：不做 group 搜索过滤（searchable 时平铺过滤）

### 5. components-cuts.md（B9-4）

汇总三库对照所有永久裁剪项（组件/能力/理由/替代），组件 TS 注释引用——
P12 欠账（audit 44 条中的「裁剪声明单一事实源」）

### 5. 审批修改参数闭环（B9-5，P0）

- **现状缺口**：协议 `WfApprovalResponse` 已定义 `modified` 决策 + `modifiedArgs`，
  后端 `agent.ts:223` 已按 modifiedArgs 执行——但前端 use-chat `approve()` 不传
  modifiedArgs，ApprovalCard 无修改参数 UI，AiChat 无透传。闭环缺前端一半。
- **use-chat**：`approve(decision, note?, modifiedArgs?)` —— POST body 带 modifiedArgs
- **ApprovalCard**：`argsSchema?: JsonSchema` + `onApprove(modifiedArgs?)` 语义——
  pending 态「修改参数」按钮（仅当 argsSchema 提供）→ 展开 JsonSchemaForm
  （预填 request.args）→ 「以修改后参数批准」→ onApprove(modifiedArgs)
- **AiChat**：透传 `approveArgsSchema`；onApprove 按 modifiedArgs 有无选 decision
- **裁剪**：不提供参数只读预览（ToolCallCard 已有）；不处理 schema 缺失时降级（按钮不显示）

### 6. CitationCard（B9-6，P1）

- **定位**：RAG 检索引用展示——引用角标 + 悬浮/点击查看原文片段 + 来源元信息
- **API**：`<CitationCard items={[{ id, source, title, snippet, url? }]} />`
- **裁剪**：不做检索（数据由上层给）、不做原文展开全文（片段即可）

### 7. SessionList（B9-7，P1）

- **定位**：侧栏会话列表——分组（今天/昨天/更早）+ 重命名/删除/新建 + 搜索
- **API**：`<SessionList sessions={[{ id, title, updatedAt }]} activeId onSelect onRename onDelete onNew />`
- **裁剪**：不做拖拽排序、不做虚拟滚动（量级小）

## 实施顺序与验证（每组件 TDD）

```
1. 先写失败测试（renderVNode 断言 + jsdom 事件级，按 UI 组件测试纪律）
   → 最小实现 → 重构
2. CSS 遵守 style-audit：动效 token（--wf-dur-*）、语义色 -text 变体、
   禁裸文本字形（Icon）、focus-visible、CJK 感知（--wf-heading-case）
3. 导出：src/components/index.ts + 类型
4. components-demo 加 DemoCard（交互 + code 字符串）
5. README 组件列表 + 计数同步（109 → 113）
6. 全量测试 + 构建验证（node scripts/build.mjs）
7. agent-browser 实测（B9-1/2 完成后）
```

## 诚实裁剪（不做，明确声明）

- JsonSchemaForm：`$ref`/组合 schema（allOf/oneOf/anyOf）/format 语义/递归数组/
  数组对象 items/自定义渲染插槽——复杂度边界，业务可组合
- ApprovalCard：参数只读预览（ToolCallCard 已有）；schema 缺失时不显示修改按钮
- ReasoningBlock：流式逐字、token 耗时统计、复制按钮
- AiChat 集成：reasoning 流式（协议既定：仅 done 下发）
- Select optgroup：分组搜索、分组禁选

## 验收标准（第九批完成）

- [ ] JsonSchemaForm 类型矩阵 + 校验测试全绿；demo 工具参数表单实测
- [ ] ReasoningBlock 折叠交互 + AiChat 集成（reasoning 端到端：agent → SSE → use-chat → 气泡）
- [ ] Select optgroup 分组测试
- [ ] `design/components-cuts.md` 单一事实源建立
- [ ] 全量测试绿、时长 ≤15s、style-audit 全绿、README 计数 109 → 113

## 进度记录

### B9-1 ✅ JsonSchemaForm（2026-08）

- 落地：`src/components/JsonSchemaForm/`（组件 + CSS + 8 测试全绿）
- 类型映射：string→Input / number|integer→InputNumber / boolean→Switch / enum→Select / object→嵌套递归 / array→增删列表
- 校验：required（父对象语义——JSON Schema 的 required 在父级）、min/max、minLength/maxLength、enum 包含
- 诚实裁剪：$ref/未知 type → console.warn + 文本输入降级（不静默不崩溃）；数组对象 items 告警
- 值语义：非受控（value 仅初始值）+ onChange 通知——规避受控回流焦点问题（§5.3）

### B9-2 ✅ ReasoningBlock + 协议集成（2026-08）

- `ReasoningBlock`：折叠「已思考」+ aria-expanded + Enter/Space 切换 + 流式脉冲（8 测试全绿）
- 协议（additive）：`WfDone.reasoning?`（types.ts + agent.ts 下发 + use-chat 聚合 + toChatMessages 回传 + ai-contract §3.4）
- AiChat：assistant 消息有 reasoning → 气泡上方渲染 ReasoningBlock
- use-chat 新测试：wf:done 挂 reasoning + 回传 reasoning_content（thinking 闭环）

### B9-3/4（待做）

- Select optgroup 分组
- `design/components-cuts.md` 集中登记

### B9-3 ✅ Select optgroup（2026-08）

- `SelectOptions` union（平铺项 + `{ label, options }` 分组混用）+ `isOptionGroup`/`flattenOptions` helpers
- native 路径：`<optgroup>` 渲染；searchable 路径：分组标题（wf-select-search-group）+ 组内选项 + 组感知搜索（空组隐藏）+ flatten 索引键盘跨组计数
- 4 新测试全绿（含跨组键盘）；type-flow 正负例；CSS 分组标题（--wf-heading-case CJK 感知）
- 裁剪登记：分组搜索过滤/分组禁选 → components-cuts.md

### B9-4 ✅ components-cuts.md 裁剪集中登记（2026-08）

- `design/components-cuts.md` 单一事实源建立：组件级裁剪（2 项框架级）+ 能力级裁剪（6 族 30+ 项）
- 组件 TS 注释开始引用（JsonSchemaForm 已改）
- 暂缓复查记录：14 项已决（全部转正实现或永久裁剪）

### B9-5 ✅ 审批修改参数闭环（2026-08）

- use-chat：`approve(decision, note?, modifiedArgs?)` —— POST 带 modifiedArgs（协议 WfApprovalResponse 补全前端一半）+ 测试
- ApprovalCard：`argsSchema?: JsonSchema` + `onApprove(modifiedArgs?)` —— pending 态「修改参数」按钮（仅 argsSchema 提供）→ JsonSchemaForm 展开（预填 args）→ 「以修改后参数批准」→ onApprove(modifiedArgs)（父层选 modified 决策）；取消收起
- AiChat：`approveSchema?: (request) => JsonSchema | undefined` 透传；onApprove 按 modifiedArgs 有无选 decision
- 3 新 ApprovalCard 测试 + 1 use-chat 测试；ai-contract 上行示例补 modified 载荷

### B9-6 ✅ CitationCard（2026-08）

- RAG 引用展示：折叠「引用 N 条」+ 条目（序号/标题/来源/片段/链接）+ 溢出 +N（点击展开全部）
- onOpen 回调优先（全部条目可点，调用方处理跳转）；无 onOpen 且有 url → a[href] target=_blank rel=noopener
- 键盘可达（Enter/Space）、空 items 不渲染、8 测试全绿、style-audit 38/38
- 裁剪登记：不做检索（数据上层给）、不做全文展开（片段即展示）→ components-cuts.md

### B9-7 ✅ SessionList（2026-08）

- 会话分组（今天/昨天/更早——groupKey 纯函数可测）+ 选中高亮（aria-selected）+ 搜索过滤
- 重命名（行内输入预填原标题，Enter 确认/Escape 取消/blur 收起）、删除（悬停行内按钮）、新建
- 键盘：容器 onKeyDown 方向键移动焦点（--focus 视觉与 --active 选中分离）+ Enter 激活
- 10 测试全绿；style-audit 38/38；agent-browser 实测（分组/搜索/重命名端到端）
- 裁剪登记：不做拖拽排序/虚拟滚动/右键菜单 → components-cuts.md

### CDD 闭环（本批暴露的框架缺陷，已治本）

- **aria-* boolean 字符串化**：`setProp` 对 `aria-expanded: true` 落成空字符串
  （枚举语义属性，同 draggable §6.2）——ReasoningBlock 实测暴露。
  已修 render.ts setProp + diff.ts patchProps 双路径 + render.test.ts 回归测试；
  WFUI-OPTIMIZE Phase 3 登记。既有组件全部传字符串绕开（全库扫描确认），
  修复后 raw boolean 也正确。

### 验收状态

- [x] JsonSchemaForm 类型矩阵 + 校验测试全绿；demo 工具参数表单
- [x] ReasoningBlock 折叠交互 + AiChat 集成（reasoning 端到端）
- [x] agent-browser 实测：JsonSchemaForm 校验（清空→必填→填回消失）、
      ReasoningBlock 展开/收起 + aria-expanded 显式字符串
- [ ] Select optgroup 分组测试（B9-3）
- [ ] `design/components-cuts.md` 单一事实源（B9-4）
- [x] 全量测试绿（1768 pass）、typecheck 通过、style-audit 38 条全绿、
      README/demo 计数 109 → 111
- [x] B9-3 Select optgroup 全绿（15 测试）
- [x] B9-4 components-cuts.md 单一事实源建立
- [x] B9-5 审批修改参数闭环全绿（1777 测试）
- [x] B9-6 CitationCard 全绿（8 测试，1795 累计）
- [x] B9-7 SessionList 全绿（10 测试，1795 累计）

> **第九批全部验收达成（B9-1~7）**：JsonSchemaForm + ReasoningBlock + 协议集成
> （WfDone.reasoning）+ Select optgroup + 裁剪登记 + 审批 modified 闭环 + CitationCard +
> SessionList + aria-* 框架修复（CDD）。组件 109 → 113。
