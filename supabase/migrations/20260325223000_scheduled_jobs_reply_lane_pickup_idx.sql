create index if not exists scheduled_jobs_reply_lane_pickup_idx
  on internal.scheduled_jobs (status, available_at, priority desc, created_at)
  where status = 'queued'
    and (
      job_type = 'send_whatsapp_message'
      or (job_type = 'generic' and payload ->> 'action' = 'auto_reply_inbound')
    );
