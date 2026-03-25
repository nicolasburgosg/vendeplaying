import "server-only";

import { getSiteUrl } from "@/lib/supabase/config";

type KapsoCustomer = {
  id: string;
  name: string;
  external_customer_id: string | null;
};

type KapsoSetupLink = {
  id: string;
  url: string;
  status: string;
  expires_at: string | null;
  success_redirect_url: string | null;
  failure_redirect_url: string | null;
  whatsapp_setup_status: string | null;
  whatsapp_setup_error: string | null;
};

type KapsoWebhook = {
  id: string;
  url: string;
  kind: string;
  active: boolean;
  phone_number_id: string | null;
  events: string[] | null;
};

type KapsoListResponse<T> = {
  data: T[];
};

type KapsoSingleResponse<T> = {
  data: T;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta ${name} en este entorno.`);
  }

  return value;
}

export function getKapsoApiBaseUrl() {
  return (
    process.env.VENDETO_KAPSO_API_BASE_URL?.trim().replace(/\/+$/, "") ??
    "https://api.kapso.ai/platform/v1"
  );
}

export function getKapsoApiKey() {
  return requireEnv("VENDETO_KAPSO_API_KEY");
}

export function getKapsoProjectWebhookSecret() {
  return requireEnv("VENDETO_KAPSO_PROJECT_WEBHOOK_SECRET");
}

export function getKapsoMetaWebhookToken() {
  return requireEnv("VENDETO_KAPSO_META_WEBHOOK_TOKEN");
}

export function getKapsoPublicApiUrl() {
  return (
    process.env.VENDETO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ??
    "http://127.0.0.1:4000/api"
  );
}

export function canRegisterKapsoWebhooks() {
  try {
    const url = new URL(getKapsoPublicApiUrl());

    if (url.protocol !== "https:") {
      return false;
    }

    return !["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function getKapsoProjectWebhookUrl() {
  return `${getKapsoPublicApiUrl()}/webhooks/whatsapp/kapso/project`;
}

export function getKapsoMetaWebhookUrl() {
  const token = encodeURIComponent(getKapsoMetaWebhookToken());
  return `${getKapsoPublicApiUrl()}/webhooks/whatsapp/kapso/meta?token=${token}`;
}

async function kapsoFetch<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${getKapsoApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": getKapsoApiKey(),
      ...(init.headers ?? {}),
    },
  });

  let payload: Record<string, unknown> | null = null;

  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : `Kapso devolvió ${response.status}.`;

    throw new Error(message);
  }

  return payload as T;
}

export async function ensureKapsoCustomer(params: {
  externalCustomerId: string;
  name: string;
}) {
  const query = new URLSearchParams({
    external_customer_id: params.externalCustomerId,
    per_page: "1",
  });

  const existing = await kapsoFetch<KapsoListResponse<KapsoCustomer>>(
    `/customers?${query.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  const customer = existing.data[0];

  if (customer) {
    return customer;
  }

  const created = await kapsoFetch<KapsoSingleResponse<KapsoCustomer>>(
    "/customers",
    {
      method: "POST",
      body: JSON.stringify({
        customer: {
          name: params.name,
          external_customer_id: params.externalCustomerId,
        },
      }),
    },
  );

  return created.data;
}

export async function createKapsoSetupLink(params: {
  customerId: string;
  organizationId: string;
  channelId: string;
}) {
  const siteUrl = getSiteUrl().replace(/\/+$/, "");
  const successUrl = new URL(`${siteUrl}/kapso/connect/success`);
  successUrl.searchParams.set("organizationId", params.organizationId);
  successUrl.searchParams.set("channelId", params.channelId);

  const failureUrl = new URL(`${siteUrl}/kapso/connect/failure`);
  failureUrl.searchParams.set("organizationId", params.organizationId);
  failureUrl.searchParams.set("channelId", params.channelId);

  const created = await kapsoFetch<KapsoSingleResponse<KapsoSetupLink>>(
    `/customers/${params.customerId}/setup_links`,
    {
      method: "POST",
      body: JSON.stringify({
        setup_link: {
          success_redirect_url: successUrl.toString(),
          failure_redirect_url: failureUrl.toString(),
        },
      }),
    },
  );

  return created.data;
}

export async function listKapsoProjectWebhooks() {
  const response = await kapsoFetch<KapsoListResponse<KapsoWebhook>>(
    "/whatsapp/webhooks",
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
}

export async function ensureKapsoProjectWebhook() {
  if (!canRegisterKapsoWebhooks()) {
    return null;
  }

  const targetUrl = getKapsoProjectWebhookUrl();
  const existing = await listKapsoProjectWebhooks();
  const matched = existing.find((webhook) => {
    return (
      webhook.url === targetUrl &&
      webhook.kind === "kapso" &&
      !webhook.phone_number_id &&
      webhook.events?.includes("whatsapp.phone_number.created")
    );
  });

  if (matched) {
    return matched;
  }

  const created = await kapsoFetch<KapsoSingleResponse<KapsoWebhook>>(
    "/whatsapp/webhooks",
    {
      method: "POST",
      body: JSON.stringify({
        whatsapp_webhook: {
          kind: "kapso",
          url: targetUrl,
          secret_key: getKapsoProjectWebhookSecret(),
          events: ["whatsapp.phone_number.created"],
          active: true,
        },
      }),
    },
  );

  return created.data;
}

export async function ensureKapsoMetaWebhook(phoneNumberId: string) {
  if (!canRegisterKapsoWebhooks()) {
    return null;
  }

  const targetUrl = getKapsoMetaWebhookUrl();
  const existing = await listKapsoProjectWebhooks();
  const matched = existing.find((webhook) => {
    return (
      webhook.url === targetUrl &&
      webhook.kind === "meta" &&
      webhook.phone_number_id === phoneNumberId
    );
  });

  if (matched) {
    return matched;
  }

  const created = await kapsoFetch<KapsoSingleResponse<KapsoWebhook>>(
    `/whatsapp/phone_numbers/${phoneNumberId}/webhooks`,
    {
      method: "POST",
      body: JSON.stringify({
        whatsapp_webhook: {
          kind: "meta",
          url: targetUrl,
          active: true,
        },
      }),
    },
  );

  return created.data;
}
