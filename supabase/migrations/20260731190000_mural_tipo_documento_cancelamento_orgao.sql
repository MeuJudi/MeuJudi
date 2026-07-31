-- Campos reais da API do Mural (comunicaapi.pje.jus.br) que já vinham na
-- resposta mas nunca eram capturados — achado 31/07/2026, testando a API
-- ao vivo:
--
-- 1. `tipoDocumento` é bem mais específico que `tipo_comunicacao` (que na
--    prática é quase sempre só "Intimação" genérico) — traz Sentença,
--    Despacho, Conclusão, Notificação, Ato ordinatório, Ementa de
--    Acórdão etc. Útil pra priorizar/rotular melhor.
-- 2. `ativo`/`status`/`data_cancelamento`/`motivo_cancelamento` — uma
--    comunicação pode ser cancelada/retificada depois de publicada.
--    Nenhuma cancelada na amostra real testada, mas o campo existe no
--    schema da API — guarda pra não aplicar prazo/audiência de uma
--    comunicação já cancelada, e pra dar visibilidade se uma já
--    processada for cancelada depois.
-- 3. `idOrgao` é o id numérico estável do órgão julgador — hoje só se
--    guarda o nome em texto livre (`nome_orgao`), repetido em toda
--    comunicação. Catálogo separado (`mural_orgaos`) normaliza isso: uma
--    linha por órgão, id->nome, em vez de string livre repetida em toda
--    linha de comunicacoes_mural.

alter table public.comunicacoes_mural
  add column if not exists tipo_documento text,
  add column if not exists ativo boolean,
  add column if not exists status_comunicacao text,
  add column if not exists data_cancelamento timestamptz,
  add column if not exists motivo_cancelamento text,
  add column if not exists id_orgao bigint;

comment on column public.comunicacoes_mural.tipo_documento is
  'Campo "tipoDocumento" da API do Mural — mais específico que tipo_comunicacao (que é quase sempre só "Intimação"): Sentença, Despacho, Conclusão, Notificação, Ato ordinatório, etc.';
comment on column public.comunicacoes_mural.status_comunicacao is
  'Campo "status" do item na API do Mural (não confundir com status do payload todo) — renomeado pra evitar colisão de nome.';
comment on column public.comunicacoes_mural.id_orgao is
  'Campo "idOrgao" da API — id estável do órgão julgador, ver tabela mural_orgaos pro nome.';

create index if not exists comunicacoes_mural_id_orgao_idx on public.comunicacoes_mural(id_orgao);

-- Catálogo de órgãos julgadores vistos no Mural — não é por tenant
-- (o id do órgão é global no PJe), então fica fora do isolamento
-- multi-tenant normal; só o service role escreve, qualquer usuário
-- autenticado pode ler (é so nome de tribunal/vara, sem dado de cliente).
create table if not exists public.mural_orgaos (
  id_orgao bigint primary key,
  nome text not null,
  sigla_tribunal text,
  primeira_vez_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.mural_orgaos is
  'Catálogo id_orgao -> nome, populado conforme o Mural traz órgãos novos — evita depender do texto livre repetido em toda comunicacoes_mural.nome_orgao.';

alter table public.mural_orgaos enable row level security;

-- `create policy` não aceita "if not exists" — drop-then-create pra ser
-- seguro rodar de novo (mesmo problema do "already exists" da migração
-- anterior, ver 20260731170000_processo_documentos_dedupe_por_id.sql).
drop policy if exists "mural_orgaos_leitura_autenticada" on public.mural_orgaos;
create policy "mural_orgaos_leitura_autenticada" on public.mural_orgaos
  for select to authenticated
  using (true);

revoke all on public.mural_orgaos from anon;
grant select on public.mural_orgaos to authenticated;
