import { WorkerService } from './worker.service';

describe('WorkerService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('inicia sin errores', async () => {
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockImplementation((() => 1) as unknown as typeof setInterval);
    const clearIntervalSpy = jest
      .spyOn(global, 'clearInterval')
      .mockImplementation(() => undefined);

    const service = new WorkerService(
      {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      } as never,
      {
        summarizeConversation: jest.fn(),
      } as never,
    );

    service.start();
    await Promise.resolve();
    service.onModuleDestroy();

    expect(setIntervalSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
