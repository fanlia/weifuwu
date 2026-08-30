# weifuwu — 开发者指南

> 面向 weifuwu **框架开发者/贡献者**：架构约束、编码标准、内部机制。
> 2026-12 重建——以新内置测试框架实测行为为准（测试反向校准——文档与实现对齐）。

---

## 1. 测试命令纪律

| ID | 规则 | 说明 |
| --- | --- | --- |
| R-01 | **运行测试相关命令的 timeout 最多 10 秒** | 卡住（挂起/竞态/等待）用更短 timeout 复跑缩小范围——超时即信号，不无限等待 |
| R-02 | **vdom 单一实现源纪律（core2 融合实录——2027-02）** | core2 探索（6 类型判别联合/标记体系/可逆转换/注册表——已删除——资产在 git 历史）——融合到 core1 的成果：① 函数面统一（非事件函数 props 不写 attribute——vnode 内存持有——diff 引用比较——events.test.ts 锁定）② data-wf-id 槽位路径（G9-G11 已落地）③ kindOf 6 态完备（text/hole/element/fragment/component/array/invalid——undefined 归一 hole 是渲染等价）——**移植纪律**：core2 探索出的"编码唯一性"原则（唯一编码 + 可逆）是 core1 补丁级修复的升级方向——新修复先问"是否有映射歧义"再打补丁 |
| R-03 | **批量重命名/迁移纪律（2026-12 layout 清理实证）** | 词边界替换必须负向断言 `(?![a-z0-9-])`（保护组件类前缀——wf-anchor-nav 不被 wf-anchor 误伤）；类名变更必须反查测试 `[class*="子串"]` 选择器（wf-padding-* 含 "add" → comp-tabs 定位器误点页头实证——定位器应精确类名）；迁移后 stash 前后类型错误对比证明零引入 |

## 2. 测试架构（内置框架——契约层 + 场景层）

> **v1 已删除（2027-08——VDOM-V2-BLUEPRINT 完成）**：运行路径默认 v2（uiServe/
> uiSsr/命令式组件 toast/confirm/notification/服务端 ui.ssr——core/v2/）——
> v1 引擎（core/build/diff/serve/ssr）**已删除**（git 历史可查）——对外形态
> 由 v2 兼容桥保持（index.ts renderToStream/diffStream → renderToStreamV2/
> diffToStreamV2——命令流同构——消费端零改动）——**对账器 = v2 单引擎**
> （fresh render vs old render + diff——reconcile.test.ts 终态等价 + fuzz
> 1200 静态 + 300 组件树——两种）——audit:semantics 红线：isHoleKind/
> isTextKind 单源（违规退出码 1）

```
npm run test:client    → 契约层（264 测试——node 直跑命令流——零浏览器——~4s）
npm run test:scenario  → 场景层（116 场景——SSR 服务化 + playwright——真实浏览器——15 文件并发——~17s）
npm run test:showcase  → showcase 组件测试（200 测试——112 组件 157 全覆盖——每组件一个文件——~2.5min）
npm run test           → 契约 + 场景 + server（db 真库依赖 docker）
```

### 契约层（src/test/contract/——node:test 直跑）

**原理**：引擎决策层（build/diff/transform）输出 `Command[]`——**纯数据**——node 断言命令流（id/顺序/语义）——零浏览器——引擎内部状态可达。

| 文件 | 覆盖 |
| --- | --- |
| vnode/transform | h/jsx 数据面、key 剥离、stateOf/transitionOf 7×7 全分支 |
| **component-harness** | **组件契约测试脚手架（命令流级断言——零浏览器）**：mount(Comp)/render(next)/mounts()/unmount + createTable/assertCreate/ops——组件目录内 `<Comp>.test.ts`（`npm run test:contract-components`）——InputNumber 7/Input 4/Switch 4/Tabs 4/Slider 4/Checkbox 4——**非浮层类组件均可契约化**（openPopup 类需 DOM——场景层兜底） |
| effect-guard | 渲染路径副作用守卫（renderFn 同步段 timer → dev warn；SSR 端 warn+noop——服务器崩溃链阻断）——契约 6 测试 |
| audit 管线 | `npm run audit:semantics`（isHoleKind/isTextKind 红线 grep）+ `npm run audit:showcase`（全量 160 页 dev 扫描——进度/过滤参数——零豁免） |
| build | 首帧命令序列（create/insert/close/done.full）、组件展开挂组件 id、空洞锚、Fragment 平铺、portal 命名空间 |
| diff | setProp 只发变化键、setText 就地、组件复用（mounts 计数）、transform 让位、空洞互换不误删兄弟（§6.3）、keyed 顺移 remove+move / 循环移位冲突重建（.k{key} 实例复用） |
| key/keyed/attrs | keyOf/listKind/identityKey、attrs 只发变化键、事件函数面引用比较（prev 传递） |
| router/store/data/html | 路由参数/通配、createStore、ctx.data 缓存合并、commandToHtml 序列化 |
| events | EVENT_RE on+大写判定（once/only 不误判）、eventName 映射 |
| api | 真实 HTTP fixture（GET/POST/ApiError/onError——不 mock 网络层） |
| auth | token 存储往返/空串归一 null/Bearer scheme/自定义 key+scheme/logout |
| ai-stream | wf: SSE 流式解析（真实 HTTP——token 累积/done/events 记录/错误/abort） |
| **layout-inventory** | **布局层清单契约（8 断言——计数基线登记制/死类=0/缺口=0/无非法选择器/零值形态唯一/对齐域方向词隔离/双名歼灭/文档计数同步）——类面随消费证据生长锁定（design/layout-cleanup.md 成果防线）** |

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

