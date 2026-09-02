# Changelog

> 版本节奏纪律（01 生态计划 P2）：每版强制更新——发布时 `node scripts/release.mjs <version>`
> 自动从 git log 生成 `## [version]` 条目（conventional commits 分组）；0.86 前历史为手工标题式。
> 0.x 阶段：快速迭代 + 破坏性变更提前 1 版本 console.warn 标记。

## [Unreleased]

（release.mjs 发布时自动生成——不要手写）

## [0.90.1] - 2026-09-02

### Added

- WordCloud 100 词圆心同心环布局 + tooltip · showcase 一页一组件收敛（135=组件库）
- WordCloud 交互面——onWordClick/键盘可达/动态重排 + SVG 命中区修复
- WordCloud 词云组件——确定性行式装箱 + SVG textLength 定宽（零依赖自绘）
- 视频播放——消息/文件列表/交付物三面弹窗播放（内置 VideoPlayer + openPopup）
- 视频生成工具——HappyHorse t2v 异步接入（weifuwu 队列轮询 + 完成通知闭环）

### Fixed

- healthz deps.redis 恒 false——自研 Redis 客户端无 ping 方法面
- CHANGELOG 生成支持无 scope 的 conventional commit（docs: 主提交曾丢失）

### Chore

- WordCloud 完成收尾——gotchas 补 SVG 命中坑/key 纪律 · 计划归档 git 历史
- 删除独立 compose——依赖栈收敛到仓库根 docker-compose.yml

## [0.90.1] - 2026-09-02

### Added

- WordCloud 100 词圆心同心环布局 + tooltip · showcase 一页一组件收敛（135=组件库）
- WordCloud 交互面——onWordClick/键盘可达/动态重排 + SVG 命中区修复
- WordCloud 词云组件——确定性行式装箱 + SVG textLength 定宽（零依赖自绘）
- 视频播放——消息/文件列表/交付物三面弹窗播放（内置 VideoPlayer + openPopup）
- 视频生成工具——HappyHorse t2v 异步接入（weifuwu 队列轮询 + 完成通知闭环）

### Fixed

- healthz deps.redis 恒 false——自研 Redis 客户端无 ping 方法面
- CHANGELOG 生成支持无 scope 的 conventional commit（docs: 主提交曾丢失）

### Chore

- WordCloud 完成收尾——gotchas 补 SVG 命中坑/key 纪律 · 计划归档 git 历史
- 删除独立 compose——依赖栈收敛到仓库根 docker-compose.yml

## [0.90.0] - 2026-09-02

### Added

- 交付物文件卡片体验（DELIVERABLES-UX-PLAN W1/W2）
- Img 支持占位（placeholder）——加载/失败态组件内自理
- BackTop 首用实战修复——scroll 监听机制 + direction/fixed 扩展
- 聊天图片预览改用框架 Img 组件（preview 属性）——排版+点击放大
- 聊天流 AI 生成图片直显——消息内预览（点击放大）
- 新内置工具 generate_image——z-image-turbo 文生图（dashscope 多模态接口）
- 交付物文本内联预览（BUSINESS-SCENARIO W5——G-D）——预览按钮+内容面板（二进制明示下载）；G-E 判负登记（无产物登记机制——runner 改造过大）
- 编排任务链可视（BUSINESS-SCENARIO W3——G-F 死数据面歼灭）——Reports 渲染 runs 列表（状态/编排者/worker 结果/错误摘要）；J4 冒烟升级为渲染契约
- 问卷开箱——/surveys 发起面板 + 角色池一键创建（BUSINESS-SCENARIO W2——G-G）
- 一键演示空间（G-A）+ 配额告警渲染（G-B）——BUSINESS-SCENARIO W1
- 类型单源 + 部门经理详情视图（AGENT-TYPES-OPTIMIZE W3/W4）
- 交付面压缩——build --minify（817KB→455KB）+ /static/app.js gzip（135KB——node:zlib 零依赖）
- 批量批准——审批积压 66 条清账 + 框架 sql.array + 定位器精确化
- CHAT-INTERACTION 波次 2——HITL 快捷确认按钮（P1：AI 确认型提问可点即答）
- 波次 3——403 原因透出 + 按角色落地引导（走查 P0-1）
- 波次 2——写入口角色遮蔽（前端防线与 API 403 双保险·走查 P0-2）
- 增强包——回到底部浮钮/草稿持久化/重试透传（CHAT-UX 波次 4）
- 消息密度——操作行hover化/日期分隔线/绝对时间（CHAT-UX 波次 3）
- 审批待办侧边栏徽章——全局可见性（UX-PLAN-2 波次 4）
- 移动端外壳——抽屉 + 聊天面板入口（UX-PLAN-2 波次 3）+ Button aria-label 透传（核心层）
- 会话列表去噪——单 AI 待命间识别（UX-PLAN-2 波次 2）

### Fixed

- 文件卡片两行式布局（截图复盘——单行硬塞 6 元素拥挤）
- BackTop 容器 attach 空值回退 bug（?? 回退 window 致监听失效）+ chat 浮钮 key
- 刷新后聊天滚动不在底部——hydrate 预览后显式滚底
- 聊天图片预览破图——file 端点二进制默认返回 JSON（无 download=1）
- dev 模式 /static/app.js 禁缓存（no-store）——旧 bundle 假 bug 根治
- 答案缓存排除工具产物型回复（含 /ws/ 路径）——画图类问题第二次命中旧图、工具不跑
- generate_image 自动命名改用 crypto.randomUUID 后缀（8 位）——并发不覆盖
- generate_image 自动命名加随机后缀——同毫秒并发生成不互相覆盖
- register slug 去重上限 20→200——同域名大量注册（e2e.test 测试租户超 20 即 409 实证）
- 组织层级——经理提示词单源化（W1）+ 部门删除孤儿歼灭（W2）
- 走查 P1——部门成员 picker 补人类成员 + 部门页双入口（同事加入不再绕 API）
- CHAT-INTERACTION 波次 1——无效部门显式错误态（P2 走查踩中）
- login SSR 文档缺 app.css——登录后整会话 ap-* 样式失效（角色走查实证）
- pg 池空闲收缩落地 + shutdown 顺序治理——watch 重启连接击穿根治
- 工作空间文件空目录重进永久「加载中」（用户实证）
- 布局与一致性——左栏贴顶/翻页工具条/面板按钮响应式（CHAT-UX 波次 2）
- 聊天正确性四连——呼吸灯卡死/调试log/按钮class/头像?（CHAT-UX 波次 1）
- 状态诚实化——StatusDot 双标签歼灭 + 部门详情沙盒状态加载（UX-PLAN-2 波次 1）
- 段生命周期纪元守卫——cleanup 不误杀同槽位复用新段（nav 链残留根治）

### Docs

