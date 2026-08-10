# ui-dom ↔ weifuwu/client 对齐分析（components 复用评估）

> **背景**：ui-dom 是"完全独立"的 UIRouter + VDOM（零依赖 client）。但 weifuwu/components
> 的 109 个组件基于 client 契约构建——复用需先对齐。本文档是差距审计 + 路径决策。

## 一、差距审计（ui-dom vs client）

### 1. ctx.ui 原语（components 实际依赖 19 个，ui-dom 只有 4 个）

| components 依赖 | 使用数 | ui-dom | 说明 |
|----------------|--------|--------|------|
| `ctx.ui.render()` | 112 | ✅ | ui-dom 有（组件级/路由级） |
| `ctx.ui.dirty()` | 1 | ✅ | 刚补齐 |
| `ctx.ui.usePopup()` | 16 | ❌ | 弹层组合器（portal/定位/外点关闭/Escape） |
| `ctx.ui.useScrollPosition()` | 9 | ❌ | Affix/VirtualList 用 |
| `ctx.ui.useInView()` | 7 | ❌ | 可见性 |
| `ctx.ui.useTween()` | 5 | ❌ | 动画 |
| `ctx.ui.usePopupPosition()` | 5 | ❌ | 弹层定位 |
| `ctx.ui.useGlobalKey()` | 5 | ❌ | 键盘 |
| `ctx.ui.useOpen()` | 4 | ❌ | 受控/非受控开关 |
| `ctx.ui.useDragDrop()` | 3 | ❌ | 拖拽 |
| `ctx.ui.useChat()` | 3 | ❌ | AI 会话 |
| `ctx.ui.useDrag()` | 2 | ❌ | 拖拽 |
| `ctx.ui.useDialog()` | 2 | ❌ | 对话框状态机 |
| `ctx.ui.useControlledInput()` | 2 | ❌ | 受控输入 |
| `ctx.ui.useAnimationEnd()` | 2 | ❌ | 退场动画 |
| `ctx.ui.useVisualViewport()` | 1 | ❌ | 视口 |
| `ctx.ui.useStableRef()` | 1 | ❌ | 稳定 ref |
| `ctx.ui.useReducedMotion()` | 1 | ❌ | 减动效 |
| `ctx.ui.useControlled()` | 1 | ❌ | 受控通用 |

### 2. VNode / 渲染器行为（components 用的特殊能力）

| 能力 | client | ui-dom | 使用场景 |
|------|--------|--------|---------|
| `createPortal` → `#__wf_portal` | ✅ | ❌ | 16 个弹层组件（§5.4 弹窗纪律强制） |
| `innerHTML` prop | ✅ | ❌ | 17 处（Markdown/Highlight 等） |
| SVG（createElementNS + SVG_TAGS） | ✅ | ❌ | Icon（78 图标） |
| ref 回调（safeCallRef + 卸载 callRefCleanup） | ✅ | ❌ | 第三方库管理（EChart 等） |
| class/className 归一 | ✅ | ⚠️ 仅 class | 组件用 class，SSR 已处理 className |
| style：CSS 变量（setProperty）+ 数字转 px | ✅ | ❌（Object.assign） | `--wf-cols` 等 |
| draggable 枚举（'true'/'false'） | ✅ | ❌ | Kanban |
| value 属性（input/textarea/select 特判） | ✅ | ❌（setAttribute） | 受控表单 |
| select value 在 options 后设置 | ✅ | ❌ | Select |
| Fragment `_childNodes` 范围记录 | ✅ | ❌ | diff 对齐 |
| asyncComponent 三层 + 占位 | ✅ | ❌ | 异步组件 |
| 三态 skip（props+$+ctxVersion 复用旧输出） | ✅ | ❌ | 性能 |
| ensureKeys 自动 key | ✅ | ❌ | keyed diff |
| ErrorBoundary（_errorHandler） | ✅ | ❌ | 错误隔离 |

### 3. ctx 注入（components 依赖）

| 注入 | 使用数 | 说明 |
|------|--------|------|
| `ctx.browser`（copyText/setHash/query） | 35 | 环境抽象（§5.5） |
| `ctx.toast` / `ctx.confirm` / `ctx.notification` | 47 | 命令式中间件 |
| `ctx.i`（i18n 简写） | 1 | i18n |
| `ctx.i18n` | — | i18n 注入 |

### 4. 组件模型

- `Component<P, C>` 泛型（FS-02 ctx 注入编译期保证）——ui-dom 无
- `asyncComponent()` 工厂（三层：工厂/mount/render）——ui-dom handler 是单层

## 二、两条路径

### 路径 A：ui-dom 补齐 client 契约（保持独立）

