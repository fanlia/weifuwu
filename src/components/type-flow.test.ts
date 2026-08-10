/**
 * 组件层类型流测试（编译期验证）——props 泛型 / 字面量联合 / 回调签名 / ctx 注入。
 *
 * 运行方式：断言由 `tsc --noEmit` 保证（`@ts-expect-error` 行若类型错误消失则 tsc 报错）。
 * 运行时测试仅验证类型导入不抛错。新增组件/改 props 类型时，在此补正负例。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── 类型导入（负例断言由 tsc 保证）──────────────
import type { ButtonProps } from './Button/Button.ts'
import type { TableProps } from './Table/Table.ts'
import type { SelectProps } from './Select/Select.ts'
import type { DatePickerProps } from './DatePicker/DatePicker.ts'
import type { ModalProps } from './Modal/Modal.ts'
import type { TreeProps } from './Tree/Tree.ts'
import type { Component } from '../ui-dom/vnode.ts'
import type { UsePopupOptions } from '../ui-dom/types.ts'

// ① 负例：字面量联合 props 传错值 → 编译期报错
// @ts-expect-error variant 不允许 'bogus'（仅 primary/secondary/ghost/danger）
const badVariant: ButtonProps = { variant: 'bogus' }

// @ts-expect-error size 不允许 'xl'（仅 sm/md/lg）
const badSize: ButtonProps = { size: 'xl' }

// ② 负例：必填字段缺失（TableColumn 必须含 label）
// @ts-expect-error TableColumn 缺 label 必填字段
const badCols: TableProps = { columns: [{ key: 'id' }], data: [] }

// ③ 负例：回调签名类型不符
// @ts-expect-error Select onChange 接收 string|string[]，传 number 参数不兼容
const badSelectChange: SelectProps = { options: [], onChange: (v: number) => {} }

// @ts-expect-error Table onSort 的 order 仅 'asc'|'desc'
const badSort: TableProps = {
  columns: [{ key: 'id', label: 'ID' }],
  data: [],
  onSort: (key: string, order: 'up' | 'down') => {},
}

// @ts-expect-error DatePicker mode 仅 date/datetime/time/range
const badMode: DatePickerProps = { mode: 'week' }

// ④ 负例：ctx 注入未声明字段（C 泛型真实生效）
const NoInjected: Component<{}, {}> = (_init, ctx) => {
  // @ts-expect-error C 泛型未声明 i18n，访问应报错
  ctx.i18n
  return () => null
}

// ⑤ 负例：移动端 usePopup trigger 字面量
// @ts-expect-error trigger 仅 hover/click/longpress
const badTrigger: UsePopupOptions = { trigger: 'swipe', el: () => null, isOpen: () => false, setOpen: () => {} }

// ⑥ 正例：合法用法编译通过（tsc 不报错即通过）
const okButton: ButtonProps = { variant: 'primary', size: 'lg', block: true, children: '保存' }
const okTable: TableProps = {
  columns: [{ key: 'id', label: 'ID', width: 60 }, { key: 'name', label: '名称', sortable: true }],
  data: [{ id: 1, name: 'a' }],
  sortKey: 'id',
  sortOrder: 'asc',
  onSort: (key, order) => { void key; void order },
}
const okSelect: SelectProps = { options: [{ value: 'a', label: 'A' }], value: 'a', onChange: (v) => { void v } }
const okDate: DatePickerProps = { mode: 'range', value: '2025-01-01', onChange: (v) => { void v } }
const okModal: ModalProps = { open: true, title: '提示', onClose: () => {}, children: '内容' }
const okTree: TreeProps = {
  data: [{ key: '1', label: '根' }],
  checkable: true,
  checkedKeys: ['1'],
  onChange: (keys) => { void keys },
}

// ⑦ 正例：受控 props 缺回调不报类型错（运行期 warn，编译期合法——组件库约定）
const okControlledNoCb: TreeProps = { data: [{ key: '1', label: '根' }], checkable: true, checkedKeys: ['1'] }

describe('components type flow (compile-time)', () => {
  it('字面量联合 props 类型可导入', () => {
    assert.equal(typeof okButton, 'object')
    assert.equal(typeof okTable, 'object')
    assert.equal(typeof okSelect, 'object')
    assert.equal(typeof okDate, 'object')
    assert.equal(typeof okModal, 'object')
    assert.equal(typeof okTree, 'object')
    // 运行时负例变量不参与执行（tsc 已拦截），仅确保文件被类型检查
    void badVariant; void badSize; void badCols; void badSelectChange; void badSort; void badMode
    void badTrigger; void okControlledNoCb
  })
})