**形态**（用户决策：一个地址 + 一个组件 + 独立运行——小步快跑不批量）：`comp-<id>.test.ts`（129 文件——组件全覆盖——2027-09 波次 2 补齐 8 缺口）——单独运行 `node --env-file=.env --test apps/showcase/test/comp-<id>.test.ts`；`showcase-shared.ts` 提供 startShowcaseServer（随机端口）/openShowcase（错误收集）——能力面出发（先读 props 接口清单→demo 覆盖 + 无 demo 走场景层 cap-）——**v2 别名路由**（tree-v2/cascader-v2/calendar-v2 = 主页面别名——主页面覆盖即可）——**覆盖哨兵**：`scripts/audit-component-coverage.mjs`（组件×三层矩阵——零覆盖 = 缺口 exit 1——CI 可挂——2027-09 波次 1）——**断言纪律（2027-09 波次 3/4 教训机制化）**：弹窗类断言"在哪"（坐标关系 sem/centered——assertPopupGeometry——非"在视口内"弱断言）；表单类断言值回流（onChange→props→显示同步）
| deep-*（54 组件） | 组件深度交互（表单输入/选择/导航展示/浮层/表单校验/重组件/AI 对话/文件上传——参数行为断言） |
| style-update / event-guard / open-guard | style 整体替换清空 / 事件非函数 warn / 受控缺回调 warn |

### 契约分类总表（2026-08 整理——作者纪律 / 机制化 / 架构知识）

> **整理原则**：契约按「作者是否需要记忆」分类——机制化（红线/守卫/API
> 形状/契约测试锁定）的条目作者**无需记住**（写错即响）；作者纪律是
> 机制无法表达的行为约定（测试锁定——踩坑反向校准）；架构知识是机制
> 原理（排查时参考——非红线）。

#### A 类：作者纪律（必须记忆——机制无法表达——测试锁定）

1. **useControlledInput**：onInput 事件（逐键——onChange 映射 change
   失焦才触发）——setKeyword 内部态 + setValue 回流（受控输入契约）
2. **i18n/ws 无自动渲染**——setLocale 后手动 render——ws handler 是
   { open, message } 对象（非自动驱动）
3. **useScrollPosition 目标容器必须传 null 而非 window fallback**：
   `getScroller: () => el ?? window` 首帧 el 未挂载 → 绑定 window——el
   后挂载永不重绑（滚动监听失效）——`?? null` 触发重试重绑（VirtualTable
   虚拟化不更新实证——已修组件——仍属陷阱）
4. **命令式弹窗唯一形态**（2027-03 定稿——design/imperative-popup-plan.md）：
   `ctx.ui.openPopup(opts)` → PopupHandle（toast 心智——调用点构建内容——
   内核自管理挂载/更新/卸载/销毁）——usePopup/portal()/Portal vnode/
   removePortal 全部删除——组件输出纯业务——**anchor 必传**（无 anchor 时
   closeOnOutside 把触发按钮当外部点击关闭 → click 又 toggle 重开死循环——
   portal-toggle 测试挂起实证）
5. **style 整体替换**：style 对象 = 组件声明完整样式——applyStyle 先清空
   旧值（键消失不残留）——组件写 style 对象即完整声明（非增量）

#### B 类：机制化（红线/守卫/API 形状/契约测试——作者无需记忆）

6. **hook getter 形态**（2026-08——getter 化组织收官）：会随时间变化
   的 hook 一律 getter（`() => T` 或对象 getter）——任何位置调用返回最新
   值——「必须在 renderFn 内调用」的位置规则在 API 形状不存在——
   **登记幂等**（按业务 key 实例级 keyed——任意位置任意次数不重复订阅）
   ——`createSignal` 原语（getter 读 + set/update 写——ExternalStore 兼容）
   ——useExternal/useMedia/useBreakpoint/useTween/useScrollPosition/useInView/
   usePopupPosition/useVisualViewport 全部 getter——useChat/useControlledInput
   等 handle 形态
