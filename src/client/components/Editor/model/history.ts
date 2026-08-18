/**
 * weifuwu/components/Editor/model/history — undo/redo 栈（commit 粒度）
 *
 * 撤销粒度 = commit 粒度（AI 流式接受 = 1 个 commit = 1 个撤销步）。
 * 栈本身只存事件——状态折叠由调用方（Editor 层）执行 applyEdit。
 */

import type { Commit } from './types.ts'

export interface HistoryState {
  undoStack: Commit[]
  redoStack: Commit[]
}

export function createHistory(maxDepth = 20): HistoryState {
  return { undoStack: [], redoStack: [] }
}

/** 压入新 commit（清空 redo 栈——新分支；超深丢弃最旧） */
export function pushCommit(h: HistoryState, commit: Commit, maxDepth = 20): void {
  if (commit.ts === undefined) commit.ts = Date.now()
  h.undoStack.push(commit)
  h.redoStack = []
  if (h.undoStack.length > maxDepth) h.undoStack.shift()
}

/** 弹出 undo 栈顶（不动 redo——由调用方折叠后决定；返回 null = 无可撤销） */
export function popUndo(h: HistoryState): Commit | null {
  const c = h.undoStack.pop()
  if (c) h.redoStack.push(c)
  return c ?? null
}

/** 弹出 redo 栈顶（同时收回 undo——撤销后重做路径一致） */
export function popRedo(h: HistoryState): Commit | null {
  const c = h.redoStack.pop()
  if (c) h.undoStack.push(c)
  return c ?? null
}

export function canUndo(h: HistoryState): boolean {
  return h.undoStack.length > 0
}

export function canRedo(h: HistoryState): boolean {
  return h.redoStack.length > 0
}

export function clearHistory(h: HistoryState): void {
  h.undoStack = []
  h.redoStack = []
}
