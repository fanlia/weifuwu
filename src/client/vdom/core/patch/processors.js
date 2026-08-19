/**
 * vdom core/patch — processors（命令处理器——独立文件）
 *
 * 职责：各命令的消费逻辑（细节）——CommandApplier（index.ts）只做
 * 中转（apply switch → 本模块分发）。
 *
 * 生命周期语义（AGENTS）：
 * - ref（挂载完成——insert 后——el 已连接）；unref/remove/done（ref(null)）
 * - mount（组件初始化标记）；unmount（onUnmounts 逆序）
 * - removePortal（浮层容器清理）；move（顺移 remap / 移动 + 重映射）
 * - done.full（全量流清理旧树多余节点——资源释放完整）
 */
import { eventName, EVENT_RE } from '../field/events.ts';
import { disposeComponent } from '../node/component.ts';
import { PORTAL_ID_PREFIX } from '../node/portal.ts';
import { applyAttrs, applySetProp } from './fields.ts';
/** create 处理器（元素创建——幂等——data-wf-id 标记） */
export function procCreate(applier, cmd) {
    applier.touched.add(cmd.id);
    const existing = applier.nodes.get(cmd.id);
    if (existing && existing.nodeType === 1 && existing.tagName.toLowerCase() === cmd.tag) {
        applyAttrs(existing, cmd.attrs);
    }
    else {
        const el = applier.doc.createElement(cmd.tag);
        applyAttrs(el, cmd.attrs);
        if (existing) {
            // 类型不符 → 替换（同构保持）——旧节点卸载资源释放
            applier.clearNodeRefs(cmd.id);
            applier.eventRegistry.remove(cmd.id);
            existing.replaceWith(el);
        }
        applier.nodes.set(cmd.id, el);
    }
    const el = applier.nodes.get(cmd.id);
    if (el && el.nodeType === 1)
        el.setAttribute('data-wf-id', cmd.id);
}
/** createText 处理器（幂等） */
export function procCreateText(applier, cmd) {
    applier.touched.add(cmd.id);
    const existing = applier.nodes.get(cmd.id);
    if (existing && existing.nodeType === 3) {
        if (existing.textContent !== cmd.value)
            existing.textContent = cmd.value;
    }
    else {
        const t = applier.doc.createTextNode(cmd.value);
        if (existing)
            existing.replaceWith(t);
        applier.nodes.set(cmd.id, t);
    }
}
/** createAnchor 处理器（占位锚——幂等） */
export function procCreateAnchor(applier, cmd) {
    applier.touched.add(cmd.id);
    const existing = applier.nodes.get(cmd.id);
    if (existing && existing.nodeType === 8) {
        const detail = cmd.detail ? `wf-hole: ${cmd.detail}` : 'wf-hole';
        if (existing.textContent !== detail)
            existing.textContent = detail;
    }
    else {
        const anchor = applier.doc.createComment(cmd.detail ? `wf-hole: ${cmd.detail}` : 'wf-hole');
        if (existing)
            existing.replaceWith(anchor);
        applier.nodes.set(cmd.id, anchor);
    }
}
/** insert 处理器（挂载——ref 查表触发）
 *  **ref=null 语义 = 容器头部**（diff 逐槽对照首项/新增首项——位置 0
 *  ——append 会把位置 0 的新项追加到末尾——错位——真实 bug） */
