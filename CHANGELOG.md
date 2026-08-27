# Changelog

> 版本节奏纪律（01 生态计划 P2）：每版强制更新——发布时 `node scripts/release.mjs <version>`
> 自动从 git log 生成 `## [version]` 条目（conventional commits 分组）；0.86 前历史为手工标题式。
> 0.x 阶段：快速迭代 + 破坏性变更提前 1 版本 console.warn 标记。

## [Unreleased]

（release.mjs 发布时自动生成——不要手写）

## [0.87.0] - 2026-08-27

### Added

- 范围简化——仅保留 /、/layout、/components 三域
- 舞台编排——组件详情页升级 + 全站双重阴影清理
- usePopup 会话级模态四件套实现——presence 已测 + trapFocus/lockScroll/mask/position 补齐（32 场景全绿）
- SSR 结构吸收实现 + core/ssr/ 目录重构——首帧复用 DOM 焦点保持
- P5 全部完成——替换计划收官（1656 全绿 + tsc 0）
- P5 退役主体——ui-dom 删除 + 构建清理 + 全量迁移收尾
- P4 apps 迁移——showcase + agent-platform + examples 模板全切 vdom
- P3 包面切换——weifuwu/vdom 成为组件契约面
- P2 收尾——office 迁移（pptx/docx/xlsx/xml-serialize——vdom3 → vdom）
- P2 组件库迁移完成——132 组件 + 1327 测试全绿（ui-dom → vdom）
- P1 契约补齐完成——5 hooks 移植（useTween/useDrag/useVisualViewport/useReducedMotion/usePopupPosition）
- 四层集成测试 + keyed 重排语义修正（相对顺序检测——move id 覆盖根治）
- RefRegistry——ref 全局注册表管理（对齐事件代理模式）
- 事件代理——EventRegistry（事件表 + document 捕获根监听）
- UIContext——前端 ctx 类型增强方案（对齐后端 Context 模式）
- 契约验收——公共面契约测试 + 组件库迁移试点
- uiSsr——服务端渲染闭环（同一 handler → 完整 HTML 文档）
- core/html——commandToHtml（命令流 → HTML——流式 SSR 核心）
- createClientBrowser + usePopup presence（会话级模态退场状态机）
- middlewares——api/auth/i18n/ws（ctx 注入面）
- useChat——AI 对话会话（流式消息累积 + HITL 审批）
- useControlledInput + useDragDrop + useMedia/useBreakpoint
- useControlled + useScrollPosition + useInView（事件驱动响应式 hooks）
- usePopup 闭环 + 渲染队列调度（确定性）+ portal 关闭清理
- hooks 渲染期调用模型——hook 状态缓存 + useOpen/useGlobalKey/useStableRef
- hooks 基础闭环——createStore + useExternal（跨组件共享状态）
- ctx 完整面——DataPipe 实现 + serve 接入（data/browser/onUnmount）
- patch move——keyed 重排节点移动（阶段 3 完成——diff 闭环）
- keyed 真移除卸载 + 混合数组身份复用（阶段 3 补全）
- 并发 render 守卫——单槽位补跑（阶段 3 补全）
- 生命周期指令显式化——ref/unref（DOM）+ mount/unmount（组件）
- patch 生命周期处理——ref/mount/unmount 指令（阶段 3 补全）
- 节点转换收敛 transform 状态机——完整转换（旧侧让位 + 新侧渲染）
- A 级检测接入 diff——长度变化 + 无 key 组件项 warn 引导
- 阶段2 build 闭环——jsx-runtime 子路径 + 组件输出 null 测试
- 阶段1 route 闭环——导航（navigate/链接拦截/popstate——同一命令流机制）
- keyed 列表 diff + build/diff 去重（共享渲染分发器）
- diff 接入主线——首次全量消费 + 后续精准消费
- node/keyed——keyed 列表语义（业务身份声明协议落地）
- ctx.render() = 重新渲染唯一入口——新 Response command 事件流
- 四阶段管线（route/build/diff/patch）+ shared router Trie + 无 hydration
- transform 状态机目录 + command 命令目录——结构细分
- children/node/hole/native/component 独立文件——渲染职责收敛
- ref/key/style 独立文件——通道职责再细分
- 属性三通道拆分——attributes/props/events 独立文件
- 环境即依赖注入——uiServe(router, { root, browser })——测试零全局污染
- UIRouter + uiServe 最小闭环——命令流渲染 hello world
- core/vnode + context/Ctx——vnode 纯数据面类型与 h/jsx 工厂
- 结构符号完全内化——Fragment/createPortal 移出公共面（X-S1 禁导出断言）
- 公共面稳定契约——index.ts 对外接口（内部引擎切换不影响功能）+ X-S 系列
- UIRouter/uiServe 纳入契约标准（每个 vdom 必选——公共面导出）+ vdom3 退役规划
- UIRouter + uiServe——路由/SSR 补齐（类比后端 Router/serve——Trie 匹配）
- render() 返回 Promise——await ctx.ui.render() 精确等待（契约 §4.2 落地）
- 组件编写标准（强制）——三层强制执行 + 审计测试防护网
- filter(Boolean) 红线——占位法替代（A 级检测移植 vdom4）+ X-B8 契约
- 条件渲染统一标准——children 值域协议（空洞/文本/数组/非法输入矩阵）
- Fragment 内化——数组 = 隐式 Fragment（递归展开契约）+ 统一写法
- Portal 内化——usePopup 成为弹层唯一入口（createPortal 转内部机制）
- 引擎契约测试——组件库能力沉淀为 vdom5 验收标准（37 测试全绿）
- 组件库试金石第 5 批——真实 Collapse/VirtualList 零改动跑通 + keyed 锚 id 唯一化
- 组件库试金石第 4 批——真实 Tabs/Popover 零改动跑通 + portal 清理/browser 注入修复
- 组件库试金石第 3 批——真实 Carousel/Toast 零改动跑通 + keyed 判定修复
- 组件库迁移试点扩展——真实 Modal/Tree 零改动跑通 + 引擎兼容修复
- 组件库迁移试点——真实 Button/Select 零改动在 vdom4 引擎跑通
- ctx.data 三场景——SSR 种子收集 → hydration preload 同步命中 / SPA fetch
- keyed 列表（业务身份路径 .k{key}——重排复用 moveSlot）+ 串行调度根治
- SSR 管线（命令 → HTML → 路径 id 精确吸收）+ Fragment 输出修复
- Portal 支持 + usePopup 迁移试点（组件库浮层模式在 vdom4 跑通）
- hooks 面（ctx.ui——复用引擎无关 services/hook-env）+ 串行调度修复
- 独立引擎最小闭环——同步 renderFn + 统一渲染原语 + 锚点法 + 确定性路径
- vdom4 UI-5——import 边界审计固化 + 双实例探针（v5 隔离性可测试保证）
- P5 hydration 结构吸收——SSR 首帧零重建（DOM 复用——焦点/状态保持）
- P3 dispose 协议——unmount/close 完整清理（泄漏消除）
- vdom4 UI-3——HookEnv 引擎无关化 + render(['id']) 跨组件渲染补全
- P2a——props 不可变契约机制化（dev 深度冻结——原地改立即 TypeError）
- P1 锚点法 + 影子状态——每槽恒一锚，domIdx/widthOf 宽度推导消灭
- vdom4 UI-2——RendererService 抽象 + vdom3 adapter（引擎接触面收口）
- P0 命令化 diff——决策（gen）与执行（apply）分离
- vdom4 UI-1——契约层抽取（contracts/vnode + contracts/ctx——引擎无关）
- 首页 hero 改版——微流明三面孔落地（04 设计质量收口）
- /community 社区组件收录域 + 01/05 计划 P0 核对收口
- 02 学习体验计划收尾——典型场景节全覆盖 + 25 组件纪律/坑补写 + 防漂移防线
- 组件搜索 family 维度 + 家族徽标反链 + 07 计划验收完结
- 07 计划收尾——Mobile 模式 TabBar 化 + keyed diff 同引用 prev 推进修复 + demo 新能力活体
- 命名治理——FilePreview 家族命名空间 + family 字段 + 易混组件对照 + 分类审计
- P1 深度补全——Tabs editable / Table 固定列 / Tree 虚拟化 / PromptTemplate + 渲染器 textarea value 修复
- P0 移动端品类——TabBar / ActionSheet / Slider range + Icon 扩充

