/**
 * vdom hooks — useControlled（受控值——受控 props 语义）
 *
 * 规则（AGENTS §5.2/§5.3）：受控值由父独占——onChange 唯一出口；
 * 非受控内部状态（hook 状态缓存——渲染期调用——读最新 props）；
 * 受控缺回调 warn（静默不可用防护）。
 */
/** 受控/非受控值（渲染期调用——受控读最新 props）
 *  **双形状**：useControlled(controlled, defaultValue?)——defaultValue 可选
 *  （ui-dom 兼容单参对象——无默认值时非受控初始为 undefined） */
export function useControlled(env, controlled, defaultValue) {
    const idx = env.nextHookIndex();
    const state = env.getHookState(idx) ?? { value: defaultValue };
    env.setHookState(idx, state);
    const isControlled = controlled.value !== undefined;
    return {
        get value() {
            return (controlled.value ?? state.value);
        },
        controlled,
        setValue(v) {
            if (isControlled) {
                // 受控：唯一出口是回调（缺回调 = 静默不可用——AGENTS §5.2 warn）
                if (!controlled.onChange) {
                    console.warn('[vdom] useControlled 受控缺 onChange 回调——交互静默失效');
                }
                controlled.onChange?.(v);
            }
            else {
                state.value = v;
                env.requestRender();
            }
        },
    };
}
