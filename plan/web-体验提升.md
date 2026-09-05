# Web 体验提升（2027-xx）

> 一句话目标：**前端页面动线现代化**——ctx 类型面收口（198 处非空断言
> 消亡）+ 页面 hooks 世代迁移（22 页面 `$ + render` → useAsyncData 世代）+
> 页面骨架原语（内联样板收口）+ 渲染健康（memo 普及）。
> 动机（消费证据）：agent-platform 16 页面实证——**22 个页面仍是
> `$ + ctx.render()` 世代**（factory 期异步启动在 v2 段复用下数据不刷新——
> Templates.tsx 迁移注释实录），hooks 世代仅 1 页；ctx 注入面全是
> `ctx.api!/ctx.toast!` 非空断言（198 处——类型面可选性）——前端体验的
> 下一步价值洼地已锚定（体验分析：最疼的是「让页面全部演进到 hooks 世代」）。

## 现状探针（2027-xx 读数）

| 面 | 现状 | 目标 |
| --- | --- | --- |
| `$ + ctx.render()` 老世代页面 | **22 个**（16 页面文件——多导出） | → useAsyncData 世代迁移（数据面先行） |
| `useAsyncData` 使用 | **1 个**（Templates——范本已就位） | → 用户数据面页面全量 |
| `ctx.api!`/`ctx.toast!`/`ctx.confirm!` 非空断言 | **198 处** | → 0（ctx 注入类型精确化） |
| `signal`/`useObservable` | **0 处**（框架能力存在未消费） | → 试点（局部状态原语——判负候选） |
| 平台自有组件（ui/components） | **5 个**（页面大量内联 UI 片段） | → 骨架原语提取（列表页/表单页——复用框架 134） |
| `memo`（shouldRender） | **0 处**（高频输入页全树重建） | → 试点 + 指南（CodeEditor 先例） |
| 页面级 URL 参数手写 | 2 处（轻——不立项） | → 现有形态 |

框架面已验证（docs/client.md §5）：useAsyncData 语义完整（并发合并/竞态取消/
缓存保留/显式 reload——Templates 迁移注释是全套先例）；memo opt-in
（render.shouldRender——返回 false 跳过本拍渲染——CodeEditor 高频输入先例）。

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W0 | **ctx 类型面收口**（框架）：uiServe ctx 注入字段类型精确化（api/toast/confirm/app——非空即非可选——平台 198 断言 → 0 前提）+ **IDE 可读性**（hover 类型名简洁——`ApiClient.get<T>(url): Promise<T>` 而非嵌套 20 层展开——tsd 断言）；契约层 tsd（ctx 面无 `!` 可用） | 契约 2（tsd：ctx.api 直用·无 !·hover 类型名简洁）+ 平台 tsc 0 + 198 计数下降 |
| W1 | **页面 hooks 世代迁移**（平台数据面）：用户数据页面按 Templates 范本迁移（Agents/Departments/Dashboard 等 top 热力页）——每页：useAsyncData（fetcher+key）+ 竞态取消注释——迁移断言（无 factory 期异步启动）；**配套迁移手册（docs——面向开发者 3 段式：为什么迁（v2 段复用下工厂期异步启动数据不刷新实录）/怎么迁（5 行范本）/迁移后得到什么（并发合并/竞态取消/缓存保留）** | 页面迁移 diff（`ctx.render()` 数据面调用 → useAsyncData）+ **audit 哨兵**（factory 期 async 启动 = 红——机制化防回流）· 手册增补（docs/client.md §7） |
| W2 | **页面骨架原语**：平台列表页/表单页内联样板提取（PageHeader+Loading+EmptyState 组合；表单页 confirm/toast 模式）——复用框架组件（判负：单消费者面不提取） | 平台组件库 5→N + 页面样板行数下降（diff 断言） |
| W3 | **渲染健康试点**：高频输入页 memo 普及（search 页/聊天输入——CodeEditor 先例对照）+ 指南（docs/client.md §5.1 示例完备化） | 试点页 diff（shouldRender 挂载）+ 指南增补 |
| W4 | **docs + 回归门**：docs/client.md §7 前端动线增补（hooks 世代页面模板——useAsyncData 首选手册）+ 全量回归门 | showcase+场景 全绿 · audit 七线 · tsc 三 0 · 平台 475 |

## 判负记录（可被新论证推翻）

- **signal/useObservable 全量引入**：不做——平台页面状态多是无界对象
  （`$` 局部——非共享）——signal 收益场景（跨组件共享/细粒度依赖）未出现
  实例；推翻：出现跨组件共享状态的页面（如全局筛选/全局选中）
- **页面骨架原语全提取**：不做——判别标准「>1 消费者入库」；单消费者
  （如 Agents 独有的卡片组）留在页面内；推翻：第三消费者出现
- **22 页面全量迁移**：不做——按热力迁移（数据面先行——需求驱动）；
  推翻：audit 哨兵抓出新工厂期异步 bug
- **前端请求日志面**（dev 模式 request 面板）：不做——dev 仪表已有
  render-health 四轴（错误计数/渲染健康）——请求面板热门但面重（拦截
  fetch 全量）——推翻：出现「页面行为依赖请求时序」的疑难实例
- **响应式状态全量化（signal 普及）**：不做（上文判负——无跨组件共享
  实例）；推翻：全局筛选/全局选中页面出现

## 执行实录（边做边记）

- W0（bf456664）：ctx 注入面类型收口（UiServeOptions 类型化 · CommandsInjected
  组合 · 平台 201 断言清零 198→0）
- W1（987f629c）：页面世代迁移（Agents/Departments——getter 快照 bug 实证）·
  audit 哨兵（async 工厂红·老世代黄）· 手册 §7.1
- W2（f1a18ca6）：ListScaffold 骨架原语（-23 行样板——Agents/Departments）
- W3（4468ee9c）：memo 试点（AgentGrid——静态邻居零 diff）+ 指南 §5.1
- W4（本提交）：全量回归门——contract 433 · scenario 123 · showcase 328 ·
  server 856/857 · 平台 475 · audit:all 八线（135 页/227 点击零问题 +
  audit:docs 66/66）· tsc 三 0 · audit-orm 双范围 0

## 验收标准

- [ ] W0：ctx 类型面收口（断言 198→0 前提）· 契约 2 · 平台 tsc 0
- [ ] W1：热力页迁移（useAsyncData 范本）· audit 哨兵上线（factory 期 async = 红）
- [ ] W2：骨架原语提取（>1 消费者）· 样板行数下降
- [ ] W3：memo 试点 + 指南 · 试点页 diff
- [ ] W4：docs §7 增补 · 全量回归门（showcase+场景+audit·tsc 三 0·平台 475）
