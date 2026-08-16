# ODES — Office Document Event Stream（office 文档事件流标准）设计方案

> 状态：已完成（阶段 0-3 全部实施——浏览器实测三模型编辑闭环）
> 目标：docx/xlsx/pptx 基于事件流的编辑——文档 = fold(事件流)——与 Editor/ai/sandbox
> 四端同构；同一 edit 通道审计；导入导出零依赖（服务端转换）。

---

## 1. 核心决策

| # | 决策 | 理由 |
|---|------|------|
| D1 | **docx 的文本 IR = Editor 的 `DocState`，op = `EditEvent` 全量复用** | 段落流 + marks + embeds 完全覆盖 docx 正文；fold 复用 `applyEdit`——零新代码、撤销/历史/时光机/Editor 组件直接复用 |
| D2 | xlsx = 网格模型 `WorkbookState`（稀疏 cells Map）——新 op 集 | 非线性模型——单元格语义（`A1` 引用），不能映射线性文本 |
| D3 | pptx = 画布模型 `DeckState`（slide → shape 集合）——新 op 集 | shape 几何 + 层叠——非线性 |
| D4 | **统一事件外壳**：`EditAction` 加 `'office'` 一种 action + `payload: { docType, op }` | 同一环形缓冲/`__edit_tail`/订阅——跨文档类型统一审计；新 op 不需改 action 联合类型（扩展性） |
| D5 | **导入 = checkpoint（snapshot IR）+ tail 增量**——服务端转换器输出 IR 快照，不暴露转换内部事件 | 事件流从导入时刻开始——转换器内部细节不可审计（诚实）；checkpoint 与 Editor 的 load 同模式 |
| D6 | **导出 = 前端 fold(事件流) → IR → POST 服务端渲染 OOXML** | 服务端无状态幂等；前端零依赖纪律不变（OOXML 解析/渲染全在服务端） |
| D7 | 撤销/历史 = Commit（before 快照 + ops 数组）——同 Editor | cell-set/shape-move 天然可逆（旧值记录）；快照兜底 |
| D8 | 公式不计算（xlsx）——值存储 + 公式字符串保留，导出时服务端重算 | 前端零依赖——公式引擎裁剪 |

## 2. 文档模型（IR——checkpoint 快照）

```ts
// docx：复用 DocState（Editor/model/types.ts）——零新类型
// 裁剪：分节/页眉页脚/域代码/批注——导入映射到 DocState 子集，不可映射项入 warnings

// xlsx（稀疏网格）
interface SheetCell {
  kind: 's' | 'n' | 'b' | 'f'     // string/number/bool/formula
  value: string | number | boolean
  formula?: string                 // kind='f' 时——不计算（D8）
  style?: CellStyle
}
interface CellStyle { bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right'; bg?: string }
interface SheetState { name: string; cols: number; cells: Map<string, SheetCell> }  // 'A1' → cell
interface WorkbookState { sheets: SheetState[]; activeSheet: number }

// pptx（画布）
type ShapeKind = 'text' | 'image' | 'table' | 'rect' | 'line'
interface SlideShape {
  id: string; kind: ShapeKind
  x: number; y: number; w: number; h: number
  props?: { text?: string; fontSize?: number; bold?: boolean; fill?: string; imageUrl?: string }
}
interface SlideState { shapes: SlideShape[]; layout?: string }
interface DeckState { slides: SlideState[]; activeSlide: number; size: { w: number; h: number } }

type OfficeSnapshot = { docType: 'docx'; doc: DocState }
  | { docType: 'xlsx'; workbook: WorkbookState }
  | { docType: 'pptx'; deck: DeckState }
```

## 3. 操作事件集（ODES ops）

```ts
// docx：EditEvent（8 种全量复用——text-insert/delete/mark-apply/mark-restore/
// block-set/embed-insert/embed-delete/ai-apply——表格 = embed 快照）

// xlsx
type SheetOp =
  | { type: 'cell-set'; sheet: number; ref: string; cell: SheetCell | null }   // null=清除
  | { type: 'range-style'; sheet: number; ref: string; style: CellStyle }
  | { type: 'insert-rows'; sheet: number; at: number; count: number }
  | { type: 'delete-rows'; sheet: number; at: number; count: number }
  | { type: 'insert-cols'; sheet: number; at: number; count: number }
  | { type: 'delete-cols'; sheet: number; at: number; count: number }
  | { type: 'sheet-add'; name: string }
  | { type: 'sheet-rename'; sheet: number; name: string }
  | { type: 'sheet-delete'; sheet: number }
  | { type: 'sheet-move'; sheet: number; to: number }
  | { type: 'sheet-active'; sheet: number }

// pptx
type SlideOp =
  | { type: 'slide-add'; at?: number; layout?: string }
  | { type: 'slide-delete'; slide: number }
  | { type: 'slide-move'; slide: number; to: number }
  | { type: 'slide-active'; slide: number }
  | { type: 'shape-add'; slide: number; shape: SlideShape }
  | { type: 'shape-remove'; slide: number; shapeId: string }
  | { type: 'shape-move'; slide: number; shapeId: string; x: number; y: number }
  | { type: 'shape-resize'; slide: number; shapeId: string; w: number; h: number }
  | { type: 'shape-set'; slide: number; shapeId: string; props: Partial<SlideShape['props']> }

type OfficeOp = EditEvent | SheetOp | SlideOp
```

