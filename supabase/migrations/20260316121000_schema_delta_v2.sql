-- Delta migration from /mnt/data/yavendio_dr_mvp_schema.sql
-- Applies the agreed schema changes for:
--   * privileged organization bootstrap under RLS
--   * membership-safe user references for tenant tables
--   * widened provider/payment modeling
--   * first-class WhatsApp templates
--   * normalized message status history
--   * first-class catalog import tracking
-- Notes:
--   * This migration is intentionally data-preserving where practical.
--   * follow_up_rules.template_name is retained as legacy_template_name for one cleanup cycle.
--   * Obsolete enum types are left in place for now to keep the migration safer.

begin;

-- =====================================================
-- 0) Auth profile bootstrap + active-membership helper
-- =====================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, full_name, phone_e164)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.assert_active_membership_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _column_name text := tg_argv[0];
  _user_id uuid;
begin
  execute format('select ($1).%I::uuid', _column_name)
    into _user_id
    using new;

  if _user_id is null then
    return new;
  end if;

  if new.organization_id is null then
    raise exception using
      errcode = '23502',
      message = format('organization_id is required when %s is set', _column_name);
  end if;

  if not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = new.organization_id
      and m.user_id = _user_id
      and m.status = 'active'
  ) then
    raise exception using
      errcode = '23503',
      message = format('column %s must reference an active organization membership', _column_name),
      detail = format('organization_id=%s user_id=%s', new.organization_id, _user_id);
  end if;

  return new;
end;
$$;

-- =====================================================
-- 1) Membership lifecycle hardening
-- =====================================================
alter table public.organization_memberships
  add column if not exists left_at timestamptz;

update public.organization_memberships
set joined_at = coalesce(joined_at, created_at)
where status = 'active'
  and joined_at is null;

alter table public.organization_memberships
  drop constraint if exists organization_memberships_status_check;

alter table public.organization_memberships
  add constraint organization_memberships_status_check
  check (status in ('active', 'invited', 'disabled', 'left'));

alter table public.organization_memberships
  drop constraint if exists organization_memberships_active_joined_check;

alter table public.organization_memberships
  add constraint organization_memberships_active_joined_check
  check (status <> 'active' or joined_at is not null);

alter table public.organization_memberships
  drop constraint if exists organization_memberships_left_at_status_check;

alter table public.organization_memberships
  add constraint organization_memberships_left_at_status_check
  check (left_at is null or status in ('disabled', 'left'));

create index if not exists organization_memberships_active_user_org_idx
  on public.organization_memberships (user_id, organization_id)
  where status = 'active';

create index if not exists organization_memberships_active_org_user_idx
  on public.organization_memberships (organization_id, user_id)
  where status = 'active';

create unique index if not exists organization_memberships_single_org_per_user_uidx
  on public.organization_memberships (user_id)
  where status in ('active', 'invited', 'disabled');

