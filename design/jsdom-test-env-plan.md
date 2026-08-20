# jsdom 测试环境统一计划（testBrowser 唯一入口 + window/document Proxy 全调用追踪）

> 目标（用户决策 2026-12）：**所有测试的 mock 必须基于 jsdom 提供的能力**——
> 浏览器环境只有一个入口 `testBrowser()`；`setupJsdom()` 全局污染入口**删除**；
> `testBrowser()` 内部对 `window`/`document` 包装 Proxy，**每次调用记录 + 可打印**，
> 测试可断言"谁在什么时候对浏览器做了什么"。该纪律已写入 AGENTS §7.1.4（红线）。

---

## 0. 背景与动机

| 现状问题 | 后果 |
|---------|------|
| `setupJsdom()` 把 jsdom 全局注入 `globalThis`（56 个测试文件在用） | 全局污染、测试间共享状态、模块加载时序敏感（import 必须在 setup 之后） |
| 浏览器能力 mock 散落各测试手搓：`globalThis.matchMedia`（StatCard）、`(window as any).matchMedia`（serve.test/coverage-gap ×2）、`(window as any).IntersectionObserver`（×2）、`globalThis.navigator` 重定义（CopyButton/CodeBlock）、`window.scrollTo` 替换（BackTop）、`document.execCommand` | 同一能力 N 套实现、行为漂移、与生产路径（hooks 经 `env.getBrowser()`）不一致 |
| jsdom 29 缺能力清单（实测）：`matchMedia`/`IntersectionObserver`/`ResizeObserver`/`visualViewport`/`CSS.escape`/`URL.createObjectURL`/`navigator.clipboard` 均 undefined；`window.scrollTo` 是 notImplemented 抛错桩 | 每个测试各自补丁，无共享实现 |
| 测试"看不见"组件对浏览器的操作 | 无法断言"渲染期间零直接 window/document 访问"（style-audit 只有源码 grep 静态通道，无运行时通道） |
| **usePopup 等 hooks 在组件测试里全是 mock**（createTestCtx 的 defaultUi/createPopupMock；Modal.test.ts:18 还各自手搓 presence 状态机）——真实 usePopup 只在 serve.test.ts 测 4 个场景 | 浮层组件（23 个）的 portal/外部点击/Escape/夹紧/退场行为在组件层零覆盖 |

## 1. 现状盘点（实测，2026-12）

### 1.1 测试文件全景（177 个）

| 类别 | 数量 | 说明 |
|------|------|------|
| 已用 testBrowser | 15 | vdom 引擎测试（serve.test/coverage-gap/vdom-contract 等）——但内部仍手搓 matchMedia/IO mock |
| 用 setupJsdom（全局污染） | 55 | 其中 **A 组 34 个无需 DOM**（去除后全绿——纯 VNode 断言）；**B 组 21 个需 DOM**（报 `window is not defined`） |
| 纯 createTestCtx（无 jsdom） | 85 | VNode 层测试——hooks 全 mock——**usePopup 等真实行为零覆盖** |
| 两者都不用（纯单元） | 22 | type-flow/parser/model/qr/highlight 等——不触碰浏览器能力 |

### 1.2 jsdom 29 能力实测

有：`getComputedStyle`/`getSelection`/`PointerEvent`/`Event`/`MutationObserver`/
`requestAnimationFrame`（pretendToBeVisual）/`localStorage`/`Blob`。
无：`matchMedia`/`IntersectionObserver`/`ResizeObserver`/`visualViewport`/
`CSS.escape`/`URL.createObjectURL`/`navigator.clipboard`；`scrollTo` 是
notImplemented 抛错桩。

## 2. 设计 P1：testBrowser() 升级——Proxy + Trace

### 2.1 接口

