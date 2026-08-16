# vdom2 优秀部分纳入 vdom3 事件流计划（2026-12——执行状态：未开始）

> 目标：把 vdom2 的稳健性机制（占位法/边界标记/x2y 查表/A 级检测/trace）
> 以**事件流形式**纳入 vdom3——转化框架：
> ① "DOM = fold(事件流)"——任何 DOM 结构（占位/标记）都是事件的折叠；
> ② "决策 = 事件"——diff 的转换/模式选择作为事件流一等公民（决策可观测/可回放/可撤销）；
> ③ "校验 = 订阅"——audit 规则作为事件流订阅者（不侵入 diff）。
> 背景：vdom3 架构（事件流闭环/结构共享/代理/异步管线）优于 vdom2——但
> vdom2 的 diff 决策稳健性机制（同构占位/多节点锚点/转换矩阵/业务身份引导）
> 是 v3 缺失的——本次以事件流为载体重置这些机制（转化后比 v2 更强：
> 可回放/可撤销/可校验）。

---

## 阶段 0：事件流地基扩展（前置——纯扩展零行为变化）

### 0.1 事件字段扩展（kind / session / 决策类型）

**现状**：事件流 `{ entity, action, target, payload }`——无类型标注/无会话关联/无决策事件。

**方案**：
- 事件 payload 增加 **kind** 字段（node 事件的 `kind: 'element' | 'text' | 'hole' | 'mark'`——占位/标记类型标注）
- 事件增加 **session** 字段（渲染会话 id——renderByIds/首帧/导航每次渲染一个 id——vdom2 traceId 等价）
- 新增**决策事件类型**：`diff:transition`（from/to——转换决策）、`keys:mode`（keyed/unkeyed/mixed 模式选择）

**验收**：
- 事件 schema 测试（kind/session 字段存在性——新旧事件兼容）
- 现有渲染零行为变化（纯扩展）

**风险**：低（向后兼容——字段新增）。

### 0.2 决策事件原语（diff 决策的观测点）

**现状**：patch 决策（if/else 链——文本/null/vnode 分支）无事件。

**方案**：patchInner 决策点发射 `diff:transition` 事件（from 旧 kind → to 新 kind——kind 用 transform.ts 的单一分类源扩展）——trace 级（默认不污染主线事件流——level 过滤）。

**验收**：转换决策可观测（__wf_tail 可见 diff:transition）——渲染行为不变。

**风险**：低（事件发射——零语义影响）。

---

## 阶段 1：空洞事件化（占位法恢复——最大改动/最高收益）

### 1.1 DOM 同构恢复（|DOM| = |children|）

**现状**：flatten 滤除 false/null——children 无空洞——条件渲染切换时可见项索引漂移 → 同 type 错配 patch（Chat @ 菜单重复输入框——已业务侧包容器规避——框架未根治）。

**方案**：
- `flatten` 保留 false/null/boolean（空洞保留——children 索引对齐）
- 渲染层：空洞 → **占位节点**（`<!--wf-hole:kind-->`——vdom2 createHole 语义）——DOM 与 children 同构（长度恒等）
- patchChildren：空洞槽位对称处理（占位 ↔ 真实 **replaceChild 互换**——禁止 removeChild 塌缩 childNodes）
- 事件流：空洞的 create/insert/remove 发射 node 事件（`kind: 'hole'`——阶段 0.1）
- 组件输出 null → 占位（renderChild 兜底——vdom2 render.ts:57 语义）

**改动点**：types.ts（flatten）/ render.ts（renderVNodeChild/patchChildren）/ build.ts（结构共享的空洞比较——空洞恒等）/ ssr.ts（空洞序列化）/ audit.ts（空洞跳过——filter 有 el 已天然）。

**测试**：
- 空洞对齐矩阵（vdom2 提交按钮事故回归——[Field, false, Button]——条件切换）
- 条件渲染中间项（@ 菜单场景——移除/插入不漂移——不重复/不嵌套）
- 组件输出 null 槽位（占位兜底）
- 嵌套数组空洞（隐式 Fragment 内）
- 现有 104 测试全绿（**阶段 1 是历史教训：flatten 保留曾致 6 测试失败——本次完整处理 build/render/ssr/audit 各路径——逐失败修复**）

**验收**：DOM = fold(事件流) 含空洞（回放重建占位）——条件渲染切换零漂移（audit 顺序校验通过）。

**风险**：**高**（影响面最大——但正确性收益最高——根治 children 错配类 bug 类别）。

---

## 阶段 2：边界标记事件化（多节点输出锚点）

### 2.1 多节点输出范围查询（getOutputRange 等价）

**现状**：vdom3 组件/数组项/Fragment 多节点输出的锚点靠 prevNode 单节点（AGENTS.md §6.3——_childAnchors 边界残余风险）。

**方案**：
- 渲染时记录多节点输出的**首/尾节点 id**（组件 vnode 上——`_childFirst/_childLast`——registry 可查）
- patchChildren 锚点升级为**范围锚**（prevNode → prevRange——插入/移动用范围尾节点定位）
- 事件流：多节点输出作为**一个逻辑单元**（node:insert 的 ref 链——首节点 insert 事件 + 尾节点标记）——回放时范围可重建
- **不引入 DOM 注释标记**（vdom2 的 fragment-start/end——DOM 噪音——事件流引用替代——阶段 0.1 的 kind=mark 预留但默认不用）

