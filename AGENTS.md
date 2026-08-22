# weifuwu — 开发者指南

> 面向 weifuwu **框架开发者/贡献者**：架构约束、编码标准、内部机制。
> 2026-12 重建——以新内置测试框架实测行为为准（测试反向校准——文档与实现对齐）。

---

## 1. 测试命令纪律

| ID | 规则 | 说明 |
| --- | --- | --- |
| R-01 | **运行测试相关命令的 timeout 最多 10 秒** | 卡住（挂起/竞态/等待）用更短 timeout 复跑缩小范围——超时即信号，不无限等待 |

## 2. 测试架构（内置框架——契约层 + 场景层）

```
npm run test:client    → 契约层（101 测试——node 直跑命令流——零浏览器——~0.2s）
npm run test:scenario  → 场景层（109 场景——SSR 服务化 + playwright——真实浏览器——15 文件并发——~15s）
npm run test:showcase  → showcase 组件测试（166 测试——112 组件 157 全覆盖——每组件一个文件——~3min）
npm run test           → 契约 + 场景 + server（db 真库依赖 docker）
```

### 契约层（src/test/contract/——node:test 直跑）

**原理**：引擎决策层（build/diff/transform）输出 `Command[]`——**纯数据**——node 断言命令流（id/顺序/语义）——零浏览器——引擎内部状态可达。

| 文件 | 覆盖 |
| --- | --- |
| vnode/transform | h/jsx 数据面、key 剥离、stateOf/transitionOf 7×7 全分支 |
| build | 首帧命令序列（create/insert/close/done.full）、组件展开挂组件 id、空洞锚、Fragment 平铺、portal 命名空间 |
| diff | setProp 只发变化键、setText 就地、组件复用（mounts 计数）、transform 让位、空洞互换不误删兄弟（§6.3）、keyed 顺移 remove+move / 循环移位冲突重建（.k{key} 实例复用） |
| key/keyed/attrs | keyOf/listKind/identityKey、attrs 只发变化键、事件函数面引用比较（prev 传递） |
| router/store/data/html | 路由参数/通配、createStore、ctx.data 缓存合并、commandToHtml 序列化 |
| events | EVENT_RE on+大写判定（once/only 不误判）、eventName 映射 |
| api | 真实 HTTP fixture（GET/POST/ApiError/onError——不 mock 网络层） |
| auth | token 存储往返/空串归一 null/Bearer scheme/自定义 key+scheme/logout |
| ai-stream | wf: SSE 流式解析（真实 HTTP——token 累积/done/events 记录/错误/abort） |

### 场景层（src/test/scenario/——playwright 真实 DOM）

**机制**（weifuwu 自举——能力示范）：
- `server.ts`：Router + ui 中间件——`/scenario/:id` 页面（空 root 客户端渲染 / ssr 场景 uiSsr 渲染）+ `/api/chat` NDJSON fixture + `/ws` WebSocket fixture——port 0 随机端口
- `main.tsx`：uiServe 收养 + 中间件注入（i18n/ws）——`ctx.stream(vnode)` 渲染
- `e2e*.test.ts`（3 文件并发——每文件各自 spawn server + playwright）：spawn server（stdout 解析端口）→ goto → DOM 断言（childNodes 恒定/outerHTML/引用 ===/portal 归属——真实 DOM 纪律）
- `e2e-shared.ts`：startScenarioServer/openScenario 共享 helper

| 场景 | 锁定契约 |
| --- | --- |
| hole-placeholder | §6.3 占位不误删兄弟（按钮保留——空洞切换位置正确） |
| component-reuse / keyed-reorder | 工厂不重跑状态保持 / keyed 身份跟随 |
| portal-toggle / unmount-dispose | portal 增删 #__wf_portal / dispose 完整清理 |
| diff-update / events-rebind / fragment-expand / ref-lifecycle | 节点不重建（===）/ 引用重绑 / 平铺 / ref 挂载卸载 |
| navigate | 链接拦截 pushState 导航整树替换 |
| ssr-adopt | SSR 结构吸收（首帧复用 DOM——输入焦点/值保持——失败回退重建） |
| use-external/media/popup/chat/scroll/in-view/drag-drop/controlled-input | hooks 全契约（快照 vs getter 用法、受控回调、IO/滚动事件驱动） |
| popup-placement/close-switch/hover/controlled-none/presence/mask/trap | openPopup 参数矩阵（placement 四方向/center/gap/margin 夹紧/关闭开关/受控/none/presence 退场/mask 遮罩/trapFocus+lockScroll） |
| toast-fire/confirm-command | 命令式中间件（toast 自动消失/confirm resolve/notification——BUG#3 回归） |
| use-controlled/breakpoint/tween/drag/visual-viewport | 剩余 hooks（受控/断点/补间/指针拖拽/视口） |
| component-smoke | 组件冒烟（127 项陈列——渲染全 + 点击扫描 console.error 零） |

