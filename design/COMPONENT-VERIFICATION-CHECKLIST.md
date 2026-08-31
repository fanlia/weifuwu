# COMPONENT-VERIFICATION-CHECKLIST——组件全功能验证清单（playwright 实测 + 测试固化）

> **任务**：不依赖既有测试文件——对 132 个组件的**每个功能点**做真实
> playwright 验证（真实 server :3200 + /components/:id 页面逐点操作），
> 验证通过的功能用测试固化（每功能点至少一断言）。**不要求快，求质量。**
>
> 清单来源：**组件源码证据**（src/client/components/*/Props 接口字段 + registry
> 描述/gotchas + demo 变体面）——1020 个功能点。
> 清单是**活的**：执行时读源发现清单遗漏的功能点 → 追加该组行再验证；
> 清单错误的行 → 修正并注明。

## 执行协议（每组件五步——一个组件全绿才进下一个）

1. **读源核对**：打开该组件 .ts——核对本组功能点行（遗漏追加/错误修正）
2. **真实验证**：playwright 会话打开 **:3200/components/<id>**（复用运行中 server）
   ——逐功能点操作（点击/输入/键入/滚动/浮层）——观察真实 DOM 行为
3. **异常归类修复**（AGENTS §3——先查是否核心层根因）：应用层 demo 错 / 组件层 / 核心层
   ——修哪层修哪层 + 该修复必带回归断言
4. **测试固化**：apps/showcase/test/comp-<id>.test.ts 增补或新建
   ——**每功能点至少一断言**（断言纪律：浮层类断言「在哪」geometry；表单类断言值回流）
5. **单文件跑绿**：node --env-file=.env --test apps/showcase/test/comp-<id>.test.ts
   ——绿 → 本组全部行打 [x]（修复行打 [!]）→ 下一组件

**里程碑**：每批（10 组件）跑完 → npm run test:showcase 全量回归 → 批状态列更新。

## 状态图例

- 批级：⬜ 未开始 · 🔄 进行中 · ✅ 完成（验证+固化+批回归绿）
- 行级：[ ] 未验证 · [x] 验证+固化 · [!] 发现问题→修复+回归固化 · [N] 无 DOM 面（纯逻辑——经 demo 触发验证）

## 批次进度（字母序——14 批）

| 批 | 组件范围 | 状态 |
|----|---------|------|
| 1 | Accordion → AspectRatio（10） | ⬜ 未开始 |
| 2 | AuthPage → Card（10） | ✅ 完成（3 组件层修复——AutoComplete 过滤不更新/error 文案面/Badge rest 透传） |
| 3 | Carousel → Collapse（10） | ⬜ 未开始 |
| 4 | ColorPicker → Drawer（10） | ⬜ 未开始 |
| 5 | Dropdown → Form（10） | ⬜ 未开始 |
| 6 | Grid → InputNumber（10） | ⬜ 未开始 |
| 7 | JSONViewer → Markdown（10） | ⬜ 未开始 |
| 8 | MarkdownEditor → PageHeader（10） | ⬜ 未开始 |
| 9 | Pagination → RadioGroup（10） | ⬜ 未开始 |
| 10 | Rate → SessionList（10） | ⬜ 未开始 |
| 11 | SheetGrid → Switch（10） | ⬜ 未开始 |
| 12 | TabBar → Toggle（10） | ⬜ 未开始 |
| 13 | ToolCallCard → VirtualTable（10） | ⬜ 未开始 |
| 14 | Watermark → Wave（2） | ⬜ 未开始 |

## 修复记录（执行时追加）

| 组件 | 层级 | 问题 | 修复 | 回归 |
|------|------|------|------|------|
| ActionSheet | 组件层 | 键盘导航半残：ArrowDown/Up 只更新内部 focusKey 不移动 DOM 焦点；Enter 原生 click 旁路 focusKey——与头部注释宣称的 menu 语义不符 | ActionSheet.ts：roving focus——渲染后显式聚焦目标项（data-actionsheet-key 定位，跳过 disabled） | comp-actionsheet.test.ts FP10（ArrowDown 焦点跟随）+ FP6（Enter 选择焦点项）|
| （core）style 通道 | **核心层** | applyStyle undefined 分支静默 no-op——diff「旧有新无」发 setProp('style', undefined) 后旧 style 残留（Affix 滚回顶 sentinel --active 已移除而 content 仍 position:fixed——两种 DOM 面不一致） | style.ts：undefined/null/false → cssText=''（整体移除——A5 整体替换语义补全）+ FakeStyle 升级代理（style[k]=v 直落） | field-style.test.ts 6 锁 + comp-affix FP6 + 全量回归 |
| （core）observe | **核心层** | useScrollPosition refresh 只 emit 不重跑 ensure——目标后挂载（首帧 null → afterRender 重试耗尽）后绑定永久丢失（容器滚动零响应） | observe.ts：refresh = ensure + emit（ensure 幂等——重新解析目标 + 读值） | comp-affix FP7 + 全量回归 |
| Affix | 组件层 | threshold 公式坐标系错误：rect.top + scrollTop 只对 window 成立——容器 scroller 混入容器视口偏移（容器级永不固定）；且 compute 副作用与渲染无顺序保证（竞态） | Affix.ts：threshold 渲染期直算 + 容器坐标系修正（rect.top − 容器视口 top + scrollTop） | comp-affix FP3-FP7 |
| （core）chat.ts | **核心层** | useChat 默认 parseChunk 只映射 wf:token/content/toolCalls——wf:step/tool_call/progress/result/approval_request/usage/done 全部丢弃（state.step/state.usage/approval 零赋值点——AiChat 状态行/usage 行/工具卡/审批卡等不到数据） | chat.ts：默认解析器升级为 wf: 协议状态机（makeDefaultParser——event 名分派全事件）+ send 循环全事件消费 | comp-aichat FP10/FP6/FP7/FP11 + 契约 391 绿 |
| （core）chat.ts | **核心层** | approve() 用 map 替换消息对象——send 循环闭包仍持旧 assistant 引用写 content——审批后到达的 token 写进游离对象（UI 永不更新——HITL 审批期间流未结束必现） | approve 改原地修改 toolCall（对象同一性保持） | comp-aichat FP7b/FP5/FP2b（审批后回复渲染锚） |
| AutoComplete | 组件层 | onInput 在 open 已开时不重渲染——dropdown content 停留首次闭包 vnode，输入「支付」仍显示全量 5 条（过滤失效） | AutoComplete.ts：open 已开也 ctx.render()（输入驱动渲染——filtered 随输入更新） | comp-autocomplete FP1 |
| AutoComplete | 组件层 | error 只有错误类/aria-invalid 无文案渲染面（F2 输入类基线缺项） | 补 wf-input-err 文案节点（对齐 Input 基线）+ CSS | comp-autocomplete FP4 |
| Badge | 组件层 | rest（data-*/aria 自定义属性）不透传——测试定位/埋点无入口 | Badge.ts 三渲染点 ...rest 透传 | comp-badge FP2 |
| AppShell | 组件层 | loading 语义半成品：类型注释宣称「不渲染菜单/用户」但实现只骨架化用户区——菜单照常渲染 | AppShell.ts：loading 时 sidebar-body 一并骨架化（声明兑现） | comp-appshell FP7 |
| Anchor | 应用层 | demo 末节后无滚动空间——末节永远无法滚至 80px 阈值内（高亮死区——同 Affix 页面高度问题） | demo 尾部补 50vh 占位 | comp-anchor FP4 |
| wire-fake | 应用层 | /api/chat 读 body.mode 判定 agent 流——useChat 协议 body 只发 { messages }——mode 死分支（工具/审批演示永不触发） | server.ts：改按最后一条用户消息语义判定（含「天气」→ agent 流程） | comp-aichat agent 链路 |

