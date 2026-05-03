import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const rabbitUrl =
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@127.0.0.1:5672';
  const queue = process.env.RABBITMQ_QUEUE ?? 'notification_events';
  const rmqAutoAck = process.env.CONSUMER_RMQ_AUTO_ACK === 'true';

  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Consumer API')
    .setDescription(
      'HTTP consumer: health. Основная нагрузка — RabbitMQ (см. producer / contracts).',
    )
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue,
      queueOptions: {
        durable: true,
      },
      noAck: rmqAutoAck,
      prefetchCount: Number(process.env.RABBITMQ_PREFETCH ?? 10),
      socketOptions: {
        heartbeatIntervalInSeconds: 60,
        reconnectTimeInSeconds: 5,
      },
    },
  });

  await app.startAllMicroservices();

  const httpPort = Number(process.env.HTTP_PORT ?? 3002);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(httpPort, host);
  console.log(
    `Consumer HTTP http://127.0.0.1:${httpPort}/health (host=${host}) RMQ noAck=${rmqAutoAck}`,
  );
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
