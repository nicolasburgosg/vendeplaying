import { cache } from "react";
import { redirect } from "next/navigation";
import { getReadinessReport } from "@/lib/readiness";
import { runQuery } from "@/lib/server/postgres";
import type { Database } from "@/lib/supabase/database.types";
import { ensureOrganizationForUser, getActiveMembership } from "@/lib/organization";
import { createClient } from "@/lib/supabase/server";

type SellerProfileRow = Database["public"]["Tables"]["ai_seller_profiles"]["Row"];
type ChannelRow = Database["public"]["Tables"]["whatsapp_channels"]["Row"];
type PaymentConfigRow =
  Database["public"]["Tables"]["organization_payment_configs"]["Row"];
type OperationalJobRow = {
  id: string;
  job_type: string;
  status: string;
  available_at: string;
  last_error: string | null;
  updated_at: string;
  conversation_id: string | null;
  order_id: string | null;
  latest_run_status: string | null;
  latest_run_error: string | null;
  latest_run_finished_at: string | null;
};

const ACTIVE_CONVERSATION_STATUSES = [
  "open",
  "waiting_customer",
  "waiting_human",
  "awaiting_payment",
  "paid",
];

function getChannelStatusLabel(status?: string | null) {
  switch (status) {
    case "connected":
      return "WhatsApp conectado";
    case "pending_verification":
      return "WhatsApp pendiente de conexión";
    case "paused":
      return "Canal pausado";
    case "error":
      return "Canal con error";
    case "disconnected":
      return "Canal desconectado";
    default:
      return "WhatsApp sin configurar";
  }
}

function toMapById<T extends { id: string }>(items: T[]) {
  return Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>;
}

function toMapByKey<T>(items: T[], keyGetter: (item: T) => string | null | undefined) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyGetter(item);

    if (!key) {
      return acc;
    }

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(item);
    return acc;
  }, {});
}

async function getOperationalJobs(organizationId: string) {
  const result = await runQuery<OperationalJobRow>(
    `
      select
        jobs.id,
        jobs.job_type,
        jobs.status,
        jobs.available_at,
        jobs.last_error,
        jobs.updated_at,
        jobs.conversation_id,
        jobs.order_id,
        latest_run.status as latest_run_status,
        latest_run.error_message as latest_run_error,
        latest_run.finished_at as latest_run_finished_at
      from internal.scheduled_jobs jobs
      left join lateral (
        select runs.status, runs.error_message, runs.finished_at
        from internal.job_runs runs
        where runs.job_id = jobs.id
        order by runs.started_at desc
        limit 1
      ) latest_run on true
      where jobs.organization_id = $1
      order by jobs.updated_at desc
      limit 12
    `,
    [organizationId],
  );

  return result.rows;
}

export const getMerchantContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  let membership = await getActiveMembership(supabase, user.id);

  if (!membership) {
    await ensureOrganizationForUser(supabase, user);
    membership = await getActiveMembership(supabase, user.id);
  }

  if (!membership) {
    redirect("/registro");
  }

  const organizationId = membership.organization_id;

  const [organizationResult, profileResult, sellerResult, channelResult] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, slug, default_locale, timezone, currency_code, industry")
        .eq("id", organizationId)
        .single(),
      supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", user.id)
        .single(),
      supabase
        .from("ai_seller_profiles")
        .select(
          "id, seller_name, tone, language_code, sales_style, message_length, is_active, welcome_message, human_handoff_message, purchase_confirmation_message, company_description, target_audience, special_instructions, forbidden_words, use_emojis",
        )
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("whatsapp_channels")
        .select(
          "id, status, phone_e164, display_name, provider, provider_phone_number_id, provider_business_account_id, connected_at, quality_rating, last_inbound_message_at, metadata",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  if (organizationResult.error) {
    throw new Error(organizationResult.error.message);
  }

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "sin-correo",
      fullName: profileResult.data.full_name ?? "Merchant",
    },
    organization: {
      id: organizationResult.data.id,
      name: organizationResult.data.name,
      slug: organizationResult.data.slug,
      defaultLocale: organizationResult.data.default_locale,
      timezone: organizationResult.data.timezone,
      currencyCode: organizationResult.data.currency_code,
      industry: organizationResult.data.industry,
      role: membership.role,
    },
    sellerProfile: sellerResult.data as SellerProfileRow | null,
    channel: channelResult.data as ChannelRow | null,
    channelStatusLabel: getChannelStatusLabel(channelResult.data?.status),
  };
});

