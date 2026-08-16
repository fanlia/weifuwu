# Editor × AI 升级计划（AI 写作/润色/翻译场景）

> 状态：全部核心能力已完成（2026-12）。沙盒全链路关联裁剪（见 §7——后端场景）；
> 归档删除待登记后执行。
> ✅ 阶段 2（diff + 原子撤销）：AI 面板原文 diff 对比（删除线 + 高亮）；接受 = edit:ai-apply
>    commit 原子撤销一步
> ✅ 阶段 3 核心：全文操作（无选区）、自定义动作（actions prompt 模板）、Ctrl+Enter 快捷键、
>    操作历史时光机（commit 列表 → 回到任意版本）、草稿持久化（draftKey 防抖自动保存/恢复）
> ✅ 阶段 1（选区 AI 操作最小闭环）：`ai` prop（url/actions/内置 5 动作）→ 选区
>   提示词 → wf: 流式浮层（portal）→ 接受 = `edit:ai-apply` commit（**原子撤销一步**）
>   ——`editor-ai.test.ts` 8 测试 + 浏览器验收（引用块替换格式保留 + Ctrl+Z 回原文）
>   配套：offset ↔ DOM 桥块边界计数（
 段边界——真实事故：选区替换错位修复）
> 面向读者：weifuwu 框架开发者/贡献者（design/ 内部文档，不随包发布）。

---

## 1. 背景与目标

**用户场景**：在 Editor 中写完一段文本 → 需要 AI 润色/翻译/缩写/纠错。现状必须
复制到 AI 对话框 → 再复制回来——上下文断裂、格式丢失、体验割裂。

**目标**：Editor 内一键调用 AI——**选区感知**（操作选中文本）、**流式预览**
（token 边到边生成）、**接受/拒绝**（diff 对比，不直接破坏正文）、**可撤销**。
最终用户流程：选中文字 → 点「润色」→ 浮层流式生成建议 → 接受/拒绝 → 完。

**边界**：Editor 是**编辑场景**的 AI 编排器；对话场景（AiChat）不合并。
两者共享 useChat 会话管线，不重复实现。

## 2. 现状盘点

### 2.1 Editor（`src/components/Editor/Editor.ts`，590 行）
- contentEditable + execCommand，零依赖；toolbar：bold/italic/underline/
  align/link/image/table/source
- 受控 `value`（HTML 字符串）+ `domDirty` 脏标记（onInput 期间不回流 innerHTML
  → 光标不跳）；caret **文本偏移**保存/恢复（`textOffsetOf`/`nodeAtTextOffset`——
  Chrome 格式操作后重建内部节点，节点引用失效——偏移恢复已实战验证）
- 已有基础设施可复用：选区保存/恢复、caret 偏移、脏标记、source 模式

### 2.2 AI 框架（复用对象）
- `useChat(env, { url, approveUrl, body, headers, onEvent })` → handle：
  `send/stop/retry/clear/approve/dispose` + `messages/streaming/error/usage/step`
  + `subscribe`（render-only 共享状态——`ctx.ui.useExternal(handle)` 订阅）
- `ctx.ai`：chat（非流式）/stream（SSE）/agent（工具循环 + HITL）
- 协议：`wf:token` 流式 / `wf:done` / `wf:error` / `wf:step` / `wf:approval_request`
- AiChat 组件（对话场景）：useChat + 消息列表 + 工具卡片——**编辑场景不复用它**
  的消息 UI，复用其会话状态机（useChat）

## 3. 设计原则（weifuwu 纪律落地）

| 纪律 | Editor AI 的落地 |
|---|---|
| render-only | AI 状态 = useChat 普通对象；`useExternal(handle)` 订阅 → 自动重渲染；禁止 Proxy/隐式触发 |
| 弹窗纪律（§5.4） | AI 结果面板 = `usePopup` portal（fixed 定位/视口夹紧/Escape 关闭），绝不 relative 父容器 |
| 组件纪律（§3） | 两阶段组件；AI 面板拆独立组件（`EditorAiPanel`）——纯 props + handle 注入 |
| 受控纪律（§5.2） | `ai` 不传 = 无 AI 能力（工具栏不渲染 AI 按钮）——不破坏现有 Editor 行为 |
| 诚实裁剪（CS-05） | 见 §7——不支持的能力明确不承诺，不静默降级 |
| 数据管道（§3.4） | AI 结果**不**进 `ctx.data`（个性化数据——SSR 泄露红线，§3.4 已有规定） |

