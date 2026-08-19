/**
 * vdom transform — 节点转换状态机（节点类型之间的转换渲染）
 *
 * 场景（diff 重渲染——旧节点 × 新节点类型不同）：
 *   null <-> component / null <-> fragment / component <-> fragment /
 *   element <-> component / hole <-> element / text <-> element ...
 *
 * 核心不变量（AGENTS §4.0/§6.3——占位法）：
 * - **childNodes 长度恒等于 children 数组长度**——任何转换保持节点数 1:1
 *   （空洞占位锚是 DOM 里的真实节点——转换 = 锚 ↔ 真实节点 replaceChild 互换——
 *   禁止 removeChild 塌缩）
 * - 组件输出多根 = 隐式 Fragment——锚点管理（首/尾锚——_childAnchors 语义）
 * - 组件卸载 = unmountComp（onUnmounts 清理）+ 输出节点移除
 *
 * 转换表（table.ts）：oldKind × newKind → 策略函数（各状态文件实现）
 *   text.ts / hole.ts / element.ts / component.ts / fragment.ts / portal.ts
 */
export {};