- 文档体系收敛——5 文件 + plan/ 计划规范 + 组件批次与审计修复
- DELIVERABLES-UX-PLAN——交付物文件卡片体验优化计划（截图驱动）
- BUSINESS-SCENARIO-PLAN 执行实录（W0-W6 完成/W7 环境受限登记）+ 租户审计豁免登记（demo/survey-setup 新 SQL）——全量门禁绿
- BUSINESS-SCENARIO-PLAN——六业务场景体验/能力缺口补齐计划（探针实证 G-A~G-I）
- AGENT-TYPES-OPTIMIZE-PLAN——执行实录归档（W1-W5 完成/全绿）
- AGENT-TYPES-OPTIMIZE-PLAN——五类型全景优化计划（探针实证 G1-G5）
- OPTIMIZE-PLAN-4——优化计划+执行实录归档（W0-W2 完成/W3 判负）
- CHAT-INTERACTION 波次 3——验收归档（真实 AI 端到端通过）
- CHAT-INTERACTION-PLAN——聊天交互优化计划（走查 P1/P2）
- 波次 4——ROLES-OPTIMIZATION-PLAN 验收归档 + ROLES.md §6 清账
- ROLES-OPTIMIZATION-PLAN——角色体系优化计划（§6 观察落地）
- ROLES.md——角色模型单一事实源（走查+实证沉淀）
- CHAT-UX-PLAN 归档——五波次全交付（波次 5 验收收官）
- CHAT-UX-PLAN——聊天页体验优化计划（产品重心专项）
- UX-PLAN-2 归档——全部收官（波次 6）

### Tests

- 六业务场景旅程冒烟（W0 白盒基线）——缺口重定位实录（G-C 已解决/G-B G-F 死数据面升级/G-G 加重）
- 系统管理员（平台级 ADMIN_EMAILS）旅程固化——正向能力零覆盖补齐
- 角色能力与体验流程固化——三角色旅程 + 矩阵补缺（角色走查沉淀）

## [0.90.0] - 2026-09-02

### Added

- 交付物文件卡片体验（DELIVERABLES-UX-PLAN W1/W2）
- Img 支持占位（placeholder）——加载/失败态组件内自理
- BackTop 首用实战修复——scroll 监听机制 + direction/fixed 扩展
- 聊天图片预览改用框架 Img 组件（preview 属性）——排版+点击放大
- 聊天流 AI 生成图片直显——消息内预览（点击放大）
- 新内置工具 generate_image——z-image-turbo 文生图（dashscope 多模态接口）
- 交付物文本内联预览（BUSINESS-SCENARIO W5——G-D）——预览按钮+内容面板（二进制明示下载）；G-E 判负登记（无产物登记机制——runner 改造过大）
- 编排任务链可视（BUSINESS-SCENARIO W3——G-F 死数据面歼灭）——Reports 渲染 runs 列表（状态/编排者/worker 结果/错误摘要）；J4 冒烟升级为渲染契约
- 问卷开箱——/surveys 发起面板 + 角色池一键创建（BUSINESS-SCENARIO W2——G-G）
- 一键演示空间（G-A）+ 配额告警渲染（G-B）——BUSINESS-SCENARIO W1
- 类型单源 + 部门经理详情视图（AGENT-TYPES-OPTIMIZE W3/W4）
- 交付面压缩——build --minify（817KB→455KB）+ /static/app.js gzip（135KB——node:zlib 零依赖）
- 批量批准——审批积压 66 条清账 + 框架 sql.array + 定位器精确化
- CHAT-INTERACTION 波次 2——HITL 快捷确认按钮（P1：AI 确认型提问可点即答）
- 波次 3——403 原因透出 + 按角色落地引导（走查 P0-1）
- 波次 2——写入口角色遮蔽（前端防线与 API 403 双保险·走查 P0-2）
- 增强包——回到底部浮钮/草稿持久化/重试透传（CHAT-UX 波次 4）
- 消息密度——操作行hover化/日期分隔线/绝对时间（CHAT-UX 波次 3）
- 审批待办侧边栏徽章——全局可见性（UX-PLAN-2 波次 4）
- 移动端外壳——抽屉 + 聊天面板入口（UX-PLAN-2 波次 3）+ Button aria-label 透传（核心层）
- 会话列表去噪——单 AI 待命间识别（UX-PLAN-2 波次 2）

### Fixed

- 文件卡片两行式布局（截图复盘——单行硬塞 6 元素拥挤）
- BackTop 容器 attach 空值回退 bug（?? 回退 window 致监听失效）+ chat 浮钮 key
- 刷新后聊天滚动不在底部——hydrate 预览后显式滚底
- 聊天图片预览破图——file 端点二进制默认返回 JSON（无 download=1）
- dev 模式 /static/app.js 禁缓存（no-store）——旧 bundle 假 bug 根治
- 答案缓存排除工具产物型回复（含 /ws/ 路径）——画图类问题第二次命中旧图、工具不跑
- generate_image 自动命名改用 crypto.randomUUID 后缀（8 位）——并发不覆盖
- generate_image 自动命名加随机后缀——同毫秒并发生成不互相覆盖
- register slug 去重上限 20→200——同域名大量注册（e2e.test 测试租户超 20 即 409 实证）
- 组织层级——经理提示词单源化（W1）+ 部门删除孤儿歼灭（W2）
- 走查 P1——部门成员 picker 补人类成员 + 部门页双入口（同事加入不再绕 API）
- CHAT-INTERACTION 波次 1——无效部门显式错误态（P2 走查踩中）
- login SSR 文档缺 app.css——登录后整会话 ap-* 样式失效（角色走查实证）
- pg 池空闲收缩落地 + shutdown 顺序治理——watch 重启连接击穿根治
- 工作空间文件空目录重进永久「加载中」（用户实证）
- 布局与一致性——左栏贴顶/翻页工具条/面板按钮响应式（CHAT-UX 波次 2）
- 聊天正确性四连——呼吸灯卡死/调试log/按钮class/头像?（CHAT-UX 波次 1）
- 状态诚实化——StatusDot 双标签歼灭 + 部门详情沙盒状态加载（UX-PLAN-2 波次 1）
- 段生命周期纪元守卫——cleanup 不误杀同槽位复用新段（nav 链残留根治）

### Docs

- 文档体系收敛——5 文件 + plan/ 计划规范 + 组件批次与审计修复
- DELIVERABLES-UX-PLAN——交付物文件卡片体验优化计划（截图驱动）
- BUSINESS-SCENARIO-PLAN 执行实录（W0-W6 完成/W7 环境受限登记）+ 租户审计豁免登记（demo/survey-setup 新 SQL）——全量门禁绿
- BUSINESS-SCENARIO-PLAN——六业务场景体验/能力缺口补齐计划（探针实证 G-A~G-I）
- AGENT-TYPES-OPTIMIZE-PLAN——执行实录归档（W1-W5 完成/全绿）
- AGENT-TYPES-OPTIMIZE-PLAN——五类型全景优化计划（探针实证 G1-G5）
- OPTIMIZE-PLAN-4——优化计划+执行实录归档（W0-W2 完成/W3 判负）
- CHAT-INTERACTION 波次 3——验收归档（真实 AI 端到端通过）
- CHAT-INTERACTION-PLAN——聊天交互优化计划（走查 P1/P2）
- 波次 4——ROLES-OPTIMIZATION-PLAN 验收归档 + ROLES.md §6 清账
- ROLES-OPTIMIZATION-PLAN——角色体系优化计划（§6 观察落地）
- ROLES.md——角色模型单一事实源（走查+实证沉淀）
- CHAT-UX-PLAN 归档——五波次全交付（波次 5 验收收官）
- CHAT-UX-PLAN——聊天页体验优化计划（产品重心专项）
- UX-PLAN-2 归档——全部收官（波次 6）

