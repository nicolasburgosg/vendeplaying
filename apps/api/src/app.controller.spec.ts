import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DatabaseService,
          useValue: {
            query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return API health data', async () => {
      await expect(appController.getHealth()).resolves.toMatchObject({
        name: 'VendeTo API',
        status: 'ok',
      });
    });
  });
});
