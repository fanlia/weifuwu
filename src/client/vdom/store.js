/**
 * vdom store — createStore（共享状态原语——跨组件状态）
 *
 * 设计（AGENTS §4.5——render-only 无响应式引擎）：
 * - state = 普通对象（**非 Proxy**——无 set trap 无隐式 dirty）
 * - set(partial) 合并写 + notify；update(fn) 可变写 + notify；notify() 手动
 * - subscribe(cb) → 退订函数（useExternal 订阅——unmount 自动退订）
 * - **触发渲染**：订阅方（useExternal——store 变化 → 组件重渲染）——
 *   写者不直接渲染（高频 notify 由写者控制频率）
 */
export function createStore(init) {
    const subs = new Set();
    let state = init;
    const notify = () => {
        for (const cb of [...subs])
            cb();
    };
    return {
        get state() {
            return state;
        },
        subscribe(cb) {
            subs.add(cb);
            return () => { subs.delete(cb); };
        },
        set(partial) {
            state = { ...state, ...partial };
            notify();
        },
        update(fn) {
            fn(state);
            notify();
        },
        notify,
    };
}
