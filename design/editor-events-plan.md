# Editor 事件流升级计划（vdom3 / ai / sandbox 四端同构）

> 状态：计划（未实施）。实施完成后归档删除。
> 面向读者：weifuwu 框架开发者（design/ 内部文档）。
> 关联：`design/editor-ai-plan.md`（AI 场景计划——本计划是其底层架构，阶段划分对齐）；
> `design/vdom3-architecture.md` / `design/ai-events-plan.md` / `design/sandbox-events-plan.md`
> （三端事件流先例——本计划为第四端）。

---

## 1. 目标与哲学

**核心不变量（与三端同构）**：

```
vdom3   ：DOM      = fold(渲染事件流)
ai      ：LLM 调用 = fold(ai 事件流)
sandbox ：容器状态 = fold(sandbox 事件流)
editor  ：文档状态 = fold(edit 事件流)     ← 本次新增
```

**编辑器的一切操作都有事件**——输入、格式、AI 应用、撤销/重现：
- **可撤销**：任意一步语义操作可逆（AI 替换 = 1 个原子事件）
- **可重现**：redo/回放 = 事件重放；任意时刻可回到任意历史点（时光机）
- **可审计**：`__wf_tail` 可见 edit:* 事件；跨层一条链（编辑 → AI 决策 → 沙盒执行）
- **可测试**：事件序列断言（与 vdom3 `expectEventSequence` 同款）

**用户体验目标（验收锚点，来自体验讨论）**：
1. AI 替换 = 一步撤销（Ctrl+Z 回到原文——敢让 AI 改）
2. 操作历史可回看/可回到任意版本（多轮 AI 修改后"还是第 2 版好"）
3. 光标永远在预期位置（输入/格式/AI 替换后不跳）
4. 跨浏览器行为一致（摆脱 execCommand 漂移）

## 2. 现状与差距

| 维度 | 现状 | 差距 |
|---|---|---|
| 编辑操作 | execCommand（已废弃、黑盒撤销、跨浏览器漂移） | 无自控状态、无精确撤销 |
| 受控回流 | domDirty 脏标记 + caret 文本偏移恢复（补 execCommand 的洞） | 事件流后模型自算光标，洞消失 |
| AI 操作 | 无（计划中） | AI 替换需要原子事件承载 |
| 事件流 | vdom3/ai/sandbox 三端已统一 `{entity, action, target, payload}` | editor 是第四端，尚未接入 |
| 撤销 | 浏览器原生（不可控） | 自建 undo/redo 栈 + 事件逆操作 |

## 3. 架构设计

### 3.1 文档模型（offset-based + 块/内联标记 + embed）

**选择理由**：AI 场景操作对象是**文本与选区**——offset 模型让选区（offset 区间）、
diff（文本 diff）、提示词（纯文本提取）全部天然。复杂结构（表格/图片/hr）降级为
**embed 快照**（HTML 原样保留——不参与文本 diff/AI 操作）。

```ts
interface DocState {
  text: string                    // 全文纯文本（offset 基准）
  blocks: Block[]                 // 块划分（段落/标题/列表/引用/对齐）
  marks: MarkSpan[]               // 内联标记（bold/italic/underline/link——offset 区间）
  embeds: EmbedSpan[]             // 嵌入（img/table/hr——HTML 快照，不参与文本）
}
interface Block   { start: number; end: number; kind: 'p'|'h1'|'h2'|'h3'|'ul'|'ol'|'quote'; align?: 'left'|'center'|'right' }
interface MarkSpan{ start: number; end: number; mark: { type: 'b'|'i'|'u'|'link'; href?: string } }
interface EmbedSpan{ start: number; end: number; type: 'img'|'table'|'hr'; html: string }
```

**序列化边界**：`DocState ⇄ HTML`（parse/serialize）——受控 value 仍以 HTML 为
外部契约（onChange 不破坏），DocState 是内部真相。parse 只认编辑器自己的
格式子集（`<p>/<h1-3>/<ul>/<ol>/<blockquote>/<b>/<i>/<u>/<a>/<img>/<table>/<hr>`），
未知 HTML 降级为纯文本（诚实裁剪——不试图理解任意 HTML）。

### 3.2 事件集（edit:*——与三端统一命名）

| 事件 | payload | 逆操作 |
|---|---|---|
| `edit:text-insert` | `{ at, text }` | `edit:text-delete` |
| `edit:text-delete` | `{ at, len, removed }` | `edit:text-insert` |
| `edit:mark-apply` | `{ start, end, mark, on }` | `edit:mark-apply { on: !on }` |
| `edit:block-set` | `{ start, end, block, prev }` | `edit:block-set { block: prev }` |
| `edit:embed-insert` | `{ at, embed }` | `edit:embed-delete` |
| `edit:embed-delete` | `{ at, embed }` | `edit:embed-insert` |
| `edit:ai-apply` | `{ range, original, revised }` | `edit:ai-revert` |
| `edit:undo` / `edit:redo` | `{ steps }` | 本身不可逆（元事件——只记录） |
| `edit:commit` | `{ events, label }` | 事务边界（AI 流式接受 = 1 个 commit） |

