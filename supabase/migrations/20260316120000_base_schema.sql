-- Yavendio-style DR clone (MVP) schema
-- Target: Supabase Postgres (portable to plain Postgres with minor auth changes)
-- Notes:
--   * Uses Supabase auth.users for application users.
--   * Uses shared-schema multi-tenancy with organization_id on every tenant table.
--   * Exposes app tables in public; keeps raw webhooks/jobs in internal.
--   * Client reads should go through RLS. Webhooks/payments/jobs should use service role / Edge Functions.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists internal;

-- -----------------------------
-- 1) Stable enums
-- -----------------------------
create type public.membership_role as enum (
  'owner',
  'admin',
  'operator',
  'analyst',
  'read_only'
);

create type public.channel_provider as enum (
  'meta_cloud_api',
  'twilio_whatsapp',
  'other'
);

create type public.channel_status as enum (
  'pending_verification',
  'connected',
  'disconnected',
  'paused',
  'error'
);

create type public.lead_temperature as enum (
  'cold',
  'warm',
  'hot'
);

create type public.message_direction as enum (
  'inbound',
  'outbound'
);

create type public.message_sender_type as enum (
  'customer',
  'ai',
  'human',
  'system'
);

create type public.payment_provider as enum (
  'cardnet',
  'bank_transfer',
  'cash_on_delivery',
  'manual'
);

create type public.payment_method_type as enum (
  'cardnet_button',
  'cardnet_link',
  'bank_transfer',
  'cash_on_delivery',
  'manual'
);

create type public.webhook_provider as enum (
  'whatsapp_meta',
  'cardnet',
  'other'
);

create type public.webhook_status as enum (
  'received',
  'validated',
  'ignored',
  'processed',
  'failed'
);

create type public.job_type as enum (
  'send_whatsapp_message',
  'run_follow_up',
  'payment_reconcile',
  'refresh_catalog',
  'recalc_lead_score',
  'generic'
);

create type public.job_status as enum (
  'queued',
  'locked',
  'succeeded',
  'failed',
  'cancelled',
  'dead_letter'
);

-- -----------------------------
-- 2) Common helpers
-- -----------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------
-- 3) Tenant + auth
-- -----------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  industry text,
  country_code char(2) not null default 'DO',
  currency_code char(3) not null default 'DOP',
  timezone text not null default 'America/Santo_Domingo',
  default_locale text not null default 'es-DO',
  plan_key text not null default 'mvp',
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone_e164 text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null default 'operator',
  status text not null default 'active'
    check (status in ('active', 'invited', 'disabled')),
  invited_email citext,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_memberships_user_idx
  on public.organization_memberships (user_id, organization_id);

create or replace function public.is_org_member(_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = _organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(_organization_id uuid, _roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = _organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(_roles)
  );
$$;

-- -----------------------------
-- 4) Channels + AI config
-- -----------------------------
create table public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.channel_provider not null default 'meta_cloud_api',
  display_name text,
  phone_e164 text not null,
  provider_phone_number_id text,
  provider_business_account_id text,
  status public.channel_status not null default 'pending_verification',
  quality_rating text not null default 'unknown'
    check (quality_rating in ('green', 'yellow', 'red', 'unknown')),
  connected_at timestamptz,
  last_healthcheck_at timestamptz,
  last_inbound_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, phone_e164)
);

create unique index whatsapp_channels_provider_number_uidx
  on public.whatsapp_channels (provider, provider_phone_number_id)
  where provider_phone_number_id is not null;

create index whatsapp_channels_org_status_idx
  on public.whatsapp_channels (organization_id, status);

create table public.ai_seller_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id uuid,
  seller_name text not null,
  tone text,
  company_description text,
  target_audience text,
  special_instructions text,
  sales_style text not null default 'balanced'
    check (sales_style in ('consultative', 'educational', 'emotional', 'balanced')),
  message_length text not null default 'medium'
    check (message_length in ('short', 'medium', 'long')),
  use_emojis boolean not null default false,
  forbidden_words text[] not null default '{}'::text[],
  welcome_message text,
  purchase_confirmation_message text,
  human_handoff_message text,
  language_code text not null default 'es-DO',
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id),
  constraint ai_seller_profiles_channel_fk
    foreign key (organization_id, channel_id)
    references public.whatsapp_channels (organization_id, id)
    on delete set null
);

