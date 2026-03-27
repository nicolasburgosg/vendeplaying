import { NextResponse, type NextRequest } from "next/server";
import {
  canRegisterKapsoMetaWebhook,
  canRegisterKapsoProjectWebhook,
  ensureKapsoMetaWebhook,
  ensureKapsoProjectWebhook,
} from "@/lib/kapso";
import { getSiteUrl } from "@/lib/supabase/config";
import { runQuery } from "@/lib/server/postgres";

function buildFailureUrl(request: NextRequest, reason: string) {
  const failureUrl = new URL("/kapso/connect/failure", getSiteUrl());
  failureUrl.searchParams.set("reason", reason);
  return failureUrl;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const channelId = url.searchParams.get("channelId");
  const status = url.searchParams.get("status");
  const phoneNumberId = url.searchParams.get("phone_number_id");
  const businessAccountId = url.searchParams.get("business_account_id");
  const setupLinkId = url.searchParams.get("setup_link_id");
  const displayPhoneNumber = url.searchParams.get("display_phone_number");

  if (!organizationId || !channelId) {
    return NextResponse.redirect(buildFailureUrl(request, "missing-context"));
  }

  if (status !== "completed" || !phoneNumberId) {
    return NextResponse.redirect(buildFailureUrl(request, "setup-not-complete"));
  }

  try {
    const updateResult = await runQuery<{ id: string }>(
      `
        update public.whatsapp_channels
        set
          provider = 'kapso_platform',
          status = 'connected',
          provider_phone_number_id = $3::text,
          provider_business_account_id = coalesce($4::text, provider_business_account_id),
          phone_e164 = coalesce($5::text, phone_e164),
          connected_at = coalesce(connected_at, now()),
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'kapso_phone_number_id', $3::text,
              'kapso_setup_link_id', $6::text,
              'kapso_setup_status', 'completed',
              'kapso_setup_error', null
            ),
          updated_at = now()
        where organization_id = $1
          and id = $2
        returning id
      `,
      [
        organizationId,
        channelId,
        phoneNumberId,
        businessAccountId,
        displayPhoneNumber,
        setupLinkId,
      ],
    );

    if (updateResult.rows.length === 0) {
      return NextResponse.redirect(buildFailureUrl(request, "channel-not-found"));
    }

    let projectWebhookId: string | null = null;
    let metaWebhookId: string | null = null;
    const projectWebhookSkipped = !canRegisterKapsoProjectWebhook();
    const metaWebhookSkipped = !canRegisterKapsoMetaWebhook();
    const webhooksSkipped = projectWebhookSkipped && metaWebhookSkipped;
    let projectWebhookError: string | null = null;
    let metaWebhookError: string | null = null;

    if (!projectWebhookSkipped) {
      try {
        const projectWebhook = await ensureKapsoProjectWebhook();
        projectWebhookId = projectWebhook?.id ?? null;
      } catch (error) {
        projectWebhookError =
          error instanceof Error ? error.message : "No pudimos registrar el webhook del proyecto.";
      }
    }

    if (!metaWebhookSkipped) {
      try {
        const metaWebhook = await ensureKapsoMetaWebhook(phoneNumberId);
        metaWebhookId = metaWebhook?.id ?? null;
      } catch (error) {
        metaWebhookError =
          error instanceof Error ? error.message : "No pudimos registrar el webhook del numero.";
      }
    }

    const webhookRegistered = Boolean(projectWebhookId || metaWebhookId);

    await runQuery(
      `
        update public.whatsapp_channels
        set
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'kapso_project_webhook_id', $3::text,
              'kapso_meta_webhook_id', $4::text,
              'kapso_webhooks_registered_at', case when $10::boolean = true then now() else null end,
              'kapso_webhooks_skipped', $5::boolean,
              'kapso_project_webhook_skipped', $6::boolean,
              'kapso_meta_webhook_skipped', $7::boolean,
              'kapso_project_webhook_error', $8::text,
              'kapso_meta_webhook_error', $9::text
            ),
          updated_at = now()
        where organization_id = $1
          and id = $2
      `,
      [
        organizationId,
        channelId,
        projectWebhookId,
        metaWebhookId,
        webhooksSkipped,
        projectWebhookSkipped,
        metaWebhookSkipped,
        projectWebhookError,
        metaWebhookError,
        webhookRegistered,
      ],
    );

    const redirectUrl = new URL("/app/configuracion", getSiteUrl());
    redirectUrl.searchParams.set("kapso", webhooksSkipped ? "connected-local" : "connected");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase().replace(/\s+/g, "-") : "unknown";
    return NextResponse.redirect(buildFailureUrl(request, message));
  }
}
