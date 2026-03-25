import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database.service';
import { DevController } from './dev.controller';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    AppController,
    ReadinessController,
    WebhooksController,
    DevController,
  ],
  providers: [AppService, DatabaseService, ReadinessService],
})
export class AppModule {}
