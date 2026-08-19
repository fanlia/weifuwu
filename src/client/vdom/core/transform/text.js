/**
 * vdom transform — text（文本转换——text ↔ X）
 *
 * 场景：条件渲染/列表项类型切换（'a' <-> <div/> <-> 组件...）。
 * 转换职责（old=text → new=X）：旧文本节点移除（让位）——新节点由 diff
 * 渲染到同一位置。同态 text → text 不在本表（就地 setText——diff 层）。
 */
/** text → X：旧文本节点移除（让位） */
export const transitionText = async (_old, next, ctx) => {
    ctx.emit({ op: 'remove', id: ctx.oldId });
    await ctx.emitNode(next, ctx.parent, ctx.index, ctx.ref);
};