### Fixed

- VirtualList 滚动失效——getScroller fallback window 吞掉容器监听
- usePopup wrapProps 支持 longpress（contextmenu 右键）触发——ContextMenu 打不开
- 组件输出组件 compId 冲突——连环重挂状态丢失（HoverCard 悬停失效）
- showcase agent-browser 实测——14 个真实 bug（编译面 + 引擎浮层 + AI 流式）
- P5 遗留推进——2 个真实 bug（moved 降序 + remap DOM 属性）
- P5 遗留推进——FilePreview 14 全绿（mount 竞态 + 并发干扰）
- P5 遗留推进——2 个真实 bug + SheetGrid/Editor AI 全绿
- 环节缺口补全——query 注入/redirect 消费/fnTable 清理/错误自愈
- transform 状态机——transitionFragment 递归完整清理 + 全分支测试
- 组件输出数组 ↔ 单节点转换——旧输出完整清理（残留 bug）
- 组件类型切换修复——复用检查（rec.type 比较 + 同步卸载）
- patch 资源释放完整——remove/done 清理 propPrev（表泄漏修复）
- 潜在 bug 源审查——修复 R1 输出 null 失配 + R2 O(n²) + R3 data 失败缓存
- P2a 冻结豁免能力对象——含函数属性的共享可变状态（useChat handle/state）不冻结
- unkeyed 列表重建 anchor 先捕获 + ChatInput props 不可变契约改造
- SSR header 暗色模式刷新闪白——未定义 token 恒回落 #fff
- childrenOf 保留显式 null 子节点为空洞——单子节点条件渲染误报
- A 级动态数组检测 portal 槽豁免——[children, popup.portal()] 打开误报
- 恢复命令式中间件 v3Notification——ctx.notification 静默 no-op
- hover 离开菜单域自动关闭子菜单 + 嵌套 portal 幽灵面板清理

### Docs

- 清理过时引用——ui-dom 路径/已删测试/旧数据
- vdom 替换 ui-dom 计划——五阶段（P1 契约补齐 → P5 退役）
- §7.1.3 测试覆盖度量——v26.7 include-all 工具落地记录
- diff 契约明确——产出 command 事件流（非就地 patch）
- vdom-plan——渲染 = 命令流 + 原生 Request/Response（前后端同构）
- 公共面形状定案——只有 h/jsx、uiServe、UIRouter
- 新版本实现区决策——vdom/ 完全实现后一次性替换 ui-dom
- schedule/build 机制解析 + 剪枝错误根因分析（P1 豁免对象原地改实测）
- 方向调整——独立引擎（不兼容 vdom2/vdom3）+ 消灭挂起超时 hack
- vdom3 生产引擎机制同步（命令化/锚点法/冻结/dispose/hydration/语义 id）
- 标记全部计划完成——01-07 代码部分落地（INDEX 状态同步）
- 07 组件全覆盖与命名治理计划——品类补全 + 家族归并/近义区分/分类审计 + 用户入口
- 06 组件缺口计划——三库对照结论 + 与裁剪登记冲突裁决

### Tests

- 测试环境统一——testBrowser 唯一入口 + jsdom Proxy 全调用追踪
- 覆盖度量续补——popup/observe/input/chat 行为缺口 + root 转换
- 覆盖度量工具落地（--test-coverage-include-all）+ gap 补测
- 覆盖度标准建立——design/vdom-test-standard.md + 不变量 helper
- 映射与转化教学测试——真实例子抓出 3 个引擎 bug + 修复
- transform 全 cell 执行级覆盖——42/42（缺失 12 cell 补全）
- 剩余缺口补测——portal 更新/patch 处理器级/done.full 边界
- 渲染队列 FIFO 语义测试同步——每个请求执行断言
- 细节模块独立测试补全——store/router/attrs（212 全绿）
- 路由切换精准化验证——布局共享场景（Header 复用不重建）
- 综合生命周期测试——浮层 + keyed 列表 + 条件渲染 + Fragment + ref

### Chore

- 清理 src 下误提交的编译产物 .js（65 个——gitignore 防护）
- 模块目录划分——browser/hooks/middlewares/context/core
- 新建 src/client/vdom/ 目录（新版本 vdom 实现区——替换 ui-dom）

## [0.86.0] (129 组件 + 文档库 + 计划体系收口)

- feat: 组件缺口 P0/P1 全量（TabBar/ActionSheet/Slider range/Tabs editable/Table 固定列/Tree 虚拟化/PromptTemplate）
- feat: 命名治理（FilePreview 家族命名空间/family 字段/分类审计/易混对照 12 组）
- feat: content/ 文档库（157 组件典型场景 + 纪律·坑 25 组件归类 + 防漂移测试）
- feat: /community 社区组件收录域 + 首页 hero 微流明三面孔改版
- fix: vdom3 textarea value 走 property / keyed diff 同引用 prev 推进 / Tabs 混合数组 key
- fix: SSR header 暗色模式闪白（未定义 token 恒回落 #fff）

## [0.85.0] (sandbox 集群化)

- feat: 宿主事件上报 + 集群调度器 + 远程执行 RPC + 健康检测
- fix: 发布前 agent-platform TS 类型修复

## [0.84.0] (app 节点 + 共享 routeState)

- feat: 多应用加载（应用编排——不隔离 + 边界标记）
- feat: createRouter 共享 routeState（Sider active 跟随修复）

## [0.83.0] (vdom3 发布形态)

- feat: vdom3 dist 入口 + package 导出 + vdom2 冻结标记 + 命令式 confirm/toast
- fix: vdom3 类型兼容（vdom2 组件资产）

## [0.82.0] (WUI 设计语言)

- feat: seed 单值换肤 / 预设主题 / 状态层 / 浮层抬升
- feat: ThemeSwitch 预设行 + 品牌 seed 实时换肤

## 0.63.1 (文档同步 92 组件 + AGENTS.md 纪律沉淀)

> 发布后核对：组件实际导出 92（Typography 家族 Title/Text/Paragraph 独立计数）；全文档同步 + 框架纪律补充。

### 📝 Docs

