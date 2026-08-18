# vdom-x 契约测试与 hooks 面调研（2026-12）

> 背景：vdom4 迁移组件库逐个踩坑（9 个引擎缺口）——每个坑都是组件库依赖的能力。
> 本文沉淀两件事：① 组件库 hooks/能力面全量调研（ctx.ui 面设计的依据）；
> ② `src/test/vdom-x.test.ts` 契约测试（vdom5 验收标准——不再逐个组件试点）。

## 1. 调研结论：组件库 ctx.ui 使用矩阵（src/components/* 全量统计）

| hook | 组件数 | 组件 | 评级 |
|------|-------|------|------|
| `ui.render` | 250 处（全组件） | 统一渲染原语（ctx.render 闭包绑定） | **核心** |
| `usePopup` | 28 | Img/TreeSelect/Menubar/SheetGrid/Tour/NavMenu/Chart/Modal/ContextMenu/Cascader/Command/SlideCanvas/ActionSheet/AutoComplete/DatePicker/Drawer/Dropdown/Editor/HoverCard/Mentions/Menu/Notification/Popconfirm/Popover/Select/Toast/Tooltip | **核心** |
| `useControlled` | 11 | Collapse/CheckboxGroup/Pagination/SegmentedControl/Rate/Tree/ColorPicker/RadioGroup/Tabs/TagsInput/ToggleGroup | **高频** |
| `useScrollPosition` | 6 | LogViewer/Affix/VirtualTable/Anchor/AiChat/VirtualList | 中频 |
| `useGlobalKey` | 6 | Tour/Modal/Command/ActionSheet/Drawer/DatePicker | 中频 |
| `useOpen` | 4 | Dropdown/HoverCard/Popconfirm/Popover | 中频 |
| `useControlledInput` | 3 | Mentions/AutoComplete/ChatInput | 中频 |
| `useInView` | 3 | InfiniteScroll/BackTop/InView | 中频 |
| `useDragDrop` | 3 | SortableList/FileUpload/Kanban | 中频 |
| `usePopupPosition` | 1 | Affix | 低频（**usePopup 已内部使用——组件侧可删**） |
| `useTween` | 1 | StatCard | 低频（纯数学——**可 import 化**） |
| `useDrag` | 1 | Resizable（另 3 组件经 useDragDrop） | 低频 |
| `useReducedMotion` | 1 | StatCard | 低频（useMedia 特例——**可合并**） |
| `useStableRef` | 1 | Select | 低频（**引擎自动稳定 ref 后删除**） |
| `useVisualViewport` | 1 | AiChat | 低频 |
| `useChat` | 1 | AiChat | 低频（复杂专用） |
| `useBreakpoint` | 3 | Grid/Layout/NavMenu | 中频 |
| `useExternal` | 0 组件 | （测试 mock 中出现——业务/demo 用） | **删除候选**（保留 createStore 原语） |
| `useMedia` | 0 | （useBreakpoint 内部） | **删除候选**（内部实现） |
| `usePresence` | 0 直接 | （usePopup 内部——Modal/Drawer 经 usePopup） | **删除候选**（内部实现） |
| `useLongPress` / `useHoverCapable` / `useAsync` | 0 | — | **删除** |

### ctx 其他注入面

| 面 | 使用 | 评级 |
|----|------|------|
| `ctx.browser` | 48 处 | 核心（环境 API——SSR/测试三态） |
| `ctx.confirm` / `ctx.toast` / `ctx.notification` | 命令式中间件 | 保留 |
| `ctx.data` | 工厂层取数 | 核心（三场景管道） |
| `ctx.render(['id'])` | **0 处** | **删除候选**（跨组件渲染走 useExternal/selfId 语义——无组件使用） |
| `ctx.ui.render()` 无参 | 250 处 | 唯一渲染原语 |

## 2. ctx.ui 面设计建议（vdom5）

### 分层（不是删除 ctx.ui——是裁剪 + import 化纯函数）

**ctx.ui 保留（生命周期绑定面——需要引擎上下文：compId/调度/卸载）**：
`render` / `usePopup` / `useControlled` / `useOpen` / `useControlledInput` /
`useScrollPosition` / `useGlobalKey` / `useInView` / `useDragDrop` / `useChat` /
`useBreakpoint` / `useVisualViewport` / `useDrag` / `onUnmount`

**ctx.ui 删除（0 组件使用或内部实现）**：
`useExternal`（createStore 保留为独立原语——`createStore` + 订阅由引擎自动接线）、
`useMedia`（useBreakpoint 内部）、`usePresence`（usePopup 内部）、
`useLongPress` / `useHoverCapable` / `useAsync`（0 使用）

**ctx.ui 合并**：
`useOpen` → useControlled 的布尔特例（保留薄封装——4 组件用，语义清晰）
`useReducedMotion` → useMedia 特例（StatCard 1 处）
`usePopupPosition` → usePopup 内部（Affix 改用 useScrollPosition——1 处迁移）

**import 化（纯函数无引擎依赖）**：
`useTween`（数学补间——StatCard）——`import { useTween } from 'weifuwu/client'`
`ctx.render(['id'])` 删除（0 使用）

**引擎责任上移（组件不该管的）**：
`useStableRef` → 引擎自动稳定 ref（ref 函数引用不变——组件零成本）

### Fragment / Portal 标准（2026-12 内化决策）