-- =====================================================
-- 2) Provider/payment model widening
-- =====================================================
create table if not exists public.payment_providers (
  code text primary key,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_method_types (
  code text primary key,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_capture_modes (
  code text primary key,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.payment_providers (code, display_name)
values
  ('cardnet', 'CardNET'),
  ('azul', 'Azul'),
  ('paypal', 'PayPal'),
  ('bank_transfer', 'Bank transfer'),
  ('cash_on_delivery', 'Cash on delivery'),
  ('manual', 'Manual')
on conflict (code) do update
set display_name = excluded.display_name,
    is_active = true;

insert into public.payment_method_types (code, display_name)
values
  ('card_redirect', 'Hosted card redirect'),
  ('card_embedded', 'Embedded card form'),
  ('wallet_redirect', 'Wallet redirect'),
  ('payment_link', 'Payment link'),
  ('bank_transfer', 'Bank transfer'),
  ('cash_on_delivery', 'Cash on delivery'),
  ('manual', 'Manual')
on conflict (code) do update
set display_name = excluded.display_name,
    is_active = true;

insert into public.payment_capture_modes (code, display_name)
values
  ('sale', 'Immediate sale/capture'),
  ('authorize_capture', 'Authorize then capture')
on conflict (code) do update
set display_name = excluded.display_name,
    is_active = true;

alter table public.organization_payment_configs
  alter column provider type text using provider::text;

alter table public.organization_payment_configs
  rename column provider to provider_code;

alter table public.organization_payment_configs
  alter column method_type type text using method_type::text;

alter table public.organization_payment_configs
  rename column method_type to method_type_code;

alter table public.organization_payment_configs
  add column if not exists capture_mode_code text not null default 'sale';

update public.organization_payment_configs
set provider_code = case provider_code
  when 'cardnet' then 'cardnet'
  when 'bank_transfer' then 'bank_transfer'
  when 'cash_on_delivery' then 'cash_on_delivery'
  when 'manual' then 'manual'
  else provider_code
end,
method_type_code = case method_type_code
  when 'cardnet_button' then 'card_redirect'
  when 'cardnet_link' then 'payment_link'
  when 'bank_transfer' then 'bank_transfer'
  when 'cash_on_delivery' then 'cash_on_delivery'
  when 'manual' then 'manual'
  else method_type_code
end;

alter table public.organization_payment_configs
  drop constraint if exists organization_payment_configs_provider_code_fk,
  drop constraint if exists organization_payment_configs_method_type_code_fk,
  drop constraint if exists organization_payment_configs_capture_mode_code_fk;

alter table public.organization_payment_configs
  add constraint organization_payment_configs_provider_code_fk
    foreign key (provider_code)
    references public.payment_providers (code),
  add constraint organization_payment_configs_method_type_code_fk
    foreign key (method_type_code)
    references public.payment_method_types (code),
  add constraint organization_payment_configs_capture_mode_code_fk
    foreign key (capture_mode_code)
    references public.payment_capture_modes (code);

create index if not exists organization_payment_configs_enabled_idx
  on public.organization_payment_configs (organization_id, is_enabled, provider_code, method_type_code);

alter table public.payment_attempts
  alter column provider type text using provider::text;

alter table public.payment_attempts
  rename column provider to provider_code;

alter table public.payment_attempts
  alter column method_type type text using method_type::text;

alter table public.payment_attempts
  rename column method_type to method_type_code;

alter table public.payment_attempts
  rename column idempotency_key to provider_idempotency_key;

alter table public.payment_attempts
  add column if not exists capture_mode_code text not null default 'sale',
  add column if not exists provider_session_id text,
  add column if not exists provider_customer_ref text,
  add column if not exists provider_status text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb,
  add column if not exists amount_authorized numeric(12,2),
  add column if not exists amount_captured numeric(12,2),
  add column if not exists authorized_at timestamptz,
  add column if not exists captured_at timestamptz;

update public.payment_attempts
set provider_code = case provider_code
  when 'cardnet' then 'cardnet'
  when 'bank_transfer' then 'bank_transfer'
  when 'cash_on_delivery' then 'cash_on_delivery'
  when 'manual' then 'manual'
  else provider_code
end,
method_type_code = case method_type_code
  when 'cardnet_button' then 'card_redirect'
  when 'cardnet_link' then 'payment_link'
  when 'bank_transfer' then 'bank_transfer'
  when 'cash_on_delivery' then 'cash_on_delivery'
  when 'manual' then 'manual'
  else method_type_code
end,
amount_authorized = case
  when status in ('authorized', 'paid', 'refunded') then coalesce(amount_authorized, amount)
  else amount_authorized
end,
amount_captured = case
  when status in ('paid', 'refunded') then coalesce(amount_captured, amount)
  else amount_captured
end,
authorized_at = case
  when status in ('authorized', 'paid', 'refunded') then coalesce(authorized_at, completed_at)
  else authorized_at
end,
captured_at = case
  when status in ('paid', 'refunded') then coalesce(captured_at, completed_at)
  else captured_at
end;

alter table public.payment_attempts
  drop constraint if exists payment_attempts_provider_code_fk,
  drop constraint if exists payment_attempts_method_type_code_fk,
  drop constraint if exists payment_attempts_capture_mode_code_fk,
  drop constraint if exists payment_attempts_amount_authorized_check,
  drop constraint if exists payment_attempts_amount_captured_check,
  drop constraint if exists payment_attempts_initiated_by_user_id_fkey;

alter table public.payment_attempts
  add constraint payment_attempts_provider_code_fk
    foreign key (provider_code)
    references public.payment_providers (code),
  add constraint payment_attempts_method_type_code_fk
    foreign key (method_type_code)
    references public.payment_method_types (code),
  add constraint payment_attempts_capture_mode_code_fk
    foreign key (capture_mode_code)
    references public.payment_capture_modes (code),
  add constraint payment_attempts_amount_authorized_check
    check (amount_authorized is null or (amount_authorized >= 0 and amount_authorized <= amount)),
  add constraint payment_attempts_amount_captured_check
    check (amount_captured is null or (amount_captured >= 0 and amount_captured <= amount));

alter index public.payment_attempts_provider_ref_uidx
  rename to payment_attempts_provider_code_ref_uidx;

alter index public.payment_attempts_idempotency_uidx
  rename to payment_attempts_provider_idempotency_uidx;

create index if not exists payment_attempts_provider_session_idx
  on public.payment_attempts (provider_code, provider_session_id)
  where provider_session_id is not null;

create index if not exists payment_attempts_provider_order_ref_idx
  on public.payment_attempts (provider_code, provider_order_ref)
  where provider_order_ref is not null;

create index if not exists payment_attempts_provider_customer_ref_idx
  on public.payment_attempts (provider_code, provider_customer_ref)
  where provider_customer_ref is not null;

alter table internal.webhook_events
  rename to provider_events;

alter table internal.provider_events
  rename column provider to provider_code;

alter table internal.provider_events
  alter column provider_code type text using provider_code::text;

alter table internal.provider_events
  rename column status to processing_status;

alter table internal.provider_events
  alter column processing_status type text using processing_status::text;

alter table internal.provider_events
  add column if not exists source_system text,
  add column if not exists transport_type text;

update internal.provider_events
set source_system = case
  when provider_code in ('whatsapp_meta') then 'whatsapp'
  when provider_code in ('cardnet', 'azul', 'paypal') then 'payment_provider'
  else 'other'
end,
transport_type = coalesce(transport_type, 'webhook');

alter table internal.provider_events
  alter column source_system set not null,
  alter column transport_type set not null;

alter table internal.provider_events
  drop constraint if exists provider_events_source_system_check,
  drop constraint if exists provider_events_transport_type_check,
  drop constraint if exists provider_events_processing_status_check,
  drop constraint if exists provider_events_payment_attempt_fk,
  drop constraint if exists provider_events_channel_fk,
  drop constraint if exists webhook_events_provider_dedupe_key_key;

alter table internal.provider_events
  add constraint provider_events_source_system_check
    check (source_system in ('whatsapp', 'payment_provider', 'other')),
  add constraint provider_events_transport_type_check
    check (transport_type in ('webhook', 'redirect_return', 'poll_snapshot', 'manual')),
  add constraint provider_events_processing_status_check
    check (processing_status in ('received', 'validated', 'ignored', 'processed', 'failed')),
  add constraint provider_events_payment_attempt_fk
    foreign key (payment_attempt_id)
    references public.payment_attempts (id)
    on delete set null,
  add constraint provider_events_channel_fk
    foreign key (channel_id)
    references public.whatsapp_channels (id)
    on delete set null;

drop index if exists internal.webhook_events_provider_event_uidx;
drop index if exists internal.webhook_events_status_received_idx;
drop index if exists internal.webhook_events_org_received_idx;

create unique index provider_events_provider_event_uidx
  on internal.provider_events (provider_code, provider_event_id)
  where provider_event_id is not null;

create unique index provider_events_dedupe_uidx
  on internal.provider_events (provider_code, dedupe_key)
  where dedupe_key is not null;

create index provider_events_processing_status_received_idx
  on internal.provider_events (processing_status, received_at);

create index provider_events_org_received_idx
  on internal.provider_events (organization_id, received_at desc);

create index provider_events_payment_attempt_idx
  on internal.provider_events (payment_attempt_id, received_at desc)
  where payment_attempt_id is not null;

alter table public.payment_events
  rename column webhook_event_id to provider_event_id;

alter table public.payment_events
  rename column provider to provider_code;

alter table public.payment_events
  alter column provider_code type text using provider_code::text;

alter table public.payment_events
  rename column raw_status to provider_status;

update public.payment_events
set provider_code = case provider_code
  when 'cardnet' then 'cardnet'
  when 'bank_transfer' then 'bank_transfer'
  when 'cash_on_delivery' then 'cash_on_delivery'
  when 'manual' then 'manual'
  else provider_code
end;

alter table public.payment_events
  drop constraint if exists payment_events_webhook_fk,
  drop constraint if exists payment_events_provider_event_fk,
  drop constraint if exists payment_events_provider_code_fk,
  drop constraint if exists payment_events_normalized_status_check;

alter table public.payment_events
  add constraint payment_events_provider_code_fk
    foreign key (provider_code)
    references public.payment_providers (code),
  add constraint payment_events_provider_event_fk
    foreign key (provider_event_id)
    references internal.provider_events (id)
    on delete set null,
  add constraint payment_events_normalized_status_check
    check (
      normalized_status is null
      or normalized_status in ('pending', 'requires_action', 'authorized', 'paid', 'failed', 'cancelled', 'expired', 'refunded')
    );

create index if not exists payment_events_provider_payment_ref_idx
  on public.payment_events (provider_code, provider_payment_ref, event_at desc)
  where provider_payment_ref is not null;

-- =====================================================
-- 3) WhatsApp templates + follow-up rules
-- =====================================================
create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id uuid,
  provider_template_id text,
  name text not null,
  language_code text not null,
  category_code text not null,
  status_code text not null,
  quality_rating_code text,
  components jsonb not null default '[]'::jsonb,
  variables_schema jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name, language_code),
  constraint whatsapp_templates_channel_fk
    foreign key (organization_id, channel_id)
    references public.whatsapp_channels (organization_id, id)
    on delete set null
);

