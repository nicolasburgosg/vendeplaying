import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { assertDevRoutesEnabled } from './internal-auth';

type SyntheticConversationPayload = {
  organizationId?: string;
  customerName?: string;
  whatsapp?: string;
  message?: string;
};

type SyntheticPaymentPayload = {
  organizationId?: string;
  orderId?: string;
  providerCode?: string;
  status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
};

type SyntheticMessageStatusPayload = {
  organizationId?: string;
  messageId?: string;
  status?: 'accepted' | 'sent' | 'delivered' | 'read' | 'failed';
  errorCode?: string;
  errorTitle?: string;
};

@Controller('dev')
export class DevController {
  constructor(private readonly database: DatabaseService) {}

  @Post('synthetic-conversation')
  async createSyntheticConversation(
    @Body() body: SyntheticConversationPayload,
  ) {
    assertDevRoutesEnabled();

    const organizationId = body.organizationId?.trim();
    const whatsapp = body.whatsapp?.trim();
    const message = body.message?.trim();

    if (!organizationId || !whatsapp || !message) {
      throw new ForbiddenException(
        'organizationId, whatsapp y message son obligatorios.',
      );
    }

    const channelResult = await this.database.query<{
      id: string;
    }>(
      `
        select id
        from public.whatsapp_channels
        where organization_id = $1
        order by created_at asc
        limit 1
      `,
      [organizationId],
    );

    if (channelResult.rows.length === 0) {
      throw new ForbiddenException(
        'Crea primero un canal de WhatsApp para el negocio.',
      );
    }

    const customerResult = await this.database.query<{
      id: string;
    }>(
      `
        insert into public.customers (
          organization_id,
          whatsapp_e164,
          full_name,
          lead_temperature,
          preferred_language,
          last_seen_at
        )
        values ($1, $2, $3, 'warm', 'es-DO', now())
        on conflict (organization_id, whatsapp_e164)
        do update set
          full_name = excluded.full_name,
          last_seen_at = now()
        returning id
      `,
      [organizationId, whatsapp, body.customerName?.trim() || null],
    );

    const customerId = customerResult.rows[0].id;
    const channelId = channelResult.rows[0].id;

    const conversationResult = await this.database.query<{
      id: string;
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
        values ($1, $2, $3, 'open', 'warm', now(), now())
        on conflict (organization_id, channel_id, customer_id)
        where status in ('open', 'waiting_customer', 'waiting_human', 'awaiting_payment', 'paid')
        do update set
          last_customer_message_at = now(),
          last_message_at = now()
        returning id
      `,
      [organizationId, channelId, customerId],
    );

    const conversationId = conversationResult.rows[0].id;

    const messageResult = await this.database.query<{
      id: string;
    }>(
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
          external_created_at,
          payload
        )
        values (
          $1,
          $2,
          $3,
          $4,
          'inbound',
          'customer',
          $5,
          'text',
          'received',
          now(),
          now(),
          jsonb_build_object('source', 'synthetic')
        )
        returning id
      `,
      [organizationId, channelId, conversationId, customerId, message],
    );

    await this.database.query(
      `
        insert into public.message_status_events (
          organization_id,
          message_id,
          conversation_id,
          channel_id,
          canonical_status,
          provider_status,
          occurred_at,
          metadata
        )
        values ($1, $2, $3, $4, 'received', 'synthetic', now(), '{"source":"synthetic"}')
      `,
      [organizationId, messageResult.rows[0].id, conversationId, channelId],
    );

    return {
      organizationId,
      customerId,
      conversationId,
      messageId: messageResult.rows[0].id,
    };
  }

