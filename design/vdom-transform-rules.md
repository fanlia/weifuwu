# vdom 转化规则表（可推导性 by construction）

> 用户决策 2026-12：**用户写 JSX，凭本规则表即可推导 vnode 结构与 DOM 结果——规则表之外的行为 = magic**。
> 配套：design/vdom-consistency-plan.md（实施）· AGENTS.md §4.0（终极目标声明）
> 状态：目标规则（实施中——plan 阶段 0/A/B/E 落地后与代码一致）

---

## 1. 节点规则（JSX → vnode → DOM）

**JSX 属性命名（先于一切属性规则的规则）**：属性名 = **HTML 原名**（`class` / `style` / `data-*` /
`aria-*`）；React 风格 `className` 兼容等价（归一化到 class）；事件 = `onXxx` 前缀。

| 用户写 | vnode（= JSX，零转换） | DOM |
|--------|----------------------|-----|
| 原生元素 `<div class="a">` | `h('div', { class: 'a' })` | `<div class="a">`（原样） |
| 文本 `{'hello'}` | string | 文本节点 |
| 组件 `<Button/>` | 组件 vnode（实例 id → `data-wf-id`） | 其输出（递归应用本表推导） |
| Fragment `<>a b</>` | Fragment vnode | 展开为兄弟节点（无容器） |
| 数组项 `[xx, [yy, zz]]` | 原数组保留（透明） | 数组项 ≡ Fragment：展开为兄弟节点 |
| Portal | Portal vnode | 渲染到 `#__wf_portal`（body 下独立容器，`data-portal` 标记）——非父树内 |
| false/null/true | 保留 | `<!--wf-hole: false-->` 占位节点 |
| 非法对象/非法 type | 原样 | `<!--wf-hole: object {...}-->` 占位 + warn（不崩溃） |

## 2. 属性规则（attribute / property / event 三通道）

| 通道 | 判定依据（classifyProp，**优先级自上而下**） | DOM 行为 |
|------|-------------------------------------------|---------|
| event | `/^on[A-Z]/`（第一优先）——`onXxx` → 小写事件名；`onXxxCapture` → `{capture:true}` | addEventListener（捕获变体明确支持；非函数值 warn + 跳过） |
| property | **表单受控属性白名单**（第二优先，元素类型匹配时）：`value` / `checked` / `selected` / `indeterminate` / `disabled` ——React 同款受控语义 | property 直写（select value 首帧延后到 options 就绪） |
| enumerated | **value-based 白名单**（第三优先）：draggable/contenteditable/spellcheck/translate → 显式 'true'/'false'；**presence-based**：controls/multiple/download/hidden/required/readonly → 空字符串 | 两类名单来自 HTML 规范 enumerated 属性表（新增枚举先查规范归类） |
| boolean（普通） | `value === true`（第四优先） | setAttribute(key, '')（presence 语义） |
| attribute | **默认通道**（其余一切）：`data-*` / `aria-*`（boolean → 'true'/'false'）/ 非表单属性 / 表单属性在非匹配元素上 | setAttribute |
| class | 字符串 → 原样；对象（`{a:true}`）→ 布尔筛选的 classList（**先清后设**，无残留） | classList 操作 |
| style | 对象 → 逐键；字符串 → 原样 | 数字加 px（**UNITLESS 白名单**：zIndex/opacity/lineHeight/fontWeight/fontSizeAdjust/flex/flexGrow/flexShrink/order/zoom/aspectRatio/gridRow/gridColumn/scale/rotate/animationIterationCount/columnCount/fillOpacity/strokeOpacity/stopOpacity/floodOpacity → 不加 px）；CSS 变量 setProperty；kebab/camel 均支持 |
| innerHTML | 存在则 children 不渲染 | render / diff / SSR 三处同一判断 |

## 3. key 规则（数组项必有 key：显式或默认下标）