create unique index if not exists whatsapp_templates_provider_template_uidx
  on public.whatsapp_templates (organization_id, provider_template_id)
  where provider_template_id is not null;

create index if not exists whatsapp_templates_status_idx
  on public.whatsapp_templates (organization_id, status_code, category_code);

create index if not exists whatsapp_templates_channel_status_idx
  on public.whatsapp_templates (organization_id, channel_id, status_code)
  where channel_id is not null;

create trigger whatsapp_templates_touch_updated_at
before update on public.whatsapp_templates
for each row execute function public.touch_updated_at();

alter table public.follow_up_rules
  rename column created_by to created_by_user_id;

alter table public.follow_up_rules
  rename column message_body to freeform_body;

alter table public.follow_up_rules
  rename column template_name to legacy_template_name;

alter table public.follow_up_rules
  add column if not exists send_mode text not null default 'in_session_freeform',
  add column if not exists template_id uuid;

update public.follow_up_rules
set send_mode = case
  when legacy_template_name is not null then 'template'
  else 'in_session_freeform'
end;

update public.follow_up_rules
set freeform_body = ''
where legacy_template_name is null
  and freeform_body is null;

update public.follow_up_rules fur
set template_id = wt.id
from (
  select organization_id, name, min(id::text)::uuid as id
  from public.whatsapp_templates
  group by organization_id, name
  having count(*) = 1
) wt
where fur.organization_id = wt.organization_id
  and fur.template_id is null
  and fur.legacy_template_name = wt.name;

