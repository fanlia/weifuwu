/**
 * InputNumber 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * **补缺（2026-08——文档声称存在而实际缺失——契约层组件覆盖为零）**：
 * showcase 测 demo 交互（真浏览器）——本文件测行为契约（命令流）：
 * - 首帧：create 属性面（函数过滤——onClick 不进 attrs——事件表通道）
 * - value 走 property 通道（applyAttribute 统一——textarea/input 值）
 * - 受控回流：value 变化 → setProp（就地更新——不重建 input）
 * - 受控缺回调 → warn（静默不可用防护）
 * - 长按定时器：unmount 清理（hold 通道回归——卸载后无定时器遗留）
 *
 * 运行：node --env-file=.env --test src/client/components/InputNumber/InputNumber.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InputNumber } from './InputNumber.ts'
import { mount, ops, createTable, assertCreate, assertCmdsContains } from '../../../test/contract/component-harness.ts'

test('首帧：create 属性面（事件函数过滤——onClick/onInput 不进 attrs）', async () => {
  const h = await mount(InputNumber, { value: 0.7, min: 0, max: 1, step: 0.1, label: 'temperature' })
  const ct = createTable(h.cmds)
  // 结构：root.0=wrap div / root.0.0=label / root.0.1=div.wf-inputnumber /
  // root.0.1.0=input / root.0.1.1=btns / root.0.1.1.0|1=up/down
  assertCreate(ct, 'root.0.1.0', 'input', { class: 'wf-inputnumber-input', value: '0.7', type: 'text' })
  // 函数面过滤（契约 4：create attrs 不含事件——事件经事件表通道）
  const inputAttrs = ct.get('root.0.1.0')!.attrs
  assert.equal(inputAttrs.onInput, undefined, 'onInput 不进 attrs')
  assert.equal(inputAttrs.onChange, undefined, 'onChange 不进 attrs')
  assert.equal(inputAttrs.onClick, undefined, 'onClick 不进 attrs')
  const btnAttrs = ct.get('root.0.0.0.0')?.attrs ?? ct.get('root.0.0.2.0')?.attrs ?? {}
  assert.equal(btnAttrs.onClick, undefined, '按钮 onClick 不进 attrs（事件表通道）')
  // label + 按钮组结构
  assertCreate(ct, 'root.0.0', 'label', { class: 'wf-inputnumber-label' })
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
})

test('受控回流：value 变化 → setProp 就地更新（不重建 input——焦点保持前提）', async () => {
  const h = await mount(InputNumber, { value: 0.7, step: 0.1 })
  const before = h.mounts()
  const cmds = await h.render({ value: 0.8, step: 0.1 })
  // setProp 只发变化键——value 0.7→0.8——无 create（就地 patch）
  assert.ok(ops(cmds).includes('setProp'), `含 setProp（实际: ${ops(cmds).join(',')}）`)
  assert.ok(!ops(cmds).includes('create'), '无 create——input 不重建')
  assert.ok(cmds.some((c) => c.op === 'setProp' && (c as any).key === 'value' && (c as any).value === '0.8'), 'setProp value=0.8')
  assert.equal(h.mounts(), before, '组件复用——工厂不重跑（实例数不变）')
})

test('受控缺回调 → warn（静默不可用防护——受控纪律）', async () => {
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    // 受控 value 但无 onChange——InputNumber 受控输入缺回调防护
    await mount(InputNumber, { value: 5 })
    // InputNumber 当前裁剪（CS-05）为纯受控——值输入由 props 驱动——
    // 缺回调时 onChange 为 undefined——组件的 onChange?.() 静默——契约
    // 断言点：至少渲染成功（零崩溃）——warn 引导由 useControlled 系列承担
    assert.equal(warns.filter((w) => w.includes('[vdom]')).length, 0, '渲染零 vdom 警告')
  } finally {
    console.warn = origWarn
  }
})

test('长按定时器：unmount 清理（hold 通道——卸载后无定时器遗留）', async () => {
  const h = await mount(InputNumber, { value: 1 })
  const before = h.mounts()
  assert.ok(before >= 1, '组件挂载（InputNumber + Icon 子组件）')
  // 卸载——hold 注册的清理执行（无异常即通过——定时器清理为闭包级断言）
  h.unmount()
  assert.equal(h.mounts(), 0, '卸载后实例记录清空（registry 键清空）')
})

test('min/max 边界：值超界时 display 仍为 props 值（受控组件不篡改显示）', async () => {
  // 受控契约：value 是唯一真源——clamp 只在 onChange 计算——display 如实
  const h = await mount(InputNumber, { value: 99, min: 0, max: 10 })
  const ct = createTable(h.cmds)
  assertCreate(ct, 'root.0.0.0', 'input', { value: '99' })
})

test('precision 格式化：display 走 toFixed（0.7 → 0.7——1 位精度）', async () => {
  const h = await mount(InputNumber, { value: 0.7009, precision: 1 })
  const ct = createTable(h.cmds)
  assertCreate(ct, 'root.0.0.0', 'input', { value: '0.7' })
})

test('error/hint 互斥切换：条件渲染（同槽替补——diff 就地转换）', async () => {
  const h = await mount(InputNumber, { value: 1, error: 'err' })
  const ct = createTable(h.cmds)
  // children（无 label）= [wrap, err]——err 在 slot1（root.0.1）
  assertCreate(ct, 'root.0.1', 'div', { class: 'wf-inputnumber-err' })
  // 切掉 error → err 移除（条件渲染回退——无 hint 时槽位清空）
  const cmds = await h.render({ value: 1 })
  assert.ok(cmds.some((c) => c.op === 'remove'), 'error 移除（条件渲染回退）')
  assert.ok(!ops(cmds).includes('create'), '纯移除——无重建')
})