### Tests

- 六业务场景旅程冒烟（W0 白盒基线）——缺口重定位实录（G-C 已解决/G-B G-F 死数据面升级/G-G 加重）
- 系统管理员（平台级 ADMIN_EMAILS）旅程固化——正向能力零覆盖补齐
- 角色能力与体验流程固化——三角色旅程 + 矩阵补缺（角色走查沉淀）

## [0.89.1] - 2026-08-31

## [0.89.0] - 2026-08-31

### Added

- SHARED-TRIE 波次 C+D——性能基线 + API 收紧（四波次收官）
- SHARED-TRIE 波次 B0——pipeline 路由内核（机制公用、实现不一样）
- ROUTER-CORE 波次 C——错误路径语义（自愈不可消音）
- KEYED-COMPONENT-MOVE M3——P 契约升级 + 命令数基线（三波次收官）
- KEYED-COMPONENT-MOVE M2——物理 move 命令生成（fuzz 驱动修复 Post 自映射误报）
- KEYED-COMPONENT-MOVE M1——段输出根枚举（单一实现源）
- VDOM-CORE-EXCELLENCE 波次 F——可观测与回放（六波次收官）
- VDOM-CORE-EXCELLENCE 波次 D——错误路径与恢复语义（自愈不可消音）
- VDOM-CORE-EXCELLENCE 波次 B——缺陷模式哨兵（六红线机制化）
- VDOM-CORE-EXCELLENCE 波次 A——对账防线扩容（捕获+修复 2 内核缺陷）
- CLIENT-EXCELLENCE-PLAN 波次 F——体积与性能基线（六波次收官）
- CLIENT-EXCELLENCE-PLAN 波次 D——SSR 一致性收敛
- CLIENT-EXCELLENCE-PLAN 波次 D/E——API 对齐 + 作者契约沉淀
- CLIENT-EXCELLENCE-PLAN 波次 C——主题渗透
- CLIENT-EXCELLENCE-PLAN 波次 B——A11y 体系化
- CLIENT-EXCELLENCE-PLAN 波次 A——防线补全
- W6 首 token 超时 + 流式窄范围重试——判负撤销（协议码缺口补齐）
- SERVER-PERF-PLAN 三波次交付——流式正确性/生产热路径/传输面（四探针+HTTP基准实证驱动）
- W4 调度来源 tag——sched:request 带 navigate/component-rerender/page-render 归因 + W3 时序源审计判负留档
- 容器核心——HTTP /exec 执行面（常驻 agent 直连）
- Go agent 挂载集成——镜像零改动（动态挂载替代烧入）
- Go agent——sandbox-agent 重写（命令模式/常驻模式双形态）
- S5 统计聚合 + S6 列表搜索——1000 的产出面与管理面
- S2 调度助手——3 工具面 + 问卷调度部门/助手 agent（产品入口）
- S1 调度器——Campaign 批量问卷（总量/并发可配置/水位派单/重试）
- S0 seed 参数化——1000 人设矩阵供给（命名规约/批建）
- UX 波次 1——拖拽上传（文件拖入消息区即入列）
- 通用能力内置——value DOM 脱节修复/auth 韧性/工具会话上下文
- 观测面——泄漏防线 + 性能基线（波次 5）
- 高激源限帧——useObservable throttleMs 声明式（波次 4）
- 数据面流化——derived 派生信号 + asyncErrors$ + 原语信号修复（波次 2）
- 组合算子面补齐——8 算子纯新增（OBSERVABLE-OPTIMIZE 波次 1）
- 渲染健康诊断器——三轴仪表 dev 门控（RENDER-HEALTH 波次 1）
- 中间件值源流视图——store/chat/ws/auth/i18n 同源 Observable（波次 7）
- 场景层切换 v2——116/116 绿（undefined 属性直通/keyed 重建/R1 熔断/popup 聚焦/unmount 清理）
- showcase 切换 v2 实证修复——200/200 绿（Affix/Tour/Popover/FileTree/SSR 吸收/观测体系）
- v2 缺口1/3——uiSsrV2（SSR 完整——v2 引擎 + 两遍/预取/__DATA__）
- v2 缺口8——router 导航完整（链接拦截/popstate/redirect/整树替换）
- v2 缺口6——popup 渲染 v2 化（弹窗独立实例引擎切换）
- v2 缺口5——fuzz 全量（1200 静态 + 300 组件输出——双引擎对账）
- v2 缺口7——事件/ref 字段验证（EventRegistry 协同）
- v2 缺口4——ref 生命周期验证（重绑/移除/卸载对称）
- v2 缺口2——transform 6×6（转换表语义单源——流式适配）
- v2 阶段2D——段级 hooks 面（createUi 接入段——完整性关键缺口）
- v2 阶段2C——对账器流视角（双引擎 Sim 终态裁决——切换护栏）
- v2 destroy$——段级卸载信号（单信号全停——生命周期流化）
- v2 阶段2B——uiServeV2（真实浏览器——切换前提最终验证）
- v2 阶段2A——集成（v2 命令流→HTML——SSR 链路等价）
- v2 阶段1d——调度流（render$ batching——同拍 N→1 + 风暴防护）
- v2 阶段1c——keyed 列表 merge（diffKeyedV2——顺移/插入/删除/交换/循环移位）
- v2 阶段1b——对照流（diffV2——流段复用——「复用失败」根治）
- v2 阶段1——命令流 Observable 化（renderV2——表达层——v1 等价验证）
- 波次4——SSR 预取器（两遍渲染 + 并行预取 + __DATA__ 种子通道）
- useObservable + useAsyncData 原语——hooks 基础设施单点化（波次2）
- 自研 Observable 内核——语义规格先行 + 契约测试锁定（波次1）
- chat 布局——成员与交付物合并到左栏（用户建议——右栏删除）
- @ 菜单键盘导航——↑↓ 选择 / Enter 确认 / Esc 关闭
- 统一镜像全能力——argv CLI 语义 + 能力一致性契约（用户决策）
- sandbox-agent Wave 2——agent liveness 真实化 + 能力声明注入 AI
- sandbox-agent——容器 PID1 常驻入口（stop 10s→0.24s 根治）
- UI 测试基建——共享 server + 快测优化（每文件 spawn → 单实例复用）
- UI 角色测试 Wave 3——权限矩阵跨页固化（9 测试 + 3 安全修复）
- UI 角色测试 Wave 2——管理页交互固化（14 测试 + 3 真 bug 修复）
- Wave 4 框架层并行工具——parallelTools 单 step 多 tool_call 并发（O13-O14）
- Wave 3 可靠性编排——重试降级 + 任务树 + 审计视图（O9/O11/O12）
- Wave 2 意图路由——embedding 语义匹配收敛触发（O7-O8）
- Wave 1 智能编排核心——plan_tasks 并行拆解（O1-O6）
- E1 轮询补偿——WS 长断线 HTTP 兜底 + merge 重渲染 bug 歼灭
- E2 5xx 计数可见性——metrics 错误细分 + Settings 服务健康行
- G2 A2 断线补拉场景测试——+ register 限流可调（429 根因歼灭）
- G3 server.ts 单体瘦身——统计/报表/埋点路由迁出
- G4 审计时间范围筛选（ROADMAP C3）——后端+UI+真库测试
- G1 /api/deliverables 契约测试 9 项——+ 抓出根层大文件漏网
- UI 测试对齐场景层纪律——playwright + uiServe 真实 server
- 清理 + 统一命名 + 契约锁定——223→144 类(开发阶段减法)

