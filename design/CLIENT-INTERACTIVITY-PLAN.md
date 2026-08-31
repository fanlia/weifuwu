# 组件库交互完整性优化计划（2027-09——ImageCropper 死交互实证驱动）

> **核心命题**：132 组件验证 301 测试全绿，但 ImageCropper 的**用户主路径
> （拖动裁剪框）从未接线**——测试断言面 = 组件暴露的数据流 ≠ 用户交互面。
> 本计划以「功能测试无遗漏」为目标：把「声明可交互 → 实际接线 → 测试断言
> 操作前后状态变化」三层对账机制化，长出修复波次。
>
> 触发：用户实测 `/components/imagecropper` 问「如何交互」——实证发现
> canvas 零事件绑定、`dragging` 死变量、`move()/resize()` 死函数、注释
> 声称 useDrag 但从未调用——而该组件测试绿（断言了 onCrop 数据流）。
> **教训**：交互组件的测试必须断言「操作 → 可见状态变化」，只断言数据流
> 会放过半成品交互。

---

## 1. 实证画像（全量静态扫描——2027-09）

启发式扫描（`/tmp/scan-interactivity.mjs` → 波次 1 机制化为
`scripts/audit-interactivity.mjs`）：134 组件目录，**32 组件命中**。

### A 类：文档腐化（注释提及已删/未用 API——约 27 组件）

`usePopup`（2027-03 命令式内核定稿时已删）在 22 个组件注释中仍被提及；
`useCallback/useChat/useBreakpoint/useReducedMotion/usePopupPosition` 零散
出现。**功能无损**（实际走 openPopup 内核/ctx API），但文档对读者撒谎——
误导贡献者以为存在 hook 路径。

| 注释 API | 组件数 | 实情 |
|---|---|---|
| usePopup | 22 | 过时——实际 openPopup 命令式内核 |
| useBreakpoint | 3 (Grid/Layout/NavMenu) | 待甄别（响应式逻辑在哪） |
| useChat | 2 (AiChat/ChatInput) | 待甄别（可能是 ctx.chat） |
| useReducedMotion | 1 (StatCard) | **真缺口候选**——动画未接 reduced-motion |
| useCallback | 4 | 注释提 React 术语——纯文档腐化 |

### B 类：真功能缺口（死变量/死函数 = 写了一半没接完——5 组件）

| 组件 | 缺口 | 严重度 |
|---|---|---|
| **ImageCropper** | `dragging` 死变量 + `move()/resize()` 死函数 + 注释声称 useDrag——**裁剪框拖动/缩放完全未接线**（用户主路径缺失——只能裁固定居中 80%） | **高**（核心功能半成品） |
| **Editor** | `aiPanel` 死变量 + `parseDom()` 死函数 | 待甄别（AI 面板半成品？） |
| **Command** | `stableRef()` 死函数 | 低（残留） |
| StatCard | useReducedMotion 注释——动画未接偏好 | 低（可访问性） |
| Slider | usePopup 注释——tooltip 定位实现方式对账 | 甄别（功能在——旧测试验过） |

---

## 2. 根因分析（为何 301 测试全绿却放过死交互）

```
三层断言面：

L1 数据流面     onXxx 触发 / 值回流 / 渲染存在        ← 现有 301 测试 95% 覆盖
L2 交互路径面   用户主操作（拖拽/键盘/滚动/hover）      ← 缺口所在——ImageCropper 在此漏网
L3 声明对账面   注释/文档/demo 文案/props vs 实际接线   ← 零机制——文档腐化 27 组件在此堆积
```

1. **L2 缺口**：测试断言「组件暴露面」（props → 渲染 → 回调），用户到达
   该回调的主操作（拖框选区）无断言——ImageCropper 测试只点「裁剪」按钮
   （默认框），拖拽路径不存在也不报红。
2. **L3 缺口**：注释/文档无对账机制——`useDrag` 写在头注释里，贡献者
   （和 AI）读注释以为功能在。
3. **哨兵缺口**：`audit-component-coverage.mjs` 只查「组件 × 三层有无
   测试文件」，不查「测试文件断言了什么类型的交互」。

## 3. 优化方案（四波次）

### 波次 1：静态对账审计机制化（`scripts/audit-interactivity.mjs`）——✅ 已落地（2027-09：npm run audit:interactivity——B 类红线 exit 1 / A 类 warn 档 34 条待波次 4）

