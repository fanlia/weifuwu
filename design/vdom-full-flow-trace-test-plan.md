# 前端全流程追踪测试机制计划（2026-08，事故驱动）

> 背景：agent-platform 文件生成系列事故（`disposed 组件在渲染` + 文件列表双份 +
> 首帧重复构建 3 次）暴露了「trace 已建但仍有盲区」。本文从 **uiServe 全流程**出发
> 审视渲染管线，分析结构性根因，制定分层追踪测试机制。
>
> 事故链（本次已闭环，全部红→绿测试 + 浏览器实证）：
> 1. `doRenderOne` building 守卫后置 → 构建期事件渲染重复构建子树 → 多代实例
> 2. 多代实例 registry 残留（build 只 set 不 delete）→ 孤儿实例 doRenderOne → 脱节 patch → 列表双份
> 3. 剪枝共享旧输出被并发会话 dispose → 旧树被当新树 diff → disposed 组件在渲染

---

## 1. 前端渲染全流程（从 uiServe 开始）

```
main.tsx: uiServe(app, { root })
  ├─ createVdomContext（context.ts）：registry / renderer / rootUi / ctx / hooks
  ├─ renderPath(path, initial=true)          ← 首帧
  │    router.execute(location, ctx)          ← 中间件链（api/auth/ws/i18n/confirm/toast）
  │      → use('/', main) 子路由              ← 嵌套 execute（layoutMw 包装）
  │      → handler = h(Chat, {})              ← 页面组件 vnode
  │    buildVNode(output, ctx, null)          ← 全新构建（oldInput=null）
  │    renderValue → root 落地
  ├─ popstate → renderPath(path, false)       ← 导航
  │    router.execute → buildVNode(output, ctx, currentChild)  ← 对照旧树
  │    patchValue(root, prevNode, prev, built)
  └─ renderer.render([id])                    ← 事件驱动渲染（doRenderOne）
       comp._render(props) → buildVNode(output, ctx, comp._child) → patchValue
       触发源：WS 回包 / fetch 完成 / store 通知 / 定时器 / 用户事件 / popup tracker / media
```

**异步边界（await 点）——所有交错的来源**（JS 单线程但渲染管线 async）：
| 边界 | await 内容 | 交错风险 |
|------|-----------|---------|
| router.execute | 中间件两阶段 async、嵌套子路由 | 导航中事件渲染 |
| buildVNode | 组件工厂、renderFn、兄弟 Promise.all | **构建期事件渲染（本次根因）** |
| doRenderOne | renderFn、buildVNode | 父子链并发 |
| 组件工厂/渲染期副作用 | WS 订阅、fetch、定时器、store、注册表 | 任何 await 点插入 |

**每个 await 点 = 事件回调可插入 = 共享 vnode 树（_child/_lifecycle/_refNode/registry）可被另一会话修改。**

---

## 2. 为什么 vdom 还是会出现 bug（结构性根因）

### 2.1 共享可变树 + 无并发控制（最根本）
- vnode 树是共享可变对象，被多个渲染会话（renderPath / 各组件 doRenderOne）读写
- per-id render chain 串行**只保证同一组件内**；父子链之间、build 与 patch 之间无互斥
- JS 单线程的"伪安全感"：不是并行而是**交错**——await 点让出后事件回调修改共享状态
- 本次事故的直接机制：`doRenderOne` 在 `comp._lifecycle === 'building'` 时仍先执行
  renderFn + buildVNode（守卫位置错误）——构建中组件的输出被重复构建

### 2.2 不变量靠约定 + 事后审计（默认关）——补丁式修复循环
| 不变量 | 被打破方式 | 当前防线 |
|--------|-----------|---------|
| 父非 disposed ⟹ 子树非 disposed | portal 独立 dispose / 并发 | treeHasDisposed 深检查（O(n) 补丁） |
| oldInput 树与 DOM 同构（三层一致） | 并发会话脱节 | auditTree 事后全量（`__WF_VDOM_AUDIT` **默认关**） |
| registry 注册 = 渲染树活跃实例 | 构建即弃树 | doRenderOne 孤儿校验（防御侧） |
| building 组件不被渲染 | 守卫位置错误 | 本次修复（前置） |

每次事故 = 一个不变量被打破 + 一个检查点补丁。**没有系统性的不变量管理**——检查点散落、
默认关闭、无跨状态机一致性验证。