### Fixed

- ROUTER-CORE 波次 A——mount 展平修复 + Trie 对账 fuzz（fuzz 驱动修复 3 轮 Trie 缺陷）
- SPA 导航滚动管理——pushState 滚顶 + popstate 恢复离开位置
- 交互完整性收官——基线清零 + SlideCanvas 受控回流缺陷修复
- 基线消化轮 2——CitationCard 语义缺陷修复 + demo 交互实例补全 + L2 固化 7 条（基线 14→3）
- openPopup autoFocus 内核选项——ContextMenu 键盘导航死路修复 + 基线消化 14→8
- 交互完整性计划落地——ImageCropper 拖拽接线 + B 类死代码清零
- useChat 协议解析完整性 + approve 同一性（AiChat 验证暴露——核心层×2）
- NDJSON fixture 断开安全（interval 在 controller closed 后 enqueue → 进程死）+ layout-inventory 豁免登记
- Affix 验证暴露三连根因——style 移除静默 no-op + observe refresh 断链 + 容器坐标系（核心层×2 + 组件层）
- EMAIL-FIX-PLAN 三波次交付——SMTP header 注入/TLS 会话中断及时失败/resend 超时
- GRAPHQL-FIX-PLAN 四波次交付——fragment 深度绕过/执行错误 status/错误面统一/schema 缓存
- AI-FIX-PLAN 五波次交付——并行工具参数聚合/推理断路/done 一致性/abort 全链路/SSE 心跳
- 目录排序固定 en collation（中文名组件殿末——A→Z 稳定）+ showcase-plan 决策记录
- QUEUE-SCHEDULER-FIX-PLAN 五波次交付——并发背压/前缀误删/任务丢失/断连重连/启动韧性
- 组件优化修复两波次——定时器/key 纪律 + aria 回归/XSS 净化
- MESSAGER-FIX-PLAN 五波次交付——越权写/事务断裂/并发重复/排序盲区/WS 鉴权
- USER-SYSTEM-FIX-PLAN 三波次交付——refresh 原子消费/role 恢复 + 时序拉平 + JOIN/密码上限/幂等
- DB-FIX-PLAN 四波次交付——协议服务器致命 bug + 内存引擎语义漂移根治（V1-V11 实证驱动）
- W1.4 Templates 迁移 useAsyncData——段复用下数据永不刷新缺陷根治（缓存保留+刷新按钮）
- W2 401 单飞刷新流化——exhaustMap 替代 G13 快照 hack 堵窗口（并发 401×N 刷新恰 1 次）
- W1 signal 断链修复——ctx.ui.signal 未接线 requestRender（set 后 DOM 不更新）+ 重渲染落地性契约测试（6 测试锁定）
- 混合 keyed 列表 unkeyed 项位置身份接管——每轮重建自持循环歼灭
- tooltip 双重偏移——openPopup 定位后 CSS transform 残留
- 用户视角全页走查——8 缺陷修复（G12/G13/G14 + BUG-1/2/3 + FK + 静默空数据）
- admin 租户表分页——200 行截断→20 行/页（切换卡顿 1152ms→60ms）
- 问卷 campaign 调度四修——历史提交污染根治/严格完成判定/配额槽位回收/SQL 参数
- stats 页 popstate 重读视角 + 重拉视角 state
- 路由导航修复——无路由链接默认完整导航 + popstate 带 query
- 列表页诚实标注——状态提交感知 + 进度 clamp
- 三页面走查修复——answers 归属/hello 时机/视角过滤/时间本地化
- 组件外部化链运行时缺导出 + Table 行收缩不删行
- 问卷统计三修——aggregate 字段/广播全量/clamp
- S7b 实测五修——历史隔离/配额口径/P1-1 豁免/retry 重统计/提交持久化
- 常驻 agent 跨请求 env 残留——超时头未设置时 unset
- 问卷页迁移 v2 面——S7 试点断链根治（S7a）
- S4 批收尾 + 派单清场纪律（campaign 完成即回收沙盒）
- /admin 页无 key 组件实槽翻转警告——顶层组件项声明 key
- 技能工具 _toolDepartmentId 未注入——「无部门上下文」根因修复
- 刷新后 401 refresh 链未接线——跳登录根因修复
- 聊天页三 bug 修复（输入残留/流式不滚动/工具型回复消失）
- 弹窗 position 定位三连修——ContextMenu 左上角根因歼灭
- 洞→组件转换挂载分离——组件输出 null 锚挂槽位父（tour 违例）
- /admin 卡住——1292 租户全量渲染（2.4s 同步阻塞）
- 交付物渲染循环根治——数据未变静默（流式慢/闪烁总根源）
- 交付物首帧零延迟——聚合 API 数据直供 FilesSection
- FilesSection 入驻左栏后不渲染——mounting 期 rerender 违例根因
- chat 输入框打字卡顿——每键双全页 rerender 根治
- /deliverables「打开」= 下载（曾打开 JSON 响应——体验缺陷）
- 下载直链安全升级——短时绑定 ticket（30s + path 绑定——替换 access token 拼 URL）
- 工作区下载/打开直链方案——blob 不可靠根治（用户实证二次故障）
- sandbox 测试优化 + docker stop 10s→2s（生产回收提速 5 倍）
- auth 中间件并发竞态——currentUser 模块级共享——有效 token 偶发 401
- mounting 期间重复引用等待而非违例——/deliverables 空态根因链修复
- AI 体验 Wave 3——AI 回复前缀规范 + 缓存标注用户友好（P2 打磨）
- AI 体验 Wave 2——KB 检索单实现源 + 向量质量防线 + 随机向量污染修复
- AI 体验 Wave 1——工具失败可观 + 缓存毒化修复（P0 三项）
- search-knowledge-base skill 旧列残留——tenant_id→app_id（知识库检索报错根治）
- ref=组件 id 前缀回退——chat avatar 错位根治（确定性对称补丁）
- 全局限流默认调大——429 误伤歼灭（100→2000/分钟）
- layout tokens 层不包 @layer——PostCSS Unexpected }——style.css 500 根因歼灭
- ws 心跳看门狗——网络硬断静默挂起根因歼灭（A2 补拉前提）
- 新 UI 测试连抓 2 真实 bug——Register SSR 崩溃 + AgentDetail 错误态误报
- api client 非 2xx 保留服务端 {error} 体——错误面不瞎
- read_csv 工作目录解析——appId → departmentId（工具流程优化）
- 聊天流式缺失——wsClient 从未 connect（真实 bug）

