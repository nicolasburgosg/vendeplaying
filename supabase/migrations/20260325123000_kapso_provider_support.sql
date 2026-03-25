begin;

do $$
begin
  alter type public.channel_provider add value if not exists 'kapso_platform';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type public.webhook_provider add value if not exists 'whatsapp_kapso';
exception
  when duplicate_object then null;
end $$;

commit;
