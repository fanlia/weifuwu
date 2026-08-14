# weifuwu/components 逐组件优化清单（2026-12）

> ## ✅ 已归档（2026-12）——B-E 档全部实施
> B 档 6 组件裸圆角 → token；C 档 4 组件 10px → xs token（可读性下限）；
> D 档甄别后 2 个真实缺口（AutoComplete/Accordion disabled 样式——其余 8 个
> 无 disabled API 系审计误报）；E 档甄别后 2 个真实缺口（Slider thumb hover/
> StatCard clickable hover——其余 3 个已有）。验证：45 audit + 1112 组件测试全绿。

> 全 115 组件四维审计（CSS token 合规/交互态/测试/文档）：
> - 测试覆盖 115/115 ✅ 文档覆盖 124 表格条目 ✅
> - 50 组件有优化项（甄别后收敛为 4 类真实缺口）

## 全量分档

### A 档：完全合规（65 个）
Accordion* Alert Avatar AvatarGroup Badge BackTop Breadcrumb* Cascader
Checkbox* CodeBlock Collapse ColorPicker ContextMenu CopyButton DatePicker
Descriptions DiffView* Divider Drawer* Editor* EmptyState* Field* FileUpload*
FloatButton* Form Grid Highlight* Icon Img InfiniteScroll InView JsonSchemaForm
JSONViewer Kanban* Label Layout* Link* List Loading LogViewer* Markdown*
Mentions Menubar MessageBubble Modal* NavMenu* Notification PageHeader
PasswordInput* PinInput Pipeline* Popconfirm Popover ProgressBar QRCode*
Rate ReasoningBlock Resizable Result Scrollbar SearchInput* SegmentedControl
SessionList* Space Sparkline Steps* Switch* Table* Tag* TagsInput* Textarea
ThemeSwitch Timeline* Toast ToggleGroup ToolCallCard* Tooltip Tour* Transfer
Tree TreeSelect* Typography VirtualList VirtualTable* Watermark
（* = 有优化项——见下）

### B 档：样式 token 化（6 个）——P2
| 组件 | 裸值 | 修复 |
|---|---|---|
| Slider | border-radius 3px（track/range） | → var(--wf-radius-xs) |
| Editor | border-radius 2px | → var(--wf-radius-xs) |
| FileUpload | border-radius 2px | → var(--wf-radius-xs) |
| Highlight | border-radius 2px | → var(--wf-radius-xs) |
| TagsInput | border-radius 2px | → var(--wf-radius-xs) |
| ToolCallCard | border-radius 2px | → var(--wf-radius-xs) |

### C 档：可读性 10px → 12px（4 个）——P2
| 组件 | 位置 | 修复 |
|---|---|---|
| Input | hint 提示 10px | → var(--wf-font-size-xs) |
| NavMenu | 徽标 10px | → var(--wf-font-size-xs) |
| Tag | 文本 10px | → var(--wf-font-size-xs) |
| Timeline | 时间 10px | → var(--wf-font-size-xs) |

### D 档：disabled 态缺失（10 个）——P2
Table / AutoComplete / Calendar / Carousel / Menu / Accordion / Command /
SessionList / ApprovalCard / VirtualTable ——有 disabled API 无样式 → 补
`opacity + cursor: not-allowed`

### E 档：hover/focus 微反馈（5 个）——P3
Slider thumb hover / SearchInput clear hover / StatCard clickable hover /
Modal 关闭按钮 hover / Pagination 页码 hover

## 验收
style-audit 45 绿 / 组件测试全绿 / 浏览器抽查
