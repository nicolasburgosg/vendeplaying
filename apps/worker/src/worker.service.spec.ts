import { WorkerService } from './worker.service';

function buildService(overrides?: {
  database?: Record<string, jest.Mock>;
  aiService?: Record<string, jest.Mock>;
}) {
  return new WorkerService(
    {
      createListenerClient:
        overrides?.database?.createListenerClient ??
        jest.fn().mockRejectedValue(new Error('disabled in test')),
      query: overrides?.database?.query ?? jest.fn().mockResolvedValue({ rows: [] }),
      withTransaction:
        overrides?.database?.withTransaction ??
        jest.fn().mockImplementation(async (callback) =>
          callback({
            query: jest.fn().mockResolvedValue({ rows: [] }),
          }),
        ),
    } as never,
    {
      summarizeConversation: overrides?.aiService?.summarizeConversation ?? jest.fn(),
      tryBuildGreetingFastReply:
        overrides?.aiService?.tryBuildGreetingFastReply ?? jest.fn(),
      shouldLoadCatalogContext:
        overrides?.aiService?.shouldLoadCatalogContext ?? jest.fn(),
      generateSellerReply:
        overrides?.aiService?.generateSellerReply ?? jest.fn(),
    } as never,
  );
}

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

    const service = buildService();

    service.start();
    await Promise.resolve();
    await service.onModuleDestroy();

    expect(setIntervalSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('clasifica wakeups de reply vs background', () => {
    const service = buildService() as any;

    expect(
      service.resolveLaneWakeTargets(
        JSON.stringify({
          organizationId: 'org-1',
          jobType: 'send_whatsapp_message',
          action: null,
        }),
      ),
    ).toEqual(['reply']);

    expect(
      service.resolveLaneWakeTargets(
        JSON.stringify({
          organizationId: 'org-1',
          jobType: 'generic',
          action: 'auto_reply_inbound',
        }),
      ),
    ).toEqual(['reply']);

    expect(
      service.resolveLaneWakeTargets(
        JSON.stringify({
          organizationId: 'org-1',
          jobType: 'generic',
          action: 'refresh_conversation_summary',
        }),
      ),
    ).toEqual(['background']);
  });

  it('deja el mensaje queued en retryable non-final', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      withTransaction: jest.fn(),
    };
    const service = buildService({ database }) as any;

    const result = await service.persistDeliveryFailure({
      organizationId: 'org-1',
      message: {
        id: 'msg-1',
        conversation_id: 'conv-1',
        channel_id: 'chan-1',
        current_status: 'queued',
      },
      mode: 'queued_retry',
      finalQueuedAttempt: false,
      result: {
        kind: 'retryable_error',
        errorCode: '429',
        errorTitle: 'kapso_rate_limit',
        errorMessage: 'retry later',
        elapsedMs: 10,
        payload: { code: 429 },
      },
    });

    expect(result.kind).toBe('retryable_error');
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('marca failed en retryable final', async () => {
    const txQuery = jest.fn().mockResolvedValue({ rows: [] });
    const database = {
      query: jest.fn(),
      withTransaction: jest.fn().mockImplementation(async (callback) =>
        callback({
          query: txQuery,
        }),
      ),
    };
    const service = buildService({ database }) as any;

    const result = await service.persistDeliveryFailure({
      organizationId: 'org-1',
      message: {
        id: 'msg-1',
        conversation_id: 'conv-1',
        channel_id: 'chan-1',
        current_status: 'queued',
      },
      mode: 'queued_retry',
      finalQueuedAttempt: true,
      result: {
        kind: 'retryable_error',
        errorCode: '504',
        errorTitle: 'kapso_timeout',
        errorMessage: 'timeout',
        elapsedMs: 25,
        payload: { timeout: true },
      },
    });

    expect(result.kind).toBe('retryable_error');
    expect(database.withTransaction).toHaveBeenCalledTimes(1);
    expect(txQuery).toHaveBeenCalledTimes(2);
  });

  it('cancela el job cuando el send da terminal error', async () => {
    const service = buildService() as any;
    jest.spyOn(service, 'executeOutboundDelivery').mockResolvedValue({
      kind: 'terminal_error',
      errorCode: null,
      errorTitle: 'customer_not_found',
      errorMessage: 'No encontramos el cliente del mensaje.',
      elapsedMs: 5,
      payload: {},
    });

    await expect(
      service.handleOutboundMessage({
        organization_id: 'org-1',
        attempts: 1,
        max_attempts: 5,
        payload: {
          messageId: 'msg-1',
        },
      }),
    ).rejects.toThrow('No encontramos el cliente del mensaje.');
  });
});
