-- Run this once in Supabase SQL Editor if diagnostic_reports already exists.

alter table public.diagnostic_reports
add column if not exists recent_logs_count integer not null default 0,
add column if not exists last_error text;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'diagnostic_reports'
  and column_name in ('recent_logs_count', 'last_error')
order by column_name;
