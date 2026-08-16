# FilePreview 组件计划（office/pdf/md/html 预览 + 编辑演进）

> 状态：计划（2026-12）。实施完成后归档删除（git 历史可追溯）。
> 关联：Editor 事件流（design 已归档——实现见 src/components/Editor/model/ +
> docs/components.md Editor 章节）；vdom3/ai/sandbox 事件流（四端同构）。

## 1. 目标

**文件预览组件**：office/pdf/md/html/text 预览——**基于事件流**（文档 = fold(事件流)——
与 Editor 同模型），后续支持编辑（同模型切换），最终与 editor/ai/vdom/sandbox 集成。

**演进路径**（一条主线）：

```
预览（FilePreview，只读）→ 编辑（editable → 复用 Editor 事件流事务层）
→ AI 协作（Editor ai prop）→ sandbox（文件读写，save 回调）
```

关键：**所有类型统一落到 DocState**（Editor model）——预览渲染、编辑、撤销、
AI 替换全部复用同一模型——第五个消费端（md/html 文档）直接继承第四端全部能力。

## 2. 类型支持矩阵（诚实裁剪）

| 类型 | 预览方式 | 编辑 | 说明 |
|---|---|---|---|
| `md` | **解析 → DocState → HTML 渲染** | ✅ 复用 Editor | 自研 markdown 解析器（md ⇄ DocState 双向） |
| `text` | `<pre>` 渲染 | ✅ 复用 Editor | 纯文本 = 单段 DocState |
| `html` | **iframe sandbox**（安全隔离——untrusted HTML 不直插 DOM，FS-04 红线） | ❌（安全风险——裁剪） | 只读预览 |
| `pdf` | `<iframe>`（浏览器原生查看器） | ❌（原生控件无模型） | 只读 |
| `office` | `url`（服务端已转换的 pdf/html）或 iframe | ❌（无浏览器原生解析） | 转换由服务端提供——前端不做 docx/xlsx 解析（零依赖原则——诚实裁剪） |

**md/html/text 的编辑统一走 Editor**（同一 DocState——编辑/撤销/时光机/AI 开箱即用）；
pdf/office 只读（原生/服务端能力边界）。

## 3. 架构

### 3.1 markdown 解析器（`src/components/FilePreview/markdown.ts`）

**md ⇄ DocState 双向**（复用 `Editor/model`——DocState/BlockProp/MarkSpan/embed）：

```ts
parseMarkdown(md: string): DocState      // md → DocState（预览/编辑基础）
serializeMarkdown(doc: DocState): string // DocState → md（编辑保存回写）
```

块级映射：`#/##/###` → h1/h2/h3、`>` → quote、`-`/`1.` → ul/ol、`---` → hr(embed)、
代码块 ```` ``` ```` → pre 块（embed 快照——内部不解析）、空行分段。
行内映射：`**` → b、`*`/`_` → i、`[text](url)` → link mark、`![alt](url)` → img embed、
行内 `` ` `` → code（裁剪：code 内联样式简化——或 embed）。

**不变量**：`serializeMarkdown(parseMarkdown(md))` 语义等价（格式子集内）；parse 后
DocState 可直接 `serializeHtml`（与 Editor 渲染同构——预览即复用）。

### 3.2 FilePreview 组件（`src/components/FilePreview/FilePreview.ts`）

```ts
interface FilePreviewProps {
  type: 'md' | 'html' | 'pdf' | 'office' | 'text'
  content?: string      // md/html/text 内容（直接传入）
  url?: string          // pdf/office（或 html 远程加载）
  fileName?: string     // 显示名（编辑模式回写提示）
  editable?: boolean    // md/text：切换 Editor（复用事件流事务层）
  ai?: EditorAiOptions  // 编辑模式 AI 协作（透传 Editor）
  onSave?: (content: string, type: 'md' | 'text') => void  // 编辑保存（md 序列化回写）
  onLoad?: (info: { chars: number; blocks: number; type: FileType }) => void
}
```

渲染分支：
- md/text：doc = parse（content）→ `serializeHtml` 渲染（或直接 Editor editable）
- html：`<iframe sandbox="allow-same-origin">`（srcDoc）——隔离执行
- pdf：`<iframe src={url}>`（原生查看器）
- office：`<iframe src={url}>`（服务端转换产物）或占位提示

### 3.3 事件流集成（第五端同构）

- **解析/渲染可观测**：`editEmit('preview', { type, chars, blocks, status })`——
  `__edit_tail` 可见（与 editor 编辑事件同一条时间线）
- **编辑 = Editor 事件流**：editable 模式 DocState 直接承接——commit/undo/时光机/
  ai-apply 全部继承——`__edit_tail` 记录编辑
- **sandbox 集成路径**：`url` 加载（GET 文件）→ 预览；`onSave` 回写（PUT 文件）——
  消费方接 sandbox 读写工具；`toolCallId`/`departmentId` 关联字段可扩展
- **AI**：editable + ai prop → Editor 完整能力（润色 md 文档 = ai-apply 原子撤销）

## 4. 实施步骤

1. **markdown.ts**：解析器（parse + serialize）——纯函数 + 测试（往返/折叠/边界）
2. **FilePreview.ts + css**：预览分支 + editable 模式
3. 测试：markdown 往返、组件渲染（各类型）、editable 编辑 + 保存、事件流
4. demo：md 预览 + 编辑 + AI 润色（wire-fake）
5. docs/components.md FilePreview 章节

## 5. 裁剪声明

- ❌ docx/xlsx/pptx 前端解析（零依赖原则——office 由服务端转换 URL）
- ❌ html 编辑（untrusted HTML 安全边界——只读预览）
- ❌ pdf/office 编辑（原生控件/服务端能力边界——无模型）
- ❌ markdown 全语法（GFM 子集：标题/列表/引用/粗斜体/链接/图片/代码块/分隔线——
  表格/脚注等裁剪）
- 代码块 = embed 快照（内部不解析——与 Editor 表格同模式）
