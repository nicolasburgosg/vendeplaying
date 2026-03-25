import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { AiService } from './ai.service';
import { DatabaseService } from './database.service';

const KAPSO_WHATSAPP_API_BASE_URL = 'https://api.kapso.ai/meta/whatsapp/v24.0';

type JobRow = {
  id: string;
  organization_id: string | null;
  job_type: string;
  status: string;
  priority: number;
  available_at: string;
  attempts: number;
  max_attempts: number;
  dedupe_key: string | null;
  follow_up_rule_id: string | null;
  conversation_id: string | null;
  order_id: string | null;
  customer_id: string | null;
  payment_attempt_id: string | null;
  payload: Record<string, unknown>;
};

class CancelledJobError extends Error {}

type ProviderApiError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

@Injectable()
export class WorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly workerId = `vendeto-worker-${process.pid}`;
  private poller: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly aiService: AiService,
  ) {}

  start() {
    this.logger.log('Worker de VendeTo iniciado.');
    void this.tick();
    this.poller = setInterval(() => {
      void this.tick();
    }, 5_000);
  }

  private async tick() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const jobs = await this.claimJobs(5);

      for (const job of jobs) {
        await this.processJob(job);
      }
    } catch (error) {
      this.logger.error('No pudimos ejecutar el ciclo del worker.', error);
    } finally {
      this.running = false;
    }
  }

  private async claimJobs(limit: number) {
    const result = await this.database.query<JobRow>(
      `
        with picked as (
          select id
          from internal.scheduled_jobs
          where status = 'queued'
            and available_at <= now()
          order by priority desc, created_at asc
          limit $1
          for update skip locked
        )
        update internal.scheduled_jobs jobs
        set
          status = 'locked',
          locked_at = now(),
          locked_by = $2,
          attempts = attempts + 1,
          updated_at = now()
        from picked
        where jobs.id = picked.id
        returning
          jobs.id,
          jobs.organization_id,
          jobs.job_type,
          jobs.status,
          jobs.priority,
          jobs.available_at,
          jobs.attempts,
          jobs.max_attempts,
          jobs.dedupe_key,
          jobs.follow_up_rule_id,
          jobs.conversation_id,
          jobs.order_id,
          jobs.customer_id,
          jobs.payment_attempt_id,
          jobs.payload
      `,
      [limit, this.workerId],
    );

    return result.rows;
  }

  private async processJob(job: JobRow) {
    this.logger.log(`Procesando job ${job.id} (${job.job_type}).`);

    const runResult = await this.database.query<{ id: string }>(
      `
        insert into internal.job_runs (
          job_id,
          status,
          worker_id,
          response
        )
        values ($1, 'locked', $2, '{}'::jsonb)
        returning id
      `,
      [job.id, this.workerId],
    );

    const runId = runResult.rows[0].id;

    try {
      const response = await this.dispatchJob(job);

      await this.database.withTransaction(async (client) => {
        await client.query(
          `
            update internal.scheduled_jobs
            set
              status = 'succeeded',
              completed_at = now(),
              last_error = null,
              updated_at = now()
            where id = $1
          `,
          [job.id],
        );

        await client.query(
          `
            update internal.job_runs
            set
              status = 'succeeded',
              finished_at = now(),
              response = $2::jsonb
            where id = $1
          `,
          [runId, JSON.stringify(response ?? {})],
        );
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'El job falló sin detalle.';
      const shouldCancel = error instanceof CancelledJobError;
      const shouldDeadLetter =
        !shouldCancel && job.attempts >= job.max_attempts;
      const nextStatus = shouldCancel
        ? 'cancelled'
        : shouldDeadLetter
          ? 'dead_letter'
          : 'queued';
      const nextAvailability = shouldCancel
        ? null
        : shouldDeadLetter
          ? null
          : new Date(
              Date.now() + Math.min(job.attempts, 5) * 60_000,
            ).toISOString();

      await this.database.withTransaction(async (client) => {
        await client.query(
          `
            update internal.scheduled_jobs
            set
              status = $2,
              available_at = coalesce($3::timestamptz, available_at),
              last_error = $4,
              completed_at = case when $2 in ('cancelled', 'dead_letter') then now() else completed_at end,
              locked_at = null,
              locked_by = null,
              updated_at = now()
            where id = $1
          `,
          [job.id, nextStatus, nextAvailability, message],
        );

        await client.query(
          `
            update internal.job_runs
            set
              status = $2,
              finished_at = now(),
              error_message = $3
            where id = $1
          `,
          [runId, nextStatus === 'queued' ? 'failed' : nextStatus, message],
        );
      });

      this.logger.warn(`Job ${job.id} terminó como ${nextStatus}: ${message}`);
    }
  }

  private async dispatchJob(job: JobRow) {
    switch (job.job_type) {
      case 'refresh_catalog':
        return this.handleCatalogImport(job);
      case 'generic':
        return this.handleGenericJob(job);
      case 'run_follow_up':
        return this.handleFollowUp(job);
      case 'send_whatsapp_message':
        return this.handleOutboundMessage(job);
      case 'payment_reconcile':
        return this.handlePaymentReconcile();
      default:
        return {
          skipped: true,
          reason: `No hay un handler específico para ${job.job_type}.`,
        };
    }
  }

  private async handleCatalogImport(job: JobRow) {
    const importJobId = this.stringPayload(job.payload.importJobId);
    const csvText = this.stringPayload(job.payload.csvText);

    if (!job.organization_id || !importJobId || !csvText) {
      throw new Error(
        'El job de catálogo no tiene organization_id, importJobId o csvText.',
      );
    }

    await this.database.withTransaction(async (client) => {
      await client.query(
        `
          update public.catalog_import_jobs
          set
            status = 'running',
            started_at = now(),
            updated_at = now()
          where organization_id = $1
            and id = $2
        `,
        [job.organization_id, importJobId],
      );

      await client.query(
        `
          delete from public.catalog_import_row_errors
          where organization_id = $1
            and import_job_id = $2
        `,
        [job.organization_id, importJobId],
      );
    });

    const records = parse<Record<string, string>>(csvText, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const [index, row] of records.entries()) {
      const rowNumber = index + 2;
      const name = row.name?.trim();
      const price = Number.parseFloat(
        (row.price ?? row.precio ?? '').replace(',', '.'),
      );

      if (!name) {
        errorCount += 1;
        await this.insertImportError(
          job.organization_id,
          importJobId,
          rowNumber,
          {
            errorCode: 'missing_name',
            errorMessage: 'La fila no tiene nombre de producto.',
            rawRow: row,
          },
        );
        continue;
      }

      if (!Number.isFinite(price) || price <= 0) {
        errorCount += 1;
        await this.insertImportError(
          job.organization_id,
          importJobId,
          rowNumber,
          {
            errorCode: 'invalid_price',
            errorMessage: 'La fila no tiene un precio válido.',
            fieldName: 'price',
            rawRow: row,
          },
        );
        continue;
      }

      const sku = row.sku?.trim() || null;
      const stockQuantity = Number.parseInt(
        row.stock_quantity ?? row.stock ?? '0',
        10,
      );
      const compareAtPrice = Number.parseFloat(
        (row.compare_at_price ?? '').replace(',', '.'),
      );

      if (sku) {
        const existing = await this.database.query<{ id: string }>(
          `
            select id
            from public.products
            where organization_id = $1
              and sku = $2
            limit 1
          `,
          [job.organization_id, sku],
        );

        if (existing.rows.length > 0) {
          updatedCount += 1;
          await this.database.query(
            `
              update public.products
              set
                name = $3,
                description = $4,
                price = $5,
                compare_at_price = $6,
                stock_quantity = $7,
                status = $8,
                currency_code = $9,
                source_type = 'csv',
                updated_at = now()
              where organization_id = $1
                and id = $2
            `,
            [
              job.organization_id,
              existing.rows[0].id,
              name,
              row.description?.trim() || null,
              price,
              Number.isFinite(compareAtPrice) ? compareAtPrice : null,
              Number.isFinite(stockQuantity) ? stockQuantity : 0,
              row.status?.trim() || 'active',
              row.currency_code?.trim() || 'DOP',
            ],
          );
          continue;
        }
      }

      insertedCount += 1;
      await this.database.query(
        `
          insert into public.products (
            organization_id,
            name,
            description,
            sku,
            price,
            compare_at_price,
            stock_quantity,
            status,
            source_type,
            currency_code,
            track_inventory,
            allow_backorder,
            metadata
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            'csv',
            $9,
            true,
            false,
            '{}'::jsonb
          )
        `,
        [
          job.organization_id,
          name,
          row.description?.trim() || null,
          sku,
          price,
          Number.isFinite(compareAtPrice) ? compareAtPrice : null,
          Number.isFinite(stockQuantity) ? stockQuantity : 0,
          row.status?.trim() || 'active',
          row.currency_code?.trim() || 'DOP',
        ],
      );
    }

    const finalStatus =
      errorCount === 0
        ? 'succeeded'
        : insertedCount > 0 || updatedCount > 0
          ? 'partially_succeeded'
          : 'failed';

    await this.database.query(
      `
        update public.catalog_import_jobs
        set
          status = $3,
          processed_rows = $4,
          inserted_count = $5,
          updated_count = $6,
          error_count = $7,
          finished_at = now(),
          summary = jsonb_set(coalesce(summary, '{}'::jsonb), '{processed_by}', to_jsonb($8::text)),
          updated_at = now()
        where organization_id = $1
          and id = $2
      `,
      [
        job.organization_id,
        importJobId,
        finalStatus,
        records.length,
        insertedCount,
        updatedCount,
        errorCount,
        this.workerId,
      ],
    );

    return {
      importJobId,
      insertedCount,
      updatedCount,
      errorCount,
      status: finalStatus,
    };
  }

  private async handleGenericJob(job: JobRow) {
    const action = this.stringPayload(job.payload.action);

    if (action !== 'refresh_conversation_summary') {
      return {
        skipped: true,
        reason: `Acción genérica no soportada: ${action ?? 'sin action'}.`,
      };
    }

    if (!job.organization_id || !job.conversation_id) {
      throw new Error(
        'El job de resumen no tiene organization_id o conversation_id.',
      );
    }

    const [sellerResult, messagesResult] = await Promise.all([
      this.database.query<{ seller_name: string; tone: string | null }>(
        `
          select seller_name, tone
          from public.ai_seller_profiles
          where organization_id = $1
          limit 1
        `,
        [job.organization_id],
      ),
      this.database.query<{
        direction: string;
        sender_type: string;
        body: string | null;
        created_at: string;
      }>(
        `
          select direction, sender_type, body, created_at
          from public.messages
          where organization_id = $1
            and conversation_id = $2
          order by created_at desc
          limit 12
        `,
        [job.organization_id, job.conversation_id],
      ),
    ]);

    if (sellerResult.rows.length === 0) {
      throw new CancelledJobError(
        'No hay perfil de IA para resumir la conversación.',
      );
    }

    if (messagesResult.rows.length === 0) {
      throw new CancelledJobError('No hay mensajes para resumir.');
    }

    const summary = await this.aiService.summarizeConversation({
      sellerName: sellerResult.rows[0].seller_name,
      tone: sellerResult.rows[0].tone,
      messages: messagesResult.rows.reverse(),
    });

    await this.database.query(
      `
        update public.conversations
        set
          summary = $3,
          updated_at = now()
        where organization_id = $1
          and id = $2
      `,
      [job.organization_id, job.conversation_id, summary],
    );

    return {
      conversationId: job.conversation_id,
      summary,
    };
  }

  private async handleFollowUp(job: JobRow) {
    if (
      !job.organization_id ||
      !job.conversation_id ||
      !job.follow_up_rule_id
    ) {
      throw new Error(
        'El follow-up no tiene organization_id, conversation_id o regla.',
      );
    }

    const [ruleResult, conversationResult, channelResult] = await Promise.all([
      this.database.query<{
        is_active: boolean;
        send_mode: string;
        freeform_body: string | null;
      }>(
        `
          select is_active, send_mode, freeform_body
          from public.follow_up_rules
          where organization_id = $1
            and id = $2
          limit 1
        `,
        [job.organization_id, job.follow_up_rule_id],
      ),
      this.database.query<{
        ai_paused: boolean;
        status: string;
      }>(
        `
          select ai_paused, status
          from public.conversations
          where organization_id = $1
            and id = $2
          limit 1
        `,
        [job.organization_id, job.conversation_id],
      ),
      this.database.query<{
        status: string;
        provider_business_account_id: string | null;
        provider_phone_number_id: string | null;
      }>(
        `
          select status, provider_business_account_id, provider_phone_number_id
          from public.whatsapp_channels
          where organization_id = $1
          order by created_at asc
          limit 1
        `,
        [job.organization_id],
      ),
    ]);

    if (ruleResult.rows.length === 0 || !ruleResult.rows[0].is_active) {
      throw new CancelledJobError('La regla ya no está activa.');
    }

    if (conversationResult.rows.length === 0) {
      throw new CancelledJobError('La conversación ya no existe.');
    }

    const conversation = conversationResult.rows[0];

    if (
      conversation.ai_paused ||
      ['waiting_human', 'closed', 'lost'].includes(conversation.status)
    ) {
      throw new CancelledJobError(
        'La conversación pasó a un estado que cancela seguimientos automáticos.',
      );
    }

    if (!this.isKapsoReady(channelResult.rows[0])) {
      throw new Error(
        'El follow-up quedó listo, pero no puede salir hasta que Kapso esté configurado en este entorno.',
      );
    }

    return {
      blocked: true,
      reason:
        'El follow-up llegó al límite interno del worker. Falta el adaptador activo de envío en vivo.',
      preview: ruleResult.rows[0].freeform_body,
    };
  }

  private async handleOutboundMessage(job: JobRow) {
    if (!job.organization_id) {
      throw new Error('El job de envío no tiene organization_id.');
    }

    const messageId = this.stringPayload(job.payload.messageId);

    if (!messageId) {
      throw new Error(
        'El job de envío no tiene payload.messageId para identificar el mensaje.',
      );
    }

    const [channelResult, messageResult] = await Promise.all([
      this.database.query<{
        id: string;
        status: string;
        provider_business_account_id: string | null;
        provider_phone_number_id: string | null;
      }>(
        `
          select id, status, provider_business_account_id, provider_phone_number_id
          from public.whatsapp_channels
          where organization_id = $1
          order by created_at asc
          limit 1
        `,
        [job.organization_id],
      ),
      this.database.query<{
        id: string;
        conversation_id: string;
        channel_id: string;
        customer_id: string | null;
        body: string | null;
        message_type: string;
        current_status: string;
      }>(
        `
          select id, conversation_id, channel_id, customer_id, body, message_type, current_status
          from public.messages
          where organization_id = $1
            and id = $2
            and direction = 'outbound'
          limit 1
        `,
        [job.organization_id, messageId],
      ),
    ]);

    if (channelResult.rows.length === 0) {
      throw new Error(
        'No encontramos un canal de WhatsApp para esta organización.',
      );
    }

    const channel = channelResult.rows[0];

    if (!this.isKapsoReady(channel)) {
      throw new Error(
        'El mensaje quedó encolado, pero no puede salir hasta que Kapso esté configurado en este entorno.',
      );
    }

    if (messageResult.rows.length === 0) {
      throw new CancelledJobError(
        'No encontramos un mensaje outbound listo para enviar.',
      );
    }

    const message = messageResult.rows[0];

    if (message.message_type !== 'text' || !message.body?.trim()) {
      throw new CancelledJobError(
        'Por ahora solo enviamos mensajes de texto con contenido.',
      );
    }

    if (message.current_status !== 'queued') {
      throw new CancelledJobError(
        `El mensaje ya no está en cola (estado actual: ${message.current_status}).`,
      );
    }

    if (!message.customer_id) {
      throw new CancelledJobError('El mensaje no tiene customer_id asociado.');
    }

    const customerResult = await this.database.query<{
      whatsapp_e164: string | null;
    }>(
      `
        select whatsapp_e164
        from public.customers
        where organization_id = $1
          and id = $2
        limit 1
      `,
      [job.organization_id, message.customer_id],
    );

    if (customerResult.rows.length === 0) {
      throw new CancelledJobError('No encontramos el cliente del mensaje.');
    }

    const recipient = this.normalizeRecipientPhone(
      customerResult.rows[0].whatsapp_e164,
    );

    if (!recipient) {
      throw new CancelledJobError(
        'El cliente no tiene un número de WhatsApp válido para enviar.',
      );
    }

    const response = await fetch(
      `${KAPSO_WHATSAPP_API_BASE_URL}/${channel.provider_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': this.getKapsoApiKey(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: {
            body: message.body,
          },
        }),
      },
    );

    let responseBody: Record<string, unknown> = {};

    try {
      const parsedBody: unknown = await response.json();
      responseBody = this.asRecord(parsedBody) ?? {};
    } catch {
      responseBody = {};
    }

    if (!response.ok) {
      const providerError = this.extractProviderError(responseBody);
      const errorCode = providerError.code?.toString() ?? `${response.status}`;
      const errorTitle = providerError.type ?? 'kapso_request_failed';
      const errorMessage =
        providerError.message ??
        `Kapso devolvió ${response.status} al enviar el mensaje.`;

      await this.database.withTransaction(async (client) => {
        await client.query(
          `
            update public.messages
            set
              current_status = 'failed',
              current_status_at = now(),
              failed_at = now(),
              last_error_code = $3,
              last_error_at = now(),
              payload = coalesce(payload, '{}'::jsonb) || $4::jsonb
            where organization_id = $1
              and id = $2
          `,
          [
            job.organization_id,
            message.id,
            errorCode,
            JSON.stringify({
              kapso_error: responseBody,
            }),
          ],
        );

        await client.query(
          `
            insert into public.message_status_events (
              organization_id,
              message_id,
              conversation_id,
              channel_id,
              canonical_status,
              provider_status,
              occurred_at,
              error_code,
              error_title,
              error_payload,
              metadata
            )
            values (
              $1,
              $2,
              $3,
              $4,
              'failed',
              'kapso_error',
              now(),
              $5,
              $6,
              $7::jsonb,
              $8::jsonb
            )
          `,
          [
            job.organization_id,
            message.id,
            message.conversation_id,
            message.channel_id,
            errorCode,
            errorTitle,
            JSON.stringify(responseBody),
            JSON.stringify({
              source: 'kapso_whatsapp_api',
            }),
          ],
        );
      });

      throw new Error(errorMessage);
    }

    const providerMessageId = this.extractProviderMessageId(responseBody);

    await this.database.withTransaction(async (client) => {
      await client.query(
        `
          update public.messages
          set
            provider_message_id = $3,
            current_status = 'accepted',
            current_status_at = now(),
            failed_at = null,
            last_error_code = null,
            last_error_at = null,
            payload = coalesce(payload, '{}'::jsonb) || $4::jsonb
          where organization_id = $1
            and id = $2
        `,
        [
          job.organization_id,
          message.id,
          providerMessageId,
          JSON.stringify({
            kapso_send_response: responseBody,
          }),
        ],
      );

      await client.query(
        `
          insert into public.message_status_events (
            organization_id,
            message_id,
            conversation_id,
            channel_id,
            provider_message_id,
            canonical_status,
            provider_status,
            occurred_at,
            metadata
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            'accepted',
            'accepted',
            now(),
            $6::jsonb
          )
        `,
        [
          job.organization_id,
          message.id,
          message.conversation_id,
          message.channel_id,
          providerMessageId,
          JSON.stringify({
            source: 'kapso_whatsapp_api',
          }),
        ],
      );
    });

    return {
      messageId: message.id,
      providerMessageId,
      to: recipient,
      status: 'accepted',
    };
  }

  private handlePaymentReconcile() {
    throw new Error(
      'La reconciliación de pagos queda preparada, pero el proveedor aún no tiene credenciales reales cargadas.',
    );
  }

  private async insertImportError(
    organizationId: string,
    importJobId: string,
    rowNumber: number,
    params: {
      fieldName?: string;
      errorCode: string;
      errorMessage: string;
      rawRow: Record<string, string>;
    },
  ) {
    await this.database.query(
      `
        insert into public.catalog_import_row_errors (
          organization_id,
          import_job_id,
          row_number,
          field_name,
          severity,
          error_code,
          error_message,
          raw_row
        )
        values ($1, $2, $3, $4, 'error', $5, $6, $7::jsonb)
      `,
      [
        organizationId,
        importJobId,
        rowNumber,
        params.fieldName ?? null,
        params.errorCode,
        params.errorMessage,
        JSON.stringify(params.rawRow),
      ],
    );
  }

  private isKapsoReady(
    channel:
      | {
          status: string;
          provider_business_account_id: string | null;
          provider_phone_number_id: string | null;
        }
      | undefined,
  ) {
    return Boolean(
      channel &&
      channel.status === 'connected' &&
      channel.provider_phone_number_id &&
      process.env.VENDETO_KAPSO_API_KEY,
    );
  }

  private getKapsoApiKey() {
    const apiKey = process.env.VENDETO_KAPSO_API_KEY?.trim();

    if (!apiKey) {
      throw new Error('Falta VENDETO_KAPSO_API_KEY en este entorno.');
    }

    return apiKey;
  }

  private asRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private normalizeRecipientPhone(value: string | null) {
    if (!value) {
      return null;
    }

    const normalized = value.trim().replace(/\D/g, '');
    return normalized.length > 0 ? normalized : null;
  }

  private extractProviderError(
    payload: Record<string, unknown>,
  ): ProviderApiError {
    const error = this.asRecord(payload.error);

    if (!error) {
      return {};
    }

    return {
      message: typeof error.message === 'string' ? error.message : undefined,
      type: typeof error.type === 'string' ? error.type : undefined,
      code: typeof error.code === 'number' ? error.code : undefined,
      error_subcode:
        typeof error.error_subcode === 'number'
          ? error.error_subcode
          : undefined,
      fbtrace_id:
        typeof error.fbtrace_id === 'string' ? error.fbtrace_id : undefined,
    };
  }

  private extractProviderMessageId(payload: Record<string, unknown>) {
    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      return null;
    }

    const firstMessage = this.asRecord(payload.messages[0]);

    return firstMessage && typeof firstMessage.id === 'string'
      ? firstMessage.id
      : null;
  }

  private stringPayload(value: unknown) {
    return typeof value === 'string' ? value : null;
  }

  onModuleDestroy() {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }
}