alter table public.follow_up_rules
  drop constraint if exists follow_up_rules_created_by_fkey,
  drop constraint if exists follow_up_rules_created_by_user_id_fkey,
  drop constraint if exists follow_up_rules_send_mode_check,
  drop constraint if exists follow_up_rules_template_fk,
  drop constraint if exists follow_up_rules_delivery_payload_check;

alter table public.follow_up_rules
  add constraint follow_up_rules_send_mode_check
    check (send_mode in ('in_session_freeform', 'template')),
  add constraint follow_up_rules_template_fk
    foreign key (organization_id, template_id)
    references public.whatsapp_templates (organization_id, id)
    on delete restrict,
  add constraint follow_up_rules_delivery_payload_check
    check (
      (send_mode = 'in_session_freeform' and freeform_body is not null)
      or (send_mode = 'template' and (template_id is not null or legacy_template_name is not null))
    );

comment on column public.follow_up_rules.legacy_template_name is
  'Deprecated fallback. Backfill template_id from whatsapp_templates, then remove this column in a later cleanup migration.';

create index if not exists follow_up_rules_template_idx
  on public.follow_up_rules (organization_id, template_id)
  where template_id is not null;

-- =====================================================
-- 4) Message status history
-- =====================================================
alter table public.messages
  rename column status to current_status;

alter table public.messages
  rename column error_code to last_error_code;

alter table public.messages
  add column if not exists current_status_at timestamptz,
  add column if not exists last_error_at timestamptz;

update public.messages
set current_status = 'accepted'
where current_status = 'sending';

update public.messages
set current_status_at = coalesce(
      current_status_at,
      read_at,
      delivered_at,
      failed_at,
      sent_at,
      external_created_at,
      created_at
    ),
    last_error_at = case
      when current_status = 'failed' then coalesce(last_error_at, failed_at, created_at)
      else last_error_at
    end;

alter table public.messages
  alter column current_status set default 'received';

alter table public.messages
  drop constraint if exists messages_status_check,
  drop constraint if exists messages_current_status_check,
  drop constraint if exists messages_sent_by_user_id_fkey;

alter table public.messages
  add constraint messages_current_status_check
    check (current_status in ('queued', 'accepted', 'sent', 'delivered', 'read', 'failed', 'received'));

