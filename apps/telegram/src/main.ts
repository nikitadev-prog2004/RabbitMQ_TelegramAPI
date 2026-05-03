import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { AppModule } from './app.module';

/** До Nest: корень монорепо и cwd — чтобы TELEGRAM_HTTPS_PROXY всегда был в process.env */
loadEnv({ path: join(process.cwd(), '.env') });
loadEnv({ path: join(__dirname, '..', '..', '..', '.env'), override: true });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Telegram Notification API')
    .setDescription('Приём событий и отправка уведомлений через Telegram Bot API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.TELEGRAM_PORT ?? process.env.PORT ?? 3003);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`Telegram API listening on http://127.0.0.1:${port} (host=${host})`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
