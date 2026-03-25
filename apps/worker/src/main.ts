import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WorkerService } from './worker.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();

  const worker = app.get(WorkerService);
  worker.start();
}

void bootstrap();
