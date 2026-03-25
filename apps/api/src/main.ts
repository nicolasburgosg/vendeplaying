import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

function getAllowedOrigins() {
  const configuredOrigins = (
    process.env.VENDETO_ALLOWED_ORIGINS ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set<string>([
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    ...configuredOrigins,
  ]);
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      rawBody: true,
    },
  );

  app.setGlobalPrefix('api');
  const allowedOrigins = getAllowedOrigins();

  app.enableCors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
    }),
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  Logger.log(`API lista en http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
