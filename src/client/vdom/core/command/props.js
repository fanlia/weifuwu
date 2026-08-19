/**
 * vdom command — props（属性/文本更新命令）
 *
 * setProp = 运行时面（事件/ref/property——不可序列化——服务端 no-op——
 * 客户端 apply 三通道分发：on[A-Z] → events / PROPERTY_KEYS → props /
 * ref → ref.ts / 其余 → attributes）。
 * prev = 旧值（diff 提供——事件解绑/属性还原——引用变化重绑正确性）。
 */
export {};