create table if not exists public.message_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  message_id uuid not null,
  conversation_id uuid not null,
  channel_id uuid not null,
  provider_message_id text,
  canonical_status text not null,
  provider_status text,
  occurred_at timestamptz not null default now(),
  provider_event_id uuid,
  error_code text,
  error_title text,
  error_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint message_status_events_message_fk
    foreign key (organization_id, message_id)
    references public.messages (organization_id, id)
    on delete cascade,
  constraint message_status_events_conversation_fk
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id)
    on delete cascade,
  constraint message_status_events_channel_fk
    foreign key (organization_id, channel_id)
    references public.whatsapp_channels (organization_id, id)
    on delete cascade,
  constraint message_status_events_provider_event_fk
    foreign key (provider_event_id)
    references internal.provider_events (id)
    on delete set null,
  constraint message_status_events_canonical_status_check
    check (canonical_status in ('queued', 'accepted', 'sent', 'delivered', 'read', 'failed', 'received'))
);

create unique index if not exists message_status_events_message_provider_event_uidx
  on public.message_status_events (message_id, provider_event_id)
  where provider_event_id is not null;

create index if not exists message_status_events_message_occurred_idx
  on public.message_status_events (message_id, occurred_at desc);

create index if not exists message_status_events_org_status_idx
  on public.message_status_events (organization_id, canonical_status, occurred_at desc);

create index if not exists message_status_events_provider_message_idx
  on public.message_status_events (channel_id, provider_message_id, occurred_at desc)
  where provider_message_id is not null;

insert into public.message_status_events (
  organization_id,
  message_id,
  conversation_id,
  channel_id,
  provider_message_id,
  canonical_status,
  occurred_at,
  metadata
)
select
  m.organization_id,
  m.id,
  m.conversation_id,
  m.channel_id,
  m.provider_message_id,
  'received',
  coalesce(m.external_created_at, m.created_at),
  jsonb_build_object('seeded_from', 'messages.external_created_at')
from public.messages m
where m.direction = 'inbound'
  and not exists (
    select 1
    from public.message_status_events mse
    where mse.message_id = m.id
      and mse.canonical_status = 'received'
      and mse.occurred_at = coalesce(m.external_created_at, m.created_at)
  );

insert into public.message_status_events (
  organization_id,
  message_id,
  conversation_id,
  channel_id,
  provider_message_id,
  canonical_status,
  occurred_at,
  metadata
)
select
  m.organization_id,
  m.id,
  m.conversation_id,
  m.channel_id,
  m.provider_message_id,
  'queued',
  m.created_at,
  jsonb_build_object('seeded_from', 'messages.current_status')
from public.messages m
where m.current_status = 'queued'
  and not exists (
    select 1
    from public.message_status_events mse
    where mse.message_id = m.id
      and mse.canonical_status = 'queued'
      and mse.occurred_at = m.created_at
  );

insert into public.message_status_events (
  organization_id,
  message_id,
  conversation_id,
  channel_id,
  provider_message_id,
  canonical_status,
  occurred_at,
  metadata
)
select
  m.organization_id,
  m.id,
  m.conversation_id,
  m.channel_id,
  m.provider_message_id,
  'accepted',
  coalesce(m.sent_at, m.external_created_at, m.created_at),
  jsonb_build_object('seeded_from', 'messages.current_status')
from public.messages m
where m.current_status = 'accepted'
  and not exists (
    select 1
    from public.message_status_events mse
    where mse.message_id = m.id
      and mse.canonical_status = 'accepted'
      and mse.occurred_at = coalesce(m.sent_at, m.external_created_at, m.created_at)
  );

insert into public.message_status_events (
  organization_id,
  message_id,
  conversation_id,
  channel_id,
  provider_message_id,
  canonical_status,
  occurred_at,
  metadata
)
select
  m.organization_id,
  m.id,
  m.conversation_id,
  m.channel_id,
  m.provider_message_id,
  'sent',
  m.sent_at,
  jsonb_build_object('seeded_from', 'messages.sent_at')
from public.messages m
where m.sent_at is not null
  and not exists (
    select 1
    from public.message_status_events mse
    where mse.message_id = m.id
      and mse.canonical_status = 'sent'
      and mse.occurred_at = m.sent_at
  );

insert into public.message_status_events (
  organization_id,
  message_id,
  conversation_id,
  channel_id,
  provider_message_id,
  canonical_status,
  occurred_at,
  metadata
)
select
  m.organization_id,
  m.id,
  m.conversation_id,
  m.channel_id,
  m.provider_message_id,
  'delivered',
  m.delivered_at,
  jsonb_build_object('seeded_from', 'messages.delivered_at')