逐步实现 19 个 ctx.ui 原语 + Portal/SVG/innerHTML/ref/class/style/select/value +
ctx.browser/toast/confirm/notification + Component 泛型……

**工作量**：≈ 重写 client/ui.ts（500 行）+ render/diff 补全（≈600 行）——几乎等于把 client 复制到 ui-dom。
**问题**：两套实现长期维护双份；微小的行为差异（CSS 变量/ref 清理/三态 skip）会逐步暴露为组件 bug。

### 路径 B：ui-dom 复用 client 渲染运行时（推荐）

UIRouter 直接调用 **client 的 renderValue/patchValue/createUi + registry**——
ui-dom 从"独立 VDOM"退化为"client 之上的路由层"：

```
UIRouter (路由匹配/中间件链/handler=async 组件/ctx.params/query/$.路由实例)
  └─ 落地复用 client VDOM：renderValue/patchValue/createUi（components 同一契约）
  └─ ctx 注入：ctx.ui = createUi(...)（components 的 19 个原语全部可用）
  └─ ctx.toast/confirm/notification/browser/i18n 由中间件注入
```

**好处**：
- components **零改动直接复用**（同一 ctx.ui 契约、同一 VNode、同一渲染器）
- 不双份维护渲染器；client 的修 bug（CSS 变量/ref/draggable）自动生效
- UIRouter 仍是"新路由形态"（handler = async 组件，定稿架构），只是落地层复用

**代价**：
- 放弃"ui-dom 完全独立"（用户最初约束）——但**方向已转向"复用 components"**
- 需解决 client 模块级状态共享（§6.1：createApp 与 UIRouter 若共享 idRegistry 会交叉命中）
  ——S2 已规划 registry 工厂化（createRegistry 注入），正为此

### 建议：路径 B

定稿架构（handler=async 组件/middleware/ctx.params）是**路由形态**的进步；
VDOM 是成熟稳定的（1962 测试验证）——没有理由双份。UIRouter 作为 client 的
路由中间件形态接入（类似 createApp/router 的平行替代），components 天然复用。

## 三、路径 B 实施步骤（草案）

1. **registry 工厂化**（S2 已规划）：createRegistry() 局部状态，UIRouter 用它隔离
2. **createUi 实例化**：UIRouter 持有一个 createUi（注入自身 renderByIds/registries），
   组件 ctx 与 createApp 互不干扰
3. **UIRouter 落地**：renderValue/patchValue 接收 UIRouter 的 ctx（含 createUi 的 ctx.ui）
4. **ctx 注入中间件**：toast/confirm/notification/browser/i18n（平行于 createApp）
5. **保留**：ui-dom 现有独立实现作参考/回退，逐步废弃

## 四、验收

- components-demo 跑在 UIRouter 上（无需改组件源码）
- 现有 createApp/router 1962 测试零破坏
- 交互（弹层/受控表单/拖拽）agent-browser 实测

## 五、定稿：渲染运行时归 serve 层（UIRouter 纯路由）

用户裁决：**不改 client**（算法复制到 ui-dom）+ **渲染运行时由 ui serve 完成**。

### 职责划分（对齐后端 serve(router) = HTTP 传输）

```
UIRouter（纯路由）                    serveUI（渲染运行时 = VDOM 落地）
  get(path, handler)                    createRegistry（局部状态隔离）
  use(mw) / use(prefix, sub)            createUi（19 原语注入 ctx.ui）
  match(path) → { handler, params }     renderValue / patchValue / hydrateValue
  ctx.params/query 注入                  ctx.data / ctx.browser 注入
      │  产 VNode                         组件 $ dirty → renderByIds（局部）
      └──────────── VNode ──────────→    URL 监听 → UIRouter 匹配 → 落地 DOM
```

- UIRouter 不碰渲染（无 _renderAsync 落地）；handler 只产 VNode
- serveUI 持有渲染运行时（registry/ui/diff/render/popup-tracker 复制自 client，局部实例）
- components 兼容：VNode 契约（Fragment/Portal symbol）从 client import（身份必须共享），
  渲染算法复制（局部 registry 隔离，不与 createApp 交叉）

### 复制清单（client → ui-dom，全部局部化）