7. **create attrs 不含事件**（函数过滤——事件经事件表）——**harness 契约
   测试锁定**（InputNumber/Input/Switch 测试断言 attrs.onXxx === undefined）
8. **value 走 property 通道**（setAttribute 对 textarea 无效——applyAttribute
   统一 property）——harness 契约锁定（Input value='' 属性面）
9. **空字符串 = 空洞**（编码唯一性——生成/消费全判定点统一）——**红线
   机制化**：isHoleKind/isTextKind 单一实现源 + `scripts/audit-core-semantics.mjs`
   （grep 守卫——违反退出码 1——CI 可挂）——判定点收敛（children/component/
   output/cleanup 11 处全量迁移——diffSlot typeof 分裂双 bug 机制防线）
10. **SSR 吸收文本分裂**（相邻文本 HTML 合流——absorb.next 前缀匹配 +
    splitText 分裂）——核心已修——作者无感知
11. **SSR ≡ SPA 首帧纪律**（showcase——同树同实例）——app-router.ts
    buildRouter 单一实现源 + src/ssr.ts（esbuild node bundle——h()/uiSsr
    同实例——Fragment 符号全等）——失败回退 Markdown-only（SEO 保底）
12. **渲染路径副作用守卫**（effect guard——DemoProgress 实证机制化）：
    renderFn 窗口内创建 setTimeout/setInterval → dev warn（含调用链）——
    浏览器 dev + SSR 恒装（node 服务器保护）——async-guard 栈豁免——
    工厂期/事件回调期合法——**组件定时器应在工厂期创建 + ctx.ui.hold
    注册清理**
13. **无 key 组件项检测 = 实槽翻转语义**（条件渲染误报根治——空洞槽过渡/
    纯尾部追加零漂移不报——实槽占据/让出才 warn）——检测器逻辑——作者
    无感知（仅 dev warn 引导——数据列表必须 key 仍是作者纪律）
14. **Grid Col 重包装 key 保持**——组件已修（key: keyOf(c) 回填）——
    harness 可锁定（重包装 key 不丢——写同类包装组件时参照）
15. **weifuwu/layout 治理机制（2026-12 清理+命名合批实施）**：50 原语 + 92 工具 + 2 内部（144 类/33 文件）——契约测试 `layout-inventory.test.ts` 8 断言锁定——**类面只随消费证据生长**（缺口审计机制化——零消费类不供养）——命名规则 `design/layout-naming.md`（三类词根：概念原语/属性根全名/裸值词 + 三后缀——属性根直接用 CSS 属性名零猜词）——内部类（_popup）不入公共清单——新增类必须在词根登记制内（自造词即测试失败）

#### C 类：架构知识 / 测试知识（机制原理——排查参考——非红线）

15. **keyed 循环移位** = 冲突重建（DOM 重建——组件 .k{key} 实例复用
    状态保持）——环状 id 依赖（流式 remap 必冲突）——顺移才 move
16. **ref apply 时序**：ref 在 apply 阶段调用——renderFn 读上一拍快照
    （render-only 语义——显示滞后一拍）
17. **SSR 吸收机制**：uiServe 首帧 root 有内容 → DFS 序游标结构对齐
    复用——mismatch → 原子回退清空重建（无 data-v3-id——纯结构匹配）
18. **事件名映射**：onClick → click、onDoubleClick → doubleclick（非 dblclick）
19. **keyed 元素 id 空间**：元素 keyed = 位置 id + diff remap（.k{key}
    仅组件实例空间）——keyed 价值在 diff 移动正确性（Tabs 契约测试锁定）
20. **投影维度纪律（FRAG 槽位推进）**：FRAG vnode 声明 1 项但投影占 N
    连续槽位——数组索引 +1 推进的循环必须用 slotCount(c) 槽位推进 +
    最后槽位 ref——slotCount 单一实现源（node/children.ts）
21. **状态机化验证体系（P1-P5）**：Sim 命令流模拟器（终态等价三面对账）
    + devVerify（Post 断言）+ auditDom（真实 DOM 对账）+ fuzz（多种子）——
    **隐式路径纪律**：diffSlot/transitionOf/diffSame 落空分支必须显式
    Reject 或显式迁移——静默 no-op 是违例；**区间语义纪律**：移除必须
    按区间（removeVNodeTree）——命令流完整自足
22. **VirtualTable 排序是字典序**（字符串比较——用户10000 在 用户2 前）
    ——虚拟化滚动容器 .wf-virtual-table-body；Slider marks/垂直对齐断言
    必须 deadline 轮询（字体加载——5s 上限）