from public.messages m
where m.delivered_at is not null
  and not exists (
    select 1
    from public.message_status_events mse
    where mse.message_id = m.id
      and mse.canonical_status = 'delivered'
      and mse.occurred_at = m.delivered_at
  );

insert into public.message_status_events (
  organization_id,
  message_id,
  conversation_id,
  channel_id,
  provider_message_id,
  canonical_status,
  occurred_at,
  metadata
)
select
  m.organization_id,
  m.id,
  m.conversation_id,
  m.channel_id,
  m.provider_message_id,
  'read',
  m.read_at,
  jsonb_build_object('seeded_from', 'messages.read_at')
from public.messages m
where m.read_at is not null
  and not exists (
    select 1
    from public.message_status_events mse
    where mse.message_id = m.id
      and mse.canonical_status = 'read'
      and mse.occurred_at = m.read_at
  );

insert into public.message_status_events (
  organization_id,
  message_id,
  conversation_id,
  channel_id,
  provider_message_id,
  canonical_status,
  occurred_at,
  error_code,
  metadata
)
select
  m.organization_id,
  m.id,
  m.conversation_id,
  m.channel_id,
  m.provider_message_id,
  'failed',
  m.failed_at,
  m.last_error_code,
  jsonb_build_object('seeded_from', 'messages.failed_at')
from public.messages m
where m.failed_at is not null
  and not exists (
    select 1
    from public.message_status_events mse
    where mse.message_id = m.id
      and mse.canonical_status = 'failed'
      and mse.occurred_at = m.failed_at
  );

-- =====================================================
-- 5) Catalog import tracking
-- =====================================================
create table if not exists public.catalog_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_type text not null,
  status text not null,
  storage_path text,
  original_filename text,
  content_type text,
  started_at timestamptz,
  finished_at timestamptz,
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  error_count integer not null default 0,
  warning_count integer not null default 0,
  mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  initiated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint catalog_import_jobs_source_type_check
    check (source_type in ('csv', 'website_sync', 'pdf_import', 'api')),
  constraint catalog_import_jobs_status_check
    check (status in ('queued', 'running', 'succeeded', 'partially_succeeded', 'failed', 'cancelled')),
  constraint catalog_import_jobs_total_rows_check
    check (total_rows >= 0 and processed_rows >= 0 and inserted_count >= 0 and updated_count >= 0 and error_count >= 0 and warning_count >= 0)
);

create table if not exists public.catalog_import_row_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  import_job_id uuid not null,
  row_number integer not null,
  field_name text,
  severity text not null default 'error',
  error_code text not null,
  error_message text not null,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint catalog_import_row_errors_import_job_fk
    foreign key (organization_id, import_job_id)
    references public.catalog_import_jobs (organization_id, id)
    on delete cascade,
  constraint catalog_import_row_errors_row_number_check
    check (row_number > 0),
  constraint catalog_import_row_errors_severity_check
    check (severity in ('error', 'warning'))
);

create index if not exists catalog_import_jobs_org_status_created_idx
  on public.catalog_import_jobs (organization_id, status, created_at desc);

create index if not exists catalog_import_jobs_org_initiated_by_idx
  on public.catalog_import_jobs (organization_id, initiated_by_user_id, created_at desc)
  where initiated_by_user_id is not null;

create index if not exists catalog_import_row_errors_job_row_idx
  on public.catalog_import_row_errors (import_job_id, row_number);

create index if not exists catalog_import_row_errors_org_severity_idx
  on public.catalog_import_row_errors (organization_id, severity, created_at desc);

create trigger catalog_import_jobs_touch_updated_at
before update on public.catalog_import_jobs
for each row execute function public.touch_updated_at();

-- =====================================================
-- 6) Membership-safe actor references
-- =====================================================
alter table public.knowledge_items
  rename column created_by to created_by_user_id;

alter table public.knowledge_items
  drop constraint if exists knowledge_items_created_by_fkey,
  drop constraint if exists knowledge_items_created_by_user_id_fkey;

alter table public.conversations
  drop constraint if exists conversations_assigned_user_id_fkey;

alter table public.orders
  drop constraint if exists orders_assigned_user_id_fkey;

alter table public.messages
  drop constraint if exists messages_sent_by_user_id_fkey;

alter table public.payment_attempts
  drop constraint if exists payment_attempts_initiated_by_user_id_fkey;

