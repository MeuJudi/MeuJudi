-- Add client reference to agenda events.

alter table public.agenda_eventos
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

create index if not exists agenda_eventos_cliente_idx
  on public.agenda_eventos(cliente_id);
