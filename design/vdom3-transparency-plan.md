# vdom3 透明度优化计划（2026-12——执行状态：未开始）

> 背景（本轮真实事故复盘）：Chat 空 bubble / "生成中"卡住 / 无回复——排查链：
> 先怀疑渲染引擎 → 实际是①前端原地改 props 对象（vdom3 剪枝正确判断"未变"——
> 业务期望重渲染——契约违规）②服务端作用域/传参错误（ReferenceError /
> emit.emit is not a function——wf:done 未发——前端状态永久卡）。
>
> **透明度教训**：
> - vdom3 的优化决策（剪枝/复用）**正确但不可见**——业务"原地改对象"时
>   框架按契约剪枝——排查者先看到"渲染没更新"——不知道"剪枝命中"
> - 服务端异常（AI 调用中断）**前端不可见**——前端卡"生成中"——无失败提示
>
> **目标**：优化决策可见（为什么复用/为什么跳过）· 错误跨层可见（服务端异常
> → 前端明确失败态）· 契约违规可发现（开发期提示）——"碰巧正常/隐性卡住"
> 从此有迹可循。

---

## 阶段 A：剪枝决策透明化（引擎——comp:build 事件增强）

### A.1 剪枝原因入事件（为什么复用/为什么重跑）

**现状**：
```ts
// build.ts 组件分支
stream.emit(ev('comp', 'build', v._id!, { name: compName(v.type), reused: true, index: true }))
// 剪枝（props 不变 → 复用旧输出）vs 重跑（props 变）——无区分——只有 reused 布尔
```

**问题**：`reused: true` 不够——业务排查"渲染没更新"时，不知道是：
- ① props 浅比较相同（剪枝——**契约行为**——业务应新建对象触发）
- ② 根级（isRoot——不剪枝——重跑）
- ③ 首次 mount（无旧树）

**方案**：`comp:build` payload 增加 **reason 字段**：
```ts
reason: 'mount'      // 首次构建
     | 'reuse-skip'  // 剪枝命中（props 引用/浅比较相同——复用旧输出——零 RENDER）
     | 'props-changed' // props 变化驱动重渲染（payload 含 changedKeys）
     | 'root-render'  // 根组件（isRoot——内部状态变化必须重跑）
```
- `reuse-skip` 时 payload 含 `propsKeys`（浅比较的 key 清单——业务可核对"我以为变了但框架认为没变"）
- `props-changed` 已有 changedKeys（props:update 事件）——合并到 build 事件（单事件可查）

**验收**：`__wf_tail` 可见每次构建的原因——业务排查"没更新"时一眼看到 `reuse-skip`（= 契约：props 引用未变——需新建对象）

**风险**：低（事件 payload 增强——纯扩展）。

### A.2 剪枝命中与"内部状态变化"的提示（dev 辅助）

**现状**：剪枝命中后——组件内部 let 状态可能变了（通过组件自身 ctx.render 路径——不受剪枝影响——正确）——但**父级业务原地改 props 对象**（引用不变）——剪枝——不更新——**开发期无提示**。

**方案**：dev 模式（`__WF_V3_AUDIT !== '0'`）下——`reuse-skip` 的组件——若 props 含**引用类型**（对象/数组——可能被原地改）——`console.warn` 一条（一次性/去重）：
```
[vdom3/audit] 组件 X 剪枝命中（props 浅比较相同）——若你期望更新，请新建对象
传 props（props 不可变契约——原地改对象不会被检测到）
```
- 去重（模块级 Set——同组件只报一次）
- **诚实裁剪**：无法检测"业务是否真的原地改了"——提示是**契约教育**（开发期常亮提醒——不是错误）

**验收**：开发期剪枝命中的组件有契约提示——生产零开销（audit 关）

**风险**：低（warn 噪音——去重 + 只对引用类型 props）。

---

## 阶段 B：跨层错误透明化（服务端异常 → 前端明确失败态）

### B.1 服务端 AI 调用全局兜底（wf:error 必达）

