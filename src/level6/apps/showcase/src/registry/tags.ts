/**
 * 组件功能标签映射（功能动词 → 组件——'我要选日期' → DatePicker）
 * 标签体系 12 域：输入/选择/表单/展示/可视化/反馈/弹层/导航/虚拟化/AI/编辑文件/通用布局
 * 手工维护（语义知识）——经 index-json.ts 合并进 /index.json
 */

export const componentTags: Record<string, string[]> = {
  输入: ['Input', 'Textarea', 'SearchInput', 'PasswordInput', 'InputNumber', 'PinInput', 'TagsInput', 'Mentions', 'Rate', 'ColorPicker', 'Slider', 'Switch', 'Checkbox', 'CheckboxGroup', 'RadioGroup', 'SegmentedControl', 'ToggleGroup'],
  选择: ['Select', 'AutoComplete', 'TreeSelect', 'Cascader', 'DatePicker', 'Calendar', 'Transfer', 'Tree'],
  表单: ['Form', 'Field', 'JsonSchemaForm'],
  展示: ['InView', '多应用（app 节点）','Table', 'VirtualTable', 'Descriptions', 'List', 'Card', 'Avatar', 'AvatarGroup', 'Badge', 'Tag', 'StatCard', 'Result', 'EmptyState', 'Timeline', 'MessageBubble', 'Highlight', 'DiffView', 'LogViewer', 'JSONViewer', 'Markdown', 'CodeBlock', 'Img', 'QRCode', 'Watermark', 'Skeleton', 'Scrollbar'],
  可视化: ['Chart', 'Sparkline', 'StatCard', 'Pipeline'],
  反馈: ['Alert', 'AlertGroup', 'Toast', 'Notification', 'Loading', 'ProgressBar', 'Result', 'Confirm', 'Popconfirm'],
  弹层: ['Modal', 'Drawer', 'Popover', 'Tooltip', 'Dropdown', 'HoverCard', 'ContextMenu', 'Menubar', 'Popconfirm', 'Tour', 'Command', 'ColorPicker'],
  导航: ['Menu', 'Tabs', 'Breadcrumb', 'Pagination', 'Steps', 'Anchor', 'BackTop', 'Affix', 'NavMenu', 'Layout', 'PageHeader', 'Accordion', 'Collapse'],
  虚拟化: ['VirtualList', 'VirtualTable', 'InfiniteScroll', 'Resizable', 'Carousel'],
  AI: ['AiChat', 'ChatInput', 'MessageBubble', 'ToolCallCard', 'ApprovalCard', 'ReasoningBlock', 'CitationCard', 'SessionList', 'JsonSchemaForm', 'AuthPage', 'Pipeline'],
  编辑文件: ['Editor', 'CodeBlock', 'Markdown', 'FileUpload', 'FilePreview', 'Img', 'SheetGrid', 'SlideCanvas', 'CopyButton'],
  通用布局: ['Button', 'Layout', 'LayoutHeader', 'LayoutSider', 'LayoutContent', 'Space', 'Grid', 'Divider', 'Icon', 'Typography', 'Title', 'Text', 'Paragraph', 'Label', 'AspectRatio', 'ThemeSwitch', 'Wave', 'SortableList', 'Kanban', 'FloatButton', 'Link', 'ExportCSV'],
}