**改动点**：render.ts（renderVNode 记录首尾）/ build.ts（组件 _child 范围）/ patch.ts（锚点升级）。

**测试**：
- 组件输出数组（首/尾锚点——多节点 patch 移动/移除）
- Fragment 展开 + 相邻文本（vdom2 阶段 B 锚点场景）
- 嵌套数组项（隐式 Fragment 内多节点）

**验收**：多节点输出 patch 零错位（audit 顺序校验）——组件输出数组首/尾锚点理论边界消除。

**风险**：中高（锚点语义变化——测试矩阵兜底）。

---

## 阶段 3：决策事件化（x2y 查表 + 转换矩阵）

### 3.1 patchInner 查表化

**现状**：patchInner if/else 链（文本 → null → vnode——分支遗漏风险）。

**方案**：
- VKind 分类（transform.ts 扩展——vdom2 classifyKind 语义：text/native/frag/comp/arr/hole/portal）
- `TRANSITIONS[from][to]` 查表（vdom2 transitions.ts 语义——每组合明确转换函数）
- 每次转换发射 `diff:transition` 事件（阶段 0.2——from/to——决策可观测）

**改动点**：render.ts（patchInner 重构为查表）/ 新 transitions.ts（矩阵）。

**测试**：转换矩阵测试（每 (from,to) 组合——含空洞↔真实、组件↔元素、文本↔元素等——矩阵全覆盖）。

**验收**：patch 行为与 if/else 等价（现有测试全绿）——转换决策全事件流可观测。

**风险**：中（重构面——语义不变——矩阵测试兜底——**先矩阵后重构**：先写转换矩阵测试（红）→ 查表实现（绿））。

---

## 阶段 4：审计订阅（A 级动态检测 + 校验器模式）

### 4.1 动态数组 key 检测（dev error 引导业务身份）

**现状**：vdom3 无（位置漂移的业务侧防线缺失——文档红线未落地）。

**方案**：
- `keys:mode` 决策事件（阶段 0.1）→ audit 订阅者
- 规则：children 长度变化 + 无 key 组件项 → dev error（明确提示加 key）
- 去重（vdom2 warnedDynamicArrays 语义——同数组签名只报一次——防表单静态字段误报刷屏）

**改动点**：audit.ts（新订阅规则）。

**测试**：动态数组检测（长度变化 + 无 key 组件——报错；静态字段数组——不误报）。

**验收**：业务 key 引导落地（dev error）——与事件流对照审计（auditDomEvents）并列。

**风险**：低。

---

## 阶段 5：会话 trace（事件流增强）

### 5.1 session 字段 + 会话过滤 + diff 摘要

**现状**：__wf_tail/recent（全量事件流）——无会话关联/无 children 顺序摘要。

**方案**：
- session 字段（阶段 0.1）→ __wf_tail/recent 支持按会话过滤（`__wf_tail(sessionId)`）
- `diff:children` 摘要事件（old/new/dom 三序列——vdom2 kidsSeq 语义——trace 级）
- 事件流浏览器工具扩展（过滤 UI）

**改动点**：events.ts（session 注入）/ 调试工具。

**测试**：会话过滤（多次渲染——按会话取事件）；diff 摘要（顺序错乱快速定位）。

**验收**：children 顺序类 bug 的第一定位工具（事件流化 trace）。

**风险**：低。

---

## 执行顺序与依赖

```
阶段 0（事件流地基——纯扩展）
  ├─→ 阶段 1（空洞事件化——依赖 0.1 kind 字段）
  ├─→ 阶段 2（边界锚点——依赖 0.1）
  ├─→ 阶段 3（x2y 查表——依赖 0.2 决策事件）
  └─→ 阶段 4（审计订阅——依赖 0.1 keys:mode 事件）
阶段 5（会话 trace——依赖 0.1 session）——随时可做
```

**建议顺序**：0 → 1（最高收益——先啃硬骨头）→ 2 → 4（低风险快赢）→ 3（重构——最后）→ 5（体验）

## 测试与预算

- 每阶段：先写失败测试（红）→ 实现（绿）——CS-05 纪律
- 阶段 1 回归面最大：vdom*.test.ts 全量 + 浏览器实测（Chat @ 菜单/条件渲染/组件输出 null）
- 全量预算 ≤15s（node --test --test-concurrency=8）——每阶段跑全量确认
- **诚实裁剪**：任一阶段引入无法短期解决的回归 → 回滚该阶段（git 单阶段提交——可独立 revert）——设计归档记录

## 风险总览

| 阶段 | 风险 | 缓解 |
|---|---|---|
| 0 | 低 | 纯扩展——字段新增 |
| 1 | 高 | 完整路径处理（build/render/ssr/audit）——历史教训（6 测试）逐失败修复——独立提交可回滚 |
| 2 | 中高 | 锚点升级——矩阵测试 |
| 3 | 中 | 先矩阵后重构（TDD）——语义不变 |
| 4 | 低 | 订阅器——不侵入 diff |
| 5 | 低 | 调试增强 |