| client 源 | ui-dom 目标 | 说明 |
|-----------|------------|------|
| registry.ts | registry.ts（补全） | 复制 unmountHooks/callRefCleanup/asyncFactory，serve 创建局部实例 |
| render.ts | render.ts（替换） | renderValue/renderComponent/setProp/Portal/SVG/innerHTML/ref |
| diff.ts | diff.ts（新） | patchValue/patchProps/keyed/ensureKeys/三态 skip |
| ui.ts | ui.ts（新） | createUi 19 原语（render/dirty/$/usePopup/useInView/useChat…） |
| app.ts renderByIds | serve.ts | renderByIds/flushDirtyBatch（局部 registry） |
| popup-tracker（提取版） | popup-tracker.ts | 弹层/滚动跟踪系统 |
| browser.ts | browser.ts（复制） | createClientBrowser |
| vnode.ts | vnode.ts（扩展） | Fragment/Portal symbol 从 client import（身份共享） |
| types.ts | types.ts（扩展） | ui 接口 19 原语对齐 WfuiContext |

### uiServe 装配语义（用户裁决 2）

`uiServe(uiRouter, { root })` 调用时**路由已全部注册**（get/use/notFound 已完成）：
- serve 是唯一装配入口：创建渲染运行时（registry + createUi + popup-tracker + browser + ctx.data）
- serve 监听 popstate/hashchange → UIRouter 匹配（params 注入）→ 中间件链 → handler → vnode
  → renderValue/patchValue diff/patch DOM
- UIRouter 无 DOM/渲染/状态（纯路由表 + 匹配 + 中间件链）；渲染运行时全部在 serve 层

### ctx 注入定稿（用户裁决 3）

注入在 **UIRouter**（对齐后端 `app.use(mw)` 累积注入 ctx.xxx）：

```
UIRouter.use 三态重载（运行时按 arg.length 区分）：
  use(AppMiddleware)  (1 参) → _injections 链   ctx.toast/confirm/notification 等
  use(UIMiddleware)   (3 参) → _middlewares 链  layout/SSR（包装 children 产 vnode）
  use(prefix, sub)           → 子路由树

_ensureInjected：首次渲染执行一次注入链（应用级 ctx）
execute/_handle 开头注入 → handler 拿 WfuiContext & C（类型累积）
```

命令式工厂（toast/confirm/notification）复制到 ui-dom：
- 原因：components 版 import client 的 mountVNode（模块级 registry）——ToastHost
  注册到 client 全局，ui-dom 的 renderByIds 查局部 registry → 不渲染
  （AGENTS.md §6.1 toast 根因镜像）
- ui-dom 版：mountVNode/callRefCleanup 用局部 registry；组件复用 components

## 验收记录

| 项 | 内容 | 验证 | 状态 |
|----|------|------|------|
| registry 工厂化 | createRegistry + getRegistry(ctx) 注入（render/diff/ui 局部化） | 400 client 测试全绿（零破坏） | ✅（方案调整：改为复制到 ui-dom，client 已 revert） |
| 渲染运行时复制 | render/diff/hydration/ui(19 原语)/popup-tracker/browser 复制到 ui-dom | typecheck + 自定义组件 5 测试 | ✅ |
| UIRouter 纯路由 | 三态 use（AppMiddleware/UIMiddleware/sub）+ match/execute + params 注入 | 嵌套/段边界/404 测试 | ✅ |
| ctx 注入链 | UIRouter.use(AppMiddleware) 累积类型（对齐后端 app.use） | toast/confirm 注入测试 | ✅ |
| 命令式工厂复制 | Toast/Confirm/Notification（局部 registry） | toast→portal/confirm 确定取消/notification 测试 | ✅ |
| components 复用 | 11 代表组件（Button/Input/Dropdown/Icon/Modal/Tabs/Table…）零修改 | 广测 6 测试 + 浏览器冒烟 | ✅ |
| SSR/hydrate | ssrPage（renderSsr+__DATA__）+ uiServe hydrate（种子命中不重取数） | 测试 + curl + agent-browser 端到端 | ✅ |
| demo 端到端 | apps/ui-router-demo（router 共享 + SSR + hydrate + components + toast） | agent-browser 零错误 | ✅ |
| 文档 | README 模块行 + docs/frontend-ui-dom.md 定稿 | — | ✅ |

## 取代推进记录

| 提交 | 内容 |
|------|------|
| d4a7130 | components 契约归 ui-dom（import 迁移 + client vnode 成壳 + JSX 运行时统一）——1800 测试绿 |
| b8bf30c | jsx-runtime 补 Fragment |
| cf5dfc5 | build.mjs ui-dom 构建 + package exports（weifuwu/ui-dom 可发布消费）——components 外部化指 ui-dom |

**状态**：ui-dom 是契约唯一来源（VNode/Component/h/Fragment/Portal）；client 是兼容壳
（re-export + createApp 实现）。删除 client 剩余：client 的 render/diff/ui/createApp
实现（agent-platform/layouts-demo 在用）——迁移后 client 可删。