**不可逆性声明**（对照 Editor 先例）：
- cell-set：逆操作 = 恢复旧 cell（apply 返回 prev——op 可逆）
- shape-move/resize：逆 = 旧坐标（可逆）
- insert-rows/cols：**引用不重算**（公式字符串原样保留——裁剪登记：v1 无公式引用自动调整）
- slide-delete：快照式（before 含被删 slide 状态——同 Editor mark-restore 快照先例）

## 4. 折叠（fold）与 checkpoint

```ts
// 不变量（与 Editor 同款）：checkpoint.snapshot = fold(checkpoint 之前的全部事件)
// checkpoint.tail = 快照后的增量（可裁剪重打包）

function foldOffice(cp: OfficeCheckpoint): OfficeSnapshot {
  // snapshot + apply 每个 tail op（docx 委托 applyEdit；sheet/slide 各自 apply）
}
```

- **存储格式 = 事件流 + checkpoint**：`{ snapshot, baseEventId, tail }`——持久化时定期重打包
  （tail 超阈值 → 重新生成 snapshot——与 edit-events 环形 2000 同哲学，持久化版）
- 导入：`POST /api/office/import` → `{ docType, snapshot, warnings }`（tail 空）
- 编辑：append op（每 commit 一组）——`editEmit('office', { docType, op })`
- 导出：`foldOffice(cp)` → snapshot → `POST /api/office/export` → OOXML 二进制

## 5. 与现有事件流结合（同构四端）

```
用户操作（OfficeEditor）
  → ops（commit 分组——N op = 1 撤销步）
  → editEmit('office', { docType, op }, commitId)
  → ① edit-events 环形缓冲（__edit_tail(50, 'office') 审计）
  → ② vdom3 stream：每 commit 一条摘要（降频——同 Editor commit）
  → ③ ai：跨端订阅（写作建议/公式建议——payload 关联 commitId）
  → ④ sandbox：服务端导入导出路径（source: 'sandbox' 的 commit 带 toolCallId）
```

**四端同构验证**：OfficeEditor 的编辑事件与 Editor 同一通道、同一 fold 语义、
同一 Commit 撤销模型——`doc = fold(events)` 不变量对 office 三模型成立。

## 6. 组件与服务端契约

```ts
// src/components/OfficeEditor/
//   model/types.ts apply.ts inverse.ts history.ts io.ts
//   OfficeEditor.ts（docType 分发：docx→Editor 复用 / xlsx→SheetGrid / pptx→SlideCanvas）

// 服务端（零依赖——OOXML 解析/渲染在服务端；前端只传 IR）
POST /api/office/import   multipart file → { docType, snapshot, warnings: [{ path, issue }] }
POST /api/office/export   json { docType, snapshot } → application/vnd.openxmlformats-*
```

## 7. 阶段划分

| 阶段 | 内容 | 验收 |
|------|------|------|
| 0 | ✅ 协议层：ODES 类型 + fold/apply 纯函数 + checkpoint + 测试 | fold 不变量（三模型 fuzz）；checkpoint 往返；事件流外壳接线 |
| 1 | ✅ docx：转换（前端零依赖）+ Editor 复用 + AI + 前端化 | 导入 docx → Editor 编辑 → 导出 docx 文本/表格保真 |
| 2 | ✅ xlsx：转换 + SheetGrid（单元格编辑/行列增删/AI 公式） | 导入 xlsx → 编辑 → 导出；公式字符串保留 |
| 3 | ✅ pptx：转换 + SlideCanvas（shape 增删/拖拽/缩放/AI 润色） | 导入 pptx → 编辑 → 导出 |

## 8. 诚实裁剪登记

- **前端零依赖不变**：OOXML 解析/渲染全在服务端（`/api/office/import|export`）
- docx：分节/页眉页脚/域代码/批注/修订 —— 导入映射子集，不可映射 → `warnings`（不静默）
- xlsx：**公式不计算**（值 + 公式字符串保留；导出时服务端重算）；图表/数据透视/合并单元格（v1）→ warnings
- pptx：动画/母版/备注/幻灯片内表格 → warnings
- insert-rows/cols 不做公式引用重算（v1）
- 导入遇不支持能力：转换器返回 warnings——前端显示，绝不静默丢内容（CS-05）