### showcase 组件层（apps/showcase/test/——每组件一个测试文件）

**形态**（用户决策：一个地址 + 一个组件 + 独立运行——小步快跑不批量）：`comp-<id>.test.ts`（112 文件——157 组件全覆盖）——单独运行 `node --env-file=.env --test apps/showcase/test/comp-<id>.test.ts`；`showcase-shared.ts` 提供 startShowcaseServer（随机端口）/openShowcase（错误收集）——能力面出发（先读 props 接口清单→demo 覆盖 + 无 demo 走场景层 cap-）——**v2 别名路由**（tree-v2/cascader-v2/calendar-v2 = 主页面别名——主页面覆盖即可）
| deep-*（54 组件） | 组件深度交互（表单输入/选择/导航展示/浮层/表单校验/重组件/AI 对话/文件上传——参数行为断言） |
| style-update / event-guard / open-guard | style 整体替换清空 / 事件非函数 warn / 受控缺回调 warn |

### 已探明契约（测试反向校准——用法红线）

1. **keyed 循环移位** = 冲突重建（DOM 重建——组件 `.k{key}` 实例复用状态保持）——环状 id 依赖（流式 remap 必冲突）——顺移才 move
2. **ref apply 时序**：ref 在 apply 阶段调用——renderFn 读上一拍快照（render-only 语义——显示滞后一拍）
3. **SSR 吸收**：uiServe 首帧 root 有内容 → DFS 序游标结构对齐复用——mismatch → 原子回退清空重建（无 data-v3-id——纯结构匹配）
4. **create attrs 不含事件**（函数过滤）——事件经事件表（diff setProp 路径注册——首帧函数也经事件通道）
5. **style 整体替换**：style 对象 = 组件声明完整样式——applyStyle 先清空旧值（键消失不残留）
6. **useMedia 返回快照**——必须在 renderFn 内调用（mount 闭包永不更新）——useExternal 是 getter/handle 可 mount（弹窗经 openPopup 命令式——无 hook）
7. **useChat.messages 是数组替换**——useExternal mount 闭包失效——AiChat 标准模式：subscribe(cb → ctx.render) + 渲染期读 getter
8. **useControlledInput**：onInput 事件（逐键——onChange 映射 change 失焦才触发）——setKeyword 内部态 + setValue 回流
9. **i18n/ws 无自动渲染**——setLocale 后手动 render——ws handler 是 { open, message } 对象
10. **事件名映射**：onClick → click、onDoubleClick → doubleclick（非 dblclick）
11. **create attrs 的 value 必须走 property 通道**：`setAttribute('value')` 对 textarea 无效（IDL 不设——值来自 property/children）——applyAttribute 统一 property（与 innerHTML/textContent 同类）
12. **useScrollPosition 目标容器必须传 null 而非 window fallback**：`getScroller: () => el ?? window` 首帧 el 未挂载 → 绑定 window——el 后挂载永不重绑（滚动监听失效）——`?? null` 触发重试重绑（VirtualTable 虚拟化不更新实证）
13. **VirtualTable 排序是字典序**（字符串比较——用户10000 在 用户2 前）——虚拟化滚动容器是 `.wf-virtual-table-body`（外层不滚）；Slider marks 对齐断言必须轮询等布局稳定（全量并发字体/CSS 偶发未稳定）
14. **命令式弹窗唯一形态**（2027-03 定稿——design/imperative-popup-plan.md）：
    `ctx.ui.openPopup(opts)` → PopupHandle（toast 心智——调用点构建内容——
    内核自管理挂载/更新/卸载/销毁）——usePopup/portal()/Portal vnode/
    removePortal 全部删除——组件输出纯业务（无槽无游离调用）——组件内部
    句柄同步样板（受控 + 内容更新 + onClose + 卸载清理——~10 行）——
    **anchor 必传**（无 anchor 时 closeOnOutside 把触发按钮当外部点击关闭
    → click 又 toggle 重开死循环——portal-toggle 测试挂起实证）
15. **Slider marks/垂直对齐断言必须 deadline 轮询**（evaluate 快——次数上限
    不够等字体加载——全量并发偶发——5s 时长上限根治）
16. **投影维度纪律（FRAG 槽位推进——fuzz 多种子 1200 对实证）**：FRAG vnode
    声明 1 项但投影占 N 连续槽位——**所有按数组索引 +1 推进的循环（build
    fragment/array 展开、renderNative children、removeVNodeTree 递归、
    transitionFragment items、尾部缩短）必须用 slotCount(c) 槽位推进 +
    最后槽位 ref**——否则 id 覆盖（create 幂等涂改）/节点残留（div root.3
    幽灵）/顺序错乱（[0,2,3,1]）——slotCount 单一实现源
    （node/children.ts）
