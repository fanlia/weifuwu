/**
 * vdom command — lifecycle（生命周期命令）
 *
 * close = 离开子树（服务端闭合标签时机——客户端 no-op）；
 * unmountComp = 组件卸载（onUnmounts 清理——逆序执行——注册表消费）；
 * done = 流结束 = 渲染完成。
 */

/** 离开子树——服务端闭合标签——客户端 no-op */
export type CloseCommand = {
  op: 'close'
  id: string
}

/** 组件卸载（onUnmounts 清理——ctx.onUnmount 注册的回调） */
export type UnmountCompCommand = {
  op: 'unmountComp'
  compId: string
}

/** 流结束 = 渲染完成 */
export type DoneCommand = {
  op: 'done'
}