### Docs

- CLIENT-EXCELLENCE-PLAN——client 第三阶段全面优化计划
- 组件库交互完整性优化计划——死交互实证驱动
- onOpen 注释对齐实现（无 href a + role=button——批次 3 实证）
- COMPONENT-VERIFICATION-CHECKLIST——组件全功能验证清单计划
- W2 完成记录——单飞刷新 + token$ 判负留档
- W1 完成记录——signal 断链修复 + 走查疑点定审（mockHits=0 = 段复用）
- VDOM-STREAM-FIX-PLAN——走查实证缺陷修复 × Observable 优势深化（四类判别总纲）
- VDOM 性能升级计划归档完成——✅ 状态/提交/验收/判负记录
- survey-guide 按钮漂移修正——派单入口统一为问卷调研 @全员 / launch API
- 问卷方案 v3 定稿——规模 100/并发 10（1000 与 20 判负）
- 问卷机器人方案 v2——试点实测校准（45s 真速推翻预估）
- 问卷机器人场景完整方案终稿——聊天触发产品形态 + 调度器架构
- Campaign 架构设计专篇——批量问卷运行器三c 补插（首次提交文档内容不完整——修正）
- Campaign 架构设计——总量/并发可配置的批量问卷运行器（第一个客户）
- 1000 规模化专篇——sandbox 管理审计问题清单 + A 档修订波次
- 10 机器人填问卷场景满足计划——双档方案（AI 真填已有 + 协议模拟新增）
- UX 计划全部完成——波次 2/3/4 判负记录 + 波次 6 验收锚点
- UX 计划波次 1 完成标记 + 流式光标判负记录
- UX 优化计划——6 波次（拖拽上传/流式光标/配置分区/模板预填/onboarding/模块化）
- 波次 7——COMPONENT-ROBUSTNESS 归档（7/7 波次完成标记）
- COMPONENT-ROBUSTNESS-PLAN——组件测试补全与健壮性增强（7 波次）
- OPTIMIZE 归档补全——波次 6 表格勾选 + 头部完成标记（与实际交付对齐）
- OBSERVABLE-OPTIMIZE 收尾——audit 三检查 + 优势兑现总表（波次 6）
- 计划归档——VDOM-OBSERVABLE-COMPLETE + RENDER-HEALTH-PLAN 归档到 plan/archive/
- 渲染健康章节 + 波次 4/5 定论（RENDER-HEALTH-PLAN 完成）
- Observable 化收尾——audit 三检查 + 流化维度总表（波次 8/9）
- 波次6验收——组件作者契约章节 + OBSERVABLE-ARCH 完成标记
- SANDBOX-AGENT-PLAN 定稿——4 波全完成（entrypoint 可控化 + 统一镜像）
- SANDBOX-TEST-PLAN 定稿——47.6s→23.7s（-50%）
- UI-ROLE-TEST-PLAN 定稿——4 波全完成（11 bug 修复固化）
- AI-EXPERIENCE-PLAN 定稿——3 波全完成（Wave 1-3 成果归档）
- Agent 智能编排升级计划（第二代）——Planner-Worker + 动态路由
- OPTIMIZE-PLAN-3 完结标注——G1-G5 全交付 / G6 核查降级
- OPTIMIZE-PLAN-3 更新——G1-G4+G7 完成态标注（G5/G6 剩余）
- OPTIMIZE-PLAN-3 第三波计划——测试纪律对齐（189/189）+ 剩余缺口

### Tests

- SHARED-TRIE 波次 A——测试归属归位 + 死代码清理（守护位归位）
- ROUTER-CORE 波次 D——性能基线登记（防回归）
- ROUTER-CORE 波次 B——meta 检查全分支 + 405/HEAD/all 语义锁定
- VDOM-CORE-EXCELLENCE 波次 C——hooks 契约补全
- fake DOM 补齐导航面（scrollTo/reload/history.state）——滚动管理契约环境
- 交互完整性波次 2+4 落地——L2 哨兵 + A 类文档腐化清零
- 验证清单批次 13 完成（132/132 收官）——ToolCallCard→Wave 十二组件固化
- 验证清单批次 12 完成（120/132）——TabBar→ToggleGroup 十组件增量固化
- 验证清单批次 11 完成（110/132）——SheetGrid→Switch 十组件增量固化
- 验证清单批次 10 完成（100/132）——Rate→SessionList 十组件增量固化
- 验证清单批次 9 完成（90/132）——Pagination→RadioGroup 十组件固化
- 验证清单批次 8 完成（80/132）——MarkdownEditor→PageHeader 十组件固化
- 验证清单批次 7 完成（70/132）——JSONViewer→Markdown 十组件固化
- 验证清单批次 6 完成（60/132）——Grid→InputNumber 十组件固化
- 验证清单批次 5 完成（50/132）——Dropdown→Form 十组件固化
- 验证清单批次 4 完成（40/132）——ColorPicker→Drawer 十组件固化
- 验证清单批次 3 完成（30/132）——Carousel→Collapse 十组件固化
- 验证清单批次 2 完成（20/132）——AuthPage→Card 十组件固化
- 验证清单批次 1 完成（10/132）——AppShell 4 + ApprovalCard 4 + AspectRatio 3 固化
- 验证清单执行——Alert 2 + AlertGroup 2 + Anchor 3 固化
- 验证清单执行——Accordion 7/7 + ActionSheet 7/7 固化（含 roving focus 组件层修复）
- W1 走查疑点定审——popstate/query/同URL 三形态 handler 重跑 + 段复用工厂不重跑（mockHits=0 根因锁定）
- 消费端性能防线契约（e2e-perf）——6000 行卸载 <2s 防 O(N²) 回归
- AI 工具覆盖审计补全（get_current_time/http_get/workspace handler 缺口清零）
- 波次 6——冒烟全量描述对齐（审计定论——不造代码）
- 波次 5——边界契约（键盘 a11y + 必填校验拦截）
- 波次 4——portal 零残留断言抽样（卸载清理语义）
- 波次 3——弹窗组合矩阵（position/mask×语义坐标断言）
- 波次 2——8 组件零覆盖缺口清零（审计红转绿）
- 覆盖审计哨兵——组件×三层矩阵（波次 1）
- diff 复用防线——七形态零复现定论（RENDER-HEALTH 波次 2）
- 组件输出组件（嵌套 async）缺陷登记警示测试——生成端父缺失锁定

## [0.89.0] - 2026-08-31

### Added