export async function getSummaryPageData() {
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [
    conversationsResult,
    hotLeadsResult,
    paidOrdersResult,
    productsResult,
    recentConversationsResult,
    recentOrdersResult,
    automationsResult,
    paymentConfigsResult,
    operationJobs,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ACTIVE_CONVERSATION_STATUSES),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("lead_temperature", "hot"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("payment_status", "paid"),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
    supabase
      .from("conversations")
      .select(
        "id, customer_id, status, lead_temperature, last_message_at, summary, ai_paused",
      )
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false })
      .limit(6),
    supabase
      .from("orders")
      .select("id, order_number, total_amount, currency_code, status, payment_status, placed_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("follow_up_rules")
      .select("id, name, trigger_type, delay_minutes, is_active")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("organization_payment_configs")
      .select("*")
      .eq("organization_id", organizationId),
    getOperationalJobs(organizationId),
  ]);

  const conversationCustomerIds = (recentConversationsResult.data ?? []).map(
    (conversation) => conversation.customer_id,
  );

  const customerMap =
    conversationCustomerIds.length > 0
      ? toMapById(
          (
            await supabase
              .from("customers")
              .select("id, full_name, whatsapp_e164")
              .eq("organization_id", organizationId)
              .in("id", conversationCustomerIds)
          ).data ?? [],
        )
      : {};

  return {
    context,
    metrics: [
      {
        title: "Conversaciones activas",
        value: conversationsResult.count ?? 0,
        detail: "Inbox abierto, takeover y seguimiento comercial.",
      },
      {
        title: "Leads calientes",
        value: hotLeadsResult.count ?? 0,
        detail: "Clientes listos para empuje final o pago.",
      },
      {
        title: "Órdenes pagadas",
        value: paidOrdersResult.count ?? 0,
        detail: "Cobros confirmados dentro del flujo comercial.",
      },
      {
        title: "Productos cargados",
        value: productsResult.count ?? 0,
        detail: "Catálogo listo para conversación y cobro.",
      },
    ],
    recentConversations: (recentConversationsResult.data ?? []).map((conversation) => ({
      ...conversation,
      customer: customerMap[conversation.customer_id] ?? null,
    })),
    recentOrders: recentOrdersResult.data ?? [],
    automations: automationsResult.data ?? [],
    operationJobs,
    readiness: getReadinessReport({
      sellerProfile: context.sellerProfile,
      channel: context.channel,
      paymentConfigs:
        (paymentConfigsResult.data as PaymentConfigRow[] | null) ?? [],
    }),
  };
}