export function procInsert(applier, cmd) {
    const el = applier.nodes.get(cmd.id);
    if (!el)
        return;
    if (el.isConnected)
        return;
    const parent = applier.parentOf(cmd);
    if (!parent)
        return;
    if (cmd.ref) {
        const prev = applier.nodes.get(cmd.ref) ?? null;
        parent.insertBefore(el, prev ? prev.nextSibling : parent.firstChild);
    }
    else {
        // 容器头部（空容器 = append——等价）
        parent.insertBefore(el, parent.firstChild);
    }
    if (el.nodeType === 1)
        applier.refRegistry.mount(cmd.id, el);
}
/** move 处理器（顺移 remap / 移动 + 重映射） */
export function procMove(applier, cmd) {
    const el = applier.nodes.get(cmd.id);
    if (!el)
        return;
    if (!cmd.noMove) {
        const parent = applier.parentOf(cmd);
        if (!parent)
            return;
        const prev = cmd.ref ? (applier.nodes.get(cmd.ref) ?? null) : null;
        if (prev)
            parent.insertBefore(el, prev.nextSibling);
        else if (cmd.first)
            parent.insertBefore(el, parent.firstChild);
        else
            parent.appendChild(el);
    }
    applier.remapSubtree(cmd.id, cmd.newId);
}
/** remove 处理器（卸载——ref(null) + 事件表 + 节点移除） */
export function procRemove(applier, cmd) {
    applier.clearNodeRefs(cmd.id);
    applier.eventRegistry.remove(cmd.id);
    applier.nodes.get(cmd.id)?.remove();
    applier.nodes.delete(cmd.id);
}
/** setText 处理器（就地更新） */
export function procSetText(applier, cmd) {
    const t = applier.nodes.get(cmd.id);
    if (t && t.nodeType === 3)
        t.textContent = cmd.value;
}
/** setProp 处理器（ref 生命周期 / 事件代理 / 三通道） */
export function procSetProp(applier, cmd) {
    const el = applier.nodes.get(cmd.id);
    if (!el || el.nodeType !== 1)
        return;
    const el2 = el;
    if (cmd.key === 'ref') {
        const prev = applier.refRegistry['refs'].get(cmd.id);
        applier.refRegistry.set(cmd.id, cmd.value, prev);
        if (el2.isConnected)
            applier.refRegistry.mount(cmd.id, el2);
        return;
    }
    if (EVENT_RE.test(cmd.key)) {
        const name = eventName(cmd.key);
        if (name)
            applier.eventRegistry.set(cmd.id, name, cmd.value);
        return;
    }
    applySetProp(applier.eventRegistry, cmd.id, el2, cmd.key, cmd.value);
}
/** ref 指令（挂载完成——insert 后） */
export function procRef(applier, cmd) {
    const el = applier.nodes.get(cmd.id);
    if (el && el.nodeType === 1 && typeof cmd.fn === 'function') {
        applier.refRegistry.set(cmd.id, cmd.fn);
        applier.refRegistry.mount(cmd.id, el);
    }
}
/** unref 指令（ref(null)） */
export function procUnref(applier, cmd) {
    applier.clearNodeRefs(cmd.id);
}
/** mount 指令（组件初始化完成——审计标记） */
export function procMount(applier, cmd) {
    const rec = applier.registry?.get(cmd.compId);
    if (rec)
        rec.mounted = true;
}
/** unmount 指令（组件卸载——onUnmounts 逆序） */
export function procUnmount(applier, cmd) {
    if (applier.registry)
        disposeComponent(cmd.compId, applier.registry);
}
/** removePortal 处理器（浮层容器清理——**容器移除**——#__wf_portal 下
 *  无残留空容器——同 key 重开惰性重建） */
export function procRemovePortal(applier, cmd) {
    const container = applier.portalContainers.get(cmd.key);
    if (container) {
        applier.clearNodeRefs(PORTAL_ID_PREFIX + cmd.key);
        container.remove();
    }
    applier.portalContainers.delete(cmd.key);
}
/** done 处理器（full 清理——旧树多余节点——资源释放完整） */
export function procDone(applier, cmd) {
    if (cmd.full && applier.touched.size > 0) {
        for (const [id, el] of [...applier.nodes]) {
            if (!applier.touched.has(id)) {
                applier.clearNodeRefs(id);
                applier.eventRegistry.remove(id);
                el.remove();
                applier.nodes.delete(id);
            }
        }
    }
    applier.touched.clear();
}
/** 命令分发（中转——switch → 处理器） */
export function dispatch(applier, cmd) {
    switch (cmd.op) {
        case 'create':
            procCreate(applier, cmd);
            break;
        case 'createText':
            procCreateText(applier, cmd);
            break;
        case 'createAnchor':
            procCreateAnchor(applier, cmd);
            break;
        case 'insert':
            procInsert(applier, cmd);
            break;
        case 'move':
            procMove(applier, cmd);
            break;
        case 'remove':
            procRemove(applier, cmd);
            break;
        case 'setText':
            procSetText(applier, cmd);
            break;
        case 'setProp':
            procSetProp(applier, cmd);
            break;
        case 'ref':
            procRef(applier, cmd);
            break;
        case 'unref':
            procUnref(applier, cmd);
            break;
        case 'mount':
            procMount(applier, cmd);
            break;
        case 'unmount':
            procUnmount(applier, cmd);
            break;
        case 'removePortal':
            procRemovePortal(applier, cmd);
            break;
        case 'done':
            procDone(applier, cmd);
            break;
        case 'close': break;
    }
}