## 4. 能力清单与阶段

### 阶段 1：选区 AI 操作（✅ 已完成）

**能力**：
- 工具栏新增 AI 按钮组：润色 / 翻译 / 缩写 / 扩写 / 纠错
- 点击 → 收集选区纯文本（无选区禁用按钮）→ 构建提示词 → 流式请求
- 结果浮层（portal）：流式显示生成文本 + 状态（生成中/完成/错误）+ 接受/拒绝
- 接受 → 用建议替换选区（HTML 级替换，保留格式上下文）；拒绝 → 丢弃
- 错误处理：`wf:error`/网络失败 → 浮层错误态 + 重试；流式中禁并发触发

**验收**：
- 选中一段 → 润色 → 流式出现建议 → 接受后选区被替换、光标停在结果尾部
- 刷新/SSR 无 AI 泄漏（个性化数据不上 ctx.data）
- 全程零 `window.` 直访（ctx.browser）、浮层 portal、可键盘操作（Escape 关）

### 阶段 2：流式 diff + 撤销（P1）

> **架构升级**：撤销栈已升级为完整事件流模型——见 `design/editor-events-plan.md`
> （编辑器 = fold(edit 事件流)，与 vdom3/ai/sandbox 四端同构）。本阶段撤销能力
> 由事件流事务层承载：AI 替换 = 1 个 `edit:ai-apply` commit = 1 个原子撤销步。

**能力**：
- **diff 高亮**：建议 vs 原文，新增/删除/修改用不同高亮（轻量文本 diff，零依赖
  自研 ~100 行——LCS 或 Myers）
- **撤销**：接受前保存原 HTML 快照 → 轻量撤销栈（Editor 现状无 undo——
  contentEditable 原生 undo 不可控——自建快照栈，栈深 20）
- **直写模式（可选）**：写作场景可配置 `applyMode: 'direct'`——流式直接替换
  正文（默认 'preview' 预览——光标冲突风险最低）

**验收**：
- 接受 → 撤销 → 恢复原文；diff 视图增删高亮正确
- 直写模式下光标不跳（复用脏标记 + caret 偏移设施）

### 阶段 3：全文操作 + 自定义提示词 + 会话面板（P2）

**能力**：
- 无选区时操作全文（润色全文/翻译全文/总结）
- 自定义动作：`ai.actions` 扩展（prompt 模板 + 变量：`{selection}` `{fullText}`
  `{language}`）——用户可配自己的提示词
- **本次编辑会话**：浮层内保留操作历史（本次操作的 原文→建议 列表），可回看/重做
- 快捷键：`Ctrl+Enter` 触发当前动作、`Esc` 取消生成
- i18n（动作标签走 ctx.i18n）

**验收**：自定义动作注入生效；会话历史回看；快捷键可用。

## 5. API 设计草案

```ts
// Editor.ts 扩展（可选能力——不传 ai 则零影响）
export interface EditorAiOptions {
  /** wf: SSE 端点（useChat url） */
  url: string
  approveUrl?: string
  headers?: Record<string, string>
  /** 自定义动作（缺省 = 内置 5 个：润色/翻译/缩写/扩写/纠错） */
  actions?: EditorAiAction[]
  /** 全文操作/上下文提示词（可选） */
  systemPrompt?: string
  /** 生成应用模式：preview（默认，diff 后接受）/ direct（流式直写） */
  applyMode?: 'preview' | 'direct'
  onEvent?: (name: string, data: unknown) => void
}

export interface EditorAiAction {
  id: string
  label: string                       // '润色'（i18n key 或字面量）
  /** 提示词模板——变量：{selection} 选区纯文本、{fullText} 全文、{language} */
  prompt: (ctx: { selection: string; fullText: string; language?: string }) => string
  /** 是否允许无选区时作用于全文（默认 false） */
  wholeText?: boolean
}

// EditorProps 增量：
//   ai?: EditorAiOptions
//   onAiApply?: (r: { actionId: string; original: string; revised: string; accepted: boolean }) => void
```