- SHARED-TRIE 波次 C+D——性能基线 + API 收紧（四波次收官）
- SHARED-TRIE 波次 B0——pipeline 路由内核（机制公用、实现不一样）
- ROUTER-CORE 波次 C——错误路径语义（自愈不可消音）
- KEYED-COMPONENT-MOVE M3——P 契约升级 + 命令数基线（三波次收官）
- KEYED-COMPONENT-MOVE M2——物理 move 命令生成（fuzz 驱动修复 Post 自映射误报）
- KEYED-COMPONENT-MOVE M1——段输出根枚举（单一实现源）
- VDOM-CORE-EXCELLENCE 波次 F——可观测与回放（六波次收官）
- VDOM-CORE-EXCELLENCE 波次 D——错误路径与恢复语义（自愈不可消音）
- VDOM-CORE-EXCELLENCE 波次 B——缺陷模式哨兵（六红线机制化）
- VDOM-CORE-EXCELLENCE 波次 A——对账防线扩容（捕获+修复 2 内核缺陷）
- CLIENT-EXCELLENCE-PLAN 波次 F——体积与性能基线（六波次收官）
- CLIENT-EXCELLENCE-PLAN 波次 D——SSR 一致性收敛
- CLIENT-EXCELLENCE-PLAN 波次 D/E——API 对齐 + 作者契约沉淀
- CLIENT-EXCELLENCE-PLAN 波次 C——主题渗透
- CLIENT-EXCELLENCE-PLAN 波次 B——A11y 体系化
- CLIENT-EXCELLENCE-PLAN 波次 A——防线补全
- W6 首 token 超时 + 流式窄范围重试——判负撤销（协议码缺口补齐）
- SERVER-PERF-PLAN 三波次交付——流式正确性/生产热路径/传输面（四探针+HTTP基准实证驱动）
- W4 调度来源 tag——sched:request 带 navigate/component-rerender/page-render 归因 + W3 时序源审计判负留档
- 容器核心——HTTP /exec 执行面（常驻 agent 直连）
- Go agent 挂载集成——镜像零改动（动态挂载替代烧入）
- Go agent——sandbox-agent 重写（命令模式/常驻模式双形态）
- S5 统计聚合 + S6 列表搜索——1000 的产出面与管理面
- S2 调度助手——3 工具面 + 问卷调度部门/助手 agent（产品入口）
- S1 调度器——Campaign 批量问卷（总量/并发可配置/水位派单/重试）
- S0 seed 参数化——1000 人设矩阵供给（命名规约/批建）
- UX 波次 1——拖拽上传（文件拖入消息区即入列）
- 通用能力内置——value DOM 脱节修复/auth 韧性/工具会话上下文
- 观测面——泄漏防线 + 性能基线（波次 5）
- 高激源限帧——useObservable throttleMs 声明式（波次 4）
- 数据面流化——derived 派生信号 + asyncErrors$ + 原语信号修复（波次 2）
- 组合算子面补齐——8 算子纯新增（OBSERVABLE-OPTIMIZE 波次 1）
- 渲染健康诊断器——三轴仪表 dev 门控（RENDER-HEALTH 波次 1）
- 中间件值源流视图——store/chat/ws/auth/i18n 同源 Observable（波次 7）
- 场景层切换 v2——116/116 绿（undefined 属性直通/keyed 重建/R1 熔断/popup 聚焦/unmount 清理）
- showcase 切换 v2 实证修复——200/200 绿（Affix/Tour/Popover/FileTree/SSR 吸收/观测体系）
- v2 缺口1/3——uiSsrV2（SSR 完整——v2 引擎 + 两遍/预取/__DATA__）
- v2 缺口8——router 导航完整（链接拦截/popstate/redirect/整树替换）
- v2 缺口6——popup 渲染 v2 化（弹窗独立实例引擎切换）
- v2 缺口5——fuzz 全量（1200 静态 + 300 组件输出——双引擎对账）
- v2 缺口7——事件/ref 字段验证（EventRegistry 协同）
- v2 缺口4——ref 生命周期验证（重绑/移除/卸载对称）
- v2 缺口2——transform 6×6（转换表语义单源——流式适配）
- v2 阶段2D——段级 hooks 面（createUi 接入段——完整性关键缺口）
- v2 阶段2C——对账器流视角（双引擎 Sim 终态裁决——切换护栏）
- v2 destroy$——段级卸载信号（单信号全停——生命周期流化）
- v2 阶段2B——uiServeV2（真实浏览器——切换前提最终验证）
- v2 阶段2A——集成（v2 命令流→HTML——SSR 链路等价）
- v2 阶段1d——调度流（render$ batching——同拍 N→1 + 风暴防护）
- v2 阶段1c——keyed 列表 merge（diffKeyedV2——顺移/插入/删除/交换/循环移位）
- v2 阶段1b——对照流（diffV2——流段复用——「复用失败」根治）
- v2 阶段1——命令流 Observable 化（renderV2——表达层——v1 等价验证）
- 波次4——SSR 预取器（两遍渲染 + 并行预取 + __DATA__ 种子通道）
- useObservable + useAsyncData 原语——hooks 基础设施单点化（波次2）
- 自研 Observable 内核——语义规格先行 + 契约测试锁定（波次1）
- chat 布局——成员与交付物合并到左栏（用户建议——右栏删除）
- @ 菜单键盘导航——↑↓ 选择 / Enter 确认 / Esc 关闭
- 统一镜像全能力——argv CLI 语义 + 能力一致性契约（用户决策）
- sandbox-agent Wave 2——agent liveness 真实化 + 能力声明注入 AI
- sandbox-agent——容器 PID1 常驻入口（stop 10s→0.24s 根治）
- UI 测试基建——共享 server + 快测优化（每文件 spawn → 单实例复用）
- UI 角色测试 Wave 3——权限矩阵跨页固化（9 测试 + 3 安全修复）
- UI 角色测试 Wave 2——管理页交互固化（14 测试 + 3 真 bug 修复）
- Wave 4 框架层并行工具——parallelTools 单 step 多 tool_call 并发（O13-O14）
- Wave 3 可靠性编排——重试降级 + 任务树 + 审计视图（O9/O11/O12）
- Wave 2 意图路由——embedding 语义匹配收敛触发（O7-O8）
- Wave 1 智能编排核心——plan_tasks 并行拆解（O1-O6）
- E1 轮询补偿——WS 长断线 HTTP 兜底 + merge 重渲染 bug 歼灭
- E2 5xx 计数可见性——metrics 错误细分 + Settings 服务健康行
- G2 A2 断线补拉场景测试——+ register 限流可调（429 根因歼灭）
- G3 server.ts 单体瘦身——统计/报表/埋点路由迁出
- G4 审计时间范围筛选（ROADMAP C3）——后端+UI+真库测试
- G1 /api/deliverables 契约测试 9 项——+ 抓出根层大文件漏网
- UI 测试对齐场景层纪律——playwright + uiServe 真实 server
- 清理 + 统一命名 + 契约锁定——223→144 类(开发阶段减法)

### Fixed

