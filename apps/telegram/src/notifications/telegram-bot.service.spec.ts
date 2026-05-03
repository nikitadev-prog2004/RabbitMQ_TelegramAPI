import { EventEmitter } from 'events';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as https from 'node:https';
import { TelegramBotService } from './telegram-bot.service';

jest.mock('node:https', () => ({
  request: jest.fn(),
}));

const httpsRequest = https.request as jest.Mock;

describe('TelegramBotService', () => {
  beforeEach(() => {
    httpsRequest.mockReset();
    delete process.env.TELEGRAM_MOCK_SEND;
  });

  it('при TELEGRAM_MOCK_SEND не вызывает сеть', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => 'x',
            get: (k: string) =>
              k === 'TELEGRAM_MOCK_SEND' ? 'true' : undefined,
          },
        },
      ],
    }).compile();

    const service = module.get(TelegramBotService);
    const r = await service.sendMessage({ text: 'mock' });
    expect(r).toEqual({ ok: true, mocked: true });
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it('отправляет сообщение в Telegram API', async () => {
    httpsRequest.mockImplementation((_opts: unknown, callback: unknown) => {
      const cb = callback as (res: EventEmitter & { statusCode: number }) => void;
      const req = new EventEmitter() as EventEmitter & {
        write: jest.Mock;
        end: jest.Mock;
      };
      req.write = jest.fn();
      req.end = jest.fn(() => {
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = 200;
        process.nextTick(() => {
          cb(res);
          res.emit(
            'data',
            Buffer.from(
              JSON.stringify({ ok: true, result: { message_id: 42 } }),
            ),
          );
          res.emit('end');
        });
      });
      return req;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (k: string) =>
              k === 'TELEGRAM_BOT_TOKEN' ? 'token' : '12345',
            get: () => undefined,
          },
        },
      ],
    }).compile();

    const service = module.get(TelegramBotService);
    const r = await service.sendMessage({ text: 'hi' });
    expect(r.ok).toBe(true);
    expect(r.telegramMessageId).toBe(42);
    expect(httpsRequest).toHaveBeenCalled();
  });
});
