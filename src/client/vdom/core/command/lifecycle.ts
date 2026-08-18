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

/** 节点挂载完成（DOM 生命周期——ref(el)——fn 经函数表引用） */
export type RefCommand = {
  op: 'ref'
  id: string
  fn: unknown
}

/** 节点卸载（DOM 生命周期——ref(null)） */
export type UnrefCommand = {
  op: 'unref'
  id: string
}

/** 组件实例初始化完成（组件生命周期——工厂已执行——实例已注册） */
export type MountCommand = {
  op: 'mount'
  compId: string
}

/** 组件卸载（组件生命周期——onUnmounts 清理——逆序执行） */
export type UnmountCommand = {
  op: 'unmount'
  compId: string
}

/** 离开子树——服务端闭合标签——客户端 no-op */
export type CloseCommand = {
  op: 'close'
  id: string
}

/** 流结束 = 渲染完成（full = 全量流标记——patch 据此清理旧树多余节点；
 *  增量流（diff）不清理——旧节点都是存活） */
export type DoneCommand = {
  op: 'done'
  full?: boolean
}