---


### Accordion（Accordion）

> 折叠面板，支持多个 items
- [x] **渲染基线**：页面挂载零错误——`.wf-accordion` + 面板结构出现
- [x] **items 数据面**：key/title/content 渲染——传入 → DOM 呈现
- [x] **非受控默认全展开**：无 active 时内部态初始为全部 keys（向后兼容行为）
- [x] **互斥展开（multiple=false 默认）**：点新项 → 旧项收起（activeKeys=[key]）；点已展开项 → 收起
- [x] **multiple 布尔行为**：true = 多开（activeKeys 累积）；false = 互斥
- [x] **disabled 项**：item.disabled → button disabled + 点击不切换
- [x] **active 数据面（受控）**：active !== undefined → 完全受控——展开态跟 active 走
- [x] **onChange 事件**：受控切换 → onChange 收到 next keys（回流：父重渲染 → 展开态同步）
- [x] **aria-expanded 同步**：summary 按钮随开合 true/false
- [x] **键盘导航**：summary 聚焦时 ArrowDown/Right → 下项聚焦；ArrowUp/Left → 上项（循环）
- [N] **空 items → null**：items=[] 渲染 null（无 DOM 面——[N] 读源确认）

### ActionSheet（ActionSheet）

> 动作面板——移动端底部滑出（命令列表 + 取消按钮，usePopup 会话级模态）
- [x] **渲染基线**：open=false 时组件渲染 null（无面板）；open=true → portal 面板出现
- [x] **open 布尔行为**：true → 面板 + overlay；false → presence 退场（动画后 DOM 移除）
- [x] **items 数据面**：key/label/icon（IconName → Icon 组件）渲染
- [x] **danger 项**：`wf-actionsheet-item--danger` 语义类 + 红色文字
- [x] **disabled 项**：button disabled + 点击不触发 onSelect
- [x] **onSelect 事件 + 自动关闭**：点击项 → onSelect(key) → 面板自动关闭（onClose 链）
- [x] **onClose 事件（三路）**：overlay 点击 / 取消按钮 / Escape → onClose
- [x] **cancelText 数据面**：默认「取消」；自定义「算了」
- [x] **title 数据面**：面板标题元素 + aria-label
- [x] **键盘导航**：ArrowDown/Up 移动焦点（跳过 disabled）+ Enter 选择
- [x] **menu 语义**：role=menu + menuitem + role=dialog + aria-modal
- [x] **会话级模态四件套**：presence 退场 + trapFocus + lockScroll + 定位 none（底部滑出）
### Affix（Affix）

> 回到顶部（滚动超 400px 显示）+ 固定导航（距顶 80px 钉住）——修正：实际为钉住组件（滚动超阈值固定元素）
- [x] **渲染基线**：`.wf-affix` + sentinel + content 三层结构
- [x] **滚动固定行为**：scrollY ≥ 阈值（sentinel 文档位置 - offsetTop）→ content `position:fixed` + sentinel `--active` 类
- [x] **offsetTop 数据面**：fixed 后 `top = offsetTop`px；运行时变化重算阈值
- [x] **宽度保持**：fixed 时 content width = 原占位宽度（防抖动）
- [x] **className 数据面**：根元素类拼接
- [x] **children 透传**：内容渲染于 content 层
- [N] **target 自定义滚动容器**：demo 未触达——读源确认 scroller 分支（Window→browser.scrollTop；HTMLElement→scrollTop）
### AiChat（AiChat）

> useChat + 标准对话界面：流式 token / 工具卡 / 审批卡 / 自动滚动，协议对页面透明
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [N] **raiseOnKeyboard 布尔行为**：true/false 渲染差异（raiseOnKeyboard=true 显式断言）
- [x] **chat 数据面**：`UseChatHandle`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **maxHeight 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **labels 数据面**：`Partial<AiChatLabels>`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **renderMessage 数据面**：`(msg: UiMessage) => any`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **approveSchema 数据面**：`(request: WfApprovalRequest) => JsonSchema | undefined`——传入 → DOM 呈现（执行时读源核对语义）

### Alert（Alert）

> 信息提示条，4 种 variant + closable
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **closable 布尔行为**：true/false 渲染差异（closable=true 显式断言）
- [x] **variant 数据面**：`AlertVariant`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **onClose 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **DOM 透传**：children 透传到根元素

### AlertGroup（AlertGroup）

> 通知合并组：≥3 条折叠为 +N，点击展开
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **items 数据面**：`AlertGroupItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **onClose 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Anchor（Anchor）

> 锚点导航：滚动高亮跟随 + 点击平滑滚动
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **useHash 布尔行为**：true/false 渲染差异（useHash=true 显式断言）
- [x] **items 数据面**：`AnchorItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **activeKey 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **container 数据面**：`() => HTMLElement | Window`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **offsetTop 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **onAnchorChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### AppShell（AppShell）

