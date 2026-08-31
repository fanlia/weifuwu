# CLIENT-EXCELLENCE-PLAN——weifuwu/client 全面优化计划（第三阶段·2027-10）

> **定位**：基于两个已完成阶段的全部经验，把 client 从「单点正确」推向
> 「体系卓越」。前序资产：
> - **阶段 1** COMPONENT-VERIFICATION-CHECKLIST：132 组件 × 1020 功能点
>   全量 playwright 验证（13 批五步协议——修复 17 处）
> - **阶段 2** CLIENT-INTERACTIVITY-PLAN：交互完整性三层对账机制化
>   （4 波次 + 3 轮基线消化——再修复 6 处含 2 个内核/通用模式缺陷）
> - **基建现态**：契约 395 / showcase 320 / 场景 122 全绿；
>   audit:interactivity（死代码红线 + 注释对账 + L2 哨兵）与
>   audit:component-coverage（三层覆盖矩阵）双哨兵纯红线运行
>
> **组织原则（阶段 2 的最大教训）**：每条计划项必须有**实证锚点**（修复
> 案例 / 扫描数据 / 生产日志）——拒绝方向性空话。修复历史中的缺陷不是
> 孤立事件，是**模式**——模式必须变成机制，否则换个人换批组件照样复发。

---

## 1. 缺陷模式资产（19+ 处修复的归纳——防复发主线）

| 模式 | 实证案例 | 现有防线 | 本计划动作 |
|---|---|---|---|
| **M1 闭包桥接断裂** | ImageCropper onCrop（renderFn 未写回 ctx2）、AutoComplete onInput（open 已开不重渲） | 死代码检查部分覆盖 | A1 代码纪律条目 + 契约断言范式 |
| **M2 受控回流竞态** | SlideCanvas deck 字面量重置 live 状态、useScrollPosition `?? window`、SSR adopt 文本分裂 | 无（本轮新抓） | **A2 门控审计**（新检查） |
| **M3 死代码/半成品** | dragging/move/resize/stableRef/aiPanel/expanded Set 恒真 | ✅ audit-interactivity 红线 | 维持 |
| **M4 语义错位** | CitationCard linkProps spread 到装饰图标、Badge rest 未透传、ThemeSwitch radio→按钮 | props 声明未消费 warn 档 | **A3 升级清零** |
| **M5 事件绑定位置** | SlideCanvas 容器→window（rebuild 断裂）、openPopup ref 不触发（内核 autoFocus 补） | 无 | **B2 焦点管理规范**沉淀 |
| **M6 文档/文案腐化** | 22 组件 usePopup 注释、「展开中」误导、demo 注释与实现相悖 | ✅ 注释对账红线 | 维持 |

---

## 2. 波次 A：缺陷模式防线补全（audit-interactivity 检查 5/6）

### A2 受控回流门控审计（M2——最高价值）

**实证**：SlideCanvas `props.deck !== lastPropsDeck` 引用比较——场景每 render
传新字面量 → live 拖拽状态被 props 重置（x=104→10——插桩实证）。

- 扫描全部受控组件的引用比较回流模式：
  `props\.\w+ !== last\w+` / `!== lastProps\w+`
- 每处甄别：**回流门控是否存在**（live 期间挂起 / drag 门控 / dirty 标记）
  ——无门控 = 缺口（exit 1——基线登记消化）
- 已知清单（初步）：SlideCanvas ✅ 已修；InputNumber/Editor（undo 受控）/
  TagsInput/JsonSchemaForm 待扫

### A3 props 声明未消费 warn → 分类清零

- 现状 warn 档（波次 4 遗留）——逐条甄别：透传场景（rest 模式）登记
  audit-exempt；真缺口补实现或删声明（Badge rest 教训）
- 验收：A 类 warn 归零（全部消费或豁免）

### A4 Icon 未知 name 防御（内核组件健壮性）

**实证**：`PATHS[name].map`——未知 name = renderFn 崩 → 组件级 hole 降级
（下一拍重试自愈）**循环刷错误日志**（statcard demo 无效图标名实证）。

- 修：`PATHS[name]` 落空 → dev `console.warn`（含 name + 修正提示）+
  fallback 圆点 path（生产静默——不崩不刷日志）
- 契约测试：未知 name → warn 恰一次 + svg 仍渲染（hole 降级不再触发）

---

## 3. 波次 B：A11y 体系化（新域——从打补丁到有规范）

**现状**：键盘 A11y 已逐组件实测（Enter/Space/箭头 roving——L2 矩阵），
焦点管理首例（openPopup autoFocus），aria 布尔归一（CitationCard 实证），
但**无体系**——每个浮层的焦点行为各自为政。

- **B1 ARIA 声明矩阵**：静态扫交互组件的 role/aria-* 声明 vs 交互语义
  （可点击 div 必带 role+tabindex+键盘三件套——CitationCard/ContextMenu
  模式已验证）——缺失 = 缺口清单
- **B2 焦点管理规范文档**（design/focus-management.md）：三种焦点场景
  定型——①命令式浮层（autoFocus——openPopup 内核承担）②roving
  tabindex 列表（Menu/TabBar/ToggleGroup 已验证范式）③模态陷阱
  （trapFocus 已有）——各配场景层断言范式
