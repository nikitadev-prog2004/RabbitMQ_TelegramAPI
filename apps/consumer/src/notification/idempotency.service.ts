import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { IdempotencyPort } from './application/ports/idempotency.port';

/**
 * Идемпотентность по messageId: in-memory (по умолчанию) или Redis при REDIS_URL.
 */
@Injectable()
export class IdempotencyService implements OnModuleDestroy, IdempotencyPort {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly processed = new Set<string>();
  private readonly redis: Redis | null;
  private readonly ttlSeconds: number;
  private readonly maxEntries: number;
  private readonly keyPrefix = 'idemp:evt:';

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    this.ttlSeconds = Number(
      this.config.get<string>('REDIS_IDEMPOTENCY_TTL_SECONDS') ??
        String(7 * 24 * 3600),
    );
    this.maxEntries = Number(
      this.config.get<string>('IDEMPOTENCY_MAX_ENTRIES') ?? 50_000,
    );

    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      this.redis.on('error', (err) =>
        this.logger.error(`Redis: ${err.message}`),
      );
      this.logger.log('Idempotency: Redis');
    } else {
      this.redis = null;
      this.logger.log('Idempotency: in-memory');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) {
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  async isDuplicate(messageId: string): Promise<boolean> {
    if (this.redis) {
      const key = this.keyPrefix + messageId;
      const v = await this.redis.get(key);
      if (v) {
        this.logger.warn(`Дубликат messageId=${messageId}, пропуск обработки`);
        return true;
      }
      return false;
    }

    if (this.processed.has(messageId)) {
      this.logger.warn(`Дубликат messageId=${messageId}, пропуск обработки`);
      return true;
    }
    return false;
  }

  async markProcessed(messageId: string): Promise<void> {
    if (this.redis) {
      const key = this.keyPrefix + messageId;
      await this.redis.set(key, '1', 'EX', this.ttlSeconds);
      return;
    }

    if (this.processed.size >= this.maxEntries) {
      const first = this.processed.values().next().value as string | undefined;
      if (first !== undefined) {
        this.processed.delete(first);
      }
    }
    this.processed.add(messageId);
  }
}
