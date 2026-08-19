/**
 * vdom core — vnode 纯数据面（独立实现——零引用 ui-dom）
 *
 * 设计（对齐 vdom-x 契约 + AGENTS §4.0/§6.3）：
 * ① vnode 纯数据——零回填字段（el/_render/_id 等全部在影子层——可自由克隆/
 *    比较/序列化——用户写 JSX 就能推导 vnode 形状）
 * ② h() 除 key 剥离外零转换——children 原样（false/嵌套数组保留——不 filter）
 * ③ key 业务身份声明协议：key 从 props 剥离进 vnode.key（组件 props 不见 key）
 * ④ children 值域协议：vnode/string/number/boolean/空洞(null/undefined)/嵌套数组
 *    （数组 = 隐式 Fragment——递归展开统一在 childrenOf——单一规则源——
 *    空洞保留——占位法保长度恒定）
 * ⑤ 组件两阶段：工厂 = mount（一次——初始化状态/订阅/数据预取）；
 *    renderFn = 每次渲染（同步或 async——异步边界 = ctx.data 管道——不挂起）
 * ⑥ Fragment/Portal 内部符号——公共面不导出（数组 = 隐式 Fragment；
 *    createPortal = usePopup 内部机制；`<></>` 经 jsx-runtime 子路径）
 */
import { extractKey, stripKey } from './field/key.ts';
/** h()——创建 vnode（纯数据——除 key 剥离外零转换）
 *  children 原样：单子节点直接存、多子节点存数组、无子节点不存——false/嵌套
 *  数组保留（不 filter——空洞占位法在消费侧） */
export function h(type, props, ...children) {
    const p = stripKey(props);
    if (children.length === 1)
        p.children = children[0];
    else if (children.length > 1)
        p.children = children;
    return { type, props: p, key: extractKey(props) };
}
/** jsx 运行时（自动导入——`<div/>` 编译目标——React 兼容签名 jsx(type, props, key)——
 *  props 内 key 同样剥离；jsxs/jsxDEV 同形状（children 已在 props.children） */
export function jsx(type, props, key) {
    return { type, props: stripKey(props), key: (key ?? extractKey(props)) ?? null };
}
export const jsxs = jsx;
export const jsxDEV = jsx;