### 2.3 diff 信任模型过强
- patchValue 信任 buildVNode 产物：`_child` 已构建、与 DOM 同构、旧树未被并发修改
- 信任被打破时行为不可预测：参数反转（旧树当新树）、keyed 重复插入、静默错位
- 无防御性检查（disposed 双向检测是第一道）

### 2.4 测试是"干净序列"，运行时是"事件流"
- jsdom 测试：单会话、build→patch 同步完成、mock ctx（如 `ui.render` 不接 renderer——
  本次根因测试首版就因此失效）
- 运行时：WS/fetch/定时器在任何 await 点插入、多会话交错
- **没有"事件流驱动"的测试范式**——交错行为在现有测试下不会出现

### 2.5 状态机之间无形式化一致性
- lifecycle / x2y / keys / pos / render 五个状态机各有转换表（vdom2-matrix 只测 x2y 单机）
- 跨状态机一致性（building 不渲染 / disposed 不渲染 / 孤儿不渲染）靠散落检查点

---

## 3. 全流程追踪测试机制（分层计划）

### L0 根因修复（已完成，commit 780056db / 0af7bc98）
- [x] compToComp 双向 disposed 检测（transitions.ts）
- [x] doRenderOne 孤儿实例校验（mount.ts）
- [x] doRenderOne building 守卫前置（mount.ts）
- [x] 测试：vdom2-concurrent-prune / vdom2-multi-instance（红→绿）

### L1 渲染会话追踪（事件流补全）
目标：**任何渲染会话的完整链路可追溯、可断言、可回放**。
- [ ] 会话来源标记：buildVNode 顶层调用标注来源（`initial` / `nav` / `render:{compId}`）——
      事件流已有 session id（R{n}），补全"谁发起的构建"
- [ ] **会话互斥检测**：同一 vnode 被两个会话 build/patch 的检测——vnode 加
      `_sessionId`（最后一次构建/渲染的会话），二次命中 → 事件流 `SESSION_VIOLATION`
      （dev 报错；生产 warn）
- [ ] 事件序列断言工具：场景 → 期望事件序列（makeEventCollector 扩展为
      `expectEventSequence(scene, [...])`——事故场景固化为序列快照，回归对比防漂移）
- [ ] 挂载信息完整性：`_parentNode/_refNode/_child` 三者的组合校验（构建后/渲染后/清理后）

### L2 不变量审计默认开启（dev）
目标：**不变量从"约定"变"运行时断言"，dev 默认生效**。
- [ ] `__WF_VDOM_AUDIT` dev 构建默认开（现在默认关——事故发生时无校验）
- [ ] 不变量清单（每个：事件 + dev 报错 + 测试断言）：
  - I1 **会话互斥**：同一 vnode 同一时刻只被一个会话构建/渲染（L1 的检测落地为 audit）
  - I2 **树活跃性**：registry 注册 = 渲染树可达——build 分配新 id 时校验旧 id 归属
        （或 doRenderOne 孤儿校验前置为 build 层清理）
  - I3 **三层一致性**：patch 前 oldInput 树与 DOM 同构（增量校验——只在 diff 入口
        校验被 diff 的子树，替代全量 auditTree）
  - I4 **生命周期**：dispose 后组件副作用清理（unmount 钩子执行）+ 不再被渲染调度
  - I5 **状态机合法转换**：building/disposed/孤儿 三类 vnode 不得进入渲染/diff
- [ ] audit sink 接入事件流（现在 auditTree 是独立遍历；改为订阅事件流转换瞬间校验——
      参考 installMountInvariantAudit 的模式，扩展到全部不变量）

### L3 事件流驱动测试（测试范式——填补最大盲区）
目标：**测试从"干净序列"升级为"事件流交错"**。
- [ ] 交错矩阵测试：两个组件 id 的 doRenderOne 以不同顺序交错（含构建期/导航期）→
      断言：最终 DOM 正确 + 无孤儿实例 + 事件序列合法
- [ ] 真实事件流模拟（jsdom）：WS 广播（new_message / file_updated / wf:step|token|done）
      + fetch 完成 + 定时器 + store 通知 → 驱动组件树 → 断言（对齐 agent-platform 场景）
- [ ] uiServe 级集成测试：jsdom 跑完整 uiServe（真实 router + 中间件 + 组件 +
      renderPath + renderer）——不再 mock ctx.ui.render（本次根因测试首版失效的教训）
