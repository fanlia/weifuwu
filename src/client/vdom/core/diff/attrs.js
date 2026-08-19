/**
 * vdom core/diff — attrs（属性精准 diff——值比较——最小命令集）
 *
 * 职责（diff 层的细节模块）：静态面值比较（只发变化键 + 旧有新的没有 →
 * undefined 移除）；函数面引用比较（prev !== next 才发——prev 传递）。
 */
import { serializableAttrs } from '../node/native.ts';
/** 属性精准 diff（值比较——只发变化的键；函数面引用比较——prev 传递） */
export function diffAttrs(oldV, newV, id, emitCommand) {
    // 静态面（可序列化）——值比较——只发变化键；旧有新的没有 → 移除
    const oldAttrs = serializableAttrs(oldV.props);
    const newAttrs = serializableAttrs(newV.props);
    for (const [k, v] of Object.entries(newAttrs)) {
        if (oldAttrs[k] !== v)
            emitCommand({ op: 'setProp', id, key: k, value: v });
    }
    for (const k of Object.keys(oldAttrs)) {
        if (!(k in newAttrs))
            emitCommand({ op: 'setProp', id, key: k, value: undefined });
    }
    // 函数面（事件/ref）——引用比较——变化才重发（prev 传递——patch 解绑重绑）
    for (const [k, v] of Object.entries(newV.props)) {
        if (k === 'children' || k === 'key')
            continue;
        if (typeof v === 'function' && oldV.props[k] !== v) {
            emitCommand({ op: 'setProp', id, key: k, value: v, prev: oldV.props[k] });
        }
    }
}
