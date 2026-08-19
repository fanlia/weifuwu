/**
 * vdom transform — fragment（Fragment/数组转换——fragment ↔ X）
 *
 * 场景（隐式 Fragment——数组/`<></>`/组件输出多根）：
 *   fragment <-> null（空数组 ↔ 条件渲染）
 *   fragment <-> element（展开项 ↔ 单元素）
 *   fragment <-> component（展开项 ↔ 组件）
 *
 * 同态 fragment → fragment 不在本表（diff 层逐项转换——keyed/unkeyed
 * 列表 diff——按位置/key 逐项对比）。
 *
 * 转换职责（old=fragment → new=X）：**旧展开区间完整清理**（数组/多节点
 * 递归 remove——不是只清首锚——数组多项残留事故的根治）——新侧经
 * emitNode 渲染到同一位置。
 */
import { childrenOf } from '../node/children.ts';
import { pathId } from '../node/native.ts';
/** 子树递归移除（旧展开区间完整清理——数组/嵌套/元素逐项） */
export function removeChildTree(v, id, ctx) {
    if (v === null || v === undefined || typeof v === 'boolean') {
        ctx.emit({ op: 'remove', id });
        return;
    }
    if (typeof v === 'string' || typeof v === 'number') {
        ctx.emit({ op: 'remove', id });
        return;
    }
    if (Array.isArray(v)) {
        v.forEach((c, i) => removeChildTree(c, pathId(id, i), ctx));
        return;
    }
    const cs = childrenOf(v);
    cs.forEach((c, i) => {
        if (c !== null && typeof c !== 'string' && typeof c !== 'number' && typeof c !== 'boolean' && !Array.isArray(c)) {
            removeChildTree(c, pathId(id, i), ctx);
        }
        else {
            ctx.emit({ op: 'remove', id: pathId(id, i) });
        }
    });
    ctx.emit({ op: 'remove', id });
}
/** fragment → X：旧展开区间完整清理（数组逐项递归——非只清首锚）+
 *  新侧渲染到同一位置（展开位置连续——pathId(parent, index + ci)） */
export const transitionFragment = async (oldNode, next, ctx) => {
    const items = Array.isArray(oldNode) ? oldNode : childrenOf(oldNode);
    items.forEach((c, ci) => {
        removeChildTree(c, pathId(ctx.parent, ctx.index + ci), ctx);
    });
    await ctx.emitNode(next, ctx.parent, ctx.index, ctx.ref);
};
