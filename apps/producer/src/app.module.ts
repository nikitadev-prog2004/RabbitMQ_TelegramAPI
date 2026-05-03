import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // cwd может быть корнем монорепо или apps/producer — подхватываем .env откуда угодно
      envFilePath: [
        join(process.cwd(), '.env'),
        join(__dirname, '../../..', '.env'),
      ],
    }),
    EventsModule,
  ],
})
export class AppModule {}
