-- Keep one copy of each automatically-created task column per tenant.
-- Existing tasks are preserved and transferred before duplicate columns are hidden.
with ranked_defaults as (
  select
    id,
    tenant_id,
    name,
    first_value(id) over (
      partition by tenant_id, name
      order by created_at asc, id asc
    ) as retained_id,
    row_number() over (
      partition by tenant_id, name
      order by created_at asc, id asc
    ) as row_number
  from public.task_kanban_columns
  where is_default = true
    and is_active = true
), moved_tasks as (
  update public.tarefas as task
  set kanban_column_id = duplicate.retained_id
  from ranked_defaults as duplicate
  where duplicate.row_number > 1
    and task.kanban_column_id = duplicate.id
  returning task.id
)
update public.task_kanban_columns as task_column
set is_active = false
from ranked_defaults as duplicate
where duplicate.row_number > 1
  and task_column.id = duplicate.id;

-- Default columns are seeded by the application and must be unique even if
-- two page requests arrive at the same time.
create unique index if not exists task_kanban_default_column_name_unique
  on public.task_kanban_columns(tenant_id, name)
  where is_default = true and is_active = true;