-- -----------------------------
-- 5) Catalog + knowledge + shipping
-- -----------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  external_ref text,
  sku text,
  slug citext,
  name text not null,
  description text,
  currency_code char(3) not null default 'DOP',
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  stock_quantity integer not null default 0,
  track_inventory boolean not null default true,
  allow_backorder boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  source_type text not null default 'manual'
    check (source_type in ('manual', 'csv', 'website_sync', 'pdf_import', 'api')),
  source_ref text,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index products_org_sku_uidx
  on public.products (organization_id, sku)
  where sku is not null;

create unique index products_org_slug_uidx
  on public.products (organization_id, slug)
  where slug is not null;

create unique index products_org_external_ref_uidx
  on public.products (organization_id, external_ref)
  where external_ref is not null;

create index products_org_status_name_idx
  on public.products (organization_id, status, name);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  sku text,
  name text not null,
  option_values jsonb not null default '{}'::jsonb,
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  stock_quantity integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint product_variants_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id)
    on delete cascade
);

create unique index product_variants_org_sku_uidx
  on public.product_variants (organization_id, sku)
  where sku is not null;

create index product_variants_product_idx
  on public.product_variants (product_id, status);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  media_type text not null default 'image'
    check (media_type in ('image', 'video', 'audio', 'document')),
  storage_path text,
  public_url text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint product_media_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id)
    on delete cascade
);

create unique index product_media_primary_uidx
  on public.product_media (product_id)
  where is_primary = true;

create index product_media_product_sort_idx
  on public.product_media (product_id, sort_order);

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid,
  kind text not null default 'faq'
    check (kind in ('faq', 'policy', 'campaign', 'product_note')),
  category text not null default 'general'
    check (category in ('products', 'hours', 'shipping', 'payments', 'returns', 'promotions', 'general')),
  title text,
  question text,
  answer text not null,
  priority integer not null default 100 check (priority between 1 and 1000),
  is_active boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint knowledge_items_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id)
    on delete set null
);

create index knowledge_items_lookup_idx
  on public.knowledge_items (organization_id, category, is_active, priority);

create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  province text not null,
  municipio text,
  sector text,
  postal_code text,
  delivery_available boolean not null default true,
  pickup_available boolean not null default false,
  same_day_eligible boolean not null default false,
  fee numeric(12,2) not null default 0 check (fee >= 0),
  free_shipping_threshold numeric(12,2) check (free_shipping_threshold is null or free_shipping_threshold >= 0),
  eta_min_minutes integer,
  eta_max_minutes integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create index shipping_zones_geo_idx
  on public.shipping_zones (organization_id, is_active, province, municipio, sector);

-- -----------------------------
-- 6) Customers + conversations + messages
-- -----------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  whatsapp_e164 text not null,
  full_name text,
  first_name text,
  last_name text,
  email citext,
  preferred_language text not null default 'es-DO',
  lead_temperature public.lead_temperature not null default 'cold',
  is_blocked boolean not null default false,
  last_seen_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, whatsapp_e164)
);

create unique index customers_org_email_uidx
  on public.customers (organization_id, email)
  where email is not null;

create index customers_org_temperature_last_seen_idx
  on public.customers (organization_id, lead_temperature, last_seen_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id uuid not null,
  customer_id uuid not null,
  assigned_user_id uuid references auth.users (id),
  status text not null default 'open'
    check (status in ('open', 'waiting_customer', 'waiting_human', 'awaiting_payment', 'paid', 'closed', 'lost')),
  lead_temperature public.lead_temperature not null default 'cold',
  ai_paused boolean not null default false,
  ai_paused_at timestamptz,
  human_handoff_requested_at timestamptz,
  last_customer_message_at timestamptz,
  last_agent_message_at timestamptz,
  last_message_at timestamptz,
  closed_at timestamptz,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint conversations_channel_fk
    foreign key (organization_id, channel_id)
    references public.whatsapp_channels (organization_id, id)
    on delete restrict,
  constraint conversations_customer_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id)
    on delete restrict
);

create unique index conversations_one_active_per_customer_uidx
  on public.conversations (organization_id, channel_id, customer_id)
  where status in ('open', 'waiting_customer', 'waiting_human', 'awaiting_payment', 'paid');

create index conversations_inbox_idx
  on public.conversations (organization_id, status, last_message_at desc nulls last);

create index conversations_assigned_idx
  on public.conversations (organization_id, assigned_user_id, status, last_message_at desc nulls last);