- 组件计数 91 → **92**（`src/components/index.ts` 实际 92 组件级导出 + 8 命令式/工具）；README 4 处 + components-execution 终验 + migration/cdd/roadmap 战略目标同步
- AGENTS.md：ctx.ui 能力表补 `useScrollPosition`；新增两条 CDD 沉淀纪律——「受控组件必须配回调」（受控 props 无回调时 dev warn 防护）与「小尺寸 button 固定 min/max-height」（防全局 min-height 撑高）

## 0.63.0 (组件库全量 91 + CDD 闭环 + client 滚动/可见性内置能力)

> 组件库 61→91（antd/Element Plus/shadcn 三库并集全量）；client 新增 `useInView` / `useScrollPosition`；浏览器真实操作闭环修复弹窗定位/受控回调/样式体系。

### ✨ New

- **组件库 +30（91 组件）**：Rate / Typography(Title/Text/Paragraph) / Label / AspectRatio / Toggle / ToggleGroup / CheckboxGroup / PinInput / CopyButton / ColorPicker / HoverCard / Notification / BackTop / Affix / ContextMenu / Mentions / Collapse / Tree / Cascader / Transfer / Command / Menubar / Carousel / Resizable / Calendar / Watermark / VirtualList / InfiniteScroll / QRCode（自研 GF(256) Reed-Solomon，版本 1-6）；Select 增强（键盘 + multiple）；Table rowSelection；Img preview
- **client `ctx.ui.useInView()`**：IntersectionObserver 封装（合成器线程评估，无 scroll-linked 警告）——`isIn` 响应式 + `ready`，rootMargin/threshold 支持函数；替代组件自建 scroll 监听（Affix/BackTop/InView 统一）
- **client `ctx.ui.useScrollPosition()`**：全局 scroll 监听 + rAF 节流——`y` 响应式（视口/内部容器通用），scroll handler 无布局访问；Affix（阈值固定）/ VirtualList（虚拟窗口）使用
- **受控组件 dev warn 防护**：Collapse/Tree/Calendar/Cascader/Dropdown——受控 props 已传但无回调时控制台明确提示（杜绝静默不可点）
- **docs**：components-roadmap / migration / cdd / map / execution 五份组件规划文档；README 91 组件全表 + 能力速查

### 🐛 Fixes（浏览器真实操作闭环）

- **弹窗定位**：usePopupPosition 时序（refresh 须在 panel VNode 创建前，首开左上角根因）+ 11 处弹层 inline `position: fixed` 兜底（CSS 缺失不退化）
- **内联 ref 清零**：Menubar/Command/Collapse/Carousel/PinInput/Accordion 工厂模式 → mount 稳定 ref + data-idx
- **scroll-linked 定位警告**：Affix/BackTop/VirtualList/InView 迁移内置 IO/scroll 能力，组件自建 scroll 监听清零
- **Cascader 闭包 path 快照**（受控有 value 时从根重选路径错误）；Collapse/Tree/Calendar/Cascader/Dropdown demo 受控补回调
- **Tree**：半选向上传播（递归状态推导）、祖先全选显示 checked、箭头方向、折叠 onExpand
- **Carousel**：圆点正圆 + 箭头中心可点（dots 容器全宽遮挡）、autoplay 补单测 + demo
- **VirtualList**：容器定位/宽度内联（flex 取内容宽为 0 根因）、刷新恢复滚动位置 y 不同步
- **HoverCard 弹层叠盖**（缺 placement transform）、Typography 文字遮挡（ellipsis nowrap 撑开 flex 容器）、Slider 进度填充 + Firefox thumb
- **小尺寸按钮被全局 button min-height 撑高**：Tree checkbox/switcher、Rate 星、分页、Tags 删除、Tag 关闭、Carousel dot（6 处）
- **build.mjs 动态扫描组件目录**（硬编码列表静默漏 CSS 根因）

### 🚀 apps

- **components-demo**：全部 91 组件可交互 demo（含 autoplay Carousel、受控 Tree/Collapse/Calendar/Cascader/Dropdown）
- **agent-platform**：Chat 复制按钮、Select onChange 类型适配、AppCtx limit 声明

## 0.62.0 (scheduler 计划任务 + 数据层优化 + queue 重写 + 组件 +13)

> 新增 scheduler 中间件（延时/定时任务）；ctx.sql/ctx.redis 可靠性优化；queue 生命周期重写；rateLimit ctx.limit IP 维度；组件库 +13。

### ✨ New

- **scheduler 计划任务中间件**：即时（queue.add 已有）/ 延时（`ctx.schedule`，ZSET + 守护循环）/ 定时（`ctx.cron`，cron 5 字段解析器 + 滚动触发点）；触发后入队复用 queue 可靠执行；多实例原子抢占（ZREM/ZADD NX）无锁；崩溃恢复补扫；`ctx.cancelCron(name)` / `ctx.cancelSchedule(id)`；同 name 重注册 = 覆盖更新；`scheduler({ prefix })` 多应用隔离
- **rateLimit `ctx.limit` scope**：默认按 IP 维度（登录/注册防爆破），`scope: 'global'` 全局共享
- **组件库 +13**：Markdown（零依赖安全子集解析）/ CodeBlock / Timeline / InputNumber / Descriptions / AvatarGroup / MessageBubble / Menu / PasswordInput / TagsInput / Highlight / List / Result（61 组件）

### 🚀 ctx.sql（Postgres 自研客户端）

- **DDL 失效自愈**：seed/迁移 DROP 后 cached plan 错误自动清缓存 + 重 Parse（新语句名）
- **affectedRows**：INSERT/UPDATE/DELETE/MERGE 返回影响行数（非枚举属性，不干扰 deepEqual）
- **insertMany**（多行 VALUES 单次往返）/ **update / delete**（SET/WHERE 全参数化 + WHERE 必填防全表误删）
- **prepared statement 服务端释放**：LRU 淘汰 → 连接空闲批量 DEALLOCATE（防 plan 缓存膨胀）
- **idleTimeoutMs** 空闲连接回收 + acquire 自动扩容重建
- **timestamptz → Date**（带时区语义安全）；timestamp/date/interval 保持字符串（诚实裁剪）
- **onQuery 第 4 参 traceId**（x-trace-id 头 → ALS）

### 🚀 ctx.redis（自研客户端）

- **连接健康三层防线**：池坏连接剔除重建 / `commandTimeoutMs`（阻塞命令 resolve(null)）/ `socketTimeoutMs`（僵尸连接自愈：有 pending 超时无数据 → 主动断开重连）
- **断线状态真实化**：handleDisconnect 更新 status（connected 假阳性修复）
- **丰富命令面**：hash（hset/hget/hgetall/hdel）/ list（lpush/rpush/lpop/rpop/lrange）/ set（sadd/srem/smembers）/ zset（zadd/zrange）/ mget/mset/exists/setnx/incrby
- **池级 pipeline()**（key 自动加前缀）
- **onCommand 观测 + traceId**（对齐 postgres onQuery）

### 🚀 ctx.queue（重写）

- **worker 独立连接**：XREADGROUP BLOCK 不再占池连接（池只服务 add/length）
- **start() 就绪等待**（group 建好才 resolve）+ **stop() 完整退出**（等 loop + 关连接）
- **epoch 世代标记**：stop/start 交替旧 loop 不复活；start 失败回退可重试
- **NOGROUP 自愈**：group 被删自动重建；错误刷屏抑制（5s 窗口）