export async function getInboxPageData() {
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [conversationsResult, paymentConfigsResult] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id, customer_id, status, lead_temperature, last_message_at, summary, ai_paused, human_handoff_requested_at, channel_id",
      )
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false })
      .limit(20),
    supabase
      .from("organization_payment_configs")
      .select("*")
      .eq("organization_id", organizationId),
  ]);

  const conversations = conversationsResult.data ?? [];
  const customerIds = conversations.map((conversation) => conversation.customer_id);
  const conversationIds = conversations.map((conversation) => conversation.id);

  const [customersResult, messagesResult, ordersResult] = await Promise.all([
    customerIds.length > 0
      ? supabase
          .from("customers")
          .select("id, full_name, whatsapp_e164, lead_temperature")
          .eq("organization_id", organizationId)
          .in("id", customerIds)
      : Promise.resolve({
          data: [] as Database["public"]["Tables"]["customers"]["Row"][],
          error: null,
        }),
    conversationIds.length > 0
      ? supabase
          .from("messages")
          .select(
            "id, conversation_id, body, message_type, direction, sender_type, current_status, created_at, provider_message_id, order_id",
          )
          .eq("organization_id", organizationId)
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
          .limit(120)
      : Promise.resolve({
          data: [] as Database["public"]["Tables"]["messages"]["Row"][],
          error: null,
        }),
    customerIds.length > 0
      ? supabase
          .from("orders")
          .select(
            "id, order_number, customer_id, conversation_id, total_amount, currency_code, status, payment_status, fulfillment_status, created_at",
          )
          .eq("organization_id", organizationId)
          .in("customer_id", customerIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({
          data: [] as Database["public"]["Tables"]["orders"]["Row"][],
          error: null,
        }),
  ]);

  const messages = messagesResult.data ?? [];
  const messageIds = messages.map((message) => message.id);

  const statusEventsResult =
    messageIds.length > 0
      ? await supabase
          .from("message_status_events")
          .select(
            "id, message_id, canonical_status, provider_status, occurred_at, error_code, error_title",
          )
          .eq("organization_id", organizationId)
          .in("message_id", messageIds)
          .order("occurred_at", { ascending: false })
      : { data: [] as Database["public"]["Tables"]["message_status_events"]["Row"][] };

  const customerMap = toMapById(customersResult.data ?? []);
  const orders = ordersResult.data ?? [];

  return {
    context,
    conversations: conversations.map((conversation) => ({
      ...conversation,
      customer: customerMap[conversation.customer_id] ?? null,
    })),
    messagesByConversation: toMapByKey(messages, (message) => message.conversation_id),
    statusEventsByMessage: toMapByKey(
      statusEventsResult.data ?? [],
      (event) => event.message_id,
    ),
    linkedOrdersByConversation: toMapByKey(orders, (order) => order.conversation_id),
    ordersByCustomer: toMapByKey(orders, (order) => order.customer_id),
    readiness: getReadinessReport({
      sellerProfile: context.sellerProfile,
      channel: context.channel,
      paymentConfigs:
        (paymentConfigsResult.data as PaymentConfigRow[] | null) ?? [],
    }),
  };
}

export async function getCatalogPageData() {
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [productsResult, knowledgeResult, importsResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, price, compare_at_price, currency_code, status, stock_quantity, sku, source_type, updated_at, description, track_inventory, allow_backorder",
      )
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase
      .from("knowledge_items")
      .select("id, kind, category, title, question, is_active, updated_at")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("catalog_import_jobs")
      .select(
        "id, status, source_type, original_filename, total_rows, processed_rows, inserted_count, updated_count, error_count, warning_count, summary, updated_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const products = productsResult.data ?? [];
  const productIds = products.map((product) => product.id);
  const importJobs = importsResult.data ?? [];
  const importJobIds = importJobs.slice(0, 3).map((job) => job.id);

  const [variantsResult, mediaResult, importErrorsResult] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("product_variants")
          .select(
            "id, product_id, name, sku, stock_quantity, price_override, status, option_values, updated_at",
          )
          .eq("organization_id", organizationId)
          .in("product_id", productIds)
          .order("updated_at", { ascending: false })
          .limit(100)
      : Promise.resolve({
          data: [] as Database["public"]["Tables"]["product_variants"]["Row"][],
          error: null,
        }),
    productIds.length > 0
      ? supabase
          .from("product_media")
          .select("id, product_id, media_type, public_url, storage_path, is_primary, sort_order")
          .eq("organization_id", organizationId)
          .in("product_id", productIds)
          .order("sort_order", { ascending: true })
          .limit(100)
      : Promise.resolve({
          data: [] as Database["public"]["Tables"]["product_media"]["Row"][],
          error: null,
        }),
    importJobIds.length > 0
      ? supabase
          .from("catalog_import_row_errors")
          .select(
            "id, import_job_id, row_number, field_name, severity, error_code, error_message, created_at",
          )
          .eq("organization_id", organizationId)
          .in("import_job_id", importJobIds)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({
          data: [] as Database["public"]["Tables"]["catalog_import_row_errors"]["Row"][],
          error: null,
        }),
  ]);

  return {
    context,
    products,
    knowledgeItems: knowledgeResult.data ?? [],
    importJobs,
    productVariantsByProduct: toMapByKey(
      variantsResult.data ?? [],
      (variant) => variant.product_id,
    ),
    productMediaByProduct: toMapByKey(mediaResult.data ?? [], (media) => media.product_id),
    importErrorsByJob: toMapByKey(
      importErrorsResult.data ?? [],
      (error) => error.import_job_id,
    ),
  };
}

