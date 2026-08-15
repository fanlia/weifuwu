/**
 * vdom3 — 状态驱动前端引擎（全新架构，2026-08）
 *
 * 与 vdom2 的本质区别：**无整树 diff**。
 *
 *   vdom2：状态 → renderFn（输出完整树）→ 新旧树比较（diff）→ DOM 变更
 *   vdom3：状态（signal）→ 绑定点更新 / 结构指令（Show/For）→ DOM 指令 → DOM
 *
 * 核心不变量：
 *   1. **状态是唯一事实源**——signal 变化 → 调度 → 指令 → DOM（无树比较）
 *   2. **事件流是引擎本体**——从 location 到 DOM 每一步都是事件（可回放/取消/断言）
 *   3. **DOM = 事件折叠**——给定初始 DOM + 事件流 = 任意时刻 DOM（可重放）
 *   4. **组件 = 状态 + 绑定视图**——闭包状态 + signal；条件/列表经 Show/For 结构指令
 *
 * 无整树 diff 的代价与收益：
 *   - 收益：更新 O(变化量)（不遍历整树）；可回放/取消（指令逆操作）；无 diff 决策噪音
 *   - 代价：组件必须显式声明状态绑定点（放弃"renderFn 输出完整树"的隐式 diff）
 *
 * 事件流覆盖（location → DOM）：
 *   ROUTE_CHANGE → COMP_MOUNT → SIGNAL_SET → DOM_WRITE(INSERT/UPDATE/REMOVE) → ...
 */
