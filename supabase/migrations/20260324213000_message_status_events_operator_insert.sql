begin;

drop policy if exists message_status_events_operator_insert
on public.message_status_events;

create policy message_status_events_operator_insert
on public.message_status_events
for insert
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','operator']::public.membership_role[]
  )
);

commit;
