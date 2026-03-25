import "server-only";

import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/server/postgres";

type ScheduleJobInput = {
  organizationId: string;
  jobType:
    | "send_whatsapp_message"
    | "run_follow_up"
    | "payment_reconcile"
    | "refresh_catalog"
    | "recalc_lead_score"
    | "generic";
  payload?: Record<string, unknown>;
  availableAt?: string;
  priority?: number;
  maxAttempts?: number;
  dedupeKey?: string | null;
  followUpRuleId?: string | null;
  conversationId?: string | null;
  orderId?: string | null;
  customerId?: string | null;
  paymentAttemptId?: string | null;
};

async function insertScheduledJob(
  client: PoolClient,
  input: ScheduleJobInput,
) {
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

export async function enqueueScheduledJob(input: ScheduleJobInput) {
  await withTransaction(async (client) => {
    await insertScheduledJob(client, input);
  });
}

export async function cancelConversationFollowUps(params: {
  organizationId: string;
  conversationId: string;
  reason: string;
}) {
  await withTransaction(async (client) => {
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
  });
}

export async function cancelOrderRelatedJobs(params: {
  organizationId: string;
  orderId: string;
  reason: string;
}) {
  await withTransaction(async (client) => {
    await client.query(
      `
        update internal.scheduled_jobs
        set
          status = 'cancelled',
          last_error = $3,
          completed_at = now(),
          updated_at = now()
        where organization_id = $1
          and order_id = $2
          and job_type in ('run_follow_up', 'payment_reconcile')
          and status in ('queued', 'locked')
      `,
      [params.organizationId, params.orderId, params.reason],
    );
  });
}

export async function scheduleFollowUpsForConversation(params: {
  organizationId: string;
  conversationId: string;
  customerId: string;
  orderId?: string | null;
  triggerType:
    | "abandoned_cart"
    | "payment_reminder"
    | "awaiting_customer"
    | "order_status_update"
    | "manual";
}) {
  await withTransaction(async (client) => {
    const rulesResult = await client.query<{
      id: string;
      delay_minutes: number;
      trigger_type: string;
      target_type: string;
    }>(
      `
        select id, delay_minutes, trigger_type, target_type
        from public.follow_up_rules
        where organization_id = $1
          and is_active = true
          and trigger_type = $2
      `,
      [params.organizationId, params.triggerType],
    );

    for (const rule of rulesResult.rows) {
      await insertScheduledJob(client, {
        organizationId: params.organizationId,
        jobType: "run_follow_up",
        availableAt: new Date(Date.now() + rule.delay_minutes * 60_000).toISOString(),
        dedupeKey: `${params.organizationId}:${rule.id}:${params.conversationId}:${params.orderId ?? "none"}`,
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
  });
}

export async function scheduleConversationSummary(params: {
  organizationId: string;
  conversationId: string;
}) {
  await enqueueScheduledJob({
    organizationId: params.organizationId,
    jobType: "generic",
    dedupeKey: `${params.organizationId}:summary:${params.conversationId}`,
    conversationId: params.conversationId,
    payload: {
      action: "refresh_conversation_summary",
    },
  });
}