**现状**：本轮事故——`runAgentStreamForAgent` 内 `ReferenceError`（messageContent 未定义）→ 调用链中断 → **wf:done/wf:error 都未发** → 前端永久卡"生成中"（60s 兜底才恢复）。

**方案**：
- `runAgentStreamForAgent` 整体 try/catch 兜底：任何未捕获异常 → `emit.emit({ type: 'wf:error', messageId: msgId, code: 'internal_error', message })` + 日志
- `handleNewMessageStream` 的 catch 已存在（`[messages] handleNewMessageStream error`）——但**不发 wf:error**——补（能找到 msgId 时发 wf:error——前端显示失败）
- 前端 wf:error 已有（`'⚠️ AI 回复失败'` + status error）——**已具备**——服务端补齐兜底即可

**验收**：任何服务端 AI 调用异常 → 前端明确显示"⚠️ AI 回复失败"（不卡"生成中"）——服务端日志 + 前端状态双可见

**风险**：低（catch 兜底——错误信息不泄漏（message 截断）。

### B.2 前端"生成中"超时的可见化

**现状**：streamTimer 60s 兜底（强制 complete）——但**无提示**（业务不知道是"完成"还是"超时兜底"）。

**方案**：超时兜底时——消息追加状态标记（`status: 'complete'` + content 已有——**或者**——超时且内容为空 → `status: 'error'` + "⚠️ 回复超时"）；`console.warn`（开发期——超时 = 服务端异常线索）

**验收**：卡"生成中"超过 60s → 明确"超时"态（不是静默 complete）

**风险**：低。

---

## 阶段 C：契约违规可发现（开发期审计）

### C.1 事件流审计增强（剪枝 vs DOM 对照）

**现状**：`auditDomEvents`（MutationObserver 对照事件流——绕过点 warn）——但**剪枝的组件输出**（无 DOM 操作——不触发）——业务"期望更新但没更新"（剪枝）——无对照。

**方案**（诚实评估）：**框架无法知道业务期望**——剪枝是正确的（props 未变）——**不检测**。改为：
- **文档红线**（docs/frontend-ui-dom.md）：props 不可变——状态变化必须新建对象或显式 ctx.render——附本轮事故案例
- **A.2 的 dev 提示**（剪枝命中 + 引用类型 props——契约教育）

**验收**：文档红线 + dev 提示覆盖"原地改对象"类事故

**风险**：无（文档 + 提示）。

---

## 阶段 D：调试工具增强

### D.1 `__wf_tail` 按组件/按决策过滤

**现状**：`__wf_tail`（subscribe 实时）——全量——无过滤。

**方案**：支持过滤参数：
```ts
__wf_tail(2000, { comp: 'MessageItem', decision: 'reuse-skip' })  // 按组件 + 按剪枝决策
```
- 阶段 A 的 reason 字段 → 过滤键

**验收**：排查"某组件为什么不更新"——一条命令看它的全部 build 决策

**风险**：低（调试工具——纯前端）。

---

## 执行顺序与依赖

```
阶段 A（剪枝决策透明——引擎事件增强——阶段 D 依赖）
  ├─→ 阶段 D（调试过滤——依赖 A 的 reason 字段）
阶段 B（跨层错误——服务端兜底 + 前端超时可见）——独立
阶段 C（文档红线 + dev 提示——依赖 A.2）
```

**建议顺序**：A → B（本轮事故的直接补洞）→ C → D

## 测试与预算

- 阶段 A：事件 payload 断言（build 事件 reason 字段——四类原因）
- 阶段 B：服务端异常注入（模拟 runAgentStreamForAgent 抛错——wf:error 必达——前端失败态）
- 每阶段独立提交可回滚——诚实裁剪记录

## 风险总览

| 阶段 | 风险 | 缓解 |
|---|---|---|
| A | 低 | 事件 payload 增强——纯扩展 |
| B | 低 | catch 兜底——错误截断不泄漏 |
| C | 无 | 文档 + dev 提示（不检测——诚实） |
| D | 低 | 调试工具 |