17. **状态机化验证体系（P1-P5——验收纪律）**：
    - reconcile.test.ts（契约层 14 测试）：Sim 命令流模拟器（终态等价
      三面对账 S_DOM/S_EVT/S_INST）+ 共享状态机规格（patch/state-machine.ts
      ——NodeState 迁移表：create/insert/close/remove/setText/setProp/move/
      done——Post 违例 throw）+ 多种子 fuzz（42/7/2026 × 400 对零不等价）
    - e2e-reconcile（场景层 5 测试）：auditDom 真实 DOM 对账（id 唯一/
      格式/兄弟连续/投影完整）+ dev 模式（window.__WF_DEV__ 注入
      devVerify——命令消费后 Post 断言 console.error）
    - **隐式路径纪律**：diffSlot/transitionOf/diffSame 落空分支必须显式
      Reject（throw）或显式迁移——静默 no-op 是违例（fuzz#79 教训——
      number↔string 文本交叉落空）
    - **区间语义纪律**：移除必须按区间（removeVNodeTree——FRAG/数组/组件
      unmount 全形态）；卸载递归（disposeComponent 前缀）；函数面 diff
      对称（旧有新无 → setProp undefined 解绑）

18. **vdom 内部架构：状态机 + 事件流（方案 3 定稿——2026-XX）**：

    ### 事件流（13 种命令——NDJSON 可序列化——生成端唯一产物）
    create/createText/createAnchor/insert/move/remove/setText/setProp/
    ref/unref/mount/unmount/close/done——**命令流必须完整自足**：
    每处移除 = 完整区间（removeVNodeTree）+ 组件 unmount——消费端零猜测
    （procRemove 前缀实例卸载已回退——id 前缀与 DOM 槽位前缀重叠——
    deep-tour 回归实证——卸载信息由生成端完整提供）

    ### 三实体状态机
    ```
    NodeState:      ABSENT → CREATED → INSERTED → ACTIVE → REMOVED
    CompState:      UNMOUNTED → MOUNTING → MOUNTED → UNMOUNTING
    IntervalState:  COLLAPSED（0 宽锚）→ EXPANDED（N 连续槽位）
    ```
    - 规格单一实现源：patch/state-machine.ts（Sim 与 devVerify 共用——
      消灭双实现漂移）
    - 消费端（proc*）保持幂等防御（生产容错）——防御性 return 必须标注
      Reject 语义（P2 审计）——不允许静默吞掉合法命令的副作用

    ### 组件输出判别联合（方案 3——null 结构性消除——编译器穷尽）
    ```ts
    /** 组件输出归一化——null 从内部流通消失——消费点 switch(kind) 穷尽——
     *  遗漏分支 = 编译错误（而非运行时静默） */
    type CompOutput =
      | { kind: 'vnode'; v: VNode }            // 单节点（元素/组件/文本）
      | { kind: 'hole' }                        // 空洞锚（原 null——显式化）
      | { kind: 'array'; items: VNodeChild[] }  // 多根（compId 子空间）
    ```
    - **组件输出 id 空间规则（C2）**：null/数组/组件输出统一挂 compId
      子空间（compId.0 / compId.i——与兄弟槽位隔离）；元素/文本输出挂
      槽位 id（锚点法）——outputBase 为清理基线单一入口
    - **null 纪律**：lastOutput 条件只用 `!== undefined`（覆盖 null 空洞
      输出——锚必须清理）——禁止 `!== null`（4 处遗漏实证——an:root.0(div)
      幽灵/锚残留）

    ### 验证体系（四层）
    ```
    Sim（契约层 reconcile.test.ts）    —— 终态等价三面对账 + 状态机 Post
    devVerify（patch/verify.ts）       —— 真实浏览器命令消费后断言（dev only）
    auditDom（场景层 e2e-reconcile）   —— id 唯一/格式/兄弟连续/投影完整
    fuzz（多种子 × 400 对）            —— 静态树 1200 对 + 组件树 300 对
    ```
    - 组件树 fuzz 收敛实录：267/300（89%）→ 1/300（2026-XX）——修复全部
      生产端（移除路径统一 removeVNodeTree + null 条件统一 + root 转换
      oldCompId + Sim 消费端前缀递归对齐）
    - **生成端纪律**：移除路径（transitionElement/transitionComponent/
      diffSame tag 分支/keyed step 1/removeOldSlot）全部收敛 removeVNodeTree
      ——单锚 remove 是违例（子树实例残留）
    - **组件输出特判纪律**：sink 特判（null/数组/组件 → compId 子空间）
      与 outputBase（清理基线）必须同步修改——不同步即锚残留/基线错位

    ### 生产/消费完整性判断（实证）
    - **生产端是根因**：所有语义错误（漏 remove/unmount/错 parent）源于
      命令流生成——修复方向 = 生成端完整自足
    - 消费端（真实）设计为幂等防御——防御性 return 掩盖生产错误——
      对账器（终态等价）是暴露机制
    - Sim 必须与真实消费端逐语义对齐（unmount 前缀递归——disposeComponent
      契约）——对齐缺口 = 验证工具 bug