-- -----------------------------
-- 7) Orders + payments
-- -----------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_number bigint generated always as identity,
  conversation_id uuid,
  customer_id uuid not null,
  channel_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'quoted', 'awaiting_shipping', 'awaiting_payment', 'paid', 'preparing', 'delivered', 'closed', 'cancelled', 'lost')),
  currency_code char(3) not null default 'DOP',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  shipping_fee numeric(12,2) not null default 0 check (shipping_fee >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled')),
  fulfillment_status text not null default 'unfulfilled'
    check (fulfillment_status in ('unfulfilled', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled')),
  shipping_zone_id uuid,
  shipping_name text,
  shipping_phone text,
  shipping_address_line1 text,
  shipping_address_line2 text,
  shipping_province text,
  shipping_municipio text,
  shipping_sector text,
  delivery_notes text,
  assigned_user_id uuid references auth.users (id),
  placed_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (order_number),
  constraint orders_customer_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id)
    on delete restrict,
  constraint orders_channel_fk
    foreign key (organization_id, channel_id)
    references public.whatsapp_channels (organization_id, id)
    on delete set null,
  constraint orders_conversation_fk
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id)
    on delete set null,
  constraint orders_shipping_zone_fk
    foreign key (organization_id, shipping_zone_id)
    references public.shipping_zones (organization_id, id)
    on delete set null
);

create index orders_org_status_created_idx
  on public.orders (organization_id, status, created_at desc);

create index orders_customer_created_idx
  on public.orders (customer_id, created_at desc);

create index orders_payment_status_idx
  on public.orders (organization_id, payment_status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  product_id uuid,
  variant_id uuid,
  sku text,
  name text not null,
  variant_name text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as ((quantity * unit_price)) stored,
  currency_code char(3) not null default 'DOP',
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint order_items_order_fk
    foreign key (organization_id, order_id)
    references public.orders (organization_id, id)
    on delete cascade,
  constraint order_items_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id)
    on delete set null,
  constraint order_items_variant_fk
    foreign key (organization_id, variant_id)
    references public.product_variants (organization_id, id)
    on delete set null
);

create index order_items_order_idx
  on public.order_items (order_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  channel_id uuid not null,
  customer_id uuid,
  order_id uuid,
  provider_message_id text,
  direction public.message_direction not null,
  sender_type public.message_sender_type not null,
  status text not null default 'received'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'received')),
  message_type text not null default 'text'
    check (message_type in ('text', 'interactive', 'image', 'video', 'audio', 'document', 'template', 'system')),
  body text,
  payload jsonb not null default '{}'::jsonb,
  sent_by_user_id uuid references auth.users (id),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error_code text,
  external_created_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint messages_conversation_fk
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id)
    on delete cascade,
  constraint messages_channel_fk
    foreign key (organization_id, channel_id)
    references public.whatsapp_channels (organization_id, id)
    on delete restrict,
  constraint messages_customer_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id)
    on delete set null,
  constraint messages_order_fk
    foreign key (organization_id, order_id)
    references public.orders (organization_id, id)
    on delete set null
);

create unique index messages_provider_message_uidx
  on public.messages (channel_id, provider_message_id)
  where provider_message_id is not null;

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create index messages_org_created_idx
  on public.messages (organization_id, created_at desc);

create table public.organization_payment_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.payment_provider not null,
  method_type public.payment_method_type not null,
  is_enabled boolean not null default false,
  is_default boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  vault_secret_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, provider, method_type)
);

create unique index organization_payment_configs_default_uidx
  on public.organization_payment_configs (organization_id)
  where is_default = true;

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  conversation_id uuid,
  provider public.payment_provider not null,
  method_type public.payment_method_type not null,
  status text not null default 'pending'
    check (status in ('pending', 'requires_action', 'authorized', 'paid', 'failed', 'cancelled', 'expired', 'refunded')),
  amount numeric(12,2) not null check (amount > 0),
  currency_code char(3) not null default 'DOP',
  provider_checkout_url text,
  provider_payment_ref text,
  provider_order_ref text,
  idempotency_key text,
  failure_code text,
  failure_message text,
  expires_at timestamptz,
  initiated_by_user_id uuid references auth.users (id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint payment_attempts_order_fk
    foreign key (organization_id, order_id)
    references public.orders (organization_id, id)
    on delete cascade,
  constraint payment_attempts_conversation_fk
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id)
    on delete set null
);

create unique index payment_attempts_provider_ref_uidx
  on public.payment_attempts (provider, provider_payment_ref)
  where provider_payment_ref is not null;

create unique index payment_attempts_idempotency_uidx
  on public.payment_attempts (organization_id, provider, idempotency_key)
  where idempotency_key is not null;

create index payment_attempts_order_status_idx
  on public.payment_attempts (order_id, status, created_at desc);

create index payment_attempts_org_status_idx
  on public.payment_attempts (organization_id, status, created_at desc);