```ts
// src/client/vdom/setup.ts
interface TraceOptions {
  /** 记录开关（默认 true——零开销记录，内存数组） */
  record?: boolean
  /** 每次调用 console 打印（默认 false——见 2.4 噪音决策；env WF_JS_TRACE=1 全局开） */
  log?: boolean
  /** 只打印/记录匹配 path 子串的调用（如 'scrollTo'、'querySelector'） */
  filter?: string | RegExp
}
function testBrowser(opts?: TraceOptions): Browser & {
  /** 全调用追踪（window/document 及返回的 DOM 节点） */
  trace: TraceLog
}

interface TraceEntry {
  seq: number          // 全局序号（时间序）
  path: string         // 'document.createElement' / 'window.addEventListener'
  kind: 'call' | 'get' | 'set'
  args?: unknown[]     // call 参数
  ret?: unknown        // 返回值摘要（'[Element div]'——不展开大对象）
}
interface TraceLog {
  entries: TraceEntry[]
  filter(sub: string | RegExp): TraceEntry[]   // 按 path 过滤（测试断言）
  count(sub: string | RegExp): number          // 次数统计（如 addEventListener 泄漏检测）
  clear(): void                                // 每用例间清空
  print(entries?: TraceEntry[]): void          // 按时间序打印（失败时 dump）
}
```

### 2.2 Proxy 包装规则（testBrowser 内部——唯一实现）

```
dom.window ──Proxy(W)──► trace('window.xxx')
dom.window.document ──Proxy(D)──► trace('document.xxx')
方法返回的 DOM 节点（createElement/querySelector/body/...）──递归 Proxy──► trace('el.appendChild')
```

- **递归包装**：`get` 返回值为对象（Element/Node/DocumentFragment/NodeList/
  location/visualViewport/selection…）→ 惰性包一层 Proxy；**深度不限但只包
  对象与函数**（函数包 apply 记录调用）。
- **身份保持（硬性）**：`WeakMap<target, proxy>` 缓存——同一 target 恒返回
  同一 proxy。**vdom 测试的 `assertKept` 断言 `after === before`（同 key 复用
  项 DOM 引用不变）依赖 `===` 恒等——无缓存则全组崩**。
- **instanceof 安全**：Proxy 保持原型链——`el instanceof HTMLElement`、
  `node.nodeType` 等语义不变（vdom 的 `shapeOf` 用 nodeType 判定）。
- **只读属性**：`window.location`/`document.body` 等 getter → 在 get 拦截里
  返回包装后的对象（不触发 set 拦截）；对 Proxy 的 set 只记录不改语义。
- **性能预算**：`{ record: false }` 完全关闭（零 Proxy 开销——兜底全量
  测试 ≤15s 预算）；record 模式只 push 字符串路径 + 摘要，不 JSON.stringify
  大对象。

### 2.3 记录/打印格式

```
// 打印（log: true 或 WF_JS_TRACE=1）：
[jsdom] document.createElement('div') → [Element div]
[jsdom] document.querySelector('.wf-collapse') → null
[jsdom] window.addEventListener('resize', fn) → undefined
[jsdom] el.appendChild([Element div]) → [Element div]      // el = 节点 id 摘要

// 断言：
trace.count('addEventListener') === 3            // 监听注册数量
trace.filter('getBoundingClientRect').length > 0 // 定位读取次数
assert.equal(trace.filter('window.matchMedia').length, 0)  // 未直接访问 matchMedia
```

### 2.4 噪音决策（诚实说明）

一次 render 的 DOM 操作数百次——**无条件 console 打印会淹没输出并冲击
≤15s 全量预算**。因此：

- **记录（record）默认开**：`trace.entries` 保证每次调用都被记录（"保证"
  语义落到内存 trace）；
- **打印（log）默认关**：`{ log: true }` 或 `WF_JS_TRACE=1` 打开"每次调用
  打印"；`filter` 精确到路径子串（如 `WF_JS_TRACE=scrollTo node --test ...`）。
- 失败诊断路径：测试 `catch` 后 `trace.print()` dump 全调用序列。

## 3. 设计 P2：jsdom 缺失能力 Polyfill 收敛（setup.ts 一处实现）

jsdom 29 缺 `matchMedia`/`IntersectionObserver`/`ResizeObserver`/`visualViewport`/
`CSS.escape`/`URL.createObjectURL`/`navigator.clipboard`，且 `scrollTo` 是抛错桩。
**统一在 testBrowser() 内安装 `installJsdomPolyfills(win)`**——全部基于 jsdom
自身原语（Event/EventTarget/构造器），测试经 testBrowser 面驱动，禁止各测手搓：

