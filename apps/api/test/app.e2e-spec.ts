import { Test, TestingModule } from '@nestjs/testing';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Response } from 'supertest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((response: Response) => {
        const body = response.body as {
          name: string;
          status: string;
          timestamp: string;
        };
        expect(body.name).toBe('VendeTo API');
        expect(body.status).toBe('ok');
        expect(typeof body.timestamp).toBe('string');
      });
  });
});
