import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as https from 'node:https';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { TelegramDeliveryPort } from './application/ports/telegram-delivery.port';
import type { TelegramSendResult } from './application/telegram-send-result.model';
import { SendNotificationDto } from './dto/send-notification.dto';

export type { TelegramSendResult } from './application/telegram-send-result.model';

function envTruthy(v: string | undefined): boolean {
  if (!v?.trim()) return false;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function isMockSend(config: ConfigService): boolean {
  return (
    envTruthy(process.env.TELEGRAM_MOCK_SEND) ||
    envTruthy(config.get<string>('TELEGRAM_MOCK_SEND'))
  );
}

const TELEGRAM_TIMEOUT_MS = Number(
  process.env.TELEGRAM_HTTP_TIMEOUT_MS ?? 30_000,
);

/** Сборка URL из отдельных полей — надёжнее, чем одна строка с паролем (спецсимволы, # в .env). */
function buildProxyUrlFromParts(config: ConfigService): string | undefined {
  const host =
    process.env.TELEGRAM_PROXY_HOST?.trim() ||
    config.get<string>('TELEGRAM_PROXY_HOST')?.trim();
  const port =
    process.env.TELEGRAM_PROXY_PORT?.trim() ||
    config.get<string>('TELEGRAM_PROXY_PORT')?.trim();
  if (!host || !port) {
    return undefined;
  }
  const user =
    process.env.TELEGRAM_PROXY_USER?.trim() ||
    config.get<string>('TELEGRAM_PROXY_USER')?.trim() ||
    '';
  const passRaw =
    process.env.TELEGRAM_PROXY_PASSWORD ??
    config.get<string>('TELEGRAM_PROXY_PASSWORD') ??
    '';
  const pass = String(passRaw).trim();
  if (user || pass) {
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  return `http://${host}:${port}`;
}

function redactProxyForLog(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl);
    if (u.password) {
      u.password = '***';
    }
    return u.toString();
  } catch {
    return '[proxy URL]';
  }
}

function resolveProxyUrl(config: ConfigService): string | undefined {
  const single =
    process.env.TELEGRAM_HTTPS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    config.get<string>('TELEGRAM_HTTPS_PROXY')?.trim() ||
    config.get<string>('HTTPS_PROXY')?.trim() ||
    config.get<string>('HTTP_PROXY')?.trim();
  if (single) {
    return single;
  }
  return buildProxyUrlFromParts(config);
}

function createOutboundAgent(proxyUrl: string): https.Agent {
  const protocol = new URL(proxyUrl).protocol.toLowerCase();
  if (protocol === 'socks5:' || protocol === 'socks4:') {
    return new SocksProxyAgent(proxyUrl) as unknown as https.Agent;
  }
  return new HttpsProxyAgent(proxyUrl) as unknown as https.Agent;
}

