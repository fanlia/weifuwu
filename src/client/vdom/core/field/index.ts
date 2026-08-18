/**
 * vdom core/field — 属性三通道 + key/ref/style（字段处理统一出口）
 *
 * 规则（AGENTS §4.0——属性三通道）：setProp 按通道分发——
 *   on[A-Z] → events（事件绑定——on + 大写判定——once/only 不误判）
 *   PROPERTY_KEYS → props（DOM property——value/checked 白名单——
 *     setAttribute 不更新输入值）
 *   ref → ref（挂载 el/卸载 null——同引用幂等——AGENTS §5.1 纪律）
 *   style → style（对象/字符串/数字 px/UNITLESS/--var/清空防残留）
 *   key → key（业务身份声明协议——h/jsx 剥离——props 不泄漏）
 *   其余 → attributes（attribute 通道——enumerated 白名单显式 true/false——
 *     boolean 空字符串=存在——null/undefined/false removeAttribute）
 */

export { applyAttribute, ENUMERATED_KEYS } from './attributes.ts'
export { applyProperty, isPropertyKey, PROPERTY_KEYS } from './props.ts'
export { applyRef, REF_KEY } from './ref.ts'
export { applyStyle, applyStyleValue, UNITLESS_KEYS } from './style.ts'
export { bindEvent, eventName, EVENT_RE } from './events.ts'
export { extractKey, stripKey, KEY } from './key.ts'
