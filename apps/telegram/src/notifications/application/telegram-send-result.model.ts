export interface TelegramSendResult {
  ok: boolean;
  telegramMessageId?: number;
  /** true — запрос к api.telegram.org не выполнялся (локальная разработка при блокировке сети) */
  mocked?: boolean;
}