| 能力 | polyfill 实现 | 测试驱动面 |
|------|--------------|-----------|
| `matchMedia` | 基于 jsdom `EventTarget` 的 `MediaQueryList`（`matches`/`media`/`addEventListener('change')`） | `browser.setMediaQueries({ '(prefers-reduced-motion: reduce)': true })` 批量设定；`browser.matchMedia(q)` 读取 |
| `IntersectionObserver` | 确定性 fake：observe 登记 + 手动触发（jsdom 无布局引擎，真 IO 不可实现——诚实裁剪） | `browser.fireIO(target, { isIntersecting: true })` → 触发 observer 回调 |
| `ResizeObserver` | 同上模式（登记 + `browser.fireResize(el, { width, height })`） | 同上 |
| `visualViewport` | 基于 jsdom 对象 + `Object.defineProperty` 可编程 | `browser.setViewport({ height, offsetTop })` |
| `scrollTo` | 真实现：写 `scrollingElement.scrollTop`（jsdom 桩是 notImplemented 抛错） | `browser.scrollTop()` 读取 |
| `navigator.clipboard` | `writeText` → 记录到可断言缓冲 | `browser.__clipboard` / trace 断言 |
| `URL.createObjectURL/revokeObjectURL` | 简单对象 URL 工厂 | FilePreview 下载测试 |
| `CSS.escape` | 直接实现（规范算法） | Markdown/FilePreview 等 |

同时：**删除 `drag-media.ts` 的 globalThis.matchMedia 兜底通道**
（`hooks/drag-media.ts:74-75`）——改为 `env.getBrowser()` 唯一通道——堵死
"测试全局 mock 浏览器能力"的旁路，强制所有测试经 testBrowser 注入。

## 4. 设计 P3：全量统一迁移到 testBrowser()（177 个测试文件）

> 用户决策（追问确认）：**没有使用 testBrowser() 的测试一律改为 testBrowser()**——
> ① 消灭 setupJsdom 全局污染；② 测试不再各自手搓浏览器能力 mock；
> ③ usePopup 等 hooks 从 mock 切换为**真实实现跑在 jsdom 上**。
> 该纪律已写入 AGENTS §7.1.4（红线）。

### 4.0 全景清单（实测，2026-12）

| 类别 | 数量 | 迁移动作 |
|------|------|---------|
| 已用 testBrowser | 15 | 保留（手搓 mock 替换为 polyfill 面——serve.test/coverage-gap） |
| setupJsdom（全局污染） | 55 | A 组 34 个（无需 DOM）删调用；B 组 21 个（需 DOM）→ testBrowser + install/restore |
| 纯 createTestCtx（无 jsdom） | 85 | 接 testBrowser + **真实 hooks ctx**（createTestCtx 升级——见 4.3） |
| 两者都不用（纯单元） | 22 | 不触碰浏览器能力/hooks 的保留（type-flow/parser/model/qr/highlight 等——诚实说明）；触碰的接 testBrowser |

### 4.1 A 组（34 个——不需要 DOM）

- 删除 `import { setupJsdom }` + `setupJsdom()` 调用（实测去后全绿）。
- 例外：StatCard 等使用 `globalThis.matchMedia` 手搓的 → 改为
  `createTestCtx({ browser: testBrowser() })` 注入（reduced-motion 场景走 polyfill）。

### 4.2 B 组（21 个——需要 DOM）

过渡模式（测试主体零改动，隔离保留）：

```ts
import { testBrowser, installJsdomGlobals, restoreJsdomGlobals } from '../../vdom/setup.ts'
const { browser, trace } = testBrowser()

before(() => { installJsdomGlobals(browser) })   // window/document/... 装到 globalThis（来自独立 JSDOM 实例）
after(() => { restoreJsdomGlobals() })           // 恢复原全局——测试间零残留
```

- 新测试/逐步迁移方向：DOM 断言走 `browser.document`、ctx 注入
  `createTestCtx({ browser })`（注入风格——与 uiServe 生产路径同构）。
- **B 组 21 个文件需要真实 DOM 的确认清单**：FilePreview×2/Watermark/Affix/
  ThemeSwitch/SheetGrid/Table/Modal/Cascader/Command/SlideCanvas/CopyButton/
  InfiniteScroll/DatePicker(部分)/Confirm(部分)/Wave/Editor(flow/ai/draft/
  tools/model dom/html)/Popover/Tabs/VirtualList/StatCard(matchMedia 场景)。
