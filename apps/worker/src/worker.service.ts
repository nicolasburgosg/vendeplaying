import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import type { Client as PgClient, PoolClient } from 'pg';
import {
  AiService,
  type KnowledgeItemContext,
  type ProductContext,
  type SellerProfile,
  type SellerReplyPlan,
} from './ai.service';
import { DatabaseService } from './database.service';

const KAPSO_WHATSAPP_API_BASE_URL = 'https://api.kapso.ai/meta/whatsapp/v24.0';
const JOB_WAKE_CHANNEL = 'vendeto_scheduled_jobs';
const POLL_INTERVAL_MS = 1_000;
const DEFAULT_REPLY_LANE_CONCURRENCY = 2;
const DEFAULT_BACKGROUND_LANE_CONCURRENCY = 1;
const DEFAULT_AUTO_REPLY_FALLBACK_SEND_DELAY_MS = 10_000;
const DEFAULT_KAPSO_SEND_TIMEOUT_MS = 8_000;

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

type WorkerLaneId = 'reply' | 'background';

type WorkerLaneState = {
  id: WorkerLaneId;
  concurrency: number;
  activeCount: number;
  claimInFlight: boolean;
  pendingWake: boolean;
};

type AutoReplyBaseContext = {
  organizationId: string;
  conversationId: string;
  inboundMessageId: string;
  customerId: string;
  channelId: string;
  inboundMessage: {
    id: string;
    body: string | null;
    messageType: string;
    messageCreatedAt: string;
  };
  conversation: {
    aiPaused: boolean;
    status: string;
  };
  channel: {
    id: string;
    status: string;
    providerBusinessAccountId: string | null;
    providerPhoneNumberId: string | null;
  };
  seller: SellerProfile & {
    isActive: boolean;
  };
};

type DeliveryExecutionMode = 'inline_best_effort' | 'queued_retry';