| 原语 | 使用 | 结论 |
|------|------|------|
| `createPortal` | 组件库 **0 处直接调用**（28 浮层组件全走 usePopup）；hooks 内部 2 处 | **内化**：usePopup 的内部实现机制——用户不直接调用 |
| `usePopup` | 28 组件 | **弹层唯一入口**（定位/关闭/Escape/夹紧/presence/mask/portal 全包） |
| `Fragment` | 组件库 1 处（Markdown keyed 文本——数组无法带 key） | **内化**：用户不 import——数组 = 隐式 Fragment（任意嵌套递归展开——X-B5）；`<></>` 编译器自动导入；符号保留仅 keyed 文本/多根项 |
| portal 判定 | 结构性（symbol + props.portalKey——不依赖 symbol 恒等）| 引擎内部机制（vdom3 产物兼容） |

**内化理由（统一写法——开发者不易写错）**：① 组件库 0 直接使用（无迁移成本）；
② usePopup 是完整弹层抽象——createPortal 是裸机制（暴露 = 用户自管全部细节）；
③ **结构符号不暴露**——数组（隐式 Fragment 任意嵌套展开）/`<></>`/usePopup——
开发者只写业务结构，不写引擎结构；④ 单一入口 = 一致行为/测试/文档。
vdom3 导出保留（兼容）。契约测试的 Portal 面全部经 usePopup 验证。

**嵌套数组语义（X-B5）**：`[x, [y, [z, k], l], m]` = 递归展开为扁平 children
序列（任意深度——纯函数一次到位——路径按展开后位置——深度变化不漂移）。
取代「两层 flatMap + 每轮 build 再展开」的隐式累积行为。

**兼容边界（vdom3）**：vdom3 的 buildVNode 不接受数组输入——组件输出数组
（隐式 Fragment）是 vdom4/vdom5 契约（X-B5）；组件库存量保持 `h(Fragment, ...)`
包装（引擎无关兼容写法——两种写法 DOM 等价）。vdom5 必须支持数组输出——
组件库可逐步去 Fragment。

## 3. vdom-x.test.ts 契约设计

**定位**：引擎实现无关的验收测试。新引擎（vdom5）实现后：
**引擎入口一行替换（`src/test/vdom-x.test.ts` 头部的 import）——全绿 = 组件库可零改动迁移**。

**能力面覆盖**（37 测试）：

```
A 渲染原语（6）：挂载+组件级更新 / 父更新 props / 剪枝 / 根不剪枝 /
                async renderFn（ctx.data）/ 实例复用状态保持
B 列表（4）：keyed 增删身份 / keyed 重排状态跟随 / 单 keyed 项路径稳定 /
            空洞占位（提交按钮事故回归）
C Portal/Fragment（4）：portal 渲染+更新+移除 / 输出根 portal / keyed 内 portal /
                        Fragment 多根
D usePopup 族（4）：click+外部点击+Escape / presence 退场 / useOpen 受控 /
                    useControlled 受控
E 输入（2）：useControlledInput 焦点保持 / 受控 value 回填
F 事件/浏览器（4）：useGlobalKey / useScrollPosition / 事件重绑 / ctx.browser
G 生命周期（3）：onUnmount / ref 挂载+卸载 / ctx.data 种子+fetch
H 组件库冒烟（10）：Button/Select/Modal/Tree/Carousel/Toast/Tabs/Popover/
                    Collapse/VirtualList（零改动真实渲染）
```

**测试纪律**：只测契约（禁止 import 引擎内部文件）；测试隔离（模块级状态
reset + DOM 清理——beforeEach/afterEach）；真实交互（dispatchEvent/click——不 mock
引擎层）。

## 4. 契约测试抓出的新引擎缺口（本轮——总计 12 个）

| # | 缺口 | 症状 | 修复 |
|---|------|------|------|
| 9 | **portal 内容路径 keyed/unkeyed 翻转** | keyed 单项 [portal]（.k{key}.p）→ 变 [null] 后 unkeyed 空洞（.{i}.p）——远程内容残留（X-C3） | 空洞分支按旧数组全 keyed 判定推导移除路径 |
| 10 | **keyed 移除循环缺 portal 清理** | keyed 旧 portal 项（无新 key）只 remove 锚——远程内容残留 | 移除循环补 `remove ${path}.k${key}.p` |
| 11 | **组件输出变 null 缺 portal 清理** | Modal 退场 finishExit → renderFn null——clearSlot 只清本地锚——#__wf_portal 残留（X-H3） | diffComponent null 分支补 `remove ${compId}.c.p` |
| 12 | **ref(null) 清理缺失** | callRefCleanupNode no-op——ref 纪律的卸载分支不工作（X-G2） | apply refs 表（create 记录/移除 ref(null)） |

## 5. 累计引擎缺口清单（vdom4 迁移全记录——vdom5 必查）

1. genVNode 缺 Portal 分支（输出根是浮层——Modal）
2. build 缺 Portal 分支（内容 .p 路径——组件实例注册）
3. bindElementListener 引擎不兼容（delegate 读 data-v3-id）
4. create/patch setProp 不跳过 ref（ref 函数被 setAttribute）
5. keyed 判定长度依赖（单 keyed 项路径翻转——组件实例漂移）
6. 「旧项多余」分支缺 portal 清理
7. ctx.browser 空对象注入（阻断组件 fallback）
8. keyed 锚 id 槽位冲突（ak{key} 唯一化）
9-12. 见上表