export async function getAiSellerPageData() {
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [templatesResult, paymentConfigsResult] = await Promise.all([
    supabase
      .from("whatsapp_templates")
      .select(
        "id, name, category_code, status_code, language_code, quality_rating_code, last_synced_at",
      )
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("organization_payment_configs")
      .select("*")
      .eq("organization_id", organizationId),
  ]);

  return {
    context,
    templates: templatesResult.data ?? [],
    readiness: getReadinessReport({
      sellerProfile: context.sellerProfile,
      channel: context.channel,
      paymentConfigs:
        (paymentConfigsResult.data as PaymentConfigRow[] | null) ?? [],
    }),
  };
}

export async function getCustomersPageData() {
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [customersResult, countsResult] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "id, full_name, whatsapp_e164, email, lead_temperature, last_seen_at, preferred_language, notes",
      )
      .eq("organization_id", organizationId)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(30),
    supabase
      .from("customers")
      .select("lead_temperature")
      .eq("organization_id", organizationId),
  ]);

  const leadCounts = (countsResult.data ?? []).reduce<Record<string, number>>(
    (acc, customer) => {
      acc[customer.lead_temperature] = (acc[customer.lead_temperature] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return {
    context,
    customers: customersResult.data ?? [],
    leadCounts,
  };
}

export async function getOrdersPageData() {
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [ordersResult, customerOptionsResult, productsResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_number, customer_id, conversation_id, total_amount, currency_code, status, payment_status, fulfillment_status, shipping_province, shipping_municipio, placed_at, paid_at, created_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("customers")
      .select("id, full_name, whatsapp_e164")
      .eq("organization_id", organizationId)
      .order("full_name", { ascending: true })
      .limit(100),
    supabase
      .from("products")
      .select("id, name, price, currency_code")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("name", { ascending: true })
      .limit(100),
  ]);

  const orders = ordersResult.data ?? [];
  const customerIds = orders.map((order) => order.customer_id);
  const orderIds = orders.map((order) => order.id);
  const productIds = (productsResult.data ?? []).map((product) => product.id);

  const [customersResult, orderItemsResult, productVariantsResult] = await Promise.all([
    customerIds.length > 0
      ? supabase
          .from("customers")
          .select("id, full_name, whatsapp_e164")
          .eq("organization_id", organizationId)
          .in("id", customerIds)
      : Promise.resolve({
          data: [] as Database["public"]["Tables"]["customers"]["Row"][],
          error: null,
        }),
    orderIds.length > 0
      ? supabase
          .from("order_items")
          .select(
            "id, order_id, name, sku, quantity, unit_price, line_total, currency_code, product_id, variant_id, variant_name",
          )
          .eq("organization_id", organizationId)
          .in("order_id", orderIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({
          data: [] as Database["public"]["Tables"]["order_items"]["Row"][],
          error: null,
        }),
    productIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, product_id, name, sku, price_override, stock_quantity, status")
          .eq("organization_id", organizationId)
          .in("product_id", productIds)
          .order("name", { ascending: true })
      : Promise.resolve({
          data: [] as Database["public"]["Tables"]["product_variants"]["Row"][],
          error: null,
        }),
  ]);

  const customerMap = toMapById(customersResult.data ?? []);

  return {
    context,
    orders: orders.map((order) => ({
      ...order,
      customer: customerMap[order.customer_id] ?? null,
    })),
    customerOptions: (customerOptionsResult.data ?? []).map((customer) => ({
      id: customer.id,
      name: customer.full_name ?? customer.whatsapp_e164,
    })),
    productOptions: (productsResult.data ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      currencyCode: product.currency_code,
    })),
    productVariantsByProduct: toMapByKey(
      productVariantsResult.data ?? [],
      (variant) => variant.product_id,
    ),
    orderItemsByOrder: toMapByKey(
      orderItemsResult.data ?? [],
      (item) => item.order_id,
    ),
  };
}