把本次启发式扫描升级为正式审计（CI 可挂）：
- **检查 1 死变量**：`let x` 声明后全文引用 = 1 → 报（白名单登记制）
- **检查 2 死函数**：`const fn = (...) =>` 引用 = 1 → 报（白名单登记制）
- **检查 3 注释-实现对账**：注释声称 `use[A-Z]\w+` 但代码零使用 → 报
  （或改注释或补实现——不许文档撒谎）
- **检查 4 props 声明未消费**：interface 字段在实现零引用（排除透传场景）
  → warn 档（供人工甄别——Badge rest 类缺口由此长出）
- 豁免 = 代码内 `// audit-exempt: 理由` 注释登记——零静默豁免
- 验收：`npm run audit:interactivity` 进 package.json——A 类清理后 exit 0

### 波次 2：交互面测试哨兵（扩展 `audit-component-coverage.mjs`）——✅ 已落地（2027-09：audit-interactivity 检查 4——组件分类静态特征 × comp-*/scenario 双层对账 + interactivity-baseline.json 计数基线（14 条登记——只能缩小）；场景层对账收敛误报（拖拽缺口清零）；本轮固化 6 个 L2 测试：tabbar/togglegroup 箭头导航、card/statcard Enter A11y、notification portal 归属、watermark dataURL 背景层）

组件分类 × 必备断言矩阵（缺口 = exit 1）：

| 组件类 | 判定 | 必备断言（L2） |
|---|---|---|
| 拖拽类 | 源码含 pointerdown/mousedown/draggable | 测试含 mouse 操作 + **状态变化断言**（顺序/坐标/像素） |
| 键盘类 | 源码含 keydown/Enter/ArrowXxx | 测试含 keyboard.press + 回流断言 |
| 浮层类 | 输出进 #__wf_portal | geometry 断言（已有纪律——assertPopupGeometry） |
| 媒体类 | canvas/video/audio | 元素属性断言 + 操作断言（play/pause/crop） |
| 时序类 | setTimeout/animation | waitForFunction 状态翻转断言（非固定 sleep） |

- 实现方式：组件目录打标（`components.json` registry 加 `tags` 字段）或
  静态推断源码特征——静态推断优先（零登记成本）
- 测试命名约定配合：L2 断言的 test 名含 `FP-交互` / `交互：` 前缀——
  哨兵按前缀 + 组件类对账

### 波次 3：B 类缺口修复（从甄别结论长出——逐个带测试）——✅ 全落地

**追加修复（基线消化轮 2——2027-09）**：基线 14→3——
- **CitationCard 语义缺陷修复**（组件层）：linkProps（role/tabindex/
  onKeyDown）被 spread 到装饰图标 a 上——整条 item 无交互，且 onOpen 时
  仍渲染链接（与 demo 注释相悖）——修正为 onOpen 时整条 item 可点
  （citation 惯例）+ 图标装饰化；url 时真链接保留
- **demo 交互实例补全**：StatCard 加 onClick 卡片（__statClick 回流）、
  Timeline 条目挂 item 级 onClick（prop 名纠正：组件级传参无效——
  onClick 在 items 每项）、DiffView 数据扩 6 行 same 段（foldThreshold=2
  触发折叠按钮真实存在）
- **L2 固化 +7**：anchor ArrowDown/Up roving、citationcard 整条+Enter、
  navmenu Enter 激活、timeline 点击+Enter、statcard click+Enter（role=
  button 原生合成 click——Enter 计数 2）、jsonviewer 折叠、
  jsonschemaform Enter 提交
- **教训**：①wf-diffview-fold 是 div[role=button] 非 button 标签——
  选择器按 ARIA 语义查；②SSR adopt 完成前 click 落空（事件未接管）——
  测试需等待接管；③server 编辑竞态后 curl 的旧响应勿当真——以 DOM
  实测为准；④esbuild 输出非 ASCII 转 \uXXXX——grep 中文需在 DOM 层
- **基线清零（消化轮 3——2027-09）**：14→0——
- **SlideCanvas 受控回流门控**（组件层实质缺陷）：场景每次 render 传新
  deck 字面量 → 引用比较判定「外部变更」→ live 拖拽状态被 props 重置
  （x=104→10——拖拽死——插桩实证 onPointerMove 9 次/live 8 次/deck 更新
  但 onPointerUp 读到旧值）——修：!drag 门控 + 场景受控闭环（onChange
  的 deck 存回回传）+ move/up 绑 window（shape 重建无关——事件流断裂
  根治）
