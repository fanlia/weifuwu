# weifuwu 客户端文档（client）

> 前端开发者入口。**代码即文档**：本文件只写「地图 + 规则要点」——
> 细节全部指向源码/测试（源码就是最高保真文档）。
> 组件编写规范入口在本文件 §5（新增/修改组件必读）。

## 目录

- [1. 快速上手](#1-快速上手)
- [2. 组件清单](#2-组件清单)
- [3. 设计语言](#3-设计语言)
- [4. 布局系统](#4-布局系统)
- [5. 组件编写规范（唯一入口）](#5-组件编写规范唯一入口)
- [6. 前端架构导论](#6-前端架构导论)
- [7. 关键范式](#7-关键范式)

---

## 1. 快速上手

```tsx
import { createApp, Router, Button, Modal } from 'weifuwu'

const app = createApp({ mount: '#root' })
app.router(Router())
// 组件 = 工厂同步 + 渲染纯同步——见 §5.1
```

前端三层：`uiServe`（应用引导）/ `uiSsr`（服务端渲染）/ `components`（UI 组件库）。
入口实现：`src/client/index.ts` · 中间件：`src/client/middleware/`。

## 2. 组件清单

**134 个组件**——源码目录即清单：`src/client/components/<Comp>/<Comp>.ts`（每个含
`<Comp>.css` + 契约测试）。展示与使用示例：`apps/showcase/`（localhost:3200——
`/components/<id>` 每组件一页 + demo 源码即用法）。

组件分类速查（详见 `apps/showcase/src/demos/` 与 registry）：

| 类 | 代表组件 |
| --- | --- |
| 通用基础 | Button / Card / Badge / Avatar / Alert / EmptyState / Loading / Modal / Drawer |
| 表单 | Input / Textarea / Select / DatePicker / Upload / Form / Checkbox / Switch / Slider |
| 数据展示 | Table / VirtualTable / Chart / Tree / CodeBlock / DiffView / Kanban |
| 导航 | NavBar / TabBar / Breadcrumb / Pagination / Menu / NavMenu / Anchor |
| 反馈 | Toast / Confirm / Notification / Popconfirm / ProgressBar / Skeleton |
| AI 特色 | AiChat / ChatInput / ToolCallCard / ApprovalCard / CitationCard / StreamingText |
| 命令式 | `toast()` / `confirm()` / `ui.openPopup()` / `ui.render()` |

移动端适配：断点 768px · 44px 命中区 · safe-area 常量——组件与布局内建。

**三库对照**（antd / Element Plus / shadcn-ui 映射）——表格历史长度大，按需查：
源码键 `apps/showcase/src/registry/components.ts`（每组件 `meta: { antd, ep, shadcn }`
字段）是**机制化事实源**——查询即 grep，不再维护纸质映射表。

## 3. 设计语言

微流明（Whisper Luminance）：中性色主导、品牌色点睛、动效短促有目的（120–300ms）、
1px 边界即结构。**Token 即规范**——`src/client/layout/_tokens.css`（176 token：
色阶/排版/动效/圆角/阴影/z-index；`_dark.css` 暗色覆写 · `_presets.css` 紧凑预设覆写）
——组件只引用 token、零硬编码（audit 强制）。

**token 两面纪律**（layout-inventory L10/L11 哨兵）：

- **断点单源**：`--wf-bp-sm/md/lg/xl` = 640/768/1024/1280——CSS 媒体查询语法不能
  `var()`，故 token 作**审计白名单源**：合法字面量只有两形态 `V`（`min-width`）与
  `V - 0.02`（`max-width`）——二者无缝对接（旧碎片：组件面 `639px`/`767px` vs
  layout 面 `767.98px`——767.00–767.98 区间两侧规则同时失配）
- **死面 = 0（登记制）**：token 声明必须有消费证据（`var()` / TS 字面）——零消费即删，
  结构性不可消费的（bp-* 机制源 · gap-2xl 标尺完整性）逐条登记理由；反向哨兵：
  登记项一旦有消费者即需移出（防登记表腐化）
- **双标尺（定案）**：`--wf-gap-*` **派生**自 `--wf-space-*`（紧一档：gap-md = space 裸档
  = 12px · gap-lg = space-md）。容器内元素间距 < 控件内边距是有意的密度设计，**不是**
  同名不同值的命名事故——关系入代码（L13 登记 + 值冻结），预设只覆写 space 标尺
  （gap 自动跟随）
- **同值双名（L12）**：同主题文件内值全等且名为「限定词插入」形态（`shadow` ⊂
  `surface-shadow`）= 历史双名 → 必须 `var()` 单源（语义名保留、值改引用）；
  跨域巧合（motion-sm 4px ≡ overlay-blur 4px · 240px/200px 三胞胎）**判负不耦合**
  （耦合即隐形爆炸半径）
- **px 字面量（L14）**：layout 类文件只允许登记白名单内的结构魔数（44px 命中区 ·
  999px 胶囊 · 1px 发丝走 `--wf-border-width` · 2px/4px bleed 对 · 32px 视口内缩 ·
  2px hover 微抬升）——新增字面量必须 token 化或登记

品牌换色 = 改 seed 一个值；预设主题 = `data-theme` 一个属性（minimal/dark）。

## 4. 布局系统

`src/client/layout/`——50 原语（`_*.css`）+ 98 工具 + 2 内部，全部 `wf-` 前缀；
**装配单源**：四处管线（build 产物 / showcase dev / 场景 dev / `ctx.ui.css`）共用
`bundle.ts`——层序单源（D4 审计比对）；**发布产物 minify**（esbuild——见文末载荷面）：

- **原语**：`wf-stack` / `wf-row` / `wf-grid` / `wf-center` / `wf-card-surface` / `wf-divider`
- **工具**：`wf-padding` / `wf-margin` / `wf-text-*` / `wf-bg-*` / `wf-hidden`
- **命名规则**：三类词根 + 三后缀（完整词根表 = **机器生成** `docs/layout.md`：类清单/断点表/
  钩子表/标尺派生/零消费公共面示例——与 `layout-inventory` 哨兵同源，改布局源码后
  `node scripts/layout-reference.mjs` 再生成；L15 校验漂移即红）

零值形态唯一（`none` 归一）· 对齐域禁方向词 · 双名歼灭 · 零值档位矩阵（取消面缺口登记）·
冲突矩阵（同属性不同值对的同元素共用逐对登记胜者+胜因）· 层叠机制锁定（层序/`:where()`/
`!important` 白名单/`@property` 钩子注册）· 断点与 token 单源 · token 双名歼灭 ·
间距标尺派生登记 · px 字面量白名单——layout-inventory **20 断言**锁定；
层叠语义的浏览器计算值读数见场景层 `e2e-layout-semantics.test.ts`。

**载荷面（W6 minify）**：dist 发布产物 `weifuwu-layout.css` **28.1K**（gzip 5.7K · brotli 5.1K）·
`weifuwu/components/style.css` **220.9K**（gzip 29.4K · brotli 24.3K）——esbuild minify（
`build.mjs` 实装：`@layer`/`@property`/`@supports`/转义类名全保留，注释全剥离）；
**无组件应用只引 `weifuwu/layout`**（28.1K / br 5.1K——独立面，零组件 CSS 成本）。
按需子集（per-component 子路径 / purge）**判负**：动态类名漏删风险 + 构建期改造成本
+ br 后 24.3K 非瓶颈——推翻条件：真实应用首屏 CSS 成为 LCP 阻塞的实测数据。

## 5. 组件编写规范（唯一入口）

> 新建/修改组件前读本节——其余 § 按需。
> 规则可执行、检查可机制化：**红线写错即响**（§5.6），作者只需记住清单。

### 5.1 作者契约

- 工厂**同步**（类型层强制）· 渲染**纯同步** · 异步全在 hooks/事件回调
- 状态闭包 mount 作用域 · 稳定回调/ref 定义 mount 层
- 资源清理 `ctx.ui.hold(fn)` · 浏览器环境经 `ctx.browser`（**零全局 window/document**
  ——SSR 崩溃铁律，BackTop 实证）
- **memo（opt-in 2027-09）**：高频输入/大输出组件可在工厂返回的 render 函数上挂
  `render.shouldRender = (prevProps, nextProps) => boolean`——返回 **false = 跳过
  本拍渲染**（复用上拍输出——DOM 零扰动）。语义：返回 false 表示「不需要重渲染」。
  回调/类函数属性差异**不触发**（比较器自有豁免权——如 CodeEditor 忽略 onChange
  闭包引用）。默认不挂 = 行为完全不变。典型：CodeEditor（value/lang/rows/readOnly
  比较——高频输入页面零 diff 扰动）
  **页面级范式（web W3 试点——AgentGrid 先例）**：列表区独立成组件 +
  `shouldRender` 比较**数据引用**（`agents` 数组未变 = 输入键击不重渲列表段——
  高频输入页的「静态邻居」零 diff）；回调经闭包（onDm/onRemove 豁免——
  CodeEditor 同款）；单消费者页内组件（不违反「>1 消费者入库」——判负登记）

### 5.2 三件套

```
src/client/components/<Comp>/
  <Comp>.ts    # 组件
  <Comp>.css   # 样式（必有——style-audit 文件数基线 +1）
  <Comp>.test.ts  # 契约 harness（命令流断言——零浏览器）
```

### 5.3 API 形状

props camelCase · **`className=`（组件 props）`class=`（DOM 元素）** ·
受控三件套（value/onChange + 缺回调 warn）· 事件经事件表（函数 props 不写 attribute）·
受控回流门控（引用比较 + live 门控）· value 走 property · aria 布尔归一 ·
可交互 div 三件套：role + tabindex + onKeyDown

### 5.4 CSS 纪律

全部 `--wf-*` token 化（零硬编码色/字号）· 类名 `wf-` 前缀 ·
**状态变体类必须有规则或 `:where(.wf-x) {}` 显式声明**（L3 已扩围组件源码——未定义立即红）·
动效 `--wf-dur-*`/`--wf-ease-*` · transition 含 visibility（隐藏不可 Tab 聚焦）

**组件 px 四纪律（C1 哨兵强制——`contract/components-px.test.ts` 四桶登记制）**：

1. **间距走标尺**：padding/margin/gap 的 4/8/12/16/24/32px →
   `var(--wf-space-*)`/`var(--wf-gap-*)`（**任一档位值字面量 = 红**——含 var 混合声明
   `padding: 8px var(--wf-x)` 同样适用——半 token 禁止；档位外值 = 结构桶登记制）
2. **边框宽走发丝 token**：`border[N]: 1px solid/dashed …` → `var(--wf-border-width)`
   （色可走 var/currentColor/transparent——hex 已锁 0；**非 1px 宽 = 强调边框**——无 token 面登记制）
3. **结构值登记制**：非档位 px（结构尺寸/魔数——height/width/min-*/outline/box-shadow 偏移/
   44px 命中区/z-index:1 等）→ `scripts/components-px-whitelist.json` structural/zIndex 桶
   **登记 + 理由**（新增未登记 = 红 · 处理完未移出 = 幽灵红）
4. **豁免面**：派生表达式（calc/env/min/max/clamp——L13 同款）与 0px 零值形态——非作者手写终值

> 紧凑预设语义：**只有走 var() 的组件才跟随缩放**（_presets.css「间距缩一档」——手写=静止=活体缺口）。

**C2 扩展纪律（`contract/components-token.test.ts` 三桶——token 消费哨兵）**：

5. **文本行高走档**：`line-height` 值 ∈ {1.5, 1.25}（恒等档）→ `var(--wf-line-height)`/
   `var(--wf-line-height-tight)`（近值=红）；代码排版 1.6（CodeBlock/DiffView——2 消费者
   <3 升档门——第三消费者出现即升 --wf-line-height-code）；豁免面 {1 重置/0/px 图标}
6. **弹层宽走钩子**：`.wf-popup` 系面板 **禁止手写 max-width**——基类
   `min(var(--wf-popup-max, 480px), calc(100vw - 32px))` 是唯一入口；组件默认宽用
   **回退值**表达（`min(var(--wf-popup-max, 320px), …)`——回退=默认宽）；非弹层面板宽
   （命令面板/通知条/工作区）判负登记——`popup-max` 钩子调不动 = 钩子失效面
7. **token 零消费双分类**：{保留类（色板档/暗色映射档/布局档/断点档——消费形态非
   var() 引用）/真死候选}——新增零消费 token 需登记（消费矩阵哨兵——对齐 L11 组件版）

### 5.5 测试二层（覆盖哨兵 ≥2 层）

1. **契约 harness**（`<Comp>.test.ts`——mount/render/createTable 命令流断言）
2. **showcase comp**（`apps/showcase/test/comp-<id>.test.ts`——真实 DOM：
   浮层断言「在哪」（assertPopupGeometry）· 表单断言值回流 · 交互断言操作→状态）

### 5.6 红线（机制化——写错即响）

| 红线 | 机制 |
| --- | --- |
| 空串=空洞 · isHoleKind/isTextKind 单源 | audit:semantics |
| 硬编码色/字号 | audit:theme + style-audit S1/S6 |
| 状态变体类未定义 | layout-inventory L3 |
| 受控回流未门控 · 死变量/死函数 | audit:interactivity |
| renderFn 同步段 timer · 全局 window | effect-guard + audit:vdom |
| 交互面无测试断言 | audit:interactivity L2 |
| 事件进 attrs / value 走 attribute | 契约 7/8 |
| div/span/a 冒充按钮（onClick 无键盘语义——role/tabIndex/onKeyDown/href 至少其一） | **audit:health C3-①**（豁免登记：拦截语义/父面键盘完整/装饰反馈/指针面等价） |
| as any 新增（组件面——只降不升） | audit:health C3-②（基线 0——0.93.1 后） |
| tree-shake 失效（未用组件残留产物） | audit:health C3-③（特征探针——真使用登记） |
| i18n 裸文案（有机制面组件中文用户可见文案不走 ctx.i18n/editorText/SL./labels） | **audit:health C4-①**（文件级登记制——fallback 形态 + 数据层/定义表豁免内联） |
| CSS 死类（css 定义类全库词干无生成者——动态拼接豁免 wf-hl-*/wf-md-*） | audit:health C4-②（登记表防空表防回潮——W2 清 0） |

### 5.7 注册与文档

`src/client/components/index.ts` 导出 · `apps/showcase/src/registry/components.ts`
**追加不替换**（四字段 + gotchas）· demos 注册（组件名=demo 键）·
style-audit 文件数基线 +1 · 覆盖哨兵跑绿（`scripts/audit-component-coverage.mjs`）

### 5.8 修改纪律

范围：应用层修用例 · 组件层修组件 · **核心层修核心**（引擎 bug 透过组件暴露）·
R-03：类名/结构变更**反查测试选择器**（`[class*="..."]` 定位器）·
行为变化**必带契约测试** · 机制化优先（能进审计不靠记忆）

---

### 6.1 认证接线范式（fullstack W4——onRefresh 时序契约）

```ts
// uiServe options（v3-main.tsx）——auth 客户端接线（token 双源防线）
auth: auth({ storage, onAuth: (c) => {...}, onRefresh: async () => {
  // onRefresh 闭包直引（2027-09 教训：间接层 authRef 曾致 401 死循环——
  // refresh 后 token 未更新——闭包直引 source 是唯一的）
  const ok = await api.post('/api/auth/refresh', undefined, { skipAuth: true })
  ...
}})
```

- **时序契约**：onRefresh 返回 true 语义 = token 已重写（storage 就绪）——
  false/异常 = 401 踢登录——**未配置 onRefresh → refresh() 恒 false + warn**
  （机制化防线——401 时 console.warn 提示「未接线」——不再静默）
- 401 → refresh 重试一次（ApiClient 层）→ 仍失败清 token 跳登录（兜底）

---

## 6. 前端架构导论

```
浏览器导航/URL ──► UIRouter（共享 trie 内核 src/shared/router/）
                      │
                    uiServe ──► 渲染周期（src/client/vdom/core/v2/cycle.ts）
                      │            build/diff → 命令流（13 种 NDJSON）
                      │            → apply（DOM）→ cleanup（卸载）
                      └──► ctx 中间件（router/api/auth/ws/i18n/confirm/toast）
```

- **命令流即文档**：13 种命令（create/insert/remove/setProp/…）序列化可回放——
  `src/client/vdom/core/patch/types.ts` 类型定义就是协议
- **状态机**：NodeState/CompState/IntervalState——`patch/state-machine.ts` 单一实现源
- **SSR ≡ SPA 首帧**：uiSsr 同路由器同 bundle——吸收零差异
- hooks 面：`src/client/vdom/hooks/`（useAsyncData/useObservable/signal——getter 纪律）
- 全链路 Observable（cycle/observable.ts）——组合/取消/回放四优势

## 7. 关键范式

- **命令式弹窗唯一形态**：`ctx.ui.openPopup(opts)` → PopupHandle——`src/client/vdom/hooks/popup-manager.ts`
  ——**anchor 必传**（无 anchor 触发按钮被当外部点击 + toggle 死循环）
- **焦点管理三范式**：`src/client/components/` 内实现 + `src/test/scenario/e2e-focus*.test.ts`
  场景断言（Trap 浮层 / 可交互 div 键盘可达 / 列表 roving focus）
- **受控输入纪律**：onInput 逐键 + onChange 失焦——ChatInput 实现即示例
- **getter 纪律**：一切会变化的值 = `() => T`——任意位置调用取最新
- **组件定时器**：工厂期创建 + `ctx.ui.hold` 注册清理（renderFn 窗口内建 timer = dev warn）

---

### 7.1 页面数据世代（web W1——useAsyncData 首选手册）

**为什么迁（v2 段复用实录）**：老世代 `load() + ctx.render()` 在工厂期异步启动
——v2 段复用语义下**工厂不重跑 → 数据永不刷新**（导航返回/同会话停滞——
Templates 迁移先例）。**getter 快照 bug（Agents W1 实录）**：`const agents =
getAgents() ?? []` 在**工厂期**解构 = 渲染用旧快照（state$ 更新后不显示）——
**必须在 renderFn 内读**（getter 纪律的页面级体现）。

**怎么迁（5 行范本）**：

```ts
export const Agents: Component = (_p, ctx) => {
  const [getAgents, reloadAgents] = ctx.ui.useAsyncData(async () => {
    return (await ctx.api.get(`/api/agents`)).agents ?? []
  }, 'agents-page')            // 同 key 并发合并 · key 稳定（页面级）
  let qValue = ''              // 搜索闭包（getter 纪律）
  return () => {
    const agents = getAgents() ?? []        // 渲染期读最新（不是工厂期！）
    const loading = getAgents() === null     // null = loading 态
    return h('ul', {}, agents.map(...))
  }
}
```

**迁移后得到什么**：① 同 key 并发合并（多次挂载 1 次请求）② 竞态取消
（switchMap——快速搜索乱序响应丢弃）③ 缓存保留（重挂载零请求——导航返回
瞬时）④ reload 显式刷新（删除/变更后服务器权威）。搜索面：q 闭包 +
debounce(reload)——触发读最新 q。

**哨兵**：`apps/agent-platform/scripts/audit-page-generations.mjs`（async 工厂
= 红 exit 1——工厂同步契约；老世代标记 = 黄报——迁移进度可见）。

---

> **运行**：`npm run test:client`（428 契约）· `npm run test:scenario`（123 场景）·
> `npm run test:showcase`（324 组件测试）——全量防线见 AGENTS.md §1。
