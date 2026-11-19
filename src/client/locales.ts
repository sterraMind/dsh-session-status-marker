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

  // Non-hover row action and row menu entry
  'action.aria': '设置会话状态',
  'action.trigger': '状态',
  'action.error': '设置失败，请重试',
  'menu.setStatus': '设置状态',

  // General
  'badge.aria': '会话状态标记',

  // Status overview settings page
  'overview.nav': '会话状态',
  'overview.title': '会话状态总览',
  'overview.empty': '暂无已标记的会话',
  'overview.count': '{count}',
  'overview.updatedAt': '更新于 {time}',
  'overview.noTitle': '未命名会话',
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

  'action.aria': 'Set session status',
  'action.trigger': 'Status',
  'action.error': 'Failed to set status, try again',
  'menu.setStatus': 'Set status',

  'badge.aria': 'Session status marker',

  'overview.nav': 'Session status',
  'overview.title': 'Session status overview',
  'overview.empty': 'No marked sessions',
  'overview.count': '{count}',
  'overview.updatedAt': 'Updated {time}',
  'overview.noTitle': 'Untitled session',
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

  'action.aria': 'セッションの状態を設定',
  'action.trigger': '状態',
  'action.error': '状態を設定できませんでした。再試行してください',
  'menu.setStatus': '状態を設定',

  'badge.aria': 'セッション状態マーカー',

  'overview.nav': 'セッション状態',
  'overview.title': 'セッション状態の概要',
  'overview.empty': 'マークされたセッションはありません',
  'overview.count': '{count}',
  'overview.updatedAt': '更新: {time}',
  'overview.noTitle': '無題セッション',
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

  'action.aria': 'Establecer estado de la sesión',
  'action.trigger': 'Estado',
  'action.error': 'No se pudo establecer el estado, inténtelo de nuevo',
  'menu.setStatus': 'Establecer estado',

  'badge.aria': 'Marcador de estado de sesión',

  'overview.nav': 'Estado de sesión',
  'overview.title': 'Resumen de estado de sesiones',
  'overview.empty': 'No hay sesiones marcadas',
  'overview.count': '{count}',
  'overview.updatedAt': 'Actualizado {time}',
  'overview.noTitle': 'Sesión sin título',
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

  'action.aria': 'Définir l’état de la session',
  'action.trigger': 'État',
  'action.error': 'Échec de la définition de l’état, réessayez',
  'menu.setStatus': 'Définir l’état',

  'badge.aria': 'Marqueur d’état de session',

  'overview.nav': 'État des sessions',
  'overview.title': 'Aperçu de l’état des sessions',
  'overview.empty': 'Aucune session marquée',
  'overview.count': '{count}',
  'overview.updatedAt': 'Mis à jour {time}',
  'overview.noTitle': 'Session sans titre',
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

  'action.aria': 'Sitzungsstatus festlegen',
  'action.trigger': 'Status',
  'action.error': 'Status konnte nicht festgelegt werden, erneut versuchen',
  'menu.setStatus': 'Status festlegen',

  'badge.aria': 'Sitzungsstatus-Markierung',

  'overview.nav': 'Sitzungsstatus',
  'overview.title': 'Übersicht des Sitzungsstatus',
  'overview.empty': 'Keine markierten Sitzungen',
  'overview.count': '{count}',
  'overview.updatedAt': 'Aktualisiert {time}',
  'overview.noTitle': 'Sitzung ohne Titel',
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

  'action.aria': 'Установить статус сессии',
  'action.trigger': 'Статус',
  'action.error': 'Не удалось установить статус, попробуйте ещё раз',
  'menu.setStatus': 'Установить статус',

  'badge.aria': 'Маркер статуса сессии',

  'overview.nav': 'Статус сессий',
  'overview.title': 'Обзор статуса сессий',
  'overview.empty': 'Нет отмеченных сессий',
  'overview.count': '{count}',
  'overview.updatedAt': 'Обновлено {time}',
  'overview.noTitle': 'Сессия без названия',
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

  'action.aria': 'Definir status da sessão',
  'action.trigger': 'Status',
  'action.error': 'Falha ao definir o status, tente novamente',
  'menu.setStatus': 'Definir status',

  'badge.aria': 'Marcador de status da sessão',

  'overview.nav': 'Status da sessão',
  'overview.title': 'Visão geral do status das sessões',
  'overview.empty': 'Nenhuma sessão marcada',
  'overview.count': '{count}',
  'overview.updatedAt': 'Atualizado {time}',
  'overview.noTitle': 'Sessão sem título',
}

/** Every dictionary registered by the Client half, in the shell's display order. */
export const DICTIONARIES = { zh, en, ja, es, fr, de, ru, pt } as const

/** Typed union of all keys owned by this namespace. */
export type MarkerKey = keyof typeof zh
