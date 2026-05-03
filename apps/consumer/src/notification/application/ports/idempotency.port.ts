/** Порт: учёт обработанных messageId (идемпотентность). */
export interface IdempotencyPort {
  isDuplicate(messageId: string): Promise<boolean>;
  markProcessed(messageId: string): Promise<void>;
}