alter table public.whatsapp_templates
  drop constraint if exists whatsapp_templates_created_by_user_id_fkey;

alter table public.catalog_import_jobs
  drop constraint if exists catalog_import_jobs_initiated_by_user_id_fkey;

update public.conversations c
set assigned_user_id = null
where assigned_user_id is not null
  and not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = c.organization_id
      and m.user_id = c.assigned_user_id
      and m.status = 'active'
  );

update public.orders o
set assigned_user_id = null
where assigned_user_id is not null
  and not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = o.organization_id
      and m.user_id = o.assigned_user_id
      and m.status = 'active'
  );

update public.messages msg
set sent_by_user_id = null
where sent_by_user_id is not null
  and not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = msg.organization_id
      and m.user_id = msg.sent_by_user_id
      and m.status = 'active'
  );

update public.payment_attempts pa
set initiated_by_user_id = null
where initiated_by_user_id is not null
  and not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = pa.organization_id
      and m.user_id = pa.initiated_by_user_id
      and m.status = 'active'
  );

update public.knowledge_items ki
set created_by_user_id = null
where created_by_user_id is not null
  and not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = ki.organization_id
      and m.user_id = ki.created_by_user_id
      and m.status = 'active'
  );

update public.follow_up_rules fur
set created_by_user_id = null
where created_by_user_id is not null
  and not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = fur.organization_id
      and m.user_id = fur.created_by_user_id
      and m.status = 'active'
  );