### 已知边界（诚实裁剪）

- **渲染队列 FIFO/redirect**：serve 内部机制——间接覆盖（无专门测试）
- **useTween/useReducedMotion/useVisualViewport/useDrag（stable.ts）**：未测（headless 无 reduced-motion 偏好——直落分支）
- **hooks/ai-stream.ts、auth 中间件**：未测（长尾）
- **测试竞态**：场景层 3 文件并发（每文件独立 server/browser）——文件内串行——node:test --test-concurrency 是文件级（单文件内串行——对单文件无效）

## 3. 修复归类纪律（应用层 / 组件层 / 核心层）

> **核心理念：核心层修复有利于所有组件以及应用**——排查问题先归类，
> 根因在核心层（vdom 引擎）→ 修核心层（而不是在单个组件/应用打补丁）——
> 一处修复全库受益。组件层异常往往暴露核心层 bug（组件行为是引擎的试金石）。

**排查流程**：

```
问题出现
  → 归类：应用层（demo/示例代码/页面——示例错误）？
         组件层（组件实现——回调/事件/状态/渲染逻辑）？
         核心层（vdom 引擎——diff/渲染管线/hooks/浏览器环境/命令流）？
  → 组件层异常 → 先查是否核心层根因（引擎 bug 透过组件暴露）——是 → 修核心
  → 核心层修复 → 必写契约测试（命令流断言锁定）→ 全库回归
```

**归类原则**：
- 应用层问题修应用（示例代码错误——如 useExternal 误用/受控不回流）——不碰框架
- 组件层问题修组件（组件回调/状态/事件绑定逻辑）——若涉及引擎机制（diff/ref/
  portal/渲染时机）→ 查核心层
- **核心层问题必修核心**（即使组件层能绕开）——引擎修复自动惠及所有组件与应用；
  组件层补丁只修单点（且掩盖根因）

**历史修复归类（归档——三层）**：

| 层 | 修复 | 受益面 |
| --- | --- | --- |
| **核心层** | openPopup 命令式内核（独立实例/版本守卫/定位/交互/presence/mask） | 全部浮层生命周期自管理（零遗漏零残留） |
| | openPopup anchor 必传纪律 | 触发按钮被当外部点击关闭 → 关闭-重开循环（portal-toggle 实证） |
| | openPopup position width 支持（面板宽度跟随 trigger） | DatePicker 面板宽度 |
| | serve.ts 首帧吸收标记判定（hasSsrMark） | 静态预置 HTML 页面（showcase 首页）吸收错配崩溃 |
| | create-client-browser copyText 降级链（clipboard→execCommand） | 全组件复制按钮（非 https 权限拒绝） |
| | applyAttribute 的 value 走 property 通道（textarea 值创建统一） | 全部 textarea/input 值（CodeEditor 代码区空——实测 IDL） |
| | diffSame 其余同态走 transform（组件输出 Text↔元素——emit 无 remove 残留） | 导航崩溃（overlay→colorpicker DOMException——insert 到 Text） |
| | procInsert Text 父防御 + ref 有效性（导航流引用旧树残留） | 导航多轮 NotFoundError/insert 到 Text（用户实测） |
| | useScrollPosition getScroller `?? window` → `?? null`（容器后挂载重绑） | VirtualTable/LogViewer/AiChat 滚动容器（虚拟化不更新——实测） |
| **组件层** | Slider renderFn 删 popup.refresh（hover 卡死） | Slider 自身（根因是组件在 renderFn 调 refresh——引擎 refresh 语义正确） |
| | VideoPlayer video ref 时机 + muted IDL（2 bug） | VideoPlayer 自身 |
| | Tour 视口翻转（placement top 越界） | Tour 自身 |
| | ImageCropper ctx.render（Ui 接口无 render） | ImageCropper 自身 |
| **应用层** | showcase DemoSlider 受控回流（价格区间） | showcase demo 正确性 |
| | showcase server html.ts 路径（ui-dom 遗留） | showcase 可运行 |
| | todo 示例 useExternal 契约误用 | examples 模板正确性 |

**契约测试纪律**（核心层修复的验收）：
- 修复后立即写契约测试（命令流断言——如 keyed 移除 portal → removePortal）
- 场景测试锁定 DOM 行为（如 Menubar Escape 后 panel 移除）
- 两层都绿才提交