- ROUTER-CORE 波次 A——mount 展平修复 + Trie 对账 fuzz（fuzz 驱动修复 3 轮 Trie 缺陷）
- SPA 导航滚动管理——pushState 滚顶 + popstate 恢复离开位置
- 交互完整性收官——基线清零 + SlideCanvas 受控回流缺陷修复
- 基线消化轮 2——CitationCard 语义缺陷修复 + demo 交互实例补全 + L2 固化 7 条（基线 14→3）
- openPopup autoFocus 内核选项——ContextMenu 键盘导航死路修复 + 基线消化 14→8
- 交互完整性计划落地——ImageCropper 拖拽接线 + B 类死代码清零
- useChat 协议解析完整性 + approve 同一性（AiChat 验证暴露——核心层×2）
- NDJSON fixture 断开安全（interval 在 controller closed 后 enqueue → 进程死）+ layout-inventory 豁免登记
- Affix 验证暴露三连根因——style 移除静默 no-op + observe refresh 断链 + 容器坐标系（核心层×2 + 组件层）
- EMAIL-FIX-PLAN 三波次交付——SMTP header 注入/TLS 会话中断及时失败/resend 超时
- GRAPHQL-FIX-PLAN 四波次交付——fragment 深度绕过/执行错误 status/错误面统一/schema 缓存
- AI-FIX-PLAN 五波次交付——并行工具参数聚合/推理断路/done 一致性/abort 全链路/SSE 心跳
- 目录排序固定 en collation（中文名组件殿末——A→Z 稳定）+ showcase-plan 决策记录
- QUEUE-SCHEDULER-FIX-PLAN 五波次交付——并发背压/前缀误删/任务丢失/断连重连/启动韧性
- 组件优化修复两波次——定时器/key 纪律 + aria 回归/XSS 净化
- MESSAGER-FIX-PLAN 五波次交付——越权写/事务断裂/并发重复/排序盲区/WS 鉴权
- USER-SYSTEM-FIX-PLAN 三波次交付——refresh 原子消费/role 恢复 + 时序拉平 + JOIN/密码上限/幂等
- DB-FIX-PLAN 四波次交付——协议服务器致命 bug + 内存引擎语义漂移根治（V1-V11 实证驱动）
- W1.4 Templates 迁移 useAsyncData——段复用下数据永不刷新缺陷根治（缓存保留+刷新按钮）
- W2 401 单飞刷新流化——exhaustMap 替代 G13 快照 hack 堵窗口（并发 401×N 刷新恰 1 次）
- W1 signal 断链修复——ctx.ui.signal 未接线 requestRender（set 后 DOM 不更新）+ 重渲染落地性契约测试（6 测试锁定）
- 混合 keyed 列表 unkeyed 项位置身份接管——每轮重建自持循环歼灭
- tooltip 双重偏移——openPopup 定位后 CSS transform 残留
- 用户视角全页走查——8 缺陷修复（G12/G13/G14 + BUG-1/2/3 + FK + 静默空数据）
- admin 租户表分页——200 行截断→20 行/页（切换卡顿 1152ms→60ms）
- 问卷 campaign 调度四修——历史提交污染根治/严格完成判定/配额槽位回收/SQL 参数
- stats 页 popstate 重读视角 + 重拉视角 state
- 路由导航修复——无路由链接默认完整导航 + popstate 带 query
- 列表页诚实标注——状态提交感知 + 进度 clamp
- 三页面走查修复——answers 归属/hello 时机/视角过滤/时间本地化
- 组件外部化链运行时缺导出 + Table 行收缩不删行
- 问卷统计三修——aggregate 字段/广播全量/clamp
- S7b 实测五修——历史隔离/配额口径/P1-1 豁免/retry 重统计/提交持久化
- 常驻 agent 跨请求 env 残留——超时头未设置时 unset
- 问卷页迁移 v2 面——S7 试点断链根治（S7a）
- S4 批收尾 + 派单清场纪律（campaign 完成即回收沙盒）
- /admin 页无 key 组件实槽翻转警告——顶层组件项声明 key
- 技能工具 _toolDepartmentId 未注入——「无部门上下文」根因修复
- 刷新后 401 refresh 链未接线——跳登录根因修复
- 聊天页三 bug 修复（输入残留/流式不滚动/工具型回复消失）
- 弹窗 position 定位三连修——ContextMenu 左上角根因歼灭
- 洞→组件转换挂载分离——组件输出 null 锚挂槽位父（tour 违例）
- /admin 卡住——1292 租户全量渲染（2.4s 同步阻塞）
- 交付物渲染循环根治——数据未变静默（流式慢/闪烁总根源）
- 交付物首帧零延迟——聚合 API 数据直供 FilesSection
- FilesSection 入驻左栏后不渲染——mounting 期 rerender 违例根因
- chat 输入框打字卡顿——每键双全页 rerender 根治
- /deliverables「打开」= 下载（曾打开 JSON 响应——体验缺陷）
- 下载直链安全升级——短时绑定 ticket（30s + path 绑定——替换 access token 拼 URL）
- 工作区下载/打开直链方案——blob 不可靠根治（用户实证二次故障）
- sandbox 测试优化 + docker stop 10s→2s（生产回收提速 5 倍）
- auth 中间件并发竞态——currentUser 模块级共享——有效 token 偶发 401
- mounting 期间重复引用等待而非违例——/deliverables 空态根因链修复
- AI 体验 Wave 3——AI 回复前缀规范 + 缓存标注用户友好（P2 打磨）
- AI 体验 Wave 2——KB 检索单实现源 + 向量质量防线 + 随机向量污染修复
- AI 体验 Wave 1——工具失败可观 + 缓存毒化修复（P0 三项）
- search-knowledge-base skill 旧列残留——tenant_id→app_id（知识库检索报错根治）
- ref=组件 id 前缀回退——chat avatar 错位根治（确定性对称补丁）
- 全局限流默认调大——429 误伤歼灭（100→2000/分钟）
- layout tokens 层不包 @layer——PostCSS Unexpected }——style.css 500 根因歼灭
- ws 心跳看门狗——网络硬断静默挂起根因歼灭（A2 补拉前提）
- 新 UI 测试连抓 2 真实 bug——Register SSR 崩溃 + AgentDetail 错误态误报
- api client 非 2xx 保留服务端 {error} 体——错误面不瞎
- read_csv 工作目录解析——appId → departmentId（工具流程优化）
- 聊天流式缺失——wsClient 从未 connect（真实 bug）

### Docs