### 🐛 Fixes

- **messager Redis 环回重复广播**（流式 token 乱序/缺失根因）：publish 携带 `_pid` 实例标识，订阅跳过自己——每个事件恰好投递一次
- **popup 视口夹紧**：DatePicker 面板超高时底部按钮不可点（clampToViewport + panel 动画等待）
- **Fragment diff 错位 / StatCard 动画冻结**（组件层修复）
- **ProgressBar flex 布局塌缩**

### 🧪 Tests

- 1037 全绿（框架 1007 + scheduler 30 + db 191 复用计数）+ app 80
- scheduler：cron 解析器 16 + 延时 8 + cron 集成 6（触发加速：HSET nextRunAt 模拟到点，84s → 0.77s）


## 0.60.1 (ref 语义修复 + 内联 ref 检测 + 测试 5.2s)

> 框架级修复：ref 替换不再误调旧 ref(null)，内联 ref 从"每次渲染误触发清理"到"机制上不可能"；配套内联 ref 检测警告 + 组件库 6 组件 ref 提升。附带收益：测试时长 24s → 5.2s。

### 🐛 Fixes

- **ref 替换不再调旧 ref(null)**：元素仍挂载时 ref(null) 只在真正卸载触发（callRefCleanup）。此前内联 ref（每次渲染新函数）会在每次重渲染误触发 null 分支清理（退订/dispose/removeEventListener）——AiChat 流式不更新的根因，现从机制上消除
- **测试提速 24s → 5.2s**：消除内联 ref 每渲染清理连锁，979 全绿

### ✨ New

- **内联 ref 检测**：同一元素 ref 变化 ≥3 次 → console.warn 提示提 mount 作用域（放过单次/偶发替换）
- **组件库 ref 规范化**：DatePicker / Dropdown / Editor / FileUpload / Popover / Tooltip 提为 mount 作用域稳定引用，组件库零内联 ref

### 🧪 Tests

- 979 全绿（+3：警告触发 / 稳定 ref 不警告 / ref 替换不触发清理·卸载才触发）

---

## 0.60.0 (AI 一等公民落地：ctx.ui.useChat + AiChat 标准对话组件)

> 从「AI 协议可用」到「AI 界面一句话」：`ctx.ui.useChat()`（会话语义层）+ `AiChat`（标准对话组件），流式 token / 工具调用卡 / HITL 审批卡 / 自动滚动 / 错误重试开箱即用，协议对页面完全透明。Agent 页面从 ~176 行胶水降到 ~47 行。

### ✨ New

- **`ctx.ui.useChat({ url, approveUrl })`**：`$` 超集，会话语义 + 协议透明。`$.messages/input/streaming/error/usage/step` 自动渲染，`$.send()/stop()/retry()/clear()/approve()/dispose()` 内置
- **`AiChat` 组件**：标准 AI 对话界面（气泡 / ToolCallCard 内嵌 / ApprovalCard / 思考状态 / token 计数 / 错误重试 / 输入条 / 自动滚动），`chat` handle 作 prop，`labels`/`renderMessage`/`renderToolArgs` 可定制
- **响应式多消费者订阅**：`createReactiveState` 增加 `__watch`——共享父 `$` 的子组件（如 AiChat）自订阅驱动重渲染（三态 skip 下父 dirty 不再"丢失"子组件）
- **queue `WorkerOptions.blockMs`**：XREADGROUP 阻塞可配置，重投延迟 = `max(visibilityTimeout, blockMs)`
- **rateLimit PEXPIRE**：fixed window 改毫秒精度 TTL，修复 `<1s` 窗口虚增缺陷

### 🐛 Fixes

- **AiChat 流式不更新（浏览器实测发现）**：ref 内联闭包每次渲染引用变化 → ref-diff 调旧 ref(null) → watcher 被误退订。纪律：**带清理的 ref 必须定义在 mount 作用域**

### 📚 Docs

- `docs/ai-contract.md`：前端参考实现补充 `ctx.ui.useChat`（会话语义层）
- AGENTS.md：`ctx.ui.useChat` 进 ctx.ui 家族

### 🧪 Tests

- 976 全绿（+26：useChat 状态机 14 / AiChat 10 / 三态 skip 回归 2 / 类型流）
- **测试提速 31s → 24s**：queue 10.7s→2.4s（blockMs）、rateLimit 3.5s→2.0s（PEXPIRE + 短窗口）
- 组件计数 46 → **47**（+AiChat），components-demo 徽标/页脚修正
- 三个 tsconfig（root / demo / components-demo）0 错误（修 17 个既有 strict 错误）

---

# Changelog

> 版本节奏纪律（01 生态计划 P2）：每版强制更新——发布时 `node scripts/release.mjs <version>`
> 自动从 git log 生成 `## [version]` 条目（conventional commits 分组）；0.86 前历史为手工标题式。
> 0.x 阶段：快速迭代 + 破坏性变更提前 1 版本 console.warn 标记。

## [Unreleased]

（release.mjs 发布时自动生成——不要手写）

## [0.86.0] (129 组件 + 文档库 + 计划体系收口)

- feat: 组件缺口 P0/P1 全量（TabBar/ActionSheet/Slider range/Tabs editable/Table 固定列/Tree 虚拟化/PromptTemplate）
- feat: 命名治理（FilePreview 家族命名空间/family 字段/分类审计/易混对照 12 组）
- feat: content/ 文档库（157 组件典型场景 + 纪律·坑 25 组件归类 + 防漂移测试）
- feat: /community 社区组件收录域 + 首页 hero 微流明三面孔改版
- fix: vdom3 textarea value 走 property / keyed diff 同引用 prev 推进 / Tabs 混合数组 key
- fix: SSR header 暗色模式闪白（未定义 token 恒回落 #fff）

## [0.85.0] (sandbox 集群化)

- feat: 宿主事件上报 + 集群调度器 + 远程执行 RPC + 健康检测
- fix: 发布前 agent-platform TS 类型修复

## [0.84.0] (app 节点 + 共享 routeState)

- feat: 多应用加载（应用编排——不隔离 + 边界标记）
- feat: createRouter 共享 routeState（Sider active 跟随修复）

## [0.83.0] (vdom3 发布形态)

- feat: vdom3 dist 入口 + package 导出 + vdom2 冻结标记 + 命令式 confirm/toast
- fix: vdom3 类型兼容（vdom2 组件资产）

## [0.82.0] (WUI 设计语言)

- feat: seed 单值换肤 / 预设主题 / 状态层 / 浮层抬升
- feat: ThemeSwitch 预设行 + 品牌 seed 实时换肤

## 0.62.0 (scheduler 计划任务 + 数据层优化 + queue 重写 + 组件 +13)

> 新增 scheduler 中间件（延时/定时任务）；ctx.sql/ctx.redis 可靠性优化；queue 生命周期重写；rateLimit ctx.limit IP 维度；组件库 +13。

### ✨ New

