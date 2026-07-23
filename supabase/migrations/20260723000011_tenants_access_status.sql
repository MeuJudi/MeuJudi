-- Estado de ciclo de vida do tenant pro gate de validação de OAB (Fase 1).
-- Ver docs/roadmap/validacao-oab-confirmadv-cs.md.

alter table public.tenants
  add column if not exists access_status text not null default 'preparacao'
  check (access_status in ('preparacao', 'aguardando_validacao', 'liberado', 'suspenso'));

-- Backfill: tenants já ativos hoje continuam liberados — não trava quem já
-- usa o produto só porque a coluna nova nasceu com default restritivo.
update public.tenants set access_status = 'liberado' where is_active = true;