23. **vdom 内部架构：状态机 + 事件流（方案 3 定稿——2026-XX）**：

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
    - 组件树 fuzz 收敛实录：267/300（89%）→ 1/300（2026-XX）→ **0/300**
      （2026-12——重复 key 根因歼灭）——修复全部生产端（移除路径统一
      removeVNodeTree + null 条件统一 + root 转换 oldCompId + Sim 消费端
      前缀递归对齐）
    - **重复 key 纪律（G9——fuzz 1/300 根因歼灭——2026-12）**：重复 key
      是非法输入（身份映射无唯一语义）——三面修复：① diffKeyedChildren
      的 oldIdxByKey 首现优先（与 keyIndex 单一规则源对齐——裸 Map.set
      尾现覆盖 → moved 误判 → move 缺失 → 旧节点残留/新项插进旧节点——
      seed=99 i=67 实证）② 重复 key 多余项按 unkeyed 区间移除（无主节点
      残留）③ move remap 同步迁移组件注册表（Sim 的 instances 同步——
      rec 不迁移则 diff 生成端按新 id 查询落空 → 工厂重跑 + 旧 rec 残留）
      ——**A 级检测 detectDuplicateKey warn 全覆盖（非法输入显式化——
      不静默）**：diff 侧 diffKeyedChildren（newCs/oldCs）+ build 侧三处
      列表展开（dispatcher array/fragment case + renderNative children——
      build 同 key 组件 compId 相同 → 后者静默复用前者实例（工厂不执行/
      不 mount——初始化丢失）——**对账器结构性盲区实证**（两世界同错=
      等价——不报）——必须 A 级检测兜底）
    - **生成端纪律**：移除路径（transitionElement/transitionComponent/
      diffSame tag 分支/keyed step 1/removeOldSlot）全部收敛 removeVNodeTree
      ——单锚 remove 是违例（子树实例残留）
    - **组件输出特判纪律**：sink 特判（null/数组/组件 → compId 子空间）
      与 outputBase（清理基线）必须同步修改——不同步即锚残留/基线错位

    ### 内部状态机总表（2026-XX——**全部状态机化完成**）
    ```
    NodeState（节点）          ✅ active 迁移表 + Post 验证（Sim/devVerify 共用）
    transform 6×6（转换）      ✅ TRANSITIONS 表（异态显式 Reject）
    CompState（组件）          ✅ mounting/mounted（mounting 窗口 = 工厂
                                 await 期间——异步循环依赖显式报错）
    AbsorbState（SSR 吸收）    ✅ inactive/consuming/failed（next 违例报错；
                                 end 在 inactive = 合法 no-op）
    ServePhase（serve 生命周期）✅ active/unmounted（unmount 后 render/
                                 navigate 违例报错——不再静默渲染）
    RenderPhase（渲染队列）    ✅ idle/rendering（FIFO 确定性显式化——
                                 rendering 中入队 = 合法）
    EventRegistry/RefRegistry  ✅ active/disposed（dispose 后操作违例报错）
    DataPipe（数据管道）       ✅ active/disposed（disposed 后 get 报错）
    PopupPhase（弹窗）         ✅ closed/open/exit（presence 退场）
    IntervalState（区间）      ✅ 推导式（slotCount 计算——无需运行时跟踪）
    hooks 状态（useOpen 等）   ⚪ 应用层语义（引擎外——场景层测试兜底）
    ```
    **统一模式**：显式枚举 + 迁移 + 违例检测（console.error——不中断生产
    ——审计可见）——静默 no-op 是违例（fuzz#79 教训的全面推广）

    ### 状态机维度总表（2026-XX——**全部维度状态机处理**）
    ```
    维度 1：状态迁移合法性（NodeState × 事件——消费端迁移表）        ✅
    维度 2：生命周期（serve/registry/absorb/comp——active/disposed） ✅
    维度 3：无静默路径（transform 落空 Reject——生成端）             ✅
    维度 4：组件输出形态（CompOutput 判别联合——null 结构性消除）     ✅
    维度 5：id 空间消费端验证（insert parent 容器性——锚/文本父违例
            显式报错——an:root.0(div) 类在消费瞬间暴露）             ✅
    维度 6：生成端 emit 状态机（build/diff 的 id 类型表——create 类型
            冲突/insert parent 容器性违例——生成时显式报错）          ✅
    维度 7：双树对账（verifyEquivalence 的合法 id 投影推导——静态槽位
            ∪ 组件子空间——幽灵 id 精确报错——不等价定位维度）        ✅
    ```
    **结论**：状态机维度已全覆盖——剩余 1/300（重复 key 非法输入——
    2026-12 根因歼灭为 0/300——G9 三面修复 + fuzz 生成器唯一 key）由
    终态对账捕获（演绎保证——未漏网）——状态机维度
    的边际补全（生成端/双树）不构成新捕获能力（对账器更强）

    ### 状态机 vs 对账器（验收纪律——2026-XX 定稿）
    ```
    状态机 = 必要条件（迁移合法 + 无静默路径——错误类型显式化/更快定位）
    对账器 = 充分验证（终态等价——定理 1 演绎保证——错必被抓）
    ```
    - **状态机不检查"命令内容语义"**（insert 的 parent 指向/区间覆盖/
      id 空间）——组件 fuzz 剩余案例实证（an:root.0(div)——insert parent
      解析到锚——状态迁移合法但对账器抓终态不等价）
    - **"事件流生产全部正确"由对账器裁决**（fuzz 覆盖范围内）——状态机
      保证暴露机制完整（无静默吞错）
    - 两者互补缺一不可：状态机让错误类型显式化 + 对账器保证错误必被抓
    - 生成端状态机（build/diff emit 过程校验）不必要——对账器是更强检查
      （终态级 vs 过程级——边际价值低）
    ### 生产/消费完整性判断（实证）
    - **生产端是根因**：所有语义错误（漏 remove/unmount/错 parent）源于
      命令流生成——修复方向 = 生成端完整自足
    - 消费端（真实）设计为幂等防御——防御性 return 掩盖生产错误——
      对账器（终态等价）是暴露机制
    - Sim 必须与真实消费端逐语义对齐（unmount 前缀递归——disposeComponent
      契约）——对齐缺口 = 验证工具 bug

    ### 流化维度总表（2027-09——VDOM-OBSERVABLE-COMPLETE 实录）
    **完成状态**：vdom 全链路 Observable 化——源/管线/终态/快照四点完整——
    audit-observable-complete.mjs 三检查（渲染周期管线化/单轨清理/无隐式
    时序）零豁免违规。

    | 面 | 落地 | 关键机制 |
    |---|---|---|
    | **管线** | 渲染周期（v2/cycle.ts）——build/diff → **toArray 原子性**（生成错误零 DOM 变更）→ tap(apply) → tap(cleanup) → applied\$（sink 可观测）/complete\$——applyV2Inner 删除（波次 1） | 影子树归周期（currentTree）；R1 熔断 = cycle.reset + apply；三轴度量（builds/diffs/applies/unmounts）流上取数 |
    | **快照** | 状态机 shell 化——**内核迁移表不动（编译期穷尽）+ 外壳 scan 折叠**（machine\$ 模式：events\$ → scan(reduce) → 状态写回 + 违例流事件）——AbsorbState（absorbReducer+failed\$——波次 4）/PopupPhase（popupPhaseReducer+events\$——波次 6）/RenderPhase（serve 折叠） | 回放 = 同函数重喂记录流；流化不增加正确性（迁移表+对账器保证）——流只让错误更早现形 |
    | **时序** | transform 三段 concatObs（disposeOp → removeCmds → 新侧订阅时构造）——pendingSink 时序 hack 删除（波次 3）；导航 redirect while → 递归流（波次 5）；toast setTimeout → delay（波次 6） | C1 fuzz seed=11 顺序纪律结构性保证；取消语义（switchMap/退订清 timer） |
    | **值源** | store/chat changes\$（浅拷贝快照）、ws messages\$/status\$、auth token\$、i18n locale\$（视图——API 形状不变纯扩展——波次 7） | 与 subscribe 同源（同一变化事件）——BehaviorSubject 语义（订阅即回放） |
    | **终态** | DOM apply 命令式（applier——副作用本性）+ 周期级 applied\$/complete\$ | sink 不是黑洞（应用后重发射）——dev/度量订阅点 |

    **收益判负记录（不流化——记录在案——非豁免是收益判负）**：
    - EventRegistry/RefRegistry/DataPipe（active/disposed 布尔态）——流化 = 过度设计
    - NodeState 状态机——**规格已单源**（patch/state-machine.ts——Sim/devVerify 共用
      tracker）——逐命令 transition 时机正确（单步定位）——周期级流化无增量
    - api 中间件（Promise 已是单值源——fromPromise 桥无增益）
    - 守卫（R1/R2/effect-guard 已机制化——catch/熔断/窗口检测在管线内）
    - Notification 组件层 setTimeout（组件实现——归类纪律：非内核红线）
    - 独立 mini-root 一次性渲染链（popup/toast/notification——renderToStreamV2
      流消费——非渲染周期——免于 cycle 收编）

    **纪律（定稿）**：流化优先「结构化替代 hack」（pendingSink→订阅时构造；
    setTimeout→delay；标志轮询→事件驱动）——**不加仪式流**（布尔态/已单源
    规格/单值 Promise）——每机制单轨（流=时序表达——状态机=状态表达——
    两者共存互补）——audit-observable-complete.mjs 三检查是完成判据。

    ### 优势兑现总表（2027-09——VDOM-OBSERVABLE-OPTIMIZE 实录）
    **完成状态**：Observable 优势面（组合/时间管理/取消/声明式/回放）充分
    发挥——audit-observable-optimize.mjs 三检查零违规。

    | 优势 | 落地 | 关键机制 |
    |---|---|---|
    | **组合** | 8 算子纯新增：combineLatest（全源首发后发射——快照）/merge/debounceTime/throttleTime (trailing 可选)/distinctUntilChanged（自定义比较器）/finalize（三路径一次）/take（限量自动退订）/startWith | 搜索场景声明式链（combine+distinct+debounce——无手写 timer）；useObservable 限帧 = Subject→throttleTime（**算子消费——非手写 timer**） |
    | **声明式派生** | derived（读时计算+惰性缓存——读时比较零订阅——任何 getter 可派生——嵌套天然） | 无泄漏面（源 getter 只管读）；getter 纪律保持 |
    | **时序显式** | 调度器风暴检测：setTimeout(0) 清零 hack → **事件间隔判定**（<16ms 计数/≥16ms 重置） | 回放测试（request 拍序列重喂→同 flush 序列——调度确定性）——观测点 sched:request |
    | **失败可观测** | asyncErrors$（useAsyncData 失败→key+error 事件——非仅 console.error；get null 降级兼容） | 错误不再只进控制台——诊断器/作者订阅 |
    | **取消/泄漏** | useObservable 变化通道 Subject+throttle（unmount 双向退订）；disposeSegment instData 清空（登记 entry 引用链释放） | 泄漏防线契约（timer 零后遗症/instData 空）；性能基线（10k build<2s/diff<500ms——成本防线） |

    **收益判负记录（本计划）**：DOM 事件桥（fromEventPattern 已有）；中间件
    请求链（Promise 单值）；调度优先级（场景证据不足）；cycle 回放（toArray
    原子——记录即重放——无状态机面）；scheduler latest 模式（现 queue 不丢
    ——真丢中间非 vdom 场景）——**原则**：优势发挥 = 场景证据驱动的增量——
    不造抽象（无场景证据的算子/模式 = 仪式）。

    **存量缺陷修复（试金石——derived 测试现形）**：原语信号写面（set=spread
    {…1}={}——文档 signal(0) 示例坏）→ store.set/update 类型感知（对象合并/
    原语数组替换——向后兼容）+ changes$ 原语直发。