| 规则 | 内容 |
|------|------|
| **数组项必有 key** | children 数组的**元素/组件项**必有 key——用户显式 key 或**默认数组下标**（缺省自动赋 `key = 下标`；无需用户写，无需抛错） |
| key 语义 | **显式 key = 身份匹配**（增删/重排时复用正确——项的身份跟随内容）；**默认下标 key = 位置身份**（项的身份跟随位置：原地修改正确；增删后各位置实例被复用/更新——React index key 同款「位置复用 + 状态继承」，动态/会重排的列表建议显式 key） |
| 默认下标 key 计数 | **数组原始下标（含占位位置）**——与占位法对齐（childNodes 位置 = 数组位置）：`[A, false, C]` 的 key = A:'0'、C:'2'（false 占位豁免不参与 keyed） |
| key 类型 | **key 统一为字符串**（唯一类型）——数字 key 自动字符串化（`key={1}` ≡ `key="1"`）；比较用字符串全等，无类型歧义 |
| 嵌套数组项 | 数组项（隐式 Fragment）在父数组有 key（显式或默认下标）；其内部子项**各自独立分配默认下标**（子数组内从 0 起）——层级独立，key 不跨层 |
| 豁免（无 key 概念） | 文本 / 占位值（false/null/true）——不参与 keyed 匹配（占位法处理） |
| key → DOM | **所有数组项的 key 都落 DOM**（用户决策 2026-12——行为一致）：**元素项**写 `data-wf-key`（显式原文/默认下标值）；**组件项 key 穿透到输出每个顶层节点**（多根全部写，与 data-wf-id 同规则）——列表项身份在 DOM 完全可见，元素/组件无例外；SSR 同步输出 |
| diff 模型 | 统一 keyed diff（每项有 key：显式或默认下标）——无 key 位置匹配分支删除 |

## 4. 组件 id 规则

| 规则 | 内容 |
|------|------|
| 实例 id | mount 分配（`_wf_0`）→ 组件输出**每个顶层节点**写 `data-wf-id`（多根输出全部写；输出 null 无节点则无） |
| 值可预期性 | **存在性可预期**（每个组件输出节点必有 data-wf-id）；**值不可预期**（`_wf_N` 由引擎分配顺序，不保证跨刷新稳定——如同 React fiber 不可见，此处可见但不必预测值） |
| 用途 | 渲染定位（renderByIds）/ audit 校验（data-wf-id ↔ registry）/ debug |
| SSR（诚实裁剪） | **SSR 不输出 data-wf-id**——id 由客户端 mount 运行时分配，SSR 无法预知与 hydration 一致的 id（输出任意 id 会在收养后失效）；SPA/hydration 后由客户端 renderValue 写入（首帧）/ 后续渲染写入。规则表 §3 的 data-wf-key 反之——key 是用户/下标声明数据，SSR 同步输出 |

## 5. 更新规则（动态可预期）

| 场景 | diff 行为 |
|------|----------|
| 同 key 同类型 | 复用（patch，组件内部状态保持） |
| 同 key 不同类型 | 替换 |
| 新 key | 新建 + 插入 |
| key 消失 | 移除（ref 清理 + 卸载钩子） |
| key 顺序变化 | 移动（位置校正） |
| 数组项/fragment | 范围锚点对齐（_childAnchors） |
| 文本 | nodeValue 直改（引用稳定） |
| 占位 ↔ 真实 | 占位 ↔ 元素：replaceChild 互换（childNodes 长度恒定，索引全有效）；占位 ↔ 占位内容变：nodeValue 直改注释内容 |

## 6. magic 定义（负面清单）

> **magic = 规则表之外的一切行为**（用户凭本表推导不出却发生了）
> **magic = 同一输入在不同路径/环境的分叉**（SSR vs 客户端、jsdom vs 真浏览器、混合 vs 非混合数组——必须同结果）

已知违反（实施中消除）：filter 空洞（占位法替换）· 嵌套数组静默展开（Fragment 语义替换）· pos:key 注入（强制 key 后删除）· class 残留（先清后设修复）· innerHTML render/diff 分叉（统一判断）· 事件变体静默（支持或 warn）· SSR 空洞 `return ''`（占位输出）。

---

## 验收（可推导性测试）

- **规则表一致性测试**：对规则表中每个「用户写 → DOM」条目，jsdom 渲染断言 DOM 精确匹配
- **key 测试**：数组项缺 key → 自动赋默认下标（断言 `data-wf-key` 为下标值、删除中间项后续项重建语义）；显式 key → 原文写入 + 增删/重排复用正确；key 统一字符串（数字自动字符串化）
- **data-wf-key/data-wf-id 测试**：渲染后 DOM 属性存在、SSR 同步、audit 可校验
- **用户可推导性演示**：任意组件 demo（agent-browser 实测）DOM 与规则表推导结果一致
