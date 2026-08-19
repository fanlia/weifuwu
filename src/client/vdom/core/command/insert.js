/**
 * vdom command — insert/remove（挂载与移除命令）
 *
 * insert 的 ref = 已插入的**前一个兄弟**（流式渲染——后一个尚未插入）——
 * apply 侧插到 prev 之后（insertBefore(el, prev.nextSibling)）；ref null =
 * 追加尾部。
 */
export {};