**事件语义**：
- 全部**针对 DocState 应用**（`applyEdit(doc, ev)` 纯函数）——文档 = fold 不变量
- 逆操作表（与 vdom3 `events.ts:inverse()` 同构）
- **事务（commit）**：AI 流式生成中不产生事件（token 降频——与 ai 事件流同模式）；
  接受时 `edit:commit { events: [text-insert×N, mark-apply×M], label: 'AI 润色' }`
  ——**1 个 commit = 1 个撤销步**
- **命令式 + 快照式混合**：文本/标记命令式（省内存）；`edit:ai-apply` 快照式
  （original/revised 全量——diff 面板直接读）

### 3.3 撤销/重现（undo/redo 栈）

```
undo 栈: [commit, commit, ...]        redo 栈: [commit, ...]
undo: 弹出末尾 commit → 逆序应用逆事件 → 推进 redo
redo: 弹出 redo 末尾 → 顺序重放事件 → 推进 undo
```

- 栈深默认 20（可配）——大文档 commit 内存敏感
- **时光机**：`edit:commit` 序列可整体回放（重放到第 N 个 commit = 应用 1..N 全部）
  ——操作历史 UI 直接消费
- 撤销粒度 = commit 粒度（用户输入 1 commit、格式操作 1 commit、AI 应用 1 commit）

### 3.4 事件流本体（`src/components/Editor/events.ts`——与三端同构）

```ts
editEmit(action, payload)          // 环形缓冲 2000（溢出覆盖——与 stream 同构）
editEvents(n, { action })          // 查询（按动作过滤）
subscribeEditEvents(fn)            // 订阅（emit 同步回调——退订返回）
resetEditEvents()                  // 测试隔离
window.__edit_tail(n)              // 全局调试（与 __wf_tail/__ai_events/__sandbox_events 同风格）
```

**双路桥接**（跨层一条链）：
- **vdom3 stream 桥接**：`stream.emit(ev('edit', 'apply', undefined, { action, label }))`
  ——**降频摘要**（每 commit 一条，不发细粒度 text-insert）——`__wf_tail` 可见编辑
  活动，与 AI/渲染事件同一条时间线
- **AI 桥接**：`edit:ai-apply` 事件带 `messageId` 关联键（↔ ai 事件流 wf:token/done）
  ——编辑操作 ↔ AI 决策一条链

### 3.5 与 AI 集成（对应 editor-ai-plan 阶段 1-2）

```
用户选中文案 → 点「润色」→ useChat 流式（ai 事件流: llm:start/token/done）
→ done 后生成 edit:commit { events: [edit:ai-apply { range, original, revised }],
  label: 'AI 润色', messageId }
→ 用户接受 → applyEdit（可撤销）；拒绝 → 事件丢弃（不落 undo 栈）
→ diff 面板：读 edit:ai-apply 的 original/revised（无需重新 diff）
```

- 流式**不写文档**（预览浮层显示）——只有 accept 才落 commit（原子）
- HITL 审批场景：approve 事件同样映射为 `edit:ai-apply` 的决策
- 个性化数据不进 ctx.data（既有红线）

### 3.6 与 sandbox 集成（全链路一条链）

场景：AI agent 用 sandbox 工具改文件（如写作任务）→ 编辑器预览/接受：

```
edit:ai-apply（前端，messageId）→ ai:tool:call（决策）→ sandbox:exec:start/end（执行）
        ↕ 关联键：messageId + 时间窗（与 ai↔sandbox 既有关联同模式）
```

- sandbox 改动的文件内容 → `edit:commit { events: [edit:ai-apply], source: 'sandbox', toolCallId }`
- 同一条链可审计：用户看到的效果（编辑器）↔ AI 决策 ↔ 沙盒执行

## 4. 实施阶段

### 阶段 0：文档模型 + 事件核心（纯模型，无 UI）
- `src/components/Editor/model/`：DocState、applyEdit、inverse、parse/serialize（HTML ⇄ DocState）、diff（选区级文本 diff）
- 事件流本体：`events.ts`（环形缓冲 + 查询 + 订阅 + 调试工具）
- **验收**：折叠不变量单测（fuzz：随机事件序列 → apply → 状态；undo 全部 → 空状态；redo → 复原）+ HTML 往返（parse→serialize 幂等）

### 阶段 1：事务层落地（✅ 已完成）
- toolbar 语义操作（bold/align/link/table 等）→ 转 `edit:commit` 应用，**不再走 execCommand**（format.ts 已删除）
- undo/redo 栈 + Ctrl+Z/Y（语义操作走自建栈；用户输入暂退浏览器 undo——分流策略见 §5.4）
- AI 原子撤销：`edit:ai-apply` commit（配合 editor-ai-plan 阶段 1 同步实施）
- **验收 ✅**：agent-browser——格式操作 → Ctrl+Z 一步撤销；`__edit_tail` 可见 commit/undo/redo