  @Post('synthetic-payment')
  async createSyntheticPayment(@Body() body: SyntheticPaymentPayload) {
    assertDevRoutesEnabled();

    const organizationId = body.organizationId?.trim();
    const orderId = body.orderId?.trim();
    const providerCode = body.providerCode?.trim() || 'cardnet';
    const requestedStatus = body.status ?? 'paid';

    if (!organizationId || !orderId) {
      throw new ForbiddenException(
        'organizationId y orderId son obligatorios.',
      );
    }

    const orderResult = await this.database.query<{
      id: string;
      total_amount: string;
      currency_code: string;
      conversation_id: string | null;
    }>(
      `
        select id, total_amount::text, currency_code, conversation_id
        from public.orders
        where organization_id = $1
          and id = $2
        limit 1
      `,
      [organizationId, orderId],
    );

    if (orderResult.rows.length === 0) {
      throw new ForbiddenException('No encontramos el pedido indicado.');
    }

    const order = orderResult.rows[0];

    const attemptResult = await this.database.query<{
      id: string;
    }>(
      `
        insert into public.payment_attempts (
          organization_id,
          order_id,
          conversation_id,
          provider_code,
          method_type_code,
          capture_mode_code,
          amount,
          currency_code,
          status,
          provider_status,
          completed_at,
          amount_captured,
          captured_at,
          provider_metadata
        )
        values (
          $1,
          $2,
          $3,
          $4,
          'payment_link',
          'sale',
          $5::numeric,
          $6,
          $7,
          $8,
          case when $7 in ('paid', 'failed', 'cancelled', 'refunded') then now() else null end,
          case when $7 = 'paid' then $5::numeric else null end,
          case when $7 = 'paid' then now() else null end,
          jsonb_build_object('source', 'synthetic')
        )
        returning id
      `,
      [
        organizationId,
        orderId,
        order.conversation_id,
        providerCode,
        order.total_amount,
        order.currency_code,
        requestedStatus,
        requestedStatus,
      ],
    );

    const paymentAttemptId = attemptResult.rows[0].id;

    await this.database.query(
      `
        insert into public.payment_events (
          organization_id,
          payment_attempt_id,
          order_id,
          provider_code,
          event_type,
          normalized_status,
          provider_status,
          amount,
          currency_code,
          payload
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::numeric,
          $9,
          jsonb_build_object('source', 'synthetic')
        )
      `,
      [
        organizationId,
        paymentAttemptId,
        orderId,
        providerCode,
        requestedStatus === 'paid'
          ? 'webhook_paid'
          : requestedStatus === 'failed'
            ? 'webhook_failed'
            : requestedStatus === 'refunded'
              ? 'refund_recorded'
              : 'checkout_created',
        requestedStatus,
        requestedStatus,
        order.total_amount,
        order.currency_code,
      ],
    );

    await this.database.query(
      `
        update public.orders
        set
          payment_status = $3,
          status = case
            when $3 = 'paid' then 'paid'
            when $3 in ('failed', 'cancelled') then 'awaiting_payment'
            when $3 = 'refunded' then 'cancelled'
            else status
          end,
          paid_at = case when $3 = 'paid' then now() else paid_at end,
          updated_at = now()
        where organization_id = $1
          and id = $2
      `,
      [
        organizationId,
        orderId,
        requestedStatus === 'failed' ? 'failed' : requestedStatus,
      ],
    );

    if (order.conversation_id) {
      await this.database.query(
        `
          update public.conversations
          set
            status = case
              when $3 = 'paid' then 'paid'
              else status
            end,
            updated_at = now()
          where organization_id = $1
            and id = $2
        `,
        [organizationId, order.conversation_id, requestedStatus],
      );
    }

    return {
      organizationId,
      orderId,
      paymentAttemptId,
      status: requestedStatus,
    };
  }

  @Post('synthetic-message-status')
  async createSyntheticMessageStatus(
    @Body() body: SyntheticMessageStatusPayload,
  ) {
    assertDevRoutesEnabled();

    const organizationId = body.organizationId?.trim();
    const messageId = body.messageId?.trim();
    const status = body.status ?? 'sent';

    if (!organizationId || !messageId) {
      throw new ForbiddenException(
        'organizationId y messageId son obligatorios.',
      );
    }

    const messageResult = await this.database.query<{
      conversation_id: string;
      channel_id: string;
      provider_message_id: string | null;
    }>(
      `
        select conversation_id, channel_id, provider_message_id
        from public.messages
        where organization_id = $1
          and id = $2
        limit 1
      `,
      [organizationId, messageId],
    );

    if (messageResult.rows.length === 0) {
      throw new ForbiddenException('No encontramos el mensaje indicado.');
    }

    const message = messageResult.rows[0];

    await this.database.query(
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
          error_code,
          error_title,
          metadata
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'synthetic',
          now(),
          $7,
          $8,
          jsonb_build_object('source', 'synthetic')
        )
      `,
      [
        organizationId,
        messageId,
        message.conversation_id,
        message.channel_id,
        message.provider_message_id,
        status,
        body.errorCode?.trim() || null,
        body.errorTitle?.trim() || null,
      ],
    );

    await this.database.query(
      `
        update public.messages
        set
          current_status = $3,
          current_status_at = now(),
          last_error_code = case when $3 = 'failed' then $4 else null end,
          last_error_at = case when $3 = 'failed' then now() else null end
        where organization_id = $1
          and id = $2
      `,
      [organizationId, messageId, status, body.errorCode?.trim() || null],
    );

    return {
      organizationId,
      messageId,
      status,
    };
  }
}
