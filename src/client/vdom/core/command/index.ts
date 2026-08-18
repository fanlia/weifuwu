/**
 * vdom command — index（命令汇总——统一导出 + 判定）
 *
 * 命令集 = 修改 DOM 的全部动作（流元素——纯数据——自足不依赖 vn 引用——
 * 可序列化/可流——NDJSON 传输）。
 */

import type { CreateCommand, CreateTextCommand, CreateAnchorCommand } from './create.ts'
import type { InsertCommand, RemoveCommand } from './insert.ts'
import type { SetPropCommand, SetTextCommand } from './props.ts'
import type { RefCommand, UnrefCommand, MountCommand, UnmountCommand, CloseCommand, DoneCommand } from './lifecycle.ts'

export type {
  CreateCommand, CreateTextCommand, CreateAnchorCommand,
  InsertCommand, RemoveCommand,
  SetPropCommand, SetTextCommand,
  RefCommand, UnrefCommand, MountCommand, UnmountCommand,
  CloseCommand, DoneCommand,
}

/** 渲染指令（流元素——修改 DOM 的最小操作集） */
export type Command =
  | CreateCommand
  | CreateTextCommand
  | CreateAnchorCommand
  | InsertCommand
  | RemoveCommand
  | SetPropCommand
  | SetTextCommand
  | RefCommand
  | UnrefCommand
  | MountCommand
  | UnmountCommand
  | CloseCommand
  | DoneCommand

/** 命令名（调试/审计——op 类型收窄） */
export type CommandOp = Command['op']
