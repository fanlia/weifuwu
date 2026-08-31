# 焦点管理规范（design/focus-management.md——2027-10）

> **定位**：CLIENT-EXCELLENCE-PLAN 波次 B2——把散在各组件的焦点行为
> 定型为**三种场景范式**，每种配实测断言。新组件交互面按场景对号入座。
> 全部范式有 playwright 实证（B3 走查 + 阶段 2 L2 矩阵）。

---

## 场景 1：命令式浮层（自动聚焦——内核承担）

**适用**：openPopup 弹出的、键盘驱动的面板（命令面板/右键菜单/日期面板/
tooltip 内含交互——`onKeyDown` 绑容器型组件）。

**纪律**：
- 传 `autoFocus: true`（popup-manager opts）——内核 `scheduleAfterRender +
  挂载重试（≤10）` 确定性聚焦面板内首个 focusable（无则面板本身）
- **禁止组件层自管聚焦**：vnode ref 回调在 openPopup mini-root 渲染链
  **不触发**（插桩实证）——ref 聚焦方案结构性不可行
- 非模态不传 trapFocus/lockScroll（右键菜单不锁滚动）

**实证回归**：comp-contextmenu「右键 → 自动聚焦 → ArrowDown 环形导航 →
Enter 执行关闭」（autoFocus 行为级断言）。

## 场景 2：roving tabindex 列表（Arrow 移动 + Enter 激活）

**适用**：列表型交互（Menu/TabBar/ToggleGroup/SessionList/Anchor/Tree 类）。

**纪律**：
- 容器/列表项 onKeyDown 处理 ArrowUp/Down/Left/Right + Home/End
  ——焦点或激活态在项间环形移动（Menu ContextMenu `(highlight + i) % len`
  范式；Anchor ArrowDown 焦点位移范式）
- 激活项 role（menuitem/tab/button）+ aria-current/aria-selected 语义
- **三件套红线**：可交互 div = role + tabindex + onKeyDown 同时存在
  （缺一即死键盘路径——JSONViewer role+onKeyDown 无 tabindex 实证：
  程序 focus 可过测试、真实 Tab 流永不可达）
- **断言必须走真实 Tab 流**：`page.keyboard.press('Tab')` 迭代直到聚焦
  （禁 `el.focus()` 程序聚焦——那会掩盖 tabindex 缺失）

## 场景 3：模态陷阱（trapFocus + lockScroll + 焦点归还）

**适用**：Modal/Drawer/Confirm/ActionSheet 会话级模态。

**纪律**（openPopup opts 一站式）：
- `trapFocus: true`——Tab 在面板内循环（first/last 循环逻辑内核已有）
- `lockScroll: true`——body 滚动锁 + `trapPrevFocus` 焦点归还
- 聚焦时机：engageModalLock → scheduleAfterRender（渲染窗口外——
  effect-guard 零误报）

**B3 实测断言范式（四断言）**：
```ts
// ① 打开后焦点进面板
const inPanel = panel.contains(document.activeElement)
// ② Tab×5 不逃逸到背后页面
for (let i = 0; i < 5; i++) await page.keyboard.press('Tab')
const escaped = activeElement 不在面板且不是 BODY
// ③ Escape 关闭
// ④ 焦点归还触发按钮
const returned = activeElement.textContent.includes('触发按钮文本')
```
实测结果：Modal 全四断言绿；Drawer/Confirm/Popover Escape 路径绿。

---

## 反模式（实证禁止）

| 反模式 | 案例 |
|---|---|
| ref 回调聚焦 openPopup 内容 | ContextMenu 首修失败——mini-root 链不触发 ref |
| 程序 focus 掩盖 tabindex 缺失 | JSONViewer——测试绿但真实 Tab 流死路 |
| 键盘 Enter 绑定但元素不可聚焦 | 同上——role+onKeyDown 无 tabindex = 死代码 |
| move/up 绑容器做拖拽 | SlideCanvas——rebuild 后事件流断裂（改绑 window） |
| aria 布尔直传 `aria-expanded={true}` | 归一空串——ReasoningBlock CDD 实证（内核已修——ariaBoolValue 单源） |