function postJsonHttps(
  url: string,
  jsonBody: string,
  agent?: https.Agent,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(jsonBody, 'utf8'),
        },
        timeout: TELEGRAM_TIMEOUT_MS,
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('error', (err: NodeJS.ErrnoException) => {
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout after ${TELEGRAM_TIMEOUT_MS}ms`));
    });

    req.write(jsonBody, 'utf8');
    req.end();
  });
}

@Injectable()
export class TelegramBotService implements TelegramDeliveryPort {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly outboundAgent: https.Agent | undefined;
  private readonly mockSend: boolean;

  constructor(private readonly config: ConfigService) {
    this.mockSend = isMockSend(config);
    if (this.mockSend) {
      this.logger.warn(
        'TELEGRAM_MOCK_SEND включён — ответы API будут успешными без реальной отправки в Telegram. Для боевого режима: false + VPN/TELEGRAM_HTTPS_PROXY.',
      );
      return;
    }
    const proxy = resolveProxyUrl(config);
    if (proxy) {
      try {
        this.outboundAgent = createOutboundAgent(proxy);
        this.logger.log(
          `Telegram API: исходящий трафик через прокси ${redactProxyForLog(proxy)}`,
        );
      } catch (e) {
        this.logger.error(
          `Некорректный TELEGRAM_HTTPS_PROXY / TELEGRAM_PROXY_*: ${e instanceof Error ? e.message : e}`,
        );
        this.logger.warn(
          'Прокси не применён — проверьте переменные или используйте TELEGRAM_PROXY_HOST/PORT/USER/PASSWORD.',
        );
      }
    } else {
      this.logger.warn(
        'TELEGRAM_HTTPS_PROXY не задан — прямое подключение к api.telegram.org. При ETIMEDOUT: VPN/прокси в .env или TELEGRAM_MOCK_SEND=true для теста без сети до Telegram.',
      );
    }
  }

  async sendMessage(dto: SendNotificationDto): Promise<TelegramSendResult> {
    if (this.mockSend) {
      this.logger.log(
        `[MOCK] уведомление не отправлено в Telegram: "${dto.text.slice(0, 200)}${dto.text.length > 200 ? '…' : ''}"`,
      );
      return { ok: true, mocked: true };
    }

    const token = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    const defaultChatId = this.config
      .getOrThrow<string>('TELEGRAM_CHAT_ID')
      .trim();
    const chatId = String(dto.chatId ?? defaultChatId).trim();

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: dto.text,
    };
    if (dto.parseMode) {
      body.parse_mode = dto.parseMode;
    }

    const jsonBody = JSON.stringify(body);

    let statusCode: number;
    let raw: string;
    try {
      try {
        const r = await postJsonHttps(url, jsonBody, this.outboundAgent);
        statusCode = r.statusCode;
        raw = r.body;
      } catch (firstErr) {
        const fe = firstErr as NodeJS.ErrnoException;
        if (this.outboundAgent && fe.code === 'ECONNREFUSED') {
          this.logger.warn(
            `Прокси отклонил соединение (${fe.message}). Повтор без прокси — убедитесь, что Clash слушает порт из TELEGRAM_HTTPS_PROXY, или удалите эту строку из .env.`,
          );
          const r = await postJsonHttps(url, jsonBody, undefined);
          statusCode = r.statusCode;
          raw = r.body;
        } else {
          throw firstErr;
        }
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      const code = e.code ? ` (${e.code})` : '';
      const hint =
        'Не удалось связаться с api.telegram.org. Варианты: (1) запустить Clash/VPN и задать TELEGRAM_HTTPS_PROXY с портом из netstat; (2) при блокировке без прокси — TELEGRAM_MOCK_SEND=true в .env для теста API без реальной доставки в Telegram.';
      this.logger.error(`${hint} ${e.message}${code}`, e.stack);
      throw new BadGatewayException(`${hint} Детали: ${e.message}${code}`);
    }

    let json: {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };
    try {
      json = JSON.parse(raw) as typeof json;
    } catch {
      this.logger.error(`Некорректный JSON от Telegram: ${raw.slice(0, 500)}`);
      throw new BadGatewayException(
        `Telegram вернул не-JSON (HTTP ${statusCode}).`,
      );
    }

    if (statusCode < 200 || statusCode >= 300 || !json.ok) {
      const desc = json.description ?? raw.slice(0, 200);
      this.logger.error(`Telegram API error: ${statusCode} ${desc}`);
      if (/chat not found/i.test(desc)) {
        throw new BadRequestException(
          `${desc}. Проверьте TELEGRAM_CHAT_ID в .env: это ваш числовой id в Telegram (не @username и не номер телефона). Откройте бота и нажмите «Start», затем узнайте id через @userinfobot или getUpdates.`,
        );
      }
      throw new BadRequestException(desc || `Telegram HTTP ${statusCode}`);
    }

    this.logger.log(
      `Отправлено в Telegram: messageId=${dto.messageId ?? 'n/a'} telegramMessageId=${json.result?.message_id}`,
    );

    return {
      ok: true,
      telegramMessageId: json.result?.message_id,
    };
  }
}
