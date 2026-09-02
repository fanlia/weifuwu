/**
 * 组件表——单一事实源（components-only 定稿——SHOWCASE-COMPONENTS-ONLY-PLAN：
 * 分类/迁移期字段已歼灭——id/name/desc/family/源码导航/gotchas）。
 */
import type { ComponentEntry } from './types.ts'

export const components: ComponentEntry[] = [
{
    "id": "videoplayer",
    "name": "VideoPlayer",
    "desc": "视频播放器——原生 video 封装（controls/封面/宽高比/事件——零依赖）",
    "sourceFile": "src/client/components/VideoPlayer/VideoPlayer.ts",
    "cssFile": "src/client/components/VideoPlayer/VideoPlayer.css",
    "testFile": "src/client/components/VideoPlayer/VideoPlayer.test.ts"
  },
{
    "id": "math",
    "name": "Math",
    "desc": "轻量公式渲染——自研 LaTeX 子集（上下标/分数/根号/希腊字母——零依赖不引 KaTeX）",
    "sourceFile": "src/client/components/Math/Math.ts",
    "cssFile": "src/client/components/Math/Math.css",
    "testFile": "src/client/components/Math/Math.test.ts"
  },
{
    "id": "markdowneditor",
    "name": "MarkdownEditor",
    "desc": "分屏 Markdown 编辑器——textarea + 实时预览（复用 Markdown parser 零漂移）",
    "sourceFile": "src/client/components/MarkdownEditor/MarkdownEditor.ts",
    "cssFile": "src/client/components/MarkdownEditor/MarkdownEditor.css",
    "testFile": "src/client/components/MarkdownEditor/MarkdownEditor.test.ts"
  },
{
    "id": "codeeditor",
    "name": "CodeEditor",
    "desc": "轻量代码编辑器——textarea + 行号 + Tab 缩进（零依赖，不引 Monaco）",
    "sourceFile": "src/client/components/CodeEditor/CodeEditor.ts",
    "cssFile": "src/client/components/CodeEditor/CodeEditor.css",
    "testFile": "src/client/components/CodeEditor/CodeEditor.test.ts"
  },
{
    "id": "imagecropper",
    "name": "ImageCropper",
    "desc": "图片裁剪——canvas 原生 API + 拖拽裁剪框 + 比例控制（零依赖）",
    "sourceFile": "src/client/components/ImageCropper/ImageCropper.ts",
    "cssFile": "src/client/components/ImageCropper/ImageCropper.css",
    "testFile": "src/client/components/ImageCropper/ImageCropper.test.ts"
  },
{
    "id": "wordcloud",
    "name": "WordCloud",
    "desc": "词云——权重→字号映射 · 圆心同心环发散布局 · SVG textLength 定宽（零依赖自绘——SSR 一致零重叠）",
    "sourceFile": "src/client/components/WordCloud/WordCloud.ts",
    "cssFile": "src/client/components/WordCloud/WordCloud.css",
    "testFile": "src/client/components/WordCloud/WordCloud.test.ts",
    "gotchas": ["textLength 强制词宽=估算宽（0.62×ASCII/1.0×CJK 系数）——lengthAdjust=spacing 只调字距保形——不换行不截断", "布局=同心环扫描（环宽=词高——邻环相接不重叠）——最大词居中心——viewBox=全部词包围盒（自适应零裁剪）——height 仅显示高", "0 权重词过滤不渲染 · 全等权重 → 全 maxFontSize（同权同尺寸 Wordle 语义）", "可交互必须 pointer-events:bounding-box——SVG text 默认 visiblePainted=字形笔画命中（字母间隙漏到 svg 根——点击不触发实证）", "词 key 用 word 本身（含索引时排序/权重变化即 remove+create 重建）"]
  },
{
    "id": "wave",
    "name": "Wave",
    "desc": "点击水波纹动效——包装任意可点击元素（纯 CSS，reduced-motion 自动降级）",
    "sourceFile": "src/client/components/Wave/Wave.ts",
    "cssFile": "src/client/components/Wave/Wave.css",
    "testFile": "src/client/components/Wave/Wave.test.ts"
  },
{
    "id": "sortablelist",
    "name": "SortableList",
    "desc": "拖拽排序列表——useDragDrop 原语 + keyed 身份（任务/字段/配置排序）",
    "sourceFile": "src/client/components/SortableList/SortableList.ts",
    "cssFile": "src/client/components/SortableList/SortableList.css",
    "testFile": "src/client/components/SortableList/SortableList.test.ts"
  },
{
    "id": "exportcsv",
    "name": "ExportCSV",
    "desc": "数据导出 CSV——RFC 4180 转义 + BOM（Excel 兼容）零依赖",
    "sourceFile": "src/client/components/ExportCSV/ExportCSV.ts",
    "testFile": "src/client/components/ExportCSV/ExportCSV.test.ts"
  },
{
    "id": "button",
    "name": "Button",
    "desc": "4 variants × 3 sizes + loading + block + disabled",
    "sourceFile": "src/client/components/Button/Button.ts",
    "cssFile": "src/client/components/Button/Button.css",
    "testFile": "src/client/components/Button/Button.test.ts"
  },
{
    "id": "input",
    "name": "Input",
    "desc": "text/email/password/number，支持 label/error/hint/required",
    "sourceFile": "src/client/components/Input/Input.ts",
    "cssFile": "src/client/components/Input/Input.css",
    "testFile": "src/client/components/Input/Input.test.ts"
  },
{
    "id": "textarea",
    "name": "Textarea",
    "desc": "多行文本，支持 rows/label/error/hint",
    "sourceFile": "src/client/components/Textarea/Textarea.ts",
    "cssFile": "src/client/components/Textarea/Textarea.css",
    "testFile": "src/client/components/Textarea/Textarea.test.ts"
  },
{
    "id": "select",
    "name": "Select",
    "desc": "原生下拉选择器",
    "gotchas": ["受控输入纪律：searchable 输入焦点丢失——useControlledInput 内部态", "事件 prop 判定：on+大写（EVENT_RE）——once/only 等 on 开头属性防误判", "浮层必须 portal（§5.4）——absolute 相对父容器在 overflow 下裁剪"],
    "sourceFile": "src/client/components/Select/Select.ts",
    "cssFile": "src/client/components/Select/Select.css",
    "testFile": "src/client/components/Select/Select.test.ts"
  },
{
    "id": "checkbox",
    "name": "Checkbox",
    "desc": "带 label 的复选框，支持 checked/disabled",
    "sourceFile": "src/client/components/Checkbox/Checkbox.ts",
    "cssFile": "src/client/components/Checkbox/Checkbox.css",
    "testFile": "src/client/components/Checkbox/Checkbox.test.ts"
  },
{
    "id": "switch",
    "name": "Switch",
    "desc": "开关切换，视觉替代 checkbox",
    "sourceFile": "src/client/components/Switch/Switch.ts",
    "cssFile": "src/client/components/Switch/Switch.css",
    "testFile": "src/client/components/Switch/Switch.test.ts"
  },
{
    "id": "radiogroup",
    "name": "RadioGroup",
    "desc": "单选组，支持 inline/options/value",
    "sourceFile": "src/client/components/RadioGroup/RadioGroup.ts",
    "cssFile": "src/client/components/RadioGroup/RadioGroup.css",
    "testFile": "src/client/components/RadioGroup/RadioGroup.test.ts"
  },
{
    "id": "segmentedcontrol",
    "name": "SegmentedControl",
    "desc": "分段单选（模式切换/筛选/模板），支持 sm/block",
    "sourceFile": "src/client/components/SegmentedControl/SegmentedControl.ts",
    "cssFile": "src/client/components/SegmentedControl/SegmentedControl.css",
    "testFile": "src/client/components/SegmentedControl/SegmentedControl.test.ts"
  },
{
    "id": "slider",
    "name": "Slider",
    "desc": "范围滑块，支持 min/max/step/label",
    "gotchas": ["浏览器表单状态恢复（刷新/后退）覆盖受控 value——autocomplete=off + 内部 0-100 归一化刻度（2000 slider 刷新跳动事故）", "拖拽中气泡位置冻结——usePopup 锚点恒定需 popup.refresh() 跟随 thumb"],
    "sourceFile": "src/client/components/Slider/Slider.ts",
    "cssFile": "src/client/components/Slider/Slider.css",
    "testFile": "src/client/components/Slider/Slider.test.ts"
  },
{
    "id": "form",
    "name": "Form",
    "desc": "内置验证规则：required/pattern/minLength/自定义",
    "gotchas": ["三层一致（§6.3）：条件渲染 false 是空洞占位——{cond && <Alert/>} 不滤除不塌缩（提交按钮消失事故）", "受控纪律：受控 value 必须配 onChange——缺回调静默不可点"],
    "sourceFile": "src/client/components/Form/Form.ts",
    "cssFile": "src/client/components/Form/Form.css",
    "testFile": "src/client/components/Form/Form.test.ts"
  },
{
    "id": "field",
    "name": "Field",
    "desc": "label+error+hint 容器",
    "sourceFile": "src/client/components/Field/Field.ts",
    "cssFile": "src/client/components/Field/Field.css",
    "testFile": "src/client/components/Field/Field.test.ts"
  },
{
    "id": "relationgraph",
    "name": "RelationGraph",
    "desc": "关系图谱——环形/网格布局 + 类型着色 + 选中交互（人物/组织/网络）",
    "sourceFile": "src/client/components/RelationGraph/RelationGraph.ts",
    "cssFile": "src/client/components/RelationGraph/RelationGraph.css",
    "testFile": "src/client/components/RelationGraph/RelationGraph.test.ts"
  },
{
    "id": "appshell",
    "name": "AppShell",
    "desc": "应用壳——品牌 + 分组导航 + 用户区 + 主内容（受控——父层驱动）",
    "sourceFile": "src/client/components/AppShell/AppShell.ts",
    "cssFile": "src/client/components/AppShell/AppShell.css",
    "testFile": "src/client/components/AppShell/AppShell.test.ts"
  },
{
    "id": "filetree",
    "name": "FileTree",
    "desc": "文件树浏览器——面包屑 + 列表/编辑态 + 上传（受控——数据源无关）",
    "sourceFile": "src/client/components/FileTree/FileTree.ts",
    "cssFile": "src/client/components/FileTree/FileTree.css",
    "testFile": "src/client/components/FileTree/FileTree.test.ts"
  },
{
    "id": "fileupload",
    "name": "FileUpload",
    "desc": "文件上传，拖拽区 + 文件列表 + accept/maxSize",
    "sourceFile": "src/client/components/FileUpload/FileUpload.ts",
    "cssFile": "src/client/components/FileUpload/FileUpload.css",
    "testFile": "src/client/components/FileUpload/FileUpload.test.ts"
  },
{
    "id": "searchinput",
    "name": "SearchInput",
    "desc": "搜索输入框，带清除按钮",
    "sourceFile": "src/client/components/SearchInput/SearchInput.ts",
    "cssFile": "src/client/components/SearchInput/SearchInput.css",
    "testFile": "src/client/components/SearchInput/SearchInput.test.ts"
  },
{
    "id": "progressbar",
    "name": "ProgressBar",
    "desc": "进度条，支持 label/showValue",
    "sourceFile": "src/client/components/ProgressBar/ProgressBar.ts",
    "cssFile": "src/client/components/ProgressBar/ProgressBar.css",
    "testFile": "src/client/components/ProgressBar/ProgressBar.test.ts"
  },
{
    "id": "inputnumber",
    "name": "InputNumber",
    "desc": "数字输入：min/max/step + 增减按钮 + precision",
    "sourceFile": "src/client/components/InputNumber/InputNumber.ts",
    "cssFile": "src/client/components/InputNumber/InputNumber.css",
    "testFile": "src/client/components/InputNumber/InputNumber.test.ts"
  },
{
    "id": "passwordinput",
    "name": "PasswordInput",
    "desc": "密码输入：眼睛按钮切换可见性",
    "sourceFile": "src/client/components/PasswordInput/PasswordInput.ts",
    "cssFile": "src/client/components/PasswordInput/PasswordInput.css",
    "testFile": "src/client/components/PasswordInput/PasswordInput.test.ts"
  },
{
    "id": "tagsinput",
    "name": "TagsInput",
    "desc": "标签输入：回车/逗号添加 + 中文输入法感知",
    "sourceFile": "src/client/components/TagsInput/TagsInput.ts",
    "cssFile": "src/client/components/TagsInput/TagsInput.css",
    "testFile": "src/client/components/TagsInput/TagsInput.test.ts"
  },
{
    "id": "table",
    "name": "Table",
    "desc": "可排序 + 自定义 render + 空状态",
    "gotchas": ["固定列必须显式 width（缺省 140 估算 + console.warn——sticky 偏移累计依赖）", "数组空洞：children 里 {cond && <X/>} 是占位——不得误删下一个兄弟（提交按钮消失事故同源）", "行内编辑（editable 列）必须配 onCellEdit（受控纪律）"],
    "sourceFile": "src/client/components/Table/Table.ts",
    "cssFile": "src/client/components/Table/Table.css",
    "testFile": "src/client/components/Table/Table.test.ts"
  },
{
    "id": "card",
    "name": "Card",
    "desc": "容器，支持 default/outlined/clickable",
    "sourceFile": "src/client/components/Card/Card.ts",
    "cssFile": "src/client/components/Card/Card.css",
    "testFile": "src/client/components/Card/Card.test.ts"
  },
{
    "id": "badge",
    "name": "Badge",
    "desc": "状态标签 + 圆点，6 种 variant",
    "sourceFile": "src/client/components/Badge/Badge.ts",
    "cssFile": "src/client/components/Badge/Badge.css",
    "testFile": "src/client/components/Badge/Badge.test.ts"
  },
{
    "id": "tag",
    "name": "Tag",
    "desc": "标签，支持 closable/onClose",
    "sourceFile": "src/client/components/Tag/Tag.ts",
    "cssFile": "src/client/components/Tag/Tag.css",
    "testFile": "src/client/components/Tag/Tag.test.ts"
  },
{
    "id": "avatar",
    "name": "Avatar",
    "desc": "头像（首字母/图片），3 种 size",
    "sourceFile": "src/client/components/Avatar/Avatar.ts",
    "cssFile": "src/client/components/Avatar/Avatar.css",
    "testFile": "src/client/components/Avatar/Avatar.test.ts"
  },
{
    "id": "img",
    "name": "Img",
    "desc": "图片 \\<img\\> 组件：fallback / lazy / preview 点击放大",
    "sourceFile": "src/client/components/Img/Img.ts",
    "cssFile": "src/client/components/Img/Img.css",
    "testFile": "src/client/components/Img/Img.test.ts"
  },
{
    "id": "inview",
    "name": "InView",
    "desc": "进入视窗后懒加载内容，支持 IntersectionObserver",
    "sourceFile": "src/client/components/InView/InView.ts",
    "cssFile": "src/client/components/InView/InView.css",
    "testFile": "src/client/components/InView/InView.test.ts"
  },
{
    "id": "timeline",
    "name": "Timeline",
    "desc": "时间线：节点状态色 + 时间 + 内容（执行日志/审批历史）",
    "sourceFile": "src/client/components/Timeline/Timeline.ts",
    "cssFile": "src/client/components/Timeline/Timeline.css",
    "testFile": "src/client/components/Timeline/Timeline.test.ts"
  },
{
    "id": "descriptions",
    "name": "Descriptions",
    "desc": "描述列表：label/value 栅格 + bordered + span（详情页）",
    "sourceFile": "src/client/components/Descriptions/Descriptions.ts",
    "cssFile": "src/client/components/Descriptions/Descriptions.css",
    "testFile": "src/client/components/Descriptions/Descriptions.test.ts"
  },
{
    "id": "avatargroup",
    "name": "AvatarGroup",
    "desc": "头像组：堆叠 + max 溢出 +N",
    "sourceFile": "src/client/components/AvatarGroup/AvatarGroup.ts",
    "cssFile": "src/client/components/AvatarGroup/AvatarGroup.css",
    "testFile": "src/client/components/AvatarGroup/AvatarGroup.test.ts"
  },
{
    "id": "markdown",
    "name": "Markdown",
    "desc": "AI 回复渲染：安全子集 parser + 代码块 + 链接白名单",
    "sourceFile": "src/client/components/Markdown/Markdown.ts",
    "cssFile": "src/client/components/Markdown/Markdown.css",
    "testFile": "src/client/components/Markdown/Markdown.test.ts"
  },
{
    "id": "codeblock",
    "name": "CodeBlock",
    "desc": "代码块：语言标签 + 复制按钮 + 横向滚动",
    "sourceFile": "src/client/components/CodeBlock/CodeBlock.ts",
    "cssFile": "src/client/components/CodeBlock/CodeBlock.css",
    "testFile": "src/client/components/CodeBlock/CodeBlock.test.ts"
  },
{
    "id": "logviewer",
    "name": "LogViewer",
    "desc": "日志流：ANSI 着色 + 虚拟滚动 + 自动跟随 + 复制",
    "sourceFile": "src/client/components/LogViewer/LogViewer.ts",
    "cssFile": "src/client/components/LogViewer/LogViewer.css",
    "testFile": "src/client/components/LogViewer/LogViewer.test.ts"
  },
{
    "id": "jsonviewer",
    "name": "JSONViewer",
    "desc": "结构化 JSON：递归折叠 + 类型色 + 路径复制 + 懒展开",
    "sourceFile": "src/client/components/JSONViewer/JSONViewer.ts",
    "cssFile": "src/client/components/JSONViewer/JSONViewer.css",
    "testFile": "src/client/components/JSONViewer/JSONViewer.test.ts"
  },
{
    "id": "diffview",
    "name": "DiffView",
    "desc": "代码 diff：LCS 行级对比 + 未变块折叠 + 三态着色",
    "sourceFile": "src/client/components/DiffView/DiffView.ts",
    "cssFile": "src/client/components/DiffView/DiffView.css",
    "testFile": "src/client/components/DiffView/DiffView.test.ts"
  },
{
    "id": "sparkline",
    "name": "Sparkline",
    "desc": "迷你趋势线：SVG 自绘 + 归一化 + 平滑曲线 + 面积填充",
    "sourceFile": "src/client/components/Sparkline/Sparkline.ts",
    "cssFile": "src/client/components/Sparkline/Sparkline.css",
    "testFile": "src/client/components/Sparkline/Sparkline.test.ts"
  },
{
    "id": "tour",
    "name": "Tour",
    "desc": "新手引导：步骤气泡 + 目标高亮 + 遮罩 + 键盘 Escape",
    "sourceFile": "src/client/components/Tour/Tour.ts",
    "cssFile": "src/client/components/Tour/Tour.css",
    "testFile": "src/client/components/Tour/Tour.test.ts"
  },
{
    "id": "kanban",
    "name": "Kanban",
    "desc": "看板：原生 DnD 拖拽 + 跨列/重排 + 悬停高亮",
    "gotchas": ["enumerated 属性（§6.2）：draggable 空字符串解析为 false——必须显式 setAttribute true/false（拖动变文本选中事故）"],
    "sourceFile": "src/client/components/Kanban/Kanban.ts",
    "cssFile": "src/client/components/Kanban/Kanban.css",
    "testFile": "src/client/components/Kanban/Kanban.test.ts"
  },
{
    "id": "pipeline",
    "name": "Pipeline",
    "desc": "Agent 工作流 DAG：分层布局 + 贝塞尔连线 + 状态语义色 + 环检测",
    "sourceFile": "src/client/components/Pipeline/Pipeline.ts",
    "cssFile": "src/client/components/Pipeline/Pipeline.css",
    "testFile": "src/client/components/Pipeline/Pipeline.test.ts"
  },
{
    "id": "treeselect",
    "name": "TreeSelect",
    "desc": "树形选择：单选/多选（父子联动）+ 选中 label 回显 + 受控纪律",
    "gotchas": ["弹窗纪律（§5.4）：曾遗漏 portal——absolute 在父容器 overflow/transform 下裁剪/错位——统一 usePopup", "选项量小场景搜索过滤已裁剪（docs/client.md#能力裁剪登记 永久裁剪）"],
    "sourceFile": "src/client/components/TreeSelect/TreeSelect.ts",
    "cssFile": "src/client/components/TreeSelect/TreeSelect.css",
    "testFile": "src/client/components/TreeSelect/TreeSelect.test.ts"
  },
{
    "id": "layout",
    "name": "Layout",
    "desc": "布局外壳：Sider 折叠 + Header/Content/Footer 骨架（antd Layout / shadcn Sidebar 等价）",
    "sourceFile": "src/client/components/Layout/Layout.ts",
    "cssFile": "src/client/components/Layout/Layout.css",
    "testFile": "src/client/components/Layout/Layout.test.ts"
  },
{
    "id": "popconfirm",
    "name": "Popconfirm",
    "desc": "气泡确认：危险操作防误触 + 复用 usePopup 基座",
    "gotchas": ["气泡内表单/自定义箭头已裁剪（Popover 基座 + 定位全套复用）"],
    "sourceFile": "src/client/components/Popconfirm/Popconfirm.ts",
    "cssFile": "src/client/components/Popconfirm/Popconfirm.css",
    "testFile": "src/client/components/Popconfirm/Popconfirm.test.ts"
  },
{
    "id": "autocomplete",
    "name": "AutoComplete",
    "desc": "输入联想：自由输入 + 过滤下拉 + 键盘流 + 选中回填",
    "gotchas": ["受控输入纪律（§5.3）：受控 input 焦点丢失事故——输入期间 value 走内部 keyword（useControlledInput），不依赖受控 value 回流", "IME composition：中文输入组合期间受控 value 重置打断——isComposing 门控"],
    "sourceFile": "src/client/components/AutoComplete/AutoComplete.ts",
    "cssFile": "src/client/components/AutoComplete/AutoComplete.css",
    "testFile": "src/client/components/AutoComplete/AutoComplete.test.ts"
  },
{
    "id": "link",
    "name": "Link",
    "desc": "文字链接：语义色/下划线/disabled/新窗口",
    "sourceFile": "src/client/components/Link/Link.ts",
    "cssFile": "src/client/components/Link/Link.css",
    "testFile": "src/client/components/Link/Link.test.ts"
  },
{
    "id": "floatbutton",
    "name": "FloatButton",
    "desc": "悬浮按钮组：展开状态机 + badge",
    "sourceFile": "src/client/components/FloatButton/FloatButton.ts",
    "cssFile": "src/client/components/FloatButton/FloatButton.css",
    "testFile": "src/client/components/FloatButton/FloatButton.test.ts"
  },
{
    "id": "navmenu",
    "name": "NavMenu",
    "desc": "顶部导航：多级 hover 弹出 + 键盘（shadcn NavigationMenu）",
    "sourceFile": "src/client/components/NavMenu/NavMenu.ts",
    "cssFile": "src/client/components/NavMenu/NavMenu.css",
    "testFile": "src/client/components/NavMenu/NavMenu.test.ts"
  },
{
    "id": "space",
    "name": "Space",
    "desc": "间距容器：size/direction/wrap + split 分隔符",
    "sourceFile": "src/client/components/Space/Space.ts",
    "cssFile": "src/client/components/Space/Space.css",
    "testFile": "src/client/components/Space/Space.test.ts"
  },
{
    "id": "grid",
    "name": "Grid",
    "desc": "24 栅格 + gutter + flex 容器模式（Row/Col/Flex 等价）",
    "sourceFile": "src/client/components/Grid/Grid.ts",
    "cssFile": "src/client/components/Grid/Grid.css",
    "testFile": "src/client/components/Grid/Grid.test.ts"
  },
{
    "id": "scrollbar",
    "name": "Scrollbar",
    "desc": "自定义滚动容器：webkit 样式 + hover 显示",
    "sourceFile": "src/client/components/Scrollbar/Scrollbar.ts",
    "cssFile": "src/client/components/Scrollbar/Scrollbar.css",
    "testFile": "src/client/components/Scrollbar/Scrollbar.test.ts"
  },
{
    "id": "alertgroup",
    "name": "AlertGroup",
    "desc": "通知合并组：≥3 条折叠为 +N，点击展开",
    "sourceFile": "src/client/components/AlertGroup/AlertGroup.ts",
    "cssFile": "src/client/components/AlertGroup/AlertGroup.css",
    "testFile": "src/client/components/AlertGroup/AlertGroup.test.ts"
  },
{
    "id": "messagebubble",
    "name": "MessageBubble",
    "desc": "消息气泡：user/assistant + streaming/error 状态 + actions",
    "family": "ai-chat",
    "sourceFile": "src/client/components/MessageBubble/MessageBubble.ts",
    "cssFile": "src/client/components/MessageBubble/MessageBubble.css",
    "testFile": "src/client/components/MessageBubble/MessageBubble.test.ts"
  },
{
    "id": "highlight",
    "name": "Highlight",
    "desc": "搜索词高亮：分词渲染 mark，大小写不敏感",
    "sourceFile": "src/client/components/Highlight/Highlight.ts",
    "cssFile": "src/client/components/Highlight/Highlight.css",
    "testFile": "src/client/components/Highlight/Highlight.test.ts"
  },
{
    "id": "list",
    "name": "List",
    "desc": "通用列表：renderItem + divided + header/footer/empty",
    "sourceFile": "src/client/components/List/List.ts",
    "cssFile": "src/client/components/List/List.css",
    "testFile": "src/client/components/List/List.test.ts"
  },
{
    "id": "result",
    "name": "Result",
    "desc": "结果页：success/error/warning/info + extra 操作区",
    "sourceFile": "src/client/components/Result/Result.ts",
    "cssFile": "src/client/components/Result/Result.css",
    "testFile": "src/client/components/Result/Result.test.ts"
  },
{
    "id": "confirm",
    "name": "Confirm",
    "desc": "确认对话框，Promise 化 await 调用",
    "sourceFile": "src/client/components/Confirm/Confirm.ts",
    "testFile": "src/client/components/Confirm/Confirm.test.ts"
  },
{
    "id": "statcard",
    "name": "StatCard",
    "desc": "KPI 指标卡，支持 trend/icon",
    "sourceFile": "src/client/components/StatCard/StatCard.ts",
    "cssFile": "src/client/components/StatCard/StatCard.css",
    "testFile": "src/client/components/StatCard/StatCard.test.ts"
  },
{
    "id": "chart",
    "name": "Chart",
    "desc": "SVG 图表：line/bar/pie/radar/gauge/scatter——零依赖自绘",
    "sourceFile": "src/client/components/Chart/Chart.ts",
    "cssFile": "src/client/components/Chart/Chart.css",
    "testFile": "src/client/components/Chart/Chart.test.ts"
  },
{
    "id": "editor",
    "name": "Editor",
    "desc": "富文本编辑器，contentEditable + toolbar，零依赖",
    "sourceFile": "src/client/components/Editor/Editor.ts",
    "cssFile": "src/client/components/Editor/Editor.css",
    "testFile": "src/client/components/Editor/Editor.test.ts"
  },
{
    "id": "filepreview",
    "name": "FilePreview",
    "desc": "文件预览（md/html/pdf/office）——基于事件流，可编辑",
    "family": "file-preview",
    "sourceFile": "src/client/components/FilePreview/FilePreview.ts",
    "cssFile": "src/client/components/FilePreview/FilePreview.css",
    "testFile": "src/client/components/FilePreview/FilePreview.test.ts"
  },
{
    "id": "themeswitch",
    "name": "ThemeSwitch",
    "desc": "主题切换：auto/light/dark，localStorage 持久化",
    "sourceFile": "src/client/components/ThemeSwitch/ThemeSwitch.ts",
    "cssFile": "src/client/components/ThemeSwitch/ThemeSwitch.css",
    "testFile": "src/client/components/ThemeSwitch/ThemeSwitch.test.ts"
  },
{
    "id": "datepicker",
    "name": "DatePicker",
    "desc": "日期选择器，四种模式：date/datetime/time/range",
    "gotchas": ["受控纪律：受控 value/month 必须配回调——缺回调静默不可点"],
    "sourceFile": "src/client/components/DatePicker/DatePicker.ts",
    "cssFile": "src/client/components/DatePicker/DatePicker.css",
    "testFile": "src/client/components/DatePicker/DatePicker.test.ts"
  },
{
    "id": "modal",
    "name": "Modal",
    "desc": "自定义宽度 + closable 控制关闭按钮",
    "gotchas": ["退场动画：exit 类必须挂载（animationend 驱动卸载）——reduced-motion 下动画降为 0.01ms 等效瞬时", "会话级模态四件套：presence/trapFocus/lockScroll 由 usePopup 统一提供"],
    "sourceFile": "src/client/components/Modal/Modal.ts",
    "cssFile": "src/client/components/Modal/Modal.css",
    "testFile": "src/client/components/Modal/Modal.test.ts"
  },
{
    "id": "drawer",
    "name": "Drawer",
    "desc": "侧边面板，左右滑入 + ESC 关闭",
    "gotchas": ["退场动画：--enter/--exit 类必须成对（audit 强制）——只定义不挂是死代码（CS-01）"],
    "sourceFile": "src/client/components/Drawer/Drawer.ts",
    "cssFile": "src/client/components/Drawer/Drawer.css",
    "testFile": "src/client/components/Drawer/Drawer.test.ts"
  },
{
    "id": "popover",
    "name": "Popover",
    "desc": "通用弹出层，click/hover 触发，4 方向",
    "gotchas": ["portal 槽豁免（同 HoverCard）", "富内容自动判定已裁剪——HoverCard 补富内容（docs/client.md#能力裁剪登记）"],
    "sourceFile": "src/client/components/Popover/Popover.ts",
    "cssFile": "src/client/components/Popover/Popover.css",
    "testFile": "src/client/components/Popover/Popover.test.ts"
  },
{
    "id": "tooltip",
    "name": "Tooltip",
    "desc": "hover 浮动提示，4 方向",
    "gotchas": ["portal 槽豁免（同 HoverCard）——浮层插槽非业务列表"],
    "sourceFile": "src/client/components/Tooltip/Tooltip.ts",
    "cssFile": "src/client/components/Tooltip/Tooltip.css",
    "testFile": "src/client/components/Tooltip/Tooltip.test.ts"
  },
{
    "id": "toast",
    "name": "Toast",
    "desc": "5 种位置 + 自动消失 + 数量限制",
    "sourceFile": "src/client/components/Toast/Toast.ts",
    "cssFile": "src/client/components/Toast/Toast.css",
    "testFile": "src/client/components/Toast/Toast.test.ts"
  },
{
    "id": "alert",
    "name": "Alert",
    "desc": "信息提示条，4 种 variant + closable",
    "sourceFile": "src/client/components/Alert/Alert.ts",
    "cssFile": "src/client/components/Alert/Alert.css",
    "testFile": "src/client/components/Alert/Alert.test.ts"
  },
{
    "id": "loading",
    "name": "Loading",
    "desc": "加载状态，支持自定义文字",
    "sourceFile": "src/client/components/Loading/Loading.ts",
    "cssFile": "src/client/components/Loading/Loading.css",
    "testFile": "src/client/components/Loading/Loading.test.ts"
  },
{
    "id": "skeleton",
    "name": "Skeleton",
    "desc": "text/circle/rect/image/avatar/table 六种变体",
    "sourceFile": "src/client/components/Skeleton/Skeleton.ts",
    "cssFile": "src/client/components/Skeleton/Skeleton.css",
    "testFile": "src/client/components/Skeleton/Skeleton.test.ts"
  },
{
    "id": "emptystate",
    "name": "EmptyState",
    "desc": "空状态占位，支持 icon/text/hint/action",
    "sourceFile": "src/client/components/EmptyState/EmptyState.ts",
    "cssFile": "src/client/components/EmptyState/EmptyState.css",
    "testFile": "src/client/components/EmptyState/EmptyState.test.ts"
  },
{
    "id": "breadcrumb",
    "name": "Breadcrumb",
    "desc": "面包屑导航，支持 aria-current",
    "sourceFile": "src/client/components/Breadcrumb/Breadcrumb.ts",
    "cssFile": "src/client/components/Breadcrumb/Breadcrumb.css",
    "testFile": "src/client/components/Breadcrumb/Breadcrumb.test.ts"
  },
{
    "id": "menu",
    "name": "Menu",
    "desc": "侧栏导航：分组 + 图标 + 选中态 + 方向键",
    "sourceFile": "src/client/components/Menu/Menu.ts",
    "cssFile": "src/client/components/Menu/Menu.css",
    "testFile": "src/client/components/Menu/Menu.test.ts"
  },
{
    "id": "tabs",
    "name": "Tabs",
    "desc": "标签页切换，支持 active/onChange",
    "gotchas": ["混合数组稳定 key：tabList+addBtn+ink 全 keyed——无 key 项退 unkeyed 位置配对（新增 tab 错位事故）", "closable 必须配 onClose / addable 必须配 onAdd（受控纪律——console.warn）"],
    "sourceFile": "src/client/components/Tabs/Tabs.ts",
    "cssFile": "src/client/components/Tabs/Tabs.css",
    "testFile": "src/client/components/Tabs/Tabs.test.ts"
  },
{
    "id": "dropdown",
    "name": "Dropdown",
    "desc": "下拉菜单，支持 danger variant",
    "gotchas": ["受控纪律：受控 open 必须配 onOpenChange——缺回调静默不可点", "命令式弹窗：浮层经 ctx.ui.openPopup（唯一形态——toast 心智——内核自管理生命周期）"],
    "sourceFile": "src/client/components/Dropdown/Dropdown.ts",
    "cssFile": "src/client/components/Dropdown/Dropdown.css",
    "testFile": "src/client/components/Dropdown/Dropdown.test.ts"
  },
{
    "id": "pagination",
    "name": "Pagination",
    "desc": "分页器，自动计算页码范围",
    "sourceFile": "src/client/components/Pagination/Pagination.ts",
    "cssFile": "src/client/components/Pagination/Pagination.css",
    "testFile": "src/client/components/Pagination/Pagination.test.ts"
  },
{
    "id": "steps",
    "name": "Steps",
    "desc": "分步指示器，支持 active/current",
    "sourceFile": "src/client/components/Steps/Steps.ts",
    "cssFile": "src/client/components/Steps/Steps.css",
    "testFile": "src/client/components/Steps/Steps.test.ts"
  },
{
    "id": "accordion",
    "name": "Accordion",
    "desc": "折叠面板，支持多个 items",
    "sourceFile": "src/client/components/Accordion/Accordion.ts",
    "cssFile": "src/client/components/Accordion/Accordion.css",
    "testFile": "src/client/components/Accordion/Accordion.test.ts"
  },
{
    "id": "aichat",
    "name": "AiChat",
    "desc": "useChat + 标准对话界面：流式 token / 工具卡 / 审批卡 / 自动滚动，协议对页面透明",
    "family": "ai-chat",
    "sourceFile": "src/client/components/AiChat/AiChat.ts",
    "cssFile": "src/client/components/AiChat/AiChat.css",
    "testFile": "src/client/components/AiChat/AiChat.test.ts"
  },
{
    "id": "chatinput",
    "name": "ChatInput",
    "desc": "独立聊天输入条（AiChat 抽取）：单行/多行 + streaming 停止 + IME 安全——不自带聊天逻辑",
    "family": "ai-chat",
    "sourceFile": "src/client/components/ChatInput/ChatInput.ts",
    "cssFile": "src/client/components/ChatInput/ChatInput.css",
    "testFile": "src/client/components/ChatInput/ChatInput.test.ts"
  },
{
    "id": "authpage",
    "name": "AuthPage",
    "desc": "认证页骨架：居中卡片 + logo + 表单插槽 + 错误条 + 提交 loading（登录/注册复用）",
    "sourceFile": "src/client/components/AuthPage/AuthPage.ts",
    "testFile": "src/client/components/AuthPage/AuthPage.test.ts"
  },
{
    "id": "toolcallcard",
    "name": "ToolCallCard",
    "desc": "工具调用卡片：running / ok / error 状态机（call/progress/result 三字段驱动）",
    "family": "ai-chat",
    "sourceFile": "src/client/components/ToolCallCard/ToolCallCard.ts",
    "cssFile": "src/client/components/ToolCallCard/ToolCallCard.css",
    "testFile": "src/client/components/ToolCallCard/ToolCallCard.test.ts"
  },
{
    "id": "jsonschemaform",
    "name": "JsonSchemaForm",
    "desc": "JSON Schema → 参数输入表单：类型映射 + 必填/范围校验 + 嵌套/数组（AI 工具参数输入面）",
    "sourceFile": "src/client/components/JsonSchemaForm/JsonSchemaForm.ts",
    "cssFile": "src/client/components/JsonSchemaForm/JsonSchemaForm.css",
    "testFile": "src/client/components/JsonSchemaForm/JsonSchemaForm.test.ts"
  },
{
    "id": "reasoningblock",
    "name": "ReasoningBlock",
    "desc": "CoT 推理折叠展示：aria-expanded + 键盘可达 + 流式脉冲（thinking 模式 reasoning_content）",
    "family": "ai-chat",
    "sourceFile": "src/client/components/ReasoningBlock/ReasoningBlock.ts",
    "cssFile": "src/client/components/ReasoningBlock/ReasoningBlock.css",
    "testFile": "src/client/components/ReasoningBlock/ReasoningBlock.test.ts"
  },
{
    "id": "citationcard",
    "name": "CitationCard",
    "desc": "RAG 引用来源：折叠「引用 N 条」+ 条目列表（序号/标题/来源/片段/链接）+ 溢出 +N",
    "family": "ai-chat",
    "sourceFile": "src/client/components/CitationCard/CitationCard.ts",
    "cssFile": "src/client/components/CitationCard/CitationCard.css",
    "testFile": "src/client/components/CitationCard/CitationCard.test.ts"
  },
{
    "id": "sessionlist",
    "name": "SessionList",
    "desc": "会话管理列表：分组（今天/昨天/更早）+ 搜索 + 选中 + 重命名/删除/新建 + 键盘导航",
    "family": "ai-chat",
    "sourceFile": "src/client/components/SessionList/SessionList.ts",
    "cssFile": "src/client/components/SessionList/SessionList.css",
    "testFile": "src/client/components/SessionList/SessionList.test.ts"
  },
{
    "id": "approvalcard",
    "name": "ApprovalCard",
    "desc": "HITL 审批卡片：pending 可批/拒 + 修改参数（JsonSchemaForm）· approved/rejected/timeout 终态",
    "family": "ai-chat",
    "sourceFile": "src/client/components/ApprovalCard/ApprovalCard.ts",
    "cssFile": "src/client/components/ApprovalCard/ApprovalCard.css",
    "testFile": "src/client/components/ApprovalCard/ApprovalCard.test.ts"
  },
{
    "id": "pageheader",
    "name": "PageHeader",
    "desc": "页面标题栏，支持 sub + 右侧操作区 + display 大标题",
    "sourceFile": "src/client/components/PageHeader/PageHeader.ts",
    "cssFile": "src/client/components/PageHeader/PageHeader.css",
    "testFile": "src/client/components/PageHeader/PageHeader.test.ts"
  },
{
    "id": "icon",
    "name": "Icon",
    "desc": "stroke SVG 图标集，currentColor 着色，随字号缩放",
    "sourceFile": "src/client/components/Icon/Icon.ts",
    "cssFile": "src/client/components/Icon/Icon.css",
    "testFile": "src/client/components/Icon/Icon.test.ts"
  },
{
    "id": "divider",
    "name": "Divider",
    "desc": "分割线，支持 horizontal/vertical/带文字",
    "sourceFile": "src/client/components/Divider/Divider.ts",
    "cssFile": "src/client/components/Divider/Divider.css",
    "testFile": "src/client/components/Divider/Divider.test.ts"
  },
{
    "id": "rate",
    "name": "Rate",
    "desc": "评分：键盘方向键 / allowClear / readOnly，新增 star 图标",
    "gotchas": ["小尺寸 button 固定 min/max-height（§5.6）：星 16x36 竖条事故"],
    "sourceFile": "src/client/components/Rate/Rate.ts",
    "cssFile": "src/client/components/Rate/Rate.css",
    "testFile": "src/client/components/Rate/Rate.test.ts"
  },
{
    "id": "typography",
    "name": "Typography",
    "desc": "Title/Text/Paragraph：语义标签 + 语义色 -text 变体 + mark/code/删除线",
    "sourceFile": "src/client/components/Typography/Typography.ts",
    "cssFile": "src/client/components/Typography/Typography.css",
    "testFile": "src/client/components/Typography/Typography.test.ts"
  },
{
    "id": "label",
    "name": "Label",
    "desc": "独立标签（required 星号）+ 宽高比容器（内容填满）",
    "sourceFile": "src/client/components/Label/Label.ts",
    "cssFile": "src/client/components/Label/Label.css",
    "testFile": "src/client/components/Label/Label.test.ts"
  },
{
    "id": "aspectratio",
    "name": "AspectRatio",
    "desc": "独立标签（required 星号）+ 宽高比容器（内容填满）",
    "sourceFile": "src/client/components/AspectRatio/AspectRatio.ts",
    "cssFile": "src/client/components/AspectRatio/AspectRatio.css",
    "testFile": "src/client/components/AspectRatio/AspectRatio.test.ts"
  },
{
    "id": "checkboxgroup",
    "name": "CheckboxGroup",
    "desc": "复选框组：数组受控 + 栅格列数（antd Checkbox.Group）",
    "sourceFile": "src/client/components/CheckboxGroup/CheckboxGroup.ts",
    "cssFile": "src/client/components/CheckboxGroup/CheckboxGroup.css",
    "testFile": "src/client/components/CheckboxGroup/CheckboxGroup.test.ts"
  },
{
    "id": "pininput",
    "name": "PinInput",
    "desc": "验证码输入：自动聚焦/粘贴分派/Backspace 回退（shadcn InputOTP）",
    "sourceFile": "src/client/components/PinInput/PinInput.ts",
    "cssFile": "src/client/components/PinInput/PinInput.css",
    "testFile": "src/client/components/PinInput/PinInput.test.ts"
  },
{
    "id": "copybutton",
    "name": "CopyButton",
    "desc": "复制按钮：clipboard + execCommand 降级 + 成功状态机",
    "sourceFile": "src/client/components/CopyButton/CopyButton.ts",
    "cssFile": "src/client/components/CopyButton/CopyButton.css",
    "testFile": "src/client/components/CopyButton/CopyButton.test.ts"
  },
{
    "id": "colorpicker",
    "name": "ColorPicker",
    "desc": "颜色选择：预设色板 + hex 输入（Popover 弹层）",
    "sourceFile": "src/client/components/ColorPicker/ColorPicker.ts",
    "cssFile": "src/client/components/ColorPicker/ColorPicker.css",
    "testFile": "src/client/components/ColorPicker/ColorPicker.test.ts"
  },
{
    "id": "hovercard",
    "name": "HoverCard",
    "desc": "悬停富内容卡：openDelay 延迟 + 任意 VNode（shadcn）",
    "gotchas": ["portal 槽豁免：浮层插槽打开/关闭不触发 A 级动态数组检测（框架管理切换槽）"],
    "sourceFile": "src/client/components/HoverCard/HoverCard.ts",
    "cssFile": "src/client/components/HoverCard/HoverCard.css",
    "testFile": "src/client/components/HoverCard/HoverCard.test.ts"
  },
{
    "id": "notification",
    "name": "Notification",
    "desc": "队列式通知：notification.success/error/warning 命令式（antd 对齐）",
    "sourceFile": "src/client/components/Notification/Notification.ts",
    "cssFile": "src/client/components/Notification/Notification.css",
    "testFile": "src/client/components/Notification/Notification.test.ts"
  },
{
    "id": "backtop",
    "name": "BackTop",
    "desc": "回到顶部（滚动超 400px 显示）+ 固定导航（距顶 80px 钉住）",
    "sourceFile": "src/client/components/BackTop/BackTop.ts",
    "cssFile": "src/client/components/BackTop/BackTop.css",
    "testFile": "src/client/components/BackTop/BackTop.test.ts"
  },
{
    "id": "affix",
    "name": "Affix",
    "desc": "回到顶部（滚动超 400px 显示）+ 固定导航（距顶 80px 钉住）",
    "sourceFile": "src/client/components/Affix/Affix.ts",
    "cssFile": "src/client/components/Affix/Affix.css",
    "testFile": "src/client/components/Affix/Affix.test.ts"
  },
{
    "id": "anchor",
    "name": "Anchor",
    "desc": "锚点导航：滚动高亮跟随 + 点击平滑滚动",
    "sourceFile": "src/client/components/Anchor/Anchor.ts",
    "cssFile": "src/client/components/Anchor/Anchor.css",
    "testFile": "src/client/components/Anchor/Anchor.test.ts"
  },
{
    "id": "contextmenu",
    "name": "ContextMenu",
    "desc": "右键菜单：光标定位 + 方向键 + danger 变体（shadcn）",
    "gotchas": ["portal 槽豁免；右键 + 触屏长按双通道"],
    "sourceFile": "src/client/components/ContextMenu/ContextMenu.ts",
    "cssFile": "src/client/components/ContextMenu/ContextMenu.css",
    "testFile": "src/client/components/ContextMenu/ContextMenu.test.ts"
  },
{
    "id": "mentions",
    "name": "Mentions",
    "desc": "@提及：composition 抑制 + 过滤插入（antd Mentions）",
    "sourceFile": "src/client/components/Mentions/Mentions.ts",
    "cssFile": "src/client/components/Mentions/Mentions.css",
    "testFile": "src/client/components/Mentions/Mentions.test.ts"
  },
{
    "id": "collapse",
    "name": "Collapse",
    "desc": "行内折叠：异步 loading + extra 操作区（区别于 Accordion）",
    "gotchas": ["受控纪律（§5.2）：受控 activeKeys 必须配回调——缺回调静默不可点（console.warn 防护）"],
    "sourceFile": "src/client/components/Collapse/Collapse.ts",
    "cssFile": "src/client/components/Collapse/Collapse.css",
    "testFile": "src/client/components/Collapse/Collapse.test.ts"
  },
{
    "id": "tree",
    "name": "Tree",
    "desc": "树形：递归模型 + 勾选父子联动 + indeterminate（antd/EP Tree）",
    "gotchas": ["受控纪律：selectedKeys/checkedKeys/expandedKeys 必须配回调（缺回调 console.warn）", "小尺寸 button 固定 min/max-height（§5.6）：checkbox 14x36 竖条事故", "虚拟模式（virtual）键盘导航限于可见窗口（VirtualList 无 scrollTo——裁剪登记）"],
    "sourceFile": "src/client/components/Tree/Tree.ts",
    "cssFile": "src/client/components/Tree/Tree.css",
    "testFile": "src/client/components/Tree/Tree.test.ts"
  },
{
    "id": "cascader",
    "name": "Cascader",
    "desc": "级联选择：多列面板逐级推进（antd/EP Cascader）",
    "gotchas": ["受控纪律：受控 value 必须配回调——缺回调静默不可点", "多选（multiple）已裁剪（低频——单选+搜索已够，见 docs/client.md#能力裁剪登记）"],
    "sourceFile": "src/client/components/Cascader/Cascader.ts",
    "cssFile": "src/client/components/Cascader/Cascader.css",
    "testFile": "src/client/components/Cascader/Cascader.test.ts"
  },
{
    "id": "transfer",
    "name": "Transfer",
    "desc": "穿梭框：双列表 + 选中移动（antd/EP Transfer）",
    "sourceFile": "src/client/components/Transfer/Transfer.ts",
    "cssFile": "src/client/components/Transfer/Transfer.css",
    "testFile": "src/client/components/Transfer/Transfer.test.ts"
  },
{
    "id": "command",
    "name": "Command",
    "desc": "命令面板：⌘K 全局快捷键 + 键盘流（shadcn Command）",
    "sourceFile": "src/client/components/Command/Command.ts",
    "cssFile": "src/client/components/Command/Command.css",
    "testFile": "src/client/components/Command/Command.test.ts"
  },
{
    "id": "menubar",
    "name": "Menubar",
    "desc": "水平菜单栏：←→ 切换 + ↓ 展开（shadcn Menubar）",
    "sourceFile": "src/client/components/Menubar/Menubar.ts",
    "cssFile": "src/client/components/Menubar/Menubar.css",
    "testFile": "src/client/components/Menubar/Menubar.test.ts"
  },
{
    "id": "carousel",
    "name": "Carousel",
    "desc": "轮播：箭头/圆点/循环 + 自动播放（三库共识）",
    "gotchas": ["小尺寸 button 固定 min/max-height（§5.6）：圆点 8x45 竖条事故"],
    "sourceFile": "src/client/components/Carousel/Carousel.ts",
    "cssFile": "src/client/components/Carousel/Carousel.css",
    "testFile": "src/client/components/Carousel/Carousel.test.ts"
  },
{
    "id": "resizable",
    "name": "Resizable",
    "desc": "拖拽分割面板：pointer + 键盘方向键 + clamp（shadcn）",
    "sourceFile": "src/client/components/Resizable/Resizable.ts",
    "cssFile": "src/client/components/Resizable/Resizable.css",
    "testFile": "src/client/components/Resizable/Resizable.test.ts"
  },
{
    "id": "calendar",
    "name": "Calendar",
    "desc": "月历：事件点 + 月切换 + 日期选择（antd/EP Calendar）",
    "gotchas": ["受控纪律：受控 month/value 必须配回调——缺回调静默不可点（console.warn 防护）"],
    "sourceFile": "src/client/components/Calendar/Calendar.ts",
    "cssFile": "src/client/components/Calendar/Calendar.css",
    "testFile": "src/client/components/Calendar/Calendar.test.ts"
  },
{
    "id": "watermark",
    "name": "Watermark",
    "desc": "水印：canvas 平铺绘制 + overlay（antd Watermark）",
    "sourceFile": "src/client/components/Watermark/Watermark.ts",
    "cssFile": "src/client/components/Watermark/Watermark.css",
    "testFile": "src/client/components/Watermark/Watermark.test.ts"
  },
{
    "id": "virtuallist",
    "name": "VirtualList",
    "desc": "虚拟列表：spacer + 可见窗口，200 条只渲染 ~12 个 DOM",
    "sourceFile": "src/client/components/VirtualList/VirtualList.ts",
    "cssFile": "src/client/components/VirtualList/VirtualList.css",
    "testFile": "src/client/components/VirtualList/VirtualList.test.ts"
  },
{
    "id": "virtualtable",
    "name": "VirtualTable",
    "desc": "虚拟表格：10k 行固定表头 + 可见窗口渲染 + 排序",
    "sourceFile": "src/client/components/VirtualTable/VirtualTable.ts",
    "cssFile": "src/client/components/VirtualTable/VirtualTable.css",
    "testFile": "src/client/components/VirtualTable/VirtualTable.test.ts"
  },
{
    "id": "infinitescroll",
    "name": "InfiniteScroll",
    "desc": "无限滚动：底部哨兵触底加载 + loading/end 态",
    "sourceFile": "src/client/components/InfiniteScroll/InfiniteScroll.ts",
    "cssFile": "src/client/components/InfiniteScroll/InfiniteScroll.css",
    "testFile": "src/client/components/InfiniteScroll/InfiniteScroll.test.ts"
  },
{
    "id": "qrcode",
    "name": "QRCode",
    "desc": "二维码：自研 QR 编码（Reed-Solomon + 8 掩码）零依赖 SVG",
    "sourceFile": "src/client/components/QRCode/QRCode.ts",
    "testFile": "src/client/components/QRCode/QRCode.test.ts"
  },
{
    "id": "sheetgrid",
    "name": "SheetGrid",
    "desc": "weifuwu/components/SheetGrid — xlsx 网格编辑器（ODES 事件流底座） 设计（）：文档 = fold(事件流)——SheetGrid 的每个",
    "family": "file-preview",
    "sourceFile": "src/client/components/SheetGrid/SheetGrid.ts",
    "cssFile": "src/client/components/SheetGrid/SheetGrid.css",
    "testFile": "src/client/components/SheetGrid/SheetGrid.test.ts"
  },
{
    "id": "slidecanvas",
    "name": "SlideCanvas",
    "desc": "weifuwu/components/SlideCanvas — pptx 画布编辑器（ODES 事件流——阶段 3） 设计（）：文档 = fold(事件流)——每个编辑 =",
    "family": "file-preview",
    "sourceFile": "src/client/components/SlideCanvas/SlideCanvas.ts",
    "cssFile": "src/client/components/SlideCanvas/SlideCanvas.css",
    "testFile": "src/client/components/SlideCanvas/SlideCanvas.test.ts"
  },
{
    "id": "togglegroup",
    "name": "ToggleGroup",
    "desc": "（无 demo 卡片——组件目录存在）",
    "sourceFile": "src/client/components/ToggleGroup/ToggleGroup.ts",
    "cssFile": "src/client/components/ToggleGroup/ToggleGroup.css",
    "testFile": "src/client/components/ToggleGroup/ToggleGroup.test.ts"
  },
{
    "id": "tabbar",
    "name": "TabBar",
    "desc": "底部标签栏——移动端 App 主导航（3-5 tab + icon/badge/受控激活 + safe-area 避让）",
    "sourceFile": "src/client/components/TabBar/TabBar.ts",
    "cssFile": "src/client/components/TabBar/TabBar.css",
    "testFile": "src/client/components/TabBar/TabBar.test.ts"
  },
{
    "id": "actionsheet",
    "name": "ActionSheet",
    "desc": "动作面板——移动端底部滑出（命令列表 + 取消按钮，usePopup 会话级模态）",
    "sourceFile": "src/client/components/ActionSheet/ActionSheet.ts",
    "cssFile": "src/client/components/ActionSheet/ActionSheet.css",
    "testFile": "src/client/components/ActionSheet/ActionSheet.test.ts"
  },
{
    "id": "prompttemplate",
    "name": "PromptTemplate",
    "desc": "提示词模板编辑器——变量 chips 插入 + 实时预览填充（AI 场景痛点）",
    "gotchas": ["textarea value 必须走 property（attribute 只是 defaultValue——DOM value 恒空/光标失效事故，vdom3 渲染器已修）", "受控输入纪律：value 由父控制 + onChange 通知"],
    "sourceFile": "src/client/components/PromptTemplate/PromptTemplate.ts",
    "cssFile": "src/client/components/PromptTemplate/PromptTemplate.css",
    "testFile": "src/client/components/PromptTemplate/PromptTemplate.test.ts"
  },
{
    "id": "navbar",
    "name": "NavBar",
    "desc": "移动端顶栏——left 槽（返回/菜单）+ 标题截断 + right 槽（antd-mobile NavBar 对位）",
    "sourceFile": "src/client/components/NavBar/NavBar.ts",
    "cssFile": "src/client/components/NavBar/NavBar.css",
    "testFile": "src/client/components/NavBar/NavBar.test.ts"
  },
{
    "id": "dropzone",
    "name": "DropZone",
    "desc": "全区域拖放区——整容器拖入文件高亮 + onFiles 回调（现代 IM 标配——Chat 手搓证据）",
    "sourceFile": "src/client/components/DropZone/DropZone.ts",
    "cssFile": "src/client/components/DropZone/DropZone.css",
    "testFile": "src/client/components/DropZone/DropZone.test.ts"
  }
]
