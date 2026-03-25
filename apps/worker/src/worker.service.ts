import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import type { PoolClient } from 'pg';
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

    const [conversationResult, inboundResult, latestInboundResult, channelResult] =
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
          [organizationId, conversationId],
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
          [organizationId, conversationId, inboundMessageId],
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
          [organizationId, conversationId],
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
          [organizationId],
        ),
      ]);

    if (conversationResult.rows.length === 0) {
      throw new CancelledJobError('La conversación ya no existe.');
    }

    const conversation = conversationResult.rows[0];

    if (
      conversation.ai_paused ||
      ['waiting_human', 'closed', 'lost'].includes(conversation.status)
    ) {
      throw new CancelledJobError(
        'La conversación pasó a un estado que cancela respuestas automáticas.',
      );
    }

    if (!this.isKapsoReady(channelResult.rows[0])) {
      throw new Error(
        'La respuesta automática quedó lista, pero Kapso no está configurado para enviar.',
      );
    }

    if (inboundResult.rows.length === 0) {
      throw new CancelledJobError(
        'No encontramos el mensaje inbound que disparó la respuesta.',
      );
    }

    const inboundMessage = inboundResult.rows[0];

    if (latestInboundResult.rows[0]?.id !== inboundMessage.id) {
      throw new CancelledJobError(
        'Entró un mensaje más reciente; esta respuesta quedó obsoleta.',
      );
    }

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
        inboundMessage.message_created_at,
      ],
    );

    if (outboundAfterInboundResult.rows.length > 0) {
      throw new CancelledJobError(
        'La conversación ya recibió una salida posterior a este inbound.',
      );
    }

    const customerId = inboundMessage.customer_id ?? conversation.customer_id;

    if (!customerId) {
      throw new CancelledJobError('La conversación no tiene customer_id.');
    }

    const [
      customerResult,
      sellerResult,
      messagesResult,
      productsResult,
      knowledgeResult,
    ] = await Promise.all([
      this.database.query<{ full_name: string | null }>(
        `
          select full_name
          from public.customers
          where organization_id = $1
            and id = $2
          limit 1
        `,
        [organizationId, customerId],
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
        [organizationId],
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
        [organizationId, conversationId],
      ),
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
        [organizationId],
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
        [organizationId],
      ),
    ]);

    if (sellerResult.rows.length === 0 || !sellerResult.rows[0].is_active) {
      throw new CancelledJobError(
        'No hay un perfil de IA activo para responder automáticamente.',
      );
    }

    const seller = sellerResult.rows[0];
    const replyPlan = await this.aiService.generateSellerReply({
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
      },
      customerName: customerResult.rows[0]?.full_name ?? null,
      latestInboundMessage: {
        body: inboundMessage.body,
        messageType: inboundMessage.message_type,
      },
      messages: messagesResult.rows.reverse(),
      products: productsResult.rows.map((product) => ({
        name: product.name,
        description: product.description,
        price: product.price,
        currencyCode: product.currency_code,
        stockQuantity: product.stock_quantity,
        status: product.status,
      })),
      knowledgeItems: knowledgeResult.rows.map((item) => ({
        title: item.title,
        question: item.question,
        answer: item.answer,
        category: item.category,
      })),
    });

    const reply = replyPlan.reply.trim().slice(0, 4096);

    if (!reply) {
      throw new CancelledJobError('La IA no devolvió una respuesta utilizable.');
    }

    const now = new Date().toISOString();
    const nextStatus = replyPlan.decision.shouldHandoff
      ? 'waiting_human'
      : 'waiting_customer';
    const nextAiPaused = replyPlan.decision.shouldHandoff;

    const result = await this.database.withTransaction(async (client) => {
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
            [organizationId, conversationId],
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
            [organizationId, conversationId],
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

      if (freshLatestInboundResult.rows[0]?.id !== inboundMessage.id) {
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
          organizationId,
          conversationId,
          inboundMessage.message_created_at,
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
          organizationId,
          freshConversation.channel_id,
          conversationId,
          customerId,
          reply,
          now,
          JSON.stringify({
            source: 'auto_reply_inbound',
            inbound_message_id: inboundMessage.id,
            prompt_version: replyPlan.promptVersion,
            seller_decision: replyPlan.decision,
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
          organizationId,
          outboundMessageId,
          conversationId,
          freshConversation.channel_id,
          now,
          JSON.stringify({
            source: 'auto_reply_inbound',
            inbound_message_id: inboundMessage.id,
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
        [organizationId, conversationId, nextStatus, nextAiPaused, now],
      );

      if (replyPlan.decision.shouldHandoff) {
        await this.cancelConversationFollowUpsInTransaction(client, {
          organizationId,
          conversationId,
          reason:
            'La IA pidió takeover humano y se cancelaron los seguimientos automáticos.',
        });
      } else {
        await this.scheduleFollowUpsForConversationInTransaction(client, {
          organizationId,
          conversationId,
          customerId,
          triggerType: 'awaiting_customer',
        });
      }

      await this.insertScheduledJob(client, {
        organizationId,
        jobType: 'send_whatsapp_message',
        conversationId,
        customerId,
        dedupeKey: `${organizationId}:send:${outboundMessageId}`,
        payload: {
          messageId: outboundMessageId,
          body: reply,
        },
      });

      await this.insertScheduledJob(client, {
        organizationId,
        jobType: 'generic',
        conversationId,
        customerId,
        dedupeKey: `${organizationId}:summary:${conversationId}`,
        payload: {
          action: 'refresh_conversation_summary',
        },
      });

      return {
        outboundMessageId,
      };
    });

    return {
      conversationId,
      inboundMessageId: inboundMessage.id,
      outboundMessageId: result.outboundMessageId,
      status: nextStatus,
      handoff: replyPlan.decision.shouldHandoff,
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
    await client.query(
      `
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
        values (
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
        )
        on conflict (organization_id, dedupe_key)
        where dedupe_key is not null and status in ('queued', 'locked')
        do update set
          payload = excluded.payload,
          available_at = excluded.available_at,
          priority = excluded.priority,
          updated_at = now()
      `,
      [
        input.organizationId,
        input.jobType,
        input.priority ?? 100,
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