-- -----------------------------
-- 8) Internal/raw webhooks + jobs
-- -----------------------------
create table internal.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider public.webhook_provider not null,
  event_type text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  channel_id uuid,
  payment_attempt_id uuid,
  provider_event_id text,
  dedupe_key text,
  signature_valid boolean,
  status public.webhook_status not null default 'received',
  http_headers jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  payload_hash text not null,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, dedupe_key)
);

create unique index webhook_events_provider_event_uidx
  on internal.webhook_events (provider, provider_event_id)
  where provider_event_id is not null;

create index webhook_events_status_received_idx
  on internal.webhook_events (status, received_at);

create index webhook_events_org_received_idx
  on internal.webhook_events (organization_id, received_at desc);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payment_attempt_id uuid not null,
  order_id uuid not null,
  webhook_event_id uuid,
  event_type text not null,
  provider public.payment_provider not null,
  provider_payment_ref text,
  amount numeric(12,2),
  currency_code char(3),
  raw_status text,
  normalized_status text
    check (normalized_status is null or normalized_status in ('pending', 'authorized', 'paid', 'failed', 'cancelled', 'expired', 'refunded')),
  payload jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (webhook_event_id),
  constraint payment_events_attempt_fk
    foreign key (organization_id, payment_attempt_id)
    references public.payment_attempts (organization_id, id)
    on delete cascade,
  constraint payment_events_order_fk
    foreign key (organization_id, order_id)
    references public.orders (organization_id, id)
    on delete cascade,
  constraint payment_events_webhook_fk
    foreign key (webhook_event_id)
    references internal.webhook_events (id)
    on delete set null
);

create index payment_events_attempt_event_idx
  on public.payment_events (payment_attempt_id, event_at desc);

create index payment_events_org_event_idx
  on public.payment_events (organization_id, event_at desc);

create table public.follow_up_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  trigger_type text not null
    check (trigger_type in ('abandoned_cart', 'payment_reminder', 'awaiting_customer', 'order_status_update', 'manual')),
  target_type text not null
    check (target_type in ('conversation', 'order', 'customer')),
  delay_minutes integer not null check (delay_minutes >= 0),
  max_executions integer not null default 1 check (max_executions > 0),
  template_name text,
  message_body text,
  stop_conditions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create index follow_up_rules_active_idx
  on public.follow_up_rules (organization_id, is_active, trigger_type);

create table internal.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  job_type public.job_type not null,
  status public.job_status not null default 'queued',
  priority smallint not null default 100,
  scheduled_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  dedupe_key text,
  follow_up_rule_id uuid,
  conversation_id uuid,
  order_id uuid,
  customer_id uuid,
  payment_attempt_id uuid,
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_jobs_follow_up_rule_fk
    foreign key (organization_id, follow_up_rule_id)
    references public.follow_up_rules (organization_id, id)
    on delete set null,
  constraint scheduled_jobs_conversation_fk
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id)
    on delete set null,
  constraint scheduled_jobs_order_fk
    foreign key (organization_id, order_id)
    references public.orders (organization_id, id)
    on delete set null,
  constraint scheduled_jobs_customer_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id)
    on delete set null,
  constraint scheduled_jobs_payment_attempt_fk
    foreign key (organization_id, payment_attempt_id)
    references public.payment_attempts (organization_id, id)
    on delete set null
);

create unique index scheduled_jobs_dedupe_uidx
  on internal.scheduled_jobs (organization_id, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'locked');

create index scheduled_jobs_pickup_idx
  on internal.scheduled_jobs (status, available_at, priority desc, created_at);

create index scheduled_jobs_org_status_idx
  on internal.scheduled_jobs (organization_id, status, available_at);

create table internal.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references internal.scheduled_jobs (id) on delete cascade,
  status public.job_status not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  worker_id text,
  error_message text,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index job_runs_job_started_idx
  on internal.job_runs (job_id, started_at desc);

-- -----------------------------
-- 9) updated_at triggers
-- -----------------------------
create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

create trigger user_profiles_touch_updated_at
before update on public.user_profiles
for each row execute function public.touch_updated_at();

create trigger organization_memberships_touch_updated_at
before update on public.organization_memberships
for each row execute function public.touch_updated_at();

create trigger whatsapp_channels_touch_updated_at
before update on public.whatsapp_channels
for each row execute function public.touch_updated_at();

create trigger ai_seller_profiles_touch_updated_at
before update on public.ai_seller_profiles
for each row execute function public.touch_updated_at();

create trigger products_touch_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

create trigger product_variants_touch_updated_at
before update on public.product_variants
for each row execute function public.touch_updated_at();

create trigger knowledge_items_touch_updated_at
before update on public.knowledge_items
for each row execute function public.touch_updated_at();

