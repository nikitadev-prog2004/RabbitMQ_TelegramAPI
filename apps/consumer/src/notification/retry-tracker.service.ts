import { Injectable } from '@nestjs/common';

/** Учёт попыток обработки для решения nack(requeue). */
@Injectable()
export class RetryTrackerService {
  private readonly failures = new Map<string, number>();

  nextAttempt(messageId: string): number {
    const n = (this.failures.get(messageId) ?? 0) + 1;
    this.failures.set(messageId, n);
    return n;
  }

  reset(messageId: string): void {
    this.failures.delete(messageId);
  }

  shouldRequeue(messageId: string, maxRetries: number): boolean {
    const n = this.failures.get(messageId) ?? 0;
    return n < maxRetries;
  }
}