> 应用壳——品牌 + 分组导航 + 用户区 + 主内容（受控——父层驱动）
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **loading 布尔行为**：true/false 渲染差异（loading=true 显式断言）
- [x] **nav 数据面**：`AppShellNavItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **path 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **brand 数据面**：`{ name?: string; subtitle?: string; logo?: string }`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **user 数据面**：`{ name?: string; email?: string } | null`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **footer 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **sidebarWidth 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **onNavigate 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **onLogout 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **onSettings 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **DOM 透传**：children 透传到根元素

### ApprovalCard（ApprovalCard）

> HITL 审批卡片：pending 可批/拒 + 修改参数（JsonSchemaForm）· approved/rejected/timeout 终态
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **loading 布尔行为**：true/false 渲染差异（loading=true 显式断言）
- [x] **request 数据面**：`WfApprovalRequest`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **status 数据面**：`ApprovalStatus`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **renderDetail 数据面**：`(request: WfApprovalRequest) => any`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **argsSchema 数据面**：`JsonSchema`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **onReject 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### AspectRatio（AspectRatio）

> 独立标签（required 星号）+ 宽高比容器（内容填满）
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **ratio 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **DOM 透传**：children 透传到根元素

### AuthPage（AuthPage）

> 认证页骨架：居中卡片 + logo + 表单插槽 + 错误条 + 提交 loading（登录/注册复用）
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **loading 布尔行为**：true/false 渲染差异（loading=true 显式断言）
- [x] **subtitle 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **logo 数据面**：`VNode | null`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **footer 数据面**：`VNode | null`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **submitLabel 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **error 数据面**：`string | null`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **onSubmit 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **DOM 透传**：title/children 透传到根元素

### AutoComplete（AutoComplete）

> 输入联想：自由输入 + 过滤下拉 + 键盘流 + 选中回填
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **open 布尔行为**：true/false 渲染差异（open=true 显式断言）
- [x] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [x] **options 数据面**：`AutoCompleteOption[]`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **renderOption 数据面**：`(option: AutoCompleteOption) => any`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **onOpenChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [x] **纪律回归**：⚠ 受控输入纪律（§5.3）：受控 input 焦点丢失事故——输入期间 value 走内部 keyword（useCont…
- [x] **纪律回归**：⚠ IME composition：中文输入组合期间受控 value 重置打断——isComposing 门控

### Avatar（Avatar）

> 头像（首字母/图片），3 种 size
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [x] **name 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **src 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **color 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### AvatarGroup（AvatarGroup）

> 头像组：堆叠 + max 溢出 +N
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **items 数据面**：`AvatarGroupItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **max 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **size 数据面**：`AvatarProps['size']`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### BackTop（BackTop）

> 回到顶部（滚动超 400px 显示）+ 固定导航（距顶 80px 钉住）
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **smooth 布尔行为**：true/false 渲染差异（smooth=true 显式断言）
- [x] **visibilityHeight 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **target 数据面**：`() => HTMLElement | Window`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **DOM 透传**：children 透传到根元素

### Badge（Badge）

> 状态标签 + 圆点，6 种 variant
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **dot 布尔行为**：true/false 渲染差异（dot=true 显式断言）
- [x] **showZero 布尔行为**：true/false 渲染差异（showZero=true 显式断言）
- [x] **variant 数据面**：`BadgeVariant`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **count 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **overflowCount 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **DOM 透传**：children 透传到根元素

### Breadcrumb（Breadcrumb）

> 面包屑导航，支持 aria-current
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **items 数据面**：`BreadcrumbItem[]`——传入 → DOM 呈现（执行时读源核对语义）

### Button（Button）

> 4 variants × 3 sizes + loading + block + disabled
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **variant 枚举态**：`'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'`——逐值渲染断言（类/样式/结构随值变化）
- [x] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [x] **block 布尔行为**：true/false 渲染差异（block=true 显式断言）
- [x] **loading 布尔行为**：true/false 渲染差异（loading=true 显式断言）
- [x] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [x] **onClick 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **DOM 透传**：type/title/id/class/children 透传到根元素

### Calendar（Calendar）

> 月历：事件点 + 月切换 + 日期选择（antd/EP Calendar）
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **events 数据面**：`CalendarEvent[]`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **month 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **year 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **selectedDate 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **onSelectDate 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **纪律回归**：⚠ 受控纪律：受控 month/value 必须配回调——缺回调静默不可点（console.warn 防护）

### Card（Card）

> 容器，支持 default/outlined/clickable
- [x] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [x] **variant 枚举态**：`'default' | 'outlined'`——逐值渲染断言（类/样式/结构随值变化）
- [x] **padding 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [x] **outlined 布尔行为**：true/false 渲染差异（outlined=true 显式断言）
- [x] **clickable 布尔行为**：true/false 渲染差异（clickable=true 显式断言）
- [x] **hover 布尔行为**：true/false 渲染差异（hover=true 显式断言）
- [x] **active 布尔行为**：true/false 渲染差异（active=true 显式断言）
- [x] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [x] **onClick 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [x] **DOM 透传**：id/children 透传到根元素

### Carousel（Carousel）

> 轮播：箭头/圆点/循环 + 自动播放（三库共识）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **autoplay 布尔行为**：true/false 渲染差异（autoplay=true 显式断言）
- [ ] **showArrows 布尔行为**：true/false 渲染差异（showArrows=true 显式断言）
- [ ] **showDots 布尔行为**：true/false 渲染差异（showDots=true 显式断言）
- [ ] **loop 布尔行为**：true/false 渲染差异（loop=true 显式断言）
- [ ] **interval 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素
- [ ] **纪律回归**：⚠ 小尺寸 button 固定 min/max-height（§5.6）：圆点 8x45 竖条事故

### Cascader（Cascader）