- [ ] 事故场景固化：构建期自渲染 / 导航期事件渲染 / 孤儿实例 / 剪枝缓存失效 /
      portal 独立 dispose —— 每个事故一个"事件序列测试"
- [ ] 状态机联合矩阵：lifecycle × x2y × keys × pos × render 的非法组合表 +
      自动生成测试（vdom2-matrix 从 9×9 扩展到五状态机）

### L4 浏览器自动化回归（端到端）
目标：**真实浏览器事件流（WS/网络/定时器）下的自动回归**。
- [ ] agent-browser 脚本化场景（发布前检查项）：
  - 页面加载：断言构建次数（ChatInput/FS 各 ≤2）、无 SKIP_ORPHAN/SESSION_VIOLATION
  - 文件生成：发送消息 → 等 file_updated → 断言列表单份 + pill 单份 + 结构完整
  - 导航切换：/chat/:id ↔ /departments/:id ↔ /agents——断言无残留实例
  - 关键交互：@ 提及、搜索、附件上传、审批流
- [ ] 断言工具：console 错误钩子（现有 init-hook 模式）+ `__vdom_events` 违规过滤
      + DOM 结构快照对比
- [ ] 与 L3 场景一一对应（jsdom 复现 + 浏览器确认——事故双验证）

### L5 结构性改进（治本，后续里程碑）
- [ ] **渲染会话互斥**：buildVNode/patchValue 全局"渲染锁"（导航/首帧期间事件渲染
      排队）或 vnode 版本号 + 乐观校验（会话开始记录版本，操作前校验——版本不符则
      跳过/重建）
- [ ] **registry 生命周期**：引用计数或树归属标记——build 分配新 id 时清理孤儿注册
      （从 doRenderOne 防御侧移到 build 根源侧）
- [ ] **diff 前置一致性校验**：增量校验（I3）替代全量 auditTree——O(被 diff 子树)
- [ ] **状态机形式化**：五状态机联合转换表 + 非法转换测试自动生成
- [ ] 组件 props 稳定性契约：renderFn 每次重建回调（onXxx 新函数）→ 剪枝失效 →
      每次渲染全量 mount（agent-platform ChatInput/FS 每次 doRenderOne 都重建——
      性能/实例膨胀，观察中）——考虑回调稳定化（mount 期定义 + 引用透传）

---

## 4. 里程碑与验收

| 里程碑 | 内容 | 验收 |
|--------|------|------|
| M1（已完成） | 三个根因修复 + 红绿测试 | vdom 128 + 组件 1188 全绿；浏览器多轮文件生成单份 |
| M2 | L1 会话追踪 + L2 不变量审计默认开 | dev 下事故场景自动报错；事件序列断言工具可用 |
| M3 | L3 事件流驱动测试（交错矩阵 + uiServe 集成） | 新增 ≥10 个交错测试覆盖已知事故类别 |
| M4 | L4 浏览器自动化回归 | agent-browser 场景脚本化，发布前一键跑 |
| M5 | L5 结构性改进（会话互斥/registry 清理/diff 前置校验） | 新事故类别在 M2 的审计下被自动捕获 |

**核心验收标准**：任何新的渲染交错 bug 在 **dev 首次出现时即被 audit 报错**（不再靠
用户报告 + 事后 trace），且 L3/L4 测试能自动复现。

---

## 5. 附录：本次事故的调查方法（可复用）

1. **真实浏览器复现 + MutationObserver 快照**：记录 DOM 变化的精确序列（列表双份的
   两次插入时刻）
2. **事件流诊断**：`__vdom_events` 查 render/lifecycle 事件（ring 轮转快——页面加载
   早期事件用 init-hook 尽早采集）
3. **构建计数插桩**：buildComponent 加组件名计数（`__cnt`）——首帧构建次数量化
   （3 次 → 修复后 2 次）
4. **工厂调用栈**：mountAsyncComponent 打印 stack——区分 renderPath / doRenderOne 来源
5. **execute 输出审计**：serve.ts 数 output 树组件数（serve-dbg count=1）——证明
   重复构建发生在 buildVNode 层而非路由层
6. **最小 jsdom 复现**：将浏览器时序还原为确定性测试（SlowChild 挂起构建 +
   setTimeout 触发 render——注意 mock `ui.render` 必须接真实 renderer）
