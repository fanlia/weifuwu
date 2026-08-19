/**
 * vdom core/diff — same（同态对照决策——中转）
 *
 * 职责：同位置同类型的对照决策——组件分支（类型比较/复用——输出对照
 * 细节在 output.ts）、元素分支（diffAttrs + diffChildren——细节在
 * attrs.ts/children.ts）。
 *
 * 本文件是「对照决策的中转站」——具体命令生成下沉 attrs/children/output/
 * cleanup——自身不处理细节逻辑。
 */
import { pathId } from '../node/native.ts';
import { isPortal, PORTAL_ID_PREFIX } from '../node/portal.ts';
import { childrenOf } from '../node/children.ts';
import { disposeComponent, renderComponent } from '../node/component.ts';
import { diffAttrs } from './attrs.ts';
import { removeVNodeTree } from './cleanup.ts';
import { diffComponentOutput } from './output.ts';
import { diffChildren, diffChildrenItems } from './children.ts';
/**
 * 同态对照（同位置同类型——**精准命令生成**）：
 * 组件 → renderComponent 复用（工厂不重跑——lastOutput 对照递归）；
 * 元素 → 属性值比较（只发变化）+ 函数面引用比较 + children 递归（列表分类）
 */
export async function diffSame(oldV, newV, parent, index, ref, emit, emitCommand, ctx, registry) {
    const id = pathId(parent, index);
    // 组件复用（工厂不重跑——renderFn 重新调用——输出对照上次——精准 patch）
    if (typeof newV.type === 'function') {
        const rec = registry.get(id);
        // **类型比较**：同位置不同类型（条件切换 A → B）——卸载旧实例 + 重建
        if (rec && rec.type !== newV.type) {
            // **同步卸载**（onUnmounts + 删 rec——不等 patch 消费 unmount 命令——
            // 否则 renderComponent 立即复用旧 rec——类型错位）
            disposeComponent(id, registry);
            // 旧输出清理（递归 remove——lastOutput 结构）
            if (rec.lastOutput !== undefined && rec.lastOutput !== null) {
                removeVNodeTree(rec.lastOutput, pathId(parent, index), emitCommand);
            }
            // 新实例（rec 已删——重新 mount——工厂执行）
            await renderComponent(newV, parent, index, ref, id, ctx, registry, emit);
            emitCommand({ op: 'mount', compId: id });
            return;
        }
        const oldOut = rec?.lastOutput;
        const isNew = await renderComponent(newV, parent, index, ref, id, ctx, registry, async (out, p, i, r) => {
            // **组件输出对照（中转——细节在 output.ts——单一实现源——
            //  禁止内联双实现漂移）**：null↔vnode 转换/单节点对照/数组对照/
            //  数组↔单节点 transform
            await diffComponentOutput(oldOut, out, p, i, r, emit, emitCommand, ctx, registry, diffSame);
        });
        // **mount 指令（组件生命周期——初始化完成——仅新实例）**
        if (isNew)
            emitCommand({ op: 'mount', compId: id });
        return;
    }
    // 元素同标签：属性精准 diff + children 递归对照
    if (typeof newV.type === 'string' && typeof oldV.type === 'string' && oldV.type === newV.type) {
        diffAttrs(oldV, newV, id, emitCommand);
        await diffChildren(oldV, newV, id, emit, emitCommand, ctx, registry);
        return;
    }
    // portal 同态（浮层内容更新——精准对照）：
    //   同 key：内容 diff 到 portal 容器（不重建插槽锚——旧内容对照新内容）
    //   异 key：removePortal（旧容器清理——无残留）+ 新侧渲染
    if (isPortal(oldV) && isPortal(newV)) {
        const oldKey = oldV.key ?? 'default';
        const newKey = newV.key ?? 'default';
        if (oldKey !== newKey) {
            // 异 key：旧浮层容器清理（浮层内容 + 容器）+ 新侧渲染（插槽锚同 id 幂等）
            emitCommand({ op: 'removePortal', key: oldKey });
            await emit(newV, parent, index, ref);
            return;
        }
        // 同 key：内容对照到 portal 容器（parent = portal:<key>——id 路径与
        // build 的 portal case 一致——插槽锚保持——不重建）
        const base = `${PORTAL_ID_PREFIX}${newKey}`;
        const oldCs = childrenOf(oldV);
        const newCs = childrenOf(newV);
        await diffChildrenItems(oldCs, newCs, base, emit, emitCommand, ctx, registry);
        return;
    }
    // 其余同态（text/fragment 等）——首版：新侧重建（位置对照）
    await emit(newV, parent, index, ref);
}
/** 属性精准 diff（值比较——只发变化的键；函数面引用比较——prev 传递） */