- **B3 场景层 Tab 序走查**：Modal/Drawer/Confirm/Popover 四大浮层——
  Tab 循环不出陷阱、关闭后焦点归还（trapPrevFocus 机制已有——断言补齐）

## 4. 波次 C：主题渗透完整性

**实证**：ImageCropper canvas 硬编码 `strokeStyle: '#fff'`（暗色主题下
白框不可见风险——裁剪框是核心交互面）；扫描 14 处硬编码色值。

- **C1 三分类甄别**（不全量清除）：①调色板语义（Avatar/Chart 数据系列
  色——保留但集中到 design-variables 登记制）②工具自身（ColorPicker——
  豁免）③应变量化（ImageCropper 边框/hover 遮罩等 UI 色——CSS 变量替换）
- **C2 暗色双跑**：playwright 以 `data-theme=dark` 跑 showcase 关键画布/
  浮层组件截图对比（ImageCropper/Chart/Slider/Tooltip——几何 + 对比度
  抽查）——差异页登记修复

## 5. 波次 D：SSR 一致性收敛

**实证**：`[vdom] renderFn 错误——组件级 hole 降级（下一拍重试自愈）`
重试自愈机制**掩盖根因**（demo 无效图标名循环刷日志——修 zap 后归零）；
SSR adopt 竞态历史（文本分裂/hasSsrMark）已修但同类面无哨兵。

- **D1 renderFn 错误零容忍**：audit:showcase（160 页 dev 扫描）扩展——
  捕获 console 的 `[vdom] renderFn 错误` → 计数基线（当前 0）——
  非 0 = exit 1（自愈机制保留——但错误必须现形）
- **D2 demo 数据校验哨兵**：Icon 名对齐扫描（本计划起草时已跑——
  demo 无效名 0）机制化进 audit:showcase（新增 demo/registry 图标名
  与 Icon PATHS 对账）

## 6. 波次 E：API 对齐与 DX

**实证**：Timeline `onClick` 是 **item 级** prop——组件级传参**静默无效**
（本阶段实际踩坑——验证者都会踩）；CitationCard demo 注释「不渲染链接」
与实现相悖。

- **E1 接口→demo 覆盖矩阵**：TypeScript 接口 props 清单 × demo 传参
  对账（每个 prop 至少一个 demo 实例触达——`onClick` 声明位置层级
  校验：接口定义在 item 类型 vs 组件 props——静态可判）——缺口 = 登记制
- **E2 AGENTS 组件作者契约补丁**（阶段 2/3 沉淀的三条新纪律）：
  ①受控组件回流必须门控（live/编辑期间挂起——引用比较只在 mount 与
  外部显式变更时生效）②拖拽 move/up 必绑 window（容器绑定在 rebuild
  后断裂——元素替换实证）③可交互 div 三件套（role+tabindex+键盘）
  禁止散装

## 7. 波次 F：体积与性能基线（轻量——引擎面 VDOM-PERF-PLAN 已收官）

- **F1 app.js 体积基线**：当前尺寸登记（计数基线制——只能缩小或持平）
  ——CI 挂载——超基线 exit 1（逼按需加载决策）
- **F2 render-health 接审计**：`window.__wfRenderHealth` 三轴阈值已在
  （频率>10/s·规模>5000 命令·复用>5%）——showcase 跑批时收集快照
  ——超阈值组件登记（当前复用轴零告警为基线）

## 8. 验收判据（红线）

1. audit-interactivity：B 类 0 / A 类 0 / L2 缺口 0 / **A2 门控缺口 0**
   / **A3 props 未消费 0**
2. Icon 防御契约：未知 name warn 一次 + 渲染不崩
3. A11y：B1 矩阵零缺口（或登记）+ B3 四大浮层 Tab 序断言绿
4. 主题：C1 三分类清单落 design-variables + C2 暗色双跑零黑斑
5. SSR：D1 renderFn 错误计数 0 + D2 图标对齐 0
6. 全量回归：契约 ≥395 / showcase ≥320 / 场景 ≥122 恒绿
7. 红线纪律：每条修复带回归断言；基线只能缩小；豁免必须写理由

## 9. 判负记录（防仪式化——先记下）

- **不做** A11y 全组件 WCAG 合规认证（成本远超收益——聚焦交互语义与
  焦点两大痛点）
- **不做** 硬编码颜色全量清除（调色板/工具类是合法语义——只清 UI 色）
- **不做** props 接口的运行时校验（TypeScript 已保证——运行时校验是
  双重保险的过度设计；只做静态对账哨兵）
- **不做** 体积自动优化（按需加载/Tree-shaking 调整是构建决策——基线
  哨兵只负责让体积变化现形）
- **不做** office 域（pptx/xlsx 模型层）独立专项——场景层 deep-* 已覆盖
  交互面——模型层问题由修 SlideCanvas 时的 commit 链跟进

## 10. 波次依赖与顺序

```
A（防线补全）→ B（A11y）→ C（主题）→ D（SSR）→ E（API/DX）→ F（体积）
  │                │            │            │
  └── A4/A3 独立可并行 ── B2 依赖 A4 稳定 ── C2 依赖 B3 浮层断言 ── E1 依赖 D2 机制
```