type DeliveryResult =
  | {
      kind: 'accepted';
      providerMessageId: string | null;
      recipient: string;
      elapsedMs: number;
    }
  | {
      kind: 'retryable_error';
      errorCode: string | null;
      errorTitle: string | null;
      errorMessage: string;
      elapsedMs: number;
      payload: Record<string, unknown>;
    }
  | {
      kind: 'terminal_error';
      errorCode: string | null;
      errorTitle: string | null;
      errorMessage: string;
      elapsedMs: number;
      payload: Record<string, unknown>;
    };

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
  private listener: PgClient | null = null;
  private readonly autoReplyFallbackSendDelayMs = this.getPositiveIntFromEnv(
    'VENDETO_AUTO_REPLY_FALLBACK_SEND_DELAY_MS',
    DEFAULT_AUTO_REPLY_FALLBACK_SEND_DELAY_MS,
  );
  private readonly kapsoSendTimeoutMs = this.getPositiveIntFromEnv(
    'VENDETO_KAPSO_SEND_TIMEOUT_MS',
    DEFAULT_KAPSO_SEND_TIMEOUT_MS,
  );
  private readonly lanes: Record<WorkerLaneId, WorkerLaneState> = {
    reply: {
      id: 'reply',
      concurrency: this.getPositiveIntFromEnv(
        'VENDETO_REPLY_LANE_CONCURRENCY',
        DEFAULT_REPLY_LANE_CONCURRENCY,
      ),
      activeCount: 0,
      claimInFlight: false,
      pendingWake: false,
    },
    background: {
      id: 'background',
      concurrency: this.getPositiveIntFromEnv(
        'VENDETO_BACKGROUND_LANE_CONCURRENCY',
        DEFAULT_BACKGROUND_LANE_CONCURRENCY,
      ),
      activeCount: 0,
      claimInFlight: false,
      pendingWake: false,
    },
  };

  constructor(
    private readonly database: DatabaseService,
    private readonly aiService: AiService,
  ) {}

  start() {
    this.logger.log('Worker de VendeTo iniciado.');
    void this.startListener();
    this.requestAllLanes();
    this.poller = setInterval(() => {
      this.requestAllLanes();
    }, POLL_INTERVAL_MS);
  }

  private async startListener() {
    try {
      this.listener = await this.database.createListenerClient();
      this.listener.on('notification', (message) => {
        if (message.channel === JOB_WAKE_CHANNEL) {
          for (const laneId of this.resolveLaneWakeTargets(message.payload)) {
            this.requestLaneWake(laneId);
          }
        }
      });
      this.listener.on('error', (error) => {
        this.logger.warn(
          `Falló el listener de jobs en tiempo real. Seguimos con polling: ${error.message}`,
        );
      });
      await this.listener.query(`listen ${JOB_WAKE_CHANNEL}`);
      this.logger.log('Listener de jobs en tiempo real listo.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'error desconocido al iniciar listener';
      this.logger.warn(
        `No pudimos activar el listener en tiempo real. Seguimos con polling: ${message}`,
      );
    }
  }

  private requestAllLanes() {
    this.requestLaneWake('reply');
    this.requestLaneWake('background');
  }

  private requestLaneWake(laneId: WorkerLaneId) {
    const lane = this.lanes[laneId];
    lane.pendingWake = true;

    if (lane.claimInFlight) {
      return;
    }

    queueMicrotask(() => {
      void this.tickLane(laneId);
    });
  }

  private async tickLane(laneId: WorkerLaneId) {
    const lane = this.lanes[laneId];

    if (lane.claimInFlight) {
      return;
    }

    lane.claimInFlight = true;

    try {
      while (true) {
        lane.pendingWake = false;

        const freeSlots = lane.concurrency - lane.activeCount;

        if (freeSlots <= 0) {
          return;
        }

        const jobs = await this.claimJobs(laneId, freeSlots);

        if (jobs.length === 0) {
          return;
        }

        for (const job of jobs) {
          lane.activeCount += 1;
          void this.processLaneJob(laneId, job);
        }

        if (lane.activeCount >= lane.concurrency) {
          return;
        }
      }
    } catch (error) {
      this.logger.error(
        `No pudimos ejecutar el ciclo del worker para lane=${laneId}.`,
        error,
      );
    } finally {
      lane.claimInFlight = false;

      if (lane.pendingWake && lane.activeCount < lane.concurrency) {
        queueMicrotask(() => {
          this.requestLaneWake(laneId);
        });
      }
    }
  }

  private async processLaneJob(laneId: WorkerLaneId, job: JobRow) {
    try {
      await this.processJob(laneId, job);
    } finally {
      this.lanes[laneId].activeCount = Math.max(
        0,
        this.lanes[laneId].activeCount - 1,
      );
      this.requestLaneWake(laneId);
    }
  }

  private async claimJobs(laneId: WorkerLaneId, limit: number) {
    const lanePredicate =
      laneId === 'reply'
        ? `
            (
              job_type = 'send_whatsapp_message'
              or (job_type = 'generic' and payload ->> 'action' = 'auto_reply_inbound')
            )
          `
        : `
            not (
              job_type = 'send_whatsapp_message'
              or (job_type = 'generic' and payload ->> 'action' = 'auto_reply_inbound')
            )
          `;

    const result = await this.database.query<JobRow>(
      `
        with picked as (
          select id
          from internal.scheduled_jobs
          where status = 'queued'
            and available_at <= now()
            and ${lanePredicate}
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

  private async processJob(laneId: WorkerLaneId, job: JobRow) {
    this.logger.log(
      `Procesando job ${job.id} (${job.job_type}) en lane=${laneId}.`,
    );

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

      this.logger.warn(
        `Job ${job.id} terminó como ${nextStatus} en lane=${laneId}: ${message}`,
      );
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

    switch (action) {
      case 'refresh_conversation_summary':
        return this.handleConversationSummary(job);
      case 'auto_reply_inbound':
        return this.handleAutoReplyInbound(job);
      default:
        return {
          skipped: true,
          reason: `Acción genérica no soportada: ${action ?? 'sin action'}.`,
        };
    }
  }

  private async handleConversationSummary(job: JobRow) {
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

  private async handleAutoReplyInbound(job: JobRow) {
    if (!job.organization_id || !job.conversation_id) {
      throw new Error(
        'El job de auto-reply no tiene organization_id o conversation_id.',
      );
    }

    const organizationId = job.organization_id;
    const conversationId = job.conversation_id;

    const inboundMessageId =
      this.stringPayload(job.payload.inboundMessageId) ??
      this.stringPayload(job.payload.messageId);

    if (!inboundMessageId) {
      throw new Error(
        'El job de auto-reply no tiene payload.inboundMessageId.',
      );
    }

    const timings = {
      baseContextMs: 0,
      fullContextMs: 0,
      generationMs: 0,
      persistenceMs: 0,
      inlineSendMs: 0,
    };

    const baseContextStart = performance.now();
    const baseContext = await this.loadAutoReplyBaseContext({
      organizationId,
      conversationId,
      inboundMessageId,
    });
    timings.baseContextMs = performance.now() - baseContextStart;

    this.assertAutoReplyBaseContextIsEligible(baseContext);

    const outboundAfterInboundResult = await this.database.query<{ id: string }>(
      `
        select id
        from public.messages
        where organization_id = $1
          and conversation_id = $2
          and direction = 'outbound'
          and coalesce(external_created_at, created_at) >= $3::timestamptz
        order by created_at desc
        limit 1
      `,
      [
        organizationId,
        conversationId,
        baseContext.inboundMessage.messageCreatedAt,
      ],
    );

    if (outboundAfterInboundResult.rows.length > 0) {
      throw new CancelledJobError(
        'La conversación ya recibió una salida posterior a este inbound.',
      );
    }

    let replyPlan =
      this.aiService.tryBuildGreetingFastReply({
        seller: baseContext.seller,
        latestInboundMessage: {
          body: baseContext.inboundMessage.body,
          messageType: baseContext.inboundMessage.messageType,
        },
      });

    if (!replyPlan) {
      const fullContextStart = performance.now();
      const fullContext = await this.loadAutoReplyFullContext(baseContext);
      timings.fullContextMs = performance.now() - fullContextStart;

      const generationStart = performance.now();
      replyPlan = await this.aiService.generateSellerReply({
        seller: baseContext.seller,
        customerName: fullContext.customerName,
        latestInboundMessage: {
          body: baseContext.inboundMessage.body,
          messageType: baseContext.inboundMessage.messageType,
        },
        messages: fullContext.messages,
        products: fullContext.products,
        knowledgeItems: fullContext.knowledgeItems,
      });
      timings.generationMs = performance.now() - generationStart;
    }

    const reply = replyPlan.reply.trim().slice(0, 4096);

    if (!reply) {
      throw new CancelledJobError('La IA no devolvió una respuesta utilizable.');
    }

    const persistenceStart = performance.now();
    const persistedReply = await this.persistAutoReply({
      baseContext,
      reply,
      replyPlan,
    });
    timings.persistenceMs = performance.now() - persistenceStart;

    const fallbackSendDedupeKey = `${organizationId}:send:${persistedReply.outboundMessageId}`;
    const inlineSendStart = performance.now();
    const deliveryResult = await this.executeOutboundDelivery({
      organizationId,
      messageId: persistedReply.outboundMessageId,
      mode: 'inline_best_effort',
    });
    timings.inlineSendMs = performance.now() - inlineSendStart;

    let fallbackJobRetained = deliveryResult.kind === 'retryable_error';

    if (deliveryResult.kind !== 'retryable_error') {
      try {
        await this.cancelQueuedSendJobByDedupeKey({
          organizationId,
          dedupeKey: fallbackSendDedupeKey,
          reason:
            deliveryResult.kind === 'accepted'
              ? 'El envío inline tuvo éxito y ya no necesita fallback.'
              : 'El envío inline falló de forma terminal y se cancela el fallback.',
        });
        fallbackJobRetained = false;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'error desconocido al cancelar fallback send';
        this.logger.warn(
          `No pudimos cancelar el fallback send ${fallbackSendDedupeKey}: ${message}`,
        );
        fallbackJobRetained = true;
      }
    }

    return {
      conversationId,
      inboundMessageId: baseContext.inboundMessage.id,
      outboundMessageId: persistedReply.outboundMessageId,
      replyRoute: replyPlan.route,
      promptVersion: replyPlan.promptVersion,
      handoff: replyPlan.decision.shouldHandoff,
      timings: {
        baseContextMs: Math.round(timings.baseContextMs),
        fullContextMs: Math.round(timings.fullContextMs),
        generationMs: Math.round(timings.generationMs),
        persistenceMs: Math.round(timings.persistenceMs),
        inlineSendMs: Math.round(timings.inlineSendMs),
      },
      delivery: {
        outcome:
          deliveryResult.kind === 'accepted'
            ? 'accepted'
            : deliveryResult.kind === 'retryable_error'
              ? 'deferred_retry'
              : 'failed_terminal',
        fallbackJobRetained,
      },
    };
  }

  private async loadAutoReplyBaseContext(params: {
    organizationId: string;
    conversationId: string;
    inboundMessageId: string;
  }): Promise<AutoReplyBaseContext> {
    const [conversationResult, inboundResult, latestInboundResult, sellerResult] =
      await Promise.all([
        this.database.query<{
          customer_id: string | null;
          channel_id: string;
          ai_paused: boolean;
          status: string;
        }>(
          `
            select customer_id, channel_id, ai_paused, status
            from public.conversations
            where organization_id = $1
              and id = $2
            limit 1
          `,
          [params.organizationId, params.conversationId],
        ),
        this.database.query<{
          id: string;
          customer_id: string | null;
          body: string | null;
          message_type: string;
          message_created_at: string;
        }>(
          `
            select
              id,
              customer_id,
              body,
              message_type,
              coalesce(external_created_at, created_at) as message_created_at
            from public.messages
            where organization_id = $1
              and conversation_id = $2
              and id = $3
              and direction = 'inbound'
            limit 1
          `,
          [params.organizationId, params.conversationId, params.inboundMessageId],
        ),
        this.database.query<{ id: string }>(
          `
            select id
            from public.messages
            where organization_id = $1
              and conversation_id = $2
              and direction = 'inbound'
            order by coalesce(external_created_at, created_at) desc, created_at desc
            limit 1
          `,
          [params.organizationId, params.conversationId],
        ),
        this.database.query<{
          seller_name: string;
          tone: string | null;
          sales_style: string;
          message_length: string;
          welcome_message: string | null;
          human_handoff_message: string | null;
          company_description: string | null;
          target_audience: string | null;
          special_instructions: string | null;
          forbidden_words: string[];
          use_emojis: boolean;
          is_active: boolean;
        }>(
          `
            select
              seller_name,
              tone,
              sales_style,
              message_length,
              welcome_message,
              human_handoff_message,
              company_description,
              target_audience,
              special_instructions,
              forbidden_words,
              use_emojis,
              is_active
            from public.ai_seller_profiles
            where organization_id = $1
            limit 1
          `,
          [params.organizationId],
        ),
      ]);

    if (conversationResult.rows.length === 0) {
      throw new CancelledJobError('La conversación ya no existe.');
    }

    if (inboundResult.rows.length === 0) {
      throw new CancelledJobError(
        'No encontramos el mensaje inbound que disparó la respuesta.',
      );
    }

    if (latestInboundResult.rows[0]?.id !== inboundResult.rows[0].id) {
      throw new CancelledJobError(
        'Entró un mensaje más reciente; esta respuesta quedó obsoleta.',
      );
    }

    if (sellerResult.rows.length === 0) {
      throw new CancelledJobError(
        'No hay un perfil de IA activo para responder automáticamente.',
      );
    }

    const conversation = conversationResult.rows[0];
    const inboundMessage = inboundResult.rows[0];
    const seller = sellerResult.rows[0];
    const customerId = inboundMessage.customer_id ?? conversation.customer_id;

    if (!customerId) {
      throw new CancelledJobError('La conversación no tiene customer_id.');
    }

    const channelResult = await this.database.query<{
      id: string;
      status: string;
      provider_business_account_id: string | null;
      provider_phone_number_id: string | null;
    }>(
      `
        select
          id,
          status,
          provider_business_account_id,
          provider_phone_number_id
        from public.whatsapp_channels
        where organization_id = $1
          and id = $2
        limit 1
      `,
      [params.organizationId, conversation.channel_id],
    );

    if (channelResult.rows.length === 0) {
      throw new Error(
        'No encontramos el canal de WhatsApp asociado a la conversación.',
      );
    }

    const channel = channelResult.rows[0];

    return {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      inboundMessageId: params.inboundMessageId,
      customerId,
      channelId: conversation.channel_id,
      inboundMessage: {
        id: inboundMessage.id,
        body: inboundMessage.body,
        messageType: inboundMessage.message_type,
        messageCreatedAt: inboundMessage.message_created_at,
      },
      conversation: {
        aiPaused: conversation.ai_paused,
        status: conversation.status,
      },
      channel: {
        id: channel.id,
        status: channel.status,
        providerBusinessAccountId: channel.provider_business_account_id,
        providerPhoneNumberId: channel.provider_phone_number_id,
      },
      seller: {
        sellerName: seller.seller_name,
        tone: seller.tone,
        salesStyle: seller.sales_style,
        messageLength: seller.message_length,
        welcomeMessage: seller.welcome_message,
        humanHandoffMessage: seller.human_handoff_message,
        companyDescription: seller.company_description,
        targetAudience: seller.target_audience,
        specialInstructions: seller.special_instructions,
        forbiddenWords: seller.forbidden_words ?? [],
        useEmojis: seller.use_emojis,
        isActive: seller.is_active,
      },
    };
  }

  private assertAutoReplyBaseContextIsEligible(context: AutoReplyBaseContext) {
    if (
      context.conversation.aiPaused ||
      ['waiting_human', 'closed', 'lost'].includes(context.conversation.status)
    ) {
      throw new CancelledJobError(
        'La conversación pasó a un estado que cancela respuestas automáticas.',
      );
    }

    if (!context.seller.isActive) {
      throw new CancelledJobError(
        'No hay un perfil de IA activo para responder automáticamente.',
      );
    }

    if (!this.isKapsoReady(context.channel)) {
      throw new Error(
        'La respuesta automática quedó lista, pero Kapso no está configurado para enviar.',
      );
    }
  }

  private async loadAutoReplyFullContext(context: AutoReplyBaseContext): Promise<{
    customerName: string | null;
    messages: Array<{
      direction: string;
      sender_type: string;
      body: string | null;
      created_at: string;
      message_type: string | null;
    }>;
    products: ProductContext[];
    knowledgeItems: KnowledgeItemContext[];
  }> {
    const [customerResult, messagesResult] = await Promise.all([
      this.database.query<{ full_name: string | null }>(
        `
          select full_name
          from public.customers
          where organization_id = $1
            and id = $2
          limit 1
        `,
        [context.organizationId, context.customerId],
      ),
      this.database.query<{
        direction: string;
        sender_type: string;
        body: string | null;
        created_at: string;
        message_type: string | null;
      }>(
        `
          select direction, sender_type, body, created_at, message_type
          from public.messages
          where organization_id = $1
            and conversation_id = $2
          order by created_at desc
          limit 16
        `,
        [context.organizationId, context.conversationId],
      ),
    ]);

    let products: ProductContext[] = [];
    let knowledgeItems: KnowledgeItemContext[] = [];

    if (
      this.aiService.shouldLoadCatalogContext({
        body: context.inboundMessage.body,
        messageType: context.inboundMessage.messageType,
      })
    ) {
      const [productsResult, knowledgeResult] = await Promise.all([
        this.database.query<{
          name: string;
          description: string | null;
          price: string;
          currency_code: string;
          stock_quantity: number;
          status: string;
        }>(
          `
            select
              name,
              description,
              price,
              currency_code,
              stock_quantity,
              status
            from public.products
            where organization_id = $1
              and status = 'active'
            order by updated_at desc
            limit 30
          `,
          [context.organizationId],
        ),
        this.database.query<{
          title: string | null;
          question: string | null;
          answer: string;
          category: string;
        }>(
          `
            select title, question, answer, category
            from public.knowledge_items
            where organization_id = $1
              and is_active = true
            order by priority asc, updated_at desc
            limit 50
          `,
          [context.organizationId],
        ),
      ]);

      products = productsResult.rows.map((product) => ({
        name: product.name,
        description: product.description,
        price: product.price,
        currencyCode: product.currency_code,
        stockQuantity: product.stock_quantity,
        status: product.status,
      }));

      knowledgeItems = knowledgeResult.rows.map((item) => ({
        title: item.title,
        question: item.question,
        answer: item.answer,
        category: item.category,
      }));
    }

    return {
      customerName: customerResult.rows[0]?.full_name ?? null,
      messages: messagesResult.rows.reverse(),
      products,
      knowledgeItems,
    };
  }

  private async persistAutoReply(params: {
    baseContext: AutoReplyBaseContext;
    reply: string;
    replyPlan: SellerReplyPlan;
  }) {
    const now = new Date().toISOString();
    const nextStatus = params.replyPlan.decision.shouldHandoff
      ? 'waiting_human'
      : 'waiting_customer';
    const nextAiPaused = params.replyPlan.decision.shouldHandoff;
    const fallbackAvailableAt = new Date(
      Date.now() + this.autoReplyFallbackSendDelayMs,
    ).toISOString();

    return this.database.withTransaction(async (client) => {
      const [freshConversationResult, freshLatestInboundResult] =
        await Promise.all([
          client.query<{
            customer_id: string | null;
            channel_id: string;
            ai_paused: boolean;
            status: string;
          }>(
            `
              select customer_id, channel_id, ai_paused, status
              from public.conversations
              where organization_id = $1
                and id = $2
              limit 1
              for update
            `,
            [params.baseContext.organizationId, params.baseContext.conversationId],
          ),
          client.query<{ id: string }>(
            `
              select id
              from public.messages
              where organization_id = $1
                and conversation_id = $2
                and direction = 'inbound'
              order by coalesce(external_created_at, created_at) desc, created_at desc
              limit 1
            `,
            [params.baseContext.organizationId, params.baseContext.conversationId],
          ),
        ]);

      if (freshConversationResult.rows.length === 0) {
        throw new CancelledJobError('La conversación ya no existe.');
      }

      const freshConversation = freshConversationResult.rows[0];

      if (
        freshConversation.ai_paused ||
        ['waiting_human', 'closed', 'lost'].includes(freshConversation.status)
      ) {
        throw new CancelledJobError(
          'La conversación pasó a un estado que cancela respuestas automáticas.',
        );
      }

      if (
        freshLatestInboundResult.rows[0]?.id !== params.baseContext.inboundMessage.id
      ) {
        throw new CancelledJobError(
          'Entró un mensaje más reciente; esta respuesta quedó obsoleta.',
        );
      }

      const freshOutboundAfterInboundResult = await client.query<{ id: string }>(
        `
          select id
          from public.messages
          where organization_id = $1
            and conversation_id = $2
            and direction = 'outbound'
            and coalesce(external_created_at, created_at) >= $3::timestamptz
          order by created_at desc
          limit 1
        `,
        [
          params.baseContext.organizationId,
          params.baseContext.conversationId,
          params.baseContext.inboundMessage.messageCreatedAt,
        ],
      );

      if (freshOutboundAfterInboundResult.rows.length > 0) {
        throw new CancelledJobError(
          'La conversación ya recibió una salida posterior a este inbound.',
        );
      }

      const messageResult = await client.query<{ id: string }>(
        `
          insert into public.messages (
            organization_id,
            channel_id,
            conversation_id,
            customer_id,
            direction,
            sender_type,
            body,
            message_type,
            current_status,
            current_status_at,
            payload
          )
          values (
            $1,
            $2,
            $3,
            $4,
            'outbound',
            'ai',
            $5,
            'text',
            'queued',
            $6::timestamptz,
            $7::jsonb
          )
          returning id
        `,
        [
          params.baseContext.organizationId,
          freshConversation.channel_id,
          params.baseContext.conversationId,
          params.baseContext.customerId,
          params.reply,
          now,
          JSON.stringify({
            source: 'auto_reply_inbound',
            inbound_message_id: params.baseContext.inboundMessage.id,
            prompt_version: params.replyPlan.promptVersion,
            reply_route: params.replyPlan.route,
            seller_decision: params.replyPlan.decision,
          }),
        ],
      );

      const outboundMessageId = messageResult.rows[0]?.id;

      if (!outboundMessageId) {
        throw new Error('No pudimos crear el mensaje outbound automático.');
      }

      await client.query(
        `
          insert into public.message_status_events (
            organization_id,
            message_id,
            conversation_id,
            channel_id,
            canonical_status,
            occurred_at,
            metadata
          )
          values (
            $1,
            $2,
            $3,
            $4,
            'queued',
            $5::timestamptz,
            $6::jsonb
          )
        `,
        [
          params.baseContext.organizationId,
          outboundMessageId,
          params.baseContext.conversationId,
          freshConversation.channel_id,
          now,
          JSON.stringify({
            source: 'auto_reply_inbound',
            inbound_message_id: params.baseContext.inboundMessage.id,
          }),
        ],
      );

      await client.query(
        `
          update public.conversations
          set
            status = $3,
            ai_paused = $4,
            ai_paused_at = case when $4 then $5::timestamptz else null end,
            human_handoff_requested_at = case when $4 then $5::timestamptz else null end,
            last_agent_message_at = $5::timestamptz,
            last_message_at = $5::timestamptz,
            updated_at = now()
          where organization_id = $1
            and id = $2
        `,
        [
          params.baseContext.organizationId,
          params.baseContext.conversationId,
          nextStatus,
          nextAiPaused,
          now,
        ],
      );

      if (params.replyPlan.decision.shouldHandoff) {
        await this.cancelConversationFollowUpsInTransaction(client, {
          organizationId: params.baseContext.organizationId,
          conversationId: params.baseContext.conversationId,
          reason:
            'La IA pidió takeover humano y se cancelaron los seguimientos automáticos.',
        });
      } else {
        await this.scheduleFollowUpsForConversationInTransaction(client, {
          organizationId: params.baseContext.organizationId,
          conversationId: params.baseContext.conversationId,
          customerId: params.baseContext.customerId,
          triggerType: 'awaiting_customer',
        });
      }

      await this.insertScheduledJob(client, {
        organizationId: params.baseContext.organizationId,
        jobType: 'send_whatsapp_message',
        conversationId: params.baseContext.conversationId,
        customerId: params.baseContext.customerId,
        priority: 250,
        dedupeKey: `${params.baseContext.organizationId}:send:${outboundMessageId}`,
        availableAt: fallbackAvailableAt,
        payload: {
          messageId: outboundMessageId,
          body: params.reply,
        },
      });

      await this.insertScheduledJob(client, {
        organizationId: params.baseContext.organizationId,
        jobType: 'generic',
        conversationId: params.baseContext.conversationId,
        customerId: params.baseContext.customerId,
        priority: 10,
        availableAt: new Date(Date.now() + 15_000).toISOString(),
        dedupeKey: `${params.baseContext.organizationId}:summary:${params.baseContext.conversationId}`,
        payload: {
          action: 'refresh_conversation_summary',
        },
      });

      return {
        outboundMessageId,
        status: nextStatus,
      };
    });
  }

  private async cancelQueuedSendJobByDedupeKey(params: {
    organizationId: string;
    dedupeKey: string;
    reason: string;
  }) {
    await this.database.query(
      `
        update internal.scheduled_jobs
        set
          status = 'cancelled',
          last_error = $3,
          completed_at = now(),
          updated_at = now()
        where organization_id = $1
          and dedupe_key = $2
          and job_type = 'send_whatsapp_message'
          and status = 'queued'
      `,
      [params.organizationId, params.dedupeKey, params.reason],
    );
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

    const deliveryResult = await this.executeOutboundDelivery({
      organizationId: job.organization_id,
      messageId,
      mode: 'queued_retry',
      attempt: job.attempts,
      maxAttempts: job.max_attempts,
    });

    if (deliveryResult.kind === 'accepted') {
      return {
        messageId,
        providerMessageId: deliveryResult.providerMessageId,
        elapsedMs: Math.round(deliveryResult.elapsedMs),
        outcome: 'accepted',
      };
    }

    if (deliveryResult.kind === 'terminal_error') {
      throw new CancelledJobError(deliveryResult.errorMessage);
    }

    throw new Error(deliveryResult.errorMessage);
  }

  private async executeOutboundDelivery(params: {
    organizationId: string;
    messageId: string;
    mode: DeliveryExecutionMode;
    attempt?: number;
    maxAttempts?: number;
  }): Promise<DeliveryResult> {
    const start = performance.now();
    const finalQueuedAttempt =
      params.mode === 'queued_retry' &&
      (params.attempt ?? 1) >= (params.maxAttempts ?? 1);
    const messageResult = await this.database.query<{
      id: string;
      conversation_id: string;
      channel_id: string;
      customer_id: string | null;
      body: string | null;
      message_type: string;
      current_status: string;
    }>(
      `
        select
          id,
          conversation_id,
          channel_id,
          customer_id,
          body,
          message_type,
          current_status
        from public.messages
        where organization_id = $1
          and id = $2
          and direction = 'outbound'
        limit 1
      `,
      [params.organizationId, params.messageId],
    );

    const message = messageResult.rows[0];

    if (!message) {
      return {
        kind: 'terminal_error',
        errorCode: null,
        errorTitle: 'message_not_found',
        errorMessage: 'No encontramos un mensaje outbound listo para enviar.',
        elapsedMs: performance.now() - start,
        payload: {},
      };
    }

    if (message.current_status !== 'queued') {
      return {
        kind: 'terminal_error',
        errorCode: null,
        errorTitle: 'message_not_queued',
        errorMessage: `El mensaje ya no está en cola (estado actual: ${message.current_status}).`,
        elapsedMs: performance.now() - start,
        payload: {
          current_status: message.current_status,
        },
      };
    }

    if (message.message_type !== 'text' || !message.body?.trim()) {
      return this.persistDeliveryFailure({
        organizationId: params.organizationId,
        message,
        mode: params.mode,
        finalQueuedAttempt,
        result: {
          kind: 'terminal_error',
          errorCode: null,
          errorTitle: 'unsupported_message_type',
          errorMessage: 'Por ahora solo enviamos mensajes de texto con contenido.',
          elapsedMs: performance.now() - start,
          payload: {
            message_type: message.message_type,
          },
        },
      });
    }

    const channelResult = await this.database.query<{
      id: string;
      status: string;
      provider_business_account_id: string | null;
      provider_phone_number_id: string | null;
    }>(
      `
        select
          id,
          status,
          provider_business_account_id,
          provider_phone_number_id
        from public.whatsapp_channels
        where organization_id = $1
          and id = $2
        limit 1
      `,
      [params.organizationId, message.channel_id],
    );

    const channel = channelResult.rows[0];

    if (!channel) {
      return this.persistDeliveryFailure({
        organizationId: params.organizationId,
        message,
        mode: params.mode,
        finalQueuedAttempt,
        result: {
          kind: 'terminal_error',
          errorCode: null,
          errorTitle: 'channel_not_found',
          errorMessage: 'No encontramos el canal de WhatsApp del mensaje.',
          elapsedMs: performance.now() - start,
          payload: {},
        },
      });
    }

    const kapsoApiKey = this.getKapsoApiKeyOrNull();

    if (
      !channel.provider_phone_number_id ||
      channel.status !== 'connected' ||
      !kapsoApiKey
    ) {
      return this.persistDeliveryFailure({
        organizationId: params.organizationId,
        message,
        mode: params.mode,
        finalQueuedAttempt,
        result: {
          kind: 'retryable_error',
          errorCode: null,
          errorTitle: 'kapso_not_ready',
          errorMessage:
            'El mensaje quedó encolado, pero Kapso no está listo para enviar todavía.',
          elapsedMs: performance.now() - start,
          payload: {
            channel_status: channel.status,
            provider_phone_number_id: channel.provider_phone_number_id,
            has_api_key: Boolean(kapsoApiKey),
          },
        },
      });
    }

    if (!message.customer_id) {
      return this.persistDeliveryFailure({
        organizationId: params.organizationId,
        message,
        mode: params.mode,
        finalQueuedAttempt,
        result: {
          kind: 'terminal_error',
          errorCode: null,
          errorTitle: 'missing_customer',
          errorMessage: 'El mensaje no tiene customer_id asociado.',
          elapsedMs: performance.now() - start,
          payload: {},
        },
      });
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
      [params.organizationId, message.customer_id],
    );

    if (customerResult.rows.length === 0) {
      return this.persistDeliveryFailure({
        organizationId: params.organizationId,
        message,
        mode: params.mode,
        finalQueuedAttempt,
        result: {
          kind: 'terminal_error',
          errorCode: null,
          errorTitle: 'customer_not_found',
          errorMessage: 'No encontramos el cliente del mensaje.',
          elapsedMs: performance.now() - start,
          payload: {},
        },
      });
    }

    const recipient = this.normalizeRecipientPhone(
      customerResult.rows[0].whatsapp_e164,
    );

    if (!recipient) {
      return this.persistDeliveryFailure({
        organizationId: params.organizationId,
        message,
        mode: params.mode,
        finalQueuedAttempt,
        result: {
          kind: 'terminal_error',
          errorCode: null,
          errorTitle: 'invalid_recipient_phone',
          errorMessage:
            'El cliente no tiene un número de WhatsApp válido para enviar.',
          elapsedMs: performance.now() - start,
          payload: {},
        },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.kapsoSendTimeoutMs);

    let responseBody: Record<string, unknown> = {};

    try {
      const response = await fetch(
        `${KAPSO_WHATSAPP_API_BASE_URL}/${channel.provider_phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'X-API-Key': kapsoApiKey,
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
          signal: controller.signal,
        },
      );

      try {
        const parsedBody: unknown = await response.json();
        responseBody = this.asRecord(parsedBody) ?? {};
      } catch {
        responseBody = {};
      }

      const elapsedMs = performance.now() - start;

      if (response.ok) {
        const acceptedResult: DeliveryResult = {
          kind: 'accepted',
          providerMessageId: this.extractProviderMessageId(responseBody),
          recipient,
          elapsedMs,
        };

        return this.persistDeliveryAcceptance({
          organizationId: params.organizationId,
          message,
          mode: params.mode,
          result: acceptedResult,
          responseBody,
        });
      }

      const providerError = this.extractProviderError(responseBody);
      const errorCode = providerError.code?.toString() ?? `${response.status}`;
      const errorTitle = providerError.type ?? 'kapso_request_failed';
      const errorMessage =
        providerError.message ??
        `Kapso devolvió ${response.status} al enviar el mensaje.`;
      const classifiedResult: DeliveryResult =
        response.status === 429 || response.status >= 500
          ? {
              kind: 'retryable_error',
              errorCode,
              errorTitle,
              errorMessage,
              elapsedMs,
              payload: responseBody,
            }
          : {
              kind: 'terminal_error',
              errorCode,
              errorTitle,
              errorMessage,
              elapsedMs,
              payload: responseBody,
            };

      return this.persistDeliveryFailure({
        organizationId: params.organizationId,
        message,
        mode: params.mode,
        finalQueuedAttempt,
        result: classifiedResult,
      });
    } catch (error) {
      const elapsedMs = performance.now() - start;
      const errorMessage =
        error instanceof Error && error.name === 'AbortError'
          ? `Kapso no respondió antes de ${this.kapsoSendTimeoutMs}ms.`
          : error instanceof Error
            ? error.message
            : 'Falló la solicitud a Kapso.';

      return this.persistDeliveryFailure({
        organizationId: params.organizationId,
        message,
        mode: params.mode,
        finalQueuedAttempt,
        result: {
          kind: 'retryable_error',
          errorCode: null,
          errorTitle:
            error instanceof Error && error.name === 'AbortError'
              ? 'kapso_timeout'
              : 'kapso_network_error',
          errorMessage,
          elapsedMs,
          payload:
            error instanceof Error
              ? {
                  error_name: error.name,
                  error_message: error.message,
                }
              : {},
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async persistDeliveryAcceptance(params: {
    organizationId: string;
    message: {
      id: string;
      conversation_id: string;
      channel_id: string;
    };
    mode: DeliveryExecutionMode;
    result: Extract<DeliveryResult, { kind: 'accepted' }>;
    responseBody: Record<string, unknown>;
  }): Promise<Extract<DeliveryResult, { kind: 'accepted' }>> {
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
          params.organizationId,
          params.message.id,
          params.result.providerMessageId,
          JSON.stringify({
            kapso_send_response: params.responseBody,
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
          params.organizationId,
          params.message.id,
          params.message.conversation_id,
          params.message.channel_id,
          params.result.providerMessageId,
          JSON.stringify({
            source: 'kapso_whatsapp_api',
            mode: params.mode,
          }),
        ],
      );
    });

    return params.result;
  }

  private async persistDeliveryFailure(params: {
    organizationId: string;
    message?: {
      id: string;
      conversation_id: string;
      channel_id: string;
      current_status?: string;
    };
    mode: DeliveryExecutionMode;
    finalQueuedAttempt: boolean;
    result: Extract<
      DeliveryResult,
      { kind: 'retryable_error' | 'terminal_error' }
    >;
  }): Promise<Extract<DeliveryResult, { kind: 'retryable_error' | 'terminal_error' }>> {
    if (!params.message || params.message.current_status !== 'queued') {
      return params.result;
    }

    const message = params.message;

    const debugPayload = {
      kapso_last_send_attempt: {
        mode: params.mode,
        outcome: params.result.kind,
        occurred_at: new Date().toISOString(),
        error_code: params.result.errorCode,
        error_title: params.result.errorTitle,
        response: params.result.payload,
      },
    };

    if (params.result.kind === 'retryable_error' && !params.finalQueuedAttempt) {
      await this.database.query(
        `
          update public.messages
          set
            payload = coalesce(payload, '{}'::jsonb) || $3::jsonb
          where organization_id = $1
            and id = $2
        `,
        [params.organizationId, message.id, JSON.stringify(debugPayload)],
      );

      return params.result;
    }

    const providerStatus =
      params.result.kind === 'retryable_error'
        ? 'kapso_retry_exhausted'
        : 'kapso_error';

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
          params.organizationId,
          message.id,
          params.result.errorCode,
          JSON.stringify(debugPayload),
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
            $5,
            now(),
            $6,
            $7,
            $8::jsonb,
            $9::jsonb
          )
        `,
        [
          params.organizationId,
          message.id,
          message.conversation_id,
          message.channel_id,
          providerStatus,
          params.result.errorCode,
          params.result.errorTitle,
          JSON.stringify(params.result.payload),
          JSON.stringify({
            source: 'kapso_whatsapp_api',
            mode: params.mode,
          }),
        ],
      );
    });

    return params.result;
  }

  private handlePaymentReconcile() {
    throw new Error(
      'La reconciliación de pagos queda preparada, pero el proveedor aún no tiene credenciales reales cargadas.',
    );
  }

  private async insertScheduledJob(
    client: PoolClient,
    input: {
      organizationId: string;
      jobType: string;
      payload?: Record<string, unknown>;
      availableAt?: string | null;
      priority?: number;
      maxAttempts?: number;
      dedupeKey?: string | null;
      followUpRuleId?: string | null;
      conversationId?: string | null;
      orderId?: string | null;
      customerId?: string | null;
      paymentAttemptId?: string | null;
    },
  ) {
    const priority =
      input.priority ??
      (input.jobType === 'send_whatsapp_message'
        ? 250
        : input.payload?.action === 'auto_reply_inbound'
          ? 300
          : input.payload?.action === 'refresh_conversation_summary'
            ? 10
            : 100);

    await client.query(
      `
        with updated as (
          update internal.scheduled_jobs
          set
            payload = $12::jsonb,
            available_at = coalesce($4::timestamptz, now()),
            priority = $3,
            updated_at = now()
          where organization_id = $1
            and dedupe_key = $6
            and $6 is not null
            and status in ('queued', 'locked')
          returning id
        )
        insert into internal.scheduled_jobs (
          organization_id,
          job_type,
          status,
          priority,
          scheduled_at,
          available_at,
          max_attempts,
          dedupe_key,
          follow_up_rule_id,
          conversation_id,
          order_id,
          customer_id,
          payment_attempt_id,
          payload
        )
        select
          $1,
          $2,
          'queued',
          $3,
          now(),
          coalesce($4::timestamptz, now()),
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12::jsonb
        where not exists (select 1 from updated)
        on conflict do nothing
      `,
      [
        input.organizationId,
        input.jobType,
        priority,
        input.availableAt ?? null,
        input.maxAttempts ?? 5,
        input.dedupeKey ?? null,
        input.followUpRuleId ?? null,
        input.conversationId ?? null,
        input.orderId ?? null,
        input.customerId ?? null,
        input.paymentAttemptId ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    );

    await client.query(`select pg_notify($1, $2)`, [
      JOB_WAKE_CHANNEL,
      JSON.stringify({
        organizationId: input.organizationId,
        jobType: input.jobType,
        action:
          typeof input.payload?.action === 'string' ? input.payload.action : null,
      }),
    ]);
  }

  private async cancelConversationFollowUpsInTransaction(
    client: PoolClient,
    params: {
      organizationId: string;
      conversationId: string;
      reason: string;
    },
  ) {
    await client.query(
      `
        update internal.scheduled_jobs
        set
          status = 'cancelled',
          last_error = $3,
          completed_at = now(),
          updated_at = now()
        where organization_id = $1
          and conversation_id = $2
          and job_type = 'run_follow_up'
          and status in ('queued', 'locked')
      `,
      [params.organizationId, params.conversationId, params.reason],
    );
  }

  private async scheduleFollowUpsForConversationInTransaction(
    client: PoolClient,
    params: {
      organizationId: string;
      conversationId: string;
      customerId: string;
      orderId?: string | null;
      triggerType:
        | 'abandoned_cart'
        | 'payment_reminder'
        | 'awaiting_customer'
        | 'order_status_update'
        | 'manual';
    },
  ) {
    const rulesResult = await client.query<{
      id: string;
      delay_minutes: number;
      target_type: string;
    }>(
      `
        select id, delay_minutes, target_type
        from public.follow_up_rules
        where organization_id = $1
          and is_active = true
          and trigger_type = $2
      `,
      [params.organizationId, params.triggerType],
    );

    for (const rule of rulesResult.rows) {
      await this.insertScheduledJob(client, {
        organizationId: params.organizationId,
        jobType: 'run_follow_up',
        availableAt: new Date(
          Date.now() + rule.delay_minutes * 60_000,
        ).toISOString(),
        dedupeKey: `${params.organizationId}:${rule.id}:${params.conversationId}:${params.orderId ?? 'none'}`,
        followUpRuleId: rule.id,
        conversationId: params.conversationId,
        customerId: params.customerId,
        orderId: params.orderId ?? null,
        payload: {
          triggerType: params.triggerType,
          targetType: rule.target_type,
        },
      });
    }
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

  private resolveLaneWakeTargets(payload: string | undefined): WorkerLaneId[] {
    if (!payload) {
      return ['reply', 'background'];
    }

    try {
      const parsed = this.asRecord(JSON.parse(payload));
      const jobType =
        parsed && typeof parsed.jobType === 'string' ? parsed.jobType : null;
      const action =
        parsed && typeof parsed.action === 'string' ? parsed.action : null;

      if (!jobType) {
        return ['reply', 'background'];
      }

      return this.isReplyLaneJob(jobType, action) ? ['reply'] : ['background'];
    } catch {
      return ['reply', 'background'];
    }
  }

  private isReplyLaneJob(jobType: string, action: string | null) {
    return (
      jobType === 'send_whatsapp_message' ||
      (jobType === 'generic' && action === 'auto_reply_inbound')
    );
  }

  private getPositiveIntFromEnv(name: string, fallback: number) {
    const rawValue = process.env[name]?.trim();

    if (!rawValue) {
      return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private isKapsoReady(
    channel:
      | {
          status: string;
          provider_business_account_id: string | null;
          provider_phone_number_id: string | null;
        }
      | {
          status: string;
          providerBusinessAccountId: string | null;
          providerPhoneNumberId: string | null;
        }
      | undefined,
  ) {
    return Boolean(
      channel &&
      channel.status === 'connected' &&
      ('provider_phone_number_id' in channel
        ? channel.provider_phone_number_id
        : channel.providerPhoneNumberId) &&
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

  private getKapsoApiKeyOrNull() {
    const apiKey = process.env.VENDETO_KAPSO_API_KEY?.trim();
    return apiKey ? apiKey : null;
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

  async onModuleDestroy() {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }

    if (this.listener) {
      try {
        await this.listener.query(`unlisten ${JOB_WAKE_CHANNEL}`);
      } catch {}

      await this.listener.end().catch(() => undefined);
      this.listener = null;
    }
  }
}