### 阶段 2：输入渐进接管（✅ 已完成——onInput diff 推导方案，非 keydown 拦截）
- keydown 拦截字符/Enter/退格 → `edit:text-insert/delete` + 块拆分合并
- IME：composition 期间浏览器全权，`compositionend` 一次性 `edit:text-insert`（中文红线——只在此刻入流）
- 粘贴：`paste` 拦截 → HTML 清洗 → `edit:text-insert`/`edit:embed-insert`
- 光标 = DocState offset ↔ DOM Range 双向（setCaret 由模型计算）
- **验收**：中文输入全程无错乱；光标在格式/AI 操作后精确恢复；粘贴格式保留

### 阶段 3：AI/沙盒全链路 + 操作历史 UI
- 操作历史面板（时光机）：commit 列表（label + 时间）→ 点击回放/回到任意点
- diff 高亮面板（original/revised）
- sandbox 来源 commit 展示（toolCallId 关联）
- 持久化草稿（可选）：commit 序列 localStorage（刷新恢复）
- **验收**：多轮 AI 修改后可回到第 2 轮后状态；编辑 ↔ AI ↔ sandbox 一条链在事件流中可查

## 5. 关键技术点与风险

### 5.1 光标/选区模型（核心难点）
- offset ↔ DOM Range 双向映射：text-insert 后所有 >at 的 offset 平移（marks/blocks/
  光标同步平移——**模型统一维护偏移映射表**，勿逐处修补）
- caret 保存 = 保存 offset（现有 textOffsetOf 思路的模型化升级）

### 5.2 IME（中文红线）
- compositionstart 起**不拦截任何输入**（浏览器全权写 contentEditable）
- compositionend 一次性读 DOM diff → 单个 `edit:text-insert`
- 风险：composition 期间外部操作（AI 触发）→ 禁用 AI 按钮直到 compositionend

### 5.3 HTML ⇄ DocState 序列化
- parse 只认格式子集；未知标签降级纯文本（裁剪——不试图理解任意 HTML）
- serialize 输出稳定格式（与现有 Editor 输出兼容——onChange 契约不破坏）
- 表格 = embed 快照（内部不再解析）

### 5.4 撤销分流策略（阶段 1 过渡期）
- Ctrl+Z：语义操作后（自建栈非空）→ 自建栈；否则 → 浏览器 undo
- 阶段 2 输入入流后：**完全统一走自建栈**（浏览器 undo 仅剩 IME 内部）

### 5.5 性能
- 大文档：commit 内存（快照 vs 逆操作混合已设计）；文本 diff 限选区级 ≤10k
  字符（超限整体替换高亮）
- 事件流环形 2000 与 vdom3 同构（溢出覆盖——查询取末尾）

### 5.6 与受控 value 契约兼容
- onChange 仍发 HTML（外部契约不变）；内部 DocState 为真相——HTML 只作
  序列化输出（避免双真相：**编辑器状态单向流动 DocState → HTML → onChange**；
  外部 value 变化 → parse → DocState 比对 → 差异事件化）

## 6. 测试计划

**模型单测**（`src/components/Editor/model/*.test.ts`）：
- 折叠不变量：随机事件序列（种子化 fuzz）→ apply → 重放 → 状态一致
- 逆操作：任意事件 → apply → inverse → 状态复原
- HTML 往返幂等；未知 HTML 降级
- 偏移平移：insert/delete 后 marks/blocks/caret 同步

**组件测试**：undo/redo 栈、Ctrl+Z 分流、AI commit 原子性、IME compositionend
入流、粘贴清洗

**浏览器验收（agent-browser）**：真实键盘（含中文 IME 模拟）、格式操作、AI
流式、撤销/重现、`__edit_tail` 事件断言——验收清单按 AGENTS.md §A.1

## 7. 诚实裁剪

| 裁剪项 | 原因 |
|---|---|
| ❌ 协作编辑（OT/CRDT） | 完全不同量级——明确不做 |
| ❌ IME 组合过程入流 | 深水区——compositionend 一次性入流（红线保护） |
| ❌ 表格/图片结构化建模 | embed HTML 快照——不参与 diff/AI |
| ❌ 任意 HTML 理解 | parse 只认格式子集——未知降级纯文本 |
| ❌ 细粒度事件全量桥接 vdom3 | 每 commit 一条摘要（降频——与 ai token 降频同模式） |
| ❌ 服务端持久化会话 | useChat 无持久化（既有决策） |

## 8. 与其他计划的衔接

- `design/editor-ai-plan.md`：阶段 2「撤销栈」升级为本计划的事件流事务层（AI
  原子撤销 = `edit:ai-apply` commit）——AI 面板/diff/会话历史全部消费 edit 事件流
- `design/components-cuts.md`：新增裁剪项登记（§7）
- `docs/components.md`：用户文档（Editor 事件流能力：撤销/历史/AI 协作）——实施后补

## 9. 实施顺序（建议）

1. **阶段 0**（模型 + 事件核心，纯 TS 无 UI——~2-3 天含 fuzz 测试）
2. **阶段 1**（事务层 + AI 原子撤销——与 editor-ai-plan 阶段 1 并行，价值最先兑现）
3. **阶段 2**（输入接管——IME 红线验证优先）
4. **阶段 3**（全链路 + 时光机 UI）
