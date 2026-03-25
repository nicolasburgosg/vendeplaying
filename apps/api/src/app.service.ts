import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class AppService {
  constructor(private readonly database: DatabaseService) {}

  async getHealth() {
    await this.database.query('select 1');

    return {
      name: 'VendeTo API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
