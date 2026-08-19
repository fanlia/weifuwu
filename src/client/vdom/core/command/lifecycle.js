/**
 * vdom command — lifecycle（生命周期命令——显式指令化）
 *
 * 设计（2026-12——用户决策）：生命周期动作**显式指令**——patch 读取指令
 * 时处理：
 * - ref / unref —— **DOM 节点生命周期**：
 *   ref = 节点挂载完成（insert 后——ref(el) 回调——el 已连接）；
 *   unref = 节点卸载（ref(null) 回调——子树清理）
 * - mount / unmount —— **组件生命周期**：
 *   mount = 组件实例初始化完成（工厂执行后——实例已注册）；
 *   unmount = 组件卸载（onUnmounts 清理——逆序执行——实例注册表消费）
 *
 * close = 离开子树（服务端闭合标签时机——客户端 no-op）；
 * done = 流结束 = 渲染完成。
 */
export {};
