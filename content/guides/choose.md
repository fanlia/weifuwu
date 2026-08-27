# 选型决策树

> 核心原则：**先查框架再动手**——weifuwu 已提供的能力绝不重复造轮子。
> 检查顺序：components → layout 原语 → patterns → apps → capabilities。

## 决策树

```
要做一个界面元素？
├─ 已有组件（Button/Input/Table/Modal/Tabs/Tree…135 个）
│   └─ → content/components/<id>.md 查 API + 纪律，直接使用
├─ 是布局结构（容器/间距/对齐/导航壳/响应式显隐）
│   └─ → content/layout/*.md 用 wf-* 原语（零手写 CSS）
│       ├─ 页面骨架 → wf-app-shell / wf-stack / wf-container
│       ├─ 间距/排版 → wf-gap-* / wf-text-* / wf-padding-* 工具
│       └─ 响应式 → wf-hidden@lg / wf-flex@lg 断点变体
└─ 是完整页面/应用
    ├─ 单页结构（后台壳/仪表盘/落地页/移动端）→ content/patterns/*.md 复制
    ├─ 多页应用（路由 + 状态 + 后端）→ content/apps/*.md 复制模板改
    │   ├─ 任务管理 → todo
    │   ├─ 登录/权限 → auth
    │   ├─ 管理后台 → admin
    │   └─ 应用编排 → multi
    └─ 生产级参考 → apps/agent-platform/（真实产品架构）
```

## 取码（选定后怎么拿源码）

| 选型结果 | 取码路径 |
|---------|---------|
| 组件片段 | 组件文档「用法示例」节复制（或 `examples/` 无独立文件——直接按 API 写） |
| 页面模式 | `examples/patterns/<file>.tsx` 复制文件 |
| 应用模板 | `examples/apps/<id>/` 整个目录复制（app.tsx + api.ts + server.ts + main.tsx） |

`examples/` 随 npm 包发布——`node_modules/weifuwu/examples/` 可离线取码。

## 组件 vs 原语（最常见混淆）

| 场景 | 用组件 | 用原语 |
|------|--------|--------|
| 布局容器/间距/显隐 | ❌ | ✅ wf-stack/wf-grid/wf-gap-* |
| 导航结构（侧栏/菜单项） | ❌ | ✅ wf-nav/wf-nav-item（或 Menu 组件） |
| 可交互元素（按钮/输入/选择） | ✅ 组件 | ❌ |
| 弹层（下拉/弹窗/tooltip） | ✅ 组件（openPopup 命令式） | ❌ |
| 纯视觉容器（卡片面/分隔） | 两者皆可 | ✅ wf-surface/wf-border |

## 近义组件选型（名字相近/功能重叠——一句话决策）

```
列表类：List（<500 条）→ VirtualList / VirtualTable（>500 条）
选择类：固定选项 → Select；自由输入联想 → AutoComplete；纯搜索 → SearchInput
编辑类：轻量 md → Editor；代码 → CodeEditor；分屏预览 → MarkdownEditor
树形类：展示/勾选 → Tree；下拉选择 → TreeSelect；路径级联 → Cascader
折叠类：多开 → Collapse；单开（互斥）→ Accordion
通知类：轻反馈 → Toast；持久通知 → Notification
主题类：pressed 语义 → ToggleGroup；选中态样式 → SegmentedControl
图片类：展示 → Img；裁剪 → ImageCropper；头像 → Avatar
Office 文档：预览/编辑 → FilePreview；xlsx → FilePreview.Sheet；pptx → FilePreview.Slide
```

## 关键纪律（选型时就要知道）

1. **浮层必须组件 + openPopup**：dropdown/select/datepicker/menubar/cascader/mentions/contextmenu/tooltip/popover/hovercard/modal/drawer/toast/notification/confirm/tour/command——这些已有组件，直接复用；新弹层组件必须 `ctx.ui.openPopup`（anchor 必传）
2. **受控组件配回调**：传 active/value/checkedKeys 等受控 props 必须同时传 onChange——缺回调 = 静默不可点
3. **列表 key 纪律**：有内部状态的组件列表 + 动态增删重排 → 显式 key；纯元素列表 → 无 key（位置身份）
4. **浏览器能力走 ctx.browser**：禁裸 window/document/localStorage/matchMedia

