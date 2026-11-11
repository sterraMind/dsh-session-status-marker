/** @module Shared locale namespace for the status-mark plugin UI.
 *
 * Keys are declared once in the Chinese source of truth; English mirrors them.
 * Every key used by any slot component must appear here — otherwise `t()` at
 * runtime falls back through the registry's fallback chain, and the static
 * typed form rejects unknown keys.
 */

/** Namespace registered into `LocaleNamespaceMap` via the client half. */
export const NS = 'sessionStatus.marker'

/** Simplified Chinese dictionary (source of truth). */
export const zh = {
  // Status labels
  'status.todo': '待办',
  'status.done': '已完成',
  'status.stopped': '已停止',
  'status.blocked': '受阻',
  'status.review': '审查中',
  'status.pending-subagent': '子代理进行中',
  'status.awaiting-answer': '等待回复',
  'status.feedback': '反馈',

  // Hover card
  'hover.empty': '此会话暂无标记',
  'hover.manual': '手动标记：{status}',
  'hover.auto': '自动推断（{reason}）：{status}',
  'hover.note': '备注：{note}',
  'hover.setBtn': '修改状态',
  'hover.clearBtn': '清除',
  'hover.loading': '加载中...',
  'hover.error': '加载失败，请重试',

  // General
  'badge.aria': '会话状态标记',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<keyof typeof zh, string> = {
  'status.todo': 'TODO',
  'status.done': 'Done',
  'status.stopped': 'Stopped',
  'status.blocked': 'Blocked',
  'status.review': 'Review',
  'status.pending-subagent': 'Subagent running',
  'status.awaiting-answer': 'Awaiting answer',
  'status.feedback': 'Feedback',

  'hover.empty': 'No mark on this session',
  'hover.manual': 'Manual: {status}',
  'hover.auto': 'Auto-inferred ({reason}): {status}',
  'hover.note': 'Note: {note}',
  'hover.setBtn': 'Change status',
  'hover.clearBtn': 'Clear',
  'hover.loading': 'Loading...',
  'hover.error': 'Load failed, try again',

  'badge.aria': 'Session status marker',
} as const

/** Typed union of all keys owned by this namespace. */
export type MarkerKey = keyof typeof zh