create trigger shipping_zones_touch_updated_at
before update on public.shipping_zones
for each row execute function public.touch_updated_at();

create trigger customers_touch_updated_at
before update on public.customers
for each row execute function public.touch_updated_at();

create trigger conversations_touch_updated_at
before update on public.conversations
for each row execute function public.touch_updated_at();

create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

create trigger organization_payment_configs_touch_updated_at
before update on public.organization_payment_configs
for each row execute function public.touch_updated_at();

create trigger payment_attempts_touch_updated_at
before update on public.payment_attempts
for each row execute function public.touch_updated_at();

create trigger follow_up_rules_touch_updated_at
before update on public.follow_up_rules
for each row execute function public.touch_updated_at();

create trigger scheduled_jobs_touch_updated_at
before update on internal.scheduled_jobs
for each row execute function public.touch_updated_at();

-- -----------------------------
-- 10) RLS and internal hardening
-- -----------------------------
revoke all on schema internal from public;
revoke all on all tables in schema internal from public;
revoke all on all sequences in schema internal from public;

alter table public.organizations enable row level security;
alter table public.user_profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.whatsapp_channels enable row level security;
alter table public.ai_seller_profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_media enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.customers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.organization_payment_configs enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;
alter table public.follow_up_rules enable row level security;

-- Profiles: self only.
create policy user_profiles_self_select
on public.user_profiles
for select
using (id = auth.uid());

create policy user_profiles_self_insert
on public.user_profiles
for insert
with check (id = auth.uid());

create policy user_profiles_self_update
on public.user_profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

-- Organizations + memberships.
create policy organizations_select_member
on public.organizations
for select
using (public.is_org_member(id));

create policy organizations_insert_creator
on public.organizations
for insert
with check (created_by = auth.uid());

create policy organizations_update_admin
on public.organizations
for update
using (public.has_org_role(id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(id, array['owner','admin']::public.membership_role[]));

create policy memberships_select_member
on public.organization_memberships
for select
using (public.is_org_member(organization_id));

create policy memberships_admin_write
on public.organization_memberships
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

-- General read pattern for tenant tables.
create policy whatsapp_channels_read_member
on public.whatsapp_channels
for select
using (public.is_org_member(organization_id));
create policy whatsapp_channels_admin_write
on public.whatsapp_channels
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

create policy ai_seller_profiles_read_member
on public.ai_seller_profiles
for select
using (public.is_org_member(organization_id));
create policy ai_seller_profiles_admin_write
on public.ai_seller_profiles
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

create policy products_read_member
on public.products
for select
using (public.is_org_member(organization_id));
create policy products_operator_write
on public.products
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy product_variants_read_member
on public.product_variants
for select
using (public.is_org_member(organization_id));
create policy product_variants_operator_write
on public.product_variants
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy product_media_read_member
on public.product_media
for select
using (public.is_org_member(organization_id));
create policy product_media_operator_write
on public.product_media
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy knowledge_items_read_member
on public.knowledge_items
for select
using (public.is_org_member(organization_id));
create policy knowledge_items_operator_write
on public.knowledge_items
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy shipping_zones_read_member
on public.shipping_zones
for select
using (public.is_org_member(organization_id));
create policy shipping_zones_operator_write
on public.shipping_zones
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy customers_read_member
on public.customers
for select
using (public.is_org_member(organization_id));
create policy customers_operator_write
on public.customers
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy conversations_read_member
on public.conversations
for select
using (public.is_org_member(organization_id));
create policy conversations_operator_write
on public.conversations
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy messages_read_member
on public.messages
for select
using (public.is_org_member(organization_id));
create policy messages_operator_write
on public.messages
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy orders_read_member
on public.orders
for select
using (public.is_org_member(organization_id));
create policy orders_operator_write
on public.orders
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy order_items_read_member
on public.order_items
for select
using (public.is_org_member(organization_id));
create policy order_items_operator_write
on public.order_items
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy payment_configs_read_member
on public.organization_payment_configs
for select
using (public.is_org_member(organization_id));
create policy payment_configs_admin_write
on public.organization_payment_configs
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

create policy payment_attempts_read_member
on public.payment_attempts
for select
using (public.is_org_member(organization_id));
create policy payment_attempts_admin_write
on public.payment_attempts
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

create policy payment_events_read_member
on public.payment_events
for select
using (public.is_org_member(organization_id));
create policy payment_events_admin_write
on public.payment_events
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

create policy follow_up_rules_read_member
on public.follow_up_rules
for select
using (public.is_org_member(organization_id));
create policy follow_up_rules_admin_write
on public.follow_up_rules
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

commit;