- 散落 mock 替换清单：
  - `serve.test.ts`/`coverage-gap.test.ts` 的 `(window as any).matchMedia = ...`
    → `browser.setMediaQueries(...)`；`IntersectionObserver = class {...}`
    → `browser.fireIO(...)`；`visualViewport`/`innerHeight` defineProperty
    → `browser.setViewport(...)`。
  - `CopyButton`/`CodeBlock` 的 `globalThis.navigator` 重定义 → 注入
    `createTestCtx({ browser: { copyText } })`（CopyButton 已在做）或 polyfill。
  - `BackTop` 的 `(window as any).scrollTo = ...` → polyfill scrollTo + 断言
    `browser.scrollTop()`/trace。
  - `Affix`/`InfiniteScroll` 等 `Object.defineProperty(el, 'getBoundingClientRect')`
    ——保持（这是 jsdom 元素上的真实 rect 桩，属"基于 jsdom"的合法操作；
    可选收敛为 helper `mockRect(browser, el, rect)`）。

### 4.3 createTestCtx 升级：真实 hooks 模式（usePopup 不再模拟）

现状：`createTestCtx()` 的 `ctx.ui` = 手写 mock（defaultUi——usePopup/useMedia/
useScrollPosition/useInView/useControlled/useOpen 全 mock）——23 个浮层组件
测试跑在 mock usePopup 上（Modal.test.ts:18 甚至各自手搓 presence mock），
真实 usePopup 只在 serve.test.ts 测 4 个场景。

升级：**`createTestCtx({ browser })` 传 browser 时 `ctx.ui` = 真实 `createUi(env)`**
（hooks/env.ts——与 renderComponent 同源），env 接 testBrowser：

```ts
// testing.ts 内部（新 helper：createRealUi）
ctx.ui = createUi({
  requestRender: () => { void (ctx as any).render?.() },   // VNode 层 render 由测试显式驱动
  onUnmount: (fn) => unmounts.push(fn),                     // 收集——每用例 dispose（防 document 监听泄漏）
  getBrowser: () => browser,
  nextHookIndex: () => hookSeq.n++,
  getHookState / setHookState: per-ctx Map（跨渲染保持——对齐现有 hookCache）,
  scheduleAfterRender: (fn) => afterRenderQueue.push(fn),
})
```

语义变化（CS-06——行为变更先查旧测试，逐文件适配断言）：
- `popup.setOpen(v)` → `env.requestRender()` → ctx.render（VNode 层测试需
  **手动再 render**——mountComponent 模式已支持同实例 re-render；
  renderVNode 每次新 mount 的测试改为 mountComponent）；
- `popup.portal(content)` 返回 **Portal 组件 vnode**（type 非字符串——断言
  子内容用 props.children 递归——AGENTS §5.4 已注明）；
- 外部点击/Escape：真实 document mousedown/keydown 监听（jsdom
  `dispatchEvent` 驱动——browser.event() 跨 realm 安全）；
- 定位：jsdom rect 全 0 → usePopupPosition 已有 0-rect 防护（保留上一坐标）；
- **监听泄漏**：真实 hooks 注册 document 监听 → 每个 ctx 必须 dispose
  （onUnmounts 逆序执行——每用例 after 清理——全量预算防挂起）。
- mock 保留白名单（诚实裁剪——jsdom 不可实现）：useChat 流式后端/
  useTween 动画时序（可后续用 rAF 真实化）。

### 4.4 迁移批次（实施顺序）

1. **基建**：testBrowser proxy/trace + polyfill（P1/P2）+ createTestCtx 真实
   hooks 模式 + install/restore globals + 契约测试（setup-proxy.test.ts）。
2. **第一批（机械安全）**：55 个 setupJsdom 文件 → testBrowser（A 组删调用、
   B 组 install/restore）——逐文件单跑对照。
3. **第二批（usePopup 真实化）**：85 个 createTestCtx 文件接 testBrowser + 真实
   hooks——**浮层组件优先**（Modal/Drawer/Dropdown/Popover/Tooltip/HoverCard/
   ContextMenu/Confirm/Cascader/DatePicker/Menubar/Mentions/ActionSheet/Tour/
   Command/TreeSelect/NavMenu/Menu/Popconfirm/Select/Img-preview/SheetGrid），
   断言适配（4.3 语义变化表），逐组件迁移。
4. **第三批（收尾）**：22 个纯单元文件确认/接入；serve.test/coverage-gap
   手搓 mock 换 polyfill 面；删除 setupJsdom；grep 归零。

