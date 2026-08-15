/**
 * vdom3 — vnode + stream 前端引擎（2026-08）
 *
 * 与 vdom2 的差异：**渲染执行 = 事件流**（vnode 树保留声明式——renderFn 输出完整树）。
 *
 *   vdom2：状态 → renderFn → vnode 树 → diff（命令式比较）→ DOM 变更 + 旁路事件记录
 *   vdom3：状态 → renderFn → vnode 树 → **渲染事件流**（CREATE/INSERT/UPDATE/REMOVE）
 *          → 执行器消费事件 → DOM（事件流是引擎本体——DOM = fold(事件流)）
 *
 * 核心不变量：
 *   1. vnode 树保留声明式（与 vdom2 同模型——两阶段组件兼容）
 *   2. 渲染即事件：节点创建/属性设置/文本更新/插入/移除都是事件（可回放/取消/断言）
 *   3. DOM = fold(事件流)：初始 DOM + 事件序列 = 任意时刻 DOM（时间旅行）
 *   4. 更新最小化：同位置同类型（含 key）复用——仅变化发事件
 *      （TEXT_UPDATE/PROP_UPDATE——无整树 diff 决策噪音；异类型 → 重建事件）
 *
 * 事件流覆盖（location → DOM）——统一命名：对象 + 动作 + 参数（entity + action + target + payload）：
 *   route:change → comp:mount → node:text:create → node:insert → prop:text:update
 *   → node:remove/move（更新时）→ comp:unmount
 *   每层同构：location（route:change）/ jsx（comp:render·build·mount·unmount、props:update）
 *   / vdom（vnode:patch 决策——strategy 参数）/ dom（node:text:prop:event:ref 的 create·insert·
 *   remove·move·update·bind·unbind·cleanup）——任何事件触发最终落到 dom 层的精准状态变化
 *
 * 模块：
 *   types.ts   — VNode（native/文本/Fragment）+ V3Event + EventStream 契约
 *   jsx.ts     — h（vnode 创建——单数组参数自动展开）
 *   render.ts  — mount/patch：树 → 事件流 → DOM（同类型复用/异类型重建/文本属性特判）
 *   events.ts  — 事件流（记录/回放/逆操作/断言——DOM = fold(events)）
 *
 * 与 vdom2 并行（不兼容演进）——vdom2 资产保留，vdom3 验证「事件流即执行」范式。
 */