## 2d. 性能防线（消费端——VDOM-PERF-PLAN 完成归档 2027-09）

> **三波次全交付已归档**（design/VDOM-PERF-PLAN.md §4/§6——React 19 对照在
> bench/react-compare/）——防线：
> - **契约层**：v2-lifecycle 10k 节点 build<2s/diff<500ms（生成端）
> - **场景层**：e2e-perf（6000 行卸载 <2s + 更新 <1s——旧 O(N²) 必挂）
> - **React 对照**：同 CSS 负担 mount 0.83x/update 0.96x——判负记录
>   （removeTree 批命令——无用户感知场景不预造）

## 2c. 渲染健康（三轴诊断器——RENDER-HEALTH-PLAN 波次 1）

> **问题出现即读数**——渲染的「健康」三轴：**频率**（渲染次数/秒）·
> **规模**（单次命令数）· **复用**（组件工厂重跑率）——dev 模式仪表
> `window.__wfRenderHealth`（每 2s 滚动——`snapshot()` 有全量字段）——
> serve `__WF_DEV__` 门控（生产零成本）。

| 轴 | 阈值（超限 = console.warn） | 症状 |
|---|---|---|
| 频率 | > 10 渲染/s | 卡顿/闪烁/流式慢 |
| 规模 | 单渲染 > 5000 命令 或 > 300ms | 首屏慢/冻结 |
| 复用 | 重跑率 > 5% | 状态丢失/重建风暴 |

