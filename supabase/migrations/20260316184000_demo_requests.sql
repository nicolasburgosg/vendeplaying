begin;

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  email citext not null,
  whatsapp_e164 text not null,
  use_case text not null,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'contacted', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_requests_status_created_idx
  on public.demo_requests (status, created_at desc);

drop trigger if exists demo_requests_touch_updated_at on public.demo_requests;
create trigger demo_requests_touch_updated_at
before update on public.demo_requests
for each row execute function public.touch_updated_at();

alter table public.demo_requests enable row level security;

drop policy if exists demo_requests_insert_public on public.demo_requests;
create policy demo_requests_insert_public
on public.demo_requests
for insert
with check (true);

drop policy if exists demo_requests_read_admin on public.demo_requests;
create policy demo_requests_read_admin
on public.demo_requests
for select
using (false);

commit;
