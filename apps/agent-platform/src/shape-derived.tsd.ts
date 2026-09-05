/**
 * W0 fullstack tsd 断言——编译面（平台 tsc 0 即真——运行时零引用：
 * 独立文件不 import 链——不进 server bundle）。
 *
 * 断言语义：Agent/Department 派生面字段精确（与 SHAPES 同构——无漂移手写）。
 */
import type { RowOf } from 'weifuwu'
import { SHAPES } from './db/shapes.ts'

export type AgentRow = RowOf<typeof SHAPES.agents>
export type DepartmentRow = RowOf<typeof SHAPES.departments>

declare const agent: AgentRow
declare const dept: DepartmentRow

// 字段语义精确（或门——type 枚举 · human_in_the_loop 可空 · pk 字符串）
const name: string = agent.name
const type: 'ai' | 'user' | 'webhook' | 'knowledge_base' | 'department' = agent.type
const hilt: boolean | null = agent.human_in_the_loop
const appId: string = agent.app_id
const deptName: string = dept.name
// @ts-expect-error —— 后端 shape 无 description（死字段消灭——前端曾双写）
dept.description
void name; void type; void hilt; void appId; void deptName