**排查用法**（页面出现「每拍 remount / 渲染循环」类问题）：
1. 浏览器 dev 模式开页面——`window.__wfRenderHealth` 读数（三轴哪根破）
2. 复用轴破 → 查组件是否 keyed 缺失/列表 key 不稳定/条件槽位切换——
   引擎复用正确由契约锁定（src/test/contract/reuse-regression.test.ts——
   七形态零复现）——**破的是应用层**（无 key/不稳定 key/每拍新数组）
3. 频率轴破 → 查调度风暴（同拍 N 次 render——batching 已内置——仍破 =
   源激增：timer/ws/observer 连发）
4. 规模轴破 → 查长列表（VirtualTable 已虚拟化——未接入的 list 用 keyed
   列表 + 虚拟窗口）

**防线基准**：契约 render-health.test（6）锁定三轴计数/阈值/零误报——
reuse-regression.test（7）锁定复用语义（复现即红）。

### 已知边界（诚实裁剪）
- **渲染队列 FIFO/redirect**：serve 内部机制——间接覆盖（无专门测试）
- **useTween/useReducedMotion/useVisualViewport/useDrag（stable.ts）**：未测（headless 无 reduced-motion 偏好——直落分支）
- **hooks/ai-stream.ts、auth 中间件**：未测（长尾）
- **测试竞态**：场景层 3 文件并发（每文件独立 server/browser）——文件内串行——node:test --test-concurrency 是文件级（单文件内串行——对单文件无效）