alter table public.conversations
  add constraint conversations_assigned_user_membership_fk
    foreign key (organization_id, assigned_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete set null;

alter table public.orders
  add constraint orders_assigned_user_membership_fk
    foreign key (organization_id, assigned_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete set null;

alter table public.messages
  add constraint messages_sent_by_user_membership_fk
    foreign key (organization_id, sent_by_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete set null;

alter table public.payment_attempts
  add constraint payment_attempts_initiated_by_user_membership_fk
    foreign key (organization_id, initiated_by_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete set null;

alter table public.knowledge_items
  add constraint knowledge_items_created_by_user_membership_fk
    foreign key (organization_id, created_by_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete set null;

alter table public.follow_up_rules
  add constraint follow_up_rules_created_by_user_membership_fk
    foreign key (organization_id, created_by_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete set null;

alter table public.whatsapp_templates
  add constraint whatsapp_templates_created_by_user_membership_fk
    foreign key (organization_id, created_by_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete set null;

alter table public.catalog_import_jobs
  add constraint catalog_import_jobs_initiated_by_user_membership_fk
    foreign key (organization_id, initiated_by_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete set null;

create index if not exists orders_assigned_user_idx
  on public.orders (organization_id, assigned_user_id, status, created_at desc)
  where assigned_user_id is not null;

drop trigger if exists conversations_assigned_user_active_membership_tg on public.conversations;
create trigger conversations_assigned_user_active_membership_tg
before insert or update of organization_id, assigned_user_id on public.conversations
for each row execute function public.assert_active_membership_ref('assigned_user_id');

drop trigger if exists orders_assigned_user_active_membership_tg on public.orders;
create trigger orders_assigned_user_active_membership_tg
before insert or update of organization_id, assigned_user_id on public.orders
for each row execute function public.assert_active_membership_ref('assigned_user_id');

drop trigger if exists messages_sent_by_user_active_membership_tg on public.messages;
create trigger messages_sent_by_user_active_membership_tg
before insert or update of organization_id, sent_by_user_id on public.messages
for each row execute function public.assert_active_membership_ref('sent_by_user_id');

drop trigger if exists payment_attempts_initiated_by_user_active_membership_tg on public.payment_attempts;
create trigger payment_attempts_initiated_by_user_active_membership_tg
before insert or update of organization_id, initiated_by_user_id on public.payment_attempts
for each row execute function public.assert_active_membership_ref('initiated_by_user_id');

drop trigger if exists knowledge_items_created_by_user_active_membership_tg on public.knowledge_items;
create trigger knowledge_items_created_by_user_active_membership_tg
before insert or update of organization_id, created_by_user_id on public.knowledge_items
for each row execute function public.assert_active_membership_ref('created_by_user_id');

drop trigger if exists follow_up_rules_created_by_user_active_membership_tg on public.follow_up_rules;
create trigger follow_up_rules_created_by_user_active_membership_tg
before insert or update of organization_id, created_by_user_id on public.follow_up_rules
for each row execute function public.assert_active_membership_ref('created_by_user_id');

drop trigger if exists whatsapp_templates_created_by_user_active_membership_tg on public.whatsapp_templates;
create trigger whatsapp_templates_created_by_user_active_membership_tg
before insert or update of organization_id, created_by_user_id on public.whatsapp_templates
for each row execute function public.assert_active_membership_ref('created_by_user_id');

drop trigger if exists catalog_import_jobs_initiated_by_user_active_membership_tg on public.catalog_import_jobs;
create trigger catalog_import_jobs_initiated_by_user_active_membership_tg
before insert or update of organization_id, initiated_by_user_id on public.catalog_import_jobs
for each row execute function public.assert_active_membership_ref('initiated_by_user_id');

-- =====================================================
-- 7) Privileged organization bootstrap under RLS
-- =====================================================
drop policy if exists organizations_insert_creator on public.organizations;

create or replace function public.bootstrap_organization(
  _name text,
  _slug text,
  _industry text default null,
  _country_code char(2) default 'DO',
  _currency_code char(3) default 'DOP',
  _timezone text default 'America/Santo_Domingo',
  _default_locale text default 'es-DO'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _organization_id uuid;
  _seller_name text;
begin
  if _user_id is null then
    raise exception using
      errcode = '28000',
      message = 'authenticated user required';
  end if;

  if exists (
    select 1
    from public.organization_memberships m
    where m.user_id = _user_id
      and m.status in ('active', 'invited', 'disabled')
  ) then
    raise exception using
      errcode = '23505',
      message = 'user already belongs to an organization',
      detail = 'MVP currently supports one business per account.';
  end if;

  insert into public.user_profiles (id)
  values (_user_id)
  on conflict (id) do nothing;

  select coalesce(nullif(split_part(coalesce(full_name, ''), ' ', 1), ''), 'Asistente')
    into _seller_name
  from public.user_profiles
  where id = _user_id;

  insert into public.organizations (
    slug,
    name,
    industry,
    country_code,
    currency_code,
    timezone,
    default_locale,
    created_by
  )
  values (
    _slug,
    _name,
    _industry,
    _country_code,
    _currency_code,
    _timezone,
    _default_locale,
    _user_id
  )
  returning id into _organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    _organization_id,
    _user_id,
    'owner',
    'active',
    now()
  );

  insert into public.ai_seller_profiles (
    organization_id,
    seller_name,
    language_code,
    is_active
  )
  values (
    _organization_id,
    _seller_name,
    _default_locale,
    true
  )
  on conflict (organization_id) do nothing;

  insert into public.organization_payment_configs (
    organization_id,
    provider_code,
    method_type_code,
    capture_mode_code,
    is_enabled,
    is_default,
    config
  )
  values
    (_organization_id, 'cardnet', 'card_redirect', 'sale', false, false, '{}'::jsonb),
    (_organization_id, 'cardnet', 'payment_link', 'sale', false, false, '{}'::jsonb),
    (_organization_id, 'bank_transfer', 'bank_transfer', 'sale', false, false, '{}'::jsonb),
    (_organization_id, 'cash_on_delivery', 'cash_on_delivery', 'sale', false, false, '{}'::jsonb)
  on conflict (organization_id, provider_code, method_type_code) do nothing;

  return _organization_id;
end;
$$;

revoke all on function public.bootstrap_organization(text, text, text, char, char, text, text) from public;
grant execute on function public.bootstrap_organization(text, text, text, char, char, text, text) to authenticated;

-- =====================================================
-- 8) RLS for new public tables
-- =====================================================
alter table public.whatsapp_templates enable row level security;
alter table public.message_status_events enable row level security;
alter table public.catalog_import_jobs enable row level security;
alter table public.catalog_import_row_errors enable row level security;

create policy whatsapp_templates_read_member
on public.whatsapp_templates
for select
using (public.is_org_member(organization_id));

create policy whatsapp_templates_operator_write
on public.whatsapp_templates
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy message_status_events_read_member
on public.message_status_events
for select
using (public.is_org_member(organization_id));

create policy catalog_import_jobs_read_member
on public.catalog_import_jobs
for select
using (public.is_org_member(organization_id));

create policy catalog_import_jobs_operator_write
on public.catalog_import_jobs
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

create policy catalog_import_row_errors_read_member
on public.catalog_import_row_errors
for select
using (public.is_org_member(organization_id));

create policy catalog_import_row_errors_operator_write
on public.catalog_import_row_errors
for all
using (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','operator']::public.membership_role[]));

commit;
