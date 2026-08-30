# 组件覆盖缺口清单（COMPONENT-ROBUSTNESS 波次 1 产出）

> 由 `scripts/audit-component-coverage.mjs` 生成（组件: 132 · registry id（归并）: 143 · 全覆盖: 6 · 双层: 40 · 单层: 78 · 零覆盖: 8）——
> 零覆盖 = 缺口（CI 红）——单层 = 建议补 showcase 行为断言（不阻塞）。
> 本清单 = 波次 2（缺口补齐）与波次 4（语义升级）的输入。

## 零覆盖缺口（8——波次 2 必须补齐）

| 组件 | 建议路径 |
| --- | --- |
| avatargroup | AvatarGroup |
| checkboxgroup | CheckboxGroup |
| descriptions | Descriptions |
| field | Field |
| jsonschemaform | JsonSchemaForm |
| layout | Layout |
| searchinput | SearchInput |
| togglegroup | ToggleGroup |

**补齐策略**：有 registry 页面的直写 `comp-<id>.test.ts`（能力面——先读
props 接口清单 → demo 覆盖）；无页面（avatargroup/checkboxgroup/
togglegroup）补 registry 条目 + demo 或走场景层 cap-。

## 单层覆盖（78——建议补 showcase 行为断言——波次 4 输入）

- affix（Affix: comp）
- alert（Alert: comp）
- alertgroup（AlertGroup: comp）
- anchor（Anchor: comp）
- appshell（AppShell: comp）
- approvalcard（ApprovalCard: comp）
- aspectratio（AspectRatio: comp）
- avatar（Avatar: comp）
- backtop（BackTop: comp）
- badge（Badge: comp）
- breadcrumb（Breadcrumb: comp）
- button（Button: comp）
- card（Card: comp）
- chart（Chart: comp）
- chatinput（ChatInput: comp）
- citationcard（CitationCard: comp）
- codeblock（CodeBlock: comp）
- confirm（Confirm: comp）
- contextmenu（ContextMenu: comp）
- copybutton（CopyButton: comp）
- diffview（DiffView: comp）
- divider（Divider: comp）
- emptystate（EmptyState: comp）
- exportcsv（ExportCSV: comp）
- filepreview（FilePreview: comp）
- filetree（FileTree: comp）
- floatbutton（FloatButton: comp）
- form（Form: scenario）
- grid（Grid: comp）
- highlight（Highlight: comp）
- icon（Icon: comp）
- img（Img: comp）
- inview（InView: comp）
- infinitescroll（InfiniteScroll: comp）
- jsonviewer（JSONViewer: comp）
- label（Label: comp）
- link（Link: comp）
- loading（Loading: comp）
- logviewer（LogViewer: comp）
- markdown（Markdown: comp）
- markdowneditor（MarkdownEditor: comp）
- math（Math: scenario）
- mentions（Mentions: comp）
- messagebubble（MessageBubble: comp）
- navmenu（NavMenu: comp）
- notification（Notification: comp）
- pageheader（PageHeader: comp）
- passwordinput（PasswordInput: comp）
- pininput（PinInput: comp）
- pipeline（Pipeline: comp）
- progressbar（ProgressBar: comp）
- prompttemplate（PromptTemplate: comp）
- qrcode（QRCode: comp）
- radiogroup（RadioGroup: comp）
- reasoningblock（ReasoningBlock: comp）
- relationgraph（RelationGraph: comp）
- result（Result: comp）
- scrollbar（Scrollbar: comp）
- segmentedcontrol（SegmentedControl: comp）
- sessionlist（SessionList: comp）
- skeleton（Skeleton: comp）
- sortablelist（SortableList: comp）
- space（Space: comp）
- sparkline（Sparkline: comp）
- statcard（StatCard: comp）
- tabbar（TabBar: comp）
- tag（Tag: comp）
- tagsinput（TagsInput: comp）
- themeswitch（ThemeSwitch: comp）
- timeline（Timeline: comp）
- toast（Toast: comp）
- toolcallcard（ToolCallCard: comp）
- tree（Tree: comp）
- videoplayer（VideoPlayer: scenario）
- virtuallist（VirtualList: comp）
- virtualtable（VirtualTable: comp）
- watermark（Watermark: comp）
- wave（Wave: scenario）

## 双层/全覆盖（46——防线已存在——不动作）

全覆盖 6（契约 harness 6 组件）· 双层 40（契约+场景/comp 双层——
InputNumber/Input/Switch/Tabs/Slider/Checkbox 等——密钥组件双保险）。