---

## 2b. 组件作者契约（2027-08 OBSERVABLE-ARCH——易学易写易用的机制根）

> **一条规则**：工厂**同步**；异步边界**全在 hooks**；渲染**纯同步**。

### 签名（Component 断代——无 mounting 窗口）

```ts
type Component<P, C> = (initProps: P, ctx: C) => RenderFn<P>  // 工厂同步（无 async——
                                                // 无 mounting 窗口——毫秒即挂载完）
type RenderFn<P> = (props: P) => VNode | null | (VNode | null)[]  // 渲染纯同步
```

**async 标签已移除**（类型层强制——新代码写 async 即编译错）——原子：
- 数据加载 → `ctx.ui.useAsyncData(fetcher, key)`（fetcher 返回 Promise——hook 内部流管道）
- 多源汇流 → `ctx.ui.useObservable(obs$)`（任意 Observable）· `combineLatest`
  （多源快照）· `derived`（信号/读面声明式派生——无订阅零泄漏——
  OBSERVABLE-OPTIMIZE 波次 1/2 组合面）
- 异步回调后更新 → 事件回调内 set/rerender（非工厂期——**工厂期零 render**）

### 数据（useAsyncData——模块级注册表）

```ts
const [getFiles, reload] = ctx.ui.useAsyncData(fetchFn, 'ws-files')
// getFiles()  → 最新值（null = loading/error——区块降级）
// reload()    → 重新 fetch（旧请求作废——switchMap 语义）
```

内建语义（作者零代码）：**同 key 并发合并**（N 组件 fetch 1 次）· **竞态取消**（旧请求作废）
· **缓存保留**（重挂载零请求——reload 显式刷新）· **卸载自动退订**（零泄漏）·
**种子命中**（SSR __DATA__ 预热——首帧零请求）——契约测试锁定。

### 状态（signal / useObservable——getter 纪律）

```ts
const count = ctx.ui.signal(0)   // getter 读 + set/update 写——变化自动重渲染
const files = ctx.ui.useObservable(files$, [])  // 任何 Observable → getter
```

**getter 纪律（定律）**：一切会变化的值 = `() => T`——任何位置调读最新——无调用位置规则。

### 生命周期（自动——作者零退订代码）

- 订阅/退订/重渲染：useObservable/useAsyncData 内建（卸载自动停止——takeUntil 语义）
- 资源清理：`ctx.ui.hold(fn)`（卸载时释放——等价 onUnmount——推荐名）
- **无 onFilesReload 注册表类手写退订**（曾经 Set 累积泄漏——现在用流）

### SSR 首帧

- `useAsyncData` 组件：SSR 预取器（两遍渲染——并行预取——__DATA__ 种子——首帧带数据）
- 服务端 `uiSsr(router, url, { prefetch })`：bundle 内数据预热钩子（同步缓存类数据）
- **SSR ≡ SPA 首帧**：种子预热 → 客户端同步命中——吸收零差异

### 事件回调内异步（合法——非渲染路径）