**组件拆分**（复用 + 单一职责）：
- `Editor.ts`：AI 按钮组 + 会话编排（useChat 实例持有）
- `EditorAiPanel.ts`（新）：浮层面板（usePopup portal）——流式显示/状态/diff/接受拒绝
- 复用：`useChat`（不重复会话状态机）、`usePopup`（浮层）、`Button/Spinner`

## 6. 关键技术点

1. **选区 → 文本 → HTML 替换**：`selection.toString()` 取纯文本（提示词用）；
   替换用 `range.extractContents()` + 插入建议 HTML——保留选区两端的块格式
   （编辑器内部格式不随建议丢失）
2. **流式写入 vs 脏标记**：流式期间**直接操作 DOM**（不走 onChange 回流——
   每 token 回流 = 光标归零）；生成完成一次性 `emitChange(innerHTML)`；
   流式中断（abort/error）→ 恢复原 DOM 快照（流式前保存）
3. **光标保持**：复用 `textOffsetOf/nodeAtTextOffset`——接受替换后按偏移恢复
4. **diff**：零依赖文本 diff（LCS O(n·m) 裁剪：只对选区级文本，长度受限
   ~10k 字符；超限退化为"整体替换"高亮——诚实裁剪）
5. **撤销栈**：`{ html, caret }` 快照栈（Editor mount 持有，深度 20，内存
   敏感用 text 而非 html 快照？——实施时定）
6. **并发**：`streaming` 时禁用动作按钮；`stop()` 中止流
7. **AI 面板不进 contentEditable 树**：portal 浮层——vdom 三态一致
8. **abort 生命周期**：组件卸载/面板关闭 → `dispose()`（useChat 已内置
   env.onUnmount 清理——复用）

## 7. 诚实裁剪（明确不做的）

| 裁剪项 | 原因 |
|---|---|
| ❌ 多轮自由对话嵌入编辑区 | 复杂且与 AiChat 重复——阶段 3 只做"本次操作历史" |
| ❌ 全文 diff 视图（整篇对比） | 大文本性能不可控——阶段 2 只做选区 diff |
| ❌ AI 生成表格/图片 | contentEditable 格式不稳定——文本操作为主 |
| ❌ 默认流式直写正文 | 光标冲突——默认 preview，direct 显式开启 |
| ❌ 服务端会话持久化 | useChat 无持久化（与 AiChat 一致——会话由消费方持有） |
| ❌ AI 结果进 ctx.data | 个性化数据 SSR 泄漏红线（§3.4）——留在客户端 |
| ❌ sandbox 来源 commit 展示（toolCallId 关联） | 后端场景（agent 改文件 → 编辑器预览）——前端组件无消费点，消费方自持关联（事件流已带 toolCallId 字段可扩展） |

## 8. 测试与验收计划

**组件单测**（`Editor.test.ts` 扩展）：
- AI 按钮：`ai` 未传不渲染；无选区禁用；选区存在可触发
- 面板：打开/流式状态/完成/错误/重试；接受替换选区；拒绝丢弃；Escape 关闭
- diff：新增/删除/修改高亮正确
- 撤销：接受 → 撤销 → 原文恢复
- 并发：streaming 中动作禁用、stop 中止

**浏览器验收（agent-browser）**：真实点击/选区/流式——wire-fake server
（components-demo `/api/chat` 已有）加润色模式；验收清单按 §A.1
（outerHTML/内联 style/portal 归属/真实可见性）。

**Demo**：DemoEditor 增加 AI 区——选中文字 → 润色/翻译/缩写三按钮 → 流式
建议 → 接受/拒绝（演示三种动作 + 错误态）。

## 9. 与现有组件的关系

- **useChat**：会话状态机复用（send/stop/retry/streaming/subscribe）——零重复
- **AiChat**：对话场景组件——不动；Editor AI 是编辑场景（选区/替换语义）
- **usePopup**：AI 面板浮层
- **Button/Spinner/Icon**：面板 UI
- **wire-fake server**：demo 流式端点扩展（润色动作的确定性回复）

## 10. 实施顺序（建议）

1. 阶段 1 选区操作最小闭环（EditorAiPanel + useChat 编排 + 接受替换）
   ——单测 + agent-browser 验收
2. 阶段 2 diff + 撤销栈 + 直写模式（可选）
3. 阶段 3 全文操作 + 自定义动作 + 会话历史 + 快捷键
4. demo 完善 + docs/components.md 用户文档（Editor AI 章节）