> 级联选择：多列面板逐级推进（antd/EP Cascader）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **showSearch 布尔行为**：true/false 渲染差异（showSearch=true 显式断言）
- [ ] **options 数据面**：`CascaderOption[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **searchPlaceholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ 受控纪律：受控 value 必须配回调——缺回调静默不可点
- [ ] **纪律回归**：⚠ 多选（multiple）已裁剪（低频——单选+搜索已够，见 components-cuts.md）

### Chart（Chart）

> SVG 图表：line/bar/pie/radar/gauge/scatter——零依赖自绘
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **area 布尔行为**：true/false 渲染差异（area=true 显式断言）
- [ ] **data 数据面**：`DataPoint[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **options 数据面**：`ChartOptions`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：type/title 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### ChatInput（ChatInput）

> 独立聊天输入条（AiChat 抽取）：单行/多行 + streaming 停止 + IME 安全——不自带聊天逻辑
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **streaming 布尔行为**：true/false 渲染差异（streaming=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **multiline 布尔行为**：true/false 渲染差异（multiline=true 显式断言）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string | null`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **labels 数据面**：`Partial<ChatInputLabels>`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **actions 数据面**：`VNode | null`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onSend 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onStop 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onRetry 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onControl 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onKeyInterceptFn 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Checkbox（Checkbox）

> 带 label 的复选框，支持 checked/disabled
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **checked 布尔行为**：true/false 渲染差异（checked=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### CheckboxGroup（CheckboxGroup）

> 复选框组：数组受控 + 栅格列数（antd Checkbox.Group）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **options 数据面**：`CheckboxGroupOption[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **columns 数据面**：`1 | 2 | 3 | 4`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### CitationCard（CitationCard）

> RAG 引用来源：折叠「引用 N 条」+ 条目列表（序号/标题/来源/片段/链接）+ 溢出 +N
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **defaultExpanded 布尔行为**：true/false 渲染差异（defaultExpanded=true 显式断言）
- [ ] **items 数据面**：`Citation[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **maxVisible 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onOpen 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### CodeBlock（CodeBlock）

> 代码块：语言标签 + 复制按钮 + 横向滚动
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **code 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **lang 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：title 透传到根元素

### CodeEditor（CodeEditor）

> 轻量代码编辑器——textarea + 行号 + Tab 缩进（零依赖，不引 Monaco）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **lang 枚举态**：`'ts' | 'tsx' | 'js' | 'css' | 'json' | 'md' | 'text'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **readOnly 布尔行为**：true/false 渲染差异（readOnly=true 显式断言）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rows 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Collapse（Collapse）

> 行内折叠：异步 loading + extra 操作区（区别于 Accordion）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **multiple 布尔行为**：true/false 渲染差异（multiple=true 显式断言）
- [ ] **items 数据面**：`CollapseItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **active 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **纪律回归**：⚠ 受控纪律（§5.2）：受控 activeKeys 必须配回调——缺回调静默不可点（console.warn 防护）

### ColorPicker（ColorPicker）

> 颜色选择：预设色板 + hex 输入（Popover 弹层）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **showInput 布尔行为**：true/false 渲染差异（showInput=true 显式断言）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **colors 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Command（Command）

> 命令面板：⌘K 全局快捷键 + 键盘流（shadcn Command）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **open 布尔行为**：true/false 渲染差异（open=true 显式断言）
- [ ] **items 数据面**：`CommandItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **emptyText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **globalShortcut 数据面**：`string | null`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onOpenChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### Confirm（Confirm）

> 确认对话框，Promise 化 await 调用
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **variant 枚举态**：`'primary' | 'danger'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **open 布尔行为**：true/false 渲染差异（open=true 显式断言）
- [ ] **maskClosable 布尔行为**：true/false 渲染差异（maskClosable=true 显式断言）
- [ ] **message 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **confirmText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **cancelText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **width 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onConfirm 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onCancel 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onClose 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：title 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### ContextMenu（ContextMenu）

> 右键菜单：光标定位 + 方向键 + danger 变体（shadcn）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **items 数据面**：`ContextMenuItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ portal 槽豁免；右键 + 触屏长按双通道

### CopyButton（CopyButton）

> 复制按钮：clipboard + execCommand 降级 + 成功状态机
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **variant 枚举态**：`'ghost' | 'secondary' | 'default'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **iconOnly 布尔行为**：true/false 渲染差异（iconOnly=true 显式断言）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **successText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onCopied 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### DatePicker（DatePicker）

> 日期选择器，四种模式：date/datetime/time/range
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **mode 数据面**：`DatePickerMode`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ 受控纪律：受控 value/month 必须配回调——缺回调静默不可点

### Descriptions（Descriptions）

> 描述列表：label/value 栅格 + bordered + span（详情页）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **bordered 布尔行为**：true/false 渲染差异（bordered=true 显式断言）
- [ ] **items 数据面**：`DescriptionItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **column 数据面**：`1 | 2 | 3 | 4`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### DiffView（DiffView）

> 代码 diff：LCS 行级对比 + 未变块折叠 + 三态着色
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **oldCode 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **newCode 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **oldTitle 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **newTitle 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **foldThreshold 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **maxLines 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### Divider（Divider）

> 分割线，支持 horizontal/vertical/带文字
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **vertical 布尔行为**：true/false 渲染差异（vertical=true 显式断言）
- [ ] **DOM 透传**：children 透传到根元素

### Drawer（Drawer）

> 侧边面板，左右滑入 + ESC 关闭
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **open 布尔行为**：true/false 渲染差异（open=true 显式断言）
- [ ] **position 数据面**：`DrawerPosition`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **footer 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **width 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onClose 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：title/children 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ 退场动画：--enter/--exit 类必须成对（audit 强制）——只定义不挂是死代码（CS-01）

### Dropdown（Dropdown）

> 下拉菜单，支持 danger variant
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **open 布尔行为**：true/false 渲染差异（open=true 显式断言）
- [ ] **trigger 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **items 数据面**：`DropdownItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onOpenChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ 受控纪律：受控 open 必须配 onOpenChange——缺回调静默不可点
- [ ] **纪律回归**：⚠ 命令式弹窗：浮层经 ctx.ui.openPopup（唯一形态——toast 心智——内核自管理生命周期）

### Editor（Editor）

> 富文本编辑器，contentEditable + toolbar，零依赖
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **（无 Props 接口——执行时读源补功能点）**：
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### EmptyState（EmptyState）

> 空状态占位，支持 icon/text/hint/action
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **icon 数据面**：`string | VNode | null`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **text 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **hint 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素

### ExportCSV（ExportCSV）

> 数据导出 CSV——RFC 4180 转义 + BOM（Excel 兼容）零依赖
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **variant 枚举态**：`'primary' | 'secondary' | 'ghost' | 'danger'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素

### Field（Field）

> label+error+hint 容器
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **required 布尔行为**：true/false 渲染差异（required=true 显式断言）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **hint 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素

### FilePreview（FilePreview）

> 文件预览（md/html/pdf/office）——基于事件流，可编辑
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **editable 布尔行为**：true/false 渲染差异（editable=true 显式断言）
- [ ] **content 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **url 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **fileName 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **ai 数据面**：`EditorAiOptions`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onLoad 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：type 透传到根元素

### FileTree（FileTree）

> 文件树浏览器——面包屑 + 列表/编辑态 + 上传（受控——数据源无关）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **loading 布尔行为**：true/false 渲染差异（loading=true 显式断言）
- [ ] **saving 布尔行为**：true/false 渲染差异（saving=true 显式断言）
- [ ] **entries 数据面**：`FileTreeEntry[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **path 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **openFile 数据面**：`FileTreeOpenFile | null`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **editValue 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **emptyText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **accept 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onBack 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onOpenDir 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onOpenFile 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onSave 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onEditChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onUpload 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onRefresh 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### FileUpload（FileUpload）

> 文件上传，拖拽区 + 文件列表 + accept/maxSize
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **multiple 布尔行为**：true/false 渲染差异（multiple=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **uploading 布尔行为**：true/false 渲染差异（uploading=true 显式断言）
- [ ] **accept 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **maxSize 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **hint 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`File[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **progress 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：children 透传到根元素

### FloatButton（FloatButton）

> 悬浮按钮组：展开状态机 + badge
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **static 布尔行为**：true/false 渲染差异（static=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **icon 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **badge 数据面**：`number | string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **position 数据面**：`FloatButtonPosition`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onClick 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：children 透传到根元素

### Form（Form）

> 内置验证规则：required/pattern/minLength/自定义
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **DOM 透传**：children 透传到根元素
- [ ] **纪律回归**：⚠ 三层一致（§6.3）：条件渲染 false 是空洞占位——{cond && <Alert/>} 不滤除不塌缩（提交按钮消…
- [ ] **纪律回归**：⚠ 受控纪律：受控 value 必须配 onChange——缺回调静默不可点

### Grid（Grid）

> 24 栅格 + gutter + flex 容器模式（Row/Col/Flex 等价）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **direction 枚举态**：`'row' | 'column'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **align 枚举态**：`'start' | 'center' | 'end' | 'stretch'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **flex 布尔行为**：true/false 渲染差异（flex=true 显式断言）
- [ ] **gutter 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **gap 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素

### Highlight（Highlight）

> 搜索词高亮：分词渲染 mark，大小写不敏感
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **text 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **query 数据面**：`string | string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### HoverCard（HoverCard）

> 悬停富内容卡：openDelay 延迟 + 任意 VNode（shadcn）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **content 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **position 数据面**：`HoverCardPosition`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **openDelay 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **closeDelay 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ portal 槽豁免：浮层插槽打开/关闭不触发 A 级动态数组检测（框架管理切换槽）

### Icon（Icon）

> stroke SVG 图标集，currentColor 着色，随字号缩放
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **name 数据面**：`IconName`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **size 数据面**：`number | string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### ImageCropper（ImageCropper）

> 图片裁剪——canvas 原生 API + 拖拽裁剪框 + 比例控制（零依赖）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **src 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **aspect 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onCrop 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onError 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Img（Img）

> 图片 \<img\> 组件：fallback / lazy / preview 点击放大
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **loading 枚举态**：`'lazy' | 'eager'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **preview 布尔行为**：true/false 渲染差异（preview=true 显式断言）
- [ ] **src 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **alt 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **fallback 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **width 数据面**：`number | string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number | string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **previewScale 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### InView（InView）

> 进入视窗后懒加载内容，支持 IntersectionObserver
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **threshold 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rootMargin 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **once 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onEnter 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：children 透传到根元素

### InfiniteScroll（InfiniteScroll）

> 无限滚动：底部哨兵触底加载 + loading/end 态
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **hasMore 布尔行为**：true/false 渲染差异（hasMore=true 显式断言）
- [ ] **loading 布尔行为**：true/false 渲染差异（loading=true 显式断言）
- [ ] **threshold 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **loadMoreText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **endText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onLoadMore 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：children 透传到根元素

### Input（Input）

> text/email/password/number，支持 label/error/hint/required
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **variant 枚举态**：`'default' | 'borderless'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **required 布尔行为**：true/false 渲染差异（required=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **readonly 布尔行为**：true/false 渲染差异（readonly=true 显式断言）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **name 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **hint 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **min 数据面**：`string | number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **max 数据面**：`string | number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **step 数据面**：`string | number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onInput 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：type 透传到根元素

### InputNumber（InputNumber）

> 数字输入：min/max/step + 增减按钮 + precision
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **required 布尔行为**：true/false 渲染差异（required=true 显式断言）
- [ ] **value 数据面**：`number | null`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **min 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **max 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **step 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **precision 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **name 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **hint 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### JSONViewer（JSONViewer）

> 结构化 JSON：递归折叠 + 类型色 + 路径复制 + 懒展开
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **data 数据面**：`unknown`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **defaultExpandDepth 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **maxKeys 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rootName 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### JsonSchemaForm（JsonSchemaForm）

> JSON Schema → 参数输入表单：类型映射 + 必填/范围校验 + 嵌套/数组（AI 工具参数输入面）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **schema 数据面**：`JsonSchema`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **submitLabel 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### Kanban（Kanban）

> 看板：原生 DnD 拖拽 + 跨列/重排 + 悬停高亮
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **columns 数据面**：`KanbanColumn[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **纪律回归**：⚠ enumerated 属性（§6.2）：draggable 空字符串解析为 false——必须显式 setAttribu…

### Label（Label）

> 独立标签（required 星号）+ 宽高比容器（内容填满）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **required 布尔行为**：true/false 渲染差异（required=true 显式断言）
- [ ] **htmlFor 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素

### Layout（Layout）

> 布局外壳：Sider 折叠 + Header/Content/Footer 骨架（antd Layout / shadcn Sidebar 等价）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：style/children 透传到根元素

### Link（Link）

> 文字链接：语义色/下划线/disabled/新窗口
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **variant 枚举态**：`'default' | 'primary' | 'danger' | 'muted'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **underline 布尔行为**：true/false 渲染差异（underline=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **href 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **target 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **icon 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onClick 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：children 透传到根元素

### List（List）

> 通用列表：renderItem + divided + header/footer/empty
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **divided 布尔行为**：true/false 渲染差异（divided=true 显式断言）
- [ ] **items 数据面**：`T[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **header 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **footer 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **emptyText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **emptyIcon 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### Loading（Loading）

> 加载状态，支持自定义文字
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **text 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### LogViewer（LogViewer）

> 日志流：ANSI 着色 + 虚拟滚动 + 自动跟随 + 复制
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **follow 布尔行为**：true/false 渲染差异（follow=true 显式断言）
- [ ] **showCopy 布尔行为**：true/false 渲染差异（showCopy=true 显式断言）
- [ ] **showLineNumbers 布尔行为**：true/false 渲染差异（showLineNumbers=true 显式断言）
- [ ] **lines 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **lineHeight 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **overscan 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **maxLines 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### Markdown（Markdown）

> AI 回复渲染：安全子集 parser + 代码块 + 链接白名单
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **content 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### MarkdownEditor（MarkdownEditor）

> 分屏 Markdown 编辑器——textarea + 实时预览（复用 Markdown parser 零漂移）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **mode 枚举态**：`'write' | 'preview' | 'split'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rows 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Math（Math）

> 轻量公式渲染——自研 LaTeX 子集（上下标/分数/根号/希腊字母——零依赖不引 KaTeX）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **tex 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### Mentions（Mentions）

> @提及：composition 抑制 + 过滤插入（antd Mentions）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **options 数据面**：`MentionsOption[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **prefix 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rows 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### Menu（Menu）

> 侧栏导航：分组 + 图标 + 选中态 + 方向键
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **collapsible 布尔行为**：true/false 渲染差异（collapsible=true 显式断言）
- [ ] **collapsed 布尔行为**：true/false 渲染差异（collapsed=true 显式断言）
- [ ] **items 数据面**：`MenuItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **activeKey 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **openKeys 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onSelect 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onOpenChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onCollapseChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### Menubar（Menubar）

> 水平菜单栏：←→ 切换 + ↓ 展开（shadcn Menubar）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **menus 数据面**：`MenubarMenu[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### MessageBubble（MessageBubble）

> 消息气泡：user/assistant + streaming/error 状态 + actions
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **content 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **role 数据面**：`MessageBubbleRole`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **status 数据面**：`MessageBubbleStatus`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **actions 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### Modal（Modal）

> 自定义宽度 + closable 控制关闭按钮
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **open 布尔行为**：true/false 渲染差异（open=true 显式断言）
- [ ] **closable 布尔行为**：true/false 渲染差异（closable=true 显式断言）
- [ ] **maskClosable 布尔行为**：true/false 渲染差异（maskClosable=true 显式断言）
- [ ] **footer 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **width 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onClose 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：title/children 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ 退场动画：exit 类必须挂载（animationend 驱动卸载）——reduced-motion 下动画降为 0.0…
- [ ] **纪律回归**：⚠ 会话级模态四件套：presence/trapFocus/lockScroll 由 usePopup 统一提供

### NavMenu（NavMenu）

> 顶部导航：多级 hover 弹出 + 键盘（shadcn NavigationMenu）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **items 数据面**：`NavMenuItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **activeKey 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onSelect 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### Notification（Notification）

> 队列式通知：notification.success/error/warning 命令式（antd 对齐）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **items 数据面**：`NotificationItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **position 数据面**：`NotificationPosition`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **duration 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **max 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onRemove 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### PageHeader（PageHeader）

> 页面标题栏，支持 sub + 右侧操作区 + display 大标题
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **display 布尔行为**：true/false 渲染差异（display=true 显式断言）
- [ ] **sub 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：title/children 透传到根元素

### Pagination（Pagination）

> 分页器，自动计算页码范围
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **total 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **page 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **pageSize 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### PasswordInput（PasswordInput）

> 密码输入：眼睛按钮切换可见性
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **required 布尔行为**：true/false 渲染差异（required=true 显式断言）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **name 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **hint 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **autoComplete 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onInput 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### PinInput（PinInput）

> 验证码输入：自动聚焦/粘贴分派/Backspace 回退（shadcn InputOTP）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **length 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：type 透传到根元素

### Pipeline（Pipeline）

> Agent 工作流 DAG：分层布局 + 贝塞尔连线 + 状态语义色 + 环检测
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **orientation 枚举态**：`'vertical' | 'horizontal'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **nodes 数据面**：`PipelineNode[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **edges 数据面**：`PipelineEdge[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **width 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### Popconfirm（Popconfirm）

> 气泡确认：危险操作防误触 + 复用 usePopup 基座
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **okType 枚举态**：`'primary' | 'danger'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **danger 布尔行为**：true/false 渲染差异（danger=true 显式断言）
- [ ] **open 布尔行为**：true/false 渲染差异（open=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **okText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **cancelText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **position 数据面**：`Placement`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **icon 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onConfirm 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onCancel 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onOpenChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：title/children 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ 气泡内表单/自定义箭头已裁剪（Popover 基座 + 定位全套复用）

### Popover（Popover）

> 通用弹出层，click/hover 触发，4 方向
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **trigger 枚举态**：`'click' | 'hover'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **open 布尔行为**：true/false 渲染差异（open=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **content 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **position 数据面**：`PopoverPosition`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onOpenChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：children 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ portal 槽豁免（同 HoverCard）
- [ ] **纪律回归**：⚠ 富内容自动判定已裁剪——HoverCard 补富内容（components-cuts.md）

### ProgressBar（ProgressBar）

> 进度条，支持 label/showValue
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **status 枚举态**：`'default' | 'success' | 'error' | 'warning'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **showValue 布尔行为**：true/false 渲染差异（showValue=true 显式断言）
- [ ] **value 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **max 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### PromptTemplate（PromptTemplate）

> 提示词模板编辑器——变量 chips 插入 + 实时预览填充（AI 场景痛点）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **readOnly 布尔行为**：true/false 渲染差异（readOnly=true 显式断言）
- [ ] **showPreview 布尔行为**：true/false 渲染差异（showPreview=true 显式断言）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **variables 数据面**：`PromptTemplateVariable[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **纪律回归**：⚠ textarea value 必须走 property（attribute 只是 defaultValue——DOM v…
- [ ] **纪律回归**：⚠ 受控输入纪律：value 由父控制 + onChange 通知

### QRCode（QRCode）

> 二维码：自研 QR 编码（Reed-Solomon + 8 掩码）零依赖 SVG
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **ecLevel 数据面**：`QrEcLevel`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **size 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **quietZone 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **color 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **bgColor 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### RadioGroup（RadioGroup）

> 单选组，支持 inline/options/value
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **inline 布尔行为**：true/false 渲染差异（inline=true 显式断言）
- [ ] **name 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **options 数据面**：`RadioOption[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Rate（Rate）

> 评分：键盘方向键 / allowClear / readOnly，新增 star 图标
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **readOnly 布尔行为**：true/false 渲染差异（readOnly=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **allowClear 布尔行为**：true/false 渲染差异（allowClear=true 显式断言）
- [ ] **allowHalf 布尔行为**：true/false 渲染差异（allowHalf=true 显式断言）
- [ ] **value 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **count 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **纪律回归**：⚠ 小尺寸 button 固定 min/max-height（§5.6）：星 16x36 竖条事故

### ReasoningBlock（ReasoningBlock）

> CoT 推理折叠展示：aria-expanded + 键盘可达 + 流式脉冲（thinking 模式 reasoning_content）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **defaultExpanded 布尔行为**：true/false 渲染差异（defaultExpanded=true 显式断言）
- [ ] **streaming 布尔行为**：true/false 渲染差异（streaming=true 显式断言）
- [ ] **content 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### RelationGraph（RelationGraph）

> 关系图谱——环形/网格布局 + 类型着色 + 选中交互（人物/组织/网络）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **layout 枚举态**：`'ring' | 'grid'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **showLegend 布尔行为**：true/false 渲染差异（showLegend=true 显式断言）
- [ ] **nodes 数据面**：`RelationGraphNode[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **edges 数据面**：`RelationGraphEdge[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **selectedId 数据面**：`string | null`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **width 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onSelect 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onNodeClick 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Resizable（Resizable）

> 拖拽分割面板：pointer + 键盘方向键 + clamp（shadcn）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **direction 枚举态**：`'horizontal' | 'vertical'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **defaultSize 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **min 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **max 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **step 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onResize 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Result（Result）

> 结果页：success/error/warning/info + extra 操作区
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **status 数据面**：`ResultStatus`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **desc 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **extra 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：title 透传到根元素

### Scrollbar（Scrollbar）

> 自定义滚动容器：webkit 样式 + hover 显示
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **orientation 枚举态**：`'vertical' | 'horizontal'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **always 布尔行为**：true/false 渲染差异（always=true 显式断言）
- [ ] **maxHeight 数据面**：`number | string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number | string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children/style 透传到根元素

### SearchInput（SearchInput）

> 搜索输入框，带清除按钮
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onInput 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onClear 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### SegmentedControl（SegmentedControl）

> 分段单选（模式切换/筛选/模板），支持 sm/block
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`'sm' | 'md'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **block 布尔行为**：true/false 渲染差异（block=true 显式断言）
- [ ] **options 数据面**：`SegmentedOption[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **ariaLabel 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Select（Select）

> 原生下拉选择器
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **required 布尔行为**：true/false 渲染差异（required=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **searchable 布尔行为**：true/false 渲染差异（searchable=true 显式断言）
- [ ] **multiple 布尔行为**：true/false 渲染差异（multiple=true 显式断言）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string | string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **options 数据面**：`SelectOptions`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onSearch 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：children 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ 受控输入纪律：searchable 输入焦点丢失——useControlledInput 内部态
- [ ] **纪律回归**：⚠ 事件 prop 判定：on+大写（EVENT_RE）——once/only 等 on 开头属性防误判
- [ ] **纪律回归**：⚠ 浮层必须 portal（§5.4）——absolute 相对父容器在 overflow 下裁剪

### SessionList（SessionList）

> 会话管理列表：分组（今天/昨天/更早）+ 搜索 + 选中 + 重命名/删除/新建 + 键盘导航
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **searchable 布尔行为**：true/false 渲染差异（searchable=true 显式断言）
- [ ] **sessions 数据面**：`Session[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **activeId 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **newLabel 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onSelect 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onNew 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onDelete 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### SheetGrid（SheetGrid）

> weifuwu/components/SheetGrid — xlsx 网格编辑器（ODES 事件流底座） 设计（design/office-events-plan.md）：文档 = fold(事件流)——SheetGrid 的每个
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **readonly 布尔行为**：true/false 渲染差异（readonly=true 显式断言）
- [ ] **workbook 数据面**：`WorkbookState`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### Skeleton（Skeleton）

> text/circle/rect/image/avatar/table 六种变体
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **variant 数据面**：`SkeletonVariant`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **lines 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **cols 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **width 数据面**：`number | string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number | string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### SlideCanvas（SlideCanvas）

> weifuwu/components/SlideCanvas — pptx 画布编辑器（ODES 事件流——阶段 3） 设计（design/office-events-plan.md）：文档 = fold(事件流)——每个编辑 =
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **readonly 布尔行为**：true/false 渲染差异（readonly=true 显式断言）
- [ ] **deck 数据面**：`DeckState`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### Slider（Slider）

> 范围滑块，支持 min/max/step/label
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **range 布尔行为**：true/false 渲染差异（range=true 显式断言）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **min 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **max 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **step 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **marks 数据面**：`SliderMark[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChangeEnd 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ 浏览器表单状态恢复（刷新/后退）覆盖受控 value——autocomplete=off + 内部 0-100 归一化刻…
- [ ] **纪律回归**：⚠ 拖拽中气泡位置冻结——usePopup 锚点恒定需 popup.refresh() 跟随 thumb

### SortableList（SortableList）

> 拖拽排序列表——useDragDrop 原语 + keyed 身份（任务/字段/配置排序）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **items 数据面**：`T[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **keyField 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **draggingClass 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onReorder 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Space（Space）

> 间距容器：size/direction/wrap + split 分隔符
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`number | 'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **direction 枚举态**：`'horizontal' | 'vertical'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **align 枚举态**：`'start' | 'center' | 'end' | 'baseline'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **wrap 布尔行为**：true/false 渲染差异（wrap=true 显式断言）
- [ ] **split 数据面**：`any`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素

### Sparkline（Sparkline）

> 迷你趋势线：SVG 自绘 + 归一化 + 平滑曲线 + 面积填充
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **fill 布尔行为**：true/false 渲染差异（fill=true 显式断言）
- [ ] **smooth 布尔行为**：true/false 渲染差异（smooth=true 显式断言）
- [ ] **data 数据面**：`number[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **width 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **stroke 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### StatCard（StatCard）

> KPI 指标卡，支持 trend/icon
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **trend 枚举态**：`'up' | 'down'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **animate 布尔行为**：true/false 渲染差异（animate=true 显式断言）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string | number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **trendLabel 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **icon 数据面**：`string | VNode | null`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **countdown 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onClick 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onFinish 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Steps（Steps）

> 分步指示器，支持 active/current
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **items 数据面**：`StepItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **active 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **current 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）

### Switch（Switch）

> 开关切换，视觉替代 checkbox
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **checked 布尔行为**：true/false 渲染差异（checked=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### TabBar（TabBar）

> 底部标签栏——移动端 App 主导航（3-5 tab + icon/badge/受控激活 + safe-area 避让）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **fixed 布尔行为**：true/false 渲染差异（fixed=true 显式断言）
- [ ] **items 数据面**：`TabBarItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **activeKey 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Table（Table）

> 可排序 + 自定义 render + 空状态
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **sortOrder 枚举态**：`'asc' | 'desc'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **loading 布尔行为**：true/false 渲染差异（loading=true 显式断言）
- [ ] **data 数据面**：`any[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **columns 数据面**：`TableColumn[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **sortKey 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rowSelection 数据面**：`TableRowSelection`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **emptyText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **minWidth 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **loadingRows 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **纪律回归**：⚠ 固定列必须显式 width（缺省 140 估算 + console.warn——sticky 偏移累计依赖）
- [ ] **纪律回归**：⚠ 数组空洞：children 里 {cond && <X/>} 是占位——不得误删下一个兄弟（提交按钮消失事故同源）
- [ ] **纪律回归**：⚠ 行内编辑（editable 列）必须配 onCellEdit（受控纪律）

### Tabs（Tabs）

> 标签页切换，支持 active/onChange
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **closable 布尔行为**：true/false 渲染差异（closable=true 显式断言）
- [ ] **addable 布尔行为**：true/false 渲染差异（addable=true 显式断言）
- [ ] **items 数据面**：`TabItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **active 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onClose 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onAdd 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **纪律回归**：⚠ 混合数组稳定 key：tabList+addBtn+ink 全 keyed——无 key 项退 unkeyed 位置配对…
- [ ] **纪律回归**：⚠ closable 必须配 onClose / addable 必须配 onAdd（受控纪律——console.warn）

### Tag（Tag）

> 标签，支持 closable/onClose
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **variant 枚举态**：`'default' | 'primary' | 'success' | 'danger'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **closable 布尔行为**：true/false 渲染差异（closable=true 显式断言）
- [ ] **onClose 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：children 透传到根元素

### TagsInput（TagsInput）

> 标签输入：回车/逗号添加 + 中文输入法感知
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **allowDuplicates 布尔行为**：true/false 渲染差异（allowDuplicates=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **value 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **maxTags 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **hint 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Textarea（Textarea）

> 多行文本，支持 rows/label/error/hint
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **required 布尔行为**：true/false 渲染差异（required=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **showCount 布尔行为**：true/false 渲染差异（showCount=true 显式断言）
- [ ] **label 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **hint 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rows 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **maxLength 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onInput 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### ThemeSwitch（ThemeSwitch）

> 主题切换：auto/light/dark，localStorage 持久化
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **mode 数据面**：`ThemeMode`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **storageKey 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **preset 数据面**：`PresetName`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onPresetChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Timeline（Timeline）

> 时间线：节点状态色 + 时间 + 内容（执行日志/审批历史）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **mode 枚举态**：`'left' | 'alternate' | 'horizontal'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **reverse 布尔行为**：true/false 渲染差异（reverse=true 显式断言）
- [ ] **items 数据面**：`TimelineItem[]`——传入 → DOM 呈现（执行时读源核对语义）

### Toast（Toast）

> 5 种位置 + 自动消失 + 数量限制
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **toasts 数据面**：`ToastItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **position 数据面**：`ToastPosition`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **duration 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **max 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onRemove 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### Toggle（ToggleGroup）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **variant 枚举态**：`'default' | 'outline'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **pressed 布尔行为**：true/false 渲染差异（pressed=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onPressedChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **DOM 透传**：children 透传到根元素

### ToolCallCard（ToolCallCard）

> 工具调用卡片：running / ok / error 状态机（call/progress/result 三字段驱动）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **call 数据面**：`WfToolCall`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **progress 数据面**：`WfToolProgress`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **result 数据面**：`WfToolResult`——传入 → DOM 呈现（执行时读源核对语义）

### Tooltip（Tooltip）

> hover 浮动提示，4 方向
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **content 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **position 数据面**：`TooltipPosition`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ portal 槽豁免（同 HoverCard）——浮层插槽非业务列表

### Tour（Tour）

> 新手引导：步骤气泡 + 目标高亮 + 遮罩 + 键盘 Escape
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **open 布尔行为**：true/false 渲染差异（open=true 显式断言）
- [ ] **mask 布尔行为**：true/false 渲染差异（mask=true 显式断言）
- [ ] **steps 数据面**：`TourStep[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **current 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onStepChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onFinish 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）

### Transfer（Transfer）

> 穿梭框：双列表 + 选中移动（antd/EP Transfer）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **size 枚举态**：`'sm' | 'md' | 'lg'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **showSearch 布尔行为**：true/false 渲染差异（showSearch=true 显式断言）
- [ ] **data 数据面**：`TransferItem[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **targetKeys 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **searchPlaceholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### Tree（Tree）

> 树形：递归模型 + 勾选父子联动 + indeterminate（antd/EP Tree）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **checkable 布尔行为**：true/false 渲染差异（checkable=true 显式断言）
- [ ] **expandOnClick 布尔行为**：true/false 渲染差异（expandOnClick=true 显式断言）
- [ ] **virtual 布尔行为**：true/false 渲染差异（virtual=true 显式断言）
- [ ] **data 数据面**：`TreeNode[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **selectedKeys 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **expandedKeys 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **checkedKeys 数据面**：`string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **searchValue 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onSelect 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onExpand 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onCheck 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **纪律回归**：⚠ 受控纪律：selectedKeys/checkedKeys/expandedKeys 必须配回调（缺回调 console…
- [ ] **纪律回归**：⚠ 小尺寸 button 固定 min/max-height（§5.6）：checkbox 14x36 竖条事故
- [ ] **纪律回归**：⚠ 虚拟模式（virtual）键盘导航限于可见窗口（VirtualList 无 scrollTo——裁剪登记）

### TreeSelect（TreeSelect）

> 树形选择：单选/多选（父子联动）+ 选中 label 回显 + 受控纪律
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **multiple 布尔行为**：true/false 渲染差异（multiple=true 显式断言）
- [ ] **disabled 布尔行为**：true/false 渲染差异（disabled=true 显式断言）
- [ ] **virtual 布尔行为**：true/false 渲染差异（virtual=true 显式断言）
- [ ] **options 数据面**：`TreeNode[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **value 数据面**：`string | string[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **placeholder 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **error 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onChange 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **浮层定位**：portal 归属 + 面板与锚点几何关系（placement/翻转/视口夹紧——「在哪」断言，非「在视口内」弱断言）
- [ ] **纪律回归**：⚠ 弹窗纪律（§5.4）：曾遗漏 portal——absolute 在父容器 overflow/transform 下裁剪/…
- [ ] **纪律回归**：⚠ 选项量小场景搜索过滤已裁剪（components-cuts.md 永久裁剪）

### Title（Typography）

> 标题排版（语义标签 + 语义色 -text 变体）——Typography 家族
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **level 数据面**：`1 | 2 | 3 | 4 | 5`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素

### VideoPlayer（VideoPlayer）

> 视频播放器——原生 video 封装（controls/封面/宽高比/事件——零依赖）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **controls 布尔行为**：true/false 渲染差异（controls=true 显式断言）
- [ ] **autoPlay 布尔行为**：true/false 渲染差异（autoPlay=true 显式断言）
- [ ] **loop 布尔行为**：true/false 渲染差异（loop=true 显式断言）
- [ ] **muted 布尔行为**：true/false 渲染差异（muted=true 显式断言）
- [ ] **src 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **poster 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **aspect 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **onPlay 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onPause 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onEnded 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）
- [ ] **onError 事件**：触发 → 回调收到预期参数（受控类断言回流：onChange → props → 显示同步）

### VirtualList（VirtualList）

> 虚拟列表：spacer + 可见窗口，200 条只渲染 ~12 个 DOM
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **items 数据面**：`any[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **itemHeight 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **overscan 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **emptyText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### VirtualTable（VirtualTable）

> 虚拟表格：10k 行固定表头 + 可见窗口渲染 + 排序
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **sortOrder 枚举态**：`'asc' | 'desc'`——逐值渲染断言（类/样式/结构随值变化）
- [ ] **columns 数据面**：`TableColumn[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **data 数据面**：`any[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **height 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rowHeight 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **overscan 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **sortKey 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **emptyText 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rowSelection 数据面**：`{`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **selectedRowKeys 数据面**：`(string | number)[]`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rowKey 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）

### Watermark（Watermark）

> 水印：canvas 平铺绘制 + overlay（antd Watermark）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **text 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **fontSize 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **color 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **opacity 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **rotate 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **gap 数据面**：`number`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素

### Wave（Wave）

> 点击水波纹动效——包装任意可点击元素（纯 CSS，reduced-motion 自动降级）
- [ ] **渲染基线**：页面挂载零错误——主类/主结构出现（demo 舞台可见）
- [ ] **className 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **color 数据面**：`string`——传入 → DOM 呈现（执行时读源核对语义）
- [ ] **DOM 透传**：children 透传到根元素