```ts
onClick={async () => { const r = await ctx.api!.post(...); ...; ctx.render() }}
```
——事件回调的 await 合法（渲染无关——async-guard 窗口外）——**唯独工厂期禁**（同步——无 await）。

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
| | keyed 重复 key 三面修复（G9——首现优先/多余项区间移除/move remap 迁移组件注册表） | keyed 列表（非法输入确定行为——组件树 fuzz 1/300→0） |
| | **keyedId key 转义（key 注入防御——证明审计发现）**：compId 直接拼接 key——key 含 '.'（数据 id 'a.b'）与 'ka' 产生前缀关系——disposeComponent/remapSubtree 的 startsWith 前缀匹配误删兄弟实例（unmount root.0.ka 误删 root.0.ka.b——状态丢失 + onUnmounts 错乱——实证）——统一转义（'%'→'%25' 先行、'.'→'%2E'——互不碰撞）——build/diff/cleanup 5 生成点单一实现源 | keyed 组件（任意字符 key——用户数据 id） |
| | **removalParent 清理 parent 语义（G10——证明审计——sink 特判对齐）**：removeVNodeTree 的 parent 参数 = 渲染时 sink parent——五处错位实证（fuzz 生成器盲区——组件输出项从未带 key）：① 数组分支传槽位父（应传 base=compId）② 组件输出 keyed 组件——transitionComponent/diffSame 顶层传槽位父 ③ 组件输出 Fragment 含 keyed 组件——组件分支递归传 compId（应传槽位父——base 父路径推导）④ emitWithKey 输出收缩缺 oldCompId——unmount/区间清理跳过（实例残留 + 单锚 remove）⑤ emitWithKey 对照分支 keyed 输出组件——diffSame 按槽位 id 查 rec 落空（工厂重跑 + 旧 rec 残留 + id 空间错位）——统一 removalParent（组件/数组→compId；Fragment→槽位父）+ 收缩补 oldCompId + 对照分支 keyed 递归 emitWithKey——G10 五测试锁定 | 组件输出（keyed 子项/收缩/嵌套组件输出） |
| | **消费端三表索引化（P1——admin 全量 59s 实证——2027-09）**：procRemove 每次全量扫 nodes/events/refs 三表（O(N²)——2.6B startsWith）——childIds/byChild 索引（insert 登记/remove DFS O(k)/remap 迁移）+ removeOne/unmountOne O(1) 单删——admin 全量卸载 59172ms→310ms（190x）——防线 e2e-perf（6000 行卸载 <2s 必挂旧代码） | 全量列表/切换（设计文档 design/VDOM-PERF-PLAN.md） |
| | **procInsert ref 组件 id 回退索引化（P2）**：ref 指向 compId 时原 nodes 插入序全量扫描（chat avatar 每插 O(N)）→ childIds DFS + 插入序 seq（O(k)——seq 单调=Map 插入序等价） | 组件槽位后插入（chat 流式） |
| | **renderV2Node 同步收集（P3——React 19 对照）**：v2 全命令流同步完成——每节点 fromArray+concatObs（6000 行=48000 流对象）→ 单数组收集 + 外层单 fromArray（外部 Observable/管线纪律不变）——10k 基线 113→81ms——React 19 同 CSS 对照 mount 0.83x/update 0.96x（基准资产 bench/react-compare/） | 全部渲染路径（流对象分配面） |
| | **可变输出 id 空间（G11——证明审计——输出形态基线）**：组件输出单元素挂槽位（slotId）；空洞/数组/组件输出挂 compId.0 起——diffComponentOutput 的转换 oldId 曾统一用 outId（新输出 sink 参数——数组/空洞输出时 p=compId、i=0——对旧输出错位）——可变输出（div→数组/收缩/展开）实证：旧 div 保留 + 锚插入 + 实例残留——修复：oldBase 按旧输出形态计算（slotId/compId.0）+ emitWithKey 内联 sink 替换为 diffComponentOutput（消双实现——输出对照单一实现源）+ oldOut 提前取（renderComponent 先更新 lastOutput 再调 sink——回调内求值拿到新输出——G10④ 回归教训）——G11 四形态切换锁定 | 组件状态变化（条件渲染/加载态切换） |
| | **空字符串 = 空洞（编码唯一性——2026-08）**：`''` 文本节点与无物两套物理表示（客户端 createText('') 空文本 vs HTML 序列化零输出）——SSR 吸收错位根因（inputnumber 实证：`{cond?'x':''}` 槽位 → 吸收把 demo 面 div 跳过 → 耗尽 failed → DOM 双份污染）——kindOf 单一实现源归空洞（锚双端同构——diff/transform 自动落 hole 列） | 全部组件/页面（条件渲染空字符串槽位——SSR 页） |
| | **SSR 吸收文本分裂（2026-08）**：HTML 相邻文本合流（`' › '`+`'InputNumber'` → 单 DOM 文本节点）vs 命令流两条 createText——整节点消费吞后缀 → queue 耗尽 failed——absorb.next 前缀匹配 + splitText 分裂 + 剩余 unshift 回队列（procCreateText 传目标 value） | 全部 SSR 页（相邻文本槽位——面包屑等） |
| | **SSR ≡ SPA 首帧纪律（showcase——2026-08）**：ssr-header/纯 Markdown SSR 与 SPA Shell+ComponentPage 是两棵不同树——刷新先见文档页/加载后整页跳变（用户实证）——uiSsr + 同一 router（app-router.ts 单一实现源）——**同实例纪律**：h()/uiSsr 同一 esbuild bundle 实例（跨实例 Fragment 符号断裂 → 非法子节点 type: symbol → 文本变空洞锚）——data.ts SSR fetch 基址（自 fetch 本机 /index.json）+ Shell active prop（无 location 全局）+ demo 渲染路径副作用 window 守卫——失败原子回退 SPA 空壳（2026-12 content 文档库移除后——无 md 回退链） | showcase 全部页面（SSR 首帧 = SPA 首帧——零闪烁） |
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