---

## 9. AI 事件流对接（ODES × ai——跨端一条链）

**关联键**：复用既有 messageId 协议（ai-events-plan——`aiEmit` + `aiEvents(n, {messageId})`；
edit 流 `target` 字段 = messageId 关联——`ai-apply` 先例）。

```
用户操作（OfficeEditor AI 建议）
  → aiStream（wf: SSE：wf:token/wf:done——ai 事件流 llm:start/token/done）
  → AI 回复解析 → OfficeOp[]（普通 op——AI 元数据在 payload）
  → editEmit('office', { docType, op, ai: { messageId, status } }, messageId)
  → 审计：editEvents(50, {action:'office'}) ↔ aiEvents(n, {messageId})——一条链
  → 接受 = commit（before 快照 + ops——原子撤销一步）——拒绝/错误不落 op
```

**场景矩阵**：

| 场景 | docx | xlsx | pptx |
|------|------|------|------|
| 文本写作/润色/翻译 | ✅ **复用 Editor ai prop**（ai-apply commit——零新代码） | — | 文本框 shape-set |
| 公式生成 | — | 选区 → 提示 → `cell-set`（公式/值） | — |
| 数据填充/总结 | — | 选区 → 范围写入 | — |
| 大纲 → 幻灯片 | — | — | slide-add + shape-add 布局 |

**协议扩展**（types.ts）：

```ts
interface OfficeStreamPayload {
  docType: DocType
  op: OfficeOp
  /** AI 关联（可选——跨端审计：editEvents ↔ aiEvents 一条链） */
  ai?: { messageId: string; status: 'suggested' | 'accepted' | 'rejected' }
}

interface OfficeAiOptions {
  url: string                       // AI SSE 端点（wf: 协议）
  mode: 'text' | 'formula' | 'shape'  // 上下文模式（docType 感知默认）
  parse?: (text: string, ctx: AiContext) => OfficeOp[]   // 自定义解析
}
```

**AI 落地 = 普通 op + ai 元数据**（不引入 ai-* op 类型——op 集保持小）：
- 撤销：接受 = commit（before 快照——与 Editor ai-apply 同款原子性）
- 拒绝/错误：不产生 op——事件流 status 记录（审计可查）
- 流式：token 降频（done 覆盖——ai 事件流既有语义）

**xlsx 默认解析**（parse-formula——AI 回复 → cell-set ops）：
- 回复含 `=...` → 公式单元格（`kind:'f'`——值 + formula 字符串）
- 纯数字 → `kind:'n'`；文本 → `kind:'s'`
- 位置：活动单元格或回复内嵌 ref（`A1:` 前缀）

**docx**：FilePreview/OfficeEditor 透传 ai prop 到 Editor——AI 协作全链路复用
（选区 → 建议浮层 → 接受 = ai-apply commit——`edit:ai-apply` 事件已带 messageId）。

**阶段**：
- 1c（本轮）：协议扩展（payload.ai + OfficeAiOptions）+ xlsx 默认解析器 +
  事件流桥接测试（edit ↔ ai 关联审计）
- 2：xlsx 网格 UI + 公式 AI 浮层（选区上下文 → 建议 → 接受 commit）
- 3：pptx 文本 AI（shape 选中 → shape-set）

---

## 10. 前端化（无需后端——用户决策 2026）

**突破**：转换器已自研零依赖——唯一障碍 ZIP deflate——浏览器有
`DecompressionStream('deflate-raw')`（Chrome 80+/Safari 16.4+/Node 18+）——
**前端 import/export 完全可行**：

```
打开 docx（input[type=file]）→ readZip（EOCD→central→local + DecompressionStream）
  → 轻量 XML 解析 → DocState → Editor（与 md/text 同链路——撤销/AI/表格编辑）
  → 编辑 → docToDocx（VNode 组件化 → store ZIP）→ browser.downloadFile
```

**变更**：
- zip.ts 去 node:zlib——`inflateRaw` 统一 DecompressionStream（跨环境）；
  readZip 变 async
- docx.ts 去 Buffer——base64 跨环境（Buffer 守卫 / atob）
- FilePreview office 类型：editable → 本地导入（懒创建 file input——挂 body
  隐藏；upload 测试可寻）+ 下载 docx；只读路径保留 iframe
- 服务端转换仍可用（/api/office/import|export 契约不变——大文件/多用户场景），
  但不再是必需

**验证**：真实 docx 浏览器实测——打开 → Editor 渲染（h1/表格/粗体）→ 表格编辑
→ 下载（Blob + 正确 MIME）；deflate 压缩路径测试（手工构造 method 8 ZIP）。