export async function getPaymentsPageData() {
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [
    configsResult,
    attemptsResult,
    eventsResult,
    providersResult,
    methodsResult,
    captureModesResult,
  ] = await Promise.all([
    supabase
      .from("organization_payment_configs")
      .select(
        "id, provider_code, method_type_code, capture_mode_code, is_enabled, is_default, updated_at, vault_secret_ref",
      )
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("payment_attempts")
      .select(
        "id, order_id, provider_code, method_type_code, amount, currency_code, status, provider_status, provider_checkout_url, created_at, completed_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("payment_events")
      .select(
        "id, payment_attempt_id, event_type, normalized_status, provider_code, provider_status, event_at",
      )
      .eq("organization_id", organizationId)
      .order("event_at", { ascending: false })
      .limit(20),
    supabase
      .from("payment_providers")
      .select("code, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
    supabase
      .from("payment_method_types")
      .select("code, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
    supabase
      .from("payment_capture_modes")
      .select("code, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
  ]);

  const paymentConfigs = (configsResult.data as PaymentConfigRow[] | null) ?? [];

  return {
    context,
    paymentConfigs,
    paymentAttempts: attemptsResult.data ?? [],
    paymentEvents: eventsResult.data ?? [],
    paymentProviders: providersResult.data ?? [],
    paymentMethodTypes: methodsResult.data ?? [],
    paymentCaptureModes: captureModesResult.data ?? [],
    readiness: getReadinessReport({
      sellerProfile: context.sellerProfile,
      channel: context.channel,
      paymentConfigs,
    }),
  };
}

export async function getAutomationsPageData() {
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [followUpsResult, templatesResult, paymentConfigsResult] = await Promise.all([
    supabase
      .from("follow_up_rules")
      .select(
        "id, name, trigger_type, target_type, send_mode, delay_minutes, max_executions, is_active, template_id, freeform_body",
      )
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(25),
    supabase
      .from("whatsapp_templates")
      .select("id, name, category_code, status_code, language_code, quality_rating_code")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("organization_payment_configs")
      .select("*")
      .eq("organization_id", organizationId),
  ]);

  const templateMap = toMapById(templatesResult.data ?? []);

  return {
    context,
    followUpRules: (followUpsResult.data ?? []).map((rule) => ({
      ...rule,
      template: rule.template_id ? templateMap[rule.template_id] ?? null : null,
    })),
    templates: templatesResult.data ?? [],
    readiness: getReadinessReport({
      sellerProfile: context.sellerProfile,
      channel: context.channel,
      paymentConfigs:
        (paymentConfigsResult.data as PaymentConfigRow[] | null) ?? [],
    }),
  };
}

export async function getSettingsPageData() {
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [paymentConfigsResult, templatesResult, importsResult, operationJobs] = await Promise.all([
    supabase
      .from("organization_payment_configs")
      .select(
        "id, provider_code, method_type_code, capture_mode_code, is_enabled, is_default, vault_secret_ref",
      )
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("whatsapp_templates")
      .select("id, name, category_code, status_code, language_code")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("catalog_import_jobs")
      .select("id, status, original_filename, updated_at, summary, error_count")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(5),
    getOperationalJobs(organizationId),
  ]);

  const paymentConfigs = (paymentConfigsResult.data as PaymentConfigRow[] | null) ?? [];

  return {
    context,
    paymentConfigs,
    templates: templatesResult.data ?? [],
    importJobs: importsResult.data ?? [],
    operationJobs,
    readiness: getReadinessReport({
      sellerProfile: context.sellerProfile,
      channel: context.channel,
      paymentConfigs,
    }),
  };
}