- **scheduler 计划任务中间件**：即时（queue.add 已有）/ 延时（`ctx.schedule`，ZSET + 守护循环）/ 定时（`ctx.cron`，cron 5 字段解析器 + 滚动触发点）；触发后入队复用 queue 可靠执行；多实例原子抢占（ZREM/ZADD NX）无锁；崩溃恢复补扫；`ctx.cancelCron(name)` / `ctx.cancelSchedule(id)`；同 name 重注册 = 覆盖更新；`scheduler({ prefix })` 多应用隔离
- **rateLimit `ctx.limit` scope**：默认按 IP 维度（登录/注册防爆破），`scope: 'global'` 全局共享
- **组件库 +13**：Markdown（零依赖安全子集解析）/ CodeBlock / Timeline / InputNumber / Descriptions / AvatarGroup / MessageBubble / Menu / PasswordInput / TagsInput / Highlight / List / Result（61 组件）

### 🚀 ctx.sql（Postgres 自研客户端）

- **DDL 失效自愈**：seed/迁移 DROP 后 cached plan 错误自动清缓存 + 重 Parse（新语句名）
- **affectedRows**：INSERT/UPDATE/DELETE/MERGE 返回影响行数（非枚举属性，不干扰 deepEqual）
- **insertMany**（多行 VALUES 单次往返）/ **update / delete**（SET/WHERE 全参数化 + WHERE 必填防全表误删）
- **prepared statement 服务端释放**：LRU 淘汰 → 连接空闲批量 DEALLOCATE（防 plan 缓存膨胀）
- **idleTimeoutMs** 空闲连接回收 + acquire 自动扩容重建
- **timestamptz → Date**（带时区语义安全）；timestamp/date/interval 保持字符串（诚实裁剪）
- **onQuery 第 4 参 traceId**（x-trace-id 头 → ALS）

### 🚀 ctx.redis（自研客户端）

- **连接健康三层防线**：池坏连接剔除重建 / `commandTimeoutMs`（阻塞命令 resolve(null)）/ `socketTimeoutMs`（僵尸连接自愈：有 pending 超时无数据 → 主动断开重连）
- **断线状态真实化**：handleDisconnect 更新 status（connected 假阳性修复）
- **丰富命令面**：hash（hset/hget/hgetall/hdel）/ list（lpush/rpush/lpop/rpop/lrange）/ set（sadd/srem/smembers）/ zset（zadd/zrange）/ mget/mset/exists/setnx/incrby
- **池级 pipeline()**（key 自动加前缀）
- **onCommand 观测 + traceId**（对齐 postgres onQuery）

### 🚀 ctx.queue（重写）

- **worker 独立连接**：XREADGROUP BLOCK 不再占池连接（池只服务 add/length）
- **start() 就绪等待**（group 建好才 resolve）+ **stop() 完整退出**（等 loop + 关连接）
- **epoch 世代标记**：stop/start 交替旧 loop 不复活；start 失败回退可重试
- **NOGROUP 自愈**：group 被删自动重建；错误刷屏抑制（5s 窗口）

### 🐛 Fixes

- **messager Redis 环回重复广播**（流式 token 乱序/缺失根因）：publish 携带 `_pid` 实例标识，订阅跳过自己——每个事件恰好投递一次
- **popup 视口夹紧**：DatePicker 面板超高时底部按钮不可点（clampToViewport + panel 动画等待）
- **Fragment diff 错位 / StatCard 动画冻结**（组件层修复）
- **ProgressBar flex 布局塌缩**

### 🧪 Tests

- 1037 全绿（框架 1007 + scheduler 30 + db 191 复用计数）+ app 80
- scheduler：cron 解析器 16 + 延时 8 + cron 集成 6（触发加速：HSET nextRunAt 模拟到点，84s → 0.77s）


## 0.59.1 (README 重写：理念三层化 + async 规则页 + 样式系统总览)

> 文档层重构，无功能变化。理念从"8 条平铺"到"一句话 + 三层哲学 + 十条原则"；把散在 6 处的 async 组件规则集中为「三条纪律」页。

### 📚 Docs

