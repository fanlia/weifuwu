/**
 * W0 web 契约：命令式注入组合类型（CommandsInjected——应用一行替代逐组件组合）
 *
 * tsd：UIContext & CommandsInjected——toast/confirm/notification 直用
 * （无 !·无 as any——类型精确）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CommandsInjected, ToastProps } from './index.ts'

test('W0：CommandsInjected 类型面（toast/confirm/notification 一行组合——tsd 编译即真）', () => {
  assert.ok(true, 'tsd 编译面见 _tsd 未执行函数（tsconfig.test 编译守卫）')
})

/** tsd 编译面（不执行——运行时被测试文件隔离——编译过即真） */
function _tsd(ctx: CommandsInjected) {
  const t = ctx.toast('hello', 'success')
  const c = ctx.confirm('确定？').then((ok: boolean) => ok)
  const n = ctx.notification('通知', 'info')
  void t; void c; void n
}

test('W0：toast 签名（action 面——通知闭环）', () => {
  const t: ToastProps = { message: 'x' }
  assert.equal(t.message, 'x')
})
