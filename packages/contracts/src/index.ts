/**
 * Контракт сообщения в шине: уникальный идентификатор для идемпотентности на стороне consumer.
 */
export interface EventEnvelope<T = Record<string, unknown>> {
  messageId: string;
  type: string;
  payload: T;
  occurredAt: string;
}

export const NOTIFICATION_EVENT_PATTERN = 'notification.dispatch' as const;

export type TelegramNotificationPayload = {
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
};
