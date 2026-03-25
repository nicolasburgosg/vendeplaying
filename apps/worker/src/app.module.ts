import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { DatabaseService } from './database.service';
import { WorkerService } from './worker.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [DatabaseService, AiService, WorkerService],
})
export class AppModule {}