- chart L2（hover 数据点 → portal tooltip「1月120」）、diffview FP3 补
  键盘 Enter 断言、slidecanvas 场景层拖拽断言（e2e-15——onChange 回流）
- 基线文件删除——哨兵转纯红线（缺口 = exit 1——零登记）：ContextMenu 键盘导航死路（审计 L2
缺口实证——右键打开后 ArrowDown 无效）——**内核层修复**：openPopup 新增
`autoFocus` 选项（确定性 scheduleAfterRender + 挂载重试聚焦——非模态不锁
滚动/不陷阱；trapFocus 模态分支共用 focusPanelWhenMounted）。**关键实证**：
vnode ref 回调在 openPopup mini-root 渲染链不触发——组件层 ref 聚焦方案
结构性不可行——聚焦只能由内核承担（AGENTS §3：组件层异常暴露内核缺口）。
基线 14→8；L2 固化 +7（contextmenu autoFocus 回归/reasoningblock chevron
翻转闭环/sessionlist 箭头焦点/virtualtable 列头 Enter 排序/jsonviewer
折叠/jsonschemaform Enter 提交/拖拽分类特征收窄 mousedown 误报剔除）

1. **ImageCropper 拖拽接线**（首例——用户主路径）——✅ 已落地（2027-09：pointer 三事件 + setPointerCapture + L2 测试 4/4 绿——拖框移动像素变化/角柄等比 828x621 保持 4:3/重置回位）：
   - canvas pointer 事件绑定（pointerdown 判定命中区：框内 = move /
     右下柄 = se → pointermove 更新 box → draw()）
   - 复用既有 `move()/resize()` 死函数（clamp/aspect 逻辑已写好——只差接线）
   - 触发点：move/resize 中直调 draw()（canvas 内部状态——非渲染路径——
     不走 ctx.render 避免 vdom 全量 diff）；拖拽结束时一次 ctx.render()
   - 测试：playwright 拖动 canvas → `toDataURL()` 像素变化断言（L2 范式）+
     角柄缩放后 `box.w/h` 比例保持
2. **Editor aiPanel/parseDom**：甄别（git 历史 + demo 触达）——半成品
   补全或删除（不许死代码留壳）
3. **Command stableRef**——✅ 已删（no-op ref 残留——Ctrl+K 回归绿）
4. **StatCard reduced-motion**：接 useReducedMotion（可访问性红线——
   design/micro-interactions.md 若有对应规范则对齐）
5. 修复纪律：AGENTS §3 归类 + 每修复带 L2 断言测试（回到哨兵矩阵）

### 波次 4：A 类文档对账 + 归档——✅ 已落地（2027-09：34→0——22 文件 usePopup 注释改 openPopup 内核；审计词表收紧「只对声称调用路径报」（useCallback 等价物/由用户驱动等语义说明排除）；AiChat 用法示例 audit-exempt 登记；StatCard 注释修正——偏好感知实际内建于 useTween；ImageCropper 修复注释措辞去误导）

- 22 组件 usePopup 注释改为 openPopup 命令式内核表述（引用
  design/imperative-popup-plan.md）
- useBreakpoint/useChat 甄别结论回填注释
- 全量回归（showcase 301+ / 契约 395）+ 清单归档 + commit

## 4. 验收判据（红线）

1. `npm run audit:interactivity` 零豁免违规（B 类清零 / A 类注释清零 /
   白名单登记制）
2. 交互面哨兵零缺口（拖拽/键盘/浮层/媒体/时序类组件测试全含 L2 断言）
3. ImageCropper 拖拽选区主路径可用 + 像素级断言绿
4. 全量回归绿：showcase ≥ 301 / 契约 ≥ 395 / 场景 ≥ 121
5. **禁止**：为过审计删功能注释时顺手删掉真实 TODO（甄别过再动）

## 5. 判负记录（先记下——防止仪式化）

- **不做**「交互覆盖率 %」仪表盘——组件交互面无法可靠量化（拖拽 vs 点击
  不是同一度量）——哨兵按类矩阵判定即可
- **不做** 全组件 E2E 重跑——301 测试已按批验证——只对哨兵抓出的缺口
  组件增量补测
- **不做** 注释全量重写——只对账「API 声称 vs 实际」（usePopup 类）——
  行为描述性注释不动
