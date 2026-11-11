/** @module Shared locale namespace for the status-mark plugin UI.
 *
 * Keys are declared once in the Chinese source of truth; every other dictionary
 * mirrors them. DSH ships eight built-in language packs (`zh`, `en`, `ja`, `es`,
 * `fr`, `de`, `ru`, `pt` — see `packages/client/locale/src/client/index.ts:23`),
 * so all eight are registered here. A missing dictionary falls back to English
 * while the rest of the shell shows the selected language, which reads as a
 * broken translation. `t()` is re-bound on every locale switch by
 * `ui-renderer/src/client/scoped-slots.tsx:297-321`, so no extra subscription is
 * needed inside the components.
 */

/** Namespace registered into `LocaleNamespaceMap` via the client half. */
export const NS = 'sessionStatus.marker'

/** Localized text for one language; keys must match the Chinese source of truth. */
export type MarkerDict = Record<keyof typeof zh, string>

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

/** English dictionary. */
export const en: MarkerDict = {
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
}

/** Japanese dictionary. */
export const ja: MarkerDict = {
  'status.todo': '未着手',
  'status.done': '完了',
  'status.stopped': '停止',
  'status.blocked': 'ブロック',
  'status.review': 'レビュー中',
  'status.pending-subagent': 'サブエージェント実行中',
  'status.awaiting-answer': '返信待ち',
  'status.feedback': 'フィードバック',

  'hover.empty': 'このセッションにはマークがありません',
  'hover.manual': '手動マーク：{status}',
  'hover.auto': '自動推論（{reason}）：{status}',
  'hover.note': 'メモ：{note}',
  'hover.setBtn': '状態を変更',
  'hover.clearBtn': 'クリア',
  'hover.loading': '読み込み中...',
  'hover.error': '読み込みに失敗しました。再試行してください',

  'badge.aria': 'セッション状態マーカー',
}

/** Spanish dictionary. */
export const es: MarkerDict = {
  'status.todo': 'Pendiente',
  'status.done': 'Hecho',
  'status.stopped': 'Detenido',
  'status.blocked': 'Bloqueado',
  'status.review': 'En revisión',
  'status.pending-subagent': 'Subagente en curso',
  'status.awaiting-answer': 'Esperando respuesta',
  'status.feedback': 'Comentarios',

  'hover.empty': 'Esta sesión no tiene marca',
  'hover.manual': 'Marca manual: {status}',
  'hover.auto': 'Inferencia automática ({reason}): {status}',
  'hover.note': 'Nota: {note}',
  'hover.setBtn': 'Cambiar estado',
  'hover.clearBtn': 'Borrar',
  'hover.loading': 'Cargando...',
  'hover.error': 'Error al cargar, inténtelo de nuevo',

  'badge.aria': 'Marcador de estado de sesión',
}

/** French dictionary. */
export const fr: MarkerDict = {
  'status.todo': 'À faire',
  'status.done': 'Terminé',
  'status.stopped': 'Arrêté',
  'status.blocked': 'Bloqué',
  'status.review': 'En révision',
  'status.pending-subagent': 'Sous-agent en cours',
  'status.awaiting-answer': 'En attente de réponse',
  'status.feedback': 'Retour',

  'hover.empty': 'Aucune marque sur cette session',
  'hover.manual': 'Marquage manuel : {status}',
  'hover.auto': 'Inférence automatique ({reason}) : {status}',
  'hover.note': 'Note : {note}',
  'hover.setBtn': 'Changer l’état',
  'hover.clearBtn': 'Effacer',
  'hover.loading': 'Chargement...',
  'hover.error': 'Échec du chargement, réessayez',

  'badge.aria': 'Marqueur d’état de session',
}

/** German dictionary. */
export const de: MarkerDict = {
  'status.todo': 'Offen',
  'status.done': 'Erledigt',
  'status.stopped': 'Angehalten',
  'status.blocked': 'Blockiert',
  'status.review': 'In Prüfung',
  'status.pending-subagent': 'Subagent läuft',
  'status.awaiting-answer': 'Wartet auf Antwort',
  'status.feedback': 'Feedback',

  'hover.empty': 'Für diese Sitzung ist keine Markierung gesetzt',
  'hover.manual': 'Manuelle Markierung: {status}',
  'hover.auto': 'Automatisch abgeleitet ({reason}): {status}',
  'hover.note': 'Notiz: {note}',
  'hover.setBtn': 'Status ändern',
  'hover.clearBtn': 'Löschen',
  'hover.loading': 'Wird geladen...',
  'hover.error': 'Laden fehlgeschlagen, erneut versuchen',

  'badge.aria': 'Sitzungsstatus-Markierung',
}

/** Russian dictionary. */
export const ru: MarkerDict = {
  'status.todo': 'К выполнению',
  'status.done': 'Готово',
  'status.stopped': 'Остановлено',
  'status.blocked': 'Заблокировано',
  'status.review': 'На проверке',
  'status.pending-subagent': 'Подагент работает',
  'status.awaiting-answer': 'Ожидает ответа',
  'status.feedback': 'Отзыв',

  'hover.empty': 'Для этой сессии нет отметки',
  'hover.manual': 'Ручная отметка: {status}',
  'hover.auto': 'Автоопределение ({reason}): {status}',
  'hover.note': 'Примечание: {note}',
  'hover.setBtn': 'Изменить статус',
  'hover.clearBtn': 'Очистить',
  'hover.loading': 'Загрузка...',
  'hover.error': 'Не удалось загрузить, попробуйте ещё раз',

  'badge.aria': 'Маркер статуса сессии',
}

/** Portuguese dictionary. */
export const pt: MarkerDict = {
  'status.todo': 'A fazer',
  'status.done': 'Concluído',
  'status.stopped': 'Interrompido',
  'status.blocked': 'Bloqueado',
  'status.review': 'Em revisão',
  'status.pending-subagent': 'Subagente em execução',
  'status.awaiting-answer': 'Aguardando resposta',
  'status.feedback': 'Comentários',

  'hover.empty': 'Esta sessão não tem marca',
  'hover.manual': 'Marca manual: {status}',
  'hover.auto': 'Inferência automática ({reason}): {status}',
  'hover.note': 'Nota: {note}',
  'hover.setBtn': 'Alterar status',
  'hover.clearBtn': 'Limpar',
  'hover.loading': 'Carregando...',
  'hover.error': 'Falha ao carregar, tente novamente',

  'badge.aria': 'Marcador de status da sessão',
}

/** Every dictionary registered by the Client half, in the shell's display order. */
export const DICTIONARIES = { zh, en, ja, es, fr, de, ru, pt } as const

/** Typed union of all keys owned by this namespace. */
export type MarkerKey = keyof typeof zh
