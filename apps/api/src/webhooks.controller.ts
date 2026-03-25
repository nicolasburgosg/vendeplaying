import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { DatabaseService } from './database.service';

type ProviderStatusError = {
  code: string | null;
  title: string | null;
  payload: Record<string, unknown>;
};

function stringifyPayload(payload: unknown) {
  return JSON.stringify(payload ?? {});
}

function getRawPayload(request: FastifyRequest, body: unknown) {
  const rawBody = (
    request as FastifyRequest & {
      rawBody?: Buffer | string;
    }
  ).rawBody;

  if (Buffer.isBuffer(rawBody)) {
    return rawBody.toString('utf8');
  }

  if (typeof rawBody === 'string') {
    return rawBody;
  }

  return stringifyPayload(body);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return asRecord(value) !== null;
}

function firstObjectFromUnknownArray(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return asRecord(value[0]);
}

function getNestedMetaValue(payload: Record<string, unknown>) {
  const entry = firstObjectFromUnknownArray(payload.entry);
  const change = firstObjectFromUnknownArray(entry?.changes);
  const value = asRecord(change?.value);

  return {
    entry,
    change,
    value: value ?? {},
  };
}

function extractMessageOrStatusId(value: Record<string, unknown>) {
  const firstStatus = firstObjectFromUnknownArray(value.statuses);

  if (typeof firstStatus?.id === 'string') {
    return firstStatus.id;
  }

  const firstMessage = firstObjectFromUnknownArray(value.messages);

  if (typeof firstMessage?.id === 'string') {
    return firstMessage.id;
  }

  return null;
}

function inferWhatsAppEventType(payload: Record<string, unknown>) {
  const { value } = getNestedMetaValue(payload);

  if (Array.isArray(value.statuses) && value.statuses.length > 0) {
    return 'message_status';
  }

  if (Array.isArray(value.messages) && value.messages.length > 0) {
    return 'message_inbound';
  }

  return 'unknown';
}

function secureCompare(expected: string, candidate: string) {
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);

  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, candidateBuffer);
}

function getPaymentWebhookSecret(providerCode: string) {
  const normalizedProviderCode = providerCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalizedProviderCode) {
    return null;
  }

  return (
    process.env[`VENDETO_PAYMENT_WEBHOOK_SECRET_${normalizedProviderCode}`] ??
    process.env.VENDETO_PAYMENT_WEBHOOK_SECRET ??
    null
  );
}

function md5(input: string) {
  return createHash('md5').update(input).digest('hex');
}

function normalizeRecipientPhone(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\D/g, '');
  return normalized.length > 0 ? normalized : null;
}

function toTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return new Date(Number(value) * 1000).toISOString();
  }

  return new Date().toISOString();
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly database: DatabaseService) {}

  @Post('whatsapp/kapso/project')
  async receiveKapsoProjectWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-webhook-signature') signatureHeader: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    const secret = process.env.VENDETO_KAPSO_PROJECT_WEBHOOK_SECRET;

    if (!secret) {
      throw new ServiceUnavailableException(
        'El webhook de proyecto de Kapso no está configurado en este entorno.',
      );
    }

    const payloadJson = getRawPayload(request, body);

    if (!this.verifyKapsoSignature(payloadJson, signatureHeader, secret)) {
      throw new UnauthorizedException('Firma de Kapso inválida.');
    }

    const event =
      typeof body.event === 'string' ? body.event : 'whatsapp.project_event';
    const data = asRecord(body.data) ?? {};

    if (event === 'whatsapp.phone_number.created') {
      await this.handleKapsoPhoneNumberCreated(data);
    }

    return {
      received: true,
      event,
    };
  }

  @Post('whatsapp/kapso/meta')
  async receiveKapsoMetaWebhook(
    @Body() body: Record<string, unknown>,
    @Query('token') token: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    const expectedToken = process.env.VENDETO_KAPSO_META_WEBHOOK_TOKEN;

    if (!expectedToken) {
      throw new ServiceUnavailableException(
        'El webhook de WhatsApp de Kapso no está configurado en este entorno.',
      );
    }

    if (!token || !secureCompare(expectedToken, token)) {
      throw new UnauthorizedException('Token de Kapso inválido.');
    }

    const payloadJson = getRawPayload(request, body);
    const providerMetadata = await this.extractKapsoMetaRouting(body);
    const dedupeKey =
      idempotencyKey?.trim() || providerMetadata.dedupeKey || md5(payloadJson);

    const result = await this.database.query<{ id: string }>(
      `
        insert into internal.provider_events (
          provider_code,
          event_type,
          organization_id,
          channel_id,
          provider_event_id,
          dedupe_key,
          signature_valid,
          processing_status,
          source_system,
          transport_type,
          http_headers,
          payload,
          payload_hash
        )
        values (
          'whatsapp_kapso',
          $1,
          $2,
          $3,
          $4,
          $5,
          true,
          'received',
          'whatsapp',
          'webhook',
          $6::jsonb,
          $7::jsonb,
          md5($8)
        )
        on conflict (provider_code, dedupe_key)
        do update set
          payload = excluded.payload,
          http_headers = excluded.http_headers
        returning id
      `,
      [
        inferWhatsAppEventType(body),
        providerMetadata.organizationId,
        providerMetadata.channelId,
        providerMetadata.providerEventId,
        dedupeKey,
        JSON.stringify(request.headers),
        payloadJson,
        payloadJson,
      ],
    );

    const providerEventId = result.rows[0]?.id ?? null;

    try {
      if (
        providerEventId &&
        providerMetadata.organizationId &&
        providerMetadata.channelId
      ) {
        await this.processKapsoMetaEvent({
          providerEventId,
          organizationId: providerMetadata.organizationId,
          channelId: providerMetadata.channelId,
          payload: body,
        });
      }

      if (providerEventId) {
        await this.database.query(
          `
            update internal.provider_events
            set processing_status = 'processed'
            where id = $1
          `,
          [providerEventId],
        );
      }
    } catch (error) {
      if (providerEventId) {
        await this.database.query(
          `
            update internal.provider_events
            set processing_status = 'failed'
            where id = $1
          `,
          [providerEventId],
        );
      }

      throw error;
    }

    return {
      received: true,
      providerEventId,
      organizationId: providerMetadata.organizationId,
      channelId: providerMetadata.channelId,
    };
  }

  @Post('payments/:providerCode')
  async receivePaymentWebhook(
    @Param('providerCode') providerCode: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-vendeto-webhook-secret') webhookSecret: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    if (!/^[a-z0-9_]+$/i.test(providerCode)) {
      throw new BadRequestException('providerCode inválido.');
    }

    const expectedSecret = getPaymentWebhookSecret(providerCode);

    if (!expectedSecret) {
      throw new ServiceUnavailableException(
        'El webhook de pagos no está configurado en este entorno.',
      );
    }

    if (!webhookSecret || !secureCompare(expectedSecret, webhookSecret)) {
      throw new UnauthorizedException('Firma de pago inválida.');
    }

    const payloadJson = getRawPayload(request, body);
    const providerEventId =
      typeof body.event_id === 'string'
        ? body.event_id
        : typeof body.id === 'string'
          ? body.id
          : null;

    const dedupeKey = providerEventId ?? md5(payloadJson);

    await this.database.query(
      `
        insert into internal.provider_events (
          provider_code,
          event_type,
          provider_event_id,
          dedupe_key,
          processing_status,
          source_system,
          transport_type,
          http_headers,
          payload,
          payload_hash
        )
        values (
          $1,
          $2,
          $3,
          $4,
          'received',
          'payment_provider',
          'webhook',
          $5::jsonb,
          $6::jsonb,
          md5($7)
        )
        on conflict (provider_code, dedupe_key)
        do update set
          payload = excluded.payload,
          http_headers = excluded.http_headers
      `,
      [
        providerCode,
        typeof body.type === 'string' ? body.type : 'provider_event',
        providerEventId,
        dedupeKey,
        JSON.stringify(request.headers),
        payloadJson,
        payloadJson,
      ],
    );

    return {
      received: true,
      providerCode,
      liveProcessing: false,
      reason:
        'El adaptador de pagos queda listo, pero sin credenciales no se procesa el evento real.',
    };
  }

  private verifyKapsoSignature(
    payloadJson: string,
    signatureHeader: string | undefined,
    secret: string,
  ) {
    if (!signatureHeader) {
      return false;
    }

    const computedSignature = createHmac('sha256', secret)
      .update(payloadJson)
      .digest('hex');

    return secureCompare(computedSignature, signatureHeader);
  }

  private async handleKapsoPhoneNumberCreated(data: Record<string, unknown>) {
    const customer = asRecord(data.customer);
    const customerId =
      typeof customer?.id === 'string' ? customer.id.trim() : null;
    const phoneNumberId =
      typeof data.phone_number_id === 'string'
        ? data.phone_number_id.trim()
        : null;

    if (!customerId || !phoneNumberId) {
      return;
    }

    await this.database.query(
      `
        update public.whatsapp_channels
        set
          provider = 'kapso_platform',
          provider_phone_number_id = $2,
          status = 'connected',
          connected_at = coalesce(connected_at, now()),
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'kapso_customer_id', $1,
              'kapso_phone_number_id', $2,
              'kapso_project_webhook_last_event_at', now()
            ),
          updated_at = now()
        where id = (
          select id
          from public.whatsapp_channels
          where metadata ->> 'kapso_customer_id' = $1
          order by created_at asc
          limit 1
        )
      `,
      [customerId, phoneNumberId],
    );
  }

  private async extractKapsoMetaRouting(payload: Record<string, unknown>) {
    const { value } = getNestedMetaValue(payload);
    const metadata = asRecord(value.metadata) ?? {};
    const phoneNumberId =
      typeof metadata.phone_number_id === 'string'
        ? metadata.phone_number_id
        : null;
    const providerEventId = extractMessageOrStatusId(value) ?? phoneNumberId;

    if (!phoneNumberId) {
      return {
        organizationId: null as string | null,
        channelId: null as string | null,
        providerEventId,
        dedupeKey: providerEventId ?? md5(stringifyPayload(payload)),
      };
    }

    const channelResult = await this.database.query<{
      id: string;
      organization_id: string;
    }>(
      `
        select id, organization_id
        from public.whatsapp_channels
        where provider_phone_number_id = $1
        order by created_at asc
        limit 1
      `,
      [phoneNumberId],
    );

    return {
      organizationId: channelResult.rows[0]?.organization_id ?? null,
      channelId: channelResult.rows[0]?.id ?? null,
      providerEventId,
      dedupeKey: providerEventId ?? md5(stringifyPayload(payload)),
    };
  }

  private async processKapsoMetaEvent(params: {
    providerEventId: string;
    organizationId: string;
    channelId: string;
    payload: Record<string, unknown>;
  }) {
    const { value } = getNestedMetaValue(params.payload);
    const contacts = Array.isArray(value.contacts)
      ? value.contacts.filter(isRecord)
      : [];
    const messages = Array.isArray(value.messages)
      ? value.messages.filter(isRecord)
      : [];
    const statuses = Array.isArray(value.statuses)
      ? value.statuses.filter(isRecord)
      : [];

    for (const message of messages) {
      await this.processInboundMessage({
        providerEventId: params.providerEventId,
        organizationId: params.organizationId,
        channelId: params.channelId,
        message,
        contacts,
      });
    }

    for (const status of statuses) {
      await this.processStatusUpdate({
        providerEventId: params.providerEventId,
        organizationId: params.organizationId,
        channelId: params.channelId,
        status,
      });
    }
  }

  private async processInboundMessage(params: {
    providerEventId: string;
    organizationId: string;
    channelId: string;
    message: Record<string, unknown>;
    contacts: Array<Record<string, unknown>>;
  }) {
    const providerMessageId =
      typeof params.message.id === 'string' ? params.message.id : null;
    const waId =
      typeof params.message.from === 'string' ? params.message.from : null;

    if (!providerMessageId || !waId) {
      return;
    }

    const whatsapp = normalizeRecipientPhone(waId);

    if (!whatsapp) {
      return;
    }

    const messageType = this.normalizeInboundMessageType(params.message);
    const body = this.extractInboundBody(params.message);
    const occurredAt = toTimestamp(params.message.timestamp);
    const contact = params.contacts.find((item) => item.wa_id === waId) ?? null;
    const profile = asRecord(contact?.profile);
    const fullName =
      typeof profile?.name === 'string' ? profile.name.trim() : null;

    await this.database.withTransaction(async (client) => {
      const customerResult = await client.query<{ id: string }>(
        `
          insert into public.customers (
            organization_id,
            whatsapp_e164,
            full_name,
            lead_temperature,
            preferred_language,
            last_seen_at,
            metadata
          )
          values ($1, $2, $3, 'warm', 'es-DO', $4::timestamptz, $5::jsonb)
          on conflict (organization_id, whatsapp_e164)
          do update set
            full_name = coalesce(excluded.full_name, public.customers.full_name),
            last_seen_at = excluded.last_seen_at,
            metadata = coalesce(public.customers.metadata, '{}'::jsonb) || excluded.metadata
          returning id
        `,
        [
          params.organizationId,
          whatsapp,
          fullName,
          occurredAt,
          JSON.stringify({
            source: 'kapso_meta_webhook',
            wa_id: waId,
          }),
        ],
      );

      const customerId = customerResult.rows[0]?.id;

      if (!customerId) {
        return;
      }

      const conversationResult = await client.query<{
        id: string;
        ai_paused: boolean;
      }>(
        `
          insert into public.conversations (
            organization_id,
            channel_id,
            customer_id,
            status,
            lead_temperature,
            last_customer_message_at,
            last_message_at
          )
          values ($1, $2, $3, 'open', 'warm', $4::timestamptz, $4::timestamptz)
          on conflict (organization_id, channel_id, customer_id)
          where status in ('open', 'waiting_customer', 'waiting_human', 'awaiting_payment', 'paid')
          do update set
            status = 'open',
            last_customer_message_at = excluded.last_customer_message_at,
            last_message_at = excluded.last_message_at,
            updated_at = now()
          returning id, ai_paused
        `,
        [params.organizationId, params.channelId, customerId, occurredAt],
      );

      const conversation = conversationResult.rows[0];
      const conversationId = conversation?.id;

      if (!conversationId) {
        return;
      }

      const messageResult = await client.query<{ id: string }>(
        `
          insert into public.messages (
            organization_id,
            channel_id,
            conversation_id,
            customer_id,
            provider_message_id,
            direction,
            sender_type,
            body,
            message_type,
            current_status,
            current_status_at,
            external_created_at,
            payload
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            'inbound',
            'customer',
            $6,
            $7,
            'received',
            $8::timestamptz,
            $8::timestamptz,
            $9::jsonb
          )
          on conflict (channel_id, provider_message_id)
          do update set
            body = excluded.body,
            message_type = excluded.message_type,
            current_status = 'received',
            current_status_at = excluded.current_status_at,
            external_created_at = coalesce(public.messages.external_created_at, excluded.external_created_at),
            payload = coalesce(public.messages.payload, '{}'::jsonb) || excluded.payload
          returning id
        `,
        [
          params.organizationId,
          params.channelId,
          conversationId,
          customerId,
          providerMessageId,
          body,
          messageType,
          occurredAt,
          JSON.stringify({
            source: 'kapso_meta_webhook',
            raw_message: params.message,
            raw_contact: contact,
          }),
        ],
      );

      const messageId = messageResult.rows[0]?.id;

      if (!messageId) {
        return;
      }

      await client.query(
        `
          insert into public.message_status_events (
            organization_id,
            message_id,
            conversation_id,
            channel_id,
            provider_message_id,
            provider_event_id,
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
            $6,
            'received',
            'kapso_meta_inbound',
            $7::timestamptz,
            $8::jsonb
          )
          on conflict (message_id, provider_event_id)
          do nothing
        `,
        [
          params.organizationId,
          messageId,
          conversationId,
          params.channelId,
          providerMessageId,
          params.providerEventId,
          occurredAt,
          JSON.stringify({
            source: 'kapso_meta_webhook',
          }),
        ],
      );

      await this.insertScheduledJob(client, {
        organizationId: params.organizationId,
        jobType: 'generic',
        dedupeKey: `${params.organizationId}:summary:${conversationId}`,
        conversationId,
        customerId,
        payload: {
          action: 'refresh_conversation_summary',
        },
      });

      if (!conversation.ai_paused) {
        await this.insertScheduledJob(client, {
          organizationId: params.organizationId,
          jobType: 'generic',
          dedupeKey: `${params.organizationId}:auto-reply:${messageId}`,
          conversationId,
          customerId,
          payload: {
            action: 'auto_reply_inbound',
            inboundMessageId: messageId,
          },
        });
      }
    });
  }

  private async processStatusUpdate(params: {
    providerEventId: string;
    organizationId: string;
    channelId: string;
    status: Record<string, unknown>;
  }) {
    const providerMessageId =
      typeof params.status.id === 'string' ? params.status.id : null;

    if (!providerMessageId) {
      return;
    }

    const canonicalStatus = this.toCanonicalStatus(params.status.status);

    if (!canonicalStatus) {
      return;
    }

    const occurredAt = toTimestamp(params.status.timestamp);
    const error = this.extractStatusError(params.status);

    await this.database.withTransaction(async (client) => {
      const messageResult = await client.query<{
        id: string;
        conversation_id: string;
      }>(
        `
          select id, conversation_id
          from public.messages
          where organization_id = $1
            and channel_id = $2
            and provider_message_id = $3
          limit 1
        `,
        [params.organizationId, params.channelId, providerMessageId],
      );

      const message = messageResult.rows[0];

      if (!message) {
        return;
      }

      await client.query(
        `
          update public.messages
          set
            current_status = $4,
            current_status_at = $5::timestamptz,
            sent_at = case when $4 = 'sent' then coalesce(sent_at, $5::timestamptz) else sent_at end,
            delivered_at = case when $4 = 'delivered' then coalesce(delivered_at, $5::timestamptz) else delivered_at end,
            read_at = case when $4 = 'read' then coalesce(read_at, $5::timestamptz) else read_at end,
            failed_at = case when $4 = 'failed' then coalesce(failed_at, $5::timestamptz) else failed_at end,
            last_error_code = case when $4 = 'failed' then $6 else null end,
            last_error_at = case when $4 = 'failed' then $5::timestamptz else null end
          where organization_id = $1
            and id = $2
            and channel_id = $3
        `,
        [
          params.organizationId,
          message.id,
          params.channelId,
          canonicalStatus,
          occurredAt,
          error.code,
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
            provider_event_id,
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
            $5,
            $6,
            $7,
            $8,
            $9::timestamptz,
            $10,
            $11,
            $12::jsonb,
            $13::jsonb
          )
          on conflict (message_id, provider_event_id)
          do nothing
        `,
        [
          params.organizationId,
          message.id,
          message.conversation_id,
          params.channelId,
          providerMessageId,
          params.providerEventId,
          canonicalStatus,
          typeof params.status.status === 'string'
            ? params.status.status
            : null,
          occurredAt,
          error.code,
          error.title,
          JSON.stringify(error.payload),
          JSON.stringify({
            source: 'kapso_meta_webhook',
          }),
        ],
      );
    });
  }

  private normalizeInboundMessageType(message: Record<string, unknown>) {
    const type = typeof message.type === 'string' ? message.type : 'text';
    const supportedTypes = new Set([
      'text',
      'interactive',
      'image',
      'video',
      'audio',
      'document',
      'template',
      'system',
    ]);

    return supportedTypes.has(type) ? type : 'text';
  }

  private extractInboundBody(message: Record<string, unknown>) {
    const type = typeof message.type === 'string' ? message.type : 'text';

    if (type === 'text') {
      const text = asRecord(message.text);
      return typeof text?.body === 'string' ? text.body : null;
    }

    if (type === 'interactive') {
      const interactive = asRecord(message.interactive);
      const buttonReply = asRecord(interactive?.button_reply);
      const listReply = asRecord(interactive?.list_reply);

      return (
        (typeof buttonReply?.title === 'string' ? buttonReply.title : null) ??
        (typeof listReply?.title === 'string' ? listReply.title : null)
      );
    }

    if (type === 'image' || type === 'video' || type === 'document') {
      const attachment = asRecord(message[type]);
      return typeof attachment?.caption === 'string'
        ? attachment.caption
        : null;
    }

    return null;
  }

  private toCanonicalStatus(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    switch (value) {
      case 'sent':
      case 'delivered':
      case 'read':
      case 'failed':
        return value;
      default:
        return null;
    }
  }

  private extractStatusError(
    status: Record<string, unknown>,
  ): ProviderStatusError {
    const firstError = firstObjectFromUnknownArray(status.errors);

    if (!firstError) {
      return {
        code: null,
        title: null,
        payload: {},
      };
    }

    return {
      code:
        typeof firstError.code === 'number'
          ? firstError.code.toString()
          : typeof firstError.code === 'string'
            ? firstError.code
            : null,
      title:
        typeof firstError.title === 'string'
          ? firstError.title
          : typeof firstError.message === 'string'
            ? firstError.message
            : null,
      payload: firstError,
    };
  }

  private async insertScheduledJob(
    client: PoolClient,
    input: {
      organizationId: string;
      jobType: 'generic';
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
}