### 4.5 删除 setupJsdom()

- `setup.ts` 删除 `setupJsdom()` 函数体与 `serve.test.ts:1363` 注释引用。
- `grep -rn setupJsdom src/` 归零审计（AGENTS §7.1.4 已写入红线——任何测试
  不得再引入等价全局注入模式）。
- 保留 `testBrowser()` 为**唯一**测试浏览器入口（Browser 接口契约不变——
  `testBrowser()` 返回值附加 `trace` 字段，向后兼容既有 143 处用法）。

## 5. 验证（P4）

1. **新增 `src/client/vdom/setup-proxy.test.ts`**（proxy 自身契约）：
   - 每次调用记录（call/get/set 三态）；`trace.filter/count` 断言；
   - **身份保持**：`browser.document.createElement('div')` 两次 → `===`；
     `assertKept` 语义不破；
   - `instanceof`/`nodeType` 语义不破；只读 getter 正常；
   - `log:true` + `filter` 打印输出格式（capture console）；
   - polyfill：matchMedia 变更事件 → 重渲染；IO fireIO → isIn 响应式；
     scrollTo 真写 scrollTop。
   - createTestCtx 真实 hooks：usePopup portal/外部点击/Escape 端到端（jsdom
     dispatchEvent 驱动）；监听 dispose 清理（每用例后零残留）。
2. **迁移后逐一单文件跑绿**（`timeout 15 node --env-file=.env --test --test-timeout=8000 <file>`）。
3. **组件抽样 + vdom3 组**：Select/Tree/ChatInput/Popover/Modal +
   `'src/client/vdom/vdom3*.test.ts'` 全绿。
4. **全量 `npm test` ≤15s 预算**（record 默认开不影响预算；超时 → 排查
   trace 开销，`{ record: false }` 兜底）。
5. **审计基线**：`grep -rn "setupJsdom\|globalThis.matchMedia\|(window as any)" src/client --include='*.test.ts'` 归零（除 getBoundingClientRect rect 桩）。

## 6. 风险与对策

| 风险 | 对策 |
|------|------|
| deep Proxy 性能（一次 render 数百次 DOM 操作；全量并行 8 并发） | record 只 push 路径+摘要；`{ record: false }` 全关兜底；实测预算 |
| 身份破坏（proxy 每 get 新建 → `===` 断言崩） | `WeakMap<target, proxy>` 缓存——**实现第一优先级** |
| jsdom realm 与 node realm 的 Event 混用（测试 `new (window as any).Event`） | proxy 不改 realm——`browser.event()` 继续跨 realm 安全 |
| 组件经 ctx.browser 的合法调用 vs 直接全局访问无法从 trace 区分 | trace 是"总账"；直接访问检测走 style-audit grep（静态）+ 可选 globalThis getter trap（后续扩展，本计划不含） |
| 迁移期回归（B 组 21 文件行为差异） | install/restore 模式保持全局语义不变；逐文件单跑对照 |
| usePopup 真实化后组件测试语义变化大（23 浮层组件） | 4.3 语义变化表逐条适配；浮层组件优先、逐个迁移单跑；mock 白名单（useChat/useTween）诚实保留 |

## 7. 实施顺序（含用户追问后扩展）

1. **P1a**：`setup.ts` 实现 Proxy + TraceLog + 身份缓存（含 `setup-proxy.test.ts`）——testBrowser 行为不变量先锁死。
2. **P1b**：`installJsdomPolyfills` + 驱动面（setMediaQueries/fireIO/setViewport/scrollTo/clipboard/CSS.escape）。
3. **P2**：删 drag-media.ts 全局 matchMedia 兜底；serve.test/coverage-gap.test 切 polyfill。
4. **P3a（第一批）**：55 个 setupJsdom 文件 → testBrowser（A 组删调用、B 组 install/restore）。
5. **P3b（第二批——usePopup 真实化）**：createTestCtx 升级真实 hooks；85 个 ctx-only
   文件接 testBrowser；浮层组件断言适配（4.3 语义变化表）逐组件迁移。
6. **P3c（第三批）**：22 个纯单元文件确认/接入；删除 setupJsdom()；grep 归零；
   AGENTS §7.1.4 同步（已完成初版）；全量预算验证。