- **README 重写**（3097 行）：一句话灵魂（全自研、零配置、消灭样板）+ 核心哲学 3 条（一个包全栈 / 诚实裁剪 / 消灭样板）+ 技术原则 10 条（补齐 AI 一等公民、SaaS 地基、零自定义 CSS）
- **核心概念新增**：async 组件三条纪律页（数据 key 含维度 / 会变数据放 `$` / 初始状态确定性，反例→正确对照）+ 常见坑 + 渲染策略（SPA vs SSR）选择表
- **docs/style-system.md**：样式系统总览（六层架构 / 机制 / 命名 / 接入 / 边界）
- **术语统一**："形态 C" → "async 组件"（README + AGENTS.md，消除未定义 A/B 的断层术语）
- **组件计数修正** 44 → 46（ToolCallCard / ApprovalCard 漏计）
- **修复历史遗留**：布局系统章节孤立 ``` 标记（README 代码块 221 → 220 平衡）

### 🧪 Tests

- 796 全绿 + style-audit 8 项全绿（README 数字一致性 115 / 67 / 46 锁定）

---

## 0.59.0 (设计系统 P7：组件变量化 + Token 双层化 + @layer + prose)

> 从"有一套好用的类"到"设计系统融入开发流"：定制组件 = 设一个变量（`--wf-modal-width`），定制主题 = 改一层值（`--wf-brand-500`）——零覆盖 CSS。三个真实应用（agent-platform / aippt / components-demo）已全量删除自研样式文件，纯组件 + 原语运行。

### ✨ New

- **组件 CSS 变量化**（shadcn 模式）：16 个定制钩子，默认值回退现有 token——`--wf-btn-radius/pad-*` `--wf-card-radius/shadow` `--wf-field-radius/height` `--wf-modal-width/radius/shadow` `--wf-drawer-width` `--wf-toast-width/radius` `--wf-alert-radius` `--wf-badge-radius` `--wf-tag-radius` `--wf-switch-radius` `--wf-popover-width/radius` `--wf-tooltip-radius` `--wf-dropdown-min-width` `--wf-datepicker-*`。浏览器实测 `--wf-btn-radius: 999px` 即生效，无 `!important`
- **Token 双层化**：92 → **115** token（原始层 `--wf-brand-500`/`--wf-slate-*`/`--wf-dark-*` 色值只定义一次 + 语义层组件消费）。品牌换色 = 覆盖 `--wf-brand-500` 一个值全站跟随；多租户品牌两行 CSS
- **暗色去重**：`--wf-dark-*` 间接层——`_dark.css` 两段只做语义映射，零硬编码色值（style-audit 强制），暗色调校只动原始层
- **@layer 层叠化**：`@layer tokens, base, layout, utilities, components`——用户未分层 CSS 天然最高优先级；`@layer utilities` 可精准覆盖；build 按文件映射包层，源文件零侵入
- **`wf-prose`**：富文本正文排版（文章/博客/文档，一个类包 h2-h4/p/ul/ol/blockquote/pre/code/table/hr/img）
- **命名收尾**：`wf-text-primary`/`wf-bg-primary`（`brand` 保留别名）、`wf-leading-{tight,base,relaxed}`（行高）、`wf-pointer`/`wf-not-allowed`（cursor）
- **组件新能力**：`SegmentedControl`（分段单选，aria-pressed + focus-visible）、`Card` `active`（选中态）+ `hover`（抬升）、`Avatar` `color` prop（按类型着色）、`Textarea` `showCount`/`maxLength`（字数统计）、`Input` `variant="borderless"`（可编辑标题）、`StatCard` `onClick`（可点击指标卡）
- **layout 工具类补全**：`wf-p/m/gap-*` 间距（含 `wf-mx-auto`）、`wf-border(-t/b/l/r)`、`wf-rounded-*` + `wf-pill`、`wf-bg-*`/`wf-text-*` 语义色（6 色体系）、`wf-bubble(-own/-ai)` 聊天气泡、`wf-app-shell` 应用外壳（sidebar/nav/main）、`wf-print-hidden/block`、`wf-dim`、`wf-pre-wrap`/`wf-truncate` 排版
- **应用零 style.css**：agent-platform（删除 `routes.ts` 内 409 行 GLOBAL_CSS + index.html 27 行）、aippt（删除 190 行 style.css）、components-demo（61 行 + 94 处内联）、weifuwu-demo（style.css 删除）——全站只引用 `weifuwu/components/style.css`，浏览器实测 0 非 `wf-*` 类

### 📚 Docs

- `docs/style-guide.md`：统一语法 `wf-<域>-<名>`、三档学习路径（组件 → 10 核心原语 → 速查）、场景速查、变量定制清单
- `docs/token-layout-optimize.md`：P7 计划与验收记录；`docs/design-system-gaps.md`：P5-P6 走查与转换记录
- README：布局原语 64 → 67、Token 92 → 115（双层结构）、组件定制钩子章节、@layer 覆盖说明、三档学习路径

### 🧪 Tests

- 794 → **796**：Card active/hover 2 + Input borderless 1 + SegmentedControl 5 + Textarea counter 3 + StatCard onClick + Avatar color
- style-audit 6 → **8 项**：新增"组件关键视觉 var() 化"（radius/容器宽度禁止裸值）+ "暗色段无硬编码色值"（--wf-dark-* 间接层强制）
- 796 全绿；三应用 UI 独立编译 + 真实服务 + agent-browser DOM 审计通过

---

## 0.58.0 (AI 模块：自研 wf: 协议 + 零依赖客户端 + agent 引擎 + 交互原语)

> AI 是 weifuwu 的一等公民：自研 `wf:` 协议（docs/ai-contract.md）+ 零依赖 OpenAI 兼容客户端 + 前端解码器 + agent 工具循环 + HITL 审批 + 交互原语，不用 ai-sdk。
> 一个 `npm install weifuwu` 即得流式对话 + 工具调用 + 人工审批 + 全链路追踪。

### ✨ New APIs

- **ai**：LLM 对话模块（`src/ai/`）——`ai()` 工厂（queue 式混合：`app.use(a)` 注入 `ctx.ai`，worker 直接 `a.chat()`）；自研 OpenAI 兼容客户端（fetch + SSE，零依赖，默认 DeepSeek `deepseek-v4-flash`，`baseUrl` 可换 Ollama/vLLM/Moonshot）；`ctx.ai.stream()` 路由一行返回 SSE；`ctx.ai.sse(emit)` 低层自定义事件通道
- **wf: 协议**（`docs/ai-contract.md`）：`wf:` 命名空间事件（message_start/token/tool_call/tool_progress/usage/done/error + agent 扩展 step/approval_request），SSE 下行 + POST 上行，错误即值、未知事件透传、`x:*` 自定义事件、错误码表、工具进度 emit、HITL 语义（拒绝≠终止、modified 改参、超时兜底）、追踪关联
- **aiStream**（`weifuwu/client`）：前端解码器——事件分发（onToken/onToolCall/onStep/onApproval/onError…）、`x:*` 透传兜底、事件录制（可导出测试 fixture）、abort、**trace 桥（自动生成 X-Trace-Id → 后端 message_start.id 关联）**
- **agent 引擎**（`src/ai/agent.ts`）：`a.agent({ systemPrompt, tools, maxSteps, humanInTheLoop })` 工具循环——LLM 流式 → tool_call → 执行工具 → 结果回喂 → 重复；工具 `run(args, { emit, signal })`（emit 进度/自定义事件、signal 取消）；HITL 审批（`ctx.ai.approve` 响应，拒绝≠终止、modified 改参、超时按拒绝）
- **交互原语**（`weifuwu/components`）：**ToolCallCard**（工具调用三态卡片：running 进度条 / ok / error，`renderArgs` 自定义渲染）+ **ApprovalCard**（审批四态卡片：待批 允许/拒绝+备注 / 已批 / 已拒 / 超时，纯受控上抛决策）
- **追踪关联**：`X-Trace-Id` 请求头 → `wf:message_start.id` → 工具内请求继承同一 traceId（serve.ts 已有 traceId 机制，响应头回显）

### 🐛 Fixes

- **agent 多轮消息序列**（真实 DeepSeek 抓出，wire-fake 测不出）：带 tool_calls 的 assistant 消息必须入上下文；thinking 模式 `reasoning_content` 必须回传

### 🧪 Tests

- 902 → **940**：ai 8（wire-fake 事件序列/tool_calls 聚合/错误映射/abort/trace 桥）+ aiStream 6（端到端解码/透传/录制/abort）+ ai-agent 7（工具循环/HITL approved·rejected·超时/maxSteps）+ 类型流 2 + ToolCallCard 5 + ApprovalCard 5
- wire-fake：LLM 真 API 付费且不确定，故起真实 HTTP + SSE loopback 服务器保证 CI 确定性（CS-04 精神：不 mock fetch，不 mock 网络层）；真实 DeepSeek + agent-browser 端到端实测通过

---

- 902 → **921**：ai 8（wire-fake 真 HTTP+SSE：事件序列 / tool_calls 聚合 / 错误映射 / abort 传播 / trace 桥）+ aiStream 6（端到端：后端编码 → 前端解码 / 未知事件透传 / 录制 / trace / 错误即值 / abort）
- wire-fake：LLM 真 API 付费且不确定，故起真实 HTTP + SSE loopback 服务器保证 CI 确定性（CS-04 精神：不 mock fetch，不 mock 网络层）

---

## 0.57.0 (SaaS 地基四模块：限流 + 邮件 + 用户系统 + 队列)

> 零新增运行时依赖——四个模块全部建在自研 redis/postgres 客户端 + node 标准库之上。
> 一个 `npm install weifuwu` 即得"基本 SaaS 底座"：认证 + 异步任务 + 限流 + 邮件。

### ✨ New APIs

- **rateLimit**：限流中间件（`src/middleware/rate-limit.ts`）——fixed（INCR+EXPIRE 原子）/ sliding（ZSET）算法、redis（多实例共享计数）/ memory store、全局限流 + `ctx.limit` 手动限流、`RateLimit-Limit/Remaining/Reset` + `Retry-After` 标准头、自定义 key（登录防爆破组合键）
- **email**：统一 `ctx.email.send`（`src/email/`）——`resend` 适配器（一个 POST，独立开发者首选）/ **自研 SMTP 客户端**（node:net+tls：EHLO/STARTTLS/AUTH PLAIN/DATA/dot-stuffing，非 ASCII subject 自动 RFC2047 encoded-word）/ 自定义适配器函数
- **userSystem**：用户系统（`src/user/`）——scrypt 密码哈希（per-user salt + timing-safe，异步不阻塞）、HMAC-SHA256 JWT access（与 `weifuwu/client` auth() 天然配对）+ DB refresh 轮换可撤销、`/api/auth/*` 路由（register/login/logout/me/refresh）、`ctx.user`/`ctx.auth` 注入、登录失败统一 401 防枚举、`createToken`/`setPassword` 底层 API（邮箱验证/密码重置自接）、tenant-ready（`tenant` 字段 + claim 预留）
- **queue**：可靠任务队列（`src/queue/`）——Redis Streams 消费组、at-least-once、失败 ZSET 延迟重试（间隔 = visibilityTimeout）、attempts 用尽 → DLQ（`q:{name}:dead`）、XAUTOCLAIM 崩溃 worker 接管、多 worker 实例消费组隔离、`ctx.queue.add` + `q.worker(name, handler)` 独立进程可跑

### 🐛 Fixes

- **HttpError 状态码**：serve/router 仅处理 413，其余 `HttpError`（如 401/409/429）全部落为 500——README 承诺的"自动返回对应状态码"以修复（`router.handleError` + `serve` catch 统一转状态码 JSON 响应）

### 🧪 Tests

- 861 → **902**：rateLimit 14（真库 redis）/ email 15（协议 mock）+ 2（真实 GreenMail）/ userSystem 16（真库 postgres）/ queue 8（真库 redis）
- docker-compose 新增 **GreenMail** smtp 服务（SMTP 真实服务器兼容性背书）
- redis.test.ts `flushdb` → 只清自身 key（CS-04 真库并行纪律：flushdb 会清掉并行测试的计数）

## 0.56.1 (DB 客户端性能 + 二进制安全)

### 🐛 Fixes

- **Redis 二进制损坏**：`encodeCommand` 的 Buffer 参数被 `toString()` 破坏（0xff 等非 utf8 字节）——改为字节直写
- **Redis 离线队列泄漏**：`close()` 未拒绝离线队列——未连接时入队的命令永久挂起（promise 泄漏）
- **PG prepared 缓存无限累积**（长运行服务内存膨胀）——LRU 上限 128
- **PG bindMessage number[] 逐字节累积**（大 jsonb 参数内存翻倍 + 双重拷贝）——两遍法预分配 + offset 指针

### ✨ New APIs

- `ctx.redis.getBuffer(key)`：二进制安全读取——返回原始字节（Uint8Array），不经过字符串解码；含 0x00/0xff 的 payload 逐字节往返

### 🚀 Performance

- Redis 热路径：`indexOfCRLF` 原生查找 / `:$` 长度手动数字解析 / pending 头指针（bench 真库）
- 解码单例化：PG 三处每次 `new TextDecoder()` → 模块级单例
- socket.write 去 Buffer.from 包装（Uint8Array 直写）

| 操作 | 优化前 | 优化后 | ioredis |
|------|--------|--------|---------|
| Redis get | 0.122ms | **0.061ms** | 0.055ms（1.11×） |
| Redis json 往返 | 0.191ms | **0.119ms** | 0.112ms（1.06×） |
| Redis 并发 set | 0.5ms/批 | **0.3ms/批** | 持平 |
| PG 参数化 SELECT | 0.147ms | **0.103ms** | 0.111ms（反超） |
| PG 事务 | 0.273ms | **0.255ms** | 0.308ms（反超） |

---

## 0.56.0 (async 工厂组件 + SSR/Hydration 统一透明)

### ✨ New APIs

- `asyncComponent(async (ctx) => (initProps, ctx) => (props) => VNode)`：**async 工厂组件（形态 C）**——工厂层声明数据（`await ctx.data.get`）、mount 初始化状态（`$`）、render 输出视图；异步只在工厂边界，mount/render 保持同步，数据经闭包注入
- `ctx.data.get(key, fetcher)`：**数据管道**——SSR 预取 / hydration 命中（`window.__DATA__` 同步命中，不重复请求）/ SPA 触发 fetch；同 key 并发合并；key 即 URL
- `ctx.ui.ssr(Comp, props, { data })`：服务端渲染组件 → HTML 片段（HtmlSafe 自动内联不二次转义）；`ctx.ui.ssrData(data)` → `__DATA__` 序列化（`<` 转义防 XSS）
- `uiSsr({ routes, bundle, styles })`：**路由级 SSR**——GET 匹配共享路由 → 注入 `ctx.route.params` → await 组件工厂 → 完整 HTML + `__DATA__` + bundle/styles；未匹配/非 GET → next()
- `weifuwu/dev`：**Node loader**（`node --import weifuwu/dev server.ts`）——服务端直接跑 `.ts/.tsx`（JSX → 与客户端同一运行时），零构建
- `app.mount('#root', Root, { hydrate: true })`：**Hydration**——游标收养服务端 HTML（不重建、无闪跳），只接线事件/ref/$；mismatch 就地修 + 残留清理
- `clearAsyncComponentCache()`：路由导航/登录登出时工厂缓存失效（以新 ctx 重新执行）

### 🚀 Features

- **SPA/SSR/Hydration 统一透明**：同一份 `routes` + 同一组件形态三场景自动适配——后端 `uiSsr` 自动 SSR，前端 `router + RouteView + hydrate` 按 URL 同源匹配收养（`route-match.ts` 前后端共用）
- 服务端 ctx shim：`$`（dirty no-op）、`ctx.data` 预取去重、`selfId` 请求级隔离
- `patchProps` 支持 class 对象（与 SSR 序列化对齐）
- `createReactiveState` / `HtmlSafe` 抽独立模块（前后端共用）

### 🧪 Tests

- 653 → 693：async 组件 7 / ctx.data 6 / ssr 16 / hydration 9 / uiSsr 9（含 type-flow 编译期断言）

---

## 0.54.0 (弹层坐标跟随 + 全局反馈中间件)

### ✨ New APIs

- `ctx.ui.usePopupPosition(opts)`：弹层坐标跟随——Popover/Tooltip/Dropdown/DatePicker/Chart 的弹出层在页面滚动、嵌套容器滚动、窗口缩放后自动重算 fixed 坐标。全局单例 scroll(capture)/resize 监听 + rAF 节流，按组件 selfId 精准刷新
- `ctx.confirm()`（移入 components）：命令式确认对话框，返回 `Promise<boolean>`，组件化渲染（Modal + portal + 焦点陷阱 + i18n），多次调用叠放互不干扰
- `<Confirm>` 声明式组件：基于 Modal 封装，footer 自带取消/确定
- `ctx.toast()`：命令式消息提示，任意代码可调（组件/拦截器/WS/定时器），自动消失 / 单条 duration 覆盖 / max 限制

### 🔧 Breaking Changes

- `confirm` 从 `weifuwu/client` 移到 `weifuwu/components`：`import { confirm } from 'weifuwu/components'`

### 🚀 Features

- Confirm 由「直接 DOM + 内联样式」改为组件化渲染，主题可定制（`.wf-modal` 系列），与 Modal 视觉/行为统一
- Toast/Confirm 归位组件库，`weifuwu/components` 共 42 个组件 + 2 个命令式中间件

### 🐛 Fixes

- 修复 mountVNode 路径组件首次渲染 null 时 `_refNode` 为空导致 scope render 无法定位
- demo apps 源码修复（apps/demo 误提交压缩产物恢复、agent-platform 括号作用域错位）
- 严格模式 9 个 TypeScript 类型错误（JSX `key`/Input `name`/Skeleton `cols`/ref 类型）

### ✅ 测试

- 611 个测试全过（新增 usePopupPosition 10 + Confirm 13 + toast 9 + $ 深度 Proxy 等）

## 0.53.0 (VDOM 三态 skip + keyed diff)

### 🚀 Features

- 三态 skip：props 没变 + `$` 没脏 + ctx 版本一致 → 跳过整个子树渲染（零 `_render` 调用、零 `patchValue` 遍历）
- lastIndex keyed diff（React 同款），顺序不变时零 `insertBefore`，DemoButton 点击 DOM 修改 34 → 1
- Portal null ↔ 内容切换的 DOM 清理修复；`ctx.ui.$()` 单例缓存（同组件实例返回同一 Proxy）

## 0.52.0 (响应式自适应组件)

### ✨ New APIs

- `ctx.ui.useMedia(query, cb)`：响应式媒体查询，断点变化自动回调
- `ctx.ui.useBreakpoint(cb \| bps, cb?)`：命名断点 mobile/tablet/desktop + 自定义断点
- VDOM 子节点 diff 始终 keyed 模式，无 key 自动分配位置 key

## 0.51.0 (组件级范围渲染)

### ✨ New APIs

- `ctx.ui.selfId(name)`：组件注册自定义 ID，同名冲突抛错
- `ctx.ui.render(['id'])`：按 ID 精准刷新指定组件
- `ctx.ui.dirty(['id'])`：异步版本同上

### 🔧 Breaking Changes

- `ctx.ui.render()` 默认从「刷新整个 VDOM」改为「刷新当前组件」
- `ctx.ui.dirty()` 同理，作用域缩为当前组件
- `ctx.ui.$().x = val` 只触发所属组件渲染，不波及兄弟

### 🚀 Features

- 组件级范围渲染：每个组件实例唯一 `_id`，通过 `idRegistry` 全局注册表可查找
- `render()` / `dirty()` / `$` 三套 API 统一 scope 机制
- 首次渲染后自动设置子组件 DOM 锚点（`_parentNode` / `_refNode`）
- 手动/自动同层共存：组件库手动优先，业务层自动优先
- 全部 472 个测试通过，42 个 components 零修改

## 0.50.0 (VDOM 引擎 + 组件优化)

### ✨ New APIs

- `ref` prop：原生元素 DOM 引用，`ref(el)` 初始化 / `ref(null)` 清理

### 🔧 Breaking Changes

- 移除 `ctx.ui.onmount/onmounted/onunmount/onupdate`：
  - `onmount` → mount 外层函数直接写
  - `onmounted` → `ref` 的 `if (el)` 分支
  - `onunmount` → `ref` 的 `else` 分支
  - `onupdate` → render 内层函数收新 props
- `ref` 不再接受返回值，清理统一走 `ref(null)`
- 移除 VNode `_$` 和 `_cleanup` 内部字段

### 🚀 Features

- Form 验证规则：required / pattern / minLength / maxLength / validator
- Table 排序：sortable / sorter / sortKey / sortOrder / onSort + emptyText
- Toast 位置（5 方向）/ duration / max 数量限制
- Select searchable 搜索过滤 + onSearch 异步搜索
- Modal width / closable 控制
- Skeleton 新增 image / avatar / table 变体
- Tooltip / Popover / Dropdown 入场动画（fade / scale / slide）

### 🐛 Bug Fixes

- Editor 图片按钮导致内容重复（children 索引漂移修复）
- Editor 图片/表格/链接不跟随光标（选区保存恢复机制）
- Editor ref 无效（VDOM ref prop 实现）
- DatePicker/Dropdown 弹出框位置跳跃（DOM 引用过期）
- Popover 弹窗位置偏移（缺少 position CSS class）
- Modal/Drawer trapFocus 因 Portal 文本占位符崩溃
- Drawer 缺少 ESC 键盘关闭
- Portal 组件 onmounted 收到 TextNode 而非实际 DOM

### 🧹 Chores

- 前端 API 从 7 个精简到 3 个：render / dirty / $
- VNode 内部字段从 9 个精简到 6 个
- 测试 473 → 466（移除生命周期测试，新增 ref 测试）
- render.ts 从 ~680 行精简到 ~620 行

## 0.33.8 (Sprint 1-11 — weifuwu/client DX overhaul)

### ✨ New APIs

- **`reactiveArray()`** — 响应式数组，提供 push/pop/shift/unshift/remove/replace/clear/sort/reverse 等方法
- **`useModel()`** — 表单双向绑定，一行代码绑定 signal 到 input/checkbox/select
- **`createResource()`** — 异步数据资源，自动管理 loading/error/data 三态
- **`untrack()`** — 在 effect 中读取 signal 但不建立依赖
- **`batch()`** — 合并多个 signal 写入为一次通知
- **`createContext()`** — 类型安全的 provide/inject 工厂
- **`createStyles()`** — 组件级作用域 CSS
- **`Transition`** — CSS 动画进入/离开组件
- **`Link`** — SPA 路由导航组件（支持右键新标签页）
- **`enableDevtools()`** — 开发警告 + 浏览器控制台 signal 检查器

### 🚀 Enhancements

- **createResource 重试 + 超时** — `retry: N` / `timeout: ms` 选项
- **ErrorBoundary onError** — 错误发生时回调（日志上报）
- **RouteView 路由过渡** — `opts.transition` 配置页面切换动画
- **useForm validateOnInit** — 创建时即运行全部验证
- **LoginForm / Chat 纯 JSX 重写** — 移除 h() 辅助函数，为最佳实践
- **`signal.mutate()`** — 原地修改对象/数组并触发通知
- **computed 初始值修复** — 类型安全的初始值计算

### 🐛 Bug Fixes

- **RouteView 查询参数不更新** — 添加 query 比对，路径不变 query 变时重新渲染
- **Show/For 响应式更新失效** — DocumentFragment → `display:contents` 架构
- **effect 内存泄漏** — 所有 DOM 绑定 effect 注册到元素生命周期，卸载自动 dispose
- **Show/For 子元素 effect 泄漏** — 重建时旧子元素的 effect 正确清理
- **Chat 组件 For 传值 bug** — 传递 Signal 而非普通数组

### 🧪 Testing

- **47 个单元测试** — 覆盖 signal/effect/computed/Show/For/useForm/createResource
- **10 个性能基准测试** — Signal 创建/读写/通知/Computed/JSX 渲染吞吐量

### 📚 Documentation

- **纯前端 Quick Start** — 无需后端即可体验 weifuwu/client
- **React 迁移指南** — `useState→signal`, `useEffect→effect`, `useMemo→computed` 对照表
- **完整 JSDoc** — 所有导出函数有中文文档
- **VSCode 代码片段** — 17 个常用模式（signal/effect/Show/For/Transition 等）

### 性能基线

| 操作 | 吞吐量 |
|------|--------|
| Signal 创建 | ~10,000 ops/ms |
| Signal 读写 | ~9,600 ops/ms |
| 通知 10,000 effect | ~2,600 ops/ms |
| batch 合并 10,000 次写入 | ~0.6ms |
| JSX div 创建 | ~200 ops/ms |
| For 渲染 10,000 项 | ~109 ops/ms |