- CLIENT-EXCELLENCE-PLAN——client 第三阶段全面优化计划
- 组件库交互完整性优化计划——死交互实证驱动
- onOpen 注释对齐实现（无 href a + role=button——批次 3 实证）
- COMPONENT-VERIFICATION-CHECKLIST——组件全功能验证清单计划
- W2 完成记录——单飞刷新 + token$ 判负留档
- W1 完成记录——signal 断链修复 + 走查疑点定审（mockHits=0 = 段复用）
- VDOM-STREAM-FIX-PLAN——走查实证缺陷修复 × Observable 优势深化（四类判别总纲）
- VDOM 性能升级计划归档完成——✅ 状态/提交/验收/判负记录
- survey-guide 按钮漂移修正——派单入口统一为问卷调研 @全员 / launch API
- 问卷方案 v3 定稿——规模 100/并发 10（1000 与 20 判负）
- 问卷机器人方案 v2——试点实测校准（45s 真速推翻预估）
- 问卷机器人场景完整方案终稿——聊天触发产品形态 + 调度器架构
- Campaign 架构设计专篇——批量问卷运行器三c 补插（首次提交文档内容不完整——修正）
- Campaign 架构设计——总量/并发可配置的批量问卷运行器（第一个客户）
- 1000 规模化专篇——sandbox 管理审计问题清单 + A 档修订波次
- 10 机器人填问卷场景满足计划——双档方案（AI 真填已有 + 协议模拟新增）
- UX 计划全部完成——波次 2/3/4 判负记录 + 波次 6 验收锚点
- UX 计划波次 1 完成标记 + 流式光标判负记录
- UX 优化计划——6 波次（拖拽上传/流式光标/配置分区/模板预填/onboarding/模块化）
- 波次 7——COMPONENT-ROBUSTNESS 归档（7/7 波次完成标记）
- COMPONENT-ROBUSTNESS-PLAN——组件测试补全与健壮性增强（7 波次）
- OPTIMIZE 归档补全——波次 6 表格勾选 + 头部完成标记（与实际交付对齐）
- OBSERVABLE-OPTIMIZE 收尾——audit 三检查 + 优势兑现总表（波次 6）
- 计划归档——VDOM-OBSERVABLE-COMPLETE + RENDER-HEALTH-PLAN 归档到 plan/archive/
- 渲染健康章节 + 波次 4/5 定论（RENDER-HEALTH-PLAN 完成）
- Observable 化收尾——audit 三检查 + 流化维度总表（波次 8/9）
- 波次6验收——组件作者契约章节 + OBSERVABLE-ARCH 完成标记
- SANDBOX-AGENT-PLAN 定稿——4 波全完成（entrypoint 可控化 + 统一镜像）
- SANDBOX-TEST-PLAN 定稿——47.6s→23.7s（-50%）
- UI-ROLE-TEST-PLAN 定稿——4 波全完成（11 bug 修复固化）
- AI-EXPERIENCE-PLAN 定稿——3 波全完成（Wave 1-3 成果归档）
- Agent 智能编排升级计划（第二代）——Planner-Worker + 动态路由
- OPTIMIZE-PLAN-3 完结标注——G1-G5 全交付 / G6 核查降级
- OPTIMIZE-PLAN-3 更新——G1-G4+G7 完成态标注（G5/G6 剩余）
- OPTIMIZE-PLAN-3 第三波计划——测试纪律对齐（189/189）+ 剩余缺口

### Tests

- SHARED-TRIE 波次 A——测试归属归位 + 死代码清理（守护位归位）
- ROUTER-CORE 波次 D——性能基线登记（防回归）
- ROUTER-CORE 波次 B——meta 检查全分支 + 405/HEAD/all 语义锁定
- VDOM-CORE-EXCELLENCE 波次 C——hooks 契约补全
- fake DOM 补齐导航面（scrollTo/reload/history.state）——滚动管理契约环境
- 交互完整性波次 2+4 落地——L2 哨兵 + A 类文档腐化清零
- 验证清单批次 13 完成（132/132 收官）——ToolCallCard→Wave 十二组件固化
- 验证清单批次 12 完成（120/132）——TabBar→ToggleGroup 十组件增量固化
- 验证清单批次 11 完成（110/132）——SheetGrid→Switch 十组件增量固化
- 验证清单批次 10 完成（100/132）——Rate→SessionList 十组件增量固化
- 验证清单批次 9 完成（90/132）——Pagination→RadioGroup 十组件固化
- 验证清单批次 8 完成（80/132）——MarkdownEditor→PageHeader 十组件固化
- 验证清单批次 7 完成（70/132）——JSONViewer→Markdown 十组件固化
- 验证清单批次 6 完成（60/132）——Grid→InputNumber 十组件固化
- 验证清单批次 5 完成（50/132）——Dropdown→Form 十组件固化
- 验证清单批次 4 完成（40/132）——ColorPicker→Drawer 十组件固化
- 验证清单批次 3 完成（30/132）——Carousel→Collapse 十组件固化
- 验证清单批次 2 完成（20/132）——AuthPage→Card 十组件固化
- 验证清单批次 1 完成（10/132）——AppShell 4 + ApprovalCard 4 + AspectRatio 3 固化
- 验证清单执行——Alert 2 + AlertGroup 2 + Anchor 3 固化
- 验证清单执行——Accordion 7/7 + ActionSheet 7/7 固化（含 roving focus 组件层修复）
- W1 走查疑点定审——popstate/query/同URL 三形态 handler 重跑 + 段复用工厂不重跑（mockHits=0 根因锁定）
- 消费端性能防线契约（e2e-perf）——6000 行卸载 <2s 防 O(N²) 回归
- AI 工具覆盖审计补全（get_current_time/http_get/workspace handler 缺口清零）
- 波次 6——冒烟全量描述对齐（审计定论——不造代码）
- 波次 5——边界契约（键盘 a11y + 必填校验拦截）
- 波次 4——portal 零残留断言抽样（卸载清理语义）
- 波次 3——弹窗组合矩阵（position/mask×语义坐标断言）
- 波次 2——8 组件零覆盖缺口清零（审计红转绿）
- 覆盖审计哨兵——组件×三层矩阵（波次 1）
- diff 复用防线——七形态零复现定论（RENDER-HEALTH 波次 2）
- 组件输出组件（嵌套 async）缺陷登记警示测试——生成端父缺失锁定

## [0.88.0] - 2026-08-27

### Added

- E 可靠性收尾 + C1 隔离豁免登记
- Phase C/D——容量视图 + 部署交付链修复
- B1/B2 交付物闭环——中心页 + Dashboard 卡片
- A1 首屏 SSR——登录/注册服务端渲染（零 JS 即表单）
- ws 自动重连 + onStatusChange 状态订阅（A2 断线补拉地基）
- 404 友好化 + 未引用文件清理（三域简化收尾）
- 首页精简——删除「🎯 我要做什么」与「⚡ 快速开始」区块

### Fixed

- 跨渲染组件换型 root 清空——全量分支先清后建（白屏根治）
- 未登录访问白屏——认证守卫硬跳转（SSR 登录页）
- jsx 显式 key 参数漏归一化——数字 key 渲染中断（P3 冒烟抓到）
- P2 类型清零 75→0 + 核心层 route/reload 面补全
- build script 断链修复——ui/main.tsx → ui/v3-main.tsx（P1）
- P0 红测试清零——180/180 全绿（F2-F4）
- token 降频提前 return——AI 回复持久化截断（P0-F1）
- demo 舞台 --wf-gap:0 变量污染——按钮挤在一起

### Docs

- 产品路线 ROADMAP——基于定位的第二波优化计划
- OPTIMIZE-PLAN-2 完成态标注——180/180 + tsc 0

### Chore

- 根目录计划文档归档——docs/archive/（P4）

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
- 覆盖度标准建立—— + 不变量 helper
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
