# apps/components-demo — 组件库质量走查面

109 个 HTML 原语组件的交互 cheatsheet：每个组件一张 DemoCard（演示 + 描述 + 可复制代码）。
也是组件库的**质量走查面**（design/components-demo-optimize.md）——类型门禁、受控纪律、
弹层定位、键盘可达都在这里实测。

## 启动

```bash
cd apps/components-demo
node server.ts        # → http://localhost:3000
```

## 壳能力

- 吸顶导航：9 个分组锚点（横向滚动）+ **搜索过滤**（按组件名实时过滤卡片/空分组隐藏）
- **hash 深链**：`/#sec-导航组件` 直达分组（客户端渲染后 scrollIntoView 补跳）
- 主题切换（自动/亮色/暗色）+ 中英切换
- 计数与框架实测同步（109 组件 / 871 测试——style-audit 强制，漂移即红）

## 验证矩阵（agent-browser 实测，2026-08）

| 断点 | 1280 | 768 | 375 |
|------|------|-----|-----|
| 横向溢出 | 无 | 无 | 无 |
| 导航 | 单行吸顶 | 吸顶换行 | 吸顶换行 |
| 搜索过滤 | ✓ | ✓ | ✓ |

亮/暗双主题：头部/卡片/导航对比度目测达标（style-audit 对比度规则兜底）。

## 交互走查记录（agent-browser 真实交互）

| 组件 | 路径 | 结果 |
|------|------|------|
| Collapse | 点击 header → 面板展开（aria-expanded） | ✓ |
| Dropdown | 点击触发器 → 菜单入 #__wf_portal | ✓ |
| Modal | 打开 → 焦点 trap 进对话框 → Escape 关闭（含退场动画） | ✓ |
| Tabs | 方向键 → 激活项移动 + 焦点跟随 | ✓ |
| AutoComplete | 输入 → 下拉过滤 + **焦点保持**（§5.3 受控输入纪律） | ✓ |
| Select searchable | 空输入开=全量 5 项 → 输入"张"=1 项 | ✓ |
| Cascader | 点击 trigger → 面板入 portal | ✓ |
| Tree | switcher 收起（5→1）/再展开（1→5）往返 | ✓ |
| RadioGroup / Rate | 受控 warn 误报修复（readOnly 豁免）+ demo 补 onChange | ✓（控制台零警告） |
| NavMenu | **menuitem 无 tabIndex（keydown 死代码）→ 修复** + Enter/Space 激活 | ✓ |
| Drawer / DatePicker / Command / Menubar | 打开 → portal 弹出 → Escape/外点关闭 | ✓ |
| Tooltip | mouseover → 气泡可见（坐标实测） | ✓ |
| Transfer | 选中 → 右移按钮启用 → 成员B 移至右列 | ✓ |
| TagsInput / PinInput / Pagination / ColorPicker / Mentions / TreeSelect / Notification / Calendar | 输入/打开/切换/弹出 | ✓ |
| ContextMenu / Tour / JSONViewer / Editor / ThemeSwitch | 右键打开 / 引导弹层 / 折叠 / contenteditable / 主题切换 | ✓ |
| Kanban | 5 卡片 draggable | ✓（合成事件不做完整拖放） |
| Slider | 原生 range——合成键事件不动为预期（不可信事件限制） | ✓ |
| VirtualList / VirtualTable | 滚动窗口移动（scrollTop 3000/5000 → 行 78/121） | ✓ |
| InfiniteScroll | sentinel 入视口加载更多（10→15 条） | ✓ |
| AiChat | 流式对话 ✓；Agent 模式：工具卡→进度→审批卡→结果→流式答案全链路 | ✓ |
| Kanban | 真实 CDP 拖拽跨列移动 | ✓ |
| Popconfirm / Popover / HoverCard / Accordion / Carousel / SearchInput / FileUpload | 打开/确认/清除/切换 | ✓ |

> 走查纪律（附录 A）：真实交互前必须 reload/重开清状态——会话残留会制造假 bug
> （Select "无匹配"与 Tree "塌陷"均为残留假象，重开后复测通过）。

## 本次走查修复（P9）

- **组件**：Layout 透传 `style`/`className`；StatCard `countdown` 模式 `value` 可选；
  EmptyState 默认图标 emoji→Icon inbox（icon 支持 VNode）；Rate readOnly/disabled 豁免受控 warn
- **client**：JSX `ElementType` 放宽为 `Component<any, any>`——带 ctx 注入声明的组件可作 JSX 元素
- **demo**：12 个 tsc 错误清零（ToastInjected 注入声明等）；emoji 图标清零；计数同步；
  NavMenu 受控不更新修复；RadioGroup inline 补 onChange；壳升级（导航/搜索/深链）
- **门禁**：`src/test/apps-typecheck.test.ts`——apps tsc 纳入 npm test（并发隐藏耗时）
